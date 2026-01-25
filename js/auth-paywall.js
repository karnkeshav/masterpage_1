import { initializeServices, getInitializedClients } from "./config.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, setPersistence, browserLocalPersistence, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const LOG = "[AUTH]";
const OWNER_EMAIL = "keshav.karn@gmail.com";
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export async function ensureUserInFirestore(user) {
  if (!user?.uid) return null;
  const { db } = getInitializedClients();
  const ref = doc(db, "users", user.uid);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const emailLower = (user.email || "").toLowerCase();
      let tenantType = "individual";
      let tenantId = null;
      let role = "student";
      let school_id = null;

      // 1. Check Owner
      if (emailLower === OWNER_EMAIL) {
          tenantType = "owner";
          role = "owner";
      } else {
          // 2. Check Whitelist
          try {
            const wRef = doc(db, "whitelist", emailLower);
            const wSnap = await getDoc(wRef);
            if (wSnap.exists()) {
                const wd = wSnap.data();
                tenantType = "school";
                role = wd.role || "student";
                school_id = wd.schoolId || null; // Match 'schoolId' field in whitelist
                tenantId = school_id;
            }
          } catch (e) { console.warn("Whitelist check failed", e); }
      }

      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        tenantType,
        tenantId,
        school_id,
        role,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      };

      await setDoc(ref, userData);
      return userData;
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
    // Re-fetch to ensure we have latest role/tenant
    const snap = await getDoc(doc(db, "users", user.uid));
    const data = snap.data();

    if (data.tenantType === "owner") {
        window.location.href = "/owner-console.html";
        return;
    }

    if (data.tenantType === "school") {
        window.location.href = `/app/consoles/${data.role}.html?schoolId=${data.school_id}`;
        return;
    }

    // Individual - Route to Student Console if role is student
    if (data.role === "student") {
        window.location.href = "/app/consoles/student.html";
        return;
    }

    // Individual - Reload to update UI or stay
    window.location.reload();
}

export async function initializeAuthListener(onReady) {
  await initializeServices();
  const { auth } = getInitializedClients();
  await setPersistence(auth, browserLocalPersistence).catch(() => {});

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const profile = await ensureUserInFirestore(user);

      // Inject Lens for Owner
      if (profile?.role === "owner" || (user.email && user.email.toLowerCase() === OWNER_EMAIL)) {
          import("./persona-lens.js").then(m => m.initPersonaLens()).catch(e => console.log(e));
      }
    }
    if (onReady) onReady(user);
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

  try {
    const res = await signInWithPopup(auth, provider);
    await ensureUserInFirestore(res.user);
    if(redirect) routeUser(res.user);
    return res.user;
  } catch (e) {
    console.error(LOG, "Login failed:", e.code, e.message);
    if (e.code === "auth/popup-blocked") alert("Please allow pop-ups.");
    throw e;
  }
}

export async function checkRole(requiredRole) {
    const { auth, db } = getInitializedClients();
    const user = auth.currentUser;
    if (!user) return false;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return false;
    const data = snap.data();
    if (data.tenantType === "owner" || data.role === "owner" || data.role === "admin") return true;
    return data.role === requiredRole;
}

export const signOut = async () => {
  const { auth } = getInitializedClients();
  return firebaseSignOut(auth);
};
