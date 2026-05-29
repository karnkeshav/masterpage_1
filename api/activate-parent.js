// api/activate-parent.js — Creates a parent account from an activation token
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const admin  = require('firebase-admin');

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
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { return res.status(405).json({ error: 'Method Not Allowed' }); }

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
        const auth = admin.auth();

        const { token, password, parentName } = req.body;

        if (!token || !password || password.length < 8) {
            return res.status(400).json({ error: 'Token and a password of at least 8 characters are required.' });
        }

        // 1. Fetch and validate activation record
        const activationRef  = db.collection('parent_activations').doc(token);
        const activationSnap = await activationRef.get();

        if (!activationSnap.exists) {
            return res.status(400).json({ error: 'Invalid or expired activation link.' });
        }

        const activation = activationSnap.data();

        if (activation.used) {
            return res.status(400).json({ error: 'This activation link has already been used.' });
        }

        const now = new Date();
        const expiresAt = activation.expiresAt?.toDate ? activation.expiresAt.toDate() : new Date(activation.expiresAt);
        if (now > expiresAt) {
            return res.status(400).json({ error: 'This activation link has expired (valid 48 hours). Contact support for a new one.' });
        }

        const { studentUid, parentEmail, planID } = activation;
        const resolvedParentName = parentName || activation.parentName || 'Parent';

        // 2. Create or fetch Firebase Auth user for the parent
        let parentRecord;
        try {
            parentRecord = await auth.getUserByEmail(parentEmail);
        } catch (e) {
            if (e.code === 'auth/user-not-found') {
                // Hash password and import via importUsers so we control the hash
                const salt           = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);
                const parentUid      = crypto.randomUUID();

                await auth.importUsers([{
                    uid:          parentUid,
                    email:        parentEmail,
                    displayName:  resolvedParentName,
                    passwordHash: Buffer.from(hashedPassword)
                }], { hash: { algorithm: 'BCRYPT' } });

                parentRecord = await auth.getUser(parentUid);
            } else {
                throw e;
            }
        }

        // 3. Write Firestore parent profile
        await db.collection('users').doc(parentRecord.uid).set({
            uid:              parentRecord.uid,
            email:            parentEmail,
            displayName:      resolvedParentName,
            role:             'parent',
            tenantType:       'individual',
            isB2C:            true,
            subscriptionTier: planID,
            linked_children:  admin.firestore.FieldValue.arrayUnion(studentUid),
            activationDate:   admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 4. Mark activation token as used
        await activationRef.update({
            used:      true,
            usedAt:    admin.firestore.FieldValue.serverTimestamp(),
            parentUid: parentRecord.uid
        });

        // 5. Also add parent uid to student's linked_parents field
        await db.collection('users').doc(studentUid).update({
            linked_parents: admin.firestore.FieldValue.arrayUnion(parentRecord.uid)
        });

        // 6. Return custom token so parent is auto-signed in
        const customToken = await auth.createCustomToken(parentRecord.uid);
        return res.status(200).json({ success: true, customToken });

    } catch (error) {
        console.error('activate-parent ERROR:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
