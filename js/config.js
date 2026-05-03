// js/config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initializeFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

let firebaseApp = null;
let automationApp = null;

let firebaseAuth = null;
let firebaseDB = null;         // Master DB (student progress)
let automationDB = null;       // Vault DB
let automationStorage = null;

let automationAuth = null; // ✅ ADDED

let supabase = null;
let analyticsInstance = null;

let initPromise = null;

// --- INIT ---
export async function initializeServices() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (firebaseApp && firebaseDB && supabase) {
        return getClients();
      }

      const cfg = window.__firebase_config;
      const autoCfg = window.__automation_firebase_config = {
        apiKey: "AIzaSyBibeP6f_OWGLgorKIx_1D_qXZfDKcURNM",
        authDomain: "ready4exam-automation.firebaseapp.com",
        projectId: "ready4exam-automation",
        storageBucket: "ready4exam-automation.appspot.com",
        messagingSenderId: "642756751654",
        appId: "1:642756751654:web:15a64377c207fdb5a0d1e7"
      };

      if (!cfg?.apiKey) throw new Error("Master Firebase config missing");

      // --- MASTER PROJECT (Student + Auth) ---
      firebaseApp = initializeApp(cfg);
      firebaseAuth = getAuth(firebaseApp);

      firebaseDB = initializeFirestore(firebaseApp, {
        experimentalForceLongPolling: true,
        useFetchStreams: false
      });

      if (window.__firebase_config?.enableIndexedDbPersistence || window.enableIndexedDbPersistenceFlag) {
          enableIndexedDbPersistence(firebaseDB).catch(err => {
              console.warn("Firestore IndexedDB persistence failed:", err);
          });
      }

      // --- AUTOMATION PROJECT (Vault) ---
      if (autoCfg?.apiKey) {
        automationApp = initializeApp(autoCfg, "automation");

        automationAuth = getAuth(automationApp); // ✅ ADDED

        automationDB = initializeFirestore(automationApp, {
          experimentalForceLongPolling: true,
          useFetchStreams: false
        });

        automationStorage = getStorage(automationApp);
      } else {
        console.warn("⚠️ Automation Firebase config missing");
      }

      // --- SUPABASE ---
      supabase = createSupabaseClient(
        cfg.supabaseUrl,
        cfg.supabaseAnonKey,
        { auth: { persistSession: false } }
      );

      window.supabase = supabase;

      return getClients();

    } catch (e) {
      console.error("❌ Initialization Error:", e);

      return {
        auth: null,
        db: null,
        studentDB: null,
        automationDB: null,
        storage: null,
        supabase: null
      };
    }
  })();

  return initPromise;
}

// --- GET CLIENTS ---
function getClients() {
  return {
    auth: firebaseAuth,
    automationAuth: automationAuth, // ✅ ADDED
    db: firebaseDB,
    studentDB: firebaseDB,
    automationDB: automationDB,
    storage: automationStorage,
    supabase
  };
}

export async function getInitializedClients() {
  if (!firebaseApp) {
    return await initializeServices();
  }
  return getClients();
}

// --- AUTH ---
export function getAuthUser() {
  return firebaseAuth?.currentUser || null;
}

// --- ANALYTICS (lazy) ---
export async function logAnalyticsEvent(evt, data = {}) {
  const cfg = window.__firebase_config;
  if (!cfg?.measurementId) return;

  try {
    if (!analyticsInstance) {
      const { getAnalytics, logEvent } = await import(
        "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js"
      );
      analyticsInstance = getAnalytics(firebaseApp);
      logEvent(analyticsInstance, evt, data);
    } else {
      const { logEvent } = await import(
        "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js"
      );
      logEvent(analyticsInstance, evt, data);
    }
  } catch {
    console.warn("Analytics blocked");
  }
}
