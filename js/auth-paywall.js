import { initializeServices, getInitializedClients } from "./config.js";
import { signInAnonymously, onAuthStateChanged, setPersistence, browserSessionPersistence, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const LOG = "[AUTH]";

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
    await initializeServices();
    const { auth, db } = getInitializedClients();

    const userProfile = CREDENTIALS[username];
    if (!userProfile) throw new Error("Invalid username");
    if (userProfile.pass !== password) throw new Error("Invalid password");

    try {
        // Force session-only persistence so the user is logged out when the tab closes
        await setPersistence(auth, browserSessionPersistence);

        // 1. Establish Secure Session
        const res = await signInAnonymously(auth);
        const uid = res.user.uid;

        // 2. Bind Sovereign Identity
        const userData = {
            uid: uid,
            email: username === "keshav" ? "keshav.karn@gmail.com" : `${username}@ready4exam.com`, // Simulated email
            displayName: username,
            tenantType: userProfile.tenantType,
            tenantId: userProfile.tenantId,
            role: userProfile.role,
            school_id: userProfile.school_id || null,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            isSovereign: true
        };

        // 3. Immutable Write
        await setDoc(doc(db, "users", uid), userData);

        return userData;

    } catch (e) {
        console.error(LOG, "Auth Binding Failed", e);
        throw e;
    }
}

export async function ensureUserInFirestore(user) {
  if (!user?.uid) return null;
  const { db } = getInitializedClients();
  const ref = doc(db, "users", user.uid);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
        return null;
    } else {
        await updateDoc(ref, { lastLogin: serverTimestamp() });
        return snap.data();
    }
  } catch (e) {
    console.warn(LOG, "Sync failed", e);
    return null;
  }
}

export async function routeUser(user) {
    if (!user) return;
    const { db } = getInitializedClients();
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
        if (data.displayName === "dps.ready4exam") {
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
  await initializeServices();
  const { auth } = getInitializedClients();
  
  // Set persistence to session so auth is not remembered across browser restarts
  await setPersistence(auth, browserSessionPersistence).catch(() => {});

  onAuthStateChanged(auth, async (user) => {
    let profile = null;
    if (user) {
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
  await initializeServices();
  const { auth } = getInitializedClients();

  if (auth.currentUser) {
    if(redirect) routeUser(auth.currentUser);
    return auth.currentUser;
  }

  if (skipUI) return null;

  window.location.href = "index.html";
  throw new Error("Redirecting to Login");
}

export async function checkRole(requiredRole) {
    const { auth, db } = getInitializedClients();
    const user = auth.currentUser;
    if (!user) return false;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return false;
    const data = snap.data();
    if (data.tenantType === "owner" || data.role === "owner") return true;
    return data.role === requiredRole;
}

export const signOut = async () => {
  const { auth } = getInitializedClients();
  return firebaseSignOut(auth);
};
