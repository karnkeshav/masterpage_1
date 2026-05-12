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
    container.querySelectorAll('.skeleton, .loading, .animate-pulse').forEach(el => el.remove());
    container.querySelectorAll('div').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.position === 'absolute' || style.position === 'fixed') {
            el.remove();
        }
    });
    container.innerHTML = "";
}

async function init(user, profile) {
    const container = document.getElementById("mistakes-container");
    if (container) UI.showSkeleton(container);

    try {
        console.log("✅ Profile loaded:", profile);
        currentGrade = profile?.classId || "9";

        const badge = document.getElementById("context-badge");
        if (badge) badge.textContent = `Grade ${currentGrade}`;

        curriculumData = await Promise.race([
            loadCurriculum(currentGrade),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("loadCurriculum timed out")), 5000)
            )
        ]).catch(e => {
            console.warn("Curriculum load failed, continuing without it:", e);
            return {};
        });
        console.log("✅ Curriculum loaded");

        const { db } = await getInitializedClients();
        console.log("✅ DB ready");

        const scoresSnap = await getDocs(query(collection(db, "quiz_scores"), where("user_id", "==", user.uid), orderBy("timestamp", "desc")));
        const mistakesSnap = await getDocs(query(collection(db, "mistake_notebook"), where("user_id", "==", user.uid), orderBy("timestamp", "desc")));

        console.log("📊 Scores count:", scoresSnap.size);
        console.log("📝 Mistakes count:", mistakesSnap.size);

        if (scoresSnap.empty && mistakesSnap.empty) {
            removeSkeleton(container);
            renderEmptyState(container);
            container.style.opacity = "1";
            container.style.visibility = "visible";
            container.style.zIndex = "1";
            return;
        }

        const scoreDocs = scoresSnap.docs.map(d => {
            const data = d.data();
            const topic = data.topic || data.topicSlug || data.chapter_slug || "";
            const t1 = data.timestamp ? data.timestamp.seconds : 0;
            const sid = data.session_id;
            const matchingNotebookEntry = mistakesSnap.docs.find(md => {
                const mData = md.data();
                if (sid && mData.session_id) return mData.session_id === sid;
                return (mData.topic === topic || mData.chapter_slug === topic) && (Math.abs((mData.timestamp?.seconds || 0) - t1) < 5);
            });
            data.mistakes = matchingNotebookEntry ? (matchingNotebookEntry.data().mistakes || []) : [];
            data.difficulty = data.difficulty || 'simple';
            return { data: () => data };
        });

        mistakesSnap.docs.forEach(md => {
            const mData = md.data();
            const topic = mData.topic || mData.chapter_slug || "";
            const mTime = mData.timestamp ? mData.timestamp.seconds : 0;
            const alreadyMapped = scoreDocs.some(sd => {
                const sData = sd.data();
                if (mData.session_id && sData.session_id) return mData.session_id === sData.session_id;
                return (sData.topic === topic || sData.topicSlug === topic || sData.chapter_slug === topic) && (Math.abs((sData.timestamp?.seconds || 0) - mTime) < 5);
            });
            if (!alreadyMapped) {
                scoreDocs.push({ data: () => ({ topic, timestamp: mData.timestamp, percentage: 0, difficulty: mData.difficulty || 'simple', mistakes: mData.mistakes || [], session_id: mData.session_id || null })});
            }
        });

        processData(scoreDocs);
        removeSkeleton(container);
        renderConsole(container);
        container.style.opacity = "1";
        container.style.visibility = "visible";
        container.style.zIndex = "1";

    } catch (e) {
        console.error("Mistake Book Error:", e);
        if (container) container.innerHTML = `<div class="text-center text-red-500 font-bold p-8">Failed to load data. Please refresh.</div>`;
    }
}

