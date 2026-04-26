// js/pyq.js - Optimized for Zero-Waste Reads & Dynamic UI

import { getInitializedClients } from "./config.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- STATE MANAGEMENT ---
let auth, automationDB, studentDB;
let currentUser = null;
let currentGrade = "10";
let currentProfileName = null;

// CACHE: Stores full data for subject/year pairs to avoid repeat reads
let vaultCache = {}; 
let discoveryData = []; // Stores basic {subject, year} list for filters
let currentVaultData = [];
let currentProgressMap = {};

// FIXED: Default to 2025 and "All" to show most recent data first
let activeYear = "2025"; 
let activeSubject = "Mathematics";
let activeDifficulty = "all";
let activeType = "board_final";
let activeSet = "all";

let currentFilteredItems = [];
let authBootToken = 0;
let listenersBound = false;
let authUnsubscribe = null;

document.addEventListener("DOMContentLoaded", init);

// --- INITIALIZATION ---
async function init() {
  showLoading("Initializing Secure Vault...");
  try {
    const clients = await getInitializedClients();
    auth = clients.auth;
    automationDB = clients.automationDB;
    studentDB = clients.studentDB || clients.db;

    if (authUnsubscribe) authUnsubscribe();

    authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      const bootToken = ++authBootToken;
      currentUser = user || null;
      if (!currentUser) {
        showLoggedOutState();
        return;
      }
      try {
        await bootForAuthenticatedUser(bootToken);
      } catch (error) {
        console.error("Vault init failed:", error);
        showFatal("Critical: Security nodes out of sync. Please refresh.");
      }
    });
  } catch (error) {
    showFatal("System services unavailable.");
  }
}

async function bootForAuthenticatedUser(bootToken) {
  // 1. Resolve Grade Security
  const profileDoc = await getDoc(doc(studentDB, "users", currentUser.uid));
  const profile = profileDoc.exists() ? profileDoc.data() : {};
  const assignedGrade = String(profile.classId || profile.grade || "10");
  const urlGrade = new URLSearchParams(window.location.search).get("grade");
  currentGrade = urlGrade && (profile.role === 'admin' || profile.role === 'owner') ? urlGrade : assignedGrade;
  
  currentProfileName = profile.displayName || "Student";
  updateHeader(currentGrade);

  // 2. DISCOVERY: Fetch ALL subject/year pairs for this grade ONCE.
  // This populates the dropdown and ribbon without loading full PDF data
  await runDiscovery(currentGrade);

  // 3. FETCH DETAIL: Load the default grid (2025 Mathematics)
  await loadVaultData(currentGrade, activeSubject, activeYear);
  if (bootToken !== authBootToken) return;

  await loadProgress(currentUser.uid, currentGrade);
  
  setupYearRibbon();
  setupFilters(); 
  bindEventsOnce();
  renderGrid();
  hideLoadingShowApp();
}

// --- OPTIMIZED DATA FETCHING ---

async function runDiscovery(grade) {
  // Fetches just enough to build filters. Costs 1 bulk read for the grade.
  const q = query(collection(automationDB, "Ready4Exam_Vault"), where("grade", "==", String(grade)));
  const snap = await getDocs(q);
  discoveryData = [];
  snap.forEach(d => {
    const data = d.data();
    discoveryData.push({
      subject: normalizeSubject(data.subject),
      year: String(data.year)
    });
  });
}

async function loadVaultData(grade, subject, year) {
  if (!automationDB) return;
  const cacheKey = `${grade}_${subject}_${year}`;
  
  if (vaultCache[cacheKey]) {
    currentVaultData = vaultCache[cacheKey];
    return;
  }

  // REPLACEMENT: Fetch only what is visible. Reads ~5 docs instead of 500.
  const q = query(
    collection(automationDB, "Ready4Exam_Vault"),
    where("grade", "==", String(grade)),
    where("subject", "==", subject),
    where("year", "==", String(year))
  );

  const snapshot = await getDocs(q);
  const data = [];
  snapshot.forEach((snapDoc) => {
    data.push(normalizeVaultItem({ id: snapDoc.id, ...snapDoc.data() }));
  });

  vaultCache[cacheKey] = data;
  currentVaultData = data;
}

async function loadProgress(uid, grade) {
  const q = query(collection(studentDB, "user_progress"), where("user_id", "==", uid), where("grade", "==", String(grade)));
  const snapshot = await getDocs(q);
  currentProgressMap = {};
  snapshot.forEach((snapDoc) => {
    const data = snapDoc.data();
    if (data.code) currentProgressMap[String(data.code)] = Boolean(data.completed);
  });
}

