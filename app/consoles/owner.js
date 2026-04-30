// app/consoles/owner.js — Owner Command Center
import { guardConsole, bindConsoleLogout } from "../../js/guard.js";
import { getInitializedClients } from "../../js/config.js";
import { recordFinancialEvent } from "../../js/api.js";
import {
    collection, query, where, orderBy, onSnapshot,
    doc, setDoc, updateDoc, deleteDoc, serverTimestamp, collectionGroup,
    getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut as signOutSecondary
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const SESSION_START = Date.now();
const PULSE_UPDATE_INTERVAL_MS = 30000;
let b2bChart = null;
let b2cChart = null;
let schoolsCache = [];
let b2cCache = [];
let financialCache = [];
let currentTab = "b2b";
let isCreateUserMode = false;

bindConsoleLogout("logout-nav-btn", "../../index.html");
guardConsole("owner");

let ownerUid = null;

window.loadConsoleData = async (profile) => {
    ownerUid = profile.uid;
    const welcomeEl = document.getElementById("user-welcome");
    if (welcomeEl) welcomeEl.textContent = profile.displayName || "Root Owner";

    wireEventListeners();
    initSegmentedCharts();
    initRealtimeStreams();
    wireProvisionForm();
    initLicenseCalculator();
    startSystemPulse();
};

function showSyncError(stream, err) {
    console.error(`[onSnapshot:${stream}]`, err);
    const banner = document.getElementById("sync-error-banner");
    if (banner) {
        banner.textContent = `⚠ ${stream} sync failed: ${err.message}. Data may be stale.`;
        banner.classList.remove("hidden");
    }
}

const streamStatus = { b2c: false, b2b: false, ledger: false };

function markLoaded(stream) {
    streamStatus[stream] = true;
}

async function initRealtimeStreams() {
    const { db } = await getInitializedClients();

    onSnapshot(
        query(collection(db, "users"), where("tenantType", "==", "individual")),
        (snap) => {
            markLoaded("b2c");
            b2cCache = [];
            snap.forEach((userDoc) => b2cCache.push({ id: userDoc.id, ...userDoc.data() }));
            b2cCache.sort((a, b) => safeTs(b.createdAt || b.activationDate) - safeTs(a.createdAt || a.activationDate));

            const paidCount = b2cCache.filter((u) => isUserPaid(u)).length;
            const parentLinkedCount = b2cCache.filter((u) => (u.parentEmail || "").trim()).length;
            const paidEl = document.getElementById("count-b2c-paid");
            if (paidEl) paidEl.textContent = `${paidCount} paid • ${parentLinkedCount} linked parents`;

            if (currentTab === "b2c") renderB2CTable(b2cCache);
            updateSegmentedCharts(financialCache);
        },
        (err) => showSyncError("B2C Users", err)
    );

    onSnapshot(
        query(collection(db, "schools"), orderBy("created_at", "desc")),
        (snap) => {
            markLoaded("b2b");
            schoolsCache = [];
            snap.forEach((schoolDoc) => schoolsCache.push({ id: schoolDoc.id, ...schoolDoc.data() }));

            const activeCount = schoolsCache.filter((s) => s.status === "active").length;
            const activeEl = document.getElementById("count-schools-active");
            if (activeEl) activeEl.textContent = `${activeCount} manual schools`;

            if (currentTab === "b2b") renderSchoolGrid(schoolsCache);
        },
        (err) => showSyncError("Schools", err)
    );

    onSnapshot(
        query(collectionGroup(db, "financial_events"), orderBy("timestamp", "desc"), limit(LEDGER_PAGE_SIZE)),
        (snap) => {
            markLoaded("ledger");
            financialCache = [];
            snap.forEach((eventDoc) => {
                const data = eventDoc.data();
                const isB2C = classifyAsB2C(data);

                financialCache.push({
                    id: eventDoc.id,
                    ...data,
                    entity: isB2C ? (data.uid || "Individual B2C") : (data.school_id || "B2B"),
                    source: isB2C ? "B2C" : "B2B"
                });
            });

            if (!snap.empty) {
                ledgerLastDoc = snap.docs[snap.docs.length - 1];
            }

            renderLedgerTable(financialCache);
            renderRevenueKPIs();
            updateSegmentedCharts(financialCache);

            const loadBtn = document.getElementById("ledger-load-more");
            if (loadBtn) {
                loadBtn.classList.toggle("hidden", snap.docs.length < LEDGER_PAGE_SIZE);
            }
        },
        (err) => showSyncError("Financial Events", err)
    );
}

function renderRevenueKPIs() {
    const b2bTotal = financialCache
        .filter((e) => e.source === "B2B")
        .reduce((sum, e) => sum + (parseFloat(e.amount || 0) || 0), 0);

    const b2cTotal = financialCache
        .filter((e) => e.source === "B2C")
        .reduce((sum, e) => sum + (parseFloat(e.amount || 0) || 0), 0);

    const b2bEl = document.getElementById("count-revenue-b2b");
    const b2cEl = document.getElementById("count-revenue-b2c");
    const totalEl = document.getElementById("count-revenue-total");
    if (b2bEl) b2bEl.textContent = `₹${b2bTotal.toLocaleString("en-IN")}`;
    if (b2cEl) b2cEl.textContent = `₹${b2cTotal.toLocaleString("en-IN")}`;
    if (totalEl) totalEl.textContent = `₹${(b2bTotal + b2cTotal).toLocaleString("en-IN")}`;
}

function classifyAsB2C(data) {
    const et = (data.entityType || "").toLowerCase();
    if (et === "b2c") return true;
    if (et === "b2b") return false;
    console.warn("[classifyAsB2C] Event missing entityType — excluded from totals:", data);
    return false;
}

function initLicenseCalculator() {
    const strength = document.getElementById("prov-strength");
    const teachers = document.getElementById("prov-teachers");
    const others   = document.getElementById("prov-others");
    const licenses = document.getElementById("prov-licenses");

    function recalculate() {
        const s = parseInt(strength?.value) || 0;
        const t = parseInt(teachers?.value) || 0;
        const o = parseInt(others?.value)   || 0;
        licenses.value = Math.ceil(((s * 2) + t + o) * 1.05) || 0;
    }

    strength?.addEventListener("input", recalculate);
    teachers?.addEventListener("input", recalculate);
    others?.addEventListener("input", recalculate);
    recalculate();
}

function wireProvisionForm() {
    const form = document.getElementById("provision-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector("button[type='submit']");

        const licenses = parseInt(document.getElementById("prov-licenses").value, 10);
        if (!licenses || licenses <= 0) {
            showToast("License count is 0 — check student/staff numbers.", "error");
            btn.disabled = false;
            btn.textContent = "Deploy & Record Revenue";
            return;
        }

        btn.disabled = true;
        btn.textContent = "ORCHESTRATING TENANT...";

        let success = false;
        try {
            const { db } = await getInitializedClients();
            const schoolName = document.getElementById("prov-name").value;
            const district = document.getElementById("prov-district").value;
            const manualAmount = parseFloat(document.getElementById("prov-amount-paid").value) || 0;
            const principalEmail = document.getElementById("prov-email").value;

            const prefix = (schoolName.split(" ")[0] + "-" + district)
                .toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24);
            const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
            const schoolId = `${prefix}-${nonce}`;

            const existing = await getDoc(doc(db, "schools", schoolId));
            if (existing.exists()) {
                throw new Error(`School ID collision: ${schoolId} already exists. Please retry.`);
            }

            const secApp = getApps().find((a) => a.name === "Onboard") || initializeApp(window.__firebase_config, "Onboard");
            const secAuth = getAuth(secApp);
            let adminCred, principalCred;

            try {
                // 1. Create Technical Admin Persona
                const adminEmail = `admin@${schoolId}.ready4exam.com`;
                adminCred = await createUserWithEmailAndPassword(secAuth, adminEmail, "Ready4Exam@2026");

                await setDoc(doc(db, "users", adminCred.user.uid), {
                    displayName: "System Administrator",
                    email: adminEmail,
                    role: "admin",
                    tenantType: "school",
                    school_id: schoolId,
                    created_at: serverTimestamp()
                });

                await signOutSecondary(secAuth).catch(() => {});

                // 2. Create Sovereign Principal Persona
                principalCred = await createUserWithEmailAndPassword(secAuth, principalEmail, generateSecurePassword());

                const { auth } = await getInitializedClients();
                await sendPasswordResetEmail(auth, principalEmail);

                await setDoc(doc(db, "users", principalCred.user.uid), {
                    displayName: "School Principal",
                    email: principalEmail,
                    role: "principal",
                    tenantType: "school",
                    school_id: schoolId,
                    created_at: serverTimestamp()
                });

                await setDoc(doc(db, "schools", schoolId), {
                    name: schoolName,
                    logo_url: document.getElementById("prov-logo").value || "",
                    board: document.getElementById("prov-board").value,
                    max_licenses: licenses,
                    total_strength: parseInt(document.getElementById("prov-strength").value, 10) || 0,
                    area_type: document.getElementById("prov-area").value,
                    state: document.getElementById("prov-state").value,
                    district,
                    principal_email: principalEmail,
                    principal_phone: document.getElementById("prov-phone").value,
                    created_at: serverTimestamp(),
                    status: "active",
                    school_id: schoolId
                });

                await recordFinancialEvent(schoolId, "LICENSE_ACTIVATION", manualAmount, `Full Provisioning Manual Pay: ${schoolName}`);

                showToast(`Deployment Successful! ID: ${schoolId}. Admin: ${adminEmail}`, "success");
                success = true;
            } finally {
                await signOutSecondary(secAuth).catch(() => {});
            }

            const { auth } = await getInitializedClients();
            if (auth.currentUser?.uid !== ownerUid) {
                window.location.href = "../../index.html";
            }
        } catch (err) {
            showToast("Deployment Error: " + err.message, "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "Deploy & Record Revenue";
            if (success) {
                form.reset();
                initLicenseCalculator();
                toggleModal("provision-modal", false);
            }
        }
    });
}

