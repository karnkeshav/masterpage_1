// app/consoles/owner.js — Modular Production Architecture for Owner Command Center
import { guardConsole, bindConsoleLogout } from "../../js/guard.js";
import { getInitializedClients } from "../../js/config.js";
import { recordFinancialEvent } from "../../js/api.js";
import {
    collection, query, where, orderBy, onSnapshot, getDocs,
    doc, setDoc, updateDoc, deleteDoc, serverTimestamp, collectionGroup
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    getApps, initializeApp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut as signOutSecondary
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// ═══════════════════════════════════════════════════════
// GLOBAL STATE & CONSTANTS
// ═══════════════════════════════════════════════════════
const SESSION_START = Date.now();
const PULSE_UPDATE_INTERVAL_MS = 30000;
let b2bChart = null;
let b2cChart = null;
let schoolsCache = [];   
let b2cCache = [];       
let financialCache = []; 
let currentTab = "b2b";

// Initializing Guards
bindConsoleLogout("logout-nav-btn", "../../index.html");
guardConsole("owner");

/**
 * Data Entry Point (Called by guard.js)
 */
window.loadConsoleData = async (profile) => {
    const welcomeEl = document.getElementById("user-welcome");
    if (welcomeEl) welcomeEl.textContent = profile.displayName || "Root Owner";

    wireEventListeners();
    initSegmentedCharts();
    initRealtimeStreams();
    wireProvisionForm();
    startSystemPulse();
};

// ═══════════════════════════════════════════════════════
// REAL-TIME STREAMS (B2B & B2C Isolation)
// ═══════════════════════════════════════════════════════
async function initRealtimeStreams() {
    const { db } = await getInitializedClients();

    // STREAM 1: B2C Individual Users (Capturing Parent Linkage)
    onSnapshot(
        query(collection(db, "users"), where("tenantType", "==", "individual")),
        (snap) => {
            b2cCache = [];
            snap.forEach(userDoc => b2cCache.push({ id: userDoc.id, ...userDoc.data() }));

            const paidCount = b2cCache.filter(u => u.status === 'active').length;
            const paidEl = document.getElementById("count-b2c-paid");
            if (paidEl) paidEl.textContent = `${paidCount} paid users`;

            if (currentTab === "b2c") renderB2CTable(b2cCache);
        }
    );

    // STREAM 2: B2B Schools (Restored Detailed Mapping)
    onSnapshot(
        query(collection(db, "schools"), orderBy("created_at", "desc")),
        (snap) => {
            schoolsCache = [];
            snap.forEach(schoolDoc => schoolsCache.push({ id: schoolDoc.id, ...schoolDoc.data() }));
            
            const activeCount = schoolsCache.filter(s => s.status === "active").length;
            const activeEl = document.getElementById("count-schools-active");
            if (activeEl) activeEl.textContent = `${activeCount} manual schools`;

            if (currentTab === "b2b") renderSchoolGrid(schoolsCache);
        }
    );

    // STREAM 3: Consolidated Financial Ledger (High Integrity Split)
    onSnapshot(
        query(collectionGroup(db, "financial_events"), orderBy("timestamp", "desc")),
        (snap) => {
            financialCache = [];
            let b2bTotal = 0;
            let b2cTotal = 0;

            snap.forEach(eventDoc => {
                const data = eventDoc.data();
                const path = eventDoc.ref.path;
                
                // Identify source: standalones or specifically tagged are B2C, else B2B
                const isB2C = data.school_id === "B2C_REVENUE" || !path.includes("schools/");
                const amount = parseFloat(data.amount || 0);

                if (isB2C) b2cTotal += amount;
                else b2bTotal += amount;

                financialCache.push({ 
                    id: eventDoc.id, 
                    entity: isB2C ? "Individual B2C" : (data.school_id || "B2B"), 
                    ...data 
                });
            });

            // Update KPI Strip
            document.getElementById("count-revenue-b2b").textContent = `₹${b2bTotal.toLocaleString("en-IN")}`;
            document.getElementById("count-revenue-b2c").textContent = `₹${b2cTotal.toLocaleString("en-IN")}`;
            document.getElementById("count-revenue-total").textContent = `₹${(b2bTotal + b2cTotal).toLocaleString("en-IN")}`;
            
            renderLedgerTable(financialCache);
            updateSegmentedCharts(b2bTotal, b2cTotal);
        }
    );
}

// ═══════════════════════════════════════════════════════
// B2B PROVISIONING (Restored Fields + Manual Revenue)
// ═══════════════════════════════════════════════════════
function wireProvisionForm() {
    const form = document.getElementById("provision-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector("button[type='submit']");
        btn.disabled = true; btn.textContent = "ORCHESTRATING TENANT...";

        try {
            const { db } = await getInitializedClients();
            const schoolName = document.getElementById("prov-name").value;
            const district = document.getElementById("prov-district").value;
            const manualAmount = parseFloat(document.getElementById("prov-amount-paid").value) || 0;
            const principalEmail = document.getElementById("prov-email").value;
            
            const schoolId = (schoolName.split(' ')[0] + "-" + district + "-" + Math.floor(1000 + Math.random() * 9000)).toLowerCase().replace(/[^a-z0-9]+/g, "-");

            // 1. Auth Creation (Using Secondary Onboarding pattern)
            let secApp = getApps().find(a => a.name === "Onboard") || initializeApp(window.__firebase_config, "Onboard");
            const secAuth = getAuth(secApp);
            const cred = await createUserWithEmailAndPassword(secAuth, principalEmail, "Ready4Exam@2026");

            // 2. School Document (Capturing ALL restored fields)
            const schoolData = {
                name: schoolName,
                logo_url: document.getElementById("prov-logo").value || "",
                board: document.getElementById("prov-board").value,
                max_licenses: parseInt(document.getElementById("prov-licenses").value) || 100,
                total_strength: parseInt(document.getElementById("prov-strength").value) || 0,
                area_type: document.getElementById("prov-area").value,
                state: document.getElementById("prov-state").value,
                district: district,
                principal_email: principalEmail,
                principal_phone: document.getElementById("prov-phone").value,
                created_at: serverTimestamp(),
                status: "active",
                school_id: schoolId
            };
            await setDoc(doc(db, "schools", schoolId), schoolData);

            // 3. School Master User
            await setDoc(doc(db, "users", cred.user.uid), {
                displayName: "School Master",
                email: principalEmail,
                role: "school_master",
                tenantType: "school",
                school_id: schoolId,
                created_at: serverTimestamp()
            });

            // 4. Record the MANUAL B2B Revenue Receipt
            await recordFinancialEvent(schoolId, "LICENSE_ACTIVATION", manualAmount, `Full Provisioning Manual Pay: ${schoolName}`);

            alert(`Deployment Successful! ID: ${schoolId}`);
            toggleModal("provision-modal", false);
            form.reset();
        } catch (err) { alert("Deployment Error: " + err.message); }
        finally { btn.disabled = false; btn.textContent = "Deploy Tenant & Sync Financials"; }
    });
}

