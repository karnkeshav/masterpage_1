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
        const { email, studentName } = req.body;

        if (!email || !studentName) {
            return res.status(400).json({ error: 'Email and Registered Student Name are required.' });
        }

        // Query Firestore to verify identity
        // We need to check both the actual student email and the parent email
        const usersRef = db.collection('users');
        let querySnapshot = await usersRef.where('email', '==', email).limit(1).get();

        if (querySnapshot.empty) {
            // Try parentEmail
            querySnapshot = await usersRef.where('parentEmail', '==', email).limit(1).get();
            if (querySnapshot.empty) {
                // Return generic message to prevent enumeration
                return res.status(200).json({ message: 'If the details match, a reset link will be sent shortly.' });
            }
        }

        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();

        // Verify the student name (case-insensitive)
        if (!userData.displayName || userData.displayName.toLowerCase().trim() !== studentName.toLowerCase().trim()) {
            console.warn(`Identity verification failed for ${email}. Expected: ${userData.displayName}, Got: ${studentName}`);
            // Return same generic message
            return res.status(200).json({ message: 'If the details match, a reset link will be sent shortly.' });
        }

        // Generate Password Reset Link
        // The reset link uses the actual user email from Firestore, even if they searched by parentEmail.
        // Firebase's generatePasswordResetLink only creates the URL; it does not send an email.
        // We return the link to the verified client so it can redirect the user to complete the reset.
        const resetLink = await auth.generatePasswordResetLink(userData.email);

        if (process.env.NODE_ENV === 'development') {
            console.log(`Password reset link for ${email}: ${resetLink}`);
        }

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