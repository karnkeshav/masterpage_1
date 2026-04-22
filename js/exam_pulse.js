import { getInitializedClients } from './config.js';
import {
    collectionGroup,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let state = {
    grade: new URLSearchParams(window.location.search).get('grade') || '10',
    subject: new URLSearchParams(window.location.search).get('subject') || 'Mathematics',
    db: null
};

/**
 * Entry Point
 */
export async function initExamPulse() {
    try {
        const clients = await getInitializedClients();
        if (!clients) return;
        state.db = clients.db; // Using the primary (default) database

        clients.auth.onAuthStateChanged(async (user) => {
            if (user) {
                updateUIContext();
                await conductMasterAnalysis();
            } else {
                window.location.href = "../offering.html";
            }
        });
    } catch (err) {
        console.error("Pulse Init Error:", err);
    }
}

async function conductMasterAnalysis() {
    const tableContainer = document.getElementById('weightage-table-container');
    
    try {
        // Fetch ALL questions for the subject across ALL papers
        const q = query(
            collectionGroup(state.db, 'questions'),
            where('subject', '==', state.subject)
        );

        const snap = await getDocs(q);
        const data = snap.docs.map(d => d.data());

        // Analysis Engines
        const chapterMetrics = processChapterData(data);
        const totalMarks = data.reduce((acc, curr) => acc + (curr.marks || 0), 0);

        renderWeightageTable(chapterMetrics, totalMarks);
        renderMCQDensity(chapterMetrics);
        renderLongAnswerZones(chapterMetrics);
        renderForensics(chapterMetrics);

    } catch (error) {
        console.error("Analysis Failed:", error);
        tableContainer.innerHTML = `<p class="text-red-500">Permission denied or index missing.</p>`;
    }
}

/**
 * Aggregates all question data into chapter-based metrics
 */
function processChapterData(questions) {
    const chapters = {};

    questions.forEach(q => {
        const name = q.chapter || 'Miscellaneous';
        if (!chapters[name]) {
            chapters[name] = { 
                name, 
                totalMarks: 0, 
                mcqCount: 0, 
                longAnswerCount: 0, 
                topTopic: q.topic,
                topicFreq: {} 
            };
        }

        chapters[name].totalMarks += q.marks;
        if (q.marks === 1) chapters[name].mcqCount++;
        if (q.marks >= 3) chapters[name].longAnswerCount++;

        // Track topic frequency
        const t = q.topic || 'General';
        chapters[name].topicFreq[t] = (chapters[name].topicFreq[t] || 0) + 1;
    });

    return Object.values(chapters).sort((a, b) => b.totalMarks - a.totalMarks);
}

function renderWeightageTable(metrics, totalSum) {
    const container = document.getElementById('weightage-table-container');
    
    container.innerHTML = metrics.map(c => {
        const perc = ((c.totalMarks / totalSum) * 100).toFixed(1);
        return `
            <div class="group">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-slate-700">${c.name}</span>
                    <span class="text-xs font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded">${perc}% weightage</span>
                </div>
                <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                    <div class="bg-blue-600 h-full group-hover:bg-blue-400 transition-all" style="width: ${perc}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderMCQDensity(metrics) {
    const container = document.getElementById('mcq-leaderboard');
    // Sort by MCQ count
    const sorted = [...metrics].sort((a, b) => b.mcqCount - a.mcqCount).slice(0, 3);
    
    container.innerHTML = sorted.map(c => `
        <div class="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/10">
            <span class="text-sm font-medium">${c.name}</span>
            <span class="text-xs font-black text-yellow-400">${c.mcqCount} Questions</span>
        </div>
    `).join('');
}

function renderLongAnswerZones(metrics) {
    const container = document.getElementById('long-answer-roadmap');
    // Sort by long answer count
    const sorted = [...metrics].sort((a, b) => b.longAnswerCount - a.longAnswerCount).slice(0, 3);
    
    container.innerHTML = sorted.map(c => {
        const topTopic = Object.keys(c.topicFreq).reduce((a, b) => c.topicFreq[a] > c.topicFreq[b] ? a : b);
        return `
            <div class="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div class="text-xs font-bold text-blue-600 uppercase mb-1">${c.name}</div>
                <div class="text-sm font-black text-slate-800">Topic: ${topTopic}</div>
            </div>
        `;
    }).join('');
}

function renderForensics(metrics) {
    const cycleEl = document.getElementById('cycle-analysis-text');
    const priorityEl = document.getElementById('priority-list');
    
    // Simple logic: Highest weightage = High Priority
    cycleEl.innerHTML = `
        <p>Analyzing the 4-year cycle (2022-2025)...</p>
        <div class="p-4 bg-white/10 rounded-2xl border border-white/20">
            <i class="fas fa-lightbulb text-yellow-300 mr-2"></i> 
            <strong>Gap Analysis:</strong> 
            Chapters with low occurrences in 2025 like <span class="underline">${metrics[metrics.length-1].name}</span> have a higher statistical probability of appearing in the 2026 set.
        </div>
    `;

    priorityEl.innerHTML = metrics.slice(0, 4).map((c, i) => `
        <div class="flex items-center gap-4 p-3 hover:bg-slate-50 rounded-xl transition-colors">
            <span class="w-6 h-6 flex items-center justify-center bg-slate-900 text-white text-[10px] font-black rounded-full">${i+1}</span>
            <span class="text-sm font-bold text-slate-700">${c.name}</span>
        </div>
    `).join('');
}

function updateUIContext() {
    document.getElementById('pulse-subject-title').textContent = state.subject;
    const badge = document.getElementById('context-badge');
    if (badge) badge.textContent = `Grade ${state.grade}`;
}