// --- UI LOGIC ---

function setupFilters() {
  const subjectSelect = document.getElementById("filter-subject");
  if (!subjectSelect) return;

  // FIXED: Use discoveryData to keep the dropdown stable across all years
  const subjects = [...new Set(discoveryData.map(d => d.subject))].sort();
  subjectSelect.innerHTML = subjects.map(s => 
    `<option value="${s}" ${s === activeSubject ? 'selected' : ''}>${s}</option>`
  ).join('');

  document.getElementById("filter-difficulty").value = activeDifficulty;
  document.getElementById("filter-type").value = activeType;
  document.getElementById("filter-set").value = activeSet;
}

function setupYearRibbon() {
  const container = document.getElementById("year-ribbon");
  if (!container) return;
  container.innerHTML = "";

  // FIXED: Ribbon now reflects active counts for the current grade
  for (let year = 2026; year >= 2022; year--) {
    const yearStr = String(year);
    const count = discoveryData.filter(d => d.year === yearStr && d.subject === activeSubject).length;
    if (count === 0 && yearStr !== activeYear) continue; // Hide empty years for this subject

    const isActive = activeYear === yearStr;
    const btn = document.createElement("button");
    btn.className = `px-5 py-2 rounded-xl text-sm font-bold border transition-all ${isActive ? "bg-cbse-blue text-white shadow-lg" : "bg-white text-slate-600 border-slate-200"}`;
    btn.dataset.year = yearStr;
    btn.innerHTML = `<span>${yearStr}</span> <span class="text-[10px] opacity-60 ml-1">(${count})</span>`;
    container.appendChild(btn);
  }
}

function bindEventsOnce() {
  if (listenersBound) return;
  listenersBound = true;

  document.getElementById("filter-subject")?.addEventListener("change", async (e) => {
    activeSubject = normalizeSubject(e.target.value);
    showLoading(`Updating ${activeSubject}...`);
    await loadVaultData(currentGrade, activeSubject, activeYear);
    setupYearRibbon(); // Update counts
    renderGrid();
    hideLoadingShowApp();
  });

  document.getElementById("year-ribbon")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-year]");
    if (!btn) return;
    activeYear = btn.dataset.year;
    showLoading(`Switching to ${activeYear}...`);
    await loadVaultData(currentGrade, activeSubject, activeYear);
    setupYearRibbon(); 
    renderGrid();
    hideLoadingShowApp();
  });

  ["filter-difficulty", "filter-type", "filter-set"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", (e) => {
      if (id === "filter-difficulty") activeDifficulty = normalizeDifficulty(e.target.value);
      if (id === "filter-type") activeType = normalizeExamType(e.target.value);
      if (id === "filter-set") activeSet = String(e.target.value || "all");
      renderGrid();
    });
  });

  document.getElementById("pdf-grid")?.addEventListener("click", async (e) => {
    const actionButton = e.target.closest("button[data-action]");
    if (!actionButton) return;
    const card = actionButton.closest("[data-index]");
    const item = currentFilteredItems[Number(card.dataset.index)];
    const action = actionButton.dataset.action;
    if (action === "open-qp") openPdfModal(item.qp_url, `${item.code} Question Paper`);
    if (action === "open-ms") openPdfModal(item.ms_url, `${item.code} Marking Scheme`);
    if (action === "toggle-progress") await toggleProgress(item);
  });
}

// --- RENDER GRID ---

