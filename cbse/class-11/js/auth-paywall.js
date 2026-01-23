/**
 * template/js/auth-paywall.js
 * FINAL FIX: Mandatory Google Auth with browser-safe popup enforcement
 * Rule: Google popup is triggered ONLY from a user gesture.
 */

import { initializeServices, getInitializedClients } from "./config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const LOG = "[AUTH]";
const ADMIN_EMAILS = ["keshav.karn@gmail.com", "ready4urexam@gmail.com"];

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

/* ============================================================================
   BACKGROUND USER SYNC (NON-BLOCKING)
   ============================================================================ */
export async function ensureUserInFirestore(user) {
  if (!user?.uid) return;

  const { db } = getInitializedClients();
  const ref = doc(db, "users", user.uid);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const emailLower = (user.email || "").toLowerCase();
      const isAdmin = ADMIN_EMAILS.includes(emailLower);

      // Check Whitelist/Pre-approval
      let role = isAdmin ? "admin" : "student";
      let section = "";
      let additionalClasses = {};

      try {
        const whitelistRef = doc(db, "whitelist", emailLower);
        const whitelistSnap = await getDoc(whitelistRef);
        if (whitelistSnap.exists()) {
            const wd = whitelistSnap.data();
            if (wd.role) role = wd.role;
            if (wd.section) section = wd.section;
            if (wd.allowedClasses) {
                wd.allowedClasses.forEach(c => additionalClasses[c] = true);
            }
        }
      } catch (err) {
        console.warn("Whitelist check failed", err);
      }

      await setDoc(ref, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        paidClasses: {
          "6": false, "7": false, "8": false,
          "9": false, "10": false, "11": false, "12": false,
          ...additionalClasses
        },
        streams: "",
        role: role,
        section: section,
        signupDate: serverTimestamp()
      });
    }
  } catch (e) {
    console.warn(LOG, "Firestore sync deferred.", e);
  }
}

/* ============================================================================
   AUTH STATE LISTENER (PASSIVE ONLY — NO POPUPS HERE)
   ============================================================================ */
export async function initializeAuthListener(onReady) {
  await initializeServices();
  const { auth } = getInitializedClients();

  await setPersistence(auth, browserLocalPersistence).catch(() => {});

  onAuthStateChanged(auth, (user) => {
    console.log(LOG, "State →", user ? user.email : "Signed OUT");

    if (user) {
      ensureUserInFirestore(user);
    }

    if (onReady) onReady(user);
  });
}

/* ============================================================================
   HARD AUTH GATE — MUST BE CALLED FROM A USER CLICK
   ============================================================================ */
export async function requireAuth() {
  await initializeServices();
  const { auth } = getInitializedClients();

  if (auth.currentUser) {
    return auth.currentUser;
  }

  try {
    const res = await signInWithPopup(auth, provider);
    // This ensures the user is saved to Firestore immediately after popup closes
    await ensureUserInFirestore(res.user); 
    return res.user;
  } 
  
  catch (e) {
    console.error(LOG, "Login failed:", e.code, e.message);

    if (e.code === "auth/popup-blocked") {
      alert("Please allow pop-ups to continue.");
    } else {
      alert("Google login failed. Please try again.");
    }
    throw e;
  }
}

/* ============================================================================
   RBAC & ADMIN HELPERS
   ============================================================================ */
export async function getUserRole() {
  const { auth, db } = getInitializedClients();
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
        const data = snap.data();
        // Master override
        if (ADMIN_EMAILS.includes(user.email.toLowerCase())) return "admin";
        return data.role || "student";
    }
  } catch (e) {
    console.error("Error fetching user role:", e);
  }
  return "student";
}

export async function checkRole(requiredRole) {
    const role = await getUserRole();
    if (role === "admin") return true; // Admin has access to everything
    return role === requiredRole;
}

/**
 * Bulk Onboarding via CSV
 * Format: Email, Role, Section, AllowedClass
 */
export async function bulkOnboarding(csvData) {
    const { db } = getInitializedClients();
    const lines = csvData.trim().split('\n');
    const batch = writeBatch(db);
    let count = 0;

    for (let line of lines) {
        const [email, role, section, cls] = line.split(',').map(s => s.trim());
        if (!email) continue;

        const emailLower = email.toLowerCase();
        const docRef = doc(db, "whitelist", emailLower);

        batch.set(docRef, {
            email: emailLower,
            role: role || "student",
            section: section || "",
            allowedClasses: cls ? [cls] : [],
            updatedAt: serverTimestamp()
        }, { merge: true });

        count++;
        // Batches are limited to 500
        if (count >= 400) {
            await batch.commit();
            count = 0;
        }
    }

    if (count > 0) await batch.commit();
    return true;
}

/**
 * Revoke Access
 */
export async function revokeAccess(email) {
    const { db } = getInitializedClients();
    const emailLower = email.toLowerCase();

    // 1. Remove from whitelist
    await setDoc(doc(db, "whitelist", emailLower), {
        role: "suspended",
        updatedAt: serverTimestamp()
    }, { merge: true });

    // 2. Try to find active user and lock them
    const q = query(collection(db, "users"), where("email", "==", emailLower));
    const snaps = await getDocs(q);

    snaps.forEach(async (snap) => {
        await updateDoc(snap.ref, {
            role: "suspended",
            paidClasses: {}
        });
    });
}

/* ============================================================================
   OPTIONAL HELPERS
   ============================================================================ */
export const signOut = async () => {
  const { auth } = getInitializedClients();
  return firebaseSignOut(auth);
};

export const checkAccess = () => {
  try {
    const { auth } = getInitializedClients();
    return !!auth.currentUser;
  } catch {
    return false;
  }
};
