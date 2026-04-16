// js/pyq.js

import { getInitializedClients } from "./config.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

let auth = null;
let automationDB = null;
let studentDB = null;

let currentUser = null;
let currentGrade = "10";

let currentVaultData = [];
let currentProgressMap = {};

let activeYear = "2022";
let activeSubject = "Mathematics";
let activeDifficulty = "all";
let activeType = "board_final";
let activeSet = "all";

let currentFilteredItems = [];
let authBootToken = 0;
let listenersBound = false;
let authUnsubscribe = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  showLoading("Loading Vault...");

  try {
    const clients = await getInitializedClients();
    auth = clients.auth;
    automationDB = clients.automationDB;
    studentDB = clients.studentDB || clients.db;

    if (!auth || !automationDB || !studentDB) {
      showFatal("Firebase services are not ready.");
      return;
    }

    if (authUnsubscribe) {
      authUnsubscribe();
      authUnsubscribe = null;
    }

    authUnsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        const bootToken = ++authBootToken;
        currentUser = user || null;
        window.currentUser = currentUser;

        if (!currentUser) {
          showLoggedOutState();
          return;
        }

        try {
          showLoading("Loading your vault...");
          await bootForAuthenticatedUser(bootToken);
        } catch (error) {
          console.error("Vault init failed:", error);
          showFatal("Failed to load vault data.");
        }
      },
      (error) => {
        console.error("Auth state error:", error);
        showFatal("Authentication error.");
      }
    );
  } catch (error) {
    console.error("Init error:", error);
    showFatal("Failed to initialize page.");
  }
}

async function bootForAuthenticatedUser(bootToken) {
  const grade = resolveGrade(currentUser);
  currentGrade = grade;

  updateHeader(grade);

  await loadVaultData(grade);
  if (bootToken !== authBootToken) return;

  applyDefaultSelections();
  setupYearRibbon();
  setupFilters();
  bindEventsOnce();
  await loadProgress(currentUser.uid);
  if (bootToken !== authBootToken) return;

  renderGrid();
  hideLoadingShowApp();
}

function resolveGrade(user) {
  const urlParams = new URLSearchParams(window.location.search);
  const urlGrade = urlParams.get("grade");
  if (urlGrade) return String(urlGrade);

  if (user?.classId) return String(user.classId);
  if (user?.grade) return String(user.grade);
  if (user?.class_id) return String(user.class_id);

  return "10";
}

function normalizeSubject(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (["math", "maths", "mathematics"].includes(raw)) return "Mathematics";
  if (raw.includes("science")) return "Science";
  if (raw.includes("social")) return "Social Science";
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

function normalizeSet(value, code) {
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    return String(value).trim();
  }
  return extractSetFromCode(code) || "";
}

function extractSetFromCode(code) {
  const raw = String(code || "").trim();
  if (!raw) return "";
  const parts = raw.split("_");
  return parts.length ? String(parts[parts.length - 1]).trim() : "";
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
  const set = normalizeSet(raw.set, code);

  return {
    id: raw.id || code,
    ...raw,
    code,
    year,
    subject,
    exam_type: examType,
    difficulty,
    set
  };
}

function showLoading(message) {
  const loading = document.getElementById("loading");
  const app = document.getElementById("app");

  if (loading) {
    loading.classList.remove("hidden");
    loading.innerHTML = `<div class="animate-pulse font-bold text-slate-400">${escapeHtml(message || "Loading...")}</div>`;
  }

  if (app) app.classList.add("hidden");
}

function hideLoadingShowApp() {
  const loading = document.getElementById("loading");
  const app = document.getElementById("app");

  if (loading) loading.classList.add("hidden");
  if (app) app.classList.remove("hidden");
}

function showFatal(message) {
  const loading = document.getElementById("loading");
  const app = document.getElementById("app");

  if (app) app.classList.add("hidden");

  if (loading) {
    loading.classList.remove("hidden");
    loading.innerHTML = `
      <div class="text-center max-w-md mx-auto px-4">
        <div class="w-14 h-14 mx-auto rounded-full bg-red-50 text-red-500 flex items-center justify-center text-xl mb-3">
          <i class="fas fa-triangle-exclamation"></i>
        </div>
        <div class="font-bold text-slate-700">${escapeHtml(message || "Something went wrong.")}</div>
      </div>
    `;
  }
}

