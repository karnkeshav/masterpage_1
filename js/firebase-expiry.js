import { initializeServices, getInitializedClients } from "./config.js";
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Logic: Returns true ONLY if a manual expiry date exists and has passed.
 * The 15-day trial is SILENT (non-blocking).
 */
export function isSignupExpired(userData) {
  if (userData.accessExpiryDate) {
    const expiryDate = new Date(userData.accessExpiryDate);
    return Date.now() >= expiryDate.getTime();
  }
  // Silent trial: We do not return true for 15-day check here to avoid hard-blocking.
  return false;
}

/**
 * Ensures user document structure matches Admin Portal requirements.
 */
export async function ensureUserDocExists() {
  await initializeServices();
  const { auth, db } = getInitializedClients();
  const user = auth.currentUser;
  if (!user) return;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    const patch = {};
    if (!data.signupDate) patch.signupDate = serverTimestamp();
    if (!data.role) patch.role = "student";
    if (!data.paidClasses) {
      patch.paidClasses = { "6": false, "7": false, "8": false, "9": false, "10": false, "11": false, "12": false };
    }
    if (data.streams === undefined) patch.streams = "";
    if (Object.keys(patch).length) await updateDoc(ref, patch);
    return { ...data, ...patch };
  }

  const newDoc = {
    uid: user.uid,
    email: user.email,
    signupDate: serverTimestamp(),
    role: "student",
    paidClasses: { "6": false, "7": false, "8": false, "9": false, "10": false, "11": false, "12": false },
    streams: ""
  };
  await setDoc(ref, newDoc);
  return newDoc;
}

/**
 * UI Component for the Premium "Exclusive Member" Blocked Access.
 */
export function showExpiredPopup(message) {
  if (document.getElementById("r4e-expired-modal")) return;

  const wrap = document.createElement("div");
  wrap.id = "r4e-expired-modal";
  wrap.className = "fixed inset-0 flex items-center justify-center bg-slate-900/60 z-[9999] backdrop-blur-md px-4";

  wrap.innerHTML = `
    <div class="bg-white p-8 rounded-[2.5rem] max-w-sm w-full text-center shadow-2xl border-t-8 border-[#ffb703]">
      <div class="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-6">
        <span class="text-3xl">🎓</span>
      </div>
      <h2 class="text-2xl font-black text-[#1a3e6a] mb-3">Scholar Status</h2>
      <div class="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-100">
         <p class="text-slate-600 text-sm font-semibold leading-relaxed">
           ${message}
         </p>
      </div>
      <div class="space-y-3">
        <button onclick="window.open('https://wa.me/YOUR_NUMBER', '_blank')"
                class="w-full bg-[#1a3e6a] text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-800 transition-all active:scale-95">
          Upgrade Portfolio
        </button>
        <button onclick="location.href='index.html'"
                class="w-full py-2 text-slate-400 font-bold hover:text-[#1a3e6a] transition">
          Back to Dashboard
        </button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

/**
 * Core Logic: Controls access based on Class-Lock and Manual Expiry.
 * Ensures the first class clicked is "Ticked Green" in the Admin Portal.
 */
export async function checkClassAccess(classId, stream) {
  await initializeServices();
  const { auth, db } = getInitializedClients();
  const user = auth.currentUser;

  // 1. Force Authentication
  if (!user) return { allowed: false, reason: "Please sign in to continue." };

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  // Handle case where user exists in Auth but not yet in Firestore
  if (!snap.exists()) return { allowed: true };

  const data = snap.data();

  // 2. Admin Bypass: Admins have 100% access to all classes
  if (data.role === "admin") return { allowed: true };

  // 3. Identify currently "Green" (Active) classes
  const activeClasses = Object.keys(data.paidClasses || {}).filter(
    (key) => data.paidClasses[key] === true
  );

  // 4. AUTO-LOCK LOGIC:
  // If no class is ticked green yet, lock this specific class immediately.
  if (activeClasses.length === 0) {
    await updateDoc(userRef, {
      [`paidClasses.${classId}`]: true
    });
    // Return allowed so the first quiz can start immediately
    return { allowed: true };
  }

  // 5. BLOCKING LOGIC:
  // If they have a green class, but it IS NOT the one in the current URL/Slug
  if (!data.paidClasses[classId]) {
    const primaryClass = activeClasses[0];
    return {
      allowed: false,
      reason: `You are currently an **Exclusive Member** of our Class ${primaryClass} Learning Program! To expand your academic portfolio to Class ${classId}, let's get you upgraded.`
    };
  }

  // 6. MANUAL EXPIRY CHECK:
  // Only blocks if you manually set an 'accessExpiryDate' in the Admin Portal.
  if (isSignupExpired(data)) {
    return {
      allowed: false,
      reason: "Your personalized access period has concluded. Please contact your mentor to renew your scholarship."
    };
  }

  return { allowed: true };
}
