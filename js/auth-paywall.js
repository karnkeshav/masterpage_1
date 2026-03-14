import { initializeServices, getInitializedClients } from "./config.js";
import { ensureUserProfile, ensureUserInFirestore, waitForProfileReady, migrateAnonymousData } from "./api.js";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    onAuthStateChanged,
    setPersistence,
    browserSessionPersistence,
    signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const LOG = "[AUTH]";

// Re-export ensureUserInFirestore for backward compatibility with index.html
export { ensureUserInFirestore };

const CREDENTIALS = {
    "keshav":         { pass: "keshav",     role: "owner",         tenantType: "owner",  tenantId: "global" },
    "dps.ready4exam": { pass: "keshav",     role: "school_master", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "admin":          { pass: "Ready4Exam@2026", role: "admin",    tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" }
};

export async function authenticateWithCredentials(username, password) {
    const { auth, db } = await getInitializedClients();

    if (!auth) throw new Error("Auth not initialized");

    // 0. Clean Session Restart (Critical for Hot-Swap)
    // Capture old UID for migration before signing out
    const oldUid = sessionStorage.getItem('uid');

    if (auth.currentUser) {
        console.log(LOG, "Terminating active session...");
        await firebaseSignOut(auth);
        while (auth.currentUser) { await new Promise(r => setTimeout(r, 50)); }
    }

    // Handle Hardcoded Admin vs Dynamically Created Users
    const userProfile = CREDENTIALS[username];
    let isHardcoded = !!userProfile;
    
    // If it's a hardcoded user, verify the password immediately
    if (isHardcoded && userProfile.pass !== password) {
        throw new Error("Invalid password");
    }

    // Check for the Universal Default password for newly provisioned accounts
    // Note: firstLogin flag is set later (after successful auth) to avoid
    // duplicate flags that cause double password-change prompts.

    // Use the provided string as email if it includes '@', otherwise append synthetic domain
    const email = username.includes('@') ? username : `${username}@ready4exam.internal`;

    try {
        try {
            await setPersistence(auth, browserSessionPersistence);
        } catch (pe) {
            console.warn("Persistence not available:", pe);
        }

        let userCredential;
        try {
            // 1. Attempt to sign in with the provided password
            userCredential = await signInWithEmailAndPassword(auth, email, password);
        } catch (signInError) {
            const notFound = signInError.code === 'auth/user-not-found';
            const wrongCred = signInError.code === 'auth/invalid-credential';

            if (isHardcoded && (notFound || wrongCred)) {
                // Hardcoded user: Firebase entry might be stale (old password).
                // Force re-provision: if email exists, we cannot delete via client SDK,
                // so try create and if already-in-use, surface a clear error.
                try {
                    console.log(LOG, "Auto-provisioning hardcoded user:", email);
                    userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    await updateProfile(userCredential.user, { displayName: username });
                } catch (createError) {
                    if (createError.code === 'auth/email-already-in-use') {
                        // Firebase has the user but with a different password (stale credential).
                        // Instruct to clear via Firebase console.
                        throw new Error(
                            `Account exists with a different password. ` +
                            `Please delete user "${email}" from Firebase Authentication console and try again.`
                        );
                    }
                    throw createError;
                }
            } else if (!isHardcoded && (notFound || wrongCred)) {
                // Dynamic user (from Firebase only) — auto-provision on first login
                console.log(LOG, "Auto-provisioning dynamic user:", email);
                userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCredential.user, { displayName: username });
            } else {
                throw signInError;
            }
        }

        const user = userCredential.user;
        const stableUID = user.uid;

        // Set first login flag if default password is used by a dynamic (non-hardcoded) user.
        // Hardcoded CREDENTIALS users must NOT get the password change prompt because
        // changing their Firebase password would desync from the hardcoded password,
        // making future logins impossible.
        if (!isHardcoded && password === "Ready4Exam@2026") {
            sessionStorage.setItem('firstLogin', 'true');
        }

        // 3. Store stable UID in session and window
        sessionStorage.setItem('uid', stableUID);
        sessionStorage.setItem('username', username);

        // 4. Trigger Data Migration if an old anonymous session existed
        if (oldUid && oldUid !== stableUID) {
            console.log(LOG, "Triggering data migration from", oldUid, "to", stableUID);
            await migrateAnonymousData(oldUid, stableUID);
        }

        // 5. Ensure Profile Container Exists with stable UID (only for hardcoded)
        if (isHardcoded) {
             window.userProfile = {
                uid: stableUID,
                displayName: username,
                role: userProfile.role,
                tenantType: userProfile.tenantType,
                tenantId: userProfile.tenantId,
                school_id: userProfile.school_id
            };
            await ensureUserProfile(stableUID, username, {
                role: userProfile.role,
                tenantType: userProfile.tenantType,
                tenantId: userProfile.tenantId,
                school_id: userProfile.school_id,
                setupComplete: true
            });
            await waitForProfileReady(stableUID);
            return { uid: stableUID, displayName: username, role: userProfile.role };
        } else {
            // For dynamic users, we fetch their profile from Firestore
            const userDoc = await getDoc(doc(db, "users", stableUID));
            if (!userDoc.exists()) {
                 throw new Error("User profile not found in database.");
            }
            const data = userDoc.data();
            window.userProfile = data;
            return { uid: stableUID, displayName: data.displayName || username, role: data.role };
        }

    } catch (e) {
        console.error(LOG, "Auth Binding Failed", e);
        throw e;
    }
}

export async function routeUser(user) {
    if (!user) return;
    const { db } = await getInitializedClients();
    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists()) {
        console.warn("User authenticated but no profile found.");
        await signOut();
        return;
    }

    const data = snap.data();

    // Deterministic Routing Table
    if (data.role === "owner" || data.tenantType === "owner") {
        window.location.href = "owner-console.html";
        return;
    }

    if (data.tenantType === "school") {
        if ((data.role === "school_master" || data.role === "gateway") && data.school_id) {
            window.location.href = `school-landing.html?schoolId=${data.school_id}`;
            return;
        }
        window.location.href = `app/consoles/${data.role}.html?schoolId=${data.school_id}`;
        return;
    }

    if (data.tenantType === "individual") {
        window.location.href = "app/consoles/student.html";
        return;
    }

    await signOut();
}