function showLoggedOutState() {
  const loading = document.getElementById("loading");
  const app = document.getElementById("app");

  if (app) app.classList.add("hidden");

  if (loading) {
    loading.classList.remove("hidden");
    loading.innerHTML = `
      <div class="text-center max-w-md mx-auto px-4">
        <div class="w-14 h-14 mx-auto rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xl mb-3">
          <i class="fas fa-user-lock"></i>
        </div>
        <div class="font-bold text-slate-700">Please sign in to access the vault.</div>
      </div>
    `;
  }
}

function updateHeader(grade) {
  const badge = document.getElementById("context-badge");
  if (badge) badge.textContent = `Grade ${grade}`;

  const welcome = document.getElementById("user-welcome");
  if (welcome && currentUser) {
    welcome.textContent = currentUser.displayName || "Student";
  }
}

async function loadVaultData(grade) {
  if (!automationDB) {
    currentVaultData = [];
    return;
  }

  const q = query(
    collection(automationDB, "Ready4Exam_Vault"),
    where("grade", "==", String(grade))
  );

  const snapshot = await getDocs(q);

  const dedupe = new Map();
  snapshot.forEach((snapDoc) => {
    const item = normalizeVaultItem({
      id: snapDoc.id,
      ...snapDoc.data()
    });

    if (!item.code) return;

    const key = [
      item.year,
      item.subject,
      item.exam_type,
      item.difficulty,
      item.set,
      item.code
    ].join("|");

    dedupe.set(key, item);
  });

  currentVaultData = Array.from(dedupe.values()).sort((a, b) => {
    const yearA = Number(a.year || 0);
    const yearB = Number(b.year || 0);
    if (yearA !== yearB) return yearB - yearA;

    const setA = Number(a.set || 0);
    const setB = Number(b.set || 0);
    if (setA !== setB) return setA - setB;

    return String(a.code).localeCompare(String(b.code));
  });
}

function resolveSubjectOptions() {
  const profileCandidates = [];

  const possibleProfileObjects = [
    window.currentProfile,
    window.__student_profile,
    window.profileData,
    currentUser?.profile
  ];

  for (const obj of possibleProfileObjects) {
    if (obj && Array.isArray(obj.mapped_disciplines) && obj.mapped_disciplines.length) {
      profileCandidates.push(...obj.mapped_disciplines);
    }
  }

  const fromData = [...new Set(
    currentVaultData
      .map((item) => normalizeSubject(item.subject))
      .filter(Boolean)
  )];

  const merged = [...new Set(
    [...profileCandidates, ...fromData].map((s) => normalizeSubject(s)).filter(Boolean)
  )];

  if (!merged.length) merged.push("Mathematics");

  return merged;
}

function resolveAvailableSets(subject, year, examType, difficulty) {
  const subjectNorm = normalizeSubject(subject);
  const filtered = currentVaultData.filter((item) => {
    const matchYear = !year || item.year === String(year);
    const matchSubject = item.subject === subjectNorm;
    const matchType = !examType || item.exam_type === examType;
    const matchDifficulty = !difficulty || difficulty === "all" || item.difficulty === difficulty;
    return matchYear && matchSubject && matchType && matchDifficulty;
  });

  const setValues = [...new Set(filtered.map((item) => String(item.set || extractSetFromCode(item.code) || "")).filter(Boolean))];
  return setValues.sort((a, b) => Number(a) - Number(b));
}