async function handleUserFormSubmit(e) {
    e.preventDefault();
    const uid = document.getElementById("edit-user-id").value;
    const { db } = await getInitializedClients();

    const displayName = document.getElementById("u-name").value.trim();
    const subscriptionTier = document.getElementById("u-plan").value;
    const revenue = parseFloat(document.getElementById("u-revenue").value) || 0;
    const parentEmail = document.getElementById("u-parent-email").value.trim();

    try {
        if (isCreateUserMode) {
            const email    = document.getElementById("u-email").value.trim();
            const password = document.getElementById("u-password").value;
            if (!email || password.length < 8) {
                showToast("Valid email and password (min 8 chars) are required.", "error");
                return;
            }

            const secApp = getApps().find((a) => a.name === "OwnerOps") || initializeApp(window.__firebase_config, "OwnerOps");
            const secAuth = getAuth(secApp);
            let cred;
            try {
                cred = await createUserWithEmailAndPassword(secAuth, email, password);

                const { auth } = await getInitializedClients();
                await sendPasswordResetEmail(auth, email);

                await setDoc(doc(db, "users", cred.user.uid), {
                    uid: cred.user.uid,
                    displayName,
                    email,
                    role: "student",
                    tenantType: "individual",
                    isB2C: true,
                    status: "active",
                    subscriptionTier,
                    revenue,
                    parentEmail,
                    createdAt: serverTimestamp(),
                    activationDate: serverTimestamp()
                });

                await recordFinancialEvent("B2C_REVENUE", "OWNER_CREATED_USER", revenue, `Owner created B2C user: ${displayName}`);
                showToast("B2C user created successfully.", "success");
            } finally {
                await signOutSecondary(secAuth).catch(() => {});
            }

            const { auth } = await getInitializedClients();
            if (auth.currentUser?.uid !== ownerUid) {
                window.location.href = "../../index.html";
            }
        } else {
            await updateDoc(doc(db, "users", uid), {
                displayName,
                subscriptionTier,
                revenue,
                parentEmail,
                updatedAt: serverTimestamp()
            });
            showToast("Sovereign Profile Synchronized.", "success");
        }
        toggleModal("user-modal", false);
    } catch (err) {
        showToast("Sync Error: " + err.message, "error");
    }
}

