// app/consoles/practitioner.js
import { getInitializedClients } from "../../js/config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

async function initPractitioner() {
    const { auth, db } = await getInitializedClients();

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "../../index.html";
            return;
        }

        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            
            if (!userDoc.exists()) {
                window.location.href = "../../index.html";
                return;
            }

            const data = userDoc.data();

            // Security Gate: Ensure user is a Practitioner and B2C
            if (data.subscriptionTier !== 'practitioner' || !data.isB2C) {
                console.warn("Unauthorized access to Practitioner console. Redirecting...");
                window.location.href = "../../index.html";
                return;
            }

            // Update UI with Firebase Data
            // Header Welcome
            const welcomeEl = document.querySelector('[data-user-welcome]');
            if (welcomeEl) welcomeEl.textContent = data.displayName || "Scholar";

            // Role Badge (Grade)
            const badgeEl = document.getElementById('context-badge');
            if (badgeEl) badgeEl.textContent = `Grade ${data.class || '--'}`;

        } catch (error) {
            console.error("Practitioner Init Error:", error);
            // In case of firestore permission errors, fallback to home
            window.location.href = "../../index.html";
        }
    });

    // Global Logout for the shell.js button
    window.logout = async () => {
        try {
            await signOut(auth);
            window.location.href = "../../index.html";
        } catch (err) {
            console.error("Signout failed:", err);
        }
    };
}

// Execute on load
initPractitioner();
