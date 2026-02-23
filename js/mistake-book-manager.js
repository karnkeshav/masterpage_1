
import { getInitializedClients } from "./api.js";
import { initializeAuthListener, ensureUserInFirestore } from "./auth-paywall.js";
import { bindConsoleLogout } from "./guard.js";
import * as UI from "./ui-renderer.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- UI SETUP ---
UI.injectStyles();
bindConsoleLogout("logout-nav-btn", "../index.html");

// --- MATHJAX INJECTION ---
function injectMathJax() {
    if (window.MathJax && (window.MathJax.typeset || window.MathJax.typesetPromise)) return;

    window.MathJax = {
        tex: {
            inlineMath: [['$', '$'], ['\\(', '\\)']],
            displayMath: [['$$', '$$'], ['\\[', '\\]']],
            processEscapes: true
        },
        svg: {
            fontCache: 'global'
        }
    };

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
    script.async = true;
    document.head.appendChild(script);
}

// --- HELPERS ---

function cleanText(text) {
    if (!text) return "";
    let cleaned = text.replace(/\*\*/g, ""); // Strip Markdown bold
    cleaned = cleaned.replace(/\$\$/g, "").replace(/\$/g, ""); // Strip Katex
    return cleaned.trim();
}

function inferHierarchy(topicSlug) {
    const s = (topicSlug || "").toLowerCase();

    // SCIENCE
    if (s.includes("motion") || s.includes("force") || s.includes("gravitation") || s.includes("work") || s.includes("energy") || s.includes("sound") || s.includes("light") || s.includes("human eye") || s.includes("electricity") || s.includes("magnetic") || s.includes("physics"))
        return { subject: "Science", sub: "Physics" };
    if (s.includes("matter") || s.includes("atom") || s.includes("molecule") || s.includes("structure") || s.includes("reaction") || s.includes("acid") || s.includes("base") || s.includes("metal") || s.includes("carbon") || s.includes("periodic") || s.includes("chem"))
        return { subject: "Science", sub: "Chemistry" };
    if (s.includes("cell") || s.includes("tissue") || s.includes("diversity") || s.includes("illness") || s.includes("resource") || s.includes("environment") || s.includes("life") || s.includes("control") || s.includes("reproduction") || s.includes("heredity") || s.includes("bio"))
        return { subject: "Science", sub: "Biology" };
    if (s.includes("science")) return { subject: "Science", sub: "General" };

    // MATH
    if (s.includes("number") || s.includes("real") || s.includes("arithmetic"))
        return { subject: "Mathematics", sub: "Number Systems" };
    if (s.includes("poly") || s.includes("linear") || s.includes("quad") || s.includes("algebra"))
        return { subject: "Mathematics", sub: "Algebra" };
    if (s.includes("geo") || s.includes("euclid") || s.includes("line") || s.includes("angle") || s.includes("triangle") || s.includes("quadrilateral") || s.includes("circle") || s.includes("construction") || s.includes("coord"))
        return { subject: "Mathematics", sub: "Geometry" };
    if (s.includes("area") || s.includes("volume") || s.includes("surface") || s.includes("heron") || s.includes("mensuration"))
        return { subject: "Mathematics", sub: "Mensuration" };
    if (s.includes("stat") || s.includes("prob"))
        return { subject: "Mathematics", sub: "Statistics & Probability" };
    if (s.includes("math")) return { subject: "Mathematics", sub: "General" };

    // SOCIAL SCIENCE
    if (s.includes("french") || s.includes("socialism") || s.includes("nazism") || s.includes("forest") || s.includes("pastoral") || s.includes("peasant") || s.includes("nationalism") || s.includes("indo-china") || s.includes("work life") || s.includes("print") || s.includes("history"))
        return { subject: "Social Science", sub: "History" };
    if (s.includes("democracy") || s.includes("constitution") || s.includes("electoral") || s.includes("institution") || s.includes("rights") || s.includes("power") || s.includes("federalism") || s.includes("gender") || s.includes("party") || s.includes("outcome") || s.includes("civics") || s.includes("political"))
        return { subject: "Social Science", sub: "Civics" };
    if (s.includes("india") || s.includes("physical") || s.includes("drainage") || s.includes("climate") || s.includes("vegetation") || s.includes("population") || s.includes("resource") || s.includes("agriculture") || s.includes("mineral") || s.includes("manufacturing") || s.includes("lifeline") || s.includes("geography"))
        return { subject: "Social Science", sub: "Geography" };
    if (s.includes("palampur") || s.includes("people") || s.includes("poverty") || s.includes("food") || s.includes("development") || s.includes("sector") || s.includes("money") || s.includes("global") || s.includes("consumer") || s.includes("economics"))
        return { subject: "Social Science", sub: "Economics" };
    if (s.includes("social")) return { subject: "Social Science", sub: "General" };

    return { subject: "General", sub: "General Knowledge" };
}