const openAddUserModal = () => {
    isCreateUserMode = true;
    document.getElementById("user-modal-title").textContent = "Add B2C User";
    document.getElementById("edit-user-id").value = "";
    document.getElementById("u-name").value = "";
    document.getElementById("u-plan").value = "practitioner";
    document.getElementById("u-revenue").value = "";
    document.getElementById("u-parent-email").value = "";

    document.getElementById("new-user-credentials").classList.remove("hidden");
    document.getElementById("u-email").required = true;
    document.getElementById("u-password").required = true;

    toggleModal("user-modal", true);
};

const openEditUserModal = (uid) => {
    const user = b2cCache.find((u) => u.id === uid);
    if (!user) return;
    isCreateUserMode = false;
    document.getElementById("user-modal-title").textContent = "Edit B2C User";
    document.getElementById("edit-user-id").value = uid;
    document.getElementById("u-name").value = user.displayName || "";
    document.getElementById("u-plan").value = user.subscriptionTier || "practitioner";
    document.getElementById("u-revenue").value = user.revenue || 0;
    document.getElementById("u-parent-email").value = user.parentEmail || "";

    document.getElementById("new-user-credentials").classList.add("hidden");
    document.getElementById("u-email").required = false;
    document.getElementById("u-password").required = false;

    toggleModal("user-modal", true);
};

