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
  serverTimestamp
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

      await setDoc(ref, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        paidClasses: {
          "6": false, "7": false, "8": false,
          "9": false, "10": false, "11": false, "12": false
        },
        streams: "",
        role: isAdmin ? "admin" : "student",
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
    ensureUserInFirestore(res.user);
    return res.user;
  } catch (e) {
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
