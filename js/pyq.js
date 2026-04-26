// js/pyq.js - Optimized for Cost & Safety

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

// CACHE: Stores data in memory to prevent re-fetching the same selection
let vaultCache = {}; 
let currentVaultData = [];
let currentProgressMap = {};

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
        showFatal("Failed to load your secure vault.");
      }
    });
  } catch (error) {
    showFatal("System services unavailable.");
  }
}

async function bootForAuthenticatedUser(bootToken) {
  // 1. Resolve Grade (Security: Verify assigned grade from Firestore profile)
  const profileDoc = await getDoc(doc(studentDB, "users", currentUser.uid));
  const profile = profileDoc.exists() ? profileDoc.data() : {};
  
  const assignedGrade = String(profile.classId || profile.grade || "10");
  const urlGrade = new URLSearchParams(window.location.search).get("grade");
  
  // Only admins can override grade via URL
  currentGrade = urlGrade && (profile.role === 'admin' || profile.role === 'owner') ? urlGrade : assignedGrade;
  
  currentProfileName = profile.displayName || "Student";
  updateHeader(currentGrade);

  // 2. Fetch data for DEFAULT selection only (Significant cost reduction)
  await loadVaultData(currentGrade, activeSubject, activeYear);
  if (bootToken !== authBootToken) return;

  // 3. Load Progress (Limited to current user & grade)
  await loadProgress(currentUser.uid, currentGrade);
  
  setupYearRibbon();
  setupFilters();
  bindEventsOnce();
  renderGrid();
  hideLoadingShowApp();
}

// --- OPTIMIZED DATA FETCHING ---

async function loadVaultData(grade, subject, year) {
  if (!automationDB) return;
  const cacheKey = `${grade}_${subject}_${year}`;
  
  // Use cache if available (Costs 0 reads)
  if (vaultCache[cacheKey]) {
    currentVaultData = vaultCache[cacheKey];
    return;
  }

  // Server-side filtering: Reads only ~5 docs instead of 500
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
  const q = query(
    collection(studentDB, "user_progress"),
    where("user_id", "==", uid),
    where("grade", "==", String(grade))
  );
  const snapshot = await getDocs(q);
  currentProgressMap = {};
  snapshot.forEach((snapDoc) => {
    const data = snapDoc.data();
    if (data.code) currentProgressMap[String(data.code)] = Boolean(data.completed);
  });
}

// --- UI UPDATES ON SELECTION ---

