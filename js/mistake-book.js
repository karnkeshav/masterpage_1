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

window.state = state;

const THEMES = {
    "Mathematics": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: "fa-calculator", bar: "bg-blue-500", lightBar: "bg-blue-200" },
    "Science": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", icon: "fa-flask", bar: "bg-purple-500", lightBar: "bg-purple-200" },
    "Social Science": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: "fa-landmark", bar: "bg-amber-500", lightBar: "bg-amber-200" },
    "General": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", icon: "fa-cubes", bar: "bg-slate-500", lightBar: "bg-slate-200" }
};

function removeSkeleton(container) {

    if (!container) return;

    container
        .querySelectorAll(
            '.skeleton, .loading, .animate-pulse'
        )
        .forEach(el => el.remove());

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
        console.log("🔍 Both empty?", scoresSnap.empty && mistakesSnap.empty);

        if (scoresSnap.empty && mistakesSnap.empty) {
            removeSkeleton(container);
            renderEmptyState(container);
            container.style.opacity = "1";
            container.style.visibility = "visible";
            container.style.zIndex = "1";
            return;
        }

                window.__debugScores = [];
               const scoreDocs = scoresSnap.docs.map(d => {

    const data = d.data();
    window.__debugScores.push(data);               

    const topic =
        data.topic ||
        data.topicSlug ||
        data.chapter_slug ||
        "";

    const t1 = data.timestamp
        ? data.timestamp.seconds
        : 0;

    const sid = data.session_id;

    const matchingNotebookEntry = mistakesSnap.docs.find(md => {

        const mData = md.data();

        if (sid && mData.session_id) {
            return mData.session_id === sid;
        }

        return (
            (mData.topic === topic ||
             mData.chapter_slug === topic) &&
            Math.abs(
                (mData.timestamp?.seconds || 0) - t1
            ) < 5
        );
    });

    // PRIORITY 1 = mistake_notebook
    if (matchingNotebookEntry) {

        data.mistakes =
            matchingNotebookEntry.data().mistakes || [];

    } else {

        // FALLBACK = derive mistakes from quiz_scores
        const incorrect =
            data.incorrect_questions ||
            data.wrong_questions ||
            data.mistakes ||
            [];

        data.mistakes = incorrect;
    }

    data.difficulty =
        data.difficulty || "simple";

    return {
        data: () => data
    };
});
        

                mistakesSnap.docs.forEach(md => {
                    const mData = md.data();
                    const topic = mData.topic || mData.chapter_slug || "";
                    const mTime = mData.timestamp ? mData.timestamp.seconds : 0;
                    const alreadyMapped = scoreDocs.some(sd => {
                        const sData = sd.data();
                        // Prefer exact session_id match; fall back to topic+timestamp proximity
                        if (mData.session_id && sData.session_id) return mData.session_id === sData.session_id;
                        return (sData.topic === topic || sData.topicSlug === topic || sData.chapter_slug === topic) && (Math.abs((sData.timestamp?.seconds || 0) - mTime) < 5);
                    });
                    if (!alreadyMapped) {
                        scoreDocs.push({ data: () => ({ topic, timestamp: mData.timestamp, percentage: 0, difficulty: mData.difficulty || 'simple', mistakes: mData.mistakes || [], session_id: mData.session_id || null })});
                    }
                });

                
               processData(scoreDocs);

                // ✅ Step 1: remove skeleton COMPLETELY
                removeSkeleton(container);

                // ✅ Step 2: verify container is clean
                console.log("After skeleton removal:", container);

                // ✅ Step 3: render ONCE
                renderConsole(container); 

                container.style.opacity = "1";
                container.style.visibility = "visible";
                container.style.zIndex = "1";
               
            } catch (e) {
                console.error("Mistake Book Error:", e);
                if (container) container.innerHTML = `<div class="text-center text-red-500 font-bold p-8">Failed to load data. Please refresh.</div>`;
            }
        }

