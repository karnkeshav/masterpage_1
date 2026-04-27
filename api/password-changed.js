const admin = require('firebase-admin');

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const profileRef = db.collection('users').doc(uid);
        const profileSnap = await profileRef.get();

        if (!profileSnap.exists) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        const profile = profileSnap.data();

        const newExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

        const batch = db.batch();

        batch.update(profileRef, {
            passwordSetAt: admin.firestore.FieldValue.serverTimestamp(),
            passwordExpiresAt: admin.firestore.Timestamp.fromDate(newExpiry),
            passwordResetRequired: admin.firestore.FieldValue.delete()
        });

        batch.set(db.collection('mail').doc(), {
            to: profile.contactEmail || profile.email,
            message: {
                subject: 'Your Ready4Exam password was changed',
                html: `Hi ${profile.displayName || 'User'},<br>Your password was recently changed. If this wasn't you, contact support immediately.<br>New expiry date: ${newExpiry.toDateString()}.`
            }
        });

        await batch.commit();

        return res.status(200).json({ success: true });

    } catch (e) {
        console.error("Password update webhook failed:", e);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
