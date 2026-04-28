// js/guard.js  
import { initializeAuthListener, ensureUserInFirestore, signOut } from "./auth-paywall.js";  
import { getInitializedClients } from "./config.js";  
import { updatePassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export async function guardConsole(requiredRole) {  
    await getInitializedClients();  
  
    initializeAuthListener(async (user, initialProfile) => {  
        if (!user) {  
            console.warn("Guard: No user session.");  
            window.location.href = "../../index.html";  
            return;  
        }  
  
        const profile = initialProfile || await ensureUserInFirestore(user);  
  
        if (!profile) {  
            console.warn("Guard: No profile found.");  
            await signOut();  
            window.location.href = "../../index.html";  
            return;  
        }  
  
        if (profile.role === 'owner' || profile.tenantType === 'owner') {  
            console.log("Guard: Owner Access Granted");  
            revealApp(profile);  
            return;  
        }  
  
        if (profile.role !== requiredRole) {  
            console.warn(`Guard: Role Mismatch. Required: ${requiredRole}, Got: ${profile.role}`);  
            await signOut();  
            window.location.href = "../../index.html";  
            return;  
        }  
  
        if (profile.tenantType === 'school' && !profile.school_id) {  
            console.warn("Guard: School User missing school_id");  
            await signOut();  
            window.location.href = "../../index.html";  
            return;  
        }  
  
        // Password Rotation Policy Check
        if (profile.lastPasswordChangeDate) {
            const lastChange = profile.lastPasswordChangeDate.toDate ? profile.lastPasswordChangeDate.toDate() : new Date(profile.lastPasswordChangeDate);
            const now = new Date();
            const elapsedDays = Math.floor((now - lastChange) / (1000 * 60 * 60 * 24));

            if (elapsedDays >= 90) {
                console.warn("Guard: Password expired.");
                showMandatoryPasswordUpdateModal(user, profile);
                return; // Do not call revealApp
            } else if (elapsedDays >= 76) {
                showPasswordWarning(90 - elapsedDays, user, profile);
            }
        }

        // Access Granted  
        revealApp(profile);  
    });  
}

function showMandatoryPasswordUpdateModal(user, profile) {
    renderPasswordModal(true, user, profile);
}

function showPasswordWarning(daysRemaining, user, profile) {
    const warningDiv = document.createElement("div");
    warningDiv.className = "fixed top-0 left-0 w-full bg-yellow-500 text-black text-center py-2 z-50 font-bold text-sm shadow-md flex justify-center items-center gap-4";
    warningDiv.innerHTML = `<span><i class="fas fa-exclamation-triangle mr-2"></i> Your password will expire in ${daysRemaining} days.</span>`;

    const updateBtn = document.createElement("button");
    updateBtn.className = "bg-black text-white px-3 py-1 rounded text-xs hover:bg-gray-800 transition";
    updateBtn.textContent = "Update Now";
    updateBtn.onclick = () => renderPasswordModal(false, user, profile);

    warningDiv.appendChild(updateBtn);
    document.body.prepend(warningDiv);
}

function renderPasswordModal(isMandatory, user, profile) {
    // Remove if already exists
    const existing = document.getElementById("password-update-modal");
    if (existing) existing.remove();

    const modalHTML = `
        <div id="password-update-modal" class="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div class="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full">
                ${!isMandatory ? '<button id="close-pwd-modal" class="float-right text-slate-400 hover:text-slate-900"><i class="fas fa-times"></i></button>' : ''}
                <h3 class="text-xl font-black text-slate-900 mb-2">${isMandatory ? 'Mandatory Password Update' : 'Update Password'}</h3>
                <p class="text-sm text-slate-500 mb-6">For security reasons, please update your password.</p>
                <div id="pwd-error" class="hidden bg-red-100 text-red-600 text-xs font-bold p-3 rounded-lg mb-4"></div>
                <div class="space-y-4">
                    <div>
                        <label class="block text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">New Password</label>
                        <input type="password" id="new-pwd" class="w-full border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm focus:ring-blue-500" minlength="8">
                    </div>
                    <div>
                        <label class="block text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Confirm Password</label>
                        <input type="password" id="confirm-pwd" class="w-full border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm focus:ring-blue-500" minlength="8">
                    </div>
                    <button id="submit-pwd-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl transition shadow-lg mt-2">
                        Update Secure Password
                    </button>
                    ${isMandatory ? '<button id="logout-pwd-btn" class="w-full text-slate-400 hover:text-slate-600 text-xs font-bold underline mt-4 block text-center">Logout Instead</button>' : ''}
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    if (!isMandatory) {
        document.getElementById('close-pwd-modal').onclick = () => document.getElementById('password-update-modal').remove();
    } else {
        document.getElementById('logout-pwd-btn').onclick = async () => {
            await signOut();
            window.location.href = "../../index.html";
        };
    }

    document.getElementById('submit-pwd-btn').onclick = async () => {
        const p1 = document.getElementById('new-pwd').value;
        const p2 = document.getElementById('confirm-pwd').value;
        const errorBox = document.getElementById('pwd-error');
        const btn = document.getElementById('submit-pwd-btn');

        if (p1.length < 8) {
            errorBox.textContent = "Password must be at least 8 characters.";
            errorBox.classList.remove('hidden');
            return;
        }

        if (p1 !== p2) {
            errorBox.textContent = "Passwords do not match.";
            errorBox.classList.remove('hidden');
            return;
        }

        errorBox.classList.add('hidden');
        btn.disabled = true;
        btn.textContent = "Updating...";

        try {
            const { db } = await getInitializedClients();

            // 1. Update Firebase Auth Password
            await updatePassword(user, p1);

            // 2. Update Firestore Document with new rotation timestamp
            await updateDoc(doc(db, "users", profile.uid), {
                lastPasswordChangeDate: serverTimestamp()
            });

            document.getElementById('password-update-modal').remove();

            if (isMandatory) {
                // Now they can access the app
                profile.lastPasswordChangeDate = new Date(); // Mock locally
                revealApp(profile);
            } else {
                alert("Password updated successfully!");
                // Remove warning bar
                const bar = document.querySelector('.bg-yellow-500');
                if (bar) bar.remove();
            }

        } catch (err) {
            console.error(err);
            if (err.code === 'auth/requires-recent-login') {
                errorBox.textContent = "Security timeout. Please logout and log back in to change your password.";
            } else {
                errorBox.textContent = err.message;
            }
            errorBox.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = "Update Secure Password";
        }
    };
}
  
function revealApp(profile) {  
    console.log("Guard: Access Granted", profile);  
    window.userProfile = profile;  
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