function renderGrid() {
  const grid = document.getElementById("pdf-grid");
  const empty = document.getElementById("no-pyq-msg");
  if (!grid) return;

  const normSub = normalizeSubject(activeSubject);
  currentFilteredItems = currentVaultData.filter((item) => {
    const matchYear = activeYear === "All" || item.year === activeYear;
    const matchSubject = normSub === "All" || item.subject === normSub;
    const matchType = activeType === "all" || item.exam_type === activeType;
    const matchDifficulty = activeSubject !== "Mathematics" || activeDifficulty === "all" || item.difficulty === activeDifficulty;
    const matchSet = activeSet === "all" || String(item.set) === String(activeSet);
    return matchYear && matchSubject && matchType && matchDifficulty && matchSet;
  });

  grid.innerHTML = "";
  if (!currentFilteredItems.length) {
    grid.classList.add("hidden");
    if (empty) empty.classList.remove("hidden");
    return;
  }

  grid.classList.remove("hidden");
  if (empty) empty.classList.add("hidden");

  currentFilteredItems.forEach((item, index) => {
    const isDone = Boolean(currentProgressMap[String(item.code)]);
    const card = document.createElement("div");
    card.className = `group relative bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-xl transition-all flex flex-col h-full ${isDone ? "ring-1 ring-emerald-200 opacity-80" : ""}`;
    card.dataset.index = String(index);
    card.innerHTML = `
      <div class="flex justify-between items-start mb-4">
        <span class="px-3 py-1 bg-indigo-50 text-cbse-blue text-xs font-black rounded-lg">${item.year}</span>
        <span class="text-[10px] font-bold text-slate-400 uppercase">${item.exam_type}</span>
      </div>
      <div class="flex-grow flex flex-col items-center text-center py-4">
        <div class="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 text-3xl mb-3"><i class="fas fa-file-pdf"></i></div>
        <h4 class="font-bold text-slate-800 text-sm mb-1">${item.code}</h4>
        <p class="text-xs text-slate-500">${item.subject} • Set ${item.set || '-'}</p>
      </div>
      <div class="mt-4 pt-4 border-t grid grid-cols-2 gap-2">
        <button data-action="open-qp" class="py-2 text-[10px] font-bold bg-slate-50 rounded-xl hover:bg-cbse-blue hover:text-white transition-colors">View QP</button>
        <button data-action="open-ms" class="py-2 text-[10px] font-bold bg-indigo-50 text-cbse-blue rounded-xl hover:bg-indigo-100 transition-colors">View MS</button>
      </div>
      <button data-action="toggle-progress" class="mt-3 w-full py-2 text-xs font-bold rounded-xl transition-all ${isDone ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}">
        ${isDone ? "✓ Completed" : "Mark as Completed"}
      </button>`;
    grid.appendChild(card);
  });
}

// --- NORMALIZATION & HELPERS ---

function normalizeSubject(v) {
  const r = String(v || "").trim().toLowerCase();
  if (["math", "maths", "mathematics"].includes(r)) return "Mathematics";
  if (r.includes("social")) return "Social Science";
  if (r.includes("science")) return "Science";
  if (r.includes("english")) return "English";
  if (r.includes("hindi")) return "Hindi";
  return String(v || "").trim();
}

function normalizeExamType(v) { return String(v || "").toLowerCase().includes("comp") ? "compartment" : "board_final"; }
function normalizeDifficulty(v) { const r = String(v || "").toLowerCase(); return (r === "basic" || r === "standard") ? r : "all"; }
function normalizeVaultItem(raw) {
  return { ...raw, code: String(raw.code).replace(/-/g, "_"), year: String(raw.year || "2025"), subject: normalizeSubject(raw.subject) };
}

function updateHeader(grade) {
  if (document.getElementById("context-badge")) document.getElementById("context-badge").textContent = `Grade ${grade}`;
  if (document.getElementById("user-welcome")) document.getElementById("user-welcome").textContent = currentProfileName || "Student";
}

function showLoading(msg) {
  const l = document.getElementById("loading");
  if (l) { l.classList.remove("hidden"); l.innerHTML = `<div class="animate-pulse">${msg}</div>`; }
  document.getElementById("app")?.classList.add("hidden");
}

function hideLoadingShowApp() {
  document.getElementById("loading")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("hidden");
}

function showFatal(msg) {
  const l = document.getElementById("loading");
  if (l) { l.classList.remove("hidden"); l.innerHTML = `<div class="text-red-500">${msg}</div>`; }
}

function showLoggedOutState() { showFatal("Please sign in to access the vault."); }

async function toggleProgress(item) {
  const code = String(item.code);
  const next = !Boolean(currentProgressMap[code]);
  currentProgressMap[code] = next;
  renderGrid();
  await setDoc(doc(studentDB, "user_progress", `${currentUser.uid}__${code}`), {
    user_id: currentUser.uid, grade: String(currentGrade), code, completed: next, updated_at: new Date().toISOString()
  }, { merge: true });
}

function openPdfModal(url, title) {
  if (!url || url === "#") { alert("Document not available yet."); return; }
  document.body.style.overflow = "hidden";
  document.getElementById("pdf-modal-title").textContent = title;
  document.getElementById("pdf-frame").src = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
  document.getElementById("pdf-modal").classList.remove("hidden");
}

window.closePdf = () => {
  document.getElementById("pdf-modal").classList.add("hidden");
  document.getElementById("pdf-frame").src = "about:blank";
  document.body.style.overflow = "auto";
};
