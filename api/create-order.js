const Razorpay = require('razorpay');
const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');
const crypto = require('crypto');

// PLAN METADATA
const TIER_META = {
    practitioner: { label: "The Practitioner", price: "₹10/mo", amountPaise: 1000 },
    strategist: { label: "Self-Strategist", price: "₹999/mo", amountPaise: 99900 },
    sync: { label: "The Sync Bundle", price: "₹1,499/mo", amountPaise: 149900 },
    board_ready: { label: "Board-Ready", price: "₹1,299/mo", amountPaise: 129900 },
    legacy: { label: "The Legacy Plan", price: "₹32,000", amountPaise: 3200000 }
};

module.exports = async (req, res) => {
    // --- STEP 1: ROBUST CORS HANDLING ---
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://karnkeshav.github.io',
        'https://masterpage-1.vercel.app'
    ];

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Handle Browser Preflight (OPTIONS) immediately
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // --- STEP 2: PROTECTED INITIALIZATION ---
    try {
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

        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }

        const { planID, password, profileData } = req.body;

        if (!planID || !password || !profileData || !profileData.email) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const meta = TIER_META[planID];
        if (!meta) return res.status(400).json({ error: 'Invalid plan' });

        const rzp = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });

        const order = await rzp.orders.create({
            amount: meta.amountPaise,
            currency: "INR",
            receipt: `rcpt_${Date.now()}`
        });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        await db.collection('pending_registrations').doc(order.id).set({
            orderId: order.id,
            amountPaise: meta.amountPaise,
            planID,
            hashedPassword,
            profileData,
            verificationToken,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({
            orderId: order.id,
            amount: meta.amountPaise,
            pendingRegistrationId: order.id,
            verificationToken
        });

    } catch (error) {
        console.error("FATAL API ERROR:", error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