function getSubjectContext(topicSlug) {

    const s = (topicSlug || "").toLowerCase();

    let subject = "General";

    let chapterName = topicSlug
        .replace(/^(math|mathematics|science|social)_/i, '')
        .replace(/_\d+_quiz$/i, '')
        .replace(/_quiz$/i, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());

    // EXACT CURRICULUM MATCH
    for (const [subj, sections] of Object.entries(curriculumData || {})) {

        for (const chapters of Object.values(sections || {})) {

            if (!Array.isArray(chapters)) continue;

            for (const ch of chapters) {

                const tableId =
                    (ch.table_id || "").toLowerCase();

                if (tableId === s) {

                    return {
                        subject: subj,
                        chapterName: ch.chapter_title
                    };
                }
            }
        }
    }

    // FALLBACK SUBJECT DETECTION
    const prefix = s.split('_')[0];

    if (["math", "mathematics"].includes(prefix)) {
        subject = "Mathematics";
    }

    else if (prefix === "social") {
        subject = "Social Science";
    }

    else if (prefix === "science") {
        subject = "Science";
    }

    return {
        subject,
        chapterName
    };
}

function getQuestionType(id) {
    const strId = String(id || "");
    if (strId.startsWith("ar_")) return "AR";
    if (strId.startsWith("cb_")) return "CB";
    return "MCQ";
}
function processData(scoreDocs) {

    const subjectScores = {};
    const topicHistory = {};

    // RESET STATE
    state.friction = {};
    state.victory = {};
    state.subjectStats = {};
    state.victoryCount = 0;

    state.proficiency = {
        MCQ: { total: 0, mistakes: 0 },
        AR: { total: 0, mistakes: 0 },
        CB: { total: 0, mistakes: 0 }
    };

    scoreDocs.forEach(d => {

        const data = d.data();

        const topic =
            data.topic ||
            data.chapter_slug ||
            data.topicSlug;

        if (!topic) return;

        const { subject } = getSubjectContext(topic);

        const score = parseFloat(
            data.percentage ||
            data.score_percent ||
            0
        );

        const diff = (
            data.difficulty || "simple"
        ).toLowerCase();

        // SUBJECT STATS
        if (!subjectScores[subject]) {
            subjectScores[subject] = {
                simple: [],
                medium: [],
                advanced: []
            };
        }

        if (subjectScores[subject][diff]) {
            subjectScores[subject][diff].push(score);
        }

        // TOPIC HISTORY
        if (!topicHistory[topic]) {
            topicHistory[topic] = {};
        }

        if (!topicHistory[topic][diff]) {
            topicHistory[topic][diff] = [];
        }

        const ts = data.timestamp?.toDate
            ? data.timestamp.toDate()
            : (data.timestamp || new Date());

        topicHistory[topic][diff].push({
            mistakes: data.mistakes || [],
            timestamp: ts
        });

        // PROFICIENCY
        // PROFICIENCY TOTALS

state.proficiency.MCQ.total += (
    data.mcq_total || 0
);

state.proficiency.AR.total += (
    data.ar_total || 0
);

state.proficiency.CB.total += (
    data.cb_total || 0
);

// PROFICIENCY MISTAKES

(data.mistakes || []).forEach(m => {

    const rawType =
        (
            m.question_type ||
            getQuestionType(m.id) ||
            "mcq"
        ).toLowerCase();

    let type = "MCQ";

    if (
        rawType.includes("assertion") ||
        rawType === "ar"
    ) {

        type = "AR";

    } else if (
        rawType.includes("case") ||
        rawType.includes("cb")
    ) {

        type = "CB";
    }

    state.proficiency[type].mistakes++;
});
    });

    console.log("TOPIC HISTORY", topicHistory);

    // PROCESS FRICTION + VICTORY
    Object.entries(topicHistory).forEach(([topic, difficulties]) => {

        const {
            subject,
            chapterName
        } = getSubjectContext(topic);

        Object.entries(difficulties).forEach(([diff, attempts]) => {

            // latest first
            attempts.sort((a, b) => b.timestamp - a.timestamp);

            const latestAttempt = attempts[0];

            // CURRENTLY WRONG
            const currentMistakeMap = new Map();

            latestAttempt.mistakes.forEach(m => {

                const idStr = String(m.id);

                currentMistakeMap.set(idStr, {
                    id: idStr,
                    text:
                        m.question ||
                        m.question_text ||
                        "Question text missing",
                    type: getQuestionType(m.id),
                    dates: [latestAttempt.timestamp],
                    topic,
                    difficulty: diff
                });
            });

            // ALL HISTORICAL WRONG
            const historicalMistakes = new Map();

            attempts.forEach(att => {

                att.mistakes.forEach(m => {

                    const idStr = String(m.id);

                    if (!historicalMistakes.has(idStr)) {

                        historicalMistakes.set(idStr, {
                            id: idStr,
                            text:
                                m.question ||
                                m.question_text ||
                                "Question text missing",
                            type: getQuestionType(m.id),
                            dates: [],
                            topic,
                            difficulty: diff
                        });
                    }

                    historicalMistakes
                        .get(idStr)
                        .dates
                        .push(att.timestamp);
                });
            });

            // ACTIVE FRICTION
            currentMistakeMap.forEach(qData => {

                console.log("ADDING FRICTION", qData);

                addToState(
                    "friction",
                    subject,
                    chapterName,
                    qData
                );
            });

            // VICTORY
            historicalMistakes.forEach((qData, idStr) => {

                if (currentMistakeMap.has(idStr)) {
                    return;
                }

                console.log("ADDING VICTORY", qData);

                const masteryDate =
                    latestAttempt.timestamp.toLocaleDateString(
                        "en-US",
                        {
                            month: "short",
                            day: "numeric"
                        }
                    );

                addToState(
                    "victory",
                    subject,
                    chapterName,
                    {
                        ...qData,
                        masteryDate
                    }
                );

                state.victoryCount++;
            });
        });
    });

    // FINAL SUBJECT AVERAGES
    Object.keys(subjectScores).forEach(subj => {

        const s = subjectScores[subj];

        const avg = arr =>
            arr.length
                ? Math.round(
                    arr.reduce((a, b) => a + b, 0) / arr.length
                )
                : 0;

        state.subjectStats[subj] = {
            simple: avg(s.simple),
            medium: avg(s.medium),
            advanced: avg(s.advanced)
        };
    });

    console.log("FINAL FRICTION", state.friction);
    console.log("FINAL VICTORY", state.victory);
}
function addToState(type, subject, chapter, item) {

    if (!state[type][subject]) {
        state[type][subject] = {};
    }

    if (!state[type][subject][chapter]) {
        state[type][subject][chapter] = {};
    }

    const diff = (item.difficulty || "simple").toLowerCase();

    if (!state[type][subject][chapter][diff]) {
        state[type][subject][chapter][diff] = [];
    }

    // prevent duplicate questions
    const exists = state[type][subject][chapter][diff]
        .some(q => String(q.id) === String(item.id));

    if (!exists) {
        state[type][subject][chapter][diff].push(item);
    }
}

