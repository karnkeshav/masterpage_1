import { getInitializedClients } from './config.js';
import { bindConsoleLogout } from './guard.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";\\

// --- GITHUB DATA CONFIGURATION ---
const GITHUB_CONFIG = {
    username: "karnkeshav",
    repo: "masterpage_1",
    branch: "main",
    folder: "archive" 
};

// Internal state to hold the 12,168 records once fetched
let state = {
    subject: new URLSearchParams(window.location.search).get('subject'),
    data: [], 
    currentPriorityMark: 1 // Default view for Strategic Priority
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
 * Fetches the 10.5MB JSON and populates all dashboard modules
 */
async function runPulseAnalysis() {
    const weightageContainer = document.getElementById('weightage-container');
    const mcqEl = document.getElementById('mcq-hub-list');
    const subjEl = document.getElementById('subjective-zone-list');
    const cyclicalEl = document.getElementById('cyclical-prediction');
    const setsEl = document.getElementById('sets-analyzed-count');
    document.getElementById('subject-tag').textContent = state.subject;

    try {
        // Show Loading State
        weightageContainer.innerHTML = `<p class="text-cbse-blue animate-pulse text-[10px] font-black uppercase">Forensic Sync in Progress...</p>`;

        // Construct URL: e.g., archive/mathematics_refined.json
        const fileName = `${state.subject.toLowerCase().replace(/\s+/g, '_')}_refined.json`;
        const rawUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.username}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.folder}/${fileName}`;
        
        const response = await fetch(rawUrl);
        if (!response.ok) throw new Error("Data stream 404");
        
        state.data = await response.json();
        const paperIds = new Set(state.data.map(r => r.paper_id).filter(Boolean));

        if (setsEl) setsEl.textContent = `Sets Analyzed: ${paperIds.size}`;

        // 1. ANALYZE METRICS
        const totalMarks = state.data.reduce((acc, r) => acc + (Number(r.marks) || 0), 0);
        const metrics = aggregateChapterMetrics(state.data);

        // 2. RENDER WEIGHTAGE
        renderWeightage(metrics, totalMarks, weightageContainer);

        // 3. RENDER POWER-HUBS (1 Mark) & HOT-ZONES (3+ Marks)
        if (mcqEl) renderList(metrics.filter(c => c.mcqs > 0).sort((a,b) => b.mcqs - a.mcqs).slice(0,3), mcqEl, 'mcqs', 'Hits', 'bg-accent-gold text-slate-900');
        if (subjEl) renderList(metrics.filter(c => c.subjective > 0).sort((a,b) => b.subjective - a.subjective).slice(0,3), subjEl, 'subjective', 'Focus', 'bg-cbse-blue text-white');

        // 4. RENDER PREDICTIVE (CYCLICAL) PATTERNS
        if (cyclicalEl) renderPredictive(metrics, paperIds.size, cyclicalEl);

        // 5. RENDER STRATEGIC PRIORITY (Repeated Question Engine)
        renderStrategicPriority(state.currentPriorityMark);

    } catch (err) {
        console.error(err);
        weightageContainer.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-xl text-[10px] font-bold uppercase">Data Stream Error: Check GitHub Path</div>`;
    }
}

/**
 * Logic for the Strategic Priority Section: Filters by marks and repetition
 */