// Fix #1: Proper chapter name extraction (remove subject prefix)
function getSubjectContext(topicSlug) {
    const s = topicSlug.toLowerCase();
    let subject = "General";

    // Try curriculum match first (most reliable)
    for (const [subj, sections] of Object.entries(curriculumData)) {
        if (!sections || typeof sections !== 'object') continue;
        for (const [sec, chapters] of Object.entries(sections)) {
            if (!Array.isArray(chapters)) continue;
            for (const ch of chapters) {
                const title = (ch.chapter_title || "").toLowerCase();
                if (title && (s.includes(title) || title.includes(s.replace(/_/g, " ")))) {
                    return { subject: subj, chapterName: ch.chapter_title };
                }
            }
        }
    }

    // Fallback: clean slug-based name
    let cleaned = topicSlug;
    cleaned = cleaned.replace(/^(science|mathematics|social_science|math)_/i, "");
    cleaned = cleaned.replace(/_\d+_quiz$|_grade_\d+_quiz$/i, "");
    const chapterName = cleaned.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

    const prefix = s.split('_')[0];
    if (["math", "mathematics"].includes(prefix)) subject = "Mathematics";
    else if (prefix === "social") subject = "Social Science";
    else if (prefix === "science") subject = "Science";

    return { subject, chapterName };
}

function classifyQuestionType(m) {
    const raw = (m.question_type || "").toLowerCase();
    if (raw.includes("ar") || raw.includes("assertion")) return "AR";
    if (raw.includes("case") || raw.includes("cb")) return "CB";
    return "MCQ";
}

function processData(scoreDocs) {
    const subjectScores = {};
    const topicHistory = {};

    // Pass 1: Aggregate scores, proficiency totals, and per-topic history
    scoreDocs.forEach(d => {
        const data = d.data();
        const topic = data.topic || data.topicSlug || data.chapter_slug;
        if (!topic) return;

        const { subject, chapterName } = getSubjectContext(topic);
        const score = parseFloat(data.percentage || data.score_percent || data.score || 0);
        const diff = (data.difficulty || 'simple').toLowerCase();

        if (!subjectScores[subject]) subjectScores[subject] = { simple: [], medium: [], advanced: [] };
        if (subjectScores[subject][diff]) subjectScores[subject][diff].push(score);

        // Fix #4: Use the actual per-type question counts saved by quiz-engine
        // (mcq_total / ar_total / cb_total come from quiz_scores documents)
        state.proficiency.MCQ.total += (data.mcq_total || 0);
        state.proficiency.AR.total  += (data.ar_total  || 0);
        state.proficiency.CB.total  += (data.cb_total  || 0);

        // Count each wrong question into its actual type's mistake tally
        (data.mistakes || []).forEach(m => {
            const type = classifyQuestionType(m);
            state.proficiency[type].mistakes++;
        });

        const historyKey = `${subject}|${chapterName}`;
        if (!topicHistory[historyKey]) topicHistory[historyKey] = {};
        if (!topicHistory[historyKey][diff]) topicHistory[historyKey][diff] = [];
        topicHistory[historyKey][diff].push({
            mistakes: data.mistakes || [],
            timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
            sessionId: data.session_id || data.sessionId,
            percentage: score
        });
    });

    Object.keys(subjectScores).forEach(subj => {
        const s = subjectScores[subj];
        const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
        state.subjectStats[subj] = { simple: avg(s.simple), medium: avg(s.medium), advanced: avg(s.advanced) };
    });

    // Pass 2: Build friction (persistent wrong Qs) and victory (previously wrong, now correct)
    Object.entries(topicHistory).forEach(([historyKey, difficulties]) => {
        const [subject, chapterName] = historyKey.split('|');

        Object.entries(difficulties).forEach(([diff, attempts]) => {
            if (!attempts?.length) return;
            attempts.sort((a, b) => b.timestamp - a.timestamp);

            // Collect all mistakes across every attempt for this chapter+difficulty
            const allMistakes = new Map();
            let hasRealMistakes = false;

            attempts.forEach(att => {
                if (att.mistakes?.length) hasRealMistakes = true;
                (att.mistakes || []).forEach(m => {
                    const mId = m.id || m.question_id;
                    if (!mId) return;
                    if (!allMistakes.has(mId)) {
                        allMistakes.set(mId, {
                            id: mId,
                            text: m.question_text || m.question || "Question unavailable",
                            type: classifyQuestionType(m),
                            topic: subject,
                            difficulty: diff,
                            dates: [],
                            percentage: att.percentage
                        });
                    }
                    allMistakes.get(mId).dates.push(att.timestamp);
                });
            });

            // Fix #2 & #3: Only create state entries when real mistakes exist.
            // Initializing before this check was causing every chapter (even 100%
            // scores) to appear in friction/victory lists with empty data.
            if (!hasRealMistakes) return;

            if (!state.friction[subject]) state.friction[subject] = {};
            if (!state.friction[subject][chapterName]) state.friction[subject][chapterName] = {};
            if (!state.friction[subject][chapterName][diff]) state.friction[subject][chapterName][diff] = [];

            if (!state.victory[subject]) state.victory[subject] = {};
            if (!state.victory[subject][chapterName]) state.victory[subject][chapterName] = {};
            if (!state.victory[subject][chapterName][diff]) state.victory[subject][chapterName][diff] = [];

            // All mistakes across all attempts → friction list
            allMistakes.forEach(mistakeData => {
                state.friction[subject][chapterName][diff].push({ ...mistakeData });
            });

            // Victory: questions wrong in a past attempt but absent from the latest attempt
            const latestAttempt = attempts[0];
            const latestIds = new Set(
                (latestAttempt.mistakes || []).map(m => m.id || m.question_id).filter(Boolean)
            );
            const prevIds = new Set();
            attempts.slice(1).forEach(att => {
                (att.mistakes || []).forEach(m => prevIds.add(m.id || m.question_id));
            });

            allMistakes.forEach((mistakeData, id) => {
                if (prevIds.has(id) && !latestIds.has(id)) {
                    state.victory[subject][chapterName][diff].push({
                        ...mistakeData,
                        masteryDate: latestAttempt.timestamp.toDateString(),
                        masteredOn: latestAttempt.timestamp
                    });
                    state.victoryCount++;
                }
            });
        });
    });
}