function renderConsole(container) {

    const allSubjects = new Set([
        ...Object.keys(state.subjectStats),
        ...Object.keys(state.friction),
        ...Object.keys(state.victory),
        "Mathematics",
        "Science",
        "Social Science"
    ]);

    const sortedSubjects = Array.from(allSubjects).sort();

    const activeFrictionCount = Object.values(state.friction)
        .reduce((a, subj) => {

            return a + Object.values(subj).reduce((b, ch) => {

                return b + Object.values(ch).reduce(
                    (c, arr) => c + (
                        Array.isArray(arr)
                            ? arr.length
                            : 0
                    ),
                    0
                );

            }, 0);

        }, 0);

    const tier1 = `
        <div class="glass-panel rounded-3xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between bg-gradient-to-r from-cbse-blue/5 to-transparent border-cbse-blue/10">

            <div class="flex items-center space-x-6 mb-4 md:mb-0">

                <div class="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-3xl shadow-sm">
                    🛡️
                </div>

                <div>
                    <h3 class="text-2xl font-black text-cbse-blue tracking-tight">
                        Diagnostic Status
                    </h3>

                    <p class="text-sm text-slate-500 font-medium">
                        Identify patterns. Eliminate friction.
                    </p>
                </div>

            </div>

            <div class="flex items-center space-x-8">

                <div class="text-right">

                    <span class="block text-3xl font-black text-green-600">
                        ${state.victoryCount}
                    </span>

                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Victory Gains
                    </span>

                </div>

                <div class="h-10 w-px bg-slate-200"></div>

                <div class="text-right">

                    <span class="block text-3xl font-black text-red-500">
                        ${activeFrictionCount}
                    </span>

                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Active Zones
                    </span>

                </div>

            </div>

        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">

            <div class="glass-panel rounded-3xl p-6 flex flex-col justify-between">

                <h4 class="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
                    Proficiency Profile
                </h4>

                <div class="space-y-4">

                    ${renderProficiencyPill("MCQ", "Recall", state.proficiency.MCQ)}
                    ${renderProficiencyPill("AR", "Logic", state.proficiency.AR)}
                    ${renderProficiencyPill("CB", "Application", state.proficiency.CB)}

                </div>

            </div>

            ${sortedSubjects.map(s => renderMasteryCard(s)).join('')}

        </div>
    `;

    const tier2 = `
        <div class="grid lg:grid-cols-3 gap-8 items-start relative min-h-[500px]">

            <div class="lg:col-span-2 space-y-6">

                <h4 class="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">
                    Subject Navigator
                </h4>

                ${sortedSubjects.map(s => renderSubjectNavigator(s)).join('')}

            </div>

            <div class="lg:col-span-1 hidden lg:block sticky top-24">

                <div
                    id="inspector-panel"
                    class="glass-panel rounded-3xl p-6 min-h-[400px] flex flex-col items-center justify-center text-center transition-all duration-300 border border-slate-200 shadow-sm relative overflow-hidden bg-white/50"
                >

                    <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">

                        <div class="w-64 h-64 rounded-full border border-slate-300 relative overflow-hidden">
                            <div class="radar-sweep"></div>
                        </div>

                    </div>

                    <div class="relative z-10">

                        <div class="text-4xl mb-4 text-slate-300 animate-pulse">
                            📡
                        </div>

                        <h4 class="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">
                            Inspector Active
                        </h4>

                        <p class="text-xs text-slate-500 max-w-[200px]">
                            Hover over any chapter on the left to analyze friction points.
                        </p>

                    </div>

                </div>

            </div>

        </div>

        <div
            id="mobile-inspector"
            class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm hidden flex items-end justify-center lg:hidden p-4 pb-8"
            onclick="closeMobileInspector()"
        >

            <div
                class="bg-white w-full max-w-md rounded-3xl max-h-[85vh] overflow-y-auto p-6 relative slide-up shadow-2xl"
                onclick="event.stopPropagation()"
            >

                <div class="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-6"></div>

                <div id="mobile-inspector-content"></div>

            </div>

        </div>
    `;

    container.innerHTML = tier1 + tier2;
}

