import { getInitializedClients, getAuthUser } from "./config.js";

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let data = [];
let progress = {};

let year = "2022";
let subject = "Mathematics";
let type = "board_final";
let set = "all";
let difficulty = "all";

document.addEventListener("DOMContentLoaded", init);

async function init() {

  const user = getAuthUser();
  const uid = user?.uid;

  setupYears();
  setupFilters();

  await loadData("10");

  if (uid) {
    await loadProgress(uid); // ✅ safe
  } else {
    console.warn("⚠️ User not logged in, skipping progress");
  }

  render();

  document.getElementById("loading").style.display = "none";
  document.getElementById("app").classList.remove("hidden");
}

function setupYears() {
  const el = document.getElementById("year-ribbon");
  el.innerHTML = "";

  for (let y = 2026; y >= 2022; y--) {
    const btn = document.createElement("button");
    btn.textContent = y;

    btn.className = "px-3 py-1 bg-white border rounded hover:bg-cbse-blue hover:text-white";

    btn.onclick = () => {
      year = y.toString();
      render();
    };

    el.appendChild(btn);
  }
}

function setupFilters() {

  const sub = document.getElementById("filter-subject");

  ["Mathematics"].forEach(s => {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = s;
    sub.appendChild(o);
  });

  sub.onchange = e => { subject = e.target.value; render(); };

  document.getElementById("filter-type").onchange = e => {
    type = e.target.value;
    render();
  };

  document.getElementById("filter-set").onchange = e => {
    set = e.target.value;
    render();
  };

  document.getElementById("filter-difficulty").onchange = e => {
    difficulty = e.target.value;
    render();
  };
}

async function loadData(grade) {

  const { automationDB } = await getInitializedClients();

  if (!automationDB) {
    console.error("❌ automationDB not initialized");
    return;
  }

  const q = query(
    collection(automationDB, "Ready4Exam_Vault"),
    where("grade", "==", grade)
  );

  const snap = await getDocs(q);

  data = [];
  snap.forEach(d => data.push(d.data()));
}

async function loadProgress(uid) {

  if (!uid) return; // ✅ CRITICAL FIX

  const { studentDB } = await getInitializedClients();

  if (!studentDB) {
    console.warn("⚠️ studentDB not available");
    return;
  }

  const q = query(
    collection(studentDB, "user_progress"),
    where("user_id", "==", uid)
  );

  const snap = await getDocs(q);

  progress = {};
  snap.forEach(d => {
    progress[d.data().code] = true;
  });
}

function render() {

  const grid = document.getElementById("pdf-grid");
  const empty = document.getElementById("no-pyq-msg");

  grid.innerHTML = "";

  const filtered = data.filter(d =>
    d.year === year &&
    d.subject === subject &&
    (type === "all" || d.exam_type === type) &&
    (difficulty === "all" || d.difficulty === difficulty) &&
    (set === "all" || d.set == set)
  );

  if (filtered.length === 0) {
    grid.classList.add("hidden");
    if (empty) empty.classList.remove("hidden");
    return;
  }

  grid.classList.remove("hidden");
  if (empty) empty.classList.add("hidden");

  filtered.forEach(d => {

    const done = progress[d.code];

    const card = `
    <div class="bg-white p-4 rounded-2xl border shadow-sm ${done ? 'opacity-60' : ''}">

        <div class="flex justify-between mb-2">
            <span class="text-xs font-bold">${d.year}</span>
            ${done ? '<span class="text-green-600">✓</span>' : ''}
        </div>

        <div class="text-center py-4">
            <div class="text-red-500 text-3xl mb-2">
                <i class="fas fa-file-pdf"></i>
            </div>
            <div class="font-bold">${d.code}</div>
            <div class="text-xs text-slate-500">
                ${d.subject} • ${d.exam_type} • Set ${d.set}
            </div>
        </div>

        <div class="grid grid-cols-2 gap-2 mt-3">
            <button onclick="openPdf('${d.qp_url}', '${d.code} Paper')" 
                class="py-2 text-xs bg-slate-100 rounded-lg hover:bg-cbse-blue hover:text-white">
                Paper
            </button>

            <button onclick="openPdf('${d.ms_url}', '${d.code} Scheme')" 
                class="py-2 text-xs bg-indigo-100 rounded-lg">
                Scheme
            </button>
        </div>

        <button onclick='toggleProgress(${JSON.stringify(d)})'
            class="mt-3 w-full py-2 text-xs rounded-lg ${
                done ? 'bg-green-100 text-green-700' : 'bg-slate-100'
            }'>
            ${done ? '✓ Completed' : 'Mark as Completed'}
        </button>

    </div>
    `;

    grid.innerHTML += card;
  });
}

window.openPdf = (url, title) => {
  if (!url) return;

  document.getElementById("pdf-modal-title").textContent = title;

  document.getElementById("pdf-frame").src =
    `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;

  document.getElementById("pdf-modal").classList.remove("hidden");
};

window.closePdf = () => {
  document.getElementById("pdf-modal").classList.add("hidden");
  document.getElementById("pdf-frame").src = "";
};

window.toggleProgress = async (d) => {

  const user = getAuthUser();
  const uid = user?.uid;

  if (!uid) {
    alert("Please login first");
    return;
  }

  const done = !progress[d.code];
  progress[d.code] = done;
  render();

  const { studentDB } = await getInitializedClients();

  const q = query(
    collection(studentDB, "user_progress"),
    where("user_id", "==", uid),
    where("code", "==", d.code)
  );

  const snap = await getDocs(q);

  if (!snap.empty) {
    await updateDoc(snap.docs[0].ref, {
      completed: done
    });
  } else {
    await addDoc(collection(studentDB, "user_progress"), {
      user_id: uid,
      code: d.code,
      year: d.year,
      subject: d.subject,
      set: d.set,
      completed: true
    });
  }
};
