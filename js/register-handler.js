// js/register-handler.js — B2C Registration with Razorpay Payment

import { getInitializedClients } from "./config.js";
import { routeUser } from "./auth-paywall.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const form = document.getElementById('registration-form');
const errorBox = document.getElementById('error-box');

// --- Business UPI fallback (single source of truth from config) ---
const BUSINESS_UPI_VPA = (window.__firebase_config && window.__firebase_config.businessUpiVpa) || '918520977573@paytm';

// --- Tier ↔ Price Map (matches offering.html) ---
const TIER_META = {
    practitioner: { label: "The Practitioner",  price: "₹10/mo",    amountPaise: 1000   },
    strategist:   { label: "Self-Strategist",    price: "₹999/mo",    amountPaise: 99900   },
    sync:         { label: "The Sync Bundle",    price: "₹1,499/mo", amountPaise: 149900  },
    board_ready:  { label: "Board-Ready",        price: "₹1,299/mo", amountPaise: 129900  },
    legacy:       { label: "The Legacy Plan",    price: "₹32,000",   amountPaise: 3200000 }
};

// 1. Detect Plan from URL
const urlParams = new URLSearchParams(window.location.search);
const selectedTier = urlParams.get('plan') || 'practitioner';
const meta = TIER_META[selectedTier] || TIER_META.practitioner;

document.getElementById('selected-plan-text').textContent = meta.label;
document.getElementById('price-display').textContent = meta.price;

const upiEl = document.getElementById('manual-upi-vpa');
if (upiEl) upiEl.textContent = BUSINESS_UPI_VPA;

// --- Razorpay Payment Helper ---
function openRazorpayCheckout({ order_id, amount, planLabel, prefill }) {
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
            order_id: order_id,
            handler: (res) => resolve(res),
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

// 2. Handle Form Submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = "Opening Payment Gateway...";
    errorBox.classList.add('hidden');

    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const name     = document.getElementById('reg-name').value.trim();
    const grade    = document.getElementById('reg-class').value;
    const board    = document.getElementById('reg-board').value;

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

    const username = email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').substring(0, 30);
    const parentEmail = document.getElementById('reg-parent-email')?.value.trim() || '';

    // Plus Addressing / Salted Email for siblings sharing a parent email
    let computedEmail = email;
    if (parentEmail) {
        const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const suffix = `+${safeName}_${grade}`;
        const parts = parentEmail.split('@');
        if (parts.length === 2) {
            computedEmail = `${parts[0]}${suffix}@${parts[1]}`;
        }
    }

    try {
        // Step 1: Create Order Server-Side
        const orderRes = await fetch('/api/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                planID: selectedTier,
                email: computedEmail,
                parentEmail,
                name,
                username,
                grade: parseInt(grade),
                board,
                stream,
                subjects
            })
        });

        if (!orderRes.ok) {
            const errData = await orderRes.json();
            throw new Error(errData.error || 'Failed to create order');
        }

        const { orderId, verificationToken } = await orderRes.json();

        // Step 2: Open Razorpay Checkout
        const rzpResponse = await openRazorpayCheckout({
            order_id: orderId,
            amount: meta.amountPaise,
            planLabel: meta.label,
            prefill: { name, email: computedEmail }
        });

        submitBtn.textContent = "Payment Successful — Finalizing...";

        // Step 3: Verify Payment Server-Side
        const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                razorpay_order_id: rzpResponse.razorpay_order_id,
                razorpay_payment_id: rzpResponse.razorpay_payment_id,
                razorpay_signature: rzpResponse.razorpay_signature,
                verificationToken: verificationToken,
                password: password // Sent securely over HTTPS so server can create user
            })
        });

        if (!verifyRes.ok) {
            const errData = await verifyRes.json();
            throw new Error(errData.error || 'Payment verification failed. Contact Support.');
        }

        // Step 4: Login User Locally and Route
        const { auth } = await getInitializedClients();
        const userCredential = await signInWithEmailAndPassword(auth, computedEmail, password);
        await routeUser(userCredential.user);

    } catch (err) {
        console.error(err);
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = "Complete Secure Payment";
    }
});
