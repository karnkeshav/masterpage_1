// js/register-handler.js — B2C Registration with Razorpay Payment

import { getInitializedClients } from "./config.js";
import { routeUser } from "./auth-paywall.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const form = document.getElementById('registration-form');
const errorBox = document.getElementById('error-box');

// --- Tier ↔ Price Map (matches offering.html) ---
const TIER_META = {
    practitioner: { label: "The Practitioner",  price: "₹499/mo",   amountPaise: 49900   },
    strategist:   { label: "Self-Strategist",    price: "₹999/mo",   amountPaise: 99900   },
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

// --- Razorpay Payment Helper ---
function openRazorpayCheckout({ amount, planLabel, prefill }) {
    return new Promise((resolve, reject) => {
        const cfg = window.__firebase_config || {};
        const keyId = cfg.razorpayKeyId;

        if (!keyId || keyId.includes('REPLACE')) {
            reject(new Error(
                'Payment gateway is not configured yet. Please contact support or pay manually via UPI to ' +
                (cfg.businessUpiVpa || '918520977573@paytm') + ' and share the screenshot.'
            ));
            return;
        }

        if (typeof window.Razorpay === 'undefined') {
            reject(new Error(
                'Payment gateway failed to load. Please refresh and try again, or pay manually via UPI to ' +
                (cfg.businessUpiVpa || '918520977573@paytm') + '.'
            ));
            return;
        }

        const options = {
            key: keyId,
            amount: amount,
            currency: "INR",
            name: "Ready4Exam Academy",
            description: planLabel + " Subscription",
            handler: function (response) {
                resolve(response.razorpay_payment_id);
            },
            prefill: {
                name: prefill.name,
                email: prefill.email
            },
            notes: {
                plan: selectedTier,
                tier: planLabel
            },
            theme: {
                color: "#1e40af"
            },
            method: {
                card: true,
                netbanking: true,
                upi: true,
                wallet: true,
                emi: false,
                paylater: false
            },
            modal: {
                ondismiss: function () {
                    reject(new Error('Payment was cancelled. Please try again.'));
                },
                confirm_close: true,
                escape: false
            }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response) {
            reject(new Error(
                (response.error && response.error.description) ||
                'Payment failed. Please try again or use a different payment method.'
            ));
        });
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

    // Stream & subject details (Class 11/12 only)
    let stream = '';
    let subjects = [];
    if (grade === '11' || grade === '12') {
        stream = document.getElementById('reg-stream').value;
        if (stream === 'Commerce') {
            const mathOption = document.getElementById('reg-commerce-math').value;
            if (mathOption === 'Other') {
                const custom = document.getElementById('reg-commerce-other').value.trim();
                if (custom) subjects = [custom];
            } else if (mathOption) {
                subjects = [mathOption];
            }
        } else if (stream === 'Science') {
            const combo = document.getElementById('reg-science-combo').value;
            if (combo) subjects = [combo];
        } else if (stream === 'Humanities') {
            document.querySelectorAll('input[name="humanities-subject"]:checked').forEach(cb => {
                subjects.push(cb.value);
            });
        }
    }

    // Derive a sanitised username from the email prefix
    const username = email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '').substring(0, 30);

    try {
        // --- Step 1: Open Razorpay Checkout ---
        const paymentId = await openRazorpayCheckout({
            amount: meta.amountPaise,
            planLabel: meta.label,
            prefill: { name, email }
        });

        submitBtn.textContent = "Payment Successful — Creating Account...";

        // --- Step 2: Create Firebase Auth User ---
        const { auth, db } = await getInitializedClients();
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // --- Step 3: Calculate Activation & Expiry ---
        const now = new Date();
        const expiry = new Date();
        if (selectedTier === 'legacy') {
            expiry.setFullYear(now.getFullYear() + 3); // 3 Years
        } else {
            expiry.setDate(now.getDate() + 30); // 30 Days
        }

        const graceDate = new Date(expiry);
        graceDate.setDate(expiry.getDate() + 5); // 5-Day Grace Period

        // --- Step 4: Set Tier-Specific Module Flags ---
        let activeModules = ["SimpleQuizzes"];
        if (selectedTier === 'practitioner') {
            activeModules.push("MediumQuizzes", "AdvancedQuizzes");
        }
        if (selectedTier === 'strategist' || selectedTier === 'sync' || selectedTier === 'legacy') {
            activeModules.push("MediumQuizzes", "AdvancedQuizzes", "MistakeNotebook", "KnowledgeHub");
        }
        if (selectedTier === 'sync' || selectedTier === 'legacy') {
            activeModules.push("ParentConsole");
        }
        if (selectedTier === 'board_ready' || selectedTier === 'legacy') {
            activeModules.push("PYQ_Insights", "WeightageAnalytics", "MarkingGuides");
        }

        // --- Step 5: Save B2C Profile to Firestore ---
        const profileData = {
            uid: user.uid,
            displayName: name,
            username: username,
            email: email,
            role: "student",
            tenantType: "individual",
            isB2C: true,
            subscriptionTier: selectedTier,
            class: parseInt(grade),
            board: board,
            status: "active",
            activationDate: serverTimestamp(),
            accessExpiryDate: expiry,
            gracePeriodEndDate: graceDate,
            activeModules: activeModules,
            razorpayPaymentId: paymentId,
            createdAt: serverTimestamp()
        };

        if (stream) {
            profileData.stream = stream;
            if (subjects.length > 0) profileData.subjects = subjects;
        }

        await setDoc(doc(db, "users", user.uid), profileData);

        // --- Step 6: Route via Sovereign Gateway ---
        await routeUser(user);

    } catch (err) {
        console.error(err);
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = "Complete Secure Payment";
    }
});