function renderConsole(container) {
    const allSubjects = new Set([...Object.keys(state.subjectStats), ...Object.keys(state.friction), ...Object.keys(state.victory), "Mathematics", "Science", "Social Science"]);
    const sortedSubjects = Array.from(allSubjects).sort();

    const tier1 = `
        <div class="glass-panel rounded-3xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between bg-gradient-to-r from-cbse-blue/5 to-transparent border-cbse-blue/10">
            <div class="flex items-center space-x-6 mb-4 md:mb-0">
                <div class="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-3xl shadow-sm">🛡️</div>
                <div><h3 class="text-2xl font-black text-cbse-blue tracking-tight">Diagnostic Status</h3><p class="text-sm text-slate-500 font-medium">Identify patterns. Eliminate friction.</p></div>
            </div>
            <div class="flex items-center space-x-8">
                <div class="text-right"><span class="block text-3xl font-black text-green-600">${state.victoryCount}</span><span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Victory Gains</span></div>
                <div class="h-10 w-px bg-slate-200"></div>
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
            <div class="lg:col-span-2 space-y-6"><h4 class="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Subject Navigator</h4>${sortedSubjects.map(s => renderSubjectNavigator(s)).join('')}</div>
            <div class="lg:col-span-1 hidden lg:block sticky top-24">
                <div id="inspector-panel" class="glass-panel rounded-3xl p-6 min-h-[400px] flex flex-col items-center justify-center text-center transition-all duration-300 border border-slate-200 shadow-sm relative overflow-hidden bg-white/50">
                     <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10"><div class="w-64 h-64 rounded-full border border-slate-300 relative overflow-hidden"><div class="radar-sweep"></div></div></div>
                    <div class="relative z-10"><div class="text-4xl mb-4 text-slate-300 animate-pulse">📡</div><h4 class="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Inspector Active</h4><p class="text-xs text-slate-500 max-w-[200px]">Hover over any chapter on the left to analyze friction points.</p></div>
                </div>
            </div>
        </div>
        <div id="mobile-inspector" class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm hidden flex items-end justify-center lg:hidden p-4 pb-8" onclick="closeMobileInspector()"><div class="bg-white w-full max-w-md rounded-3xl max-h-[85vh] overflow-y-auto p-6 relative slide-up shadow-2xl" onclick="event.stopPropagation()"><div class="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-6"></div><div id="mobile-inspector-content"></div></div></div>`;
    container.innerHTML = tier1 + tier2;
}