function renderStrategicPriority(selectedMark) {
    const priorityEl = document.getElementById('priority-list');
    if (!priorityEl || !state.data.length) return;

    state.currentPriorityMark = selectedMark;

    // --- 1. THE FORENSIC NOISE BLACKLIST ---
    const JUNK_TOPICS = [
        "EXAM_INSTRUCTIONS", "INSTRUCTIONS", "GENERAL INSTRUCTIONS", 
        "INSTRUCTION", "GENERAL", "TOPIC", "MAP WORK"
    ];

    const JUNK_PHRASES = [
        "QUESTIONS IN THIS SECTION CARRY",
        "READING TIME",
        "GENERAL INSTRUCTIONS",
        "ALL QUESTIONS ARE COMPULSORY",
        "SECTION A", "SECTION B", "SECTION C", "SECTION D", "SECTION E"
    ];

    // Filter for marks and repetition
    const filtered = state.data.filter(q => 
        Number(q.marks) === selectedMark && 
        Number(q.repeat_count) > 1
    );

    const grouped = {};
    filtered.forEach(q => {
        const topicName = (q.topic || "General").toUpperCase().trim();
        const contentUpper = (q.content || "").toUpperCase();

        // --- 2. THE MULTI-STAGE FILTER ---
        // Skip if the topic is in the blacklist
        if (JUNK_TOPICS.includes(topicName)) return;

        // Skip if the content contains administrative junk phrases
        const isAdministrativeNoise = JUNK_PHRASES.some(phrase => contentUpper.includes(phrase));
        if (isAdministrativeNoise) return;

        // Skip if the content is too short (likely a fragment or OCR glitch)
        if (q.content.length < 15) return;

        const key = `${topicName}-${q.repeat_count}`;
        if (!grouped[key]) {
            grouped[key] = { 
                topic: topicName, 
                count: q.repeat_count, 
                questions: [] 
            };
        }
        grouped[key].questions.push(q.content);
    });

    // Sort by repetition count
    const sorted = Object.values(grouped)
        .filter(item => item.questions.length > 0)
        .sort((a, b) => b.count - a.count);

    priorityEl.innerHTML = `
        <div class="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
            ${[1, 2, 3, 4, 5].map(m => `
                <button onclick="window.updatePriorityFilter(${m})" 
                    class="px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all whitespace-nowrap
                    ${state.currentPriorityMark === m ? 'bg-cbse-blue text-white shadow-lg scale-105' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}">
                    ${m} Mark
                </button>
            `).join('')}
        </div>

        <div class="space-y-4">
            ${sorted.length ? sorted.map((item, idx) => `
                <div class="bg-slate-50/50 p-4 rounded-3xl border border-slate-100 group transition-all hover:bg-white hover:shadow-md">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-[9px] font-black text-cbse-blue uppercase tracking-widest mb-1">${item.topic}</p>
                            <h5 class="text-xs font-bold text-slate-700">Repeated in ${item.count} Paper Sets</h5>
                        </div>
                        <button onclick="window.toggleQuestionDetails('q-prio-${idx}')" 
                            class="text-[10px] font-black text-cbse-blue bg-blue-50 px-3 py-1 rounded-full hover:bg-cbse-blue hover:text-white transition-colors">
                            View Questions
                        </button>
                    </div>
                    
                    <div id="q-prio-${idx}" class="hidden mt-4 pt-4 border-t border-slate-200 space-y-3 animate-in fade-in slide-in-from-top-2">
                        ${[...new Set(item.questions)].map(q => `
                            <div class="flex gap-3">
                                <i class="fas fa-arrow-right text-cbse-blue text-[8px] mt-1.5"></i>
                                <p class="text-xs text-slate-600 leading-relaxed font-medium">${q}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('') : `<p class="text-xs text-slate-400 italic text-center py-8">No repeated ${selectedMark}-mark patterns identified.</p>`}
        </div>
    `;
}

// --- GLOBAL INTERFACE FUNCTIONS ---

window.updatePriorityFilter = (marks) => renderStrategicPriority(marks);

window.toggleQuestionDetails = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden');
};

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

// --- HELPER RENDERS ---

function aggregateChapterMetrics(records) {
    const chapters = {};
    records.forEach((q) => {
        const name = q.chapter || 'General';
        if (!chapters[name]) {
            chapters[name] = { name, marks: 0, mcqs: 0, subjective: 0, _papers: new Set() };
        }
        const m = Number(q.marks) || 0;
        chapters[name].marks += m;
        if (m === 1) chapters[name].mcqs++; 
        if (m >= 3) chapters[name].subjective++; 
        if (q.paper_id) chapters[name]._papers.add(q.paper_id);
    });
    return Object.values(chapters).map(c => ({ ...c, paperCount: c._papers.size }));
}

function renderWeightage(metrics, totalMarks, container) {
    const sorted = metrics.slice().sort((a, b) => b.marks - a.marks);
    container.innerHTML = sorted.map(c => {
        const perc = totalMarks > 0 ? ((c.marks / totalMarks) * 100).toFixed(1) : '0.0';
        return `
            <div class="group">
                <div class="flex justify-between text-[10px] font-black uppercase mb-1.5">
                    <span class="text-slate-600">${c.name}</span>
                    <span class="text-cbse-blue bg-blue-50 px-1.5 rounded">${perc}%</span>
                </div>
                <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div class="bg-cbse-blue h-full transition-all duration-1000" style="width: ${perc}%"></div>
                </div>
            </div>`;
    }).join('');
}

function renderList(data, el, key, label, badgeClass) {
    el.innerHTML = data.map(item => `
        <div class="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10">
            <span class="text-xs font-bold truncate pr-2">${item.name}</span>
            <span class="text-[10px] font-black ${badgeClass} px-2 rounded whitespace-nowrap">${item[key]} ${label}</span>
        </div>`).join('');
}

function renderPredictive(metrics, totalSets, el) {
    const cyclical = metrics.slice().sort((a, b) => b.paperCount - a.paperCount).slice(0, 3);
    el.innerHTML = cyclical.map(c => {
        const freq = Math.round((c.paperCount / totalSets) * 100);
        const tag = freq >= 85 ? 'High Prob' : freq >= 60 ? 'Cyclical' : 'Emerging';
        return `
            <div class="bg-white/5 p-4 rounded-2xl border border-white/10">
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