function renderProficiencyPill(type, label, stats) {
    const { total, mistakes } = stats;
    if (total === 0) return `<div class="flex items-center justify-between p-3 rounded-xl bg-slate-100 text-slate-500"><div class="flex items-center space-x-3"><span class="w-2 h-2 rounded-full bg-slate-300"></span><div><span class="block text-xs font-black uppercase tracking-wide">${label}</span><span class="text-[10px] opacity-80 font-bold">No Data</span></div></div><span class="text-lg font-black opacity-30">${type}</span></div>`;
    const errorRate = (mistakes / total) * 100;
    let color = "bg-green-100 text-green-700", dot = "bg-green-500", status = "Strong";
    if (errorRate > 30) { color = "bg-red-100 text-red-700"; dot = "bg-red-500"; status = "Needs Focus"; }
    else if (errorRate > 15) { color = "bg-yellow-100 text-yellow-700"; dot = "bg-yellow-500"; status = "Review"; }
    return `
<div class="flex items-center justify-between p-3 rounded-xl ${color} transition hover:scale-[1.02]">

    <div class="flex items-center space-x-3">

        <span class="w-2 h-2 rounded-full ${dot} animate-pulse"></span>

        <div>

            <span class="block text-xs font-black uppercase tracking-wide">
                ${label}
            </span>

            <span class="text-[10px] opacity-80 font-bold">
                ${status}
            </span>

        </div>

    </div>

    <div class="text-right">

        <div class="text-lg font-black opacity-70">
            ${Math.round(errorRate)}%
        </div>

        <div class="text-[9px] font-bold opacity-50">
            Error Rate
        </div>

    </div>

</div>`;
    }

