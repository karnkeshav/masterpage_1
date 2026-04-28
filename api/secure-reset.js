const admin = require('firebase-admin');

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

    // 2. Handle Preflight (OPTIONS)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { email, studentName } = req.body;

        if (!email || !studentName) {
            return res.status(400).json({ error: 'Email and Registered Student Name are required.' });
        }

        const usersRef = db.collection('users');
        let querySnapshot = await usersRef.where('email', '==', email).limit(1).get();

        if (querySnapshot.empty) {
            // Check by parent email since students use internal login IDs
            querySnapshot = await usersRef.where('parentEmail', '==', email).limit(1).get();
            if (querySnapshot.empty) {
                return res.status(200).json({ message: 'If the details match, a reset link will be sent shortly.' });
            }
        }

        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();

        // Identity verification (case-insensitive)
        if (!userData.displayName || userData.displayName.toLowerCase().trim() !== studentName.toLowerCase().trim()) {
            return res.status(200).json({ message: 'If the details match, a reset link will be sent shortly.' });
        }

        // Generate the reset link using the internal student email
        const resetLink = await auth.generatePasswordResetLink(userData.email);

        return res.status(200).json({
            success: true,
            message: 'Identity verified. Use the reset link to set a new password.',
            resetLink: resetLink
        });

    } catch (error) {
        console.error("Secure Reset Error:", error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
