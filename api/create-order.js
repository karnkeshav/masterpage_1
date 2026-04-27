const Razorpay = require('razorpay');
const admin = require('firebase-admin');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

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
    const allowedOrigin = process.env.ALLOWED_ORIGIN;
    if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { planID, email, parentEmail, name, username, grade, board, stream, subjects, password } = req.body;

        if (!planID || !TIER_META[planID] || !password) {
            return res.status(400).json({ error: 'Invalid or missing required fields' });
        }

        const meta = TIER_META[planID];

        let computedEmail = email;
        const contactEmail = parentEmail || email;

        if (parentEmail) {
            const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const discriminator = crypto.randomBytes(2).toString('hex');
            const parts = parentEmail.split('@');
            if (parts.length === 2) {
                computedEmail = `${parts[0]}+${safeName}_${grade}_${discriminator}@${parts[1]}`;
            }
        }

        // Duplicate Check
        try {
            await admin.auth().getUserByEmail(computedEmail);
            return res.status(409).json({ error: 'A student with this name and grade is already registered under this parent email. Add a middle initial or contact support.' });
        } catch (e) {
            if (e.code !== 'auth/user-not-found') throw e;
        }

        const recentOrders = await db.collection('pending_registrations')
            .where('email', '==', computedEmail)
            .where('status', '==', 'completed')
            .limit(1)
            .get();

        if (!recentOrders.empty) {
             return res.status(409).json({ error: 'This user has already been provisioned successfully. Please log in.' });
        }

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
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const hashedPassword = await bcrypt.hash(password, 12);

        // Store Pending Registration
        await db.collection('pending_registrations').doc(order.id).set({
            planID,
            amountPaise: meta.amountPaise,
            email: computedEmail,
            contactEmail,
            parentEmail: parentEmail || '',
            name,
            username,
            grade,
            board,
            stream: stream || '',
            subjects: subjects || [],
            verificationToken,
            passwordHash: hashedPassword,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending'
        });

        return res.status(200).json({ orderId: order.id, verificationToken, computedEmail });

    } catch (error) {
        console.error("Create order failed:", error);
        return res.status(500).json({ error: "Failed to create order" });
    }
};
