// api/create-order.js — Ready4Exam Vercel Serverless Function
const Razorpay = require('razorpay');
const bcrypt   = require('bcryptjs');
const admin    = require('firebase-admin');
const crypto   = require('crypto');

// ─── 2D Plan × Duration Pricing Table ─────────────────────────────────────
// amountPaise = price in paise (₹1 = 100 paise)
// Keep this table in sync with:
//   - offering.html  PLAN_DATA
//   - register-handler.js  TIER_PRICES
const TIER_PRICES = {
    practitioner: {
        '3m': { amountPaise:   19900, label: "BASE",                durationLabel: "3 Months" },
        '1y': { amountPaise:   69900, label: "BASE",                durationLabel: "1 Year"   },
        '3y': { amountPaise:  179900, label: "BASE",                durationLabel: "3 Years"  },
    },
    strategist: {
        '3m': { amountPaise:   29900, label: "CORE",                durationLabel: "3 Months" },
        '1y': { amountPaise:   99900, label: "CORE",                durationLabel: "1 Year"   },
        '3y': { amountPaise:  279900, label: "CORE",                durationLabel: "3 Years"  },
    },
    sync: {
        '3m': { amountPaise:   60000, label: "LINK",                durationLabel: "3 Months" },
        '1y': { amountPaise:  199900, label: "LINK",                durationLabel: "1 Year"   },
        '3y': { amountPaise:  549900, label: "LINK",                durationLabel: "3 Years"  },
    },
    board_self: {
        '3m': { amountPaise:  149900, label: "PEAK",                durationLabel: "3 Months" },
        '1y': { amountPaise:  499900, label: "PEAK",                durationLabel: "1 Year"   },
        '3y': { amountPaise: 1399900, label: "PEAK",                durationLabel: "3 Years"  },
    },
    board_parent: {
        '3m': { amountPaise:  209900, label: "PEAK LINK",           durationLabel: "3 Months" },
        '1y': { amountPaise:  699900, label: "PEAK LINK",           durationLabel: "1 Year"   },
        '3y': { amountPaise: 1899900, label: "PEAK LINK",           durationLabel: "3 Years"  },
    },
    // Backward-compatibility: mapping old board_ready slug to PEAK pricing
    board_ready: {
        '3m': { amountPaise:  149900, label: "PEAK",                durationLabel: "3 Months" },
        '1y': { amountPaise:  499900, label: "PEAK",                durationLabel: "1 Year"   },
        '3y': { amountPaise: 1399900, label: "PEAK",                durationLabel: "3 Years"  },
    },
};

const VALID_DURATIONS = ['3m', '1y', '3y'];

module.exports = async (req, res) => {

    // ── CORS ────────────────────────────────────────────────────────────────
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://ready4exam.in',
        'https://www.ready4exam.in',
        'https://karnkeshav.github.io',
        'https://masterpage-1.vercel.app'
    ];
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    // ── Firebase init ────────────────────────────────────────────────────────
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
        const db = admin.firestore();

        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }

        // ── Validate inputs ──────────────────────────────────────────────────
        const { planID, duration, password, profileData } = req.body;

        if (!planID || !password || !profileData || !profileData.email) {
            return res.status(400).json({ error: 'Missing required parameters.' });
        }

        // Sanitise duration — default to 3m if not supplied (practitioner backward compat)
        const safeDur = VALID_DURATIONS.includes(duration) ? duration : '3m';

        const planDurations = TIER_PRICES[planID];
        if (!planDurations) {
            return res.status(400).json({ error: `Invalid plan: ${planID}` });
        }

        const meta = planDurations[safeDur];
        if (!meta) {
            return res.status(400).json({ error: `Invalid duration: ${safeDur}` });
        }

        // ── Create Razorpay order ────────────────────────────────────────────
        const rzp = new Razorpay({
            key_id:     process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });

        const order = await rzp.orders.create({
            amount:   meta.amountPaise,
            currency: "INR",
            receipt:  `rcpt_${Date.now()}`
        });

        // ── Hash password & generate verification token ──────────────────────
        const salt             = await bcrypt.genSalt(10);
        const hashedPassword   = await bcrypt.hash(password, salt);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // ── Store pending registration (duration + labels persisted for verify step)
        await db.collection('pending_registrations').doc(order.id).set({
            orderId:            order.id,
            amountPaise:        meta.amountPaise,
            planID,
            duration:           safeDur,            // ← consumed by verify-payment.js
            durationLabel:      meta.durationLabel,  // ← used in confirmation email
            planLabel:          meta.label,           // ← used in confirmation email
            hashedPassword,
            profileData,
            verificationToken,
            status:             'pending',
            createdAt:          admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({
            orderId:                order.id,
            amount:                 meta.amountPaise,
            pendingRegistrationId:  order.id,
            verificationToken
        });

    } catch (error) {
        console.error("FATAL create-order ERROR:", error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
