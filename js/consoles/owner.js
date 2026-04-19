// js/consoles/owner.js — Modular Service Architecture for Owner Command Center
import { guardConsole, bindConsoleLogout } from "../guard.js";
import { getInitializedClients } from "../config.js";
import { recordFinancialEvent } from "../api.js";
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
// CONSTANTS & STATE
// ═══════════════════════════════════════════════════════
const SESSION_START = Date.now();
const DEFAULT_B2C_PLAN_PRICE = 499;
const PULSE_UPDATE_INTERVAL_MS = 30000;
let revenueChart = null;
let schoolsCache = [];   // cached school snapshots for search
let b2cCache = [];       // cached B2C user snapshots for search
let financialCache = []; // cached financial events for filtering
let currentTab = "b2b";

// ═══════════════════════════════════════════════════════
// LOGOUT & GUARD
// ═══════════════════════════════════════════════════════
bindConsoleLogout("logout-nav-btn", "../../index.html");
guardConsole("owner");

// ═══════════════════════════════════════════════════════
// DATA LOADER (called by guard.js after access is granted)
// ═══════════════════════════════════════════════════════
window.loadConsoleData = async (profile) => {
    const welcomeEl = document.getElementById("user-welcome");
    if (welcomeEl) welcomeEl.textContent = profile.displayName || "Root Owner";

    wireEventListeners();
    initRevenueChart();
    initRealtimeStreams();
    wireProvisionForm();
    startSystemPulse();
};

