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

// Hardcoded Credential Map for "Sovereign Identity"
const CREDENTIALS = {
    "keshav": { pass: "keshav", role: "owner", tenantType: "owner", tenantId: "global" },
    "dps.ready4exam": { pass: "keshav", role: "admin", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student": { pass: "student", role: "student", tenantType: "individual", tenantId: "individual_b2c" },
    // Persona Entry Points (Simulated)
    "admin": { pass: "admin", role: "admin", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "principal": { pass: "principal", role: "principal", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "teacher": { pass: "teacher", role: "teacher", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student1": { pass: "student1", role: "student", tenantType: "individual", tenantId: "DPS_001", school_id: "DPS_001" },
    "parent": { pass: "parent", role: "parent", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "parent1": { pass: "parent1", role: "parent", tenantType: "individual", tenantId: "DPS_001", school_id: "DPS_001" },
    // Class Hub Personas
    "student6": { pass: "student6", role: "student", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student7": { pass: "student7", role: "student", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student8": { pass: "student8", role: "student", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student9": { pass: "student9", role: "student", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student10": { pass: "student10", role: "student", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student11": { pass: "student11", role: "student", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student12": { pass: "student12", role: "student", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" }
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
        while(auth.currentUser) { await new Promise(r => setTimeout(r, 50)); }
    }

    const userProfile = CREDENTIALS[username];
    if (!userProfile) throw new Error("Invalid username");
    if (userProfile.pass !== password) throw new Error("Invalid password");

    // NEW: Synthetic Email for Persistent Identity
    const email = `${username}@ready4exam.internal`;

    try {
        await setPersistence(auth, browserSessionPersistence);

        let userCredential;
        try {
            // 1. Attempt to sign in
            userCredential = await signInWithEmailAndPassword(auth, email, password);
        } catch (signInError) {
            // 2. If user not found, auto-provision
            if (signInError.code === 'auth/user-not-found' || signInError.code === 'auth/invalid-credential') {
                 console.log(LOG, "Auto-provisioning new user:", email);
                 userCredential = await createUserWithEmailAndPassword(auth, email, password);
                 // Update Display Name immediately
                 await updateProfile(userCredential.user, { displayName: username });
            } else {
                throw signInError;
            }
        }

        const user = userCredential.user;
        const stableUID = user.uid;

        // 3. Store stable UID in session and window
        sessionStorage.setItem('uid', stableUID);
        sessionStorage.setItem('username', username);
        window.userProfile = {
            uid: stableUID,
            displayName: username,
            role: userProfile.role,
            tenantType: userProfile.tenantType,
            tenantId: userProfile.tenantId,
            school_id: userProfile.school_id
        };

        // 4. Data Migration Hook
        if (oldUid && oldUid !== stableUID) {
            console.log(LOG, `Detected identity switch. Migrating data from ${oldUid} to ${stableUID}...`);
            await migrateAnonymousData(oldUid, stableUID);
        }

        // 5. Ensure Profile Container Exists with stable UID
        await ensureUserProfile(stableUID, username, {
            role: userProfile.role,
            tenantType: userProfile.tenantType,
            tenantId: userProfile.tenantId,
            school_id: userProfile.school_id
        });

        // 6. Blocking Wait for Firestore Consistency
        await waitForProfileReady(stableUID);

        return { uid: stableUID, displayName: username, role: userProfile.role };

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
    if (data.tenantType === "owner") {
        window.location.href = "owner-console.html";
        return;
    }

    if (data.tenantType === "school") {
        if (data.role === "admin" && data.school_id) {
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
  if (!auth) return;

  // Set persistence to session so auth is not remembered across browser restarts
  if (auth) {
      await setPersistence(auth, browserSessionPersistence).catch(() => {});
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
    if(redirect) routeUser(auth.currentUser);
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
