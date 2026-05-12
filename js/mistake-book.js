import { initializeAuthListener } from "./auth-paywall.js";
import { getInitializedClients } from "./api.js";
import { bindConsoleLogout } from "./guard.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { cleanKatexMarkers } from "./utils.js";
import * as UI from "./ui-renderer.js";
import { loadCurriculum } from "./curriculum/loader.js";

UI.injectStyles();

let currentGrade = "9";
let curriculumData = {};

const state = {
    friction: {},
    victory: {},
    subjectStats: {},
    proficiency: {
        MCQ: { total: 0, mistakes: 0 },
        AR: { total: 0, mistakes: 0 },
        CB: { total: 0, mistakes: 0 }
    },
    victoryCount: 0
};

const THEMES = {
    "Mathematics": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: "fa-calculator", bar: "bg-blue-500", lightBar: "bg-blue-200" },
    "Science": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", icon: "fa-flask", bar: "bg-purple-500", lightBar: "bg-purple-200" },
    "Social Science": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: "fa-landmark", bar: "bg-amber-500", lightBar: "bg-amber-200" },
    "General": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", icon: "fa-cubes", bar: "bg-slate-500", lightBar: "bg-slate-200" }
};

function removeSkeleton(container) {
    if (!container) return;
    container.innerHTML = "";
}

async function init(user, profile) {
    const container = document.getElementById("mistakes-container");
    if (container) UI.showSkeleton(container);

    try {
        currentGrade = profile?.classId || "9";
        const badge = document.getElementById("context-badge");
        if (badge) badge.textContent = `Grade ${currentGrade}`;

        curriculumData = await loadCurriculum(currentGrade).catch(() => ({}));

        const { db } = await getInitializedClients();
        const scoresSnap = await getDocs(query(collection(db, "quiz_scores"), where("user_id", "==", user.uid), orderBy("timestamp", "desc")));
        const mistakesSnap = await getDocs(query(collection(db, "mistake_notebook"), where("user_id", "==", user.uid), orderBy("timestamp", "desc")));

        if (scoresSnap.empty && mistakesSnap.empty) {
            removeSkeleton(container);
            renderEmptyState(container);
            return;
        }

        const scoreDocs = scoresSnap.docs.map(d => {
            const data = d.data();
            const topic = data.topic || data.topicSlug || data.chapter_slug || "";
            const sid = data.session_id;
            const matchingNotebookEntry = mistakesSnap.docs.find(md => {
                const mData = md.data();
                if (sid && mData.session_id) return mData.session_id === sid;
                return (mData.topic === topic || mData.chapter_slug === topic) && 
                       (Math.abs((mData.timestamp?.seconds || 0) - (data.timestamp?.seconds || 0)) < 5);
            });
            data.mistakes = matchingNotebookEntry ? (matchingNotebookEntry.data().mistakes || []) : [];
            return { data: () => data };
        });

        processData(scoreDocs);
        removeSkeleton(container);
        renderConsole(container);
    } catch (e) {
        console.error("Mistake Book Error:", e);
        if (container) container.innerHTML = `<div class="text-center text-red-500 font-bold p-8">Failed to load data.</div>`;
    }
}

function getSubjectContext(topicSlug) {
    const s = topicSlug.toLowerCase();
    let subject = "General";
    for (const [subj, sections] of Object.entries(curriculumData)) {
        for (const chapters of Object.values(sections)) {
            if (!Array.isArray(chapters)) continue;
            for (const ch of chapters) {
                const title = (ch.chapter_title || "").toLowerCase();
                if (title && (s.includes(title) || title.includes(s.replace(/_/g, " ")))) {
                    return { subject: subj, chapterName: ch.chapter_title };
                }
            }
        }
    }
    let cleaned = topicSlug.replace(/^(science|mathematics|social_science|math)_/i, "")
                          .replace(/_\d+_quiz$|_grade_\d+_quiz$/i, "");
    const chapterName = cleaned.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    if (s.includes("math")) subject = "Mathematics";
    else if (s.includes("social")) subject = "Social Science";
    else if (s.includes("science")) subject = "Science";
    return { subject, chapterName };
}

function classifyQuestionType(m) {
    const raw = (m.question_type || "").toLowerCase();
    if (raw.includes("ar") || raw.includes("assertion")) return "AR";
    if (raw.includes("case") || raw.includes("cb")) return "CB";
    return "MCQ";
}

/**
 * UPDATED: Mutual Exclusivity and Clean Initialization
 */
