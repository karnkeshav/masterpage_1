import { getInitializedClients } from './config.js';
import { 
    collectionGroup, 
    query, 
    where, 
    getDocs,
    doc,
    getDoc,
    orderBy // Added for index alignment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let state = {
    db: null,
    subject: new URLSearchParams(window.location.search).get('subject'),
};

export async function initExamPulse() {
    const clients = await getInitializedClients();
    if (!clients) return;
    state.db = clients.db;

    clients.auth.onAuthStateChanged(async (user) => {
        if (user) {
            await syncStudentHeader(user);
            updateNavigationUI(); // Set correct breadcrumb text on load
            
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

// SMART NAVIGATION LOGIC
window.handleBack = () => {
    if (state.subject) {
        // If viewing a subject, go back to the selection grid
        state.subject = null;
        const url = new URL(window.location);
        url.searchParams.delete('subject');
        window.history.pushState({}, '', url);
        
        updateNavigationUI();
        showView('subject-selection-view');
    } else {
        // If already on selection grid, go back to console
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
    document.getElementById('subject-tag').textContent = state.subject;

    try {
        // ALIGNING QUERY TO YOUR ENABLED COMPOSITE INDEX
        // Using orderBy('chapter') forces Firestore to use the existing index CICAgNi47oMK
        const q = query(
            collectionGroup(state.db, 'questions'), 
            where('subject', '==', state.subject),
            orderBy('chapter') 
        );

        const snap = await getDocs(q);
        const questions = snap.docs.map(d => d.data());

        if (questions.length === 0) {
            weightageContainer.innerHTML = `<p class="text-slate-400 text-sm">No archive data found for ${state.subject}.</p>`;
            return;
        }

        const totalMarksAcrossYears = questions.reduce((acc, q) => acc + (q.marks || 0), 0);
        const metrics = aggregateChapterMetrics(questions);

        // Rendering Logic
        weightageContainer.innerHTML = metrics
            .sort((a, b) => b.marks - a.marks)
            .map(c => {
                const perc = ((c.marks / totalMarksAcrossYears) * 100).toFixed(1);
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

        // MCQs & Subjective Lists
        document.getElementById('mcq-hub-list').innerHTML = metrics.sort((a,b) => b.mcqs - a.mcqs).slice(0, 3).map(c => `
            <div class="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10">
                <span class="text-xs font-bold">${c.name}</span>
                <span class="text-[10px] font-black bg-accent-gold text-slate-900 px-2 rounded">${c.mcqs} Hits</span>
            </div>`).join('');

        document.getElementById('subjective-zone-list').innerHTML = metrics.sort((a,b) => b.subjective - a.subjective).slice(0, 3).map(c => `
            <div class="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <span class="text-xs font-bold text-slate-700">${c.name}</span>
                <span class="text-[10px] font-black bg-cbse-blue text-white px-2 rounded">${c.subjective} Longs</span>
            </div>`).join('');

    } catch (err) {
        console.error("Forensic Analysis Error:", err);
        // If error persists, it's likely index propagation. Show user-friendly message.
        weightageContainer.innerHTML = `<div class="p-4 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold">
            Data is currently synchronizing with the 2026 Archive. Please hard-refresh (Ctrl+F5) in 2 minutes.
        </div>`;
    }
}

// ... (keep aggregateChapterMetrics, showView, and syncStudentHeader as they were)

/**
 * Groups raw question data into analytical metrics
 */
function aggregateChapterMetrics(questions) {
    const chapters = {};
    questions.forEach(q => {
        const name = q.chapter || 'Foundational Concepts';
        if (!chapters[name]) {
            chapters[name] = { name, marks: 0, mcqs: 0, subjective: 0 };
        }
        chapters[name].marks += (q.marks || 0);
        if (q.marks === 1) chapters[name].mcqs++;
        if (q.marks >= 3) chapters[name].subjective++;
    });
    return Object.values(chapters);
}

/**
 * UI View Controller
 */
function showView(viewId) {
    const views = ['subject-selection-view', 'analysis-dashboard-view'];
    views.forEach(v => {
        document.getElementById(v).classList.toggle('hidden', v !== viewId);
    });
}
