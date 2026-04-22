// js/pyq_insights.js  
import { getInitializedClients } from './config.js';    
import { bindConsoleLogout } from './guard.js';  
import {    
    doc,    
    getDoc,    
    collection,    
    getDocs,    
    query,    
    where,    
    collectionGroup    
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";    
import { ensureUserInFirestore } from './guard.js';  
  
let state = {    
    grade: new URLSearchParams(window.location.search).get('grade') || '10',    
    subject: new URLSearchParams(window.location.search).get('subject') || 'Mathematics',    
    chapterID: new URLSearchParams(window.location.search).get('chapter') || 'Real_Numbers',   
    rawQuestions: [],  
    db: null    
};    
  
const normalizeChapter = (slug) => slug.replace(/_/g, ' ').trim();    
  
export async function initInsights() {    
    try {    
        const clients = await getInitializedClients();    
        if (!clients) return;    
        state.db = clients.automationDB;    
  
        clients.auth.onAuthStateChanged(async (user) => {    
            if (user) {    
                // Bind logout button (same as study-content / study-library)  
                bindConsoleLogout("logout-nav-btn", "../index.html");  
  
                // Set user welcome name (same as study-library)  
                const profile = await ensureUserInFirestore(user);  
                const welcomeEl = document.getElementById("user-welcome");  
                if (welcomeEl) {  
                    welcomeEl.textContent = profile?.displayName || user.email?.split('+')[1]?.split('@')[0] || "Student";  
                }  
  
                updateHeaderUI();    
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
  
async function runDeepAnalysis() {    
    const chapterName = normalizeChapter(state.chapterID);    
    const container = document.getElementById('compendium-container');    
  
    try {    
        const q = query(    
            collectionGroup(state.db, 'questions'),    
            where('subject', '==', state.subject),    
            where('chapter', '==', chapterName)    
        );    
  
        const snap = await getDocs(q);    
        const questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));    
        state.rawQuestions = questions;  
  
        console.log(`Fetched ${questions.length} questions for ${chapterName}`);    
  
        if (questions.length > 0) {    
            console.log("Sample document fields:", Object.keys(questions[0]));    
            console.log("Sample document:", questions[0]);    
        }    
  
        // Data Processing — dynamic marks detection  
        const topicMap = {};    
        let subjectiveCount = 0;    
  
        // Collect all unique marks values from the data  
        const marksSet = new Set();  
        questions.forEach(q => {    
            const m = String(q.marks);    
            if (m && m !== 'undefined' && m !== 'null') marksSet.add(m);  
  
            const t = q.topic || q.concept || q.sub_topic || q.subtopic || 'General';    
            topicMap[t] = (topicMap[t] || 0) + 1;    
  
            const qType = (q.question_type || q.type || '').toLowerCase();    
            if (qType.includes('subjective') || qType.includes('long') || qType.includes('short')) {    
                subjectiveCount++;    
            }    
        });    
  
        // Build blueprint dynamically from actual marks in data  
        const uniqueMarks = [...marksSet].sort((a, b) => Number(a) - Number(b));  
        const blueprint = {};  
        uniqueMarks.forEach(m => { blueprint[m] = 0; });  
        questions.forEach(q => {  
            const m = String(q.marks);  
            if (blueprint.hasOwnProperty(m)) blueprint[m]++;  
        });  
  
        // Update all UI sections    
        renderBlueprint(blueprint, uniqueMarks);    
        renderHeatmap(topicMap, questions.length);    
        renderForensics(subjectiveCount, questions.length);    
        renderPredictive(topicMap);    
        renderCompendium(questions);  
        setupFilterListeners(uniqueMarks);  
  
        await loadMeta();    
  
    } catch (err) {    
        console.error("Analysis Failed:", err);    
        if (container) {    
            container.innerHTML = `<p class="text-red-500">Failed to load archive: ${err.message}</p>`;    
        }    
    }    
}    
  
/** UI RENDERING FUNCTIONS **/    
  
function renderBlueprint(data, uniqueMarks) {    
    const container = document.getElementById('blueprint-container');  
    if (!container) return;  
  
    if (uniqueMarks.length === 0) {  
        container.innerHTML = `<p class="text-xs text-slate-400 italic col-span-full">No marks data available.</p>`;  
        return;  
    }  
  
    container.innerHTML = uniqueMarks.map(m => `  
        <div class="bg-slate-50 p-2 rounded-xl border border-slate-100">  
            <div class="text-[10px] font-bold text-slate-400 uppercase">${m} Mark${Number(m) !== 1 ? 's' : ''}</div>  
            <div class="text-xl font-black text-slate-700">${data[m] || 0}</div>  
        </div>  
    `).join('');  
}  
  
function renderHeatmap(topicMap, total) {    
    const container = document.getElementById('heatmap-container');    
    if (!container) return;    
  
    if (total === 0) {    
        container.innerHTML = `<p class="text-xs text-slate-400 italic">No data available.</p>`;    
        return;    
    }    
  
    container.innerHTML = '';    
  
    Object.entries(topicMap)    
        .sort((a, b) => b[1] - a[1])    
        .slice(0, 4)    
        .forEach(([topic, count]) => {    
            const perc = Math.round((count / total) * 100);    
            container.innerHTML += `    
                <div>    
                    <div class="flex justify-between text-[10px] font-bold text-slate-500 uppercase mb-1">    
                        <span>${topic}</span>    
                        <span>${perc}%</span>    
                    </div>    
                    <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">    
                        <div class="bg-blue-600 h-full rounded-full" style="width: ${perc}%"></div>    
                    </div>    
                </div>    
            `;    
        });    
}    
  
function renderForensics(subCount, total) {    
    const el = document.getElementById('forensics-text');    
    if (!el) return;    
  
    if (total === 0) {    
        el.innerHTML = `<strong>No data available</strong> to analyze patterns.`;    
        return;    
    }    
  
    const ratio = (subCount / total) * 100;    
  
    if (ratio > 65) {    
        el.innerHTML = `<strong>Weightage Pattern:</strong> This chapter is highly subjective. Focus on writing formal steps and diagrams.`;    
    } else if (ratio < 35) {    
        el.innerHTML = `<strong>Weightage Pattern:</strong> Objective-heavy. Focus on speed and conceptual clarity for MCQs.`;    
    } else {    
        el.innerHTML = `<strong>Weightage Pattern:</strong> Balanced mix of theoretical and objective questions.`;    
    }    
}    
  
function renderPredictive(topicMap) {    
    const el = document.getElementById('predictive-text');    
    if (!el) return;    
  
    const entries = Object.entries(topicMap);    
    if (entries.length === 0) {    
        el.innerHTML = `No topic data available for prediction.`;    
        return;    
    }    
  
    const topTopic = entries.reduce((a, b) => a[1] > b[1] ? a : b)[0];    
    el.innerHTML = `Probability High for: <span class="font-bold underline decoration-green-300">"${topTopic}"</span>`;    
}    
  
function renderCompendium(questions) {    
    const container = document.getElementById('compendium-container');    
    if (!container) return;    
  
    if (questions.length === 0) {    
        container.innerHTML = `<p class="text-slate-400 italic">No historical data available for this selection.</p>`;    
        return;    
    }    
  
    container.innerHTML = questions.map(q => {    
        const text = q.question_text || q.text_en || q.text || 'Question text unavailable.';    
        const topic = q.topic || q.concept || q.sub_topic || q.subtopic || 'General';    
        const marks = q.marks || '?';    
  
        return `    
            <div class="group p-5 border border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/20 transition-all">    
                <div class="flex items-start justify-between gap-4">    
                    <div class="space-y-2">    
                        <div class="flex items-center gap-2">    
                            <span class="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded">${marks}M</span>    
                            <span class="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">${topic}</span>    
                        </div>    
                        <p class="text-slate-700 font-medium leading-relaxed">${text}</p>    
                    </div>    
                    <div class="text-right whitespace-nowrap">    
                        <span class="text-[10px] font-black text-slate-300 group-hover:text-blue-500">PYQ 2022-25</span>    
                    </div>    
                </div>    
            </div>    
        `;    
    }).join('');    
}    
  
async function loadMeta() {    
    try {    
        const docRef = doc(state.db, 'Chapter_Analysis', `${state.grade}_${state.subject}_${state.chapterID}`);    
        const snap = await getDoc(docRef);    
        if (snap.exists()) {    
            const el = document.getElementById('industry-connection-text');    
            if (el) {    
                el.textContent = snap.data().real_world || "No industry connection data available.";    
            }    
        }    
    } catch (err) {    
        console.warn("Meta load failed:", err);    
    }    
}    
  
function updateHeaderUI() {    
    const badge = document.getElementById('context-badge');    
    if (badge) badge.textContent = `Grade ${state.grade}`;    
}    
  
function setupFilterListeners(uniqueMarks) {  
    const container = document.getElementById('marks-filter');  
    if (!container) return;  
  
    // Build buttons dynamically: ALL + each unique mark value from data  
    let html = `<button data-filter="all" class="filter-btn active px-3 py-1 text-[10px] font-bold rounded-full border border-slate-200 bg-slate-900 text-white transition-all">ALL</button>`;  
    uniqueMarks.forEach(m => {  
        html += `<button data-filter="${m}" class="filter-btn px-3 py-1 text-[10px] font-bold rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all">${m}M</button>`;  
    });  
    container.innerHTML = html;  
  
    // Bind click handlers  
    const buttons = container.querySelectorAll('.filter-btn');  
    buttons.forEach(btn => {  
        btn.onclick = () => {  
            buttons.forEach(b => { b.classList.remove('bg-slate-900', 'text-white'); b.classList.add('bg-white', 'text-slate-600'); });  
            btn.classList.add('bg-slate-900', 'text-white');  
            btn.classList.remove('bg-white', 'text-slate-600');  
  
            const filterValue = btn.getAttribute('data-filter');  
            if (filterValue === 'all') {  
                renderCompendium(state.rawQuestions);  
            } else {  
                renderCompendium(state.rawQuestions.filter(q => String(q.marks) === filterValue));  
            }  
        };  
    });  
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