// ═══════════════════════════════════════════════════════
// USER MANAGEMENT — Sovereign B2C CRUD
// ═══════════════════════════════════════════════════════
async function handleUserFormSubmit(e) {
    e.preventDefault();
    const uid = document.getElementById("edit-user-id").value;
    const { db } = await getInitializedClients();

    const updateData = {
        displayName: document.getElementById("u-name").value.trim(),
        subscriptionTier: document.getElementById("u-plan").value,
        revenue: parseFloat(document.getElementById("u-revenue").value) || 0,
        parentEmail: document.getElementById("u-parent-email").value.trim() // CAPTURES LINKAGE
    };

    try {
        await updateDoc(doc(db, "users", uid), updateData);
        alert("Sovereign Profile Synchronized.");
        toggleModal("user-modal", false);
    } catch (err) { alert("Sync Error: " + err.message); }
}

window.openEditUserModal = (uid) => {
    const user = b2cCache.find(u => u.id === uid);
    if (!user) return;
    document.getElementById("edit-user-id").value = uid;
    document.getElementById("u-name").value = user.displayName || "";
    document.getElementById("u-plan").value = user.subscriptionTier || "practitioner";
    document.getElementById("u-revenue").value = user.revenue || 0;
    document.getElementById("u-parent-email").value = user.parentEmail || "";
    toggleModal("user-modal", true);
};

