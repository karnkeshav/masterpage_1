// api/activate-parent-preview.js — Returns safe metadata for the parent setup form
const admin = require('firebase-admin');

module.exports = async (req, res) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://ready4exam.in',
        'https://www.ready4exam.in',
        'https://karnkeshav.github.io',
        'https://masterpage-1.vercel.app',
        process.env.ALLOWED_ORIGIN
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'GET') { return res.status(405).json({ error: 'Method Not Allowed' }); }

    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'Missing token.' });

    try {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId:   process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
                })
            });
        }
        const db   = admin.firestore();
        const snap = await db.collection('parent_activations').doc(token).get();

        if (!snap.exists || snap.data().used) {
            return res.status(400).json({ error: 'Invalid or expired token.' });
        }

        const { parentEmail, parentName, studentName, planID, expiresAt } = snap.data();

        const now = new Date();
        const exp = expiresAt?.toDate ? expiresAt.toDate() : new Date(expiresAt);
        if (now > exp) return res.status(400).json({ error: 'Link has expired.' });

        return res.status(200).json({ parentEmail, parentName, studentName, planID });

    } catch (error) {
        console.error('activate-parent-preview ERROR:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
