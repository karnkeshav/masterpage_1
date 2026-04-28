const crypto = require('crypto');
const admin = require('firebase-admin');
const Razorpay = require('razorpay');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
    });
}
const db = admin.firestore();
const auth = admin.auth();

module.exports = async (req, res) => {
    // CORS Handling
    const allowedOrigin = process.env.ALLOWED_ORIGIN;
    if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            pendingRegistrationId,
            verificationToken
        } = req.body;

        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !pendingRegistrationId || !verificationToken) {
            return res.status(400).json({ error: 'Missing payment verification data.' });
        }

        // 1. Verify Razorpay Signature (The Golden Rule)
        const secret = process.env.RAZORPAY_KEY_SECRET;
        const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            console.error("Signature mismatch. Possible tampering.");
            return res.status(400).json({ error: 'Invalid payment signature.' });
        }

        // 2. Fetch and validate Pending Registration
        const pendingRef = db.collection('pending_registrations').doc(pendingRegistrationId);

        // Phase 1: Validate and lock the pending registration inside a transaction.
        // Auth operations are kept outside to avoid retry/orphan issues.
        const pendingData = await db.runTransaction(async (t) => {
            const pendingDoc = await t.get(pendingRef);

            if (!pendingDoc.exists) {
                throw new Error("Pending registration not found.");
            }

            const data = pendingDoc.data();

            if (data.status === 'completed') {
                throw new Error("Payment already processed for this order.");
            }

            if (data.verificationToken !== verificationToken) {
                throw new Error("Verification token mismatch. Invalid session.");
            }

            if (data.orderId !== razorpay_order_id) {
                throw new Error("Order ID mismatch.");
            }

            // Mark as processing to prevent concurrent retries
            t.update(pendingRef, { status: 'processing' });

            return data;
        });

        // Phase 2: Create Firebase Auth user outside the transaction
        const stableUid = crypto.randomUUID();
        let userRecord;
        try {
            const importUserRecord = {
                uid: stableUid,
                email: pendingData.profileData.email,
                displayName: pendingData.profileData.displayName,
                passwordHash: Buffer.from(pendingData.hashedPassword)
            };

            const userImportResult = await auth.importUsers([importUserRecord], {
                hash: { algorithm: 'BCRYPT' }
            });

            if (userImportResult.errors.length > 0) {
                if (userImportResult.errors[0].error.code === 'auth/email-already-exists') {
                    userRecord = await auth.getUserByEmail(pendingData.profileData.email);
                } else {
                    throw new Error(`Failed to import user: ${userImportResult.errors[0].error.message}`);
                }
            } else {
                userRecord = await auth.getUser(importUserRecord.uid);
            }
        } catch (err) {
            if (err.code === 'auth/email-already-exists') {
                userRecord = await auth.getUserByEmail(pendingData.profileData.email);
            } else {
                // Roll back pending status so it can be retried
                await pendingRef.update({ status: 'pending' });
                throw err;
            }
        }

        // Phase 3: Write Firestore profile, complete pending registration, and ledger
        const now = new Date();
        const expiry = new Date();
        if (pendingData.planID === 'legacy') expiry.setFullYear(now.getFullYear() + 3);
        else expiry.setDate(now.getDate() + 30);

        const graceDate = new Date(expiry);
        graceDate.setDate(expiry.getDate() + 5);

        let activeModules = ["SimpleQuizzes"];
        if (pendingData.planID === 'practitioner') activeModules.push("MediumQuizzes", "AdvancedQuizzes");
        if (['strategist', 'sync', 'legacy'].includes(pendingData.planID)) activeModules.push("MediumQuizzes", "AdvancedQuizzes", "MistakeNotebook", "KnowledgeHub");
        if (['sync', 'legacy'].includes(pendingData.planID)) activeModules.push("ParentConsole");
        if (['board_ready', 'legacy'].includes(pendingData.planID)) activeModules.push("PYQ_Insights", "WeightageAnalytics", "MarkingGuides");

        const revenueAmt = (pendingData.amountPaise / 100);

        const userProfileRef = db.collection('users').doc(userRecord.uid);

        const profilePayload = {
            ...pendingData.profileData,
            uid: userRecord.uid,
            status: "active",
            activationDate: admin.firestore.FieldValue.serverTimestamp(),
            accessExpiryDate: admin.firestore.Timestamp.fromDate(expiry),
            gracePeriodEndDate: admin.firestore.Timestamp.fromDate(graceDate),
            lastPasswordChangeDate: admin.firestore.FieldValue.serverTimestamp(),
            activeModules: activeModules,
            razorpayPaymentId: razorpay_payment_id,
            revenue: revenueAmt,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const batch = db.batch();
        batch.set(userProfileRef, profilePayload);

        batch.update(pendingRef, {
            status: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            uid: userRecord.uid,
            razorpay_payment_id: razorpay_payment_id
        });

        const ledgerRef = db.collection('ledger_events').doc();
        batch.set(ledgerRef, {
            type: "B2C_REVENUE",
            action: "PAYMENT",
            amount: revenueAmt,
            description: `B2C Registration: ${pendingData.planLabel} for ${pendingData.profileData.email} (ID: ${razorpay_payment_id})`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            uid: userRecord.uid
        });

        await batch.commit();

        // Generate Custom Token for client sign-in
        const customToken = await auth.createCustomToken(userRecord.uid);

        // 6. Generate Automated PDF Invoice
        try {
            const rzp = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET
            });

            await rzp.invoices.create({
                type: 'invoice',
                description: `Invoice for ${pendingData.planLabel} Subscription`,
                customer: {
                    name: pendingData.profileData.displayName || 'Student',
                    email: pendingData.profileData.email || 'student@example.com'
                },
                line_items: [
                    {
                        name: `${pendingData.planLabel} Plan`,
                        description: `Access to ${pendingData.planLabel} features`,
                        amount: pendingData.amountPaise,
                        currency: 'INR',
                        quantity: 1
                    }
                ],
                email_notify: 1,
                currency: 'INR'
            });
        } catch (invoiceErr) {
            console.error("Invoice creation failed, but payment succeeded:", invoiceErr);
        }

        return res.status(200).json({ success: true, customToken: customToken });

    } catch (error) {
        console.error("Payment Verification Error:", error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};