function bindEventsOnce() {
  if (listenersBound) return;
  listenersBound = true;

  document.getElementById("filter-subject")?.addEventListener("change", async (e) => {
    activeSubject = normalizeSubject(e.target.value);
    showLoading(`Loading ${activeSubject}...`);
    await loadVaultData(currentGrade, activeSubject, activeYear);
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

  document.getElementById("filter-difficulty")?.addEventListener("change", (e) => {
    activeDifficulty = normalizeDifficulty(e.target.value);
    renderGrid();
  });

  document.getElementById("filter-type")?.addEventListener("change", (e) => {
    activeType = normalizeExamType(e.target.value);
    renderGrid();
  });

  document.getElementById("filter-set")?.addEventListener("change", (e) => {
    activeSet = String(e.target.value || "all");
    renderGrid();
  });

  document.getElementById("pdf-grid")?.addEventListener("click", async (e) => {
    const actionButton = e.target.closest("button[data-action]");
    if (!actionButton) return;
    const card = actionButton.closest("[data-index]");
    if (!card) return;
    const index = Number(card.dataset.index);
    const item = currentFilteredItems[index];
    if (!item) return;

    const action = actionButton.dataset.action;
    if (action === "open-qp") openPdfModal(item.qp_url, `${item.code} Question Paper`);
    if (action === "open-ms") openPdfModal(item.ms_url, `${item.code} Marking Scheme`);
    if (action === "toggle-progress") await toggleProgress(item);
  });
}

// --- RENDER GRID ---

function getFilteredItems() {
  const normSub = normalizeSubject(activeSubject);
  return currentVaultData.filter((item) => {
    const matchYear = activeYear === "All" || item.year === activeYear;
    const matchSubject = normSub === "All" || item.subject === normSub;
    const matchType = activeType === "all" || item.exam_type === activeType;
    const matchDifficulty = activeSubject !== "Mathematics" || activeDifficulty === "all" || item.difficulty === activeDifficulty;
    const matchSet = activeSet === "all" || String(item.set) === String(activeSet);
    return matchYear && matchSubject && matchType && matchDifficulty && matchSet;
  });
}

function renderGrid() {
  const grid = document.getElementById("pdf-grid");
  const empty = document.getElementById("no-pyq-msg");
  if (!grid) return;

  currentFilteredItems = getFilteredItems();
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
    const typeLabel = item.exam_type === "compartment" ? "Compartment" : "Board Final";
    const difficultyLabel = item.difficulty === "basic" ? "Basic" : "Standard";
    const setLabel = item.set ? `Set ${item.set}` : "Set -";

    const card = document.createElement("div");
    card.className = [
      "group relative bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full overflow-hidden",
      isDone ? "ring-1 ring-emerald-200 opacity-80" : ""
    ].join(" ");
    card.dataset.index = String(index);

    card.innerHTML = `
      ${isDone ? `
        <div class="absolute top-3 right-3 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-lg border border-emerald-100">
          <i class="fas fa-check mr-1"></i> Done
        </div>
      ` : ""}
      <div class="flex justify-between items-start mb-4 relative z-10">
        <span class="px-3 py-1 bg-indigo-50 text-cbse-blue text-xs font-black rounded-lg shadow-sm">${escapeHtml(item.year)}</span>
        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded">${escapeHtml(typeLabel)}</span>
      </div>
      <div class="flex-grow flex flex-col items-center justify-center text-center py-4 group-hover:scale-105 transition-transform duration-300">
        <div class="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 text-3xl mb-3 shadow-sm group-hover:bg-red-500 group-hover:text-white transition-colors">
          <i class="fas fa-file-pdf"></i>
        </div>
        <h4 class="font-bold text-slate-800 text-sm leading-tight mb-1">${escapeHtml(item.code || "Document")}</h4>
        <div class="text-xs text-slate-500 font-medium space-y-1">
          <p>${escapeHtml(item.subject)}</p>
          <p class="text-slate-400">${escapeHtml(typeLabel)} • ${escapeHtml(difficultyLabel)}</p>
          <p class="font-semibold text-cbse-blue">${escapeHtml(setLabel)}</p>
        </div>
      </div>
      <div class="mt-4 pt-4 border-t border-slate-50 grid grid-cols-2 gap-2 relative z-10">
        <button type="button" data-action="open-qp" class="py-2 text-[10px] font-bold text-slate-600 bg-slate-50 rounded-xl hover:bg-cbse-blue hover:text-white transition-colors flex items-center justify-center">
          <i class="fas fa-eye mr-1"></i> View Question Paper
        </button>
        <button type="button" data-action="open-ms" class="py-2 text-[10px] font-bold text-cbse-blue bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors flex items-center justify-center">
          <i class="fas fa-check mr-1"></i> View Marking Scheme
        </button>
      </div>
      <button type="button" data-action="toggle-progress" class="mt-3 w-full py-2 text-xs font-bold rounded-xl transition-all ${
          isDone ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }">
        ${isDone ? "✓ Completed" : "Mark as Completed"}
      </button>
    `;
    grid.appendChild(card);
  });
}

// --- MODAL & PROGRESS ---

function openPdfModal(url, title) {
  if (!url || url === "#") {
    alert("Document not available yet.");
    return;
  }
  const modal = document.getElementById("pdf-modal");
  const modalTitle = document.getElementById("pdf-modal-title");
  const iframe = document.getElementById("pdf-frame");
  if (!modal || !modalTitle || !iframe) return;
  document.body.style.overflow = "hidden";
  modalTitle.textContent = title || "Document Viewer";
  iframe.src = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
  modal.classList.remove("hidden");
}

