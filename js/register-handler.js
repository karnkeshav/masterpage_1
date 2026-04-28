// js/register-handler.js — Refactored B2C Registration
import { getInitializedClients } from "./config.js";
import { routeUser } from "./auth-paywall.js";

const form = document.getElementById('registration-form');
const errorBox = document.getElementById('error-box');

/** * 1. DYNAMIC API CONFIGURATION
 * Hardcoded to your Vercel app to bypass GitHub Pages 405 errors.
 */
const API_BASE = 'https://masterpage-1.vercel.app'; 

const BUSINESS_UPI_VPA = (window.__firebase_config && window.__firebase_config.businessUpiVpa) || '918520977573@paytm';

const TIER_META = {
    practitioner: { label: "The Practitioner",  price: "₹10/mo"    },
    strategist:   { label: "Self-Strategist",   price: "₹999/mo"   },
    sync:         { label: "The Sync Bundle",   price: "₹1,499/mo" },
    board_ready:  { label: "Board-Ready",       price: "₹1,299/mo" },
    legacy:       { label: "The Legacy Plan",   price: "₹32,000"   }
};

const urlParams = new URLSearchParams(window.location.search);
const selectedTier = urlParams.get('plan') || 'practitioner';
const meta = TIER_META[selectedTier] || TIER_META.practitioner;

document.getElementById('selected-plan-text').textContent = meta.label;
document.getElementById('price-display').textContent = meta.price;

/** * 2. IDENTITY GENERATION 
 * Generates an immutable internal login ID to avoid "plus-addressing" issues 
 * with different mail providers.
 */
function generateUniqueId() {
    return Math.random().toString(36).substring(2, 10) + Math.floor(Date.now() / 1000).toString(36);
}

/** * 3. RAZORPAY CHECKOUT HELPER 
 */
function openRazorpayCheckout({ orderId, amount, planLabel, prefill }) {
    return new Promise((resolve, reject) => {
        const cfg = window.__firebase_config || {};
        const keyId = cfg.razorpayKeyId;

        if (!keyId || /REPLACE|YOUR.?KEY/i.test(keyId)) {
            reject(new Error('Payment gateway config missing. Contact support.'));
            return;
        }

        const options = {
            key: keyId,
            amount: amount,
            currency: "INR",
            name: "Ready4Exam Academy",
            description: planLabel + " Subscription",
            order_id: orderId,
            handler: (res) => resolve(res),
            prefill: { name: prefill.name, email: prefill.email },
            theme: { color: "#10b981" }, // success-green
            modal: { ondismiss: () => reject(new Error('Payment cancelled.')), confirm_close: true }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (res) => reject(new Error(res.error.description || 'Payment failed.')));
        rzp.open();
    });
}

/** * 4. FORM SUBMISSION & VALIDATION 
 */
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-btn');
    errorBox.classList.add('hidden');

    const name = document.getElementById('reg-name').value.trim();
    const parentEmail = document.getElementById('reg-parent-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const grade = document.getElementById('reg-class').value;
    const board = document.getElementById('reg-board').value;

    // A. STREAM & SUBJECT VALIDATION
    let stream = '', subjects = [];
    if (grade === '11' || grade === '12') {
        stream = document.getElementById('reg-stream').value;
        if (stream === 'Humanities') {
            const checked = document.querySelectorAll('input[name="humanities-subject"]:checked');
            // Core Humanities requirement: 5-6 subjects
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
            subjects = mathOption === 'Other' ? [document.getElementById('reg-commerce-other').value.trim()] : [mathOption];
        }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Connecting to Secure Gateway...";

    // B. DECOUPLED IDENTITY CREATION
    // We create a unique internal email for login that doesn't rely on the parent email provider.
    const uniqueStub = generateUniqueId();
    const studentLoginEmail = `stu_${uniqueStub}@ready4exam.internal`;

    const profileData = {
        displayName: name,
        username: `stu_${uniqueStub}`,
        email: studentLoginEmail, // Immutable internal login
        parentEmail: parentEmail, // Communication and recovery
        role: "student",
        tenantType: "individual",
        isB2C: true,
        subscriptionTier: selectedTier,
        class: parseInt(grade), // Stored as integer for curriculum routing
        board: board,
    };

    if (stream) {
        profileData.stream = stream;
        if (subjects.length > 0) profileData.subjects = subjects;
    }

    try {
        // --- STEP 1: CREATE ORDER (Calling Vercel) ---
        const createOrderRes = await fetch(`${API_BASE}/api/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                planID: selectedTier,
                password: password,
                profileData: profileData
            })
        });

        if (!createOrderRes.ok) {
            const errData = await createOrderRes.json();
            throw new Error(errData.error || 'Failed to initialize order.');
        }

        const { orderId, amount, pendingRegistrationId, verificationToken } = await createOrderRes.json();

        // --- STEP 2: OPEN PAYMENT MODAL ---
        submitBtn.textContent = "Awaiting Secure Payment...";
        const paymentRes = await openRazorpayCheckout({
            orderId: orderId,
            amount: amount,
            planLabel: meta.label,
            prefill: { name, email: parentEmail }
        });

        // --- STEP 3: VERIFY & FINALIZE (Calling Vercel) ---
        submitBtn.textContent = "Payment Successful — Verifying...";
        document.getElementById('payment-loading-overlay').classList.remove('hidden');

        const verifyRes = await fetch(`${API_BASE}/api/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                razorpay_payment_id: paymentRes.razorpay_payment_id,
                razorpay_order_id: paymentRes.razorpay_order_id,
                razorpay_signature: paymentRes.razorpay_signature,
                pendingRegistrationId,
                verificationToken
            })
        });

        if (!verifyRes.ok) {
             const errData = await verifyRes.json();
             throw new Error(errData.error || 'Payment verification failed.');
        }

        const { customToken } = await verifyRes.json();

        // --- STEP 4: SIGN IN ---
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
        submitBtn.disabled = false;
        submitBtn.textContent = "Retry Secure Payment";
    }
});
