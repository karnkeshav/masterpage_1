import { getInitializedClients } from './config.js';
import { bindConsoleLogout } from './guard.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURATION ---
const GITHUB_CONFIG = {
    // Replace with your actual GitHub Username and Repo Name
    username: "karnkeshav",
    repo: "masterpage_1",
    branch: "main",
    folder: "archive" 
};

let state = {
    subject: new URLSearchParams(window.location.search).get('subject'),
    data: [] // Local cache of fetched JSON
};

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

async function syncStudentHeader(user, studentDB) {
    const welcomeEl = document.getElementById('user-welcome');
    if (!welcomeEl) return;
    try {
        const userDoc = await getDoc(doc(studentDB, "users", user.uid));
        welcomeEl.textContent = userDoc.exists() ? 
            (userDoc.data().displayName || user.email.split('@')[0]) : 
            (user.displayName || user.email.split('@')[0]);
    } catch (e) {
        welcomeEl.textContent = user.displayName || user.email.split('@')[0];
    }
}

window.handleBack = () => {
    if (state.subject) {
        state.subject = null;
        const url = new URL(window.location);
        url.searchParams.delete('subject');
        window.history.pushState({}, '', url);
        updateNavigationUI();
        showView('subject-selection-view');
    } else {
        window.location.href = "consoles/student.html";
    }
};

function updateNavigationUI() {
    const backText = document.getElementById('back-text');
    if (backText) {
        backText.textContent = state.subject ? "Back to Subject Selection" : "Back to Console";
    }
}

window.selectSubject = async (sub) => {
    state.subject = sub;
    const url = new URL(window.location);
    url.searchParams.set('subject', sub);
    window.history.pushState({}, '', url);
    updateNavigationUI();
    showView('analysis-dashboard-view');
    await runPulseAnalysis();
};

async function runPulseAnalysis() {
    const weightageContainer = document.getElementById('weightage-container');
    const mcqEl = document.getElementById('mcq-hub-list');
    const subjEl = document.getElementById('subjective-zone-list');
    const cyclicalEl = document.getElementById('cyclical-prediction');
    const priorityEl = document.getElementById('priority-list');
    const setsEl = document.getElementById('sets-analyzed-count');
    document.getElementById('subject-tag').textContent = state.subject;

    try {
        // Show Loading State
        weightageContainer.innerHTML = `<p class="text-cbse-blue animate-pulse text-xs font-bold uppercase">Forensic Sync in Progress...</p>`;

        // 1. FETCH FROM GITHUB
        const fileName = `${state.subject.toLowerCase()}_refined.json`;
        const rawUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.username}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.folder}/${fileName}`;
        
        const response = await fetch(rawUrl);
        if (!response.ok) throw new Error("Data stream unavailable");
        
        const records = await response.json();
        const paperIds = new Set(records.map(r => r.paper_id).filter(Boolean));

        if (setsEl) setsEl.textContent = `Sets Analyzed: ${paperIds.size}`;

        const totalMarksAcrossYears = records.reduce((acc, r) => acc + (Number(r.marks) || 0), 0);
        const metrics = aggregateChapterMetrics(records);

        // 2. RENDER WEIGHTAGE
        const byMarks = metrics.slice().sort((a, b) => b.marks - a.marks);
        weightageContainer.innerHTML = byMarks.map(c => {
            const perc = totalMarksAcrossYears > 0 ? ((c.marks / totalMarksAcrossYears) * 100).toFixed(1) : '0.0';
            return `
                <div class="group">
                    <div class="flex justify-between text-[10px] font-black uppercase mb-1.5">
                        <span class="text-slate-600">${c.name}</span>
                        <span class="text-cbse-blue bg-blue-50 px-1.5 rounded">${perc}%</span>
                    </div>
                    <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div class="bg-cbse-blue h-full" style="width: ${perc}%"></div>
                    </div>
                </div>`;
        }).join('');

        // 3. RENDER MCQ HUB (Type check)
        const byMcq = metrics.slice().filter(c => c.mcqs > 0).sort((a, b) => b.mcqs - a.mcqs).slice(0, 3);
        if (mcqEl) {
            mcqEl.innerHTML = byMcq.map(c => `
                <div class="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10">
                    <span class="text-xs font-bold">${c.name}</span>
                    <span class="text-[10px] font-black bg-accent-gold text-slate-900 px-2 rounded">${c.mcqs} Hits</span>
                </div>`).join('');
        }

        // 4. RENDER SUBJECTIVE ZONE
        const bySubjective = metrics.slice().filter(c => c.subjective > 0).sort((a, b) => b.subjective - a.subjective).slice(0, 3);
        if (subjEl) {
            subjEl.innerHTML = bySubjective.map(c => `
                <div class="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span class="text-xs font-bold text-slate-700">${c.name}</span>
                    <span class="text-[10px] font-black bg-cbse-blue text-white px-2 rounded">${c.subjective} Focus</span>
                </div>`).join('');
        }

        // 5. PREDICTIVE PATTERNS
        const cyclical = metrics.slice().sort((a, b) => b.paperCount - a.paperCount).slice(0, 3);
        if (cyclicalEl) {
            cyclicalEl.innerHTML = cyclical.map(c => {
                const freq = Math.round((c.paperCount / paperIds.size) * 100);
                const label = freq >= 90 ? 'Certain' : freq >= 66 ? 'High' : 'Likely';
                return `
                    <div class="bg-white/5 p-4 rounded-2xl border border-white/10">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-xs font-bold">${c.name}</span>
                            <span class="text-[10px] font-black bg-accent-gold text-slate-900 px-2 rounded">${label}</span>
                        </div>
                        <div class="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                            <div class="bg-accent-gold h-full" style="width: ${freq}%"></div>
                        </div>
                    </div>`;
            }).join('');
        }

    } catch (err) {
        weightageContainer.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-xl text-[10px] font-bold uppercase">Data Stream Error</div>`;
    }
}

function aggregateChapterMetrics(records) {
    const chapters = {};
    records.forEach((q) => {
        const name = q.chapter || 'General';
        if (!chapters[name]) {
            chapters[name] = { name, marks: 0, mcqs: 0, subjective: 0, _papers: new Set() };
        }
        const m = Number(q.marks) || 0;
        chapters[name].marks += m;
        if (m === 1) chapters[name].mcqs++; // MCQs & Assertion-Reasoning
        if (m >= 3) chapters[name].subjective++; // Long Answer & Case Based[cite: 1]
        if (q.paper_id) chapters[name]._papers.add(q.paper_id); // Tracks repetitions[cite: 2]
    });
    return Object.values(chapters).map(c => ({
        ...c,
        paperCount: c._papers.size
    }));
}

function showView(viewId) {
    ['subject-selection-view', 'analysis-dashboard-view'].forEach(v => {
        const el = document.getElementById(v);
        if(el) el.classList.toggle('hidden', v !== viewId);
    });
}