function formatChapterName(slug) {
    if (!slug) return "General Quiz";
    let clean = slug.toLowerCase().replace(/_quiz/g, "").replace(/\d+/g, "");
    clean = clean.replace(/mathematics|science|social_science|social/g, "");
    const parts = clean.split(/[^a-zA-Z]/).filter(p => p.length > 2);
    const unique = [...new Set(parts)];
    return unique.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function getMasteryColor(diff, percent) {
    if (percent < 85) return "red";
    if (diff === "Advanced") return "green";
    if (diff === "Medium") return "yellow";
    return "orange"; // Simple
}

function getRingClass(color) {
    const map = {
        green: "border-green-500 text-green-600 bg-green-50",
        yellow: "border-yellow-500 text-yellow-600 bg-yellow-50",
        orange: "border-orange-500 text-orange-600 bg-orange-50",
        red: "border-red-500 text-red-600 bg-red-50"
    };
    return map[color] || map.red;
}

// --- DATA FETCHING ---

async function fetchMistakes(user) {
    const { db } = await getInitializedClients();
    const q = query(
        collection(db, "mistake_notebook"),
        where("user_id", "==", user.uid),
        orderBy("timestamp", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

async function fetchQuizScores(user) {
    const { db } = await getInitializedClients();
    const q = query(
        collection(db, "quiz_scores"),
        where("user_id", "==", user.uid),
        orderBy("timestamp", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

// --- PROCESSING ---

function processData(mistakes, scores) {
    const hierarchy = {};

    // 1. Link Mistakes to Scores (Difficulty)
    // Heuristic: Match Topic and Timestamp (within 10s)
    mistakes.forEach(m => {
        const mTime = m.timestamp ? m.timestamp.toDate().getTime() : 0;
        // Find closest score
        const match = scores.find(s => {
            const sTime = s.timestamp ? s.timestamp.toDate().getTime() : 0;
            return s.topic === m.topic && Math.abs(sTime - mTime) < 10000;
        });
        m.difficulty = match ? match.difficulty : "Unknown";
    });

    // 2. Build Hierarchy
    mistakes.forEach(m => {
        const h = inferHierarchy(m.topic || m.chapter_slug);
        const chapterName = formatChapterName(m.topic || m.chapter_slug);

        if (!hierarchy[h.subject]) hierarchy[h.subject] = {};
        if (!hierarchy[h.subject][h.sub]) hierarchy[h.subject][h.sub] = {};
        if (!hierarchy[h.subject][h.sub][chapterName]) {
            hierarchy[h.subject][h.sub][chapterName] = {
                slug: m.topic || m.chapter_slug,
                sessions: [],
                classIds: new Set(),
                mastery: "red"
            };
        }

        const entry = hierarchy[h.subject][h.sub][chapterName];
        entry.sessions.push(m);
        if (m.class_id) entry.classIds.add(m.class_id);
    });

    // 3. Compute Mastery & Trends
    Object.values(hierarchy).forEach(subs => {
        Object.values(subs).forEach(chapters => {
            Object.values(chapters).forEach(ch => {
                // Mastery: Check scores for this slug
                const chScores = scores.filter(s => (s.topic === ch.slug || s.topicSlug === ch.slug));
                let maxDiff = "None";
                let maxPercent = 0;

                // Priority: Advanced > Medium > Simple
                const advanced = chScores.filter(s => s.difficulty === "Advanced" && (s.percentage || s.score_percent) >= 85);
                const medium = chScores.filter(s => s.difficulty === "Medium" && (s.percentage || s.score_percent) >= 85);
                const simple = chScores.filter(s => s.difficulty === "Simple" && (s.percentage || s.score_percent) >= 85);

                if (advanced.length) maxDiff = "Advanced";
                else if (medium.length) maxDiff = "Medium";
                else if (simple.length) maxDiff = "Simple";

                if (maxDiff !== "None") ch.mastery = getMasteryColor(maxDiff, 90);
                else ch.mastery = "red"; // Default fail
            });
        });
    });

    return hierarchy;
}

// --- RENDERING ---

async function renderDiagnosticEngine(user) {
    const container = document.getElementById("mistake-container");
    if (!container) return;

    container.innerHTML = `
        <div class="space-y-4 animate-pulse">
            <div class="h-8 bg-slate-200 rounded w-1/3"></div>
            <div class="h-32 bg-slate-200 rounded w-full"></div>
            <div class="h-32 bg-slate-200 rounded w-full"></div>
        </div>
    `;

    try {
        const [mistakes, scores] = await Promise.all([
            fetchMistakes(user),
            fetchQuizScores(user)
        ]);

        if (mistakes.length === 0) {
            container.innerHTML = `
                <div class="glass-panel p-12 rounded-3xl text-center border border-white/40">
                    <div class="text-6xl mb-6">🎉</div>
                    <h3 class="text-2xl font-black text-slate-700 mb-2">Clean Sheet!</h3>
                    <p class="text-slate-500 font-medium max-w-md mx-auto">No mistakes recorded. Great job!</p>
                </div>`;
            return;
        }

        const data = processData(mistakes, scores);
        let html = "";

        // Level 1: Subject
        for (const [subject, subs] of Object.entries(data)) {
            html += `
                <div class="mb-12">
                    <h2 class="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                        <span class="w-2 h-8 bg-cbse-blue rounded-full"></span>
                        ${subject}
                    </h2>
                    <div class="space-y-8">
            `;

            // Level 2: Sub-Discipline
            for (const [subName, chapters] of Object.entries(subs)) {
                html += `
                    <div class="pl-4 border-l-2 border-slate-200">
                        <h3 class="text-lg font-bold text-slate-500 uppercase tracking-wider mb-4">${subName}</h3>
                        <div class="grid gap-6">
                `;

                // Level 3: Chapter
                for (const [chapterName, chData] of Object.entries(chapters)) {
                    // Trend
                    chData.sessions.sort((a, b) => (b.timestamp?.toDate().getTime() || 0) - (a.timestamp?.toDate().getTime() || 0));
                    const recent = chData.sessions.slice(0, 3).reverse();
                    const trend = recent.map(s => (s.mistakes || []).length).join(" → ");

                    // Legacy Check
                    // If multiple classIds exist, or if older class exists
                    // Assuming current class is 10 (or user profile class). Let's just flag if size > 1.
                    const isLegacy = chData.classIds.size > 1;
                    const legacyHtml = isLegacy ?
                        `<span class="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-black uppercase rounded border border-red-200 ml-2">Legacy Weakness</span>` : "";

                    const ringClass = getRingClass(chData.mastery);

                    html += `
                        <div class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden group hover:shadow-md transition">
                            <div class="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                                <div class="flex items-center gap-4">
                                    <div class="w-12 h-12 rounded-full border-4 flex items-center justify-center text-lg font-black ${ringClass}">
                                        ${chData.mastery === 'green' ? '★' : chData.mastery === 'yellow' ? '●' : chData.mastery === 'orange' ? '○' : '!'}
                                    </div>
                                    <div>
                                        <h4 class="text-lg font-bold text-slate-900 flex items-center">
                                            ${chapterName}
                                            ${legacyHtml}
                                        </h4>
                                        <div class="flex items-center gap-2 mt-1">
                                            <span class="text-xs text-slate-400 font-bold uppercase tracking-wider">Trend:</span>
                                            <span class="text-xs font-mono font-bold text-slate-600 bg-white px-1 rounded border border-slate-200">${trend}</span>
                                        </div>
                                    </div>
                                </div>
                                <button class="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-cbse-blue hover:text-white transition shadow-sm"
                                    onclick="document.getElementById('details-${chapterName.replace(/\s/g, '')}').classList.toggle('hidden')">
                                    Detailed Performance
                                </button>
                            </div>

                            <!-- Level 4: Drill Down -->
                            <div id="details-${chapterName.replace(/\s/g, '')}" class="hidden p-6 bg-white">
                                <!-- Selection Gate -->
                                <div class="flex gap-2 mb-6" id="gate-${chapterName.replace(/\s/g, '')}">
                                    <button onclick="filterMistakes(this, 'Simple')" class="flex-1 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 transition">Simple</button>
                                    <button onclick="filterMistakes(this, 'Medium')" class="flex-1 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-200 transition">Medium</button>
                                    <button onclick="filterMistakes(this, 'Advanced')" class="flex-1 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition">Advanced</button>
                                    <button onclick="filterMistakes(this, 'All')" class="flex-1 py-2 bg-cbse-blue text-white rounded-lg text-xs font-bold transition shadow-sm">Show All</button>
                                </div>

                                <div class="space-y-4 mistake-list">
                    `;

                    // Consolidated Mistakes List
                    const allMistakes = [];
                    chData.sessions.forEach(s => {
                        const sDiff = s.difficulty || "Unknown";
                        (s.mistakes || []).forEach(m => {
                            allMistakes.push({ ...m, sessionDiff: sDiff, sessionId: s.id });
                        });
                    });

                    // Unique & Count
                    const uniqueMap = new Map();
                    allMistakes.forEach(m => {
                        const k = m.id || m.question;
                        if (!uniqueMap.has(k)) uniqueMap.set(k, { ...m, count: 0, diffs: new Set() });
                        const e = uniqueMap.get(k);
                        e.count++;
                        e.diffs.add(m.sessionDiff);
                    });

                    Array.from(uniqueMap.values()).forEach(m => {
                        const isHighFreq = m.count > 1;
                        // Use difficulty classes for filtering
                        const diffClasses = Array.from(m.diffs).map(d => `diff-${d}`).join(" ");

                        html += `
                            <div class="mistake-item ${diffClasses} diff-All pl-4 border-l-2 ${isHighFreq ? 'border-danger-red' : 'border-slate-200'}">
                                <div class="flex items-center gap-2 mb-2">
                                    <span class="w-2 h-2 rounded-full ${isHighFreq ? 'bg-danger-red' : 'bg-slate-300'}"></span>
                                    <span class="text-[10px] font-black ${isHighFreq ? 'text-danger-red' : 'text-slate-400'} uppercase tracking-wider">
                                        ${isHighFreq ? 'High Frequency Error' : 'Missed Question'}
                                    </span>
                                </div>
                                <!-- Active Recall: Text Only -->
                                <p class="text-slate-800 font-medium text-sm leading-relaxed">${cleanText(m.question)}</p>
                            </div>
                        `;
                    });

                    html += `
                                </div>
                            </div>
                        </div>
                    `;
                }
                html += `</div></div>`;
            }
            html += `</div></div>`;
        }

        container.innerHTML = html;
        if (window.MathJax && (window.MathJax.typeset || window.MathJax.typesetPromise)) {
            window.MathJax.typesetPromise ? window.MathJax.typesetPromise() : window.MathJax.typeset();
        }

    } catch (e) {
        console.error("Diagnostic Engine Error:", e);
        container.innerHTML = `<div class="text-center text-red-500 font-bold p-8">Unable to load diagnostics.</div>`;
    }
}

// Global Filter Function
window.filterMistakes = function(btn, diff) {
    const parent = btn.closest('.p-6');
    // Reset buttons
    parent.querySelectorAll('button').forEach(b => {
        if (b === btn) {
            b.classList.remove('bg-slate-50', 'text-slate-500', 'border-slate-200');
            b.classList.add('bg-cbse-blue', 'text-white', 'border-cbse-blue');
        } else {
            b.classList.add('bg-slate-50', 'text-slate-500', 'border-slate-200');
            b.classList.remove('bg-cbse-blue', 'text-white', 'border-cbse-blue');
        }
    });

    // Filter Items
    const list = parent.querySelector('.mistake-list');
    list.querySelectorAll('.mistake-item').forEach(item => {
        if (diff === 'All' || item.classList.contains(`diff-${diff}`)) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
};

// --- INIT ---

injectMathJax();

initializeAuthListener(async (user) => {
    if (user) {
        const displayName = user.displayName || "Scholar";
        const profile = await ensureUserInFirestore(user);

        const welcomeEl = document.getElementById("user-welcome");
        if (welcomeEl) welcomeEl.textContent = displayName;

        const badgeEl = document.getElementById("context-badge");
        if (badgeEl) {
            if (profile && profile.classId) badgeEl.textContent = `Grade ${profile.classId}`;
            else badgeEl.style.display = "none";
        }

        await renderDiagnosticEngine(user);
    } else {
        window.location.href = "../index.html";
    }
});
