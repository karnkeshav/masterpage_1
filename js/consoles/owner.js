// js/consoles/owner.js — Modular Service Architecture for Owner Command Center
import { guardConsole, bindConsoleLogout } from "../guard.js";
import { getInitializedClients } from "../config.js";
import { recordFinancialEvent } from "../api.js";
import {
    collection, query, where, orderBy, onSnapshot,
    doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    getApps, initializeApp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth, createUserWithEmailAndPassword, signOut as signOutSecondary
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// LOGOUT LOGIC — use standard bindConsoleLogout for uniformity
bindConsoleLogout("logout-nav-btn", "../../index.html");

// GLOBAL GUARD — Fortress Philosophy: only "owner" role activates the console
guardConsole("owner");

// --- DATA LOADER (called by guard.js after access is granted) ---
window.loadConsoleData = async (profile) => {
    document.getElementById("user-welcome").textContent = profile.displayName || "Root Owner";
    initRealtimeStreams();
    wireProvisionForm();
};

// --- REAL-TIME STREAMS ---
async function initRealtimeStreams() {
    const { db } = await getInitializedClients();

    // STREAM 1: B2C Users — reflects registrations immediately via onSnapshot
    onSnapshot(
        query(collection(db, "users"), where("tenantType", "==", "individual")),
        (snap) => {
            const rowContainer = document.getElementById("b2c-ledger-rows");
            if (!rowContainer) return;
            rowContainer.innerHTML = "";
            snap.forEach(userDoc => renderB2CRow(userDoc.id, userDoc.data()));
            const countEl = document.getElementById("count-b2c");
            if (countEl) countEl.textContent = snap.size;
        }
    );

    // STREAM 2: Schools (B2B Infrastructure)
    onSnapshot(
        query(collection(db, "schools"), orderBy("created_at", "desc")),
        (snap) => {
            const grid = document.getElementById("school-ledger");
            if (!grid) return;
            grid.innerHTML = "";
            snap.forEach(schoolDoc => renderSchoolCard(schoolDoc.id, schoolDoc.data()));
            const countEl = document.getElementById("count-schools");
            if (countEl) countEl.textContent = snap.size;
        }
    );
}

// --- COMPONENT: B2C User Row ---
function renderB2CRow(uid, data) {
    const row = document.getElementById("b2c-ledger-rows");
    if (!row) return;
    const expiry = data.accessExpiryDate
        ? new Date(data.accessExpiryDate).toLocaleDateString()
        : "N/A";
    const initial = (data.displayName || "U").charAt(0).toUpperCase();
    const plan = data.plan || "Free Tier";
    const revenue = data.revenue || "0.00";

    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-900/30 transition";
    tr.innerHTML = `
        <td class="p-4 lg:p-6">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center font-bold text-indigo-400 flex-shrink-0">${initial}</div>
                <div class="min-w-0">
                    <div class="font-bold text-white text-sm truncate">${data.displayName || "Unnamed User"}</div>
                    <div class="text-[10px] text-slate-500 font-mono">${uid.substring(0, 10)}…</div>
                </div>
            </div>
        </td>
        <td class="p-4 lg:p-6">
            <span class="bg-slate-800 text-slate-300 px-3 py-1 rounded-lg text-[10px] font-black uppercase">${plan}</span>
        </td>
        <td class="p-4 lg:p-6 text-sm font-bold text-indigo-400">₹${revenue}</td>
        <td class="p-4 lg:p-6 text-xs text-slate-500 font-medium">${expiry}</td>
        <td class="p-4 lg:p-6">
            <button onclick="window.manageUser('${uid}')" class="w-11 h-11 bg-slate-800 hover:bg-slate-700 rounded-xl transition flex items-center justify-center" title="Manage User">
                <i class="fas fa-edit"></i>
            </button>
        </td>`;
    row.appendChild(tr);
}

// --- COMPONENT: B2B School Card ---
function renderSchoolCard(id, data) {
    const grid = document.getElementById("school-ledger");
    if (!grid) return;

    const card = document.createElement("div");
    card.className = "bg-slate-900 p-6 lg:p-8 rounded-[32px] border border-slate-800 flex flex-col items-center text-center group hover:border-indigo-500/50 transition-all duration-500";
    card.innerHTML = `
        <div class="w-16 h-16 lg:w-20 lg:h-20 bg-white rounded-full flex items-center justify-center p-3 mb-4 lg:mb-6 shadow-2xl">
            <img src="${data.logo_url || "../../images/default-school.png"}" class="object-contain w-full h-full" alt="${data.name} logo">
        </div>
        <h4 class="text-lg lg:text-xl font-black text-white group-hover:text-indigo-400 transition">${data.name}</h4>
        <p class="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">${data.board || "N/A"} · ${data.max_licenses || 0} Licenses</p>
        <div class="grid grid-cols-2 gap-3 mt-6 lg:mt-8 w-full">
            <a href="../../school-landing.html?schoolId=${id}" target="_blank"
               class="bg-white text-black py-3 lg:py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-400 transition text-center">Launch Portal</a>
            <button onclick="window.manageSchool('${id}')"
                    class="bg-slate-800 text-white py-3 lg:py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition">Configs</button>
        </div>`;
    grid.appendChild(card);
}

// --- PROVISIONING: New School Deployment ---
function generateSchoolId(name, district) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const base = (name + "-" + district + "-" + suffix)
        .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return base + ".ready4exam";
}

