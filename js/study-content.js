import { SlugEngine } from './slug-engine.js';
import { getInitializedClients } from './config.js';

// --- Dynamic Configuration ---
const params = new URLSearchParams(window.location.search);
const grade = params.get('grade') || '10';

let engine;
async function initEngine() {
    try {
        const module = await import(`./curriculum/class-${grade}.js`);
        engine = new SlugEngine(module.curriculum);
    } catch (e) {
        console.error("Curriculum load failed.");
    }
}
await initEngine();

// --- THE NUCLEAR RESET (Bumps to v15 to kill "25" error) ---
const DB_NAME = 'Ready4Exam_Insights_DB';
const STORE_NAME = 'board_insights';
const DB_VERSION = 15; 

async function openDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            // Force-delete old data to remove "1.25" and leaked context
            if (db.objectStoreNames.contains(STORE_NAME)) {
                db.deleteObjectStore(STORE_NAME);
            }
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
    });
}

async function getLocalData(key) {
    const db = await openDB();
    return new Promise((resolve) => {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result);
    });
}

async function saveLocalData(key, data) {
    const db = await openDB();
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put({ id: key, content: data });
}

// --- Symmetric Button Observer ---
const container = document.getElementById('content-container');
if (container) {
    const observer = new MutationObserver(() => {
        const testBtn = document.getElementById('btn-target-test');
        if (testBtn && !testBtn.dataset.moved) setupSymmetricBar(testBtn);
    });
    observer.observe(container, { childList: true, subtree: true });
}

function setupSymmetricBar(oldBtn) {
    oldBtn.dataset.moved = "true";
    oldBtn.classList.add('hidden'); 
    
    const newBtn = document.createElement('button');
    newBtn.className = "w-full bg-cbse-blue text-white h-[60px] rounded-2xl font-black hover:scale-[1.02] active:scale-95 transition-all shadow-xl flex items-center justify-center gap-3";
    newBtn.innerHTML = `<span>Take Chapter Test</span> <i class="fas fa-bolt text-accent-gold"></i>`;
    newBtn.onclick = () => openDifficultyModal({ subject: params.get('subject'), chapter: params.get('chapter') });

    document.getElementById('test-btn-slot').appendChild(newBtn);
    document.getElementById('action-bar-wrapper').classList.remove('hidden');
    
    const chapterKey = (params.get('chapter') || 'real_numbers').toLowerCase().replace(/ /g, '_');
    getLocalData(chapterKey).then(data => { if(data) updateSyncStatus(); });
    renderGuidance();
}

// --- Board Insights Sync ---
document.getElementById('trigger-board-insights').addEventListener('click', async () => {
    const chapterKey = (params.get('chapter') || 'real_numbers').toLowerCase().replace(/ /g, '_');
    let data = await getLocalData(chapterKey);

    if (!data) {
        const cloudUrl = `https://karnkeshav.github.io/masterpage_1/data/board-insights/${chapterKey}.json?v=${Date.now()}`;
        try {
            const response = await fetch(cloudUrl);
            const jsonData = await response.json();
            await saveLocalData(chapterKey, jsonData);
            data = { content: jsonData };
            updateSyncStatus();
        } catch (err) {
            alert("Internet connection required for the first sync.");
            return;
        }
    }
    renderInsightsUI(data.content);
});

function updateSyncStatus() {
    const msg = document.getElementById('sync-status-msg');
    msg.classList.replace('text-warning-yellow', 'text-success-green');
    msg.innerHTML = `<i class="fas fa-check-circle"></i><span>Verified & Synced for Offline</span>`;
}