// ═══════════════════════════════════════════════════════
// SYSTEM HEALTH PULSE (Restored Heartbeat)
// ═══════════════════════════════════════════════════════
function startSystemPulse() {
    updatePulse();
    setInterval(updatePulse, PULSE_UPDATE_INTERVAL_MS);
}

function updatePulse() {
    const tsEl = document.getElementById("pulse-timestamp");
    if (tsEl) tsEl.textContent = new Date().toLocaleTimeString();

    const uptimeMs = Date.now() - SESSION_START;
    const uptimeMin = Math.floor(uptimeMs / 60000);
    const uptimeEl = document.getElementById("pulse-uptime");
    if (uptimeEl) uptimeEl.textContent = uptimeMin < 60 ? `${uptimeMin}m` : `${Math.floor(uptimeMin/60)}h ${uptimeMin%60}m`;
}

// ═══════════════════════════════════════════════════════
// UI RENDERING ENGINES (High Complexity Rows)
// ═══════════════════════════════════════════════════════
function renderB2CTable(users) {
    const tbody = document.getElementById("b2c-ledger-rows");
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-12 text-center text-slate-500 italic">No B2C users found in the registry.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => {
        // 1. Identity Logic
        const initial = (u.displayName || "U").charAt(0).toUpperCase();
        
        // 2. Crash-Proof Expiry & Status Logic
        const expiryRaw = u.accessExpiryDate;
        let expiryDisp = "N/A";
        let isActive = false;

        if (expiryRaw) {
            // Convert Firestore Timestamp or String to JS Date Object
            const dateObj = expiryRaw.toDate ? expiryRaw.toDate() : new Date(expiryRaw);
            
            if (!isNaN(dateObj.getTime())) {
                expiryDisp = dateObj.toLocaleDateString();
                // Compare with current time to determine actual status
                isActive = dateObj > new Date();
            }
        }

        // 3. Status Badge Logic (Uses time comparison instead of just a string)
        const statusBadge = isActive 
            ? '<span class="bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-black uppercase">Active</span>'
            : '<span class="bg-red-900/30 text-red-400 px-2 py-0.5 rounded text-[10px] font-black uppercase">Expired</span>';

        return `
        <tr class="hover:bg-slate-900/40 transition group">
            <td class="p-6">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center font-bold text-indigo-400">${initial}</div>
                    <div class="min-w-0">
                        <div class="font-bold text-white text-sm truncate">${escapeHtml(u.displayName || "Scholar")}</div>
                        <div class="text-[10px] text-slate-500 font-mono">S: ${escapeHtml(u.email)}</div>
                        ${u.parentEmail ? `<div class="text-[10px] text-amber-500 font-mono">P: ${escapeHtml(u.parentEmail)}</div>` : ''}
                    </div>
                </div>
            </td>
            <td class="p-6 text-[10px] font-black uppercase text-slate-400">${escapeHtml(u.subscriptionTier || 'trial')}</td>
            <td class="p-6 font-bold text-emerald-400">₹${u.revenue || 0}</td>
            <td class="p-6 text-xs text-slate-500">${expiryDisp}</td>
            <td class="p-6">${statusBadge}</td>
            <td class="p-6 text-right">
                <button onclick="openEditUserModal('${u.id}')" class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-indigo-400 hover:bg-indigo-600 hover:text-white transition">
                    <i class="fas fa-user-edit text-xs"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function renderSchoolGrid(schools) {
    const grid = document.getElementById("school-ledger");
    if (!grid) return;
    grid.innerHTML = schools.map(s => `
        <div class="bg-slate-900 border border-slate-800 p-8 rounded-[32px] hover:border-indigo-500/50 transition duration-500 group">
            <div class="flex items-center gap-5 mb-6">
                <div class="w-16 h-16 rounded-full bg-white p-2 shadow-2xl flex-shrink-0"><img src="${s.logo_url || '../../images/default-school.png'}" class="w-full h-full object-contain"></div>
                <div>
                    <h4 class="text-lg font-black text-white group-hover:text-indigo-400 transition">${escapeHtml(s.name)}</h4>
                    <p class="text-[10px] uppercase font-black text-slate-500 tracking-widest">${s.board} • ${s.district}</p>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-3 mb-6">
                <div class="bg-slate-950/50 p-4 rounded-2xl border border-white/5"><p class="text-[9px] text-slate-500 font-black mb-1">STRENGTH</p><p class="text-xl font-black text-white">${s.total_strength || 0}</p></div>
                <div class="bg-slate-950/50 p-4 rounded-2xl border border-white/5"><p class="text-[9px] text-slate-500 font-black mb-1">LICENSES</p><p class="text-xl font-black text-indigo-400">${s.max_licenses || 0}</p></div>
            </div>
            <a href="../../school-landing.html?schoolId=${s.id}" target="_blank" class="block w-full py-4 bg-white text-black text-center rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-400 hover:text-white transition shadow-lg">Launch Portal</a>
        </div>
    `).join('');
}

function renderLedgerTable(events) {
    const tbody = document.getElementById("ledger-rows");
    if (!tbody) return;
    tbody.innerHTML = events.map(e => `
        <tr class="hover:bg-slate-900/40 text-xs border-b border-white/5">
            <td class="p-6 text-slate-500 font-medium">${e.timestamp?.toDate ? e.timestamp.toDate().toLocaleDateString() : '—'}</td>
            <td class="p-6 font-bold text-white">${escapeHtml(e.entity)}</td>
            <td class="p-6"><span class="px-3 py-1 rounded-full bg-slate-800 text-[9px] font-black uppercase text-slate-400 border border-white/5">${e.type}</span></td>
            <td class="p-6 font-black text-emerald-400 text-sm">₹${e.amount?.toLocaleString()}</td>
            <td class="p-6 text-slate-500 italic">"${escapeHtml(e.details || '—')}"</td>
            <td class="p-6 text-[10px] font-mono text-slate-700">${e.id.substring(0,10)}</td>
        </tr>
    `).join('');
}

// ═══════════════════════════════════════════════════════
// PERFORMANCE CHARTS (Segmented Revenue)
// ═══════════════════════════════════════════════════════
function initSegmentedCharts() {
    const cfg = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } };
    b2bChart = new Chart(document.getElementById("b2bRevenueChart"), { type: 'line', data: { labels: ['','','','',''], datasets: [{ data: [0,0,0,0,0], borderColor: '#6366f1', fill: true, backgroundColor: 'rgba(99, 102, 241, 0.05)', tension: 0.5 }] }, options: cfg });
    b2cChart = new Chart(document.getElementById("b2cRevenueChart"), { type: 'bar', data: { labels: ['','','','',''], datasets: [{ data: [0,0,0,0,0], backgroundColor: '#34d399', borderRadius: 6 }] }, options: cfg });
}

function updateSegmentedCharts(b2b, b2c) {
    if (!b2bChart || !b2cChart) return;
    b2bChart.data.datasets[0].data = [b2b * 0.5, b2b * 0.8, b2b * 0.7, b2b * 0.9, b2b];
    b2cChart.data.datasets[0].data = [b2c * 0.3, b2c * 0.6, b2c * 0.4, b2c * 0.8, b2c];
    b2bChart.update(); b2cChart.update();
}

// ═══════════════════════════════════════════════════════
// UI ORCHESTRATION
// ═══════════════════════════════════════════════════════
function wireEventListeners() {
    document.querySelectorAll(".nav-link").forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            currentTab = tab;
            document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
            document.getElementById(`tab-${tab}`).classList.remove("hidden");
            document.querySelectorAll(".nav-link").forEach(l => l.classList.replace("bg-indigo-600", "text-slate-400"));
            btn.classList.replace("text-slate-400", "bg-indigo-600");
            btn.classList.add("text-white");
        });
    });

    document.getElementById("user-management-form")?.addEventListener("submit", handleUserFormSubmit);
    document.querySelector(".js-provision-btn")?.addEventListener("click", () => toggleModal("provision-modal", true));
    document.querySelector(".js-close-provision")?.addEventListener("click", () => toggleModal("provision-modal", false));
    document.querySelector(".js-close-user-modal")?.addEventListener("click", () => toggleModal("user-modal", false));
}

function toggleModal(id, show) { document.getElementById(id).classList.toggle("hidden", !show); }

function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}
