// js/config.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let services = null;
let initPromise = null;

export async function initializeServices() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        let app;
        if (getApps().length > 0) {
            app = getApp();
        } else {
            app = initializeApp(window.__firebase_config);
        }

        const db = getFirestore(app);
        const auth = getAuth(app);

        // Auth Hydration Barrier
        await new Promise(resolve => {
            const unsubscribe = onAuthStateChanged(auth, () => {
                unsubscribe();
                resolve();
            });
        });

        let supabase = null;
        const supConfig = window.__supabase_config || {
            url: window.__firebase_config?.supabaseUrl,
            key: window.__firebase_config?.supabaseAnonKey
        };

        if (supConfig.url && supConfig.key) {
            supabase = createClient(supConfig.url, supConfig.key, {
                auth: { persistSession: false }
            });
            window.supabase = supabase;
        } else {
            console.warn("[Config] Supabase credentials missing. Questions service disabled.");
        }

        services = { db, auth, supabase };
        return services;
    })();

    return initPromise;
}

export async function getInitializedClients() {
    if (services) return services;
    return await initializeServices();
}

export function getAuthUser() {
    return services?.auth?.currentUser || null;
}

export async function logAnalyticsEvent(evt, data = {}) {
  console.log(`[Analytics] ${evt}`, data);
}
