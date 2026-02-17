// js/config.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let db, auth, supabase, initPromise = null;

export async function initializeServices() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        let app;
        if (getApps().length > 0) {
            app = getApp();
        } else {
            app = initializeApp(window.__firebase_config);
        }

        db = getFirestore(app);
        auth = getAuth(app);

        // Supabase
        if (window.__supabase_config) {
            supabase = createClient(window.__supabase_config.url, window.__supabase_config.key, {
                auth: { persistSession: false }
            });
            window.supabase = supabase;
        }
        return { db, auth, supabase };
    })();

    return initPromise;
}

export async function getInitializedClients() {
    await initializeServices();
    return { db, auth, supabase };
}

export function getAuthUser() {
    return auth?.currentUser || null;
}

export async function logAnalyticsEvent(evt, data = {}) {
  // Keeping simplified analytics wrapper
  console.log(`[Analytics] ${evt}`, data);
}

export { db, auth, supabase };
