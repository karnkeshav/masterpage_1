import { getInitializedClients } from './config.js';  
import { ensureUserInFirestore } from "./auth-paywall.js"; 

/**
 * ARCHIVE MAPPING: Links subjects to local JSON file paths
 * Based on the project structure in your 'archive' folder.
 */
const ARCHIVE_MAP = {
    "Mathematics": "/masterpage_1/archive/mathematics_refined.json",
    "Science": "/masterpage_1/archive/science_refined.json",
    "Social Science": "/masterpage_1/archive/social_science_refined.json"
};

let state = {  
    grade: new URLSearchParams(window.location.search).get('grade') || '10',  
    subject: new URLSearchParams(window.location.search).get('subject') || 'Mathematics',  
    chapterID: new URLSearchParams(window.location.search).get('chapter') || '', 
    rawQuestions: []
};  
  
const normalizeChapter = (slug) => slug.replace(/_/g, ' ').trim().toLowerCase();  
  
/**
 * INITIALIZATION: Maintains Auth-Paywall while switching to local JSON data.
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
                await runDeepAnalysis(); 
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
        const displayChapter = state.chapterID.replace(/_/g, ' ');
        titleEl.innerHTML = `${state.subject} <span class="text-white opacity-60 text-lg font-normal ml-2">| ${displayChapter}</span>`;  
    }  
}

/**
 * CORE ANALYSIS: Fetches local JSON and populates the Intelligence Grid.
 * Replaces old Firebase Firestore collection logic.
 */
async function runDeepAnalysis() {  
    const chapterSearchTerm = normalizeChapter(state.chapterID);  
  
    try {
        // 1. Fetch from Archive Folder
        const filePath = ARCHIVE_MAP[state.subject] || ARCHIVE_MAP["Mathematics"];
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`Archive path error: ${filePath}`);
        
        const allData = await response.json();

        // 2. Client-side Filter by Chapter
        const questions = allData.filter(q => {
            const dbChapter = (q.chapter || "").toLowerCase();
            return dbChapter.includes(chapterSearchTerm);
        });

        state.rawQuestions = questions; 
  
        // 3. UI Logic Aggregation[cite: 1, 2, 3]
        const blueprint = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };  
        const topicMap = {};  
        let subjectiveCount = 0;  
  
        questions.forEach(q => {
            // Count for Marks Blueprint
            const m = String(q.marks);
            if (blueprint.hasOwnProperty(m)) blueprint[m]++;  
  
            // Map for Concept Heatmap
            const t = q.topic || 'General';  
            topicMap[t] = (topicMap[t] || 0) + 1;  
  
            // Ratio for Forensics
            const qType = (q.type || '').toLowerCase();  
            if (!qType.includes('mcq')) subjectiveCount++;  
        });  
  
        // 4. Component Rendering
        renderBlueprint(blueprint);  
        renderHeatmap(topicMap, questions.length);  
        renderForensics(subjectiveCount, questions.length);  
        renderPredictive(topicMap);  
        renderCompendium(questions); 
        setupFilterListeners(); 
        
        // 5. Dynamic Industry Panel
        const sortedTopics = Object.entries(topicMap).sort((a,b) => b[1] - a[1]);
        const topTopic = sortedTopics.length > 0 ? sortedTopics[0][0] : "core principles";
        document.getElementById('industry-connection-text').textContent = 
            `Real-world implementation of ${topTopic} is a key benchmark for architecture and engineering roles in the technology sector.`;

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
  
async function renderCompendium(questions) {  
    const container = document.getElementById('compendium-container');  
    if (!container) return;  
    
    if (questions.length === 0) {  
        container.innerHTML = `<div class="text-center py-10 italic text-slate-400">No records found for this selection.</div>`;  
        return;  
    }  

    container.innerHTML = questions.map(q => {
        // PRE-PROCESSOR: Automatically wrap common math patterns in $ delimiters 
        // if the JSON doesn't already have them.
        let text = q.content || q.text || 'Content missing';
        
        // This regex looks for simple polynomials like x^2 + 5x + 6
        text = text.replace(/([a-z]\^?\d*(\s?[\+\-\*\/]\s?\d*[a-z]?\^?\d*)*)/gi, (match) => {
            return (match.includes('^') || match.length > 3) ? `$${match}$` : match;
        });

        return `  
            <div class="group p-5 border border-slate-100 rounded-2xl hover:border-blue-200 transition-all bg-white shadow-sm">  
                <div class="flex items-start justify-between gap-4">  
                    <div class="space-y-2">  
                        <div class="flex items-center gap-2">  
                            <span class="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded">${q.marks}M</span>  
                            <span class="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">${q.topic || 'CORE'}</span>  
                        </div>  
                        <p class="text-slate-700 font-medium leading-relaxed">${text}</p>  
                    </div>  
                    <span class="text-[10px] font-black text-slate-300 whitespace-nowrap">${q.year} BOARD</span>  
                </div>  
            </div>  
        `;  
    }).join('');  

    // RE-TRIGGER MATHJAX: This is the critical step for dynamic content
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([container]).catch((err) => console.warn('MathJax failed:', err));
    }
}  
function setupFilterListeners() {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.onclick = () => {
            buttons.forEach(b => { 
                b.classList.remove('bg-slate-900', 'text-white'); 
                b.classList.add('bg-white', 'text-slate-600'); 
            });
            btn.classList.add('bg-slate-900', 'text-white');
            const mark = btn.getAttribute('data-filter');
            const filtered = mark === 'all' ? state.rawQuestions : state.rawQuestions.filter(q => String(q.marks) === mark);
            renderCompendium(filtered);
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
            <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div class="bg-blue-600 h-full" style="width: ${perc}%"></div></div></div>`;
    }).join('');
}

function renderForensics(subCount, total) {
    const el = document.getElementById('forensics-text');
    if (!el || total === 0) return;
    const ratio = (subCount / total) * 100;
    el.innerHTML = ratio > 60 ? `<strong>Pattern:</strong> Subjective-heavy. Focus on precise steps and diagrams.` : `<strong>Pattern:</strong> Balanced mix of MCQs and subjective problems.`;
}

function renderPredictive(topicMap) {
    const el = document.getElementById('predictive-text');
    if (!el) return;
    const entries = Object.entries(topicMap);
    const top = entries.length > 0 ? entries.sort((a,b)=>b[1]-a[1])[0][0] : "General";
    el.innerHTML = `Probability High for: <span class="font-bold underline decoration-green-300">"${top}"</span>`;
}
