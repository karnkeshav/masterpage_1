
import { getInitializedClients } from "./api.js";
import { initializeAuthListener, ensureUserInFirestore } from "./auth-paywall.js";
import { bindConsoleLogout } from "./guard.js";
import * as UI from "./ui-renderer.js";
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

function inferSubject(topicSlug) {
    const s = (topicSlug || "").toLowerCase();
    if (s.includes("science") || s.includes("physics") || s.includes("chem") || s.includes("bio") || s.includes("motion") || s.includes("force") || s.includes("atom") || s.includes("matter")) return "Science";
    if (s.includes("math") || s.includes("algebra") || s.includes("geo") || s.includes("poly") || s.includes("number") || s.includes("linear") || s.includes("surface") || s.includes("volume") || s.includes("stat")) return "Mathematics";
    if (s.includes("social") || s.includes("history") || s.includes("civics") || s.includes("demo") || s.includes("french") || s.includes("nazism") || s.includes("india")) return "Social Science";
    return "General";
}

function formatChapterName(slug) {
    if (!slug) return "General Quiz";
    let clean = slug.toLowerCase().replace(/_quiz/g, "").replace(/\d+/g, "");
    clean = clean.replace(/mathematics|science|social_science|social/g, "");
    const parts = clean.split(/[^a-zA-Z]/).filter(p => p.length > 2);
    const unique = [...new Set(parts)];
    return unique.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function generateNCERTId(grade, subject, topicSlug) {
    const s = subject.toLowerCase().replace(/\s+/g, '_');
    let t = topicSlug.toLowerCase();
    t = t.replace(new RegExp(`^${grade}_`), "");
    t = t.replace(new RegExp(`^${s}_`), "");
    t = t.replace(/_quiz$/, "");
    return `${grade}_${s}_${t}`;
}

// --- CORE LOGIC ---

async function fetchMistakes(user) {
    const { db } = await getInitializedClients();
    const q = query(
        collection(db, "mistake_notebook"),
        where("user_id", "==", user.uid),
        orderBy("timestamp", "desc")
    );

    const snapshot = await getDocs(q);
    const sessions = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        sessions.push({
            id: doc.id,
            timestamp: data.timestamp,
            mistakes: data.mistakes || [],
            topic: data.topic || data.chapter_slug || "unknown",
            class_id: data.class_id || "9"
        });
    });

    return sessions;
}

function groupSessionsByChapter(sessions) {
    const groups = {};

    sessions.forEach(session => {
        const topicSlug = session.topic;
        const subject = inferSubject(topicSlug);
        const chapterKey = formatChapterName(topicSlug);

        if (!groups[subject]) groups[subject] = {};
        if (!groups[subject][chapterKey]) {
            groups[subject][chapterKey] = {
                slug: topicSlug,
                display: chapterKey,
                sessions: []
            };
        }
        groups[subject][chapterKey].sessions.push(session);
    });

    return groups;
}

async function fetchNCERTSummary(docId) {
    const { db } = await getInitializedClients();
    try {
        const snap = await getDoc(doc(db, "ncert_summaries", docId));
        return snap.exists() ? snap.data() : null;
    } catch (e) {
        console.warn("NCERT Fetch Failed:", e);
        return null;
    }
}

