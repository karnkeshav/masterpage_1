// js/register-handler.js — B2C Registration with Razorpay Payment

import { getInitializedClients } from "./config.js";
import { routeUser } from "./auth-paywall.js";
import { recordFinancialEvent } from "./api.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const form = document.getElementById('registration-form');
const errorBox = document.getElementById('error-box');

// --- Business UPI fallback (single source of truth from config) ---
const BUSINESS_UPI_VPA = (window.__firebase_config && window.__firebase_config.businessUpiVpa) || '918520977573@paytm';

// --- UI Tier Labels & Display Prices (read-only; server controls actual charge) ---
const TIER_META = {
    practitioner: { label: "The Practitioner",  price: "₹10/mo"    },
    strategist:   { label: "Self-Strategist",   price: "₹999/mo"   },
    sync:         { label: "The Sync Bundle",   price: "₹1,499/mo" },
    board_ready:  { label: "Board-Ready",       price: "₹1,299/mo" },
    legacy:       { label: "The Legacy Plan",   price: "₹32,000"   }
};

// 1. Detect Plan from URL
const urlParams = new URLSearchParams(window.location.search);
const selectedTier = urlParams.get('plan') || 'practitioner';
const meta = TIER_META[selectedTier] || TIER_META.practitioner;
const planLabel = meta.label;

document.getElementById('selected-plan-text').textContent = planLabel;
document.getElementById('price-display').textContent = meta.price;

const upiEl = document.getElementById('manual-upi-vpa');
if (upiEl) upiEl.textContent = BUSINESS_UPI_VPA;

// --- Razorpay Payment Helper ---
function openRazorpayCheckout({ orderId, amount, planLabel, prefill }) {
    return new Promise((resolve, reject) => {
        const cfg = window.__firebase_config || {};
        const keyId = cfg.razorpayKeyId;

        if (!keyId || /REPLACE|YOUR.?KEY/i.test(keyId)) {
            reject(new Error('Payment gateway config missing. Contact support or pay via UPI to ' + BUSINESS_UPI_VPA));
            return;
        }

        if (typeof window.Razorpay === 'undefined') {
            reject(new Error('Payment gateway failed to load. Please refresh.'));
            return;
        }

        const options = {
            key: keyId,
            amount: amount,
            currency: "INR",
            name: "Ready4Exam Academy",
            description: planLabel + " Subscription",
            order_id: orderId, // Added Server Order ID
            handler: (res) => resolve(res), // Resolve with the entire response object
            prefill: { name: prefill.name, email: prefill.email },
            notes: { plan: selectedTier, tier: planLabel },
            theme: { color: "#1e40af" },
            modal: { ondismiss: () => reject(new Error('Payment cancelled.')), confirm_close: true }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (res) => reject(new Error(res.error.description || 'Payment failed.')));
        rzp.open();
    });
}

// Generates a 4-hex-character discriminator
function generateDiscriminator() {
    return Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');
}

// 2. Handle Form Submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = "Opening Payment Gateway...";
    errorBox.classList.add('hidden');

    const parentEmail = document.getElementById('reg-parent-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const name     = document.getElementById('reg-name').value.trim();
    const grade    = document.getElementById('reg-class').value;
    const board    = document.getElementById('reg-board').value;

    // --- Generate Salted Email (Plus Addressing) ---
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const discriminator = generateDiscriminator();
    const [localPart, domain] = parentEmail.split('@');
    const studentEmail = `${localPart}+${safeName}_${grade}_${discriminator}@${domain}`;

    let stream = '', subjects = [];
    if (grade === '11' || grade === '12') {
        stream = document.getElementById('reg-stream').value;
        if (stream === 'Commerce') {
            const mathOption = document.getElementById('reg-commerce-math').value;
            subjects = mathOption === 'Other' ? [document.getElementById('reg-commerce-other').value.trim()] : [mathOption];
        } else if (stream === 'Science') {
            subjects = [document.getElementById('reg-science-combo').value];
        } else if (stream === 'Humanities') {
            document.querySelectorAll('input[name="humanities-subject"]:checked').forEach(cb => subjects.push(cb.value));
        }
    }

    const username = studentEmail.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').substring(0, 30);

    const profileData = {
        displayName: name,
        username: username,
        email: studentEmail,
        parentEmail: parentEmail,
        role: "student",
        tenantType: "individual",
        isB2C: true,
        subscriptionTier: selectedTier,
        class: parseInt(grade),
        board: board,
    };

    if (stream) {
        profileData.stream = stream;
        if (subjects.length > 0) profileData.subjects = subjects;
    }

    try {
        // --- 1. Call Server to Create Order ---
        submitBtn.textContent = "Connecting to Secure Gateway...";

        const createOrderRes = await fetch('/api/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                planID: selectedTier,
                password: password, // The server hashes this immediately
                profileData: profileData
            })
        });

        if (!createOrderRes.ok) {
            const errData = await createOrderRes.json();
            throw new Error(errData.error || 'Failed to initialize order.');
        }

        const { orderId, amount, pendingRegistrationId, verificationToken } = await createOrderRes.json();

        // --- 2. Open Razorpay Checkout ---
        submitBtn.textContent = "Awaiting Payment...";
        const paymentRes = await openRazorpayCheckout({
            orderId: orderId,
            amount: amount,
            planLabel: planLabel,
            prefill: { name, email: studentEmail }
        });

        // --- 3. Verify Payment and Finalize Account ---
        submitBtn.textContent = "Payment Successful — Verifying...";
        document.getElementById('payment-loading-overlay').classList.remove('hidden');

        const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                razorpay_payment_id: paymentRes.razorpay_payment_id,
                razorpay_order_id: paymentRes.razorpay_order_id,
                razorpay_signature: paymentRes.razorpay_signature,
                pendingRegistrationId: pendingRegistrationId,
                verificationToken: verificationToken
            })
        });

        if (!verifyRes.ok) {
             const errData = await verifyRes.json();
             throw new Error(errData.error || 'Payment verification failed.');
        }

        const { customToken } = await verifyRes.json();

        // --- 4. Sign in the User ---
        submitBtn.textContent = "Account Created — Logging in...";
        const { getAuth, signInWithCustomToken } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
        const { auth } = await getInitializedClients();
        const userCredential = await signInWithCustomToken(auth, customToken);

        document.getElementById('payment-loading-overlay').classList.add('hidden');
        await routeUser(userCredential.user);

    } catch (err) {
        console.error(err);
        document.getElementById('payment-loading-overlay').classList.add('hidden');
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = "Complete Secure Payment";
    }
});
