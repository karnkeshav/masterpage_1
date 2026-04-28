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
    // 1. ROBUST CORS HANDLING
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://karnkeshav.github.io',
        'https://masterpage-1.vercel.app',
        process.env.ALLOWED_ORIGIN
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

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

        // 2. VERIFY SIGNATURE
        const secret = process.env.RAZORPAY_KEY_SECRET;
        const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            console.error("Signature mismatch.");
            return res.status(400).json({ error: 'Invalid payment signature.' });
        }

        // 3. FETCH & LOCK REGISTRATION
        const pendingRef = db.collection('pending_registrations').doc(pendingRegistrationId);
        
        const pendingData = await db.runTransaction(async (t) => {
            const pendingDoc = await t.get(pendingRef);
            if (!pendingDoc.exists) throw new Error("Registration record not found.");
            
            const data = pendingDoc.data();
            if (data.status === 'completed') throw new Error("Order already processed.");
            if (data.verificationToken !== verificationToken) throw new Error("Invalid session token.");

            t.update(pendingRef, { status: 'processing' });
            return data;
        });

        // 4. CREATE AUTH ACCOUNT
        let userRecord;
        const stableUid = crypto.randomUUID();
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
                    throw new Error(userImportResult.errors[0].error.message);
                }
            } else {
                userRecord = await auth.getUser(stableUid);
            }
        } catch (err) {
            await pendingRef.update({ status: 'pending' }); // Allow retry on failure
            throw err;
        }

        // 5. CALCULATE PLAN DETAILS
        const expiry = new Date();
        if (pendingData.planID === 'legacy') expiry.setFullYear(expiry.getFullYear() + 3);
        else expiry.setDate(expiry.getDate() + 30);

        // Define Module Access
        let activeModules = ["SimpleQuizzes"];
        const pID = pendingData.planID;
        
        if (pID === 'practitioner' || ['strategist', 'sync', 'legacy', 'board_ready'].includes(pID)) {
            activeModules.push("MediumQuizzes", "AdvancedQuizzes");
        }
        if (['strategist', 'sync', 'legacy'].includes(pID)) {
            activeModules.push("MistakeNotebook", "KnowledgeHub");
        }
        if (['sync', 'legacy'].includes(pID)) activeModules.push("ParentConsole");
        if (['board_ready', 'legacy'].includes(pID)) {
            activeModules.push("PYQ_Insights", "WeightageAnalytics", "MarkingGuides");
        }

        // 6. FINALIZE PROFILE & LEDGER
        const revenueAmt = (pendingData.amountPaise / 100);
        const userProfileRef = db.collection('users').doc(userRecord.uid);
        const batch = db.batch();

        batch.set(userProfileRef, {
            ...pendingData.profileData,
            uid: userRecord.uid,
            status: "active",
            activeModules,
            razorpayPaymentId: razorpay_payment_id,
            revenue: revenueAmt,
            accessExpiryDate: admin.firestore.Timestamp.fromDate(expiry),
            activationDate: admin.firestore.FieldValue.serverTimestamp()
        });

        batch.update(pendingRef, { 
            status: 'completed', 
            uid: userRecord.uid, 
            completedAt: admin.firestore.FieldValue.serverTimestamp() 
        });

        const financialPayload = {
            type: "B2C_REVENUE",
            amount: revenueAmt,
            uid: userRecord.uid,
            entityType: "b2c",
            school_id: "B2C_REVENUE",
            details: `Plan ${pendingData.planID} payment`,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        batch.set(db.collection('ledger_events').doc(), financialPayload);
        batch.set(db.collection('financial_events').doc(), financialPayload);

        await batch.commit();

        const customToken = await auth.createCustomToken(userRecord.uid);
        return res.status(200).json({ success: true, customToken });

    } catch (error) {
        console.error("Verification Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
