import { getInitializedClients } from './config.js';
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- State Management ---
let state = {
    grade: '',
    subject: '',
    chapterID: '',
    db: null
};

// --- Core Initialization ---
export async function initInsights() {
    const urlParams = new URLSearchParams(window.location.search);
    state.grade = urlParams.get('grade') || '10';
    state.subject = urlParams.get('subject') || 'Science';
    state.chapterID = urlParams.get('chapter') || urlParams.get('chapterID') || 'Chemical_Reactions';

    const { auth, db } = await getInitializedClients();
    state.db = db;

   auth.onAuthStateChanged(async (user) => {
    if (user) {
        // --- ADD THESE LINES TO FIX THE HEADER ---
        
        // 1. Update the Grade Badge manually
        const badge = document.getElementById('context-badge');
        if (badge) {
            badge.textContent = `Grade ${grade}`; 
        }

        // 2. Update the User Name
        // Most shell.js templates use a span with id "user-name" or class "user-welcome-name"
        const nameDisplay = document.querySelector('.user-welcome-name') || document.getElementById('user-name');
        if (nameDisplay) {
            nameDisplay.textContent = user.displayName || user.email.split('@')[0];
        }

        // --- END OF HEADER FIX ---

        await user.getIdToken(true);  
        loadChapterInsights(db);
    } else {
        window.location.href = "../index.html";
    }
});
}

// --- Section 1: The Intelligence Grid (Metadata) ---
async function loadChapterData() {
    try {
        const docId = `${state.grade}_${state.subject}_${state.chapterID}`;
        const metaSnap = await getDoc(doc(state.db, 'Chapter_Analysis', docId));

        if (metaSnap.exists()) {
            const data = metaSnap.data();
            renderHeatmap(data.heatmap);
            renderBlueprint(data.blueprint);
            renderAIPredictions(data);
        } else {
            document.getElementById('grid-loading').innerHTML = `<p>No data found.</p>`;
        }
    } catch (err) {
        console.error("Grid Error:", err);
    }
}

// --- Section 2: Historical Compendium ---
async function loadHistoricalQuestions() {
    const path = `Chapter_Analysis/${state.grade}_${state.subject}_${state.chapterID}/Historical_Questions`;
    const qSnap = await getDocs(collection(state.db, path));
    const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderQuestionsList(questions);
}

// --- UI Rendering Helpers ---
function renderHeatmap(heatmapData = []) {
    const container = document.getElementById('heatmap-container');
    container.innerHTML = heatmapData.map(item => `
        <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-medium text-slate-700">${item.topic}</span>
            <div class="w-1/2 bg-slate-200 rounded-full h-2">
                <div class="bg-warning-yellow h-2 rounded-full" style="width: ${item.frequency}%"></div>
            </div>
        </div>
    `).join('');
}

// ... Additional render functions for Blueprint and Questions
