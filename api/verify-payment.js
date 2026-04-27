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

        // 2. Fetch Pending Registration
        const pendingRef = db.collection('pending_registrations').doc(pendingRegistrationId);

        const result = await db.runTransaction(async (t) => {
            const pendingDoc = await t.get(pendingRef);

            if (!pendingDoc.exists) {
                throw new Error("Pending registration not found.");
            }

            const pendingData = pendingDoc.data();

            if (pendingData.status === 'completed') {
                throw new Error("Payment already processed for this order.");
            }

            if (pendingData.verificationToken !== verificationToken) {
                throw new Error("Verification token mismatch. Invalid session.");
            }

            if (pendingData.orderId !== razorpay_order_id) {
                throw new Error("Order ID mismatch.");
            }

            // 3. Create Firebase User
            let userRecord;
            try {
                // Since we need to import a bcrypt hashed password
                const importUserRecord = {
                    uid: crypto.randomUUID(),
                    email: pendingData.profileData.email,
                    displayName: pendingData.profileData.displayName,
                    passwordHash: Buffer.from(pendingData.hashedPassword)
                };

                // using auth.importUsers
                const userImportResult = await auth.importUsers([importUserRecord], {
                    hash: { algorithm: 'BCRYPT' }
                });

                if (userImportResult.errors.length > 0) {
                     // Check if email already exists
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
                      throw err;
                 }
            }

            // Calculate Expiry Dates
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

            // 4. Update Firestore Profile
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

            t.set(userProfileRef, profilePayload);

            // Mark Pending Registration as Complete
            t.update(pendingRef, {
                status: 'completed',
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
                uid: userRecord.uid,
                razorpay_payment_id: razorpay_payment_id
            });

            // 5. Ledger Integration
            const ledgerRef = db.collection('ledger_events').doc();
            t.set(ledgerRef, {
                type: "B2C_REVENUE",
                action: "PAYMENT",
                amount: revenueAmt,
                description: `B2C Registration: ${pendingData.planLabel} for ${pendingData.profileData.email} (ID: ${razorpay_payment_id})`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                uid: userRecord.uid
            });

            return { uid: userRecord.uid, planLabel: pendingData.planLabel, amountPaise: pendingData.amountPaise };
        });

        // Generate Custom Token for client sign-in
        const customToken = await auth.createCustomToken(result.uid);

        // 6. Generate Automated PDF Invoice
        try {
            const rzp = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET
            });

            // Note: Invoices require customer details, or can use standard format
            await rzp.invoices.create({
                type: 'invoice',
                description: `Invoice for ${result.planLabel} Subscription`,
                customer: {
                    name: req.body.profileData?.displayName || 'Student',
                    email: req.body.profileData?.email || 'student@example.com'
                },
                line_items: [
                    {
                        name: `${result.planLabel} Plan`,
                        description: `Access to ${result.planLabel} features`,
                        amount: result.amountPaise,
                        currency: 'INR',
                        quantity: 1
                    }
                ],
                email_notify: 1, // Auto-email invoice
                currency: 'INR'
            });
        } catch (invoiceErr) {
            console.error("Invoice creation failed, but payment succeeded:", invoiceErr);
            // Non-fatal, continue returning success
        }

        return res.status(200).json({ success: true, customToken: customToken });

    } catch (error) {
        console.error("Payment Verification Error:", error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};