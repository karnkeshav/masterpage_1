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
    victoryCount: 0,
    activeChapterCount: 0
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
                       (Math.abs((mData.timestamp?.seconds || 0) - (data.timestamp?.seconds || 0)) < 10);
            });
            data.mistakes = matchingNotebookEntry ? (matchingNotebookEntry.data().mistakes || []) : [];
            return { data: () => data };
        });

        mistakesSnap.docs.forEach(md => {
            const mData = md.data();
            const sid = mData.session_id;
            const alreadyMapped = scoreDocs.some(sd => {
                const sData = sd.data();
                if (sid && sData.session_id) return sData.session_id === sid;
                return (sData.topic === mData.topic || sData.chapter_slug === mData.chapter_slug) &&
                       (Math.abs((sData.timestamp?.seconds || 0) - (mData.timestamp?.seconds || 0)) < 10);
            });
            if (!alreadyMapped) {
                scoreDocs.push({ data: () => ({ ...mData, percentage: 0 }) });
            }
        });

        processData(scoreDocs);
        removeSkeleton(container);
        renderConsole(container);
    } catch (e) {
        console.error("Mistake Book Error:", e);
        if (container) container.innerHTML = `<div class="text-center text-red-500 font-bold p-8">Failed to load data.</div>`;
    }
}

function getSubjectContext(topicSlug = "") {
    const raw = String(topicSlug || "");
    const s = raw.toLowerCase();
    let subject = "General";

    // Prefer exact curriculum table_id matches. Title-only matching can misclassify
    // similar slugs (for example, Force and Laws of Motion vs Motion).
    for (const [subj, sections] of Object.entries(curriculumData)) {
        if (!sections || typeof sections !== 'object') continue;
        for (const chapters of Object.values(sections)) {
            if (!Array.isArray(chapters)) continue;
            for (const ch of chapters) {
                const tableId = String(ch.table_id || "").toLowerCase();
                if (tableId && tableId === s) {
                    return { subject: subj, chapterName: ch.chapter_title || raw };
                }
            }
        }
    }

    // Then fall back to title matching for legacy documents that stored a title
    // instead of the table slug.
    const slugWords = s.replace(/_/g, " ");
    for (const [subj, sections] of Object.entries(curriculumData)) {
        if (!sections || typeof sections !== 'object') continue;
        for (const chapters of Object.values(sections)) {
            if (!Array.isArray(chapters)) continue;
            for (const ch of chapters) {
                const title = String(ch.chapter_title || "").toLowerCase();
                if (title && (slugWords.includes(title) || title.includes(slugWords))) {
                    return { subject: subj, chapterName: ch.chapter_title };
                }
            }
        }
    }

    // Fallback: clean the slug while preserving the subject prefix.
    let cleaned = raw.replace(/^(science|mathematics|social_science|social|math)_/i, "")
                     .replace(/_\d+_quiz$|_grade_\d+_quiz$/i, "")
                     .replace(/_quiz$/i, "");
    const chapterName = cleaned.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

    if (s.includes("math")) subject = "Mathematics";
    else if (s.includes("social")) subject = "Social Science";
    else if (s.includes("science")) subject = "Science";

    return { subject, chapterName: chapterName || raw || "Unknown Chapter" };
}

function classifyQuestionType(m) {
    const raw = (m.question_type || "").toLowerCase();
    if (raw.includes("ar") || raw.includes("assertion")) return "AR";
    if (raw.includes("case") || raw.includes("cb")) return "CB";
    return "MCQ";
}

// ═══════════════════════════════════════════════════════════════════════════
// CORRECTED: Proper friction/victory logic
// ═══════════════════════════════════════════════════════════════════════════
function normalizeDifficulty(value) {
    return String(value || "simple").trim().toLowerCase();
}