/**
 * Updated to prevent automatic routing on page load.
 * Changed from browserLocalPersistence to browserSessionPersistence to force re-login.
 */
export async function initializeAuthListener(onReady) {
    const { auth } = await getInitializedClients();
    if (!auth) {
        console.error(LOG, "Auth instance missing");
        return;
    }

    // Set persistence to session so auth is not remembered across browser restarts
    try {
        await setPersistence(auth, browserSessionPersistence);
    } catch (e) {
        console.warn("Auth persistence failed:", e);
    }

    onAuthStateChanged(auth, async (user) => {
        let profile = null;
        if (user) {
            // If we have a special student login, ensure profile creation
            // We can infer credentials if they are active, but ensureUserInFirestore handles the sync.
            profile = await ensureUserInFirestore(user);

            if (profile) {
                // Inject Lens for Owner
                if (profile?.role === "owner") {
                    import("./persona-lens.js").then(m => m.initPersonaLens()).catch(e => console.log(e));
                }
                // IMPORTANT: routeUser(user) is NOT called here automatically.
                // This ensures index.html stays on the login screen even if a session exists.
            }
        }
        if (onReady) onReady(user, profile);
    });
}

export async function requireAuth(skipUI = false, redirect = false) {
    const { auth } = await getInitializedClients();

    if (auth.currentUser) {
        if (redirect) routeUser(auth.currentUser);
        return auth.currentUser;
    }

    if (skipUI) return null;

    window.location.href = "index.html";
    throw new Error("Redirecting to Login");
}

export async function checkRole(requiredRole) {
    const { auth, db } = await getInitializedClients();
    const user = auth.currentUser;
    if (!user) return false;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return false;
    const data = snap.data();
    if (data.tenantType === "owner" || data.role === "owner") return true;
    return data.role === requiredRole;
}

export const signOut = async () => {
    const { auth } = await getInitializedClients();
    return firebaseSignOut(auth);
};
