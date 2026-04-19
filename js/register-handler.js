// js/register-handler.js — B2C Registration Logic

import { getInitializedClients } from "./config.js";
import { routeUser } from "./auth-paywall.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const form = document.getElementById('registration-form');
const errorBox = document.getElementById('error-box');

// --- Tier ↔ Price Map (matches offering.html) ---
const TIER_META = {
    practitioner: { label: "The Practitioner",  price: "₹499/mo" },
    strategist:   { label: "Self-Strategist",    price: "₹999/mo" },
    sync:         { label: "The Sync Bundle",    price: "₹1,499/mo" },
    board_ready:  { label: "Board-Ready",        price: "₹1,299/mo" },
    legacy:       { label: "The Legacy Plan",    price: "₹32,000" }
};

// 1. Detect Plan from URL
const urlParams = new URLSearchParams(window.location.search);
const selectedTier = urlParams.get('plan') || 'practitioner';
const meta = TIER_META[selectedTier] || TIER_META.practitioner;

document.getElementById('selected-plan-text').textContent = meta.label;
document.getElementById('price-display').textContent = meta.price;

// 2. Handle Form Submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = "Processing Secure Payment...";
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
        const { auth, db } = await getInitializedClients();

        // 3. Create Firebase Auth User
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 4. Calculate Activation & Expiry
        const now = new Date();
        const expiry = new Date();
        if (selectedTier === 'legacy') {
            expiry.setFullYear(now.getFullYear() + 3); // 3 Years
        } else {
            expiry.setDate(now.getDate() + 30); // 30 Days
        }

        const graceDate = new Date(expiry);
        graceDate.setDate(expiry.getDate() + 5); // 5-Day Grace Period

        // 5. Set Tier-Specific Module Flags
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

        // 6. Save B2C Profile to Firestore
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
            createdAt: serverTimestamp()
        };

        if (stream) {
            profileData.stream = stream;
            if (subjects.length > 0) profileData.subjects = subjects;
        }

        await setDoc(doc(db, "users", user.uid), profileData);

        // 7. Route via Sovereign Gateway
        await routeUser(user);

    } catch (err) {
        console.error(err);
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = "Complete Secure Payment";
    }
});