function renderMasteryCard(subject) {

    const theme =
        THEMES[subject] || THEMES["General"];

    const stats =
        state.subjectStats[subject] || {
            simple: 0,
            medium: 0,
            advanced: 0
        };

    const max =
        Math.max(
            stats.simple,
            stats.medium,
            stats.advanced,
            1
        );

    const h1 =
        (stats.simple / max) * 100;

    const h2 =
        (stats.medium / max) * 100;

    const h3 =
        (stats.advanced / max) * 100;

    return `
    <div class="${theme.bg} rounded-3xl p-5 border ${theme.border} relative overflow-hidden group">

        <div class="flex justify-between items-start mb-4 relative z-10">

            <h3 class="font-black ${theme.text} text-lg tracking-tight">
                ${subject}
            </h3>

            <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-sm shadow-sm ${theme.text}">
                <i class="fas ${theme.icon}"></i>
            </div>

        </div>

       <div class="flex items-end space-x-2 h-24 mt-2 relative z-10 border-b border-slate-200">

            <div class="flex-1 flex flex-col items-center">
               <div class="w-full ${theme.bar} rounded-t-md progress-step"
                     style="height:${Math.max(h1, 0)}px;">
                </div>
                <span class="text-[9px] font-bold text-slate-400 mt-1 uppercase">
                    Basics
                </span>
            </div>

            <div class="flex-1 flex flex-col items-center">
                <div class="w-full ${theme.bar} rounded-t-md progress-step opacity-80"
                       style="height:${Math.max(h2, 0)}px;">
                </div>
                <span class="text-[9px] font-bold text-slate-400 mt-1 uppercase">
                    Std
                </span>
            </div>

            <div class="flex-1 flex flex-col items-center">
                <div class="w-full ${theme.bar} rounded-t-md progress-step opacity-60"
                     style="height:${Math.max(h3, 0)}px;">
                </div>
                <span class="text-[9px] font-bold text-slate-400 mt-1 uppercase">
                    Elite
                </span>
            </div>

        </div>

    </div>`;
}

function renderSubjectNavigator(subject) {

    const theme = THEMES[subject] || THEMES["General"];

    const frictionData = state.friction[subject] || {};
    const victoryData = state.victory[subject] || {};

    const fCount = Object.values(frictionData).reduce((a, ch) => {

        return a + Object.values(ch).reduce((b, arr) => {

            return b + (
                Array.isArray(arr)
                    ? arr.length
                    : 0
            );

        }, 0);

    }, 0);

    const vCount = Object.values(victoryData).reduce((a, ch) => {

        return a + Object.values(ch).reduce((b, arr) => {

            return b + (
                Array.isArray(arr)
                    ? arr.length
                    : 0
            );

        }, 0);

    }, 0);

    return `
        <div class="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm transition group">

            <div class="px-6 py-5 flex items-center justify-between border-b border-slate-50 ${theme.bg}">

                <div class="flex items-center space-x-4">

                    <div class="w-10 h-10 rounded-xl bg-white text-lg flex items-center justify-center shadow-sm ${theme.text}">
                        <i class="fas ${theme.icon}"></i>
                    </div>

                    <h3 class="text-lg font-black text-slate-700 tracking-tight">
                        ${subject}
                    </h3>

                </div>

                <div class="flex space-x-4">

                    <button
                        onclick="toggleList('${subject}', 'friction')"
                        class="text-xs font-bold text-red-500 hover:text-red-700 transition flex items-center"
                    >
                        <span class="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                        Friction (${fCount})
                    </button>

                    <button
                        onclick="toggleList('${subject}', 'victory')"
                        class="text-xs font-bold text-green-600 hover:text-green-700 transition flex items-center"
                    >
                        <span class="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                        Victory (${vCount})
                    </button>

                </div>

            </div>

            <div id="list-${subject}" class="hidden bg-white"></div>

        </div>
    `;
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
        const escapedCh = ch.replace(/"/g, '&quot;').replace(/'/g, "\\'");
        let count = 0;
        Object.values(chapters[ch]).forEach(arr => count += arr.length);
        html += `<div class="px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition group/item chapter-item" data-subject="${subject}" data-chapter="${escapedCh}" data-type="${type}"><span class="text-sm font-bold text-slate-700 group-hover/item:text-cbse-blue">${ch}</span><span class="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-1 rounded">${count}</span></div>`;
    });
    container.innerHTML = html + `</div>`;
    container.querySelectorAll('.chapter-item').forEach(el => {
        const s = el.getAttribute('data-subject'), t = el.getAttribute('data-type');
        const decoded = el.getAttribute('data-chapter').replace(/&quot;/g, '"').replace(/\\'/g, "'");
        el.addEventListener('mouseenter', () => window.inspectChapter(s, decoded, t));
        el.addEventListener('click', () => window.inspectChapter(s, decoded, t, true));
    });
};

