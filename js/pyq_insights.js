import { getInitializedClients } from './config.js';
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Global State ---
let state = {
    grade: new URLSearchParams(window.location.search).get('grade') || '10',
    subject: new URLSearchParams(window.location.search).get('subject') || 'Science',
    chapterID: new URLSearchParams(window.location.search).get('chapter') || 'Chemical_Reactions',
    db: null
};

/**
 * Main Entry Point
 */
export async function initInsights() {
    try {
        const clients = await getInitializedClients();
        
        // Safety Check: If config was missing, clients will be null or incomplete
        if (!clients || !clients.auth) {
            console.error("Auth client failed to initialize.");
            return;
        }

        const { auth, db } = clients;
        state.db = db;

auth.onAuthStateChanged(async (user) => {  
    if (user) {  
        await user.getIdToken(true);  
        document.getElementById('user-welcome').textContent = user.displayName || user.email || 'Student';  
        updateHeaderUI();
        updatePageTitles();
        try {
            await loadChapterMetadata();
            await loadHistoricalQuestions();
        } catch (error) {
            console.error("Data Load Error:", error);
            document.getElementById('app-content').innerHTML = `
                <div class="p-8 text-center bg-red-50 border border-red-200 text-red-600 rounded-xl mt-8 shadow-sm">
                    <h3 class="text-xl font-bold mb-2">Error Loading Data</h3>
                    <p>Failed to retrieve chapter insights. Please try again later.</p>
                </div>`;
        }
    } else {  
        window.location.href = "../index.html";  
    }  
});

    } catch (err) {
        console.error("Detailed Init Error:", err);
    }
}

/**
 * UI: Updates the Header with User Info
 */
function updateHeaderUI() {
    // Update Grade Badge
    const badge = document.getElementById('context-badge');
    if (badge) badge.textContent = `Grade ${state.grade}`;
}

/**
 * UI: Updates Page Headings based on URL Params
 */
function updatePageTitles() {
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
        headerTitle.innerHTML = `
            <span>${state.subject.replace(/_/g, ' ')}</span>
            <span class="text-white opacity-80 text-lg font-medium ml-2">| ${state.chapterID.replace(/_/g, ' ')}</span>
        `;
    }
}

/**
 * Backend: Fetch Grid Intelligence (Heatmap, Blueprint, etc.)
 */
async function loadChapterMetadata() {
    const docRef = doc(state.db, 'Chapter_Analysis', `${state.grade}_${state.subject}_${state.chapterID}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
        const data = snap.data();
        
        // Populate Heatmap
        if (data.heatmap) {
            document.getElementById('heatmap-container').innerHTML = data.heatmap.map(item => `
                <div class="flex justify-between items-center mb-2">
                    <span class="text-sm font-medium text-slate-700">${item.topic}</span>
                    <div class="w-1/2 bg-slate-200 rounded-full h-2">
                        <div class="bg-warning-yellow h-2 rounded-full" style="width: ${item.frequency}%"></div>
                    </div>
                </div>
            `).join('');
        }

        // Populate Blueprint
        if (data.blueprint) {
            document.getElementById('blueprint-1m').textContent = data.blueprint['1m'] || 0;
            document.getElementById('blueprint-2m').textContent = data.blueprint['2m'] || 0;
            document.getElementById('blueprint-3m').textContent = data.blueprint['3m'] || 0;
            document.getElementById('blueprint-5m').textContent = data.blueprint['5m'] || 0;
        }

        // Populate AI Text Sections
        if (data.forensics) document.getElementById('forensics-text').textContent = data.forensics;
        if (data.predictive) document.getElementById('predictive-text').textContent = data.predictive;
        if (data.industry_connection) document.getElementById('industry-connection-text').textContent = data.industry_connection;

    } else {
        document.getElementById('grid-loading').innerHTML = `<p class="p-4 text-slate-500 italic">No intelligence data found.</p>`;
    }
}

/**
 * Backend: Fetch Questions Sub-collection
 */
async function loadHistoricalQuestions() {
    const qRef = collection(state.db, 'Chapter_Analysis', `${state.grade}_${state.subject}_${state.chapterID}`, 'Historical_Questions');
    const qSnap = await getDocs(qRef);
    const container = document.getElementById('compendium-container');

    if (qSnap.empty) {
        container.innerHTML = `<p class="text-center text-slate-500 py-8">No historical questions found.</p>`;
        return;
    }

    const questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderQuestions(questions);
}

function renderQuestions(questions) {
    const container = document.getElementById('compendium-container');
    if (questions.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500 py-8">No historical questions found.</p>`;
        return;
    }

    const grouped = { '1m': [], '2m': [], '3m': [], '5m': [], 'other': [] };
    questions.forEach(q => {
        const mark = (q.marks || '').toString().toLowerCase();
        if (mark === '1' || mark === '1m') grouped['1m'].push(q);
        else if (mark === '2' || mark === '2m') grouped['2m'].push(q);
        else if (mark === '3' || mark === '3m') grouped['3m'].push(q);
        else if (mark === '5' || mark === '5m') grouped['5m'].push(q);
        else grouped['other'].push(q);
    });

    let html = '';
    ['5m', '3m', '2m', '1m', 'other'].forEach(group => {
        if (grouped[group].length > 0) {
            html += `
                <div class="mb-8">
                    <h4 class="text-lg font-bold text-cbse-blue mb-4 border-b-2 border-slate-200 pb-2 flex items-center">
                        <span class="bg-cbse-blue text-white text-xs px-2 py-1 rounded mr-2">${group.toUpperCase()}</span>
                        Questions
                    </h4>
                    <div class="space-y-4">
                        ${grouped[group].map((q, idx) => `
                            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative group hover:border-cbse-blue transition">
                                <div class="absolute top-4 right-4 text-xs font-bold text-slate-400">Year: ${q.year || 'N/A'}</div>
                                <div class="text-sm text-slate-800 font-medium mb-4 pr-16 leading-relaxed">
                                    ${q.question_text || ''}
                                    ${q.image_url ? \`<img src="${q.image_url}" alt="Question Graphic" class="mt-3 max-h-48 rounded border border-slate-200">\` : ''}
                                </div>
                                <button onclick="document.getElementById('logic-${group}-${idx}').classList.toggle('hidden')"
                                        class="text-xs font-bold text-cbse-blue hover:text-accent-gold transition flex items-center gap-1">
                                    <i class="fas fa-magic"></i> Reveal Marking Logic
                                </button>
                                <div id="logic-${group}-${idx}" class="hidden mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-slate-700">
                                    <div class="font-bold text-indigo-800 mb-2 flex items-center gap-2">
                                        <i class="fas fa-check-double"></i> Step-wise Answer (Marking Scheme)
                                    </div>
                                    <div class="whitespace-pre-wrap">${q.answer_logic || 'Marking scheme not available.'}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    });

    container.innerHTML = html;
}