function toDate(value) {
    if (!value) return new Date(0);
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function getScore(data) {
    const raw = data.percentage ?? data.score_percent ?? data.scorePercent;
    if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
    if (typeof data.score === "number" && typeof data.total === "number" && data.total > 0) {
        return Math.round((data.score / data.total) * 100);
    }
    return null;
}

function getMistakeId(m) {
    return String(m.id || m.question_id || m.question_text || m.question || "").trim();
}

function addToState(type, subject, chapter, mistakeData) {
    const diff = normalizeDifficulty(mistakeData.difficulty);
    state[type][subject] ||= {};
    state[type][subject][chapter] ||= {};
    state[type][subject][chapter][diff] ||= [];
    state[type][subject][chapter][diff].push(mistakeData);
}

function countChapters(group) {
    return Object.values(group).reduce((total, chapters) => total + Object.keys(chapters || {}).length, 0);
}

function processData(scoreDocs) {
    state.friction = {};
    state.victory = {};
    state.subjectStats = {};
    state.proficiency = {
        MCQ: { total: 0, mistakes: 0 },
        AR: { total: 0, mistakes: 0 },
        CB: { total: 0, mistakes: 0 }
    };
    state.victoryCount = 0;
    state.activeChapterCount = 0;

    const topicHistory = {};
    const subjectScores = {};

    // PASS 1: Build chapter-attempt history and subject scores from quiz_scores
    // joined with mistake_notebook entries. Each attempt keeps the question IDs
    // that were wrong for that submit event.
    scoreDocs.forEach(d => {
        const data = d.data();
        const topic = data.topic || data.topicSlug || data.chapter_slug;
        if (!topic) return;

        const { subject, chapterName } = getSubjectContext(topic);
        const diff = normalizeDifficulty(data.difficulty);
        const score = getScore(data);
        const mistakes = Array.isArray(data.mistakes) ? data.mistakes : [];

        if (!subjectScores[subject]) subjectScores[subject] = { simple: [], medium: [], advanced: [] };
        if (score !== null) {
            if (!subjectScores[subject][diff]) subjectScores[subject][diff] = [];
            subjectScores[subject][diff].push(score);
        }

        state.proficiency.MCQ.total += (data.mcq_total || 0);
        state.proficiency.AR.total += (data.ar_total || 0);
        state.proficiency.CB.total += (data.cb_total || 0);
        mistakes.forEach(m => {
            const type = classifyQuestionType(m);
            state.proficiency[type].mistakes++;
        });

        const historyKey = `${subject}|${chapterName}|${topic}`;
        if (!topicHistory[historyKey]) topicHistory[historyKey] = { subject, chapterName, topic, difficulties: {} };
        if (!topicHistory[historyKey].difficulties[diff]) topicHistory[historyKey].difficulties[diff] = [];
        topicHistory[historyKey].difficulties[diff].push({
            mistakes,
            timestamp: toDate(data.timestamp),
            topic
        });
    });

    // Calculate subject averages.
    Object.keys(subjectScores).forEach(subj => {
        const s = subjectScores[subj];
        const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
        state.subjectStats[subj] = { simple: avg(s.simple || []), medium: avg(s.medium || []), advanced: avg(s.advanced || []) };
    });

    // PASS 2: A question is active friction when it is still wrong in the
    // latest attempt for that chapter/difficulty. If it was wrong before but
    // absent from the latest attempt's wrong-question list, it moves to victory.
    Object.values(topicHistory).forEach(({ subject, chapterName, topic, difficulties }) => {
        Object.entries(difficulties).forEach(([diff, attempts]) => {
            if (!attempts?.length) return;

            attempts.sort((a, b) => b.timestamp - a.timestamp);
            const allMistakes = new Map();

            attempts.forEach(att => {
                att.mistakes.forEach(m => {
                    const id = getMistakeId(m);
                    if (!id) return;
                    if (!allMistakes.has(id)) {
                        allMistakes.set(id, {
                            id,
                            text: m.question_text || m.question || "Question unavailable",
                            type: classifyQuestionType(m),
                            dates: [],
                            topic,
                            difficulty: diff
                        });
                    }
                    allMistakes.get(id).dates.push(att.timestamp);
                });
            });

            if (!allMistakes.size) return;

            const latestIds = new Set(attempts[0].mistakes.map(getMistakeId).filter(Boolean));
            allMistakes.forEach((mistakeData, id) => {
                const sortedDates = mistakeData.dates.sort((a, b) => a - b);
                const enriched = {
                    ...mistakeData,
                    dates: sortedDates,
                    lastFailedDate: sortedDates[sortedDates.length - 1]?.toLocaleDateString() || "Recent"
                };

                if (latestIds.has(id)) {
                    addToState('friction', subject, chapterName, enriched);
                } else {
                    addToState('victory', subject, chapterName, {
                        ...enriched,
                        masteryDate: attempts[0].timestamp.toLocaleDateString()
                    });
                    state.victoryCount++;
                }
            });
        });
    });

    state.activeChapterCount = countChapters(state.friction);
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
                <div class="text-right"><span class="block text-3xl font-black text-red-500">${state.activeChapterCount}</span><span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Zones</span></div>
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
                <div id="inspector-panel" class="glass-panel rounded-3xl p-6 min-h-[400px] flex flex-col items-center justify-center text-center transition-all duration-300 border border-slate-200 shadow-sm bg-white/50 overflow-y-auto">
                    <div class="text-4xl mb-4 text-slate-300 animate-pulse">📡</div>
                    <h4 class="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Inspector Active</h4>
                    <p class="text-xs text-slate-500 max-w-[200px]">Hover over any chapter on the left to analyze friction points.</p>
                </div>
            </div>
        </div>
        <div id="mobile-inspector" class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm hidden flex items-end justify-center lg:hidden p-4 pb-8" onclick="closeMobileInspector()">
            <div class="bg-white w-full max-w-md rounded-3xl p-6 relative shadow-2xl overflow-y-auto max-h-[80vh]" onclick="event.stopPropagation()"><div id="mobile-inspector-content"></div></div>
        </div>`;
    container.innerHTML = tier1 + tier2;
}

function renderProficiencyPill(type, label, stats) {
    if (stats.total === 0) return `<div class="p-3 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold">No data for ${label}</div>`;
    const errorRate = (stats.mistakes / stats.total) * 100;
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
    const fChapters = Object.keys(state.friction[subject] || {}).length;
    const vChapters = Object.keys(state.victory[subject] || {}).length;
    return `<div class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm transition group">
            <div class="px-6 py-5 flex items-center justify-between border-b border-slate-50 ${theme.bg}">
                <div class="flex items-center space-x-4"><div class="w-10 h-10 rounded-xl bg-white text-lg flex items-center justify-center shadow-sm ${theme.text}"><i class="fas ${theme.icon}"></i></div><h3 class="text-lg font-black text-slate-700 tracking-tight">${subject}</h3></div>
                <div class="flex space-x-4"><button onclick="toggleList('${subject}', 'friction')" class="text-xs font-bold text-red-500 hover:text-red-700 transition flex items-center"><span class="w-2 h-2 bg-red-500 rounded-full mr-2"></span> Friction (${fChapters})</button>
                <button onclick="toggleList('${subject}', 'victory')" class="text-xs font-bold text-green-600 hover:text-green-700 transition flex items-center"><span class="w-2 h-2 bg-green-500 rounded-full mr-2"></span> Victory (${vChapters})</button></div>
            </div><div id="list-${subject.replace(/\s+/g, '-')}" class="hidden bg-white"></div></div>`;
}

window.toggleList = (subject, type) => {
    const container = document.getElementById(`list-${subject}`);
    const chapters = state[type][subject] || {};
    const names = Object.keys(chapters).sort();
    if (container.dataset.type === type && !container.classList.contains('hidden')) { container.classList.add('hidden'); return; }
    container.dataset.type = type;
    container.classList.remove('hidden');
    if (names.length === 0) { container.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">No items found.</div>`; return; }
    let html = `<div class="divide-y divide-slate-100 max-h-64 overflow-y-auto">`;
    names.forEach(ch => {
        let count = 0;
        Object.values(chapters[ch]).forEach(arr => count += arr.length);
        html += `<div class="px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition group/item chapter-item" data-subject="${subject}" data-chapter="${ch}" data-type="${type}"><span class="text-sm font-bold text-slate-700 group-hover/item:text-cbse-blue">${ch}</span><span class="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded">${count}</span></div>`;
    });
    container.innerHTML = html + `</div>`;
    container.querySelectorAll('.chapter-item').forEach(el => {
        const s = el.getAttribute('data-subject');
        const ch = el.getAttribute('data-chapter');
        const t = el.getAttribute('data-type');
        el.addEventListener('mouseenter', () => window.inspectChapter(s, ch, t));
        el.addEventListener('click', () => window.inspectChapter(s, ch, t, true));
    });
};