async function renderMistakeBook(user) {
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
        const sessions = await fetchMistakes(user);
        if (sessions.length === 0) {
            container.innerHTML = `
                <div class="glass-panel p-12 rounded-3xl text-center border border-white/40">
                    <div class="text-6xl mb-6">🎉</div>
                    <h3 class="text-2xl font-black text-slate-700 mb-2">Clean Sheet!</h3>
                    <p class="text-slate-500 font-medium max-w-md mx-auto">No mistakes recorded. Great job!</p>
                </div>`;
            return;
        }

        const grouped = groupSessionsByChapter(sessions);
        let html = "";

        for (const [subject, chapters] of Object.entries(grouped)) {
            html += `
                <div class="mb-12">
                    <h2 class="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                        <span class="w-2 h-8 bg-cbse-blue rounded-full"></span>
                        ${subject}
                    </h2>
                    <div class="grid gap-6">
            `;

            for (const [chapterKey, data] of Object.entries(chapters)) {
                // Sorting sessions desc
                data.sessions.sort((a, b) => b.timestamp - a.timestamp);

                const totalAttempts = data.sessions.length;
                const lastAttempt = data.sessions[0].timestamp ? data.sessions[0].timestamp.toDate().toLocaleDateString() : "N/A";

                // Trend Logic: Last 3 attempts (e.g., "12 → 10 → 8")
                // data.sessions is sorted DESC (latest first). So we want sessions[2] -> sessions[1] -> sessions[0]
                const recentSessions = data.sessions.slice(0, 3).reverse(); // chronological order of last 3
                const trendString = recentSessions.map(s => s.mistakes.length).join(" → ");

                // Unique Mistakes & Persistence Check
                const uniqueMistakes = new Map();
                data.sessions.forEach(session => {
                    session.mistakes.forEach(m => {
                        const key = m.id || m.question;
                        if (!uniqueMistakes.has(key)) {
                            uniqueMistakes.set(key, {
                                ...m,
                                count: 0,
                                sessions: []
                            });
                        }
                        const entry = uniqueMistakes.get(key);
                        entry.count++;
                        entry.sessions.push(session.timestamp);
                    });
                });

                const grade = data.sessions[0].class_id || "9";
                const ncertId = generateNCERTId(grade, subject, data.slug);
                const ncertData = await fetchNCERTSummary(ncertId);

                const mistakesList = Array.from(uniqueMistakes.values());

                html += `
                    <div class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden group hover:shadow-md transition">
                        <!-- Chapter Header -->
                        <div class="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center cursor-pointer" onclick="this.nextElementSibling.classList.toggle('hidden');">
                            <div>
                                <h3 class="text-lg font-bold text-slate-900">${chapterKey}</h3>
                                <p class="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">
                                    ${mistakesList.length} Mistakes to Review
                                </p>
                            </div>
                            <div class="w-8 h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center transition group-hover:bg-cbse-blue group-hover:text-white">
                                <i class="fas fa-chevron-down"></i>
                            </div>
                        </div>

                        <!-- Content Body -->
                        <div class="hidden p-6 bg-white space-y-8">

                            <!-- Analytical Metadata Row -->
                            <div class="flex flex-wrap gap-4 mb-8 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                                <div class="flex items-center gap-2">
                                    <span class="font-black text-slate-400 uppercase">Trend:</span>
                                    <span class="font-mono font-bold text-slate-700 bg-white px-2 py-1 rounded border border-slate-200">${trendString || "No Data"}</span>
                                </div>
                                <div class="w-px h-4 bg-slate-200"></div>
                                <div class="flex items-center gap-2">
                                    <span class="font-black text-slate-400 uppercase">Last Active:</span>
                                    <span class="font-bold text-slate-700">${lastAttempt}</span>
                                </div>
                            </div>

                            <!-- Mistakes List -->
                            <div class="space-y-6">
                `;

                mistakesList.forEach((m, idx) => {
                    const isRepeated = m.count > 1;

                    // Hint Logic
                    let hintHtml = "";
                    let hintLabel = "";

                    if (ncertData) {
                        const qText = (m.question || "").toLowerCase();
                        let match = null;

                        // Prioritize Formula for Math/Physics
                        const isMathPhys = subject === "Mathematics" || (subject === "Science" && (qText.includes("motion") || qText.includes("force") || qText.includes("work") || qText.includes("gravitation")));

                        // 1. Formula Search
                        if (isMathPhys && ncertData.formulaVault) {
                            const vault = Array.isArray(ncertData.formulaVault) ? ncertData.formulaVault : Object.values(ncertData.formulaVault);
                            match = vault.find(f => {
                                const label = (f.label || f.name || "").toLowerCase();
                                return label && qText.includes(label);
                            });
                        }

                        // 2. Definition/Major Point Search (if no formula or not math/phys)
                        if (!match) {
                            const defs = ncertData.oneLineDefinitions ? (Array.isArray(ncertData.oneLineDefinitions) ? ncertData.oneLineDefinitions : Object.values(ncertData.oneLineDefinitions)) : [];
                            const points = ncertData.majorPoints ? (Array.isArray(ncertData.majorPoints) ? ncertData.majorPoints : Object.values(ncertData.majorPoints)) : [];
                            const pool = [...defs, ...points];

                            const defMatch = pool.find(d => {
                                const text = (typeof d === 'string' ? d : (d.term || d.definition || d.text || "")).toLowerCase();
                                return text && qText.includes(text.split(':')[0]);
                            });

                            if (defMatch) {
                                match = {
                                    label: "Key Concept",
                                    content: typeof defMatch === 'string' ? defMatch : (defMatch.definition || defMatch.text || defMatch.term)
                                };
                            }
                        }

                        if (match) {
                            hintLabel = match.label || match.name || "Concept Hint";
                            const rawContent = match.tex || match.content || match.value || "";
                            const content = cleanText(rawContent); // Markdown strip
                            hintHtml = `
                                <div class="mt-4 p-4 bg-indigo-50 rounded-xl border-l-4 border-indigo-500 relative">
                                    <div class="text-[10px] font-black text-indigo-600 uppercase tracking-wide mb-2 flex items-center gap-2">
                                        <i class="fas fa-lightbulb"></i> NCERT Hint: ${hintLabel}
                                    </div>
                                    <div class="text-indigo-900 font-medium text-sm leading-relaxed">
                                        $$${content}$$
                                    </div>
                                </div>
                            `;
                        }
                    }

                    // Fallback if no hint found
                    if (!hintHtml) {
                        hintHtml = `
                            <div class="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
                                <p class="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Revision Needed</p>
                                <a href="study-content.html?grade=${grade}&subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(data.slug)}" class="text-sm font-bold text-cbse-blue hover:underline">
                                    Review Chapter: ${chapterKey} <i class="fas fa-arrow-right ml-1"></i>
                                </a>
                            </div>
                        `;
                    }

                    html += `
                        <div class="relative pl-6 border-l-2 ${isRepeated ? 'border-danger-red' : 'border-slate-200'}">
                            <span class="absolute -left-[9px] top-0 w-4 h-4 rounded-full ${isRepeated ? 'bg-danger-red ring-4 ring-red-100' : 'bg-slate-200'} border-2 border-white"></span>

                            <div class="mb-4">
                                <span class="px-2 py-0.5 rounded text-[10px] font-black ${isRepeated ? 'bg-red-50 text-danger-red' : 'bg-slate-100 text-slate-500'} uppercase tracking-wider">
                                    ${isRepeated ? 'Persistent Mistake' : 'Question ' + (idx + 1)}
                                </span>
                                <p class="text-slate-900 font-bold mt-3 text-lg leading-relaxed">${cleanText(m.question)}</p>
                            </div>

                            <!-- Answer Removed - Only Hint Shown -->
                            ${hintHtml}
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

        container.innerHTML = html;

        if (window.MathJax && (window.MathJax.typeset || window.MathJax.typesetPromise)) {
            window.MathJax.typesetPromise ? window.MathJax.typesetPromise() : window.MathJax.typeset();
        }

    } catch (e) {
        console.error("Mistake Book Render Error:", e);
        container.innerHTML = `<div class="text-center text-red-500 font-bold p-8">Unable to load data.</div>`;
    }
}

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

        await renderMistakeBook(user);
    } else {
        window.location.href = "../index.html";
    }
});