function wireProvisionForm() {
    const form = document.getElementById("provision-form");
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector("button[type='submit']");
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "ORCHESTRATING TENANT…";

        let secAuth = null;
        let createdUser = null;
        const tempPassword = "Ready4Exam@2026";

        try {
            const { db } = await getInitializedClients();
            const schoolName = document.getElementById("prov-name").value;
            const district = document.getElementById("prov-district").value;
            const schoolId = generateSchoolId(schoolName, district);

            // Secondary Auth instance so we don't interrupt the owner session
            let secApp = getApps().find(a => a.name === "SecondaryOnboarding");
            if (!secApp) {
                secApp = initializeApp(window.__firebase_config, "SecondaryOnboarding");
            }
            secAuth = getAuth(secApp);

            const userEmail = `ready4urexam+${schoolId}@gmail.com`;
            const cred = await createUserWithEmailAndPassword(secAuth, userEmail, tempPassword);
            createdUser = cred.user;

            // School tenant document
            const schoolData = {
                name: schoolName,
                logo_url: document.getElementById("prov-logo").value || "",
                board: document.getElementById("prov-board").value,
                max_licenses: parseInt(document.getElementById("prov-licenses").value) || 100,
                total_strength: parseInt(document.getElementById("prov-strength").value) || 0,
                state: document.getElementById("prov-state").value,
                district: district,
                area_type: document.getElementById("prov-area").value,
                principal_email: document.getElementById("prov-email").value,
                principal_phone: document.getElementById("prov-phone").value,
                created_at: serverTimestamp(),
                status: "active",
                school_id: schoolId
            };

            await setDoc(doc(db, "schools", schoolId), schoolData);

            // School Master user document
            await setDoc(doc(db, "users", createdUser.uid), {
                displayName: "School Master",
                email: userEmail,
                role: "school_master",
                tenantType: "school",
                school_id: schoolId,
                setupComplete: true,
                created_at: serverTimestamp()
            });

            await recordFinancialEvent(
                schoolId,
                "LICENSE_ACTIVATION",
                schoolData.max_licenses * 500,
                `Provisioning ${schoolData.max_licenses} licenses.`
            );

            alert(`Tenant deployed!\n\nID: ${schoolId}\nEmail: ${userEmail}\nPassword: ${tempPassword}`);
            form.reset();
            window.toggleProvisionModal(false);
        } catch (err) {
            // Self-healing: rollback orphaned Auth user if Firestore write fails
            if (createdUser) {
                try { await createdUser.delete(); } catch (_) { /* ignore */ }
            }
            alert("Deployment Error: " + err.message);
        } finally {
            if (secAuth) await signOutSecondary(secAuth);
            btn.disabled = false;
            btn.textContent = originalText;
        }
    };
}

// --- UI CONTROLLERS ---
window.switchTab = (tabId) => {
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
    const target = document.getElementById(`tab-${tabId}`);
    if (target) target.classList.remove("hidden");

    document.querySelectorAll(".nav-link").forEach(l => {
        l.classList.remove("bg-indigo-600", "text-white");
        l.classList.add("text-slate-400");
    });
    const active = document.querySelector(`.nav-link[data-tab="${tabId}"]`);
    if (active) {
        active.classList.add("bg-indigo-600", "text-white");
        active.classList.remove("text-slate-400");
    }

    const title = document.getElementById("view-title");
    if (title && active) title.textContent = active.textContent.trim();
};

window.toggleProvisionModal = (show) => {
    const modal = document.getElementById("provision-modal");
    if (modal) modal.classList.toggle("hidden", !show);
};

window.manageUser = (uid) => {
    alert(`User management for ${uid} — feature coming soon.`);
};

window.manageSchool = (id) => {
    alert(`School config for ${id} — feature coming soon.`);
};
