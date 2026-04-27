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
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { orderId } = req.query;

        if (!orderId) {
            return res.status(400).json({ error: 'Missing orderId' });
        }

        const docRef = db.collection('pending_registrations').doc(orderId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const data = docSnap.data();

        return res.status(200).json({
            status: data.status,
            uid: data.uid || null
        });

    } catch (e) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};
