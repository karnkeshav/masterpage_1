import { getInitializedClients } from './config.js';
import {
    doc,
    getDoc,
    collectionGroup,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let state = {
    grade: new URLSearchParams(window.location.search).get('grade') || '10',
    subject: new URLSearchParams(window.location.search).get('subject'),
    db: null
};

export async function initExamPulse() {
    try {
        const clients = await getInitializedClients();
        if (!clients) return;
        state.db = clients.db; 

        clients.auth.onAuthStateChanged(async (user) => {
            if (user) {
                // Fetch and update user welcome in header
                updateHeaderWithUser(user);
                
                if (!state.subject) {
                    showView('subject-selection-view');
                } else {
                    showView('analysis-dashboard-view');
                    await runPulseAnalysis();
                }
            } else {
                window.location.href = "../offering.html";
            }
        });
    } catch (err) {
        console.error("Pulse Init Error:", err);
    }
}

async function updateHeaderWithUser(user) {
    const welcomeEl = document.getElementById('user-welcome');
    if (!welcomeEl) return;

    try {
        const userDoc = await getDoc(doc(state.db, "users", user.uid));
        if (userDoc.exists()) {
            welcomeEl.textContent = userDoc.data().displayName || user.email.split('@')[0];
        }
    } catch (e) {
        welcomeEl.textContent = user.displayName || user.email.split('@')[0];
    }
}

async function runPulseAnalysis() {
    document.getElementById('subject-tag').textContent = state.subject;
    const container = document.getElementById('weightage-table-container');

    try {
        const q = query(
            collectionGroup(state.db, 'questions'),
            where('subject', '==', state.subject)
        );

        const snap = await getDocs(q);
        const questions = snap.docs.map(d => d.data());
        const totalMarks = questions.reduce((acc, curr) => acc + (curr.marks || 0), 0);

        // Grouping logic
        const chapters = {};
        questions.forEach(q => {
            const name = q.chapter || 'Miscellaneous';
            if (!chapters[name]) chapters[name] = { marks: 0, count: 0 };
            chapters[name].marks += (q.marks || 0);
            chapters[name].count++;
        });

        const sorted = Object.entries(chapters).sort((a, b) => b[1].marks - a[1].marks);

        container.innerHTML = sorted.map(([name, data]) => {
            const perc = ((data.marks / totalMarks) * 100).toFixed(1);
            return `
                <div class="group">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-bold text-slate-700">${name}</span>
                        <span class="text-[10px] font-black text-cbse-blue bg-blue-50 px-2 py-0.5 rounded">${perc}% Weightage</span>
                    </div>
                    <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div class="bg-cbse-blue h-full" style="width: ${perc}%"></div>
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('forensics-insight').textContent = 
            `Based on 2022-2025 sets, ${sorted[0][0]} remains the most consistent source of marks for ${state.subject}.`;

    } catch (err) {
        console.error("Analysis Error:", err);
    }
}

function showView(viewId) {
    document.getElementById('subject-selection-view').classList.add('hidden');
    document.getElementById('analysis-dashboard-view').classList.add('hidden');
    document.getElementById(viewId).classList.remove('hidden');
}

window.selectSubject = (sub) => {
    const url = new URL(window.location);
    url.searchParams.set('subject', sub);
    window.history.pushState({}, '', url);
    state.subject = sub;
    showView('analysis-dashboard-view');
    runPulseAnalysis();
};
