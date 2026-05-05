import { getInitializedClients } from './config.js';
import { bindConsoleLogout } from './guard.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- GITHUB DATA CONFIGURATION ---
const GITHUB_CONFIG = {
    username: "karnkeshav",
    repo: "masterpage_1",
    branch: "main",
    folder: "archive" 
};

// Internal state
let state = {
    subject: new URLSearchParams(window.location.search).get('subject'),
    data: [], 
    currentPriorityMark: 1
};

/**
 * Entry point: Authenticates user and triggers data fetch
 */
export async function initExamPulse() {
    const clients = await getInitializedClients();
    if (!clients) return;
    
    bindConsoleLogout("logout-nav-btn", "../index.html");

    clients.auth.onAuthStateChanged(async (user) => {
        if (user) {
            await syncStudentHeader(user, clients.db);
            updateNavigationUI(); 
            
            if (state.subject) {
                showView('analysis-dashboard-view');
                await runPulseAnalysis();
            } else {
                showView('subject-selection-view');
            }
        } else {
            window.location.href = "../offering.html";
        }
    });
}

/**
 * Main Analysis Engine
 */
async function runPulseAnalysis() {
    const weightageContainer = document.getElementById('weightage-container');
    const mcqEl = document.getElementById('mcq-hub-list');
    const subjEl = document.getElementById('subjective-zone-list');
    const cyclicalEl = document.getElementById('cyclical-prediction');
    const setsEl = document.getElementById('sets-analyzed-count');
    const subjectTag = document.getElementById('subject-tag');

    if (subjectTag) subjectTag.textContent = state.subject;

    try {
        if (weightageContainer) {
            weightageContainer.innerHTML = `<p class="text-cbse-blue animate-pulse text-[10px] font-black uppercase">Forensic Sync in Progress...</p>`;
        }

        const fileName = `${state.subject.toLowerCase().replace(/\s+/g, '_')}_refined.json`;
        const rawUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.username}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.folder}/${fileName}`;
        
        const response = await fetch(rawUrl);
        if (!response.ok) throw new Error("Data stream 404");
        
        state.data = await response.json();
        const paperIds = new Set(state.data.map(r => r.paper_id).filter(Boolean));

        if (setsEl) setsEl.textContent = `Sets Analyzed: ${paperIds.size}`;

        const totalMarks = state.data.reduce((acc, r) => acc + (Number(r.marks) || 0), 0);
        const metrics = aggregateChapterMetrics(state.data);

        if (weightageContainer) renderWeightage(metrics, totalMarks, weightageContainer);

        if (mcqEl) renderList(metrics.filter(c => c.mcqs > 0).sort((a,b) => b.mcqs - a.mcqs).slice(0,3), mcqEl, 'mcqs', 'Hits', 'bg-accent-gold text-slate-900');
        if (subjEl) renderList(metrics.filter(c => c.subjective > 0).sort((a,b) => b.subjective - a.subjective).slice(0,3), subjEl, 'subjective', 'Focus', 'bg-cbse-blue text-white');

        if (cyclicalEl) renderPredictive(metrics, paperIds.size, cyclicalEl);

        renderStrategicPriority(state.currentPriorityMark);

    } catch (err) {
        console.error(err);
        if (weightageContainer) {
            weightageContainer.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-xl text-[10px] font-bold uppercase">Data Stream Error</div>`;
        }
    }
}

/**
 * Logic for the Strategic Priority Section: Filters junk and formats math
 */