function processData(scoreDocs) {
    const topicHistory = {};
    const subjectScores = {};

    scoreDocs.forEach(d => {
        const data = d.data();
        const topic = data.topic || data.topicSlug || data.chapter_slug;
        if (!topic) return;

        const { subject, chapterName } = getSubjectContext(topic);
        const diff = (data.difficulty || 'simple').toLowerCase();

        if (!subjectScores[subject]) subjectScores[subject] = { simple: [], medium: [], advanced: [] };
        subjectScores[subject][diff].push(parseFloat(data.percentage || 0));

        state.proficiency.MCQ.total += (data.mcq_total || 0);
        state.proficiency.AR.total += (data.ar_total || 0);
        state.proficiency.CB.total += (data.cb_total || 0);

        (data.mistakes || []).forEach(m => state.proficiency[classifyQuestionType(m)].mistakes++);

        const historyKey = `${subject}|${chapterName}`;
        if (!topicHistory[historyKey]) topicHistory[historyKey] = {};
        if (!topicHistory[historyKey][diff]) topicHistory[historyKey][diff] = [];
        topicHistory[historyKey][diff].push({
            mistakes: data.mistakes || [],
            timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
            percentage: data.percentage || 0
        });
    });

    Object.keys(subjectScores).forEach(subj => {
        const s = subjectScores[subj];
        const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
        state.subjectStats[subj] = { simple: avg(s.simple), medium: avg(s.medium), advanced: avg(s.advanced) };
    });

    Object.entries(topicHistory).forEach(([historyKey, difficulties]) => {
        const [subject, chapterName] = historyKey.split('|');

        Object.entries(difficulties).forEach(([diff, attempts]) => {
            attempts.sort((a, b) => b.timestamp - a.timestamp);
            const latestAttempt = attempts[0];
            const latestIds = new Set(latestAttempt.mistakes.map(m => m.id || m.question_id));
            
            const allMistakesMap = new Map();
            attempts.forEach(att => {
                att.mistakes.forEach(m => {
                    const id = m.id || m.question_id;
                    if (!allMistakesMap.has(id)) {
                        allMistakesMap.set(id, {
                            id, text: m.question_text || m.question, 
                            type: classifyQuestionType(m), topic: subject, 
                            difficulty: diff, dates: []
                        });
                    }
                    allMistakesMap.get(id).dates.push(att.timestamp);
                });
            });

            allMistakesMap.forEach((m, id) => {
                if (latestIds.has(id)) {
                    // STILL WRONG: Friction
                    if (!state.friction[subject]) state.friction[subject] = {};
                    if (!state.friction[subject][chapterName]) state.friction[subject][chapterName] = {};
                    if (!state.friction[subject][chapterName][diff]) state.friction[subject][chapterName][diff] = [];
                    state.friction[subject][chapterName][diff].push(m);
                } else {
                    // PREVIOUSLY WRONG, NOW CORRECT: Victory
                    if (!state.victory[subject]) state.victory[subject] = {};
                    if (!state.victory[subject][chapterName]) state.victory[subject][chapterName] = {};
                    if (!state.victory[subject][chapterName][diff]) state.victory[subject][chapterName][diff] = [];
                    state.victory[subject][chapterName][diff].push({ ...m, masteryDate: latestAttempt.timestamp.toDateString() });
                    state.victoryCount++;
                }
            });
        });
    });
}

