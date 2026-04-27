const crypto = require('crypto');
const admin = require('firebase-admin');

// Ensure Firebase is initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}

const db = admin.firestore();

module.exports = async (req, res) => {
    // Handle CORS
    const allowedOrigin = process.env.ALLOWED_ORIGIN;
    if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, verificationToken, password } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !verificationToken || !password) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // 1. Verify Signature
        const secret = process.env.RAZORPAY_KEY_SECRET;
        const generated_signature = crypto.createHmac('sha256', secret)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }

        // 2. Fetch & Lock Pending Registration
        const orderDocRef = db.collection('pending_registrations').doc(razorpay_order_id);

        let data;
        await db.runTransaction(async (transaction) => {
            const orderSnap = await transaction.get(orderDocRef);
            if (!orderSnap.exists) {
                throw new Error('Pending registration not found');
            }
            data = orderSnap.data();

            if (data.verificationToken !== verificationToken) {
                throw new Error('Invalid verification token');
            }

            if (data.status === 'completed') {
                throw new Error('Already processed');
            }

            if (data.status === 'processing') {
                throw new Error('Currently processing');
            }

            transaction.update(orderDocRef, { status: 'processing' });
        }).catch(err => {
            if (err.message === 'Already processed') {
                res.status(200).json({ success: true, message: 'Already processed' });
                return Promise.reject('handled');
            }
            if (err.message === 'Currently processing') {
                res.status(409).json({ error: 'Currently processing' });
                return Promise.reject('handled');
            }
            if (err.message === 'Invalid verification token') {
                res.status(403).json({ error: err.message });
                return Promise.reject('handled');
            }
            res.status(404).json({ error: err.message });
            return Promise.reject('handled');
        });

        // 3. Create Firebase Auth User
        let userRecord;
        try {
            userRecord = await admin.auth().createUser({
                email: data.email,
                password: password,
                displayName: data.name
            });
        } catch (authError) {
            // Revert status to pending on user creation failure
            await orderDocRef.update({ status: 'pending' });
            if (authError.code === 'auth/email-already-exists') {
                return res.status(409).json({ error: 'An account with this email already exists. Please log in instead.' });
            } else {
                throw authError;
            }
        }

        // 4. Compute Expiry and Modules
        const now = new Date();
        const expiry = new Date();
        if (data.planID === 'legacy') expiry.setFullYear(now.getFullYear() + 3);
        else expiry.setDate(now.getDate() + 30);

        const graceDate = new Date(expiry);
        graceDate.setDate(expiry.getDate() + 5);

        let activeModules = ["SimpleQuizzes"];
        if (data.planID === 'practitioner') activeModules.push("MediumQuizzes", "AdvancedQuizzes");
        if (['strategist', 'sync', 'legacy'].includes(data.planID)) activeModules.push("MediumQuizzes", "AdvancedQuizzes", "MistakeNotebook", "KnowledgeHub");
        if (['sync', 'legacy'].includes(data.planID)) activeModules.push("ParentConsole");
        if (['board_ready', 'legacy'].includes(data.planID)) activeModules.push("PYQ_Insights", "WeightageAnalytics", "MarkingGuides");

        const revenueAmt = (data.amountPaise / 100);

        const passwordExpiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

        // 5. Write Active Profile to Firestore
        const profileData = {
            uid: userRecord.uid,
            displayName: data.name,
            username: data.username,
            email: data.email,
            contactEmail: data.contactEmail || data.email,
            parentEmail: data.parentEmail || '',
            role: "student",
            tenantType: "individual",
            isB2C: true,
            subscriptionTier: data.planID,
            class: parseInt(data.grade),
            revenue: revenueAmt,
            board: data.board,
            status: "active",
            activationDate: admin.firestore.FieldValue.serverTimestamp(),
            accessExpiryDate: admin.firestore.Timestamp.fromDate(expiry),
            gracePeriodEndDate: admin.firestore.Timestamp.fromDate(graceDate),
            activeModules: activeModules,
            razorpayPaymentId: razorpay_payment_id,
            passwordSetAt: admin.firestore.FieldValue.serverTimestamp(),
            passwordExpiresAt: admin.firestore.Timestamp.fromDate(passwordExpiresAt),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (data.stream) {
            profileData.stream = data.stream;
            if (data.subjects && data.subjects.length > 0) {
                profileData.subjects = data.subjects;
            }
        }

        // 5, 6 & 7: Atomic Batch Write
        const batch = db.batch();

        // 5. Write Active Profile to Firestore
        batch.set(db.collection('users').doc(userRecord.uid), profileData);

        // 6. Record Financial Event
        const eventRef = db.collection('schools').doc('B2C_REVENUE').collection('financial_events').doc();
        batch.set(eventRef, {
            type: "PAYMENT",
            amount: revenueAmt,
            details: `B2C Registration: ${data.planID} for ${data.email} (ID: ${razorpay_payment_id})`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            recorded_by: "system"
        });

        // 7. Cleanup Pending Order (or mark completed)
        batch.update(orderDocRef, {
             status: 'completed',
             uid: userRecord.uid,
             completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 8. Welcome Email
        const resetLink = await admin.auth().generatePasswordResetLink(data.email);
        const mailRef = db.collection('mail').doc();
        const tierLabel = data.planID; // Could import TIER_META, but simple fallback
        batch.set(mailRef, {
            to: data.contactEmail || data.email,
            message: {
                subject: `Welcome to Ready4Exam — ${tierLabel} active`,
                html: `Hi ${data.name},<br>Your account is active until ${expiry.toDateString()}.<br>
                       If you didn't set this account, reset your password here: <a href="${resetLink}">Reset</a>.`
            }
        });

        try {
            await batch.commit();
        } catch (commitError) {
            await admin.auth().deleteUser(userRecord.uid);
            await orderDocRef.update({ status: 'pending' });
            throw commitError;
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        if (error === 'handled') return;
        console.error("Payment verification failed:", error);
        return res.status(500).json({ error: "Failed to verify payment and create account" });
    }
};