function renderProficiencyPill(type, label, stats) {
    const { total, mistakes } = stats;
    if (total === 0) return `<div class="flex items-center justify-between p-3 rounded-xl bg-slate-100 text-slate-500"><div class="flex items-center space-x-3"><span class="w-2 h-2 rounded-full bg-slate-300"></span><div><span class="block text-xs font-black uppercase tracking-wide">${label}</span><span class="text-[10px] opacity-80 font-bold">No Data</span></div></div><span class="text-lg font-black opacity-30">${type}</span></div>`;
    const errorRate = total > 0 ? (mistakes / total) * 100 : 0;
    let color = "bg-green-100 text-green-700", dot = "bg-green-500", status = "Strong";
    if (errorRate > 30) { color = "bg-red-100 text-red-700"; dot = "bg-red-500"; status = "Needs Focus"; }
    else if (errorRate > 15) { color = "bg-yellow-100 text-yellow-700"; dot = "bg-yellow-500"; status = "Review"; }
    return `<div class="flex items-center justify-between p-3 rounded-xl ${color} transition hover:scale-[1.02]"><div class="flex items-center space-x-3"><span class="w-2 h-2 rounded-full ${dot} animate-pulse"></span><div><span class="block text-xs font-black uppercase tracking-wide">${label}</span><span class="text-[10px] opacity-80 font-bold">${status}</span></div></div><span class="text-lg font-black opacity-50">${type}</span></div>`;
}

function renderMasteryCard(subject) {
    const theme = THEMES[subject] || THEMES["General"];
    const stats = state.subjectStats[subject] || { simple: 0, medium: 0, advanced: 0 };
    return `<div class="${theme.bg} rounded-3xl p-5 border ${theme.border} relative overflow-hidden group">
             <div class="flex justify-between items-start mb-4 relative z-10"><h3 class="font-black ${theme.text} text-lg tracking-tight">${subject}</h3><div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-sm shadow-sm ${theme.text}"><i class="fas ${theme.icon}"></i></div></div>
             <div class="flex items-end space-x-2 h-24 mt-2 relative z-10">
                <div class="flex-1 flex flex-col items-center"><div class="w-full ${theme.bar} rounded-t-md progress-step" style="height: ${Math.max(15, stats.simple)}%"></div><span class="text-[9px] font-bold text-slate-400 mt-1 uppercase">Basics</span></div>
                <div class="flex-1 flex flex-col items-center"><div class="w-full ${theme.bar} rounded-t-md progress-step opacity-80" style="height: ${Math.max(15, stats.medium)}%"></div><span class="text-[9px] font-bold text-slate-400 mt-1 uppercase">Std</span></div>
                <div class="flex-1 flex flex-col items-center"><div class="w-full ${theme.bar} rounded-t-md progress-step opacity-60" style="height: ${Math.max(15, stats.advanced)}%"></div><span class="text-[9px] font-bold text-slate-400 mt-1 uppercase">Elite</span></div>
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
            </div><div id="list-${subject}" class="hidden bg-white"></div></div>`;
}

// Indexed registry avoids HTML-attribute quoting bugs with chapter names
const _chIdx = [];

window.toggleList = (subject, type) => {
    const container = document.getElementById(`list-${subject}`);
    if (!container) return;
    const chapters = state[type][subject] || {};
    const names = Object.keys(chapters).sort();

    if (container.dataset.type === type && !container.classList.contains('hidden')) {
        container.classList.add('hidden');
        return;
    }
    container.dataset.type = type;
    container.classList.remove('hidden');

    if (names.length === 0) {
        container.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">No items found.</div>`;
        return;
    }

    let html = `<div class="divide-y divide-slate-100 max-h-64 overflow-y-auto">`;
    names.forEach(ch => {
        let count = 0;
        Object.values(chapters[ch]).forEach(arr => { count += arr.length; });
        const idx = _chIdx.length;
        _chIdx.push({ subject, chapter: ch, type });
        html += `<div class="px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition select-none" onclick="window._inspectIdx(${idx})">
            <span class="text-sm font-bold text-slate-700 hover:text-cbse-blue">${ch}</span>
            <span class="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded">${count}</span>
        </div>`;
    });
    container.innerHTML = html + `</div>`;
};

window._inspectIdx = (idx) => {
    const entry = _chIdx[idx];
    if (entry) window.inspectChapter(entry.subject, entry.chapter, entry.type);
};

