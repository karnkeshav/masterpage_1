import { initializeAuthListener, ensureUserInFirestore, signOut } from "./auth-paywall.js";
import { getInitializedClients } from "./config.js";
import { updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

        const firstLoginFlag = sessionStorage.getItem('firstLogin') === 'true';
        const isHardcodedUser = user.email === "admin@ready4exam.internal" || user.email === "keshav@ready4exam.internal";
        const isMaster = user.email === "dps.ready4exam@ready4exam.internal" || profile.email === "dps.ready4exam@ready4exam.internal" || profile.role === 'owner' || profile.role === 'school_master' || isHardcodedUser;

        // Only trigger password change if the firstLogin session flag is set (i.e., user
        // just logged in with the default password Ready4Exam@2026). Do NOT trigger based
        // on setupComplete === false alone, as that causes repeated prompts if the Firestore
        // write races or the page reloads before setupComplete is updated.
        if (!isMaster && firstLoginFlag && profile.setupComplete !== true) {
            if (profile.role === 'student') {
                showFirstLoginOverlay(user, profile);
            } else {
                console.warn("Guard: First-Login Reset Handshake Triggered.");
                triggerPasswordReset(profile);
            }
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
            sessionStorage.removeItem('firstLogin');
            sessionStorage.removeItem('isFirstLogin'); // legacy cleanup
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

function showFirstLoginOverlay(user, profile) {
    console.log("Guard: First login detected. Showing reset modal.");

    const modalHtml = `
    <div id="first-login-modal" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4" style="position:fixed; inset:0; z-index:100; display:flex; align-items:center; justify-content:center; background:rgba(15,23,42,0.8); backdrop-filter:blur(4px); padding:1rem;">
        <div class="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden" style="background:white; width:100%; max-width:28rem; border-radius:1.5rem; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); overflow:hidden;">
            <div class="p-8" style="padding:2rem;">
                <div class="mb-6 text-center" style="margin-bottom:1.5rem; text-align:center;">
                    <div class="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl shadow-inner" style="width:4rem; height:4rem; background:#eff6ff; color:#2563eb; border-radius:9999px; display:flex; align-items:center; justify-content:center; margin:0 auto 1rem auto; font-size:1.5rem; box-shadow:inset 0 2px 4px 0 rgba(0,0,0,0.06);">
                         <i class="fas fa-key"></i>
                    </div>
                    <h2 class="text-2xl font-black text-slate-900" style="font-size:1.5rem; font-weight:900; color:#0f172a; font-family:'Inter', sans-serif;">Secure Your Account</h2>
                    <p class="text-xs text-slate-500 mt-2 font-medium" style="font-size:0.75rem; color:#64748b; margin-top:0.5rem; font-weight:500;">Please set a private password to continue.</p>
                </div>
                
                <form id="reset-password-form" class="space-y-4" style="display:flex; flex-direction:column; gap:1rem;">
                    <div>
                        <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1" style="display:block; font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:0.25rem;">New Password</label>
                        <input type="password" id="new-pwd" class="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition" style="width:100%; padding:0.75rem 1rem; border-radius:0.75rem; background:#f8fafc; border:1px solid #e2e8f0; outline:none; transition:box-shadow 0.2s;" required placeholder="Minimum 6 characters">
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1" style="display:block; font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:0.25rem;">Confirm Password</label>
                        <input type="password" id="confirm-pwd" class="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition" style="width:100%; padding:0.75rem 1rem; border-radius:0.75rem; background:#f8fafc; border:1px solid #e2e8f0; outline:none; transition:box-shadow 0.2s;" required placeholder="Re-enter password">
                    </div>
                    <div id="pwd-error" class="hidden text-xs font-bold text-red-500 bg-red-50 p-2 rounded-lg text-center" style="display:none; font-size:0.75rem; font-weight:700; color:#ef4444; background:#fef2f2; padding:0.5rem; border-radius:0.5rem; text-align:center;"></div>
                    
                    <button type="submit" id="reset-pwd-btn" class="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-600/30 flex justify-center items-center h-12" style="width:100%; background:#2563eb; color:white; font-weight:700; padding:0.875rem; border-radius:0.75rem; border:none; cursor:pointer; box-shadow:0 10px 15px -3px rgba(37,99,235,0.3); display:flex; justify-content:center; align-items:center; height:3rem; margin-top:0.5rem; transition:background-color 0.2s;">
                        <span>Save & Unlock Dashboard</span>
                    </button>
                    <button type="button" id="cancel-pwd-btn" class="w-full text-slate-400 text-xs font-bold hover:text-slate-600 mt-2 py-2" style="width:100%; background:transparent; border:none; color:#94a3b8; font-size:0.75rem; font-weight:700; cursor:pointer; padding:0.5rem; margin-top:0.5rem;">
                        Cancel & Sign Out
                    </button>
                </form>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const form = document.getElementById('reset-password-form');
    const errorDiv = document.getElementById('pwd-error');
    const btn = document.getElementById('reset-pwd-btn');

    document.getElementById('cancel-pwd-btn').addEventListener('click', async () => {
        try {
            const { signOut } = await import("./auth-paywall.js");
            await signOut();
            window.location.href = '../../index.html';
        } catch (e) {
            window.location.href = '../../index.html';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const p1 = document.getElementById('new-pwd').value;
        const p2 = document.getElementById('confirm-pwd').value;

        if (p1 !== p2) {
            errorDiv.textContent = "Passwords do not match.";
            errorDiv.style.display = 'block';
            return;
        }

        if (p1.length < 6) {
            errorDiv.textContent = "Password must be at least 6 characters.";
            errorDiv.style.display = 'block';
            return;
        }

        try {
            errorDiv.style.display = 'none';
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.style.opacity = '0.7';

            // 1. Update Password in Firebase Auth Vault
            await updatePassword(user, p1);

            // 2. Update Firestore document with setupComplete: true
            const { db } = await getInitializedClients();
            await updateDoc(doc(db, "users", user.uid), {
                setupComplete: true
            });

            // 3. Clear session flags & Reload
            sessionStorage.removeItem('firstLogin');
            sessionStorage.removeItem('isFirstLogin'); // legacy cleanup
            window.location.reload();

        } catch (err) {
            console.error(err);
            errorDiv.textContent = err.message || "Failed to update password.";
            errorDiv.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = '<span>Save & Unlock Dashboard</span>';
            btn.style.opacity = '1';
        }
    });
}