function applyDefaultSelections() {
  const years = [...new Set(currentVaultData.map((item) => String(item.year)).filter(Boolean))];
  if (years.length) {
    const preferred = years.includes(activeYear) ? activeYear : years[0];
    activeYear = preferred;
  }

  const subjectOptions = resolveSubjectOptions();
  if (!subjectOptions.includes(activeSubject)) {
    activeSubject = subjectOptions[0];
  }

  if (activeSubject !== "Mathematics") {
    activeDifficulty = "all";
  }

  const sets = resolveAvailableSets(activeSubject, activeYear, activeType, activeDifficulty);
  if (activeSet !== "all" && !sets.includes(String(activeSet))) {
    activeSet = "all";
  }
}

function setupYearRibbon() {
  const container = document.getElementById("year-ribbon");
  if (!container) return;

  container.innerHTML = "";

  for (let year = 2026; year >= 2022; year--) {
    const yearStr = String(year);
    const count = currentVaultData.filter((item) => item.year === yearStr).length;
    const isActive = activeYear === yearStr;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = [
      "relative px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-sm border",
      isActive
        ? "bg-cbse-blue text-white border-cbse-blue scale-[1.02]"
        : "bg-white text-slate-600 border-slate-200 hover:border-cbse-blue hover:text-cbse-blue"
    ].join(" ");

    btn.dataset.year = yearStr;
    btn.innerHTML = `
      <span>${yearStr}</span>
      <span class="ml-2 text-[10px] font-black ${isActive ? "text-white/90" : "text-slate-400"}">(${count})</span>
    `;

    container.appendChild(btn);
  }
}

function setupFilters() {
  const subjectSelect = document.getElementById("filter-subject");
  const difficultySelect = document.getElementById("filter-difficulty");
  const typeSelect = document.getElementById("filter-type");
  const setSelect = document.getElementById("filter-set");

  if (!subjectSelect || !difficultySelect || !typeSelect || !setSelect) return;

  const subjects = resolveSubjectOptions();
  subjectSelect.innerHTML = "";

  subjects.forEach((subject) => {
    const opt = document.createElement("option");
    opt.value = subject;
    opt.textContent = subject;
    subjectSelect.appendChild(opt);
  });

  subjectSelect.value = activeSubject;

  difficultySelect.disabled = normalizeSubject(activeSubject) !== "Mathematics";
  difficultySelect.value = activeDifficulty;

  typeSelect.value = activeType;

  const sets = resolveAvailableSets(activeSubject, activeYear, activeType, activeDifficulty);
  setSelect.innerHTML = `<option value="all">All Sets</option>`;

  sets.forEach((setValue) => {
    const opt = document.createElement("option");
    opt.value = String(setValue);
    opt.textContent = `Set ${setValue}`;
    setSelect.appendChild(opt);
  });

  setSelect.value = activeSet;
}

function bindEventsOnce() {
  if (listenersBound) return;
  listenersBound = true;

  const subjectSelect = document.getElementById("filter-subject");
  const difficultySelect = document.getElementById("filter-difficulty");
  const typeSelect = document.getElementById("filter-type");
  const setSelect = document.getElementById("filter-set");
  const yearRibbon = document.getElementById("year-ribbon");
  const grid = document.getElementById("pdf-grid");

  if (subjectSelect) {
    subjectSelect.addEventListener("change", async (e) => {
      activeSubject = normalizeSubject(e.target.value);

      if (activeSubject !== "Mathematics") {
        activeDifficulty = "all";
      }

      activeSet = "all";
      setupFilters();
      renderGrid();
    });
  }

  if (difficultySelect) {
    difficultySelect.addEventListener("change", async (e) => {
      activeDifficulty = normalizeDifficulty(e.target.value);
      activeSet = "all";
      setupFilters();
      renderGrid();
    });
  }

  if (typeSelect) {
    typeSelect.addEventListener("change", async (e) => {
      activeType = normalizeExamType(e.target.value);
      activeSet = "all";
      setupFilters();
      renderGrid();
    });
  }

  if (setSelect) {
    setSelect.addEventListener("change", async (e) => {
      activeSet = String(e.target.value || "all");
      renderGrid();
    });
  }

  if (yearRibbon) {
    yearRibbon.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-year]");
      if (!btn) return;
      activeYear = btn.dataset.year || activeYear;
      activeSet = "all";
      setupYearRibbon();
      setupFilters();
      renderGrid();
    });
  }

  if (grid) {
    grid.addEventListener("click", async (e) => {
      const actionButton = e.target.closest("button[data-action]");
      if (!actionButton) return;

      const card = actionButton.closest("[data-index]");
      if (!card) return;

      const index = Number(card.dataset.index);
      const item = currentFilteredItems[index];
      if (!item) return;

      const action = actionButton.dataset.action;

      if (action === "open-qp") {
        openPdfModal(item.qp_url, `${item.code} Question Paper`);
      }

      if (action === "open-ms") {
        openPdfModal(item.ms_url, `${item.code} Marking Scheme`);
      }

      if (action === "toggle-progress") {
        await toggleProgress(item);
      }
    });
  }
}