const deleteB2CUser = async (uid) => {
    const user = b2cCache.find((u) => u.id === uid);
    if (!user) return;
    const confirmed = await showConfirm("Delete User", `Delete ${user.displayName || user.email}? This cannot be undone.`);
    if (!confirmed) return;

    try {
        const { db } = await getInitializedClients();

        const refs = [];
        const subCollections = ["quiz_scores", "mistake_notebook", "financial_events", "ledger_events"];

        for (const colName of subCollections) {
            const subSnap = await getDocs(collection(db, "users", uid, colName));
            subSnap.forEach((d) => refs.push(d.ref));

            const rootSnap = await getDocs(
                query(collection(db, colName), where("user_id", "==", uid))
            );
            rootSnap.forEach((d) => refs.push(d.ref));
        }

        const BATCH_LIMIT = 499;
        for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db);
            refs.slice(i, i + BATCH_LIMIT).forEach((ref) => batch.delete(ref));
            await batch.commit();
        }

        const finalBatch = writeBatch(db);
        finalBatch.delete(doc(db, "users", uid));
        await finalBatch.commit();

        showToast("User and related records deleted.", "success");
    } catch (err) {
        showToast("Delete failed: " + err.message, "error");
    }
};

const resetB2CPassword = async (uid) => {
    const user = b2cCache.find((u) => u.id === uid);
    const email = user?.email;
    if (!email) {
        showToast("No login email found for this user.", "error");
        return;
    }

    try {
        const { auth } = await getInitializedClients();
        await sendPasswordResetEmail(auth, email);
        showToast(`Reset email sent to ${email}`, "success");
    } catch (err) {
        showToast("Password reset failed: " + err.message, "error");
    }
};

async function resetPrincipalPassword(schoolId, email) {
    if (!email) {
        showToast("No principal email on record for this school.", "error");
        return;
    }
    try {
        const { auth } = await getInitializedClients();
        await sendPasswordResetEmail(auth, email);
        showToast(`Reset email sent to ${email}`, "success");
    } catch (err) {
        showToast("Reset failed: " + err.message, "error");
    }
}

async function archiveSchoolInstance(schoolId) {
    const confirmed = await showConfirm("Archive School", `Archive school ${schoolId}? This disables access but preserves all data.`);
    if (!confirmed) return;

    try {
        const { db } = await getInitializedClients();
        await updateDoc(doc(db, "schools", schoolId), {
            status: "archived",
            archivedAt: serverTimestamp()
        });
        const usersSnap = await getDocs(
            query(collection(db, "users"), where("school_id", "==", schoolId))
        );
        const userRefs = [];
        usersSnap.forEach(u => userRefs.push(u.ref));
        const BATCH_LIMIT = 499;
        for (let i = 0; i < userRefs.length; i += BATCH_LIMIT) {
            const batch = writeBatch(db);
            userRefs.slice(i, i + BATCH_LIMIT).forEach(ref => batch.update(ref, { status: "suspended" }));
            await batch.commit();
        }
        showToast(`School ${schoolId} archived successfully.`, "success");
    } catch (err) {
        showToast("Archive failed: " + err.message, "error");
    }
}

function openEditSchoolModal(schoolId) {
    showToast(`Edit modal for ${schoolId} not yet implemented.`, "info");
}

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
    if (uptimeEl) uptimeEl.textContent = uptimeMin < 60 ? `${uptimeMin}m` : `${Math.floor(uptimeMin / 60)}h ${uptimeMin % 60}m`;
}