// ═══════════════════════════════════════════════════════
// EVENT LISTENERS — No inline onclick handlers
// ═══════════════════════════════════════════════════════
function wireEventListeners() {
    // Tab navigation
    document.querySelectorAll(".nav-link[data-tab]").forEach(btn => {
        btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    // Provision modal open
    document.querySelectorAll(".js-provision-btn").forEach(btn => {
        btn.addEventListener("click", () => toggleProvisionModal(true));
    });

    // Provision modal close
    document.querySelectorAll(".js-close-provision").forEach(btn => {
        btn.addEventListener("click", () => toggleProvisionModal(false));
    });

    // School config modal close
    document.querySelectorAll(".js-close-school-config").forEach(btn => {
        btn.addEventListener("click", () => toggleSchoolConfigModal(false));
    });

    // Search input
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", () => handleSearch(searchInput.value));
    }

    // Financial ledger filters
    const schoolFilter = document.getElementById("ledger-filter-school");
    const typeFilter = document.getElementById("ledger-filter-type");
    if (schoolFilter) schoolFilter.addEventListener("change", renderFilteredLedger);
    if (typeFilter) typeFilter.addEventListener("change", renderFilteredLedger);

    // B2C User Management: Add User button
    document.querySelectorAll(".js-add-b2c-user").forEach(btn => {
        btn.addEventListener("click", () => openAddUserModal());
    });

    // User modal close
    document.querySelectorAll(".js-close-user-modal").forEach(btn => {
        btn.addEventListener("click", () => toggleUserModal(false));
    });

    // User modal form submit
    const userForm = document.getElementById("user-management-form");
    if (userForm) userForm.addEventListener("submit", handleUserFormSubmit);

    // Delete user button
    const deleteBtn = document.getElementById("delete-user-btn");
    if (deleteBtn) deleteBtn.addEventListener("click", confirmDeleteUser);

    // Generate random password
    document.querySelectorAll(".js-gen-pass").forEach(btn => {
        btn.addEventListener("click", generateRandomPass);
    });

    // Toggle password visibility
    document.querySelectorAll(".js-toggle-pass").forEach(btn => {
        btn.addEventListener("click", () => {
            const passInput = document.getElementById("u-pass");
            if (!passInput) return;
            const isHidden = passInput.type === "password";
            passInput.type = isHidden ? "text" : "password";
            const icon = btn.querySelector("i");
            if (icon) {
                icon.className = isHidden ? "fas fa-eye-slash" : "fas fa-eye";
            }
        });
    });
}

// ═══════════════════════════════════════════════════════
// REVENUE CHART (Chart.js)
// ═══════════════════════════════════════════════════════
function initRevenueChart() {
    const ctx = document.getElementById("revenueChart");
    if (!ctx) return;

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentMonth = new Date().getMonth();
    const labels = months.slice(0, currentMonth + 1);

    revenueChart = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "B2B Revenue",
                    data: new Array(labels.length).fill(0),
                    borderColor: "#6366f1",
                    backgroundColor: "rgba(99, 102, 241, 0.1)",
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: "#6366f1"
                },
                {
                    label: "B2C Revenue",
                    data: new Array(labels.length).fill(0),
                    borderColor: "#34d399",
                    backgroundColor: "rgba(52, 211, 153, 0.1)",
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: "#34d399"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString("en-IN")}`
                    }
                }
            },
            scales: {
                x: { ticks: { color: "#64748b", font: { size: 10, weight: "bold" } }, grid: { display: false } },
                y: {
                    ticks: {
                        color: "#64748b",
                        font: { size: 10 },
                        callback: (v) => "₹" + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)
                    },
                    grid: { color: "rgba(100, 116, 139, 0.1)" }
                }
            }
        }
    });
}

// ═══════════════════════════════════════════════════════
// REAL-TIME STREAMS
// ═══════════════════════════════════════════════════════
async function initRealtimeStreams() {
    const { db } = await getInitializedClients();

    // STREAM 1: B2C Users
    onSnapshot(
        query(collection(db, "users"), where("tenantType", "==", "individual")),
        (snap) => {
            b2cCache = [];
            snap.forEach(userDoc => b2cCache.push({ id: userDoc.id, ...userDoc.data() }));

            const countEl = document.getElementById("count-b2c");
            if (countEl) countEl.textContent = snap.size;

            // Count paid users
            const paidCount = b2cCache.filter(u => {
                const tier = u.subscriptionTier || u.plan || "";
                return tier && tier !== "Free Tier" && tier !== "free" && tier !== "trial";
            }).length;
            const paidEl = document.getElementById("count-b2c-paid");
            if (paidEl) paidEl.textContent = `${paidCount} paid`;

            renderB2CTable(b2cCache);
            updateRevenueChart();
        }
    );

    // STREAM 2: Schools (B2B)
    onSnapshot(
        query(collection(db, "schools"), orderBy("created_at", "desc")),
        (snap) => {
            schoolsCache = [];
            snap.forEach(schoolDoc => schoolsCache.push({ id: schoolDoc.id, ...schoolDoc.data() }));

            const countEl = document.getElementById("count-schools");
            if (countEl) countEl.textContent = snap.size;

            // Count active schools
            const activeCount = schoolsCache.filter(s => s.status === "active").length;
            const activeEl = document.getElementById("count-schools-active");
            if (activeEl) activeEl.textContent = `${activeCount} active`;

            // Update utilization
            updateUtilization();

            // Populate ledger school filter dropdown
            populateSchoolFilter();

            renderSchoolGrid(schoolsCache);
        }
    );

    // STREAM 3: Financial Events (collectionGroup across all schools)
    onSnapshot(
        query(collectionGroup(db, "financial_events"), orderBy("timestamp", "desc")),
        (snap) => {
            financialCache = [];
            let totalRevenue = 0;
            snap.forEach(eventDoc => {
                const data = eventDoc.data();
                // Extract school ID from the document path: schools/{schoolId}/financial_events/{eventId}
                const pathSegments = eventDoc.ref.path.split("/");
                const schoolId = (pathSegments.length >= 4 && pathSegments[0] === "schools") ? pathSegments[1] : "unknown";
                financialCache.push({ id: eventDoc.id, schoolId, ...data });
                totalRevenue += data.amount || 0;
            });

            // Update revenue KPI
            const revEl = document.getElementById("count-revenue");
            if (revEl) revEl.textContent = `₹${totalRevenue.toLocaleString("en-IN")}`;
            const trendEl = document.getElementById("revenue-trend");
            if (trendEl) trendEl.textContent = `${financialCache.length} transactions`;

            renderFilteredLedger();
            updateRevenueChart();
        }
    );
}

// ═══════════════════════════════════════════════════════
// CHART UPDATE
// ═══════════════════════════════════════════════════════
function updateRevenueChart() {
    if (!revenueChart) return;

    const b2bByMonth = new Array(12).fill(0);
    const b2cByMonth = new Array(12).fill(0);

    financialCache.forEach(evt => {
        const ts = evt.timestamp?.toDate ? evt.timestamp.toDate() : null;
        if (!ts) return;
        const month = ts.getMonth();
        b2bByMonth[month] += evt.amount || 0;
    });

    // Estimate B2C revenue from paid users
    b2cCache.forEach(u => {
        const tier = u.subscriptionTier || u.plan || "";
        if (tier && tier !== "Free Tier" && tier !== "free" && tier !== "trial") {
            const created = u.createdAt?.toDate ? u.createdAt.toDate() : (u.created_at?.toDate ? u.created_at.toDate() : new Date());
            b2cByMonth[created.getMonth()] += parseFloat(String(u.revenue).replace(/[^0-9.]/g, "")) || DEFAULT_B2C_PLAN_PRICE;
        }
    });

    const currentMonth = new Date().getMonth();
    revenueChart.data.datasets[0].data = b2bByMonth.slice(0, currentMonth + 1);
    revenueChart.data.datasets[1].data = b2cByMonth.slice(0, currentMonth + 1);
    revenueChart.update();
}

// ═══════════════════════════════════════════════════════
// UTILIZATION TRACKER
// ═══════════════════════════════════════════════════════
function updateUtilization() {
    let totalLicenses = 0;
    let totalStrength = 0;
    schoolsCache.forEach(s => {
        totalLicenses += s.max_licenses || 0;
        totalStrength += s.total_strength || 0;
    });
    const pct = totalLicenses > 0 ? Math.min(100, Math.round((totalStrength / totalLicenses) * 100)) : 0;
    const utilEl = document.getElementById("count-utilization");
    if (utilEl) utilEl.textContent = `${pct}%`;
    const barEl = document.getElementById("utilization-bar");
    if (barEl) barEl.style.width = `${pct}%`;
}

// ═══════════════════════════════════════════════════════
// SCHOOL FILTER DROPDOWN
// ═══════════════════════════════════════════════════════
function populateSchoolFilter() {
    const select = document.getElementById("ledger-filter-school");
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">All Schools</option>';
    schoolsCache.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name || s.id;
        select.appendChild(opt);
    });
    select.value = currentValue;
}

// ═══════════════════════════════════════════════════════
// B2C TABLE RENDERER
// ═══════════════════════════════════════════════════════
function renderB2CTable(users) {
    const row = document.getElementById("b2c-ledger-rows");
    if (!row) return;
    row.innerHTML = "";
    if (users.length === 0) {
        row.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 text-sm">No B2C users found.</td></tr>';
        return;
    }
    users.forEach(data => renderB2CRow(data.id || data.uid, data));
}

function renderB2CRow(uid, data) {
    const row = document.getElementById("b2c-ledger-rows");
    if (!row) return;
    const expiry = data.accessExpiryDate
        ? new Date(data.accessExpiryDate).toLocaleDateString()
        : "N/A";
    const displayName = data.displayName || "Unnamed User";
    const initial = displayName.charAt(0).toUpperCase();
    const plan = data.subscriptionTier || data.plan || "Free Tier";
    const revenue = data.revenue || "0.00";
    const isActive = !data.accessExpiryDate || new Date(data.accessExpiryDate) > new Date();
    const statusBadge = isActive
        ? '<span class="bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-black uppercase">Active</span>'
        : '<span class="bg-red-900/30 text-red-400 px-2 py-0.5 rounded text-[10px] font-black uppercase">Expired</span>';

    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-900/30 transition group";
    tr.innerHTML = `
        <td class="p-4 lg:p-6">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center font-bold text-indigo-400 flex-shrink-0">${initial}</div>
                <div class="min-w-0">
                    <div class="font-bold text-white text-sm truncate">${escapeHtml(displayName)}</div>
                    <div class="text-[10px] text-slate-500 font-mono">${escapeHtml(data.email || uid)}</div>
                </div>
            </div>
        </td>
        <td class="p-4 lg:p-6">
            <span class="bg-slate-800 text-slate-300 px-3 py-1 rounded-lg text-[10px] font-black uppercase">${escapeHtml(plan)}</span>
        </td>
        <td class="p-4 lg:p-6 text-sm font-bold text-indigo-400">₹${escapeHtml(String(revenue))}</td>
        <td class="p-4 lg:p-6 text-xs text-slate-500 font-medium">${expiry}</td>
        <td class="p-4 lg:p-6">${statusBadge}</td>
        <td class="p-4 lg:p-6">
            <div class="flex gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button class="js-edit-user w-11 h-11 bg-slate-800 hover:bg-indigo-600 rounded-xl transition flex items-center justify-center" title="Edit User" aria-label="Edit user">
                    <i class="fas fa-user-edit text-xs" aria-hidden="true"></i>
                </button>
                <button class="js-reset-pass w-11 h-11 bg-slate-800 hover:bg-amber-600 rounded-xl transition flex items-center justify-center" title="Reset Password" aria-label="Reset password">
                    <i class="fas fa-key text-xs" aria-hidden="true"></i>
                </button>
            </div>
        </td>`;
    tr.querySelector(".js-edit-user").addEventListener("click", () => openEditUserModal(uid));
    tr.querySelector(".js-reset-pass").addEventListener("click", () => triggerResetPassword(uid));
    row.appendChild(tr);
}

// ═══════════════════════════════════════════════════════
// SCHOOL CARD RENDERER
// ═══════════════════════════════════════════════════════
function renderSchoolGrid(schools) {
    const grid = document.getElementById("school-ledger");
    if (!grid) return;
    grid.innerHTML = "";
    if (schools.length === 0) {
        grid.innerHTML = '<div class="col-span-full p-12 text-center text-slate-500 text-sm">No schools provisioned yet.</div>';
        return;
    }
    schools.forEach(data => renderSchoolCard(data.id, data));
}

function renderSchoolCard(id, data) {
    const grid = document.getElementById("school-ledger");
    if (!grid) return;

    const licensePct = data.max_licenses > 0
        ? Math.min(100, Math.round(((data.total_strength || 0) / data.max_licenses) * 100))
        : 0;
    const statusColor = data.status === "active" ? "text-emerald-400" : "text-red-400";
    const statusLabel = data.status === "active" ? "● Active" : "● Inactive";

    const card = document.createElement("div");
    card.className = "bg-slate-900 p-6 lg:p-8 rounded-[32px] border border-slate-800 flex flex-col items-center text-center group hover:border-indigo-500/50 transition-all duration-500";
    card.innerHTML = `
        <div class="w-16 h-16 lg:w-20 lg:h-20 bg-white rounded-full flex items-center justify-center p-3 mb-4 lg:mb-6 shadow-2xl">
            <img src="${escapeHtml(data.logo_url || "../../images/default-school.png")}" class="object-contain w-full h-full" alt="${escapeHtml(data.name)} logo">
        </div>
        <h4 class="text-lg lg:text-xl font-black text-white group-hover:text-indigo-400 transition">${escapeHtml(data.name)}</h4>
        <p class="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">${escapeHtml(data.board || "N/A")} · ${data.max_licenses || 0} Licenses</p>
        <p class="text-[10px] font-black ${statusColor} mt-2">${statusLabel}</p>

        <div class="w-full mt-4 space-y-2">
            <div class="flex justify-between text-[10px] font-bold text-slate-500">
                <span>Strength: ${data.total_strength || 0}</span>
                <span>Utilization: ${licensePct}%</span>
            </div>
            <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all duration-700 ${licensePct > 80 ? "bg-red-400" : licensePct > 50 ? "bg-amber-400" : "bg-emerald-400"}" style="width: ${licensePct}%"></div>
            </div>
            <p class="text-[10px] text-slate-600">${escapeHtml(data.district || "")}${data.state ? ", " + escapeHtml(data.state) : ""}</p>
        </div>

        <div class="grid grid-cols-2 gap-3 mt-6 lg:mt-8 w-full">
            <a href="../../school-landing.html?schoolId=${encodeURIComponent(id)}" target="_blank"
               class="bg-white text-black py-3 lg:py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-400 transition text-center">Launch Portal</a>
            <button class="js-manage-school bg-slate-800 text-white py-3 lg:py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition">Configs</button>
        </div>`;
    card.querySelector(".js-manage-school").addEventListener("click", () => manageSchool(id));
    grid.appendChild(card);
}

// ═══════════════════════════════════════════════════════
// FINANCIAL LEDGER RENDERER
// ═══════════════════════════════════════════════════════
function renderFilteredLedger() {
    const schoolFilter = document.getElementById("ledger-filter-school");
    const typeFilter = document.getElementById("ledger-filter-type");
    const schoolVal = schoolFilter ? schoolFilter.value : "";
    const typeVal = typeFilter ? typeFilter.value : "";

    let filtered = financialCache;
    if (schoolVal) filtered = filtered.filter(e => e.schoolId === schoolVal);
    if (typeVal) filtered = filtered.filter(e => e.type === typeVal);

    const tbody = document.getElementById("ledger-rows");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 text-sm">No financial events match the filter.</td></tr>';
        return;
    }

    filtered.forEach(evt => {
        const ts = evt.timestamp?.toDate ? evt.timestamp.toDate() : null;
        const dateStr = ts ? ts.toLocaleDateString() + " " + ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
        const schoolName = schoolsCache.find(s => s.id === evt.schoolId)?.name || evt.schoolId;
        const typeBadgeColor = evt.type === "LICENSE_ACTIVATION" ? "bg-indigo-900/30 text-indigo-400"
            : evt.type === "RENEWAL" ? "bg-emerald-900/30 text-emerald-400"
            : "bg-slate-800 text-slate-300";

        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-900/30 transition";
        tr.innerHTML = `
            <td class="p-4 lg:p-6 text-xs text-slate-400 font-medium">${dateStr}</td>
            <td class="p-4 lg:p-6 text-sm font-bold text-white">${escapeHtml(schoolName)}</td>
            <td class="p-4 lg:p-6"><span class="px-3 py-1 rounded-lg text-[10px] font-black uppercase ${typeBadgeColor}">${escapeHtml(evt.type || "N/A")}</span></td>
            <td class="p-4 lg:p-6 text-sm font-bold text-emerald-400">₹${(evt.amount || 0).toLocaleString("en-IN")}</td>
            <td class="p-4 lg:p-6 text-xs text-slate-500 max-w-[200px] truncate">${escapeHtml(evt.details || "—")}</td>
            <td class="p-4 lg:p-6 text-[10px] text-slate-600 font-mono">${escapeHtml(String(evt.recorded_by || "system").substring(0, 10))}…</td>`;
        tbody.appendChild(tr);
    });
}

// ═══════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════
function handleSearch(term) {
    const q = term.toLowerCase().trim();
    if (currentTab === "b2b") {
        const filtered = q ? schoolsCache.filter(s =>
            (s.name || "").toLowerCase().includes(q) ||
            (s.board || "").toLowerCase().includes(q) ||
            (s.district || "").toLowerCase().includes(q) ||
            (s.state || "").toLowerCase().includes(q) ||
            (s.id || "").toLowerCase().includes(q)
        ) : schoolsCache;
        renderSchoolGrid(filtered);
    } else if (currentTab === "b2c") {
        const filtered = q ? b2cCache.filter(u =>
            (u.displayName || "").toLowerCase().includes(q) ||
            (u.email || "").toLowerCase().includes(q) ||
            (u.subscriptionTier || u.plan || "").toLowerCase().includes(q) ||
            (u.id || "").toLowerCase().includes(q)
        ) : b2cCache;
        renderB2CTable(filtered);
    }
}

// ═══════════════════════════════════════════════════════
// PROVISIONING: New School Deployment
// ═══════════════════════════════════════════════════════
function generateSchoolId(name, district) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const base = (name + "-" + district + "-" + suffix)
        .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return base + ".ready4exam";
}

function wireProvisionForm() {
    const form = document.getElementById("provision-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
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
            toggleProvisionModal(false);
        } catch (err) {
            // Self-healing: rollback orphaned Auth user if Firestore write fails
            if (createdUser) {
                try { await createdUser.delete(); } catch (rollbackErr) { console.error("Failed to rollback orphaned Auth user:", rollbackErr); }
            }
            alert("Deployment Error: " + err.message);
        } finally {
            if (secAuth) await signOutSecondary(secAuth);
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}

// ═══════════════════════════════════════════════════════
// SCHOOL CONFIG MODAL
// ═══════════════════════════════════════════════════════
function manageSchool(id) {
    const school = schoolsCache.find(s => s.id === id);
    if (!school) {
        alert("School data not found.");
        return;
    }

    const body = document.getElementById("school-config-body");
    if (!body) return;

    const licensePct = school.max_licenses > 0
        ? Math.min(100, Math.round(((school.total_strength || 0) / school.max_licenses) * 100))
        : 0;

    body.innerHTML = `
        <div class="grid grid-cols-2 gap-4">
            <div class="bg-slate-800 rounded-xl p-4">
                <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">School ID</p>
                <p class="text-sm font-bold text-white font-mono break-all">${escapeHtml(id)}</p>
            </div>
            <div class="bg-slate-800 rounded-xl p-4">
                <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Status</p>
                <p class="text-sm font-black ${school.status === "active" ? "text-emerald-400" : "text-red-400"}">${escapeHtml(school.status || "unknown")}</p>
            </div>
            <div class="bg-slate-800 rounded-xl p-4">
                <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Board</p>
                <p class="text-sm font-bold text-white">${escapeHtml(school.board || "N/A")}</p>
            </div>
            <div class="bg-slate-800 rounded-xl p-4">
                <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Area Type</p>
                <p class="text-sm font-bold text-white">${escapeHtml(school.area_type || "N/A")}</p>
            </div>
            <div class="bg-slate-800 rounded-xl p-4">
                <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Licenses</p>
                <p class="text-sm font-bold text-white">${school.max_licenses || 0}</p>
            </div>
            <div class="bg-slate-800 rounded-xl p-4">
                <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Strength</p>
                <p class="text-sm font-bold text-white">${school.total_strength || 0}</p>
            </div>
        </div>
        <div class="bg-slate-800 rounded-xl p-4">
            <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">License Utilization</p>
            <div class="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all ${licensePct > 80 ? "bg-red-400" : licensePct > 50 ? "bg-amber-400" : "bg-emerald-400"}" style="width: ${licensePct}%"></div>
            </div>
            <p class="text-xs text-slate-400 mt-1">${licensePct}% utilized</p>
        </div>
        <div class="bg-slate-800 rounded-xl p-4">
            <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Principal Contact</p>
            <p class="text-sm text-white">${escapeHtml(school.principal_email || "N/A")}</p>
            <p class="text-xs text-slate-400 mt-1">${escapeHtml(school.principal_phone || "N/A")}</p>
        </div>
        <div class="bg-slate-800 rounded-xl p-4">
            <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Location</p>
            <p class="text-sm text-white">${escapeHtml(school.district || "—")}, ${escapeHtml(school.state || "—")}</p>
        </div>
        <div class="flex gap-3 mt-4">
            <button class="js-toggle-status flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition ${school.status === "active" ? "bg-red-600 hover:bg-red-500 text-white" : "bg-emerald-600 hover:bg-emerald-500 text-white"}">
                ${school.status === "active" ? "Deactivate School" : "Reactivate School"}
            </button>
            <a href="../../school-landing.html?schoolId=${encodeURIComponent(id)}" target="_blank"
               class="flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500 text-white text-center transition">
                Launch Portal
            </a>
        </div>`;

    // Wire toggle status button
    const toggleBtn = body.querySelector(".js-toggle-status");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => toggleSchoolStatus(id, school.status));
    }

    toggleSchoolConfigModal(true);
}

async function toggleSchoolStatus(schoolId, currentStatus) {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const confirmMsg = currentStatus === "active"
        ? "Are you sure you want to deactivate this school? Users will lose access."
        : "Reactivate this school and restore access?";

    if (!confirm(confirmMsg)) return;

    try {
        const { db } = await getInitializedClients();
        await updateDoc(doc(db, "schools", schoolId), { status: newStatus });
        alert(`School status updated to: ${newStatus}`);
        toggleSchoolConfigModal(false);
    } catch (err) {
        alert("Status update failed: " + err.message);
    }
}

// ═══════════════════════════════════════════════════════
// USER MANAGEMENT — Sovereign B2C CRUD
// ═══════════════════════════════════════════════════════
function openAddUserModal() {
    document.getElementById("user-modal-title").textContent = "Add B2C User";
    document.getElementById("edit-user-id").value = "";
    document.getElementById("user-management-form").reset();
    document.getElementById("password-section").classList.remove("hidden");
    const passInput = document.getElementById("u-pass");
    if (passInput) passInput.required = true;
    document.getElementById("delete-user-btn").classList.add("hidden");
    // Reset email field to editable for new user
    document.getElementById("u-email").readOnly = false;
    toggleUserModal(true);
}

function openEditUserModal(uid) {
    const user = b2cCache.find(u => u.id === uid);
    if (!user) { alert("User not found in cache."); return; }

    document.getElementById("user-modal-title").textContent = "Edit B2C Profile";
    document.getElementById("edit-user-id").value = uid;
    document.getElementById("u-name").value = user.displayName || "";
    document.getElementById("u-email").value = user.email || "";
    document.getElementById("u-email").readOnly = true; // Email is tied to Firebase Auth and cannot be changed from Firestore
    document.getElementById("u-plan").value = user.subscriptionTier || user.plan || "trial";
    document.getElementById("u-class").value = String(user.class || user.academicClass || "9");

    // Hide password for edits — use Reset Password instead
    document.getElementById("password-section").classList.add("hidden");
    const passInput = document.getElementById("u-pass");
    if (passInput) passInput.required = false;
    document.getElementById("delete-user-btn").classList.remove("hidden");

    toggleUserModal(true);
}

async function handleUserFormSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector("button[type='submit']");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "PROCESSING…";

    const uid = document.getElementById("edit-user-id").value;
    const displayName = document.getElementById("u-name").value.trim();
    const email = document.getElementById("u-email").value.trim();
    const subscriptionTier = document.getElementById("u-plan").value;
    const academicClass = parseInt(document.getElementById("u-class").value);

    try {
        const { db } = await getInitializedClients();

        if (uid) {
            // EDIT: Update existing B2C profile in Firestore
            await updateDoc(doc(db, "users", uid), {
                displayName,
                subscriptionTier,
                class: academicClass
            });
            alert("Sovereign profile updated.");
        } else {
            // ADD: Create new B2C user via secondary auth
            const password = document.getElementById("u-pass").value;
            if (!password || password.length < 6) {
                alert("Password must be at least 6 characters.");
                btn.disabled = false;
                btn.textContent = originalText;
                return;
            }

            let secApp = getApps().find(a => a.name === "SecondaryOnboarding");
            if (!secApp) {
                secApp = initializeApp(window.__firebase_config, "SecondaryOnboarding");
            }
            const secAuth = getAuth(secApp);

            let createdUser = null;
            try {
                const cred = await createUserWithEmailAndPassword(secAuth, email, password);
                createdUser = cred.user;

                // Five-day grace period per B2C lifecycle
                const now = new Date();
                const expiry = new Date(now);
                expiry.setFullYear(expiry.getFullYear() + 1);
                const graceDate = new Date(expiry);
                graceDate.setDate(graceDate.getDate() + 5);

                await setDoc(doc(db, "users", createdUser.uid), {
                    uid: createdUser.uid,
                    displayName,
                    email,
                    role: "student",
                    tenantType: "individual",
                    isB2C: true,
                    subscriptionTier,
                    class: academicClass,
                    status: "active",
                    activationDate: serverTimestamp(),
                    accessExpiryDate: expiry.toISOString(),
                    gracePeriodEndDate: graceDate.toISOString(),
                    createdAt: serverTimestamp()
                });

                alert(`B2C user provisioned.\n\nEmail: ${email}\nCredentials have been copied to clipboard.`);
                try { await navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`); } catch (_) { /* clipboard may not be available */ }
            } catch (authErr) {
                if (createdUser) {
                    try { await createdUser.delete(); } catch (rollbackErr) { console.error("Failed to rollback orphaned Auth user:", rollbackErr); }
                }
                throw authErr;
            } finally {
                try { await signOutSecondary(secAuth); } catch (_) { /* ignore */ }
            }
        }

        toggleUserModal(false);
    } catch (err) {
        alert("Operation failed: " + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function triggerResetPassword(uid) {
    const user = b2cCache.find(u => u.id === uid);
    const email = user?.email;
    if (!email) { alert("No email found for this user."); return; }

    if (!confirm(`Send an official Ready4Exam password reset link to ${email}?`)) return;

    try {
        const { auth } = await getInitializedClients();
        await sendPasswordResetEmail(auth, email);
        alert("Reset link dispatched to sovereign user.");
    } catch (err) {
        alert("Error: " + err.message);
    }
}

async function confirmDeleteUser() {
    const uid = document.getElementById("edit-user-id").value;
    if (!uid) return;

    const user = b2cCache.find(u => u.id === uid);
    const displayName = user?.displayName || uid;

    if (!confirm(`DANGER: This will permanently revoke all access for "${displayName}". Proceed?`)) return;

    try {
        const { db } = await getInitializedClients();
        // Soft-delete: mark as deleted and revoke access for financial audit trail
        await updateDoc(doc(db, "users", uid), {
            status: "deleted",
            accessExpiryDate: new Date().toISOString(),
            deletedAt: serverTimestamp()
        });
        alert("Sovereign access revoked.");
        toggleUserModal(false);
    } catch (err) {
        alert("Delete failed: " + err.message);
    }
}

function toggleUserModal(show) {
    const modal = document.getElementById("user-modal");
    if (modal) modal.classList.toggle("hidden", !show);
    if (!show) {
        const form = document.getElementById("user-management-form");
        if (form) form.reset();
    }
}

function generateRandomPass() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
    let pass = "";
    const array = new Uint32Array(12);
    crypto.getRandomValues(array);
    for (let i = 0; i < 12; i++) {
        pass += chars[array[i] % chars.length];
    }
    const passField = document.getElementById("u-pass");
    if (passField) passField.value = pass;
}

// ═══════════════════════════════════════════════════════
// SYSTEM PULSE
// ═══════════════════════════════════════════════════════
function startSystemPulse() {
    updatePulse();
    setInterval(updatePulse, PULSE_UPDATE_INTERVAL_MS);
}

function updatePulse() {
    const now = new Date();
    const tsEl = document.getElementById("pulse-timestamp");
    if (tsEl) tsEl.textContent = now.toLocaleTimeString();

    const uptimeMs = Date.now() - SESSION_START;
    const uptimeMin = Math.floor(uptimeMs / 60000);
    const uptimeEl = document.getElementById("pulse-uptime");
    if (uptimeEl) uptimeEl.textContent = uptimeMin < 60 ? `${uptimeMin}m` : `${Math.floor(uptimeMin / 60)}h ${uptimeMin % 60}m`;
}

// ═══════════════════════════════════════════════════════
// UI CONTROLLERS
// ═══════════════════════════════════════════════════════
function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
    const target = document.getElementById(`tab-${tabId}`);
    if (target) target.classList.remove("hidden");

    document.querySelectorAll(".nav-link").forEach(l => {
        l.classList.remove("bg-indigo-600", "text-white");
        l.classList.add("text-slate-400");
        l.setAttribute("aria-selected", "false");
    });
    const active = document.querySelector(`.nav-link[data-tab="${tabId}"]`);
    if (active) {
        active.classList.add("bg-indigo-600", "text-white");
        active.classList.remove("text-slate-400");
        active.setAttribute("aria-selected", "true");
    }

    const title = document.getElementById("view-title");
    if (title && active) title.textContent = active.textContent.trim();

    // Clear search on tab switch
    const searchInput = document.getElementById("search-input");
    if (searchInput) searchInput.value = "";
}

function toggleProvisionModal(show) {
    const modal = document.getElementById("provision-modal");
    if (modal) modal.classList.toggle("hidden", !show);
}

function toggleSchoolConfigModal(show) {
    const modal = document.getElementById("school-config-modal");
    if (modal) modal.classList.toggle("hidden", !show);
}

// ═══════════════════════════════════════════════════════
// UTILITY: HTML escaping to prevent XSS
// ═══════════════════════════════════════════════════════
function escapeHtml(str) {
    if (str == null) return "";
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
}
