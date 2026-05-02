import { SlugEngine } from './slug-engine.js';
import { getInitializedClients } from './config.js';

// --- Dynamic Grade Selection (Adapts to Class 10 or 12) ---
const params = new URLSearchParams(window.location.search);
const grade = params.get('grade') || '10';

let engine;
async function initEngine() {
    try {
        // Dynamically loads the specific curriculum to keep the app lightweight
        const module = await import(`./curriculum/class-${grade}.js`);
        engine = new SlugEngine(module.curriculum);
    } catch (e) {
        console.error("Grade curriculum missing. Defaulting to 10.");
    }
}
await initEngine();

// --- IndexedDB Master Sync (Point 2: Force Reset for Mapping Fixes) ---
const DB_NAME = 'Ready4Exam_Insights_DB';
const STORE_NAME = 'board_insights';
const DB_VERSION = 3; // Incrementing to 3 wipes the old '1.25' and 'See PDF' errors locally

async function openDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            // CRITICAL: Wipes old store so fresh JSON with real answers is downloaded
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

// --- Symmetric Button Layout Observer (Point 1 & 3: Symmetry) ---
const container = document.getElementById('content-container');
if (container) {
    const observer = new MutationObserver(() => {
        const originalTestBtn = document.getElementById('btn-target-test');
        if (originalTestBtn && !originalTestBtn.dataset.moved) {
            setupProfessionalLayout(originalTestBtn);
        }
    });
    observer.observe(container, { childList: true, subtree: true });
}

function setupProfessionalLayout(oldBtn) {
    oldBtn.dataset.moved = "true";
    oldBtn.classList.add('hidden'); // Silently hide original renderer button
    
    // Create professional Chapter Test button inside the symmetric bar
    const newBtn = document.createElement('button');
    newBtn.className = "w-full bg-cbse-blue text-white px-6 py-4 rounded-2xl font-black hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center justify-center gap-3";
    newBtn.innerHTML = `<span>Take Chapter Test</span> <i class="fas fa-bolt text-accent-gold"></i>`;
    
    newBtn.onclick = () => {
        const subject = params.get('subject') || 'Mathematics';
        const chapter = params.get('chapter') || 'Real_Numbers';
        openDifficultyModal({ subject, chapter });
    };

    const slot = document.getElementById('test-btn-slot');
    if (slot) slot.appendChild(newBtn);
    
    document.getElementById('action-bar-wrapper').classList.remove('hidden');
    
    // Check if synced already to show green checkmark (Point 2)
    const chapterKey = (params.get('chapter') || 'real_numbers').toLowerCase().replace(/ /g, '_');
    getLocalData(chapterKey).then(data => {
        if(data && data.content.insights?.length > 0) updateSyncStatus();
    });
    renderGuidance();
}

// --- Board Pattern Questions Sync ---
document.getElementById('trigger-board-insights').addEventListener('click', async () => {
    const chapterKey = (params.get('chapter') || 'real_numbers').toLowerCase().replace(/ /g, '_');
    let data = await getLocalData(chapterKey);

    if (!data || !data.content.insights?.length) {
        // Force sync from GitHub with cache-buster
        const cloudUrl = `https://karnkeshav.github.io/masterpage_1/data/board-insights/${chapterKey}.json?v=${Date.now()}`;
        try {
            const response = await fetch(cloudUrl);
            const jsonData = await response.json();
            await saveLocalData(chapterKey, jsonData);
            data = { content: jsonData };
            updateSyncStatus();
        } catch (err) {
            alert("A first-time connection is required to sync Board Pattern questions.");
            return;
        }
    }
    renderInsightsUI(data.content);
});

function updateSyncStatus() {
    const msg = document.getElementById('sync-status-msg');
    msg.classList.replace('text-warning-yellow', 'text-success-green');
    msg.innerHTML = `<i class="fas fa-check-circle"></i><span>Verified & Synced for Offline Access</span>`;
}

