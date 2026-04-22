import { getInitializedClients } from './config.js';
import {
    doc,
    getDoc,
    collection,
    getDocs,
    query,
    where,
    collectionGroup
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let state = {
    grade: new URLSearchParams(window.location.search).get('grade') || '10',
    subject: new URLSearchParams(window.location.search).get('subject') || 'Mathematics',
    chapterID: new URLSearchParams(window.location.search).get('chapter') || 'Real_Numbers',
    db: null
};

const normalizeChapter = (slug) => slug.replace(/_/g, ' ').trim();

export async function initInsights() {
    try {
        const clients = await getInitializedClients();
        if (!clients) return;
        state.db = clients.automationDB;

        clients.auth.onAuthStateChanged(async (user) => {
            if (user) {
                updateHeaderUI();
                updatePageTitles();
                await runDeepAnalysis(); // This powers everything
            } else {
                window.location.href = "../offering.html";
            }
        });
    } catch (err) {
        console.error("Init Error:", err);
    }
}

async function runDeepAnalysis() {
    const chapterName = normalizeChapter(state.chapterID);
    const container = document.getElementById('compendium-container');

    try {
        // 1. Single efficient fetch for the entire chapter history
        const q = query(
            collectionGroup(state.db, 'questions'),
            where('subject', '==', state.subject),
            where('chapter', '==', chapterName)
        );

        const snap = await getDocs(q);
        const questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 2. Data Processing (One loop for all cards)
        const blueprint = { '1': 0, '2': 0, '3': 0, '5': 0 };
        const topicMap = {};
        let subjectiveCount = 0;

        questions.forEach(q => {
            // Count Blueprint Marks
            const m = String(q.marks);
            if (blueprint.hasOwnProperty(m)) blueprint[m]++;
            
            // Map Heatmap Topics
            const t = q.topic || 'General';
            topicMap[t] = (topicMap[t] || 0) + 1;

            // Pattern for Forensics
            if (q.type?.toLowerCase() === 'subjective') subjectiveCount++;
        });

        // 3. Update the UI Components
        renderBlueprint(blueprint);
        renderHeatmap(topicMap, questions.length);
        renderForensics(subjectiveCount, questions.length, chapterName);
        renderPredictive(topicMap);
        renderCompendium(questions);

        // 4. Load static meta (Real world)
        loadMeta();

    } catch (err) {
        console.error("Analysis Failed:", err);
        container.innerHTML = `<p class="text-red-500">Failed to load archive.</p>`;
    }
}

/** UI RENDERING FUNCTIONS **/

function renderBlueprint(data) {
    document.getElementById('blueprint-1m').textContent = data['1'] || 0;
    document.getElementById('blueprint-2m').textContent = data['2'] || 0;
    document.getElementById('blueprint-3m').textContent = data['3'] || 0;
    document.getElementById('blueprint-5m').textContent = data['5'] || 0;
}

function renderHeatmap(topicMap, total) {
    const container = document.getElementById('heatmap-container');
    container.innerHTML = '';
    
    // Sort topics by frequency and take top 4
    Object.entries(topicMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .forEach(([topic, count]) => {
            const perc = Math.round((count / total) * 100);
            container.innerHTML += `
                <div>
                    <div class="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-1">
                        <span>${topic}</span>
                        <span>${perc}%</span>
                    </div>
                    <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div class="bg-blue-600 h-full rounded-full" style="width: ${perc}%"></div>
                    </div>
                </div>
            `;
        });
}

function renderForensics(subCount, total, chapter) {
    const el = document.getElementById('forensics-text');
    const ratio = (subCount / total) * 100;
    
    if (ratio > 65) {
        el.innerHTML = `<strong>Weightage Pattern:</strong> This chapter is highly subjective. Focus on writing formal steps and diagrams.`;
    } else if (ratio < 35) {
        el.innerHTML = `<strong>Weightage Pattern:</strong> Objective-heavy. Focus on speed and conceptual clarity for MCQs.`;
    } else {
        el.innerHTML = `<strong>Weightage Pattern:</strong> Balanced mix of theoretical and objective questions.`;
    }
}

function renderPredictive(topicMap) {
    const el = document.getElementById('predictive-text');
    const topTopic = Object.keys(topicMap).reduce((a, b) => topicMap[a] > topicMap[b] ? a : b, 'Standard Concepts');
    el.innerHTML = `Probability High for: <span class="font-bold underline decoration-green-300">"${topTopic}"</span>`;
}

function renderCompendium(questions) {
    const container = document.getElementById('compendium-container');
    if (questions.length === 0) {
        container.innerHTML = `<p class="text-slate-400 italic">No historical data available for this selection.</p>`;
        return;
    }

    container.innerHTML = questions.map(q => `
        <div class="group p-5 border border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/20 transition-all">
            <div class="flex items-start justify-between gap-4">
                <div class="space-y-2">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded">${q.marks}M</span>
                        <span class="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">${q.topic || 'General'}</span>
                    </div>
                    <p class="text-slate-700 font-medium leading-relaxed">${q.text || 'Question text unavailable.'}</p>
                </div>
                <div class="text-right whitespace-nowrap">
                    <span class="text-[10px] font-black text-slate-300 group-hover:text-blue-500">PYQ 2022-25</span>
                </div>
            </div>
        </div>
    `).join('');
}

async function loadMeta() {
    const docRef = doc(state.db, 'Chapter_Analysis', `${state.grade}_${state.subject}_${state.chapterID}`);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        document.getElementById('industry-connection-text').textContent = 
            snap.data().real_world || "Loading industry connection...";
    }
}

function updateHeaderUI() {
    const badge = document.getElementById('context-badge');
    if (badge) badge.textContent = `Grade ${state.grade}`;
}

function updatePageTitles() {
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
        headerTitle.innerHTML = `
            ${state.subject} 
            <span class="text-white opacity-60 text-lg font-normal ml-2">| ${normalizeChapter(state.chapterID)}</span>
        `;
    }
}
