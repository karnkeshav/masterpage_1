import { initializeAuthListener, ensureUserInFirestore, signOut } from "./auth-paywall.js";
import { getInitializedClients } from "./config.js";
import { updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { updateDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Universal Guard for Console Pages.
 * Enforces:
 * 1. Authentication (User must be logged in)
 * 2. Profile Existence (User must have a Firestore profile)
 * 3. Role Compliance (User role must match requiredRole, or be 'owner')
 * 4. Tenancy (School users must have school_id)
 *
 * If passed, calls window.loadConsoleData(profile).
 * If failed, redirects to index.html (Sovereign Gate).
 */
export async function guardConsole(requiredRole) {
    await getInitializedClients();

    initializeAuthListener(async (user, initialProfile) => {
        if (!user) {
            console.warn("Guard: No user session.");
            window.location.href = "../../index.html";
            return;
        }

        // Use pre-fetched profile or fetch if missing
        const profile = initialProfile || await ensureUserInFirestore(user);

        if (!profile) {
            console.warn("Guard: No profile found.");
            await signOut();
            window.location.href = "../../index.html";
            return;
        }

        // Owner Override (God Mode)
        if (profile.role === 'owner' || profile.tenantType === 'owner') {
            console.log("Guard: Owner Access Granted");
            revealApp(profile);
            return;
        }

        // Role Check
        if (profile.role !== requiredRole) {
             console.warn(`Guard: Role Mismatch. Required: ${requiredRole}, Got: ${profile.role}`);
             await signOut();
             window.location.href = "../../index.html";
             return;
        }

        // Tenancy Check for Schools
        if (profile.tenantType === 'school' && !profile.school_id) {
             console.warn("Guard: School User missing school_id");
             await signOut();
             window.location.href = "../../index.html";
             return;
        }

        // First-Login Reset Handshake
        const isFirstLogin = sessionStorage.getItem('isFirstLogin') === 'true';
        const isMaster = user.email === "dps.ready4exam@ready4exam.internal" || profile.email === "dps.ready4exam@ready4exam.internal";

        if (!isMaster && (profile.setupComplete === false || isFirstLogin)) {
            console.warn("Guard: First-Login Reset Handshake Triggered.");
            triggerPasswordReset(profile);
            return;
        }

        // Access Granted
        revealApp(profile);
    });
}

function triggerPasswordReset(profile) {
    console.log("Injecting Sovereign Password Reset Modal");
    const app = document.getElementById("app");
    const loading = document.getElementById("loading");

    if (loading) loading.classList.add("hidden");
    if (app) app.classList.add("hidden"); // Ensure main UI remains blocked

    // Create Modal Container if it doesn't exist
    let modalContainer = document.getElementById('reset-modal-container');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'reset-modal-container';
        document.body.appendChild(modalContainer);
    }

    modalContainer.innerHTML = `
        <div class="fixed inset-0 bg-slate-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
                <div class="bg-gradient-to-r from-slate-800 to-cbse-blue p-6 text-center">
                    <h2 class="text-xl font-bold text-white mb-2 tracking-wide">Sovereign Security Gateway</h2>
                    <p class="text-slate-300 text-sm">Action Required: First-Login Password Reset</p>
                </div>
                <div class="p-6">
                    <p class="text-slate-600 text-sm mb-6 text-center">Welcome, <span class="font-bold text-slate-800">${profile.displayName}</span>. For your security, you must update your temporary password before accessing the institution's portal.</p>

                    <div class="space-y-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">New Secure Password</label>
                            <input type="password" id="newPasswordInput" placeholder="Min. 8 characters" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue transition">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Confirm Password</label>
                            <input type="password" id="confirmPasswordInput" placeholder="Type it again" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-cbse-blue transition">
                        </div>
                    </div>

                    <div id="reset-modal-error" class="hidden text-xs font-bold text-danger-red bg-red-50 p-3 rounded-lg border border-red-100 mt-4 text-center"></div>
                </div>
                <div class="bg-slate-50 p-4 border-t border-slate-200 flex justify-end">
                    <button id="reset-save-btn" onclick="window.submitPasswordReset()" class="w-full py-3 text-sm font-bold bg-cbse-blue text-white rounded-lg shadow hover:bg-blue-800 transition">Update & Access Portal</button>
                </div>
            </div>
        </div>
    `;

    window.submitPasswordReset = async () => {
        const newPassword = document.getElementById('newPasswordInput')?.value;
        const confirmPassword = document.getElementById('confirmPasswordInput')?.value;

        if (!newPassword) {
            console.error('Password input not found');
            return;
        }

        const errorEl = document.getElementById('reset-modal-error');
        const saveBtn = document.getElementById('reset-save-btn');

        const showError = (msg) => {
            errorEl.innerText = msg;
            errorEl.classList.remove('hidden');
            saveBtn.disabled = false;
            saveBtn.innerText = "Update & Access Portal";
        };

        if (newPassword.length < 8) return showError("Password must be at least 8 characters.");
        if (newPassword !== confirmPassword) return showError("Passwords do not match.");
        if (!/[!@#$%^&*]/.test(newPassword)) return showError("Password must contain at least one special character (!@#$%^&*).");

        saveBtn.disabled = true;
        saveBtn.innerText = "Encrypting...";
        errorEl.classList.add('hidden');

        try {
            const { auth, db } = await getInitializedClients();

            const user = auth.currentUser;
            if (!user) throw new Error('No active session');

            // Action 1: Auth Vault Update
            await updatePassword(user, newPassword);

            // Action 2: Firestore Registry Update
            console.log('Targeting UID:', user.uid);
            await updateDoc(doc(db, "users", user.uid), {
                setupComplete: true
            });

            // Action 3: Cleanup and Redirect
            sessionStorage.removeItem('isFirstLogin');
            modalContainer.innerHTML = ''; // Remove modal

            // Force reload to clear guard state
            window.location.reload();

        } catch (e) {
            console.error("Password reset failed:", e);
            showError(e.message || "Failed to update password. Please try again.");
        }
    };
}


function revealApp(profile) {
    console.log("Guard: Access Granted", profile);

    // Ensure window.userProfile is set with stable UID
    window.userProfile = profile;

    // Force synchronize sessionStorage with the authenticated user
    sessionStorage.setItem('uid', profile.uid);
    sessionStorage.setItem('username', profile.displayName);

    const app = document.getElementById("app");
    const loading = document.getElementById("loading");

    if (loading) loading.classList.add("hidden");
    if (app) app.classList.remove("hidden");

    if (window.loadConsoleData) {
        window.loadConsoleData(profile);
    }
}

export function bindConsoleLogout(buttonId = "logout-btn", redirectPath = "../../index.html") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => attachLogout(buttonId, redirectPath));
    } else {
        attachLogout(buttonId, redirectPath);
    }
}

function attachLogout(buttonId, redirectPath) {
    const btn = document.getElementById(buttonId);
    if (btn) {
        btn.onclick = async () => {
            if (confirm("Sign out of your Ready4Exam session?")) {
                try {
                    await signOut();
                    window.location.href = redirectPath;
                } catch (err) {
                    console.error("Logout failed", err);
                }
            }
        };
    }
}
