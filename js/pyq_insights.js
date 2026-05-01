import { getInitializedClients } from './config.js';  
import { ensureUserInFirestore } from "./auth-paywall.js"; 
import {  
    doc,  
    getDoc,  
    collection,  
    getDocs,  
    query,  
    where,  
    collectionGroup  
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";  
  
let state = {  
    grade: new URLSearchParams(window.location.search).get('grade') || '10',  
    subject: new URLSearchParams(window.location.search).get('subject') || 'Mathematics',  
    chapterID: new URLSearchParams(window.location.search).get('chapter') || 'Real_Numbers', 
    rawQuestions: [], 
    db: null  
};  
  
// Normalize "Real_Numbers" to "Real Numbers" for matching
const normalizeChapter = (slug) => slug.replace(/_/g, ' ').trim();  
  
export async function initInsights() {  
    try {  
        const clients = await getInitializedClients();  
        if (!clients) return;  
        state.db = clients.automationDB;  
  
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
        console.error("Init Error:", err);  
    }  
}  

function updateHeaderUI(profile) {  
    const badge = document.getElementById('context-badge');  
    if (badge) badge.textContent = `Grade ${state.grade}`;  
    
    const nameEl = document.getElementById('user-welcome');
    if (nameEl) {
        nameEl.textContent = profile?.displayName || "Student";
    }
}

function updatePageTitles() {  
    const headerTitle = document.getElementById('header-title');  
    if (headerTitle) {  
        headerTitle.innerHTML = `  
            ${state.subject}  
            <span class="text-white opacity-60 text-lg font-normal ml-2">| ${normalizeChapter(state.chapterID)}</span>  
        `;  
    }  
}

async function runDeepAnalysis() {  
    const chapterSearchTerm = normalizeChapter(state.chapterID).toLowerCase();  
    const container = document.getElementById('compendium-container');  
  
    try {  
        // Handle Subject logic: If Mathematics, query both Basic and Standard
        let subjectFilter;
        if (state.subject.toLowerCase().includes("math")) {
            subjectFilter = where('subject', 'in', ['Maths Standard', 'Maths Basic']);
        } else {
            subjectFilter = where('subject', '==', state.subject);
        }

        const q = query(  
            collectionGroup(state.db, 'questions'),  
            subjectFilter
        );  
  
        const snap = await getDocs(q);  
        
        // Filter by chapter in JS to handle inconsistent prefixes like "Chapter 4:"
        const questions = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(q => {
                const dbChapter = (q.chapter || "").toLowerCase();
                return dbChapter.includes(chapterSearchTerm);
            });

        state.rawQuestions = questions; 
  
        const blueprint = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };  
        const topicMap = {};  
        let subjectiveCount = 0;  
  
        questions.forEach(q => {  
            const m = String(q.marks);  
            if (blueprint.hasOwnProperty(m)) blueprint[m]++;  
  
            // Use 'topic' for Maths, fall back to 'branch' or 'subtopic'
            const t = q.topic || q.concept || q.sub_topic || q.branch || 'General';  
            topicMap[t] = (topicMap[t] || 0) + 1;  
  
            const qType = (q.question_type || q.type || '').toLowerCase();  
            if (!qType.includes('mcq')) {  
                subjectiveCount++;  
            }  
        });  
  
        renderBlueprint(blueprint);  
        renderHeatmap(topicMap, questions.length);  
        renderForensics(subjectiveCount, questions.length);  
        renderPredictive(topicMap);  
        renderCompendium(questions); 
        setupFilterListeners(); 
        
        await loadMeta();  
  
    } catch (err) {  
        console.error("Analysis Failed:", err);  
        if (container) {  
            container.innerHTML = `<p class="text-red-500">Failed to load archive: ${err.message}</p>`;  
        }  
    }  
}  
  
function renderBlueprint(data) {  
    const set = (id, val) => {  
        const el = document.getElementById(id);  
        if (el) el.textContent = val;  
    };  
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
        container.innerHTML = `
            <div class="text-center py-10 border-2 border-dashed border-slate-100 rounded-3xl">
                <p class="text-slate-400 text-sm italic">No records found for this mark selection.</p>
            </div>`;  
        return;  
    }  
  
    container.innerHTML = questions.map(q => {  
        // Priority for text: use 'content' for Maths
        const text = q.content || q.question_text || q.text_en || q.text || 'Question text unavailable.';  
        const topic = q.topic || q.concept || q.sub_topic || q.branch || 'General';  
        const marks = q.marks || '?';  
        const year = q.year || 'PYQ';

        return `  
            <div class="group p-5 border border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/20 transition-all">  
                <div class="flex items-start justify-between gap-4">  
                    <div class="space-y-2">  
                        <div class="flex items-center gap-2">  
                            <span class="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded">${marks}M</span>  
                            <span class="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">${topic}</span>  
                            <span class="text-[9px] font-bold text-slate-400 italic ml-2">${q.subject || ''}</span>
                        </div>  
                        <p class="text-slate-700 font-medium leading-relaxed">${text}</p>  
                    </div>  
                    <div class="text-right whitespace-nowrap">  
                        <span class="text-[10px] font-black text-slate-300 group-hover:text-blue-500">YEAR ${year}</span>  
                    </div>  
                </div>  
            </div>  
        `;  
    }).join('');  
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
            btn.classList.remove('bg-white', 'text-slate-600');

            const filterValue = btn.getAttribute('data-filter');
            if (filterValue === 'all') {
                renderCompendium(state.rawQuestions);
            } else {
                const filtered = state.rawQuestions.filter(q => String(q.marks) === filterValue);
                renderCompendium(filtered);
            }
        };
    });
}

function renderHeatmap(topicMap, total) {
    const container = document.getElementById('heatmap-container');
    if (!container || total === 0) return;
    container.innerHTML = '';
    Object.entries(topicMap).sort((a,b)=>b[1]-a[1]).slice(0,4).forEach(([topic, count]) => {
        const perc = Math.round((count / total) * 100);
        container.innerHTML += `<div><div class="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-1">
            <span>${topic}</span><span>${perc}%</span></div>
            <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div class="bg-blue-600 h-full rounded-full" style="width: ${perc}%"></div></div></div>`;
    });
}

function renderForensics(subCount, total) {
    const el = document.getElementById('forensics-text');
    if (!el || total === 0) return;
    const ratio = (subCount / total) * 100;
    el.innerHTML = ratio > 65 ? `<strong>Weightage Pattern:</strong> Highly subjective. Focus on formal steps and diagrams.` : ratio < 35 ? `<strong>Weightage Pattern:</strong> Objective-heavy. Focus on speed and conceptual clarity.` : `<strong>Weightage Pattern:</strong> Balanced mix of theoretical and objective questions.`;
}

function renderPredictive(topicMap) {
    const el = document.getElementById('predictive-text');
    if (!el) return;
    const entries = Object.entries(topicMap);
    if (entries.length === 0) return;
    const topTopic = entries.reduce((a, b) => a[1] > b[1] ? a : b)[0];
    el.innerHTML = `Probability High for: <span class="font-bold underline decoration-green-300">"${topTopic}"</span>`;
}

async function loadMeta() {
    try {
        const docRef = doc(state.db, 'Chapter_Analysis', `${state.grade}_${state.subject}_${state.chapterID}`);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            document.getElementById('industry-connection-text').textContent = snap.data().real_world || "No industry connection data available.";
        }
    } catch (err) { console.warn("Meta load failed", err); }
}
