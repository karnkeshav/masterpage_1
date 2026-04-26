const Razorpay = require('razorpay');
const admin = require('firebase-admin');

// Ensure Firebase is initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
}

const db = admin.firestore();

// --- Tier ↔ Price Map ---
const TIER_META = {
    practitioner: { label: "The Practitioner",  price: "₹10/mo",    amountPaise: 1000   },
    strategist:   { label: "Self-Strategist",    price: "₹999/mo",    amountPaise: 99900   },
    sync:         { label: "The Sync Bundle",    price: "₹1,499/mo", amountPaise: 149900  },
    board_ready:  { label: "Board-Ready",        price: "₹1,299/mo", amountPaise: 129900  },
    legacy:       { label: "The Legacy Plan",    price: "₹32,000",   amountPaise: 3200000 }
};

module.exports = async (req, res) => {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { planID, email, parentEmail, name, username, grade, board, stream, subjects } = req.body;

        if (!planID || !TIER_META[planID]) {
            return res.status(400).json({ error: 'Invalid or missing planID' });
        }

        const meta = TIER_META[planID];

        // Initialize Razorpay
        const instance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const options = {
            amount: meta.amountPaise,
            currency: "INR",
            receipt: `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`
        };

        const order = await instance.orders.create(options);

        // Store Pending Registration
        await db.collection('pending_registrations').doc(order.id).set({
            planID,
            amountPaise: meta.amountPaise,
            email,
            parentEmail,
            name,
            username,
            grade,
            board,
            stream: stream || '',
            subjects: subjects || [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending'
        });

        return res.status(200).json({ orderId: order.id });

    } catch (error) {
        console.error("Create order failed:", error);
        return res.status(500).json({ error: "Failed to create order" });
    }
};
