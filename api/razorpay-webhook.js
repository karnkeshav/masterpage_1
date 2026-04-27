const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}
const db = admin.firestore();

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const razorpaySignature = req.headers['x-razorpay-signature'];

        // Ensure raw body is used (assuming Vercel parses this or provides req.body raw if configured)
        // Vercel serverless functions parse JSON automatically. We need to stringify it identically
        // A safer way is ensuring the payload string matches. For this webhook we assume the body is parsed.
        const bodyStr = JSON.stringify(req.body);

        const expectedSignature = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');

        if (expectedSignature !== razorpaySignature) {
            // Note: Depending on middleware, JSON.stringify might re-order keys.
            // In a real Vercel app, you need rawBody.
            return res.status(400).send('Invalid signature');
        }

        const event = req.body;

        if (event.event === 'order.paid' || event.event === 'payment.captured') {
            const paymentEntity = event.payload.payment.entity;
            const order_id = paymentEntity.order_id;
            const payment_id = paymentEntity.id;

            const orderDocRef = db.collection('pending_registrations').doc(order_id);
            let data;

            await db.runTransaction(async (transaction) => {
                const orderSnap = await transaction.get(orderDocRef);
                if (!orderSnap.exists) {
                    throw new Error('Pending registration not found');
                }
                data = orderSnap.data();

                if (data.status === 'completed' || data.status === 'processing') {
                    throw new Error('Already processed');
                }

                transaction.update(orderDocRef, { status: 'processing' });
            }).catch(err => {
                if (err.message === 'Already processed') {
                    return Promise.reject('handled');
                }
                return Promise.reject(err);
            });

            // Random temp password since we only have the hash
            const tempPassword = crypto.randomBytes(16).toString('hex');

            let userRecord;
            try {
                userRecord = await admin.auth().createUser({
                    email: data.email,
                    password: tempPassword,
                    displayName: data.name
                });
            } catch (authError) {
                await orderDocRef.update({ status: 'pending' });
                if (authError.code === 'auth/email-already-exists') {
                    console.log(`Webhook: User ${data.email} already exists`);
                    return res.status(200).send('OK'); // Don't crash webhook on duplicate
                }
                throw authError;
            }

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
                razorpayPaymentId: payment_id,
                passwordSetAt: admin.firestore.FieldValue.serverTimestamp(),
                passwordExpiresAt: admin.firestore.Timestamp.fromDate(passwordExpiresAt),
                passwordResetRequired: true, // Temp password generated
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (data.stream) {
                profileData.stream = data.stream;
                if (data.subjects && data.subjects.length > 0) profileData.subjects = data.subjects;
            }

            const batch = db.batch();
            batch.set(db.collection('users').doc(userRecord.uid), profileData);

            const eventRef = db.collection('schools').doc('B2C_REVENUE').collection('financial_events').doc();
            batch.set(eventRef, {
                type: "PAYMENT",
                amount: revenueAmt,
                details: `B2C Registration Webhook: ${data.planID} for ${data.email} (ID: ${payment_id})`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                recorded_by: "system"
            });

            batch.update(orderDocRef, {
                 status: 'completed',
                 uid: userRecord.uid,
                 completedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const resetLink = await admin.auth().generatePasswordResetLink(data.email);
            const mailRef = db.collection('mail').doc();
            batch.set(mailRef, {
                to: data.contactEmail || data.email,
                message: {
                    subject: `Welcome to Ready4Exam — Action Required`,
                    html: `Hi ${data.name},<br>Your payment was successful and your account is active until ${expiry.toDateString()}.<br>
                           Since you were disconnected during registration, please set your password here: <a href="${resetLink}">Reset Password</a>.`
                }
            });

            try {
                await batch.commit();
            } catch (commitError) {
                await admin.auth().deleteUser(userRecord.uid);
                await orderDocRef.update({ status: 'pending' });
                throw commitError;
            }

            return res.status(200).send('OK');
        }

        return res.status(200).send('Event not handled');
    } catch (e) {
        if (e === 'handled') return res.status(200).send('OK');
        console.error("Webhook error:", e);
        return res.status(500).send('Internal Server Error');
    }
};