window.inspectChapter = (subject, chapter, type, isClick = false) => {
    const difficultiesObj = state[type][subject][chapter];
    const isFriction = type === 'friction';
    let html = `<div class="animate-fade-in text-left"><div class="mb-6 pb-4 border-b border-slate-100"><span class="text-[10px] font-black uppercase tracking-widest ${isFriction ? 'text-red-500' : 'text-green-500'} mb-1 block">${isFriction ? 'Persistent Friction' : 'Victory Gallery'}</span><h3 class="text-xl font-black text-slate-800 leading-tight">${chapter}</h3></div>`;
    Object.keys(difficultiesObj).sort().forEach(diff => {
        const items = difficultiesObj[diff];
        if (!items?.length) return;
        const colors = { simple: 'text-blue-500', medium: 'text-amber-500', advanced: 'text-purple-500' };
        const bgs = { simple: 'bg-blue-50', medium: 'bg-amber-50', advanced: 'bg-purple-50' };
        html += `<div class="mt-6 mb-3 flex items-center"><span class="text-xs font-black uppercase tracking-widest ${colors[diff] || 'text-slate-500'} px-2 py-1 ${bgs[diff] || 'bg-slate-100'} rounded">${diff} Level</span></div>`;
        items.forEach(m => {
            const dateStr = (m.dates || []).map(d => (d instanceof Date ? d : d.toDate?.() || new Date(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(', ');
            const count = (m.dates || []).length;
            html += `<div class="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-3 relative"><div class="absolute left-0 top-4 bottom-4 w-1 ${isFriction ? 'bg-red-400' : 'bg-green-400'} rounded-r-full"></div>
                    ${isFriction && count > 1 ? `<div class="mb-2"><span class="text-[9px] font-black bg-red-100 text-red-600 px-2 py-0.5 rounded border border-red-200 uppercase tracking-wider shadow-sm">⚠️ Failed ${count} Times</span></div>` : ''}
                    <p class="text-xs font-medium text-slate-700 pl-3 mb-3 leading-relaxed">${cleanKatexMarkers(m.text)}</p>
                    <div class="pl-3 pt-2 border-t border-slate-200/50 flex justify-between items-center">${isFriction ? `<span class="text-[9px] font-bold text-red-500 uppercase">Trend: ${dateStr}</span><a href="study-content.html?grade=${currentGrade}&topic=${m.topic}" class="text-[9px] font-black text-red-600 bg-white border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 uppercase shadow-sm">Master Concept</a>` : `<span class="text-[9px] font-bold text-green-600 uppercase">🏆 Mastered: ${m.masteryDate}</span>`}</div></div>`;
        });
    });
    const inspector = document.getElementById('inspector-panel');
    if (inspector) { inspector.innerHTML = html + `</div>`; inspector.classList.replace('items-center', 'items-start'); inspector.classList.replace('justify-center', 'justify-start'); inspector.classList.remove('text-center'); }
    if (window.innerWidth < 1024 && isClick) { document.getElementById('mobile-inspector-content').innerHTML = html + `</div>`; document.getElementById('mobile-inspector').classList.remove('hidden'); }
};

window.closeMobileInspector = () => document.getElementById('mobile-inspector').classList.add('hidden');

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
window.renderMasteryCard = renderMasteryCard;
window.renderProficiencyPill = renderProficiencyPill;
