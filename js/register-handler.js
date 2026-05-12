// js/register-handler.js — B2C Registration with Plan + Duration Support
import { getInitializedClients } from "./config.js";
import { routeUser } from "./auth-paywall.js";

const form    = document.getElementById('registration-form');
const errorBox = document.getElementById('error-box');

// ─── API ───────────────────────────────────────────────────────────────────
const API_BASE = 'https://masterpage-1.vercel.app';

// ─── Plan Metadata ─────────────────────────────────────────────────────────
// Labels used for the plan badge on the registration form
const TIER_LABELS = {
    practitioner: "The Practitioner",
    strategist:   "Self-Strategist",
    sync:         "The Sync Bundle",
    board_self:   "Board-Ready",
    board_parent: "Board-Ready + Parent",
    board_ready:  "Board-Ready",          // backward-compat alias
};

// Display prices matching create-order.js amountPaise exactly
const TIER_PRICES = {
    practitioner: {
        '3m': '₹199',    '1y': '₹699',    '3y': '₹1,799'
    },
    strategist: {
        '3m': '₹300',    '1y': '₹999',    '3y': '₹2,799'
    },
    sync: {
        '3m': '₹600',    '1y': '₹1,999',  '3y': '₹5,499'
    },
    board_self: {
        '3m': '₹1,499',  '1y': '₹4,999',  '3y': '₹13,999'
    },
    board_parent: {
        '3m': '₹2,099',  '1y': '₹6,999',  '3y': '₹18,999'
    },
    board_ready: {
        '3m': '₹1,499',  '1y': '₹4,999',  '3y': '₹13,999'  // backward-compat
    },
};

const DUR_LABELS = {
    '3m': '3 Months',
    '1y': '1 Year',
    '3y': '3 Years',
};

// ─── Read URL params ────────────────────────────────────────────────────────
const urlParams    = new URLSearchParams(window.location.search);
const selectedTier = urlParams.get('plan') || 'practitioner';
const selectedDur  = ['3m', '1y', '3y'].includes(urlParams.get('dur'))
    ? urlParams.get('dur')
    : '3m';

// ─── Populate plan badge & price on page load ───────────────────────────────
const planLabel  = TIER_LABELS[selectedTier]  || TIER_LABELS.practitioner;
const durLabel   = DUR_LABELS[selectedDur];
const planPrices = TIER_PRICES[selectedTier]  || TIER_PRICES.practitioner;
const displayPrice = planPrices[selectedDur]  || planPrices['3m'];

document.getElementById('selected-plan-text').textContent = `${planLabel} — ${durLabel}`;
document.getElementById('price-display').textContent = displayPrice;

// ─── Unique ID generator ────────────────────────────────────────────────────
function generateUniqueId() {
    return Math.random().toString(36).substring(2, 10) + Math.floor(Date.now() / 1000).toString(36);
}

// ─── Razorpay checkout helper ────────────────────────────────────────────────
function openRazorpayCheckout({ orderId, amount, planLabel, prefill }) {
    return new Promise((resolve, reject) => {
        const cfg   = window.__firebase_config || {};
        const keyId = cfg.razorpayKeyId;

        if (!keyId || /REPLACE|YOUR.?KEY/i.test(keyId)) {
            reject(new Error('Payment gateway config missing. Contact support.'));
            return;
        }

        const options = {
            key:         keyId,
            amount:      amount,
            currency:    "INR",
            name:        "Ready4Exam Academy",
            description: planLabel + " Subscription",
            order_id:    orderId,
            handler:     (res) => resolve(res),
            prefill:     { name: prefill.name, email: prefill.email },
            theme:       { color: "#10b981" },
            modal:       { ondismiss: () => reject(new Error('Payment cancelled.')), confirm_close: true }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (res) => reject(new Error(res.error.description || 'Payment failed.')));
        rzp.open();
    });
}

