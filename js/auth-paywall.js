import { initializeServices, getInitializedClients } from "./config.js";
import { ensureUserProfile, waitForProfileReady, migrateAnonymousData } from "./api.js";
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

/* ----------------------------------------------------
   HARD CODED CREDENTIAL MAP (SCHOOL IDENTITY SYSTEM)
---------------------------------------------------- */
const CREDENTIALS = {
    "keshav": { pass: "keshav", role: "owner", tenantType: "owner", tenantId: "global" },
    "dps.ready4exam": { pass: "keshav", role: "admin", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student": { pass: "student", role: "student", tenantType: "individual", tenantId: "individual_b2c" },

    "admin": { pass: "admin", role: "admin", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "principal": { pass: "principal", role: "principal", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "teacher": { pass: "teacher", role: "teacher", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },

    "student6": { pass: "student6", role: "student", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student7": { pass: "student7", role: "student", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student8": { pass: "student8", role: "student", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student9": { pass: "student9", role: "student", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" },
    "student10": { pass: "student10", role: "student", tenantType: "school", tenantId: "DPS_001", school_id: "DPS_001" }
};

export async function authenticateWithCredentials(username, password) {

    const { auth } = await getInitializedClients();
    if (!auth) throw new Error("Auth not initialized");

    // 0. Clean Session Restart (Critical for Hot-Swap)
    // Capture old UID for migration before signing out
    const oldUid = sessionStorage.getItem('uid');

    if (auth.currentUser) {
        console.log(LOG, "Terminating active session...");
        await firebaseSignOut(auth);
        while(auth.currentUser) { await new Promise(r => setTimeout(r, 50)); }
    }

    const profile = CREDENTIALS[username];
    if (!profile) throw new Error("Invalid ID or Passkey");
    if (profile.pass !== password) throw new Error("Invalid ID or Passkey");

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
            uid: firebaseUID,
            stableUID,
            displayName: username,
            role: profile.role,
            tenantType: profile.tenantType,
            tenantId: profile.tenantId,
            school_id: profile.school_id
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

        return { uid: firebaseUID, role: profile.role };

    } catch (e) {
        console.error(LOG, "Auth Binding Failed", e);
        throw e;
    }
}

/* ----------------------------------------------------
   SESSION LISTENER
---------------------------------------------------- */
export async function initializeAuthListener(onReady) {
    const { auth } = await getInitializedClients();
    if (!auth) return;

    await setPersistence(auth, browserSessionPersistence).catch(()=>{});

    onAuthStateChanged(auth, async (user) => {
        if (!user) return onReady?.(null, null);

        const { db } = await getInitializedClients();
        const snap = await getDoc(doc(db, "users", user.uid));

        if (!snap.exists()) return onReady?.(user, null);

        const data = snap.data();

        window.userProfile = { uid: user.uid, ...data };

        onReady?.(user, data);
    });
}

/* ----------------------------------------------------
   ROLE ROUTING
---------------------------------------------------- */
export async function routeUser(user) {

    const { db } = await getInitializedClients();
    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists()) return signOut();

    const data = snap.data();

    if (data.tenantType === "owner")
        return window.location.href = "owner-console.html";

    if (data.tenantType === "school") {
        if (data.role === "admin")
            return window.location.href = `school-landing.html?schoolId=${data.school_id}`;

        return window.location.href = `app/consoles/${data.role}.html?schoolId=${data.school_id}`;
    }

    if (data.tenantType === "individual")
        return window.location.href = "app/consoles/student.html";
}

/* ----------------------------------------------------
   HELPERS
---------------------------------------------------- */
export async function requireAuth() {
    const { auth } = await getInitializedClients();
    if (!auth.currentUser) {
        window.location.href = "index.html";
        throw new Error("Redirect login");
    }
    return auth.currentUser;
}

export const signOut = async () => {
    const { auth } = await getInitializedClients();
    sessionStorage.clear();
    return firebaseSignOut(auth);
};
