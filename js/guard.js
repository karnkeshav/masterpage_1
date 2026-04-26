// js/guard.js  
import { initializeAuthListener, ensureUserInFirestore, signOut } from "./auth-paywall.js";  
import { getInitializedClients } from "./config.js";  
  
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
  




        // First-Login Reset Handshake
        const skipResetRoles = ['owner', 'school_master'];
        const skipEmails = ['admin@ready4exam.internal', 'keshav@ready4exam.internal'];

        if (!skipResetRoles.includes(profile.role) && !skipEmails.includes(user.email)) {
            if (profile.isFirstLogin === true || profile.setupComplete === false) {
                // Trigger Sovereign Password Reset Modal
                console.log("Guard: Enforcing First-Login Reset Handshake.");
                if (window.triggerPasswordResetModal) {
                    window.triggerPasswordResetModal(user.email);
                } else {
                    // Fallback injection if not defined
                    const modalHtml = `
                    <div id="sovereign-reset-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                        <div class="bg-white p-6 rounded-2xl max-w-sm w-full text-center shadow-2xl">
                            <h2 class="text-xl font-black text-slate-800 mb-2">Security Handshake</h2>
                            <p class="text-sm text-slate-500 mb-4">Please set your permanent password before accessing the console.</p>
                            <button id="trigger-reset-btn" class="w-full bg-cbse-blue text-white font-bold py-2 rounded-xl mb-2">Send Reset Link</button>
                            <button id="logout-reset-btn" class="w-full bg-slate-100 text-slate-600 font-bold py-2 rounded-xl">Logout</button>
                        </div>
                    </div>`;
                    document.body.insertAdjacentHTML('beforeend', modalHtml);
                    document.getElementById('trigger-reset-btn').onclick = async () => {
                        try {
                            const { getAuth, sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
                            await sendPasswordResetEmail(getAuth(), user.email);
                            alert('Password reset email sent! Please check your inbox, update your password, and log in again.');
                            await signOut();
                            window.location.href = "../../index.html";
                        } catch(e) {
                            alert('Error sending email: ' + e.message);
                        }
                    };
                    document.getElementById('logout-reset-btn').onclick = async () => {
                        await signOut();
                        window.location.href = "../../index.html";
                    };
                }
                return; // Stop revealApp until reset
            }
        }

        // Access Granted


        revealApp(profile);  
    });  
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