// ─── Form Submission ─────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-btn');
    errorBox.classList.add('hidden');

    const name        = document.getElementById('reg-name').value.trim();
    const parentEmail = document.getElementById('reg-parent-email').value.trim();
    const password    = document.getElementById('reg-password').value;
    const grade       = document.getElementById('reg-class').value;
    const board       = document.getElementById('reg-board').value;

    // A. Stream & Subject validation (Class 11/12 only)
    let stream = '', subjects = [];
    if (grade === '11' || grade === '12') {
        stream = document.getElementById('reg-stream').value;
        if (stream === 'Humanities') {
            const checked = document.querySelectorAll('input[name="humanities-subject"]:checked');
            if (checked.length < 5 || checked.length > 6) {
                errorBox.textContent = "Please select between 5 and 6 core subjects for Humanities.";
                errorBox.classList.remove('hidden');
                return;
            }
            checked.forEach(cb => subjects.push(cb.value));
        } else if (stream === 'Science') {
            subjects = [document.getElementById('reg-science-combo').value];
        } else if (stream === 'Commerce') {
            const mathOption = document.getElementById('reg-commerce-math').value;
            subjects = mathOption === 'Other'
                ? [document.getElementById('reg-commerce-other').value.trim()]
                : [mathOption];
        }
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = "Connecting to Secure Gateway...";

    // B. Decoupled identity (internal login email, not tied to parent mail provider)
    const uniqueStub       = generateUniqueId();
    const studentLoginEmail = `stu_${uniqueStub}@ready4exam.internal`;

    const profileData = {
        displayName:     name,
        username:        `stu_${uniqueStub}`,
        email:           studentLoginEmail,
        parentEmail:     parentEmail,
        role:            "student",
        tenantType:      "individual",
        isB2C:           true,
        subscriptionTier: selectedTier,
        class:           parseInt(grade),
        board:           board,
    };

    if (stream) {
        profileData.stream = stream;
        if (subjects.length > 0) profileData.subjects = subjects;
    }

    try {
        // ── STEP 1: Create Razorpay order ──────────────────────────────────
        const createOrderRes = await fetch(`${API_BASE}/api/create-order`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                planID:      selectedTier,
                duration:    selectedDur,      // ← NEW: sent to backend
                password:    password,
                profileData: profileData
            })
        });

        if (!createOrderRes.ok) {
            const errData = await createOrderRes.json();
            throw new Error(errData.error || 'Failed to initialize order.');
        }

        const { orderId, amount, pendingRegistrationId, verificationToken } = await createOrderRes.json();

        // ── STEP 2: Open Razorpay modal ─────────────────────────────────────
        submitBtn.textContent = "Awaiting Secure Payment...";
        const paymentRes = await openRazorpayCheckout({
            orderId,
            amount,
            planLabel: `${planLabel} — ${durLabel}`,
            prefill:   { name, email: parentEmail }
        });

        // ── STEP 3: Verify & finalize ───────────────────────────────────────
        submitBtn.textContent = "Payment Successful — Verifying...";
        document.getElementById('payment-loading-overlay').classList.remove('hidden');

        const verifyRes = await fetch(`${API_BASE}/api/verify-payment`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                razorpay_payment_id:  paymentRes.razorpay_payment_id,
                razorpay_order_id:    paymentRes.razorpay_order_id,
                razorpay_signature:   paymentRes.razorpay_signature,
                pendingRegistrationId,
                verificationToken
            })
        });

        if (!verifyRes.ok) {
            const errData = await verifyRes.json();
            throw new Error(errData.error || 'Payment verification failed.');
        }

        const { customToken } = await verifyRes.json();

        // ── STEP 4: Sign in ──────────────────────────────────────────────────
        submitBtn.textContent = "Account Created — Logging in...";
        const { signInWithCustomToken } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
        const { auth } = await getInitializedClients();
        const userCredential = await signInWithCustomToken(auth, customToken);

        document.getElementById('payment-loading-overlay').classList.add('hidden');
        await routeUser(userCredential.user);

    } catch (err) {
        console.error(err);
        document.getElementById('payment-loading-overlay').classList.add('hidden');
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
        submitBtn.disabled    = false;
        submitBtn.textContent = "Retry Secure Payment";
    }
});
