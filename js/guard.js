import { initializeAuthListener, ensureUserInFirestore, signOut } from "./auth-paywall.js";
import { getInitializedClients } from "./config.js";

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

    initializeAuthListener(async (user) => {
        if (!user) {
            console.warn("Guard: No user session.");
            window.location.href = "../../index.html";
            return;
        }

        const profile = await ensureUserInFirestore(user);

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

        // Access Granted
        revealApp(profile);
    });
}

function revealApp(profile) {
    console.log("Guard: Access Granted", profile);
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
