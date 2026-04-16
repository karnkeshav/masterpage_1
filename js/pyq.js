import { getInitializedClients } from "./config.js";

const { studentDB } = await getInitializedClients(); ✅

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
    const user = window.currentUser || {};

    setupYears();
    setupFilters();

    await loadData("10");
    await loadProgress(user.uid);

    render();

    document.getElementById("loading").style.display = "none";
    document.getElementById("app").classList.remove("hidden");
}

function setupYears() {
    const el = document.getElementById("year-ribbon");
    for (let y = 2026; y >= 2022; y--) {
        const btn = document.createElement("button");
        btn.textContent = y;
        btn.onclick = () => { year = y.toString(); render(); };
        btn.className = "px-3 py-1 bg-white border rounded";
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
        type = e.target.value; render();
    };

    document.getElementById("filter-set").onchange = e => {
        set = e.target.value; render();
    };

    document.getElementById("filter-difficulty").onchange = e => {
        difficulty = e.target.value; render();
    };
}

async function loadData(grade) {
    const { automationDB } = await getInitializedClients();

    const q = query(
        collection(automationDB, "Ready4Exam_Vault"),
        where("grade", "==", grade)
    );

    const snap = await getDocs(q);

    data = [];
    snap.forEach(d => data.push(d.data()));
}

async function loadProgress(uid) {
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
    grid.innerHTML = "";

    data
    .filter(d =>
        d.year === year &&
        d.subject === subject &&
        (type === "all" || d.exam_type === type) &&
        (difficulty === "all" || d.difficulty === difficulty) &&
        (set === "all" || d.set == set)
    )
    .forEach(d => {

        const done = progress[d.code];

        const card = `
        <div class="bg-white p-4 rounded shadow ${done ? 'opacity-60' : ''}">

            <div class="flex justify-between mb-2">
                <span>${d.year}</span>
                ${done ? '<span class="text-green-600">✓</span>' : ''}
            </div>

            <div class="text-center">
                <div class="text-red-500 text-2xl mb-2"><i class="fas fa-file-pdf"></i></div>
                <div class="font-bold">${d.code}</div>
                <div class="text-sm text-gray-500">Set ${d.set}</div>
            </div>

            <div class="grid grid-cols-2 gap-2 mt-3">
                <button onclick="openPdf('${d.qp_url}')">Paper</button>
                <button onclick="openPdf('${d.ms_url}')">Scheme</button>
            </div>

            <button onclick='toggle(${JSON.stringify(d)})'
            class="mt-2 w-full ${done ? 'bg-green-100' : 'bg-gray-100'}">
                ${done ? 'Completed' : 'Mark Done'}
            </button>

        </div>
        `;

        grid.innerHTML += card;
    });
}

window.openPdf = (url) => {
    document.getElementById("pdf-frame").src =
        `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
    document.getElementById("pdf-modal").style.display = "flex";
};

window.closePdf = () => {
    document.getElementById("pdf-modal").style.display = "none";
};

window.toggle = async (d) => {

    const uid = window.currentUser?.uid;
    if (!uid) return;

    const done = !progress[d.code];
    progress[d.code] = done;
    render();

    const q = query(
        collection(studentDB, "user_progress"),
        where("user_id", "==", uid),
        where("code", "==", d.code)
    );

    const snap = await getDocs(q);

    if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, { completed: done });
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