async function loadProgress(uid) {
  if (!uid) {
    currentProgressMap = {};
    return;
  }

  const q = query(
    collection(studentDB, "user_progress"),
    where("user_id", "==", uid)
  );

  const snapshot = await getDocs(q);

  currentProgressMap = {};
  snapshot.forEach((snapDoc) => {
    const data = snapDoc.data() || {};
    if (data.code) {
      currentProgressMap[String(data.code)] = Boolean(data.completed);
    }
  });
}

function getFilteredItems() {
  const normalizedSubject = normalizeSubject(activeSubject);

  return currentVaultData.filter((item) => {
    const matchYear = activeYear === "All" || item.year === activeYear;
    const matchSubject = normalizedSubject === "All" || item.subject === normalizedSubject;
    const matchType = activeType === "all" || item.exam_type === activeType;
    const matchDifficulty =
      activeSubject !== "Mathematics" ||
      activeDifficulty === "all" ||
      item.difficulty === activeDifficulty;

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
    if (empty) {
      empty.classList.remove("hidden");
      empty.textContent = "No papers found. Try changing year, subject, difficulty, paper type, or set.";
    }
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
        <button
          type="button"
          data-action="open-qp"
          class="py-2 text-[10px] font-bold text-slate-600 bg-slate-50 rounded-xl hover:bg-cbse-blue hover:text-white transition-colors flex items-center justify-center"
        >
          <i class="fas fa-eye mr-1"></i> View Question Paper
        </button>

        <button
          type="button"
          data-action="open-ms"
          class="py-2 text-[10px] font-bold text-cbse-blue bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors flex items-center justify-center"
        >
          <i class="fas fa-check mr-1"></i> View Marking Scheme
        </button>
      </div>

      <button
        type="button"
        data-action="toggle-progress"
        class="mt-3 w-full py-2 text-xs font-bold rounded-xl transition-all ${
          isDone
            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }"
      >
        ${isDone ? "✓ Completed" : "Mark as Completed"}
      </button>
    `;

    grid.appendChild(card);
  });
}

function openPdfModal(url, title) {
  if (!url || url === "#") {
    alert("Document not available yet.");
    return;
  }

  const modal = document.getElementById("pdf-modal");
  const modalTitle = document.getElementById("pdf-modal-title");
  const iframe = document.getElementById("pdf-frame");

  if (!modal || !modalTitle || !iframe) return;

  modalTitle.textContent = title || "Document Viewer";
  iframe.src = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
  modal.classList.remove("hidden");
}

window.openPdfModal = openPdfModal;
window.closePdf = closePdfModal;

function closePdfModal() {
  const modal = document.getElementById("pdf-modal");
  const iframe = document.getElementById("pdf-frame");

  if (modal) modal.classList.add("hidden");
  if (iframe) iframe.src = "about:blank";
}

async function toggleProgress(item) {
  try {
    if (!currentUser?.uid) {
      alert("Please sign in first.");
      return;
    }

    if (!studentDB) {
      alert("Progress database is not ready.");
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
        set: String(item.set || extractSetFromCode(code) || ""),
        completed: nextCompleted,
        updated_at: new Date().toISOString()
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Progress update failed:", error);
    alert("Could not save progress right now.");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