window.inspectChapter = (subject, chapter, type) => {
    const difficultiesObj = state[type]?.[subject]?.[chapter];
    if (!difficultiesObj) return;

    const isFriction = type === 'friction';

    // Flatten all difficulties into one question list, keeping the diff label
    const questions = [];
    Object.entries(difficultiesObj).forEach(([diff, items]) => {
        (items || []).forEach(m => questions.push({ ...m, diff }));
    });
    if (!questions.length) return;

    // Sort: most-repeated failures first, then alphabetically by text
    questions.sort((a, b) => (b.dates?.length || 0) - (a.dates?.length || 0) || (a.text || '').localeCompare(b.text || ''));

    const diffBadge = { simple: 'bg-blue-100 text-blue-700', medium: 'bg-amber-100 text-amber-700', advanced: 'bg-purple-100 text-purple-700' };

    const header = `
        <div class="pb-4 mb-4 border-b border-slate-100">
            <span class="text-[10px] font-black uppercase tracking-widest ${isFriction ? 'text-red-500' : 'text-green-500'} block mb-1">
                ${isFriction ? '⚠️ Friction Zone' : '✅ Victory Gallery'}
            </span>
            <h3 class="text-base font-black text-slate-800 leading-snug">${chapter}</h3>
            <p class="text-[10px] text-slate-400 mt-0.5">${questions.length} question${questions.length !== 1 ? 's' : ''} · ${subject}</p>
        </div>`;

    const cards = questions.map(m => {
        const failCount = m.dates?.length || 0;
        const isRepeated = failCount > 1;
        const lastTs = m.dates?.reduce((best, d) => {
            const t = d instanceof Date ? d.getTime() : (d.toDate?.() ?? new Date(d)).getTime();
            return t > best ? t : best;
        }, 0);
        const lastDate = lastTs ? new Date(lastTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

        if (isFriction) {
            const cardBg = isRepeated ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100';
            const countBadge = isRepeated
                ? `<span class="text-[9px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded">⚠️ Wrong ${failCount}×</span>`
                : `<span class="text-[9px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">1st attempt</span>`;
            return `<div class="rounded-xl border ${cardBg} p-3 space-y-2">
                <div class="flex items-center gap-2 flex-wrap">
                    ${countBadge}
                    <span class="text-[9px] font-bold ${diffBadge[m.diff] || 'bg-slate-100 text-slate-500'} px-2 py-0.5 rounded">${m.diff}</span>
                </div>
                <p class="text-xs font-medium text-slate-800 leading-relaxed break-words">${cleanKatexMarkers(m.text)}</p>
                ${lastDate ? `<p class="text-[9px] text-slate-400">Last wrong: ${lastDate}</p>` : ''}
            </div>`;
        } else {
            const masteryDate = m.masteryDate || lastDate;
            return `<div class="rounded-xl border border-green-200 bg-green-50 p-3 space-y-2">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[9px] font-black bg-green-100 text-green-700 px-2 py-0.5 rounded">✅ Mastered</span>
                    <span class="text-[9px] font-bold ${diffBadge[m.diff] || 'bg-slate-100 text-slate-500'} px-2 py-0.5 rounded">${m.diff}</span>
                </div>
                <p class="text-xs font-medium text-slate-800 leading-relaxed break-words">${cleanKatexMarkers(m.text)}</p>
                ${masteryDate ? `<p class="text-[9px] text-green-600">🏆 Corrected: ${masteryDate}</p>` : ''}
            </div>`;
        }
    }).join('');

    const html = `<div class="text-left">${header}<div class="space-y-3">${cards}</div></div>`;

    const panel = document.getElementById('inspector-panel');
    if (panel) {
        panel.innerHTML = html;
        panel.className = 'glass-panel rounded-3xl p-5 border border-slate-200 shadow-sm bg-white/80 overflow-y-auto';
        panel.style.maxHeight = '75vh';
    }

    const mobileContent = document.getElementById('mobile-inspector-content');
    const mobilePanel = document.getElementById('mobile-inspector');
    if (mobileContent) mobileContent.innerHTML = html;
    if (mobilePanel && window.innerWidth < 1024) mobilePanel.classList.remove('hidden');
};

window.closeMobileInspector = () => {
    const p = document.getElementById('mobile-inspector');
    if (p) p.classList.add('hidden');
};

function renderEmptyState(container) {
    if (!container) return;
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