function renderStrategicPriority(selectedMark) {
    const priorityEl = document.getElementById('priority-list');
    if (!priorityEl || !state.data.length) return;

    state.currentPriorityMark = selectedMark;

    // --- 1. EXPANDED NOISE FILTER ---
    const JUNK_TOPICS = ["EXAM_INSTRUCTIONS", "INSTRUCTIONS", "GENERAL INSTRUCTIONS", "INSTRUCTION", "GENERAL", "TOPIC"];
    const JUNK_PHRASES = [
        "15 MINUTES ALLOTTED", 
        "15-MINUTE PERIOD", 
        "READ THE QUESTION PAPER", 
        "QUESTIONS IN THIS SECTION", 
        "ALL QUESTIONS ARE COMPULSORY"
    ];

    const filtered = state.data.filter(q => 
        Number(q.marks) === selectedMark && 
        Number(q.repeat_count) > 1
    );

    const grouped = {};
    filtered.forEach(q => {
        const topicName = (q.topic || "General").toUpperCase().trim();
        const contentUpper = (q.content || "").toUpperCase();

        // Strict skip for the "15-minute" anomaly even if tagged as REAL NUMBERS
        if (JUNK_TOPICS.includes(topicName)) return;
        const isNoise = JUNK_PHRASES.some(phrase => contentUpper.includes(phrase));
        if (isNoise || q.content.length < 20) return;

        const key = `${topicName}-${q.repeat_count}`;
        if (!grouped[key]) {
            grouped[key] = { topic: topicName, count: q.repeat_count, questions: [] };
        }
        grouped[key].questions.push(q.content);
    });

    const sorted = Object.values(grouped).sort((a, b) => b.count - a.count);

    priorityEl.innerHTML = `
        <div class="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
            ${[1, 2, 3, 4, 5].map(m => `
                <button onclick="window.updatePriorityFilter(${m})" 
                    class="px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all
                    ${state.currentPriorityMark === m ? 'bg-cbse-blue text-white' : 'bg-slate-100 text-slate-400'}">
                    ${m} Mark
                </button>
            `).join('')}
        </div>
        <div class="space-y-4">
            ${sorted.map((item, idx) => `
                <div class="bg-slate-50/50 p-4 rounded-3xl border border-slate-100">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-[9px] font-black text-cbse-blue uppercase mb-1">${item.topic}</p>
                            <h5 class="text-xs font-bold text-slate-700">Repeated in ${item.count} Paper Sets</h5>
                        </div>
                        <button onclick="window.toggleQuestionDetails('q-prio-${idx}')" 
                            class="text-[10px] font-black text-cbse-blue bg-blue-50 px-3 py-1 rounded-full">
                            View Questions
                        </button>
                    </div>
                    <div id="q-prio-${idx}" class="hidden mt-4 pt-4 border-t border-slate-200 space-y-4">
                        ${[...new Set(item.questions)].map(q => `
                            <div class="flex gap-3">
                                <i class="fas fa-arrow-right text-cbse-blue text-[8px] mt-1.5"></i>
                                <p class="text-xs text-slate-600 leading-relaxed font-medium">
                                    ${formatMathText(q)}
                                </p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * --- MATH RENDERING ENGINE ---
 * Converts raw OCR text/exponents into clean HTML formatting
 */
function formatMathText(text) {
    if (!text) return "";
    
    return text
        // 1. Convert sqrt(abc) to √abc
        .replace(/sqrt\(([^)]+)\)/g, '√($1)')
        // 2. Convert ^2, ^3, etc. to superscripts
        .replace(/\^(\d+)/g, '<sup>$1</sup>')
        // 3. Convert x1, y1 to subscripts
        .replace(/([a-zA-Z])(\d)/g, '$1<sub>$2</sub>')
        // 4. Convert standard operators for better readability
        .replace(/\*/g, ' × ')
        .replace(/PI/gi, 'π')
        .replace(/alpha/gi, 'α')
        .replace(/beta/gi, 'β')
        .replace(/theta/gi, 'θ');
}

// --- GLOBAL ATTACHMENTS ---
window.updatePriorityFilter = (marks) => renderStrategicPriority(marks);
window.toggleQuestionDetails = (id) => document.getElementById(id)?.classList.toggle('hidden');
window.handleBack = () => {
    if (state.subject) {
        state.subject = null;
        window.history.pushState({}, '', window.location.pathname);
        updateNavigationUI();
        showView('subject-selection-view');
    } else {
        window.location.href = "consoles/student.html";
    }
};
window.selectSubject = async (sub) => {
    state.subject = sub;
    const url = new URL(window.location);
    url.searchParams.set('subject', sub);
    window.history.pushState({}, '', url);
    updateNavigationUI();
    showView('analysis-dashboard-view');
    await runPulseAnalysis();
};

// --- HELPERS ---
function aggregateChapterMetrics(records) {
    const chapters = {};
    records.forEach((q) => {
        const name = q.chapter || 'General';
        if (!chapters[name]) chapters[name] = { name, marks: 0, mcqs: 0, subjective: 0, _papers: new Set() };
        const m = Number(q.marks) || 0;
        chapters[name].marks += m;
        if (m === 1) chapters[name].mcqs++; 
        if (m >= 3) chapters[name].subjective++; 
        if (q.paper_id) chapters[name]._papers.add(q.paper_id);
    });
    return Object.values(chapters).map(c => ({ ...c, paperCount: c._papers.size }));
}

function renderWeightage(metrics, totalMarks, container) {
    container.innerHTML = metrics.sort((a,b) => b.marks - a.marks).map(c => {
        const perc = totalMarks > 0 ? ((c.marks / totalMarks) * 100).toFixed(1) : '0.0';
        return `
            <div class="mb-3">
                <div class="flex justify-between text-[10px] font-black uppercase mb-1">
                    <span class="text-slate-600">${c.name}</span>
                    <span class="text-cbse-blue">${perc}%</span>
                </div>
                <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div class="bg-cbse-blue h-full" style="width: ${perc}%"></div>
                </div>
            </div>`;
    }).join('');
}

function renderList(data, el, key, label, badgeClass) {
    el.innerHTML = data.map(item => `
        <div class="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10 mb-2">
            <span class="text-xs font-bold truncate pr-2">${item.name}</span>
            <span class="text-[10px] font-black ${badgeClass} px-2 rounded">${item[key]} ${label}</span>
        </div>`).join('');
}

function renderPredictive(metrics, totalSets, el) {
    el.innerHTML = metrics.sort((a,b) => b.paperCount - a.paperCount).slice(0,3).map(c => {
        const freq = Math.round((c.paperCount / totalSets) * 100);
        const tag = freq >= 85 ? 'High Prob' : freq >= 60 ? 'Cyclical' : 'Emerging';
        return `
            <div class="bg-white/5 p-4 rounded-2xl border border-white/10 mb-2">
                <div class="flex justify-between items-center mb-2">
                    <span class="text-xs font-bold">${c.name}</span>
                    <span class="text-[9px] font-black bg-accent-gold text-slate-900 px-2 rounded uppercase">${tag}</span>
                </div>
                <div class="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                    <div class="bg-accent-gold h-full" style="width: ${freq}%"></div>
                </div>
            </div>`;
    }).join('');
}

async function syncStudentHeader(user, db) {
    const welcomeEl = document.getElementById('user-welcome');
    if (!welcomeEl) return;
    const userDoc = await getDoc(doc(db, "users", user.uid));
    welcomeEl.textContent = userDoc.exists() ? (userDoc.data().displayName || user.email.split('@')[0]) : user.email.split('@')[0];
}

function updateNavigationUI() {
    const backText = document.getElementById('back-text');
    if (backText) backText.textContent = state.subject ? "Back to Subject Selection" : "Back to Dashboard";
}

function showView(viewId) {
    ['subject-selection-view', 'analysis-dashboard-view'].forEach(v => {
        const el = document.getElementById(v);
        if(el) el.classList.toggle('hidden', v !== viewId);
    });
}