// --- CLEAN UI RENDERING ENGINE ---
function renderInsightsUI(data) {
    const target = document.getElementById('board-insight-container');
    const imageBaseUrl = "https://karnkeshav.github.io/masterpage_1/data/board-insights/images/";
    target.classList.remove('hidden');
    target.scrollIntoView({ behavior: 'smooth' });

    target.innerHTML = `
        <div class="bg-white border-4 border-cbse-blue rounded-[2.5rem] overflow-hidden shadow-2xl mb-12">
            <div class="bg-cbse-blue p-6 text-white flex justify-between items-center">
                <div>
                    <h2 class="text-xl font-bold">${data.chapter_name} Board Pattern Questions</h2>
                    <p class="text-blue-100 text-xs italic">Authentic PDF Visual Extracts</p>
                </div>
                <button onclick="document.getElementById('board-insight-container').classList.add('hidden')" class="text-white/30 hover:text-white transition"><i class="fas fa-times-circle text-2xl"></i></button>
            </div>
            <div class="p-8 md:p-12 space-y-16">
                ${data.insights.map((insight, idx) => `
                    <div class="border-l-4 border-accent-gold pl-6 md:pl-10">
                        <h4 class="text-cbse-blue font-black uppercase text-[10px] tracking-widest mb-6">CASE STUDY ${idx + 1}</h4>
                        
                        <div class="text-slate-700 italic mb-10 text-sm leading-relaxed bg-slate-50 p-6 rounded-3xl border border-slate-100">
                            "${insight.context.replace(/\n/g, ' ')}"
                        </div>
                        
                        <!-- Image Block: Only shows if file path is valid -->
                        ${(insight.image_path && insight.image_path.length > 5) ? `
                            <div class="mb-12 rounded-3xl overflow-hidden shadow-lg border-4 border-slate-50 bg-white">
                                <img src="${imageBaseUrl}${insight.image_path}" class="w-full h-auto" onerror="this.parentElement.style.display='none'">
                                <div class="bg-slate-50 text-center py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Refer to visual for exact formulas</div>
                            </div>
                        ` : ''}

                        <div class="space-y-12">
                            ${insight.questions.map((q, qIdx) => {
                                // SANITIZATION: Remove empty boxes and fix double labeling
                                const validOptions = (q.options || []).filter(opt => opt.trim().length > 0 && !opt.includes("Refer to Image"));
                                let cleanAnswer = q.answer.replace(/Official Answer:\s*/gi, "");

                                return `
                                <div>
                                    <p class="font-bold text-slate-800 mb-6 text-sm">${qIdx + 1}. ${q.text}</p>
                                    
                                    ${validOptions.length > 0 ? `
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 ml-4">
                                            ${validOptions.map(opt => `<div class="bg-white p-4 rounded-xl border border-slate-200 text-xs text-slate-600 font-bold">${opt}</div>`).join('')}
                                        </div>
                                    ` : ''}
                                    
                                    <details class="mt-6 ml-4 group">
                                        <summary class="text-[10px] font-black text-cbse-blue cursor-pointer list-none uppercase tracking-[0.2em] hover:text-accent-gold transition flex items-center gap-2">
                                            <i class="fas fa-key"></i> Reveal Official Answer
                                        </summary>
                                        <div class="mt-4 p-5 bg-green-50 text-success-green border border-green-100 rounded-2xl font-black text-xs shadow-inner">
                                            Solution: ${cleanAnswer}
                                        </div>
                                    </details>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
}

// --- Grade guard: hide board insights for non-board grades ---
(function applyBoardInsightsGuard() {
    if (grade !== '10' && grade !== '12') {
        const col = document.getElementById('board-insights-col');
        const divider = col?.previousElementSibling;
        if (col) col.style.display = 'none';
        if (divider) divider.style.display = 'none';
    }
})();

// --- Guidance and Difficulty Modal Logic ---
async function renderGuidance() {
    const quizSlug = engine.getQuizTableSlug(params.get('grade'), params.get('subject'), params.get('chapter'));
    const msgEl = document.getElementById('quiz-guidance-msg');
    try {
        const { auth, db } = await getInitializedClients();
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        let user = auth.currentUser;
        if (!user) await new Promise(r => auth.onAuthStateChanged(u => { if(u){user=u;r();} }));
        if (!user) return;
        const q = query(collection(db, "quiz_scores"), where("user_id", "==", user.uid), where("topicSlug", "==", quizSlug));
        const snap = await getDocs(q);
        let best = 0;
        snap.forEach(d => { if (d.data().difficulty === "Simple" && d.data().percentage > best) best = d.data().percentage; });
        if (best === 0) msgEl.innerHTML = "Ready to Start? Begin with Simple Level";
        else if (best < 85) msgEl.innerHTML = "Current Focus: Master Simple Level (85%+)";
        else msgEl.innerHTML = "Great Work! Target next Proficiency";
    } catch (e) {}
}

const twHex = {
    slate:   { 50: '#f8fafc', 100: '#f1f5f9', 600: '#475569' },
    red:     { 50: '#fef2f2', 100: '#fee2e2', 600: '#dc2626' },
    orange:  { 50: '#fff7ed', 100: '#ffedd5', 600: '#ea580c' },
    amber:   { 50: '#fffbeb', 100: '#fef3c7', 600: '#d97706' },
    green:   { 50: '#f0fdf4', 100: '#dcfce7', 600: '#16a34a' },
    emerald: { 50: '#ecfdf5', 100: '#d1fae5', 600: '#059669' },
    teal:    { 50: '#f0fdfa', 100: '#ccfbf1', 600: '#0d9488' },
    blue:    { 50: '#eff6ff', 100: '#dbeafe', 600: '#2563eb' },
    indigo:  { 50: '#eef2ff', 100: '#e0e7ff', 600: '#4f46e5' },
    purple:  { 50: '#faf5ff', 100: '#f3e8ff', 600: '#9333ea' },
    pink:    { 50: '#fdf2f8', 100: '#fce7f3', 600: '#db2777' },
};

function difficultyCard(level, subtitle, bg, border, text, icon) {
    return `
        <button onclick="launchQuiz('${level}')"
            class="w-full p-4 ${bg} border-2 ${border} rounded-2xl hover:scale-[1.02] active:scale-95 transition-all group text-left flex items-center gap-4 shadow-sm">
            <span class="w-12 h-12 rounded-xl bg-white/50 ${text} flex items-center justify-center text-2xl shadow-sm">${icon}</span>
            <div>
                <div class="font-bold ${text} text-lg leading-tight">${level}</div>
                <div class="text-[10px] ${text} opacity-80 font-black uppercase tracking-wider">${subtitle}</div>
            </div>
            <span class="ml-auto ${text} group-hover:translate-x-1 transition text-xl"><i class="fas fa-arrow-right"></i></span>
        </button>`;
}

function openDifficultyModal(ctx) {
    const existing = document.getElementById('symmetric-difficulty-modal');
    if (existing) existing.remove();

    const theme = (engine?.themes?.[ctx.subject]) || { icon: 'fa-shapes', bg: 'bg-slate-50' };
    let colorName = 'slate';
    try { if (theme.bg) colorName = theme.bg.split('-')[1]; } catch (e) {}
    const ch = twHex[colorName] || twHex.slate;

    const modal = document.createElement('div');
    modal.id = 'symmetric-difficulty-modal';
    modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in';
    modal.innerHTML = `
        <div class="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl relative border-4" style="border-color:${ch[100]}">
            <button id="close-diff-modal" class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-red-50 hover:text-red-500 transition">✕</button>
            <div class="text-center mb-8">
                <div class="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-3xl mb-4 shadow-sm" style="background-color:${ch[50]};color:${ch[600]}">
                    <i class="fas ${theme.icon}"></i>
                </div>
                <h3 class="text-2xl font-black text-slate-900 mb-1">Select Difficulty</h3>
                <p class="text-xs font-bold uppercase tracking-widest" style="color:${ch[600]}">
                    ${ctx.subject} &gt; ${ctx.chapter || params.get('chapter') || ''}
                </p>
            </div>
            <div class="space-y-4">
                ${difficultyCard('Simple',   'Foundation', 'bg-green-50',  'border-green-200',  'text-green-700',  '🌱')}
                ${difficultyCard('Medium',   'Standard',   'bg-yellow-50', 'border-yellow-200', 'text-yellow-700', '⚡')}
                ${difficultyCard('Advanced', 'Challenger', 'bg-red-50',    'border-red-200',    'text-red-700',    '🔥')}
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('close-diff-modal').onclick = () => modal.remove();
}

window.launchQuiz = (difficulty) => {
    const quizSlug = engine.getQuizTableSlug(params.get('grade'), params.get('subject'), params.get('chapter'));
    window.location.href = `quiz-engine.html?topic=${encodeURIComponent(quizSlug)}&difficulty=${difficulty}&grade=${params.get('grade')}&subject=${encodeURIComponent(params.get('subject'))}&chapter_name=${encodeURIComponent(params.get('chapter'))}`;
};