// --- Professional Board Insight Rendering (Point 4: Paragraphs & Images) ---
function renderInsightsUI(data) {
    const target = document.getElementById('board-insight-container');
    const imageBaseUrl = "https://karnkeshav.github.io/masterpage_1/data/board-insights/images/";
    target.classList.remove('hidden');
    target.scrollIntoView({ behavior: 'smooth' });

    target.innerHTML = `
        <div class="bg-white border-4 border-cbse-blue rounded-[2.5rem] overflow-hidden shadow-2xl mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div class="bg-cbse-blue p-6 text-white flex justify-between items-center">
                <div>
                    <h2 class="text-xl font-bold">${data.chapter_name} Board Pattern Questions</h2>
                    <p class="text-blue-100 text-xs italic">Authentic PDF Visual Extracts</p>
                </div>
                <button onclick="document.getElementById('board-insight-container').classList.add('hidden')" class="text-white/30 hover:text-white transition"><i class="fas fa-times-circle text-2xl"></i></button>
            </div>
            <div class="p-8 md:p-12 space-y-12">
                ${data.insights.map((insight, idx) => `
                    <div class="border-l-4 border-accent-gold pl-6 md:pl-10">
                        <h4 class="text-cbse-blue font-black uppercase text-[10px] tracking-widest mb-4">Case Study ${idx + 1}</h4>
                        
                        <!-- Renders context as a clean paragraph -->
                        <div class="text-slate-700 italic mb-8 text-sm leading-relaxed bg-slate-50 p-6 rounded-3xl border border-slate-100">
                            "${insight.context.replace(/\n/g, ' ')}"
                        </div>
                        
                        <!-- PDF Snapshot for Math Formulas & Diagrams -->
                        ${insight.image_path ? `
                            <div class="mb-10 rounded-2xl overflow-hidden shadow-md border border-slate-100 bg-slate-50">
                                <div class="bg-slate-100 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Refer to visual for exact formulas</div>
                                <img src="${imageBaseUrl}${insight.image_path}" class="w-full h-auto">
                            </div>
                        ` : ''}

                        <div class="space-y-10">
                            ${insight.questions.map((q, qIdx) => `
                                <div>
                                    <p class="font-bold text-slate-800 mb-5 text-sm">${qIdx+1}. ${q.text}</p>
                                    ${(q.options?.length > 1 && !q.options[0].includes("Refer to Image")) ? `
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 ml-4">
                                            ${q.options.map(opt => `<div class="bg-white p-4 rounded-xl border border-slate-200 text-xs text-slate-600 font-bold">${opt}</div>`).join('')}
                                        </div>
                                    ` : ''}
                                    
                                    <details class="mt-5 ml-4 group">
                                        <summary class="text-[10px] font-black text-cbse-blue cursor-pointer list-none uppercase tracking-[0.2em] hover:text-accent-gold transition">
                                            <i class="fas fa-key mr-1"></i> Reveal Official Answer
                                        </summary>
                                        <div class="mt-3 p-4 bg-green-50 text-success-green border border-green-100 rounded-xl font-black text-xs">
                                            Official Answer: ${q.answer}
                                        </div>
                                    </details>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
}

// --- Guidance System ---
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
        let bestSimple = 0;
        snap.forEach(d => { if (d.data().difficulty === "Simple" && d.data().percentage > bestSimple) bestSimple = d.data().percentage; });
        
        if (bestSimple === 0) msgEl.innerHTML = `Ready to Start? Begin with Simple Level`;
        else if (bestSimple < 85) {
            msgEl.className = 'text-center text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-warning-yellow';
            msgEl.innerHTML = `Current Focus: Master Simple Level (85%+)`;
        } else {
            msgEl.className = 'text-center text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-success-green';
            msgEl.innerHTML = `Great Work! Move to next Proficiency`;
        }
    } catch (e) {}
}

function openDifficultyModal(ctx) {
    const theme = engine.themes[ctx.subject] || engine.themes["General"];
    const modal = document.createElement('div');
    modal.className = `fixed inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex items-center justify-center p-4 fade-in`;
    modal.innerHTML = `
        <div class="bg-white rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl relative border-b-8 border-cbse-blue text-center overflow-hidden">
            <button onclick="this.closest('.fixed').remove()" class="absolute top-6 right-6 w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition">✕</button>
            <div class="w-20 h-20 mx-auto bg-cbse-blue/5 rounded-3xl flex items-center justify-center text-cbse-blue text-4xl mb-6 shadow-inner">
                <i class="fas ${theme.icon || 'fa-shapes'}"></i>
            </div>
            <h3 class="text-2xl font-black text-slate-900 mb-2">Target Proficiency</h3>
            <p class="text-[10px] font-black text-cbse-blue uppercase tracking-[0.3em] mb-10">${ctx.subject}</p>
            <div class="space-y-4">
                ${createCard('Simple', '🌱 Foundation')}
                ${createCard('Medium', '⚡ Standard')}
                ${createCard('Advanced', '🔥 Challenger')}
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function createCard(level, sub) {
    return `<button onclick="launchQuiz('${level}')" class="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl hover:bg-cbse-blue hover:text-white transition-all text-left flex items-center justify-between group">
        <div class="font-black text-xl">${level}</div>
        <div class="text-[10px] font-black uppercase opacity-60 group-hover:opacity-100 transition">${sub}</div>
    </button>`;
}

window.launchQuiz = (difficulty) => {
    const quizSlug = engine.getQuizTableSlug(params.get('grade'), params.get('subject'), params.get('chapter'));
    window.location.href = `quiz-engine.html?topic=${encodeURIComponent(quizSlug)}&difficulty=${difficulty}&grade=${params.get('grade')}&subject=${encodeURIComponent(params.get('subject'))}&chapter_name=${encodeURIComponent(params.get('chapter'))}`;
};