function closePdfModal() {
  const modal = document.getElementById("pdf-modal");
  const iframe = document.getElementById("pdf-frame");
  if (modal) modal.classList.add("hidden");
  if (iframe) iframe.src = "about:blank";
  document.body.style.overflow = "auto";
}

window.openPdfModal = openPdfModal;
window.closePdf = closePdfModal;

async function toggleProgress(item) {
  try {
    if (!currentUser?.uid) {
      alert("Please sign in first.");
      return;
    }
    const uid = currentUser.uid;
    const code = String(item.code || "").trim();
    if (!code) return;

    const nextCompleted = !Boolean(currentProgressMap[code]);
    currentProgressMap[code] = nextCompleted;
    renderGrid();

    const progressDocId = `${uid}__${code}`;
    await setDoc(
      doc(studentDB, "user_progress", progressDocId),
      {
        user_id: uid,
        grade: String(currentGrade),
        subject: String(item.subject || ""),
        year: String(item.year || ""),
        exam_type: String(item.exam_type || ""),
        difficulty: String(item.difficulty || ""),
        code,
        set: String(item.set || ""),
        completed: nextCompleted,
        updated_at: new Date().toISOString()
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Progress update failed:", error);
    alert("Could not save progress.");
  }
}

// --- HELPERS (Essential for operation) ---

function normalizeSubject(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["math", "maths", "mathematics"].includes(raw)) return "Mathematics";
  if (raw.includes("social")) return "Social Science";
  if (raw.includes("science")) return "Science";
  if (raw.includes("english")) return "English";
  if (raw.includes("hindi")) return "Hindi";
  return String(value || "").trim();
}

function normalizeExamType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.includes("comp")) return "compartment";
  if (raw.includes("board") || raw.includes("final") || raw === "main") return "board_final";
  return raw || "board_final";
}

function normalizeDifficulty(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "basic") return "basic";
  if (raw === "standard") return "standard";
  return "all";
}

function normalizeCode(code) {
  return String(code || "").trim().replace(/-/g, "_");
}

function normalizeVaultItem(raw) {
  const code = normalizeCode(raw.code);
  const year = String(raw.year || "").trim() || "2022";
  const subject = normalizeSubject(raw.subject || "Mathematics");
  const examType = normalizeExamType(raw.exam_type || raw.type || "board_final");
  const difficulty = normalizeDifficulty(raw.difficulty || "all");
  return {
    id: raw.id || code,
    ...raw,
    code,
    year,
    subject,
    exam_type: examType,
    difficulty
  };
}

function setupYearRibbon() {
  const container = document.getElementById("year-ribbon");
  if (!container) return;
  container.innerHTML = "";
  for (let year = 2026; year >= 2022; year--) {
    const yearStr = String(year);
    const isActive = activeYear === yearStr;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = [
      "relative px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-sm border",
      isActive ? "bg-cbse-blue text-white border-cbse-blue" : "bg-white text-slate-600 border-slate-200"
    ].join(" ");
    btn.dataset.year = yearStr;
    btn.innerHTML = `<span>${yearStr}</span>`;
    container.appendChild(btn);
  }
}

function setupFilters() {
  const subjectSelect = document.getElementById("filter-subject");
  if (subjectSelect) subjectSelect.value = activeSubject;
}

function updateHeader(grade) {
  const badge = document.getElementById("context-badge");
  if (badge) badge.textContent = `Grade ${grade}`;
  const welcome = document.getElementById("user-welcome");
  if (welcome) welcome.textContent = currentProfileName || "Student";
}

function showLoading(message) {
  const loading = document.getElementById("loading");
  if (loading) {
    loading.classList.remove("hidden");
    loading.innerHTML = `<div class="animate-pulse font-bold text-slate-400">${message}</div>`;
  }
  document.getElementById("app")?.classList.add("hidden");
}

function hideLoadingShowApp() {
  document.getElementById("loading")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("hidden");
}

function showFatal(message) {
  const loading = document.getElementById("loading");
  if (loading) {
    loading.classList.remove("hidden");
    loading.innerHTML = `<div class="text-red-500 font-bold">${message}</div>`;
  }
}

function showLoggedOutState() {
  showFatal("Please sign in to access the vault.");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