// Fix #2 & #4: Complete rewrite of inspectChapter to show questions properly
window.inspectChapter = (subject, chapter, type, isClick = false) => {
    const difficultiesObj = state[type][subject]?.[chapter];
    if (!difficultiesObj) return;
    const isFriction = type === 'friction';
    let html = `<div class="animate-fade-in text-left"><div class="mb-6 pb-4 border-b border-slate-100"><span class="text-[10px] font-black uppercase tracking-widest ${isFriction ? 'text-red-500' : 'text-green-500'} mb-1 block">${isFriction ? 'Persistent Friction' : 'Victory Gallery'}</span><h3 class="text-xl font-black text-slate-800 leading-tight">${chapter}</h3></div>`;

    Object.keys(difficultiesObj).sort().forEach(diff => {
        const items = difficultiesObj[diff];
        if (!items?.length) return;

        const colors = { simple: 'text-blue-500', medium: 'text-amber-500', advanced: 'text-purple-500' };
        const bgs = { simple: 'bg-blue-50', medium: 'bg-amber-50', advanced: 'bg-purple-50' };
        html += `<div class="mt-6 mb-3 flex items-center"><span class="text-xs font-black uppercase tracking-widest ${colors[diff] || 'text-slate-500'} px-2 py-1 ${bgs[diff] || 'bg-slate-100'} rounded">${diff} Level</span></div>`;

        items.forEach(m => {
            const dateStr = (m.dates || [])
                .map(d => (d instanceof Date ? d : d.toDate?.() || new Date(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
                .join(', ');
            const count = (m.dates || []).length;

            if (isFriction) {
                html += `<div class="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-3 relative">
                    <div class="absolute left-0 top-4 bottom-4 w-1 bg-red-400 rounded-r-full"></div>
                    ${count > 1 ? `<div class="mb-2"><span class="text-[9px] font-black bg-red-100 text-red-600 px-2 py-0.5 rounded border border-red-200 uppercase tracking-wider shadow-sm">⚠️ Failed ${count} Times</span></div>` : ''}
                    <p class="text-xs font-medium text-slate-700 pl-3 mb-3 leading-relaxed">${cleanKatexMarkers(m.text)}</p>
                    <div class="pl-3 pt-2 border-t border-slate-200/50 flex justify-between items-center">
                        <span class="text-[9px] font-bold text-red-500 uppercase">Trend: ${dateStr}</span>
                        <a href="study-content.html?grade=${currentGrade}&topic=${m.topic}" class="text-[9px] font-black text-red-600 bg-white border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 uppercase shadow-sm">Master Concept</a>
                    </div>
                </div>`;
            } else {
                html += `<div class="bg-green-50 rounded-xl p-4 border border-green-100 mb-3 relative">
                    <div class="absolute left-0 top-4 bottom-4 w-1 bg-green-400 rounded-r-full"></div>
                    <div class="mb-2">
                        <span class="text-[9px] font-black bg-green-100 text-green-700 px-2 py-0.5 rounded border border-green-200 uppercase tracking-wider">✅ Mastered</span>
                    </div>
                    <p class="text-xs font-medium text-slate-700 pl-3 mb-3 leading-relaxed">${cleanKatexMarkers(m.text)}</p>
                    <div class="pl-3 pt-2 border-t border-green-200/50 flex justify-between items-center">
                        <span class="text-[9px] font-bold text-green-600 uppercase">🏆 Since: ${m.masteryDate}</span>
                        <span class="text-[9px] font-bold text-green-600 bg-white border border-green-100 px-2 py-1 rounded">Type: ${m.type || 'MCQ'}</span>
                    </div>
                </div>`;
            }
        });
    });

    const inspector = document.getElementById('inspector-panel');
    if (inspector) {
        inspector.innerHTML = html + `</div>`;
        inspector.classList.replace('items-center', 'items-start');
        inspector.classList.replace('justify-center', 'justify-start');
        inspector.classList.remove('text-center');
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
