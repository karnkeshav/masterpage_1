import { getInitializedClients } from './config.js';
import { bindConsoleLogout } from './guard.js';
import { 
    collectionGroup, 
    query, 
    where, 
    getDocs,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let state = {
    db: null,
    studentDB: null,
    subject: new URLSearchParams(window.location.search).get('subject'),
};

export async function initExamPulse() {
    const clients = await getInitializedClients();
    if (!clients) return;
    bindConsoleLogout("logout-nav-btn", "../index.html");
    // The Question Vault (Ready4Exam_Vault/{paper}/questions) lives in the
    // automation Firebase project, NOT the master/student project.
    state.db = clients.automationDB;
    state.studentDB = clients.db;

    clients.auth.onAuthStateChanged(async (user) => {
        if (user) {
            // FIXED: Added missing function call and definition
            await syncStudentHeader(user);
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

// FIXED: Defined the missing function
async function syncStudentHeader(user) {
    const welcomeEl = document.getElementById('user-welcome');
    if (!welcomeEl) return;
    try {
        const userDoc = await getDoc(doc(state.studentDB, "users", user.uid));
        if (userDoc.exists()) {
            welcomeEl.textContent = userDoc.data().displayName || user.email.split('@')[0];
        } else {
            welcomeEl.textContent = user.displayName || user.email.split('@')[0];
        }
    } catch (e) {
        welcomeEl.textContent = user.displayName || user.email.split('@')[0];
    }
}

// SMART NAVIGATION LOGIC
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
        // No orderBy — avoids requiring a composite index and avoids dropping
        // docs that are missing the sort field. Sorting happens client-side.
        const q = query(
            collectionGroup(state.db, 'questions'),
            where('subject', '==', state.subject)
        );

        const snap = await getDocs(q);
        const records = snap.docs.map(d => ({
            data: d.data(),
            paperId: d.ref.parent.parent ? d.ref.parent.parent.id : null
        }));
        const paperIds = new Set(records.map(r => r.paperId).filter(Boolean));

        if (setsEl) setsEl.textContent = `Sets Analyzed: ${paperIds.size}`;

        if (records.length === 0) {
            weightageContainer.innerHTML = `<p class="text-slate-400 text-sm">No archive data found for ${state.subject}.</p>`;
            if (mcqEl) mcqEl.innerHTML = `<p class="text-xs text-white/60 font-medium">No MCQ data yet.</p>`;
            if (subjEl) subjEl.innerHTML = `<p class="text-xs text-slate-400 font-medium">No long-answer data yet.</p>`;
            if (cyclicalEl) cyclicalEl.innerHTML = `<p class="text-xs text-white/70 font-medium">No cyclical pattern detected yet.</p>`;
            if (priorityEl) priorityEl.innerHTML = `<p class="text-xs text-slate-400 font-medium">No priorities to show.</p>`;
            return;
        }

        const totalMarksAcrossYears = records.reduce((acc, r) => acc + (Number(r.data.marks) || 0), 0);
        const metrics = aggregateChapterMetrics(records);
        const totalPapers = paperIds.size;

        // Cumulative Mark Weightage
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

        // MCQ Power-Hubs
        const byMcq = metrics.slice().filter(c => c.mcqs > 0).sort((a, b) => b.mcqs - a.mcqs).slice(0, 3);
        if (mcqEl) {
            mcqEl.innerHTML = byMcq.length === 0
                ? `<p class="text-xs text-white/60 font-medium">No MCQ data in this archive.</p>`
                : byMcq.map(c => `
                    <div class="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10">
                        <span class="text-xs font-bold">${c.name}</span>
                        <span class="text-[10px] font-black bg-accent-gold text-slate-900 px-2 rounded">${c.mcqs} Hits</span>
                    </div>`).join('');
        }

        // Subjective Hot-Zones
        const bySubjective = metrics.slice().filter(c => c.subjective > 0).sort((a, b) => b.subjective - a.subjective).slice(0, 3);
        if (subjEl) {
            subjEl.innerHTML = bySubjective.length === 0
                ? `<p class="text-xs text-slate-400 font-medium">No long-answer data in this archive.</p>`
                : bySubjective.map(c => `
                    <div class="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <span class="text-xs font-bold text-slate-700">${c.name}</span>
                        <span class="text-[10px] font-black bg-cbse-blue text-white px-2 rounded">${c.subjective} Longs</span>
                    </div>`).join('');
        }

        // Predictive Intelligence — chapters that repeat across the most papers
        const cyclical = metrics.slice().sort((a, b) => b.paperCount - a.paperCount).slice(0, 3);
        if (cyclicalEl) {
            cyclicalEl.innerHTML = cyclical.length === 0 || totalPapers === 0
                ? `<p class="text-xs text-white/70 font-medium">No cyclical pattern detected yet.</p>`
                : cyclical.map(c => {
                    const freq = Math.round((c.paperCount / totalPapers) * 100);
                    const label = freq >= 90 ? 'Certain' : freq >= 66 ? 'Highly Likely' : freq >= 33 ? 'Likely' : 'Possible';
                    return `
                        <div class="bg-white/5 p-4 rounded-2xl border border-white/10">
                            <div class="flex justify-between items-center mb-2">
                                <span class="text-xs font-bold">${c.name}</span>
                                <span class="text-[10px] font-black bg-accent-gold text-slate-900 px-2 rounded">${label}</span>
                            </div>
                            <div class="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                                <div class="bg-accent-gold h-full" style="width: ${freq}%"></div>
                            </div>
                            <div class="text-[10px] text-white/60 font-bold mt-1.5 uppercase tracking-wider">Appears in ${c.paperCount} of ${totalPapers} sets (${freq}%)</div>
                        </div>`;
                }).join('');
        }

        // Strategic Priority — top 5 by cumulative marks
        const topPriority = byMarks.slice(0, 5);
        if (priorityEl) {
            priorityEl.innerHTML = topPriority.length === 0
                ? `<p class="text-xs text-slate-400 font-medium">No priorities to show.</p>`
                : topPriority.map((c, i) => {
                    const tier = i === 0 ? { label: 'Critical', cls: 'bg-danger-red text-white' }
                        : i < 2 ? { label: 'High', cls: 'bg-warning-yellow text-slate-900' }
                        : { label: 'Medium', cls: 'bg-slate-100 text-slate-700' };
                    return `
                        <div class="flex justify-between items-center p-3 rounded-xl border border-slate-100">
                            <span class="text-xs font-bold text-slate-700">${c.name}</span>
                            <span class="text-[10px] font-black px-2 py-0.5 rounded ${tier.cls}">${tier.label}</span>
                        </div>`;
                }).join('');
        }

    } catch (err) {
        console.error("Forensic Analysis Error:", err);
        weightageContainer.innerHTML = `<div class="p-4 bg-amber-50 text-amber-700 rounded-xl text-[10px] font-bold uppercase tracking-tight">
            Security nodes are synchronizing. Hard-refresh (Ctrl+F5) in 60 seconds.
        </div>`;
    }
}

function aggregateChapterMetrics(records) {
    const chapters = {};
    records.forEach(({ data, paperId }) => {
        const name = data.chapter || 'Foundation';
        if (!chapters[name]) {
            chapters[name] = { name, marks: 0, mcqs: 0, subjective: 0, _papers: new Set() };
        }
        const marks = Number(data.marks) || 0;
        chapters[name].marks += marks;
        if (marks === 1) chapters[name].mcqs++;
        if (marks >= 3) chapters[name].subjective++;
        if (paperId) chapters[name]._papers.add(paperId);
    });
    return Object.values(chapters).map(c => ({
        name: c.name,
        marks: c.marks,
        mcqs: c.mcqs,
        subjective: c.subjective,
        paperCount: c._papers.size
    }));
}

function showView(viewId) {
    const views = ['subject-selection-view', 'analysis-dashboard-view'];
    views.forEach(v => {
        const el = document.getElementById(v);
        if(el) el.classList.toggle('hidden', v !== viewId);
    });
}
