const Razorpay = require('razorpay');
const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');
const crypto = require('crypto');

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

const TIER_META = {
    practitioner: { label: "The Practitioner", price: "₹10/mo", amountPaise: 1000 },
    strategist: { label: "Self-Strategist", price: "₹999/mo", amountPaise: 99900 },
    sync: { label: "The Sync Bundle", price: "₹1,499/mo", amountPaise: 149900 },
    board_ready: { label: "Board-Ready", price: "₹1,299/mo", amountPaise: 129900 },
    legacy: { label: "The Legacy Plan", price: "₹32,000", amountPaise: 3200000 }
};

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
        const { planID, password, profileData } = req.body;

        if (!planID || !password || !profileData || !profileData.email) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const meta = TIER_META[planID];
        if (!meta) {
            return res.status(400).json({ error: 'Invalid plan selected' });
        }

        // Initialize Razorpay
        const rzp = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });

        // Create Razorpay Order
        const orderOptions = {
            amount: meta.amountPaise,
            currency: "INR",
            receipt: `receipt_${Date.now()}`
        };

        const order = await rzp.orders.create(orderOptions);

        // Hash Password securely
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate Verification Token to prevent hijack
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Prepare Pending Registration record
        const pendingRef = db.collection('pending_registrations').doc(order.id);
        await pendingRef.set({
            orderId: order.id,
            amountPaise: meta.amountPaise,
            planID: planID,
            planLabel: meta.label,
            hashedPassword: hashedPassword,
            profileData: profileData,
            verificationToken: verificationToken,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending'
        });

        return res.status(200).json({
            orderId: order.id,
            amount: meta.amountPaise,
            pendingRegistrationId: order.id,
            verificationToken: verificationToken
        });

    } catch (error) {
        console.error("Error creating order:", error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};