function renderConsole(container) {
    const sortedSubjects = ["Mathematics", "Science", "Social Science"].sort();
    const tier1 = `
        <div class="glass-panel rounded-3xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between bg-gradient-to-r from-cbse-blue/5 to-transparent border-cbse-blue/10">
            <div class="flex items-center space-x-6">
                <div class="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-3xl shadow-sm">🛡️</div>
                <div><h3 class="text-2xl font-black text-cbse-blue tracking-tight">Diagnostic Status</h3><p class="text-sm text-slate-500 font-medium">Identify patterns. Eliminate friction.</p></div>
            </div>
            <div class="flex items-center space-x-8">
                <div class="text-right"><span class="block text-3xl font-black text-green-600">${state.victoryCount}</span><span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Victory Gains</span></div>
                <div class="text-right"><span class="block text-3xl font-black text-red-500">${Object.keys(state.friction).length}</span><span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Zones</span></div>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div class="glass-panel rounded-3xl p-6 flex flex-col justify-between">
                <h4 class="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Proficiency Profile</h4>
                <div class="space-y-4">${renderProficiencyPill("MCQ", "Recall", state.proficiency.MCQ)}${renderProficiencyPill("AR", "Logic", state.proficiency.AR)}${renderProficiencyPill("CB", "Application", state.proficiency.CB)}</div>
            </div>
            ${sortedSubjects.map(s => renderMasteryCard(s)).join('')}
        </div>`;
    const tier2 = `
        <div class="grid lg:grid-cols-3 gap-8 items-start relative min-h-[500px]">
            <div class="lg:col-span-2 space-y-6">${sortedSubjects.map(s => renderSubjectNavigator(s)).join('')}</div>
            <div class="lg:col-span-1 hidden lg:block sticky top-24">
                <div id="inspector-panel" class="glass-panel rounded-3xl p-6 min-h-[400px] flex flex-col items-center justify-center text-center transition-all duration-300 border border-slate-200 shadow-sm bg-white/50">
                    <div class="text-4xl mb-4 text-slate-300 animate-pulse">📡</div>
                    <h4 class="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Inspector Active</h4>
                    <p class="text-xs text-slate-500 max-w-[200px]">Hover over any chapter on the left to analyze friction points.</p>
                </div>
            </div>
        </div>
        <div id="mobile-inspector" class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm hidden flex items-end justify-center lg:hidden p-4 pb-8" onclick="closeMobileInspector()">
            <div class="bg-white w-full max-w-md rounded-3xl p-6 relative shadow-2xl" onclick="event.stopPropagation()"><div id="mobile-inspector-content"></div></div>
        </div>`;
    container.innerHTML = tier1 + tier2;
}

function renderProficiencyPill(type, label, stats) {
    const errorRate = stats.total > 0 ? (stats.mistakes / stats.total) * 100 : 0;
    let color = "bg-green-100 text-green-700", dot = "bg-green-500", status = "Strong";
    if (errorRate > 30) { color = "bg-red-100 text-red-700"; dot = "bg-red-500"; status = "Needs Focus"; }
    else if (errorRate > 15) { color = "bg-yellow-100 text-yellow-700"; dot = "bg-yellow-500"; status = "Review"; }
    return `<div class="flex items-center justify-between p-3 rounded-xl ${color}"><div class="flex items-center space-x-3"><span class="w-2 h-2 rounded-full ${dot} animate-pulse"></span><div><span class="block text-xs font-black uppercase">${label}</span><span class="text-[10px] font-bold">${status}</span></div></div><span class="text-lg font-black opacity-50">${type}</span></div>`;
}

function renderMasteryCard(subject) {
    const theme = THEMES[subject] || THEMES["General"];
    const stats = state.subjectStats[subject] || { simple: 0, medium: 0, advanced: 0 };
    return `<div class="${theme.bg} rounded-3xl p-5 border ${theme.border} relative overflow-hidden group">
             <div class="flex justify-between items-start mb-4"><h3 class="font-black ${theme.text} text-lg">${subject}</h3><div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-sm ${theme.text}"><i class="fas ${theme.icon}"></i></div></div>
             <div class="flex items-end space-x-2 h-24">
                <div class="flex-1 flex flex-col items-center"><div class="w-full ${theme.bar} rounded-t-md" style="height: ${Math.max(15, stats.simple)}%"></div><span class="text-[9px] font-bold text-slate-400 mt-1 uppercase">Basics</span></div>
                <div class="flex-1 flex flex-col items-center"><div class="w-full ${theme.bar} rounded-t-md opacity-80" style="height: ${Math.max(15, stats.medium)}%"></div><span class="text-[9px] font-bold text-slate-400 mt-1 uppercase">Std</span></div>
                <div class="flex-1 flex flex-col items-center"><div class="w-full ${theme.bar} rounded-t-md opacity-60" style="height: ${Math.max(15, stats.advanced)}%"></div><span class="text-[9px] font-bold text-slate-400 mt-1 uppercase">Elite</span></div>
             </div></div>`;
}

function renderSubjectNavigator(subject) {
    const theme = THEMES[subject] || THEMES["General"];
    const fCount = Object.keys(state.friction[subject] || {}).length;
    const vCount = Object.keys(state.victory[subject] || {}).length;
    return `<div class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div class="px-6 py-5 flex items-center justify-between ${theme.bg}">
                <div class="flex items-center space-x-4"><div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center ${theme.text}"><i class="fas ${theme.icon}"></i></div><h3 class="text-lg font-black text-slate-700">${subject}</h3></div>
                <div class="flex space-x-4">
                    <button onclick="toggleList('${subject}', 'friction')" class="text-xs font-bold text-red-500 hover:underline">Friction (${fCount})</button>
                    <button onclick="toggleList('${subject}', 'victory')" class="text-xs font-bold text-green-600 hover:underline">Victory (${vCount})</button>
                </div>
            </div><div id="list-${subject}" class="hidden bg-white divide-y divide-slate-100"></div></div>`;
}

window.toggleList = (subject, type) => {
    const container = document.getElementById(`list-${subject}`);
    const chapters = state[type][subject] || {};
    if (container.dataset.type === type && !container.classList.contains('hidden')) { container.classList.add('hidden'); return; }
    container.dataset.type = type; container.classList.remove('hidden');
    const names = Object.keys(chapters).sort();
    if (!names.length) { container.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">Clean list!</div>`; return; }
    
    container.innerHTML = names.map(ch => {
        let count = 0; Object.values(chapters[ch]).forEach(arr => count += arr.length);
        return `<div class="px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition chapter-item" data-subject="${subject}" data-chapter="${ch}" data-type="${type}"><span class="text-sm font-bold text-slate-700">${ch}</span><span class="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded">${count}</span></div>`;
    }).join('');

    container.querySelectorAll('.chapter-item').forEach(el => {
        el.addEventListener('mouseenter', () => window.inspectChapter(el.dataset.subject, el.dataset.chapter, el.dataset.type));
        el.addEventListener('click', () => window.inspectChapter(el.dataset.subject, el.dataset.chapter, el.dataset.type, true));
    });
};

/**
 * FIXED: Properly displays question cards in the Inspector
 */
window.inspectChapter = (subject, chapter, type, isClick = false) => {
    const data = state[type][subject]?.[chapter];
    if (!data) return;
    const isFriction = type === 'friction';
    let html = `<div class="text-left"><div class="mb-6 pb-4 border-b border-slate-100"><span class="text-[10px] font-black uppercase tracking-widest ${isFriction ? 'text-red-500' : 'text-green-500'} mb-1 block">${isFriction ? 'Active Friction' : 'Victory Gallery'}</span><h3 class="text-xl font-black text-slate-800">${chapter}</h3></div>`;

    Object.keys(data).sort().forEach(level => {
        html += `<div class="mt-4 mb-2"><span class="text-[10px] font-black uppercase bg-slate-100 px-2 py-1 rounded">${level}</span></div>`;
        data[level].forEach(m => {
            html += `<div class="bg-white rounded-xl p-4 border border-slate-200 mb-3 shadow-sm relative overflow-hidden">
                <div class="absolute left-0 top-0 bottom-0 w-1 ${isFriction ? 'bg-red-400' : 'bg-green-400'}"></div>
                <p class="text-xs font-medium text-slate-700 mb-3 leading-relaxed">${cleanKatexMarkers(m.text)}</p>
                <div class="flex justify-between items-center pt-2 border-t border-slate-50">
                    <span class="text-[9px] font-bold text-slate-400 uppercase">${isFriction ? `Failed ${m.dates.length}x` : `Mastered: ${m.masteryDate}`}</span>
                    ${isFriction ? `<a href="study-content.html?grade=${currentGrade}&topic=${m.topic}" class="text-[9px] font-black text-cbse-blue uppercase hover:underline">Review concept</a>` : ''}
                </div>
            </div>`;
        });
    });

    const panel = document.getElementById('inspector-panel');
    if (panel) {
        panel.innerHTML = html + `</div>`;
        panel.classList.remove('items-center', 'justify-center', 'text-center');
        panel.classList.add('items-start', 'justify-start');
    }
    if (window.innerWidth < 1024 && isClick) {
        document.getElementById('mobile-inspector-content').innerHTML = html + `</div>`;
        document.getElementById('mobile-inspector').classList.remove('hidden');
    }
};

window.closeMobileInspector = () => document.getElementById('mobile-inspector').classList.add('hidden');

function renderEmptyState(container) {
    container.innerHTML = `<div class="glass-panel p-12 rounded-3xl text-center max-w-2xl mx-auto mt-12"><div class="text-6xl mb-6">🎉</div><h3 class="text-2xl font-black text-slate-700 mb-2">Clean Record!</h3><p class="text-slate-500 font-medium">No diagnostic friction points found.</p></div>`;
}

initializeAuthListener(async (user, profile) => {
    if (user) {
        bindConsoleLogout("logout-nav-btn", "../index.html");
        const welcome = document.getElementById("user-welcome");
        if (welcome) welcome.textContent = profile?.displayName || "Scholar";
        await init(user, profile);
    } else { window.location.href = "../offering.html"; }
});