function renderB2CTable(users) {
    const tbody = document.getElementById("b2c-ledger-rows");
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-12 text-center text-slate-500 italic">No B2C users found in the registry.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map((u) => {
        const initial = (u.displayName || "U").charAt(0).toUpperCase();
        const expiryDisp = formatExpiry(u.accessExpiryDate);
        const isActive = isUserPaid(u);
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
                        <div class="text-[10px] text-slate-500 font-mono">S: ${escapeHtml(u.email || "—")}</div>
                        ${u.parentEmail ? `<div class="text-[10px] text-amber-500 font-mono">P: ${escapeHtml(u.parentEmail)}</div>` : ""}
                    </div>
                </div>
            </td>
            <td class="p-6 text-[10px] font-black uppercase text-slate-400">${escapeHtml(u.subscriptionTier || "trial")}</td>
            <td class="p-6 font-bold text-emerald-400">₹${Number(u.revenue || 0).toLocaleString("en-IN")}</td>
            <td class="p-6 text-xs text-slate-500">${expiryDisp}</td>
            <td class="p-6">${statusBadge}</td>
            <td class="p-6 text-right">
                <div class="inline-flex gap-2">
                    <button data-action="edit-user" data-uid="${u.id}" title="Edit" class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-indigo-400 hover:bg-indigo-600 hover:text-white transition"><i class="fas fa-user-edit text-xs"></i></button>
                    <button data-action="reset-password" data-uid="${u.id}" title="Reset Password" class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400 hover:bg-amber-600 hover:text-white transition"><i class="fas fa-key text-xs"></i></button>
                    <button data-action="delete-user" data-uid="${u.id}" title="Delete" class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-rose-400 hover:bg-rose-600 hover:text-white transition"><i class="fas fa-trash text-xs"></i></button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

function renderSchoolGrid(schools) {
    const grid = document.getElementById("school-ledger");
    if (!grid) return;
    grid.innerHTML = schools.map((s) => `
        <div class="bg-slate-900 border border-slate-800 p-8 rounded-[32px] hover:border-indigo-500/50 transition duration-500 group">
            <div class="flex items-center gap-5 mb-6">
                <div class="w-16 h-16 rounded-full bg-white p-2 shadow-2xl flex-shrink-0"><img src="${s.logo_url || "../../images/default-school.png"}" class="w-full h-full object-contain"></div>
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
    `).join("");
}

function renderLedgerTable(events) {
    const tbody = document.getElementById("ledger-rows");
    if (!tbody) return;
    tbody.innerHTML = events.map((e) => `
        <tr class="hover:bg-slate-900/40 text-xs border-b border-white/5">
            <td class="p-6 text-slate-500 font-medium">${e.timestamp?.toDate ? e.timestamp.toDate().toLocaleDateString() : "—"}</td>
            <td class="p-6 font-bold text-white">${escapeHtml(e.entity)}</td>
            <td class="p-6"><span class="px-3 py-1 rounded-full bg-slate-800 text-[9px] font-black uppercase text-slate-400 border border-white/5">${escapeHtml(e.type || "NA")}</span></td>
            <td class="p-6 font-black text-emerald-400 text-sm">₹${Number(e.amount || 0).toLocaleString("en-IN")}</td>
            <td class="p-6 text-slate-500 italic">"${escapeHtml(e.details || "—")}"</td>
            <td class="p-6 text-[10px] font-mono text-slate-700">${e.id.substring(0, 10)}</td>
        </tr>
    `).join("");
}

function initSegmentedCharts() {
    const cfg = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { ticks: { color: "#64748b" }, grid: { color: "rgba(148,163,184,0.12)" } },
            y: { ticks: { color: "#64748b" }, grid: { color: "rgba(148,163,184,0.12)" } }
        }
    };

    b2bChart = new Chart(document.getElementById("b2bRevenueChart"), {
        type: "line",
        data: { labels: [], datasets: [{ data: [], borderColor: "#6366f1", fill: true, backgroundColor: "rgba(99, 102, 241, 0.05)", tension: 0.3 }] },
        options: cfg
    });

    b2cChart = new Chart(document.getElementById("b2cRevenueChart"), {
        type: "bar",
        data: { labels: [], datasets: [{ data: [], backgroundColor: "#34d399", borderRadius: 6 }] },
        options: cfg
    });
}

