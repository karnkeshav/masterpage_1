import { getInitializedClients } from './config.js';  
import { ensureUserInFirestore } from "./auth-paywall.js"; 

// 1. ARCHIVE MAPPING: Subject names to local JSON file paths[cite: 1, 2, 3]
const ARCHIVE_MAP = {
    "Mathematics": "../archive/mathematics_refined_clean.json",
    "Science": "../archive/science_refined.json",
    "Social Science": "../archive/social_science_refined.json"
};

let state = {  
    grade: new URLSearchParams(window.location.search).get('grade') || '10',  
    subject: new URLSearchParams(window.location.search).get('subject') || 'Mathematics',  
    chapterID: new URLSearchParams(window.location.search).get('chapter') || '', 
    rawQuestions: []
};  
  
const normalizeChapter = (slug) => slug.replace(/_/g, ' ').trim().toLowerCase();  
  
/**
 * Preserved Auth logic for the paywall/login check, 
 * but data retrieval is now 100% local JSON.
 */
export async function initInsights() {  
    try {  
        const clients = await getInitializedClients();  
        if (!clients) return;  
  
        clients.auth.onAuthStateChanged(async (user) => {  
            if (user) {  
                const profile = await ensureUserInFirestore(user); 
                updateHeaderUI(profile); 
                updatePageTitles();  
                await runDeepAnalysis(); // This now fetches from the /archive folder
            } else {  
                window.location.href = "../offering.html";  
            }  
        });  
    } catch (err) {  
        console.error("Initialization Error:", err);  
    }  
}  

function updateHeaderUI(profile) {  
    const badge = document.getElementById('context-badge');  
    if (badge) badge.textContent = `Grade ${state.grade}`;  
    const nameEl = document.getElementById('user-welcome');
    if (nameEl) nameEl.textContent = profile?.displayName || "Student";
}

function updatePageTitles() {  
    const titleEl = document.getElementById('header-title');  
    if (titleEl) {  
        titleEl.innerHTML = `${state.subject} <span class="text-white opacity-60 text-lg font-normal ml-2">| ${state.chapterID.replace(/_/g, ' ')}</span>`;  
    }  
}

/**
 * CORE LOGIC: Fetches local JSON and runs analysis on the array
 */
async function runDeepAnalysis() {  
    const chapterSearchTerm = normalizeChapter(state.chapterID);  
  
    try {  
        // 2. FETCH FROM GITHUB ARCHIVE FOLDER
        const filePath = ARCHIVE_MAP[state.subject] || ARCHIVE_MAP["Mathematics"];
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`Archive path error: ${filePath}`);
        
        const allData = await response.json();

        // 3. FILTER BY CHAPTER
        const questions = allData.filter(q => {
            const dbChapter = (q.chapter || "").toLowerCase();
            return dbChapter.includes(chapterSearchTerm);
        });

        state.rawQuestions = questions; 
  
        // 4. DATA AGGREGATION FOR UI ANALYSIS
        const blueprint = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };  
        const topicMap = {};  
        let subjectiveCount = 0;  
  
        questions.forEach(q => {  
            // Blueprint: Map marks
            const m = String(q.marks);
            if (blueprint.hasOwnProperty(m)) blueprint[m]++;  
  
            // Heatmap: Map topics
            const t = q.topic || 'General';  
            topicMap[t] = (topicMap[t] || 0) + 1;  
  
            // Forensics: Identify Subjective vs MCQ[cite: 2, 3]
            const qType = (q.type || '').toLowerCase();  
            if (!qType.includes('mcq')) subjectiveCount++;  
        });  
  
        // 5. UPDATE UI COMPONENTS
        renderBlueprint(blueprint);  
        renderHeatmap(topicMap, questions.length);  
        renderForensics(subjectiveCount, questions.length);  
        renderPredictive(topicMap);  
        renderCompendium(questions); 
        setupFilterListeners(); 
        
        // Dynamic industry context replaces the old Firestore loadMeta()
        const topTopic = Object.keys(topicMap).sort((a,b) => topicMap[b] - topicMap[a])[0] || "core principles";
        document.getElementById('industry-connection-text').textContent = 
            `Real-world implementation of ${topTopic} is a standard requirement for architecture roles in the IT sector.`;

    } catch (err) {  
        console.error("Local Analysis Failed:", err);  
        document.getElementById('compendium-container').innerHTML = `<p class="text-red-500 text-center py-10">Archive Error: ${err.message}</p>`;
    }  
}  

function renderBlueprint(data) {  
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };  
    set('blueprint-1m', data['1'] || 0);  
    set('blueprint-2m', data['2'] || 0);  
    set('blueprint-3m', data['3'] || 0);  
    set('blueprint-4m', data['4'] || 0);
    set('blueprint-5m', data['5'] || 0);  
} 
  
function renderCompendium(questions) {  
    const container = document.getElementById('compendium-container');  
    if (!container) return;  
    if (questions.length === 0) {  
        container.innerHTML = `<div class="text-center py-10 italic text-slate-400">No records found for this selection.</div>`;  
        return;  
    }  
    container.innerHTML = questions.map(q => `  
        <div class="group p-5 border border-slate-100 rounded-2xl hover:border-blue-200 transition-all bg-white shadow-sm">  
            <div class="flex items-start justify-between gap-4">  
                <div class="space-y-2">  
                    <div class="flex items-center gap-2">  
                        <span class="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded">${q.marks}M</span>  
                        <span class="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">${q.topic || 'CORE'}</span>  
                    </div>  
                    <p class="text-slate-700 font-medium leading-relaxed">${q.content || q.text || 'Content missing'}</p>  
                </div>  
                <span class="text-[10px] font-black text-slate-300">YEAR ${q.year}</span>  
            </div>  
        </div>  
    `).join('');  
}  
  
function setupFilterListeners() {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.onclick = () => {
            buttons.forEach(b => { b.classList.remove('bg-slate-900', 'text-white'); b.classList.add('bg-white', 'text-slate-600'); });
            btn.classList.add('bg-slate-900', 'text-white');
            const mark = btn.getAttribute('data-filter');
            renderCompendium(mark === 'all' ? state.rawQuestions : state.rawQuestions.filter(q => String(q.marks) === mark));
        };
    });
}

function renderHeatmap(topicMap, total) {
    const container = document.getElementById('heatmap-container');
    if (!container || total === 0) return;
    container.innerHTML = Object.entries(topicMap).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([topic, count]) => {
        const perc = Math.round((count / total) * 100);
        return `<div><div class="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-1">
            <span>${topic}</span><span>${perc}%</span></div>
            <div class="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
            <div class="bg-blue-600 h-full" style="width: ${perc}%"></div></div></div>`;
    }).join('');
}

function renderForensics(subCount, total) {
    const el = document.getElementById('forensics-text');
    if (!el || total === 0) return;
    const ratio = (subCount / total) * 100;
    el.innerHTML = ratio > 60 ? `<strong>Pattern:</strong> Subjective-heavy. Focus on precise definitions and diagrams.` : `<strong>Pattern:</strong> Balanced mix of MCQs and subjective problems.`;
}

function renderPredictive(topicMap) {
    const el = document.getElementById('predictive-text');
    if (!el) return;
    const entries = Object.entries(topicMap);
    const top = entries.length > 0 ? entries.sort((a,b)=>b[1]-a[1])[0][0] : "General";
    el.innerHTML = `High probability of appearing in 2026: <span class="font-bold underline decoration-green-300">"${top}"</span>`;
}
