// js/config.js
// Optimized: Lazy-loads heavy libraries to fix initial quiz latency

// We only keep the absolute essentials for the first paint
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js"; // Added: Import Storage for PDF access

let firebaseApp = null;
let automationApp = null; // Added: Instance for the automation project
let firebaseAuth = null;
let firebaseDB = null; 
let automationDB = null; // Added: Firestore instance for the Vault
let automationStorage = null; // Added: Storage instance for PDF assets
let supabase = null;
let analyticsInstance = null;

// Singleton Promise to prevent race conditions
let initPromise = null;

/**
 * High-speed initialization.
 * Starts Auth, Firestore (for Admin/Saving), and Supabase.
 */
export async function initializeServices() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
      try {
          // If already initialized, return existing clients
          if (firebaseApp && firebaseDB && automationApp && supabase) {
            return { auth: firebaseAuth, db: firebaseDB, automationDB, storage: automationStorage, supabase };
          }

          const cfg = window.__firebase_config;
          const autoCfg = window.__automation_firebase_config; // Added: Access automation credentials
          
          if (!cfg?.apiKey) throw new Error("Master Firebase config missing");
          if (!autoCfg?.apiKey) console.warn("Automation Firebase config missing"); // Warning instead of throw to prevent total crash

          // Initialize Core Firebase (Fast) - Master Project
          firebaseApp = initializeApp(cfg); 
          firebaseAuth = getAuth(firebaseApp); 

          // Initialize Firestore - Required for Admin Panel and User Access
          firebaseDB = initializeFirestore(firebaseApp, {
            experimentalForceLongPolling: true,
            useFetchStreams: false  
          });

          // Initialize Automation Project (Named Instance) - Added logic below
          if (autoCfg?.apiKey) {
              automationApp = initializeApp(autoCfg, "automation");
              automationDB = initializeFirestore(automationApp, {
                  experimentalForceLongPolling: true,
                  useFetchStreams: false
              });
              automationStorage = getStorage(automationApp);
          }
  
          // Initialize Supabase (Essential for fetching questions)
          supabase = createSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
            auth: { persistSession: false }
          }); 

          window.supabase = supabase; 

          // Return both project instances
          return { 
              auth: firebaseAuth, 
              db: firebaseDB, 
              automationDB: automationDB, // Added
              storage: automationStorage, // Added
              supabase 
          };
      } catch (e) {
          console.error("Critical Initialization Error:", e);
          // Return null clients instead of crashing destructuring
          return { auth: null, db: null, automationDB: null, storage: null, supabase: null };
      }
  })();

  return initPromise;
}

/**
 * Returns clients. If not initialized, attempts to initialize.
 */
export async function getInitializedClients() {
  if (!firebaseApp) {
      // Auto-initialize if not ready (Robust Client Fetching)
      return await initializeServices();
  }
  return { 
      auth: firebaseAuth, 
      db: firebaseDB, 
      automationDB: automationDB, // Added
      storage: automationStorage, // Added
      supabase 
  };
}

export function getAuthUser() {
  return firebaseAuth?.currentUser || null; 
}

/**
 * Optimized Analytics: Only loads the library when the first event is logged
 */
export async function logAnalyticsEvent(evt, data = {}) {
  const cfg = window.__firebase_config;
  if (!cfg?.measurementId) return; 

  try {
    if (!analyticsInstance) {
      const { getAnalytics, logEvent } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js");
      analyticsInstance = getAnalytics(firebaseApp); 
      logEvent(analyticsInstance, evt, data); 
    } else {
      const { logEvent } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js");
      logEvent(analyticsInstance, evt, data); 
    }
  } catch (e) {
    console.warn("Analytics blocked or failed"); 
  }
}
