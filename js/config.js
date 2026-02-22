// js/config.js
// Optimized: Lazy-loads heavy libraries to fix initial quiz latency

// We only keep the absolute essentials for the first paint
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js"; //
import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDB = null; //
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
          if (firebaseApp && firebaseDB && supabase) {
            return { auth: firebaseAuth, db: firebaseDB, supabase };
          }

          const cfg = window.__firebase_config;
          if (!cfg?.apiKey) throw new Error("Firebase config missing"); //

          // Initialize Core Firebase (Fast)
          firebaseApp = initializeApp(cfg); //
          firebaseAuth = getAuth(firebaseApp); //

          // Initialize Firestore - Required for Admin Panel and User Access
          firebaseDB = getFirestore(firebaseApp);

          // Initialize Supabase (Essential for fetching questions)
          supabase = createSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
            auth: { persistSession: false }
          }); //

          window.supabase = supabase; //

          return { auth: firebaseAuth, db: firebaseDB, supabase };
      } catch (e) {
          console.error("Critical Initialization Error:", e);
          // Return null clients instead of crashing destructuring
          return { auth: null, db: null, supabase: null };
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
  return { auth: firebaseAuth, db: firebaseDB, supabase }; //
}

export function getAuthUser() {
  return firebaseAuth?.currentUser || null; //
}

/**
 * Optimized Analytics: Only loads the library when the first event is logged
 */
export async function logAnalyticsEvent(evt, data = {}) {
  const cfg = window.__firebase_config;
  if (!cfg?.measurementId) return; //

  try {
    if (!analyticsInstance) {
      const { getAnalytics, logEvent } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js");
      analyticsInstance = getAnalytics(firebaseApp); //
      logEvent(analyticsInstance, evt, data); //
    } else {
      const { logEvent } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js");
      logEvent(analyticsInstance, evt, data); //
    }
  } catch (e) {
    console.warn("Analytics blocked or failed"); //
  }
}
