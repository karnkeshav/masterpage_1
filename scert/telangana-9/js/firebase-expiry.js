import { initializeServices, getInitializedClients } from "./config.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Helper: Creates a user profile if one doesn't exist
export async function ensureUserDocExists() {
  await initializeServices();
  const { auth, db } = getInitializedClients();
  const user = auth.currentUser;
  if (!user) return;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const newDoc = { uid: user.uid, email: user.email, signupDate: serverTimestamp(), role: "student", paidClasses: {}, streams: "" };
  await setDoc(ref, newDoc);
  return newDoc;
}

// Helper: Shows the "Access Denied" popup
export function showExpiredPopup(message = "Access Restricted") {
  if (document.getElementById("r4e-expired-modal")) return;
  const wrap = document.createElement("div");
  wrap.id = "r4e-expired-modal";
  wrap.className = "fixed inset-0 flex items-center justify-center bg-black/60 z-[9999] backdrop-blur-sm";
  wrap.innerHTML = `<div class="bg-white p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl mx-4"><div class="text-red-500 mb-4"><svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m0-8v6m-5.221 2h10.442c.566 0 1.02-.454 1.02-1.02V7.02c0-.566-.454-1.02-1.02-1.02H6.779c-.566 0-1.02.454-1.02 1.02v9.96c0 .566.454 1.02 1.02 1.02z"/></svg></div><h2 class="text-xl font-black text-slate-900 mb-2">Access Restricted</h2><p class="text-slate-500 text-sm font-medium leading-relaxed">${message}</p><button onclick="location.href='index.html'" class="mt-6 w-full bg-slate-900 text-white py-3 rounded-2xl font-bold">Back to Home</button></div>`;
  document.body.appendChild(wrap);
}

// MAIN LOGIC: The "Gatekeeper"
export async function checkClassAccess(classId, stream) {
  await initializeServices();
  const { auth, db } = getInitializedClients();
  const user = auth.currentUser;
  
  if (!user) return { allowed: false, reason: "Please sign in with Google." };

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) { try { await ensureUserDocExists(); } catch (e) {} }

  // --- TELANGANA DEMO BYPASS (The New Logic) ---
  if (classId === "TS_9") {
      const data = snap.exists() ? snap.data() : {};
      
      // 1. Silent Tracking: If they don't have the tag, give it to them.
      if (!data.paidClasses?.["TS_9"]) {
          try { await updateDoc(userRef, { "paidClasses.TS_9": true }); } 
          catch(e) { console.log("Tracking update silent fail"); }
      }
      
      // 2. Grant Access: Ignore expiry dates and class locks.
      return { allowed: true }; 
  }

  // --- STANDARD CBSE SECURITY (Old Logic Preserved) ---
  const data = snap.data() || {};
  const ADMIN_EMAILS = ["keshav.karn@gmail.com", "ready4urexam@gmail.com"];
  if (data.role === "admin" || (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase()))) return { allowed: true }; 
  if (data.accessExpiryDate && new Date() >= new Date(data.accessExpiryDate)) return { allowed: false, reason: "Access expired. Contact Admin." };

  const paidClasses = data.paidClasses || {};
  if (paidClasses[classId] === true) return { allowed: true };
  
  const lockedClasses = Object.keys(paidClasses).filter(k => paidClasses[k] === true);
  if (lockedClasses.length > 0) return { allowed: false, reason: `Locked to Class ${lockedClasses[0]}. Cannot access ${classId}.` };
  
  try { await updateDoc(userRef, { [`paidClasses.${classId}`]: true }); return { allowed: true }; } 
  catch (e) { return { allowed: false, reason: "Registration failed." }; }
}