function updateSegmentedCharts(events) {
    if (!b2bChart || !b2cChart) return;

    const labels = lastSevenDayLabels();
    const b2bSeries = new Array(labels.length).fill(0);
    const b2cSeries = new Array(labels.length).fill(0);

    events.forEach((e) => {
        const dt = e.timestamp?.toDate ? e.timestamp.toDate() : null;
        if (!dt) return;
        const key = dayKey(dt);
        const idx = labels.indexOf(key);
        if (idx < 0) return;

        const amount = Number(e.amount || 0);
        if ((e.source || "") === "B2C") b2cSeries[idx] += amount;
        else b2bSeries[idx] += amount;
    });

    b2bChart.data.labels = labels;
    b2bChart.data.datasets[0].data = b2bSeries;
    b2cChart.data.labels = labels;
    b2cChart.data.datasets[0].data = b2cSeries;
    b2bChart.update();
    b2cChart.update();
}

function wireEventListeners() {
    document.querySelectorAll(".nav-link").forEach((btn) => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            currentTab = tab;
            document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
            document.getElementById(`tab-${tab}`).classList.remove("hidden");
            document.querySelectorAll(".nav-link").forEach((l) => {
                l.classList.remove("bg-indigo-600", "text-white");
                l.classList.add("text-slate-400");
            });
            btn.classList.remove("text-slate-400");
            btn.classList.add("bg-indigo-600", "text-white");

            if (tab === "b2c" && !streamStatus.b2c) {
                const tbody = document.getElementById("b2c-ledger-rows");
                if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="p-12 text-center text-slate-500 italic animate-pulse">Loading B2C users…</td></tr>';
            } else if (tab === "b2c") {
                renderB2CTable(b2cCache);
            }
            if (tab === "b2b") renderSchoolGrid(schoolsCache);
        });
    });

    document.getElementById("user-management-form")?.addEventListener("submit", handleUserFormSubmit);
    document.getElementById("add-b2c-user-btn")?.addEventListener("click", () => openAddUserModal());
    document.querySelector(".js-provision-btn")?.addEventListener("click", () => toggleModal("provision-modal", true));
    document.querySelector(".js-close-provision")?.addEventListener("click", () => toggleModal("provision-modal", false));
    document.querySelector(".js-close-user-modal")?.addEventListener("click", () => toggleModal("user-modal", false));

    document.getElementById("b2c-ledger-rows")?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const { action, uid } = btn.dataset;
        if (action === "edit-user") openEditUserModal(uid);
        if (action === "reset-password") resetB2CPassword(uid);
        if (action === "delete-user") deleteB2CUser(uid);
    });

    document.getElementById("school-ledger")?.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const { action, schoolId, email } = btn.dataset;
        if (action === "reset-principal") await resetPrincipalPassword(schoolId, email);
        if (action === "archive-school") await archiveSchoolInstance(schoolId);
        if (action === "edit-school") openEditSchoolModal(schoolId);
    });

    document.getElementById("ledger-load-more")?.addEventListener("click", loadMoreLedger);
}

function toggleModal(id, show) {
    document.getElementById(id).classList.toggle("hidden", !show);
}

function safeTs(value) {
    if (!value) return 0;
    const dt = value.toDate ? value.toDate() : new Date(value);
    const ms = dt?.getTime?.();
    return Number.isFinite(ms) ? ms : 0;
}

function isUserPaid(user) {
    if ((user.status || "").toLowerCase() === "active" && Number(user.revenue || 0) > 0) return true;
    const exp = user.accessExpiryDate;
    if (!exp) return false;
    const dt = exp.toDate ? exp.toDate() : new Date(exp);
    return !Number.isNaN(dt.getTime()) && dt > new Date();
}

function formatExpiry(exp) {
    if (!exp) return "N/A";
    const dt = exp.toDate ? exp.toDate() : new Date(exp);
    if (Number.isNaN(dt.getTime())) return "N/A";
    return dt.toLocaleDateString();
}

function generateSecurePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => chars[b % chars.length])
        .join("");
}

function dayKey(d) {
    return d.toISOString().slice(5, 10);
}

function lastSevenDayLabels() {
    const out = [];
    const base = new Date();
    for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(base);
        d.setDate(base.getDate() - i);
        out.push(dayKey(d));
    }
    return out;
}

function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}
