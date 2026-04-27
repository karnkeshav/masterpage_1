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
    const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
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

        // 2. Fetch Pending Registration
        const orderDocRef = db.collection('pending_registrations').doc(razorpay_order_id);
        const orderSnap = await orderDocRef.get();

        if (!orderSnap.exists) {
            return res.status(404).json({ error: 'Pending registration not found' });
        }

        const data = orderSnap.data();

        if (data.verificationToken !== verificationToken) {
            return res.status(403).json({ error: 'Invalid verification token' });
        }

        // Prevent double processing
        if (data.status === 'completed') {
             return res.status(200).json({ success: true, message: 'Already processed' });
        }

        // 3. Create Firebase Auth User (Idempotent)
        let userRecord;
        try {
            userRecord = await admin.auth().createUser({
                email: data.email,
                password: password,
                displayName: data.name
            });
        } catch (authError) {
            if (authError.code === 'auth/email-already-exists') {
                userRecord = await admin.auth().getUserByEmail(data.email);
                await admin.auth().updateUser(userRecord.uid, { password: password });
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

        // 5. Write Active Profile to Firestore
        const profileData = {
            uid: userRecord.uid,
            displayName: data.name,
            username: data.username,
            email: data.email,
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

        await batch.commit();

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error("Payment verification failed:", error);
        return res.status(500).json({ error: "Failed to verify payment and create account" });
    }
};
