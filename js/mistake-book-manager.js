
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
    // Remove Markdown bold markers
    let cleaned = text.replace(/\*\*/g, "");
    // Remove Katex markers if present (reusing simple logic)
    cleaned = cleaned.replace(/\$\$/g, "").replace(/\$/g, "");
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
    // Clean up slug: remove _quiz, digits, subject names
    let clean = slug.toLowerCase().replace(/_quiz/g, "").replace(/\d+/g, "");
    clean = clean.replace(/mathematics|science|social_science|social/g, "");

    // Split by non-alphanumeric (underscore, space)
    const parts = clean.split(/[^a-zA-Z]/).filter(p => p.length > 2); // Filter short words like "of", "and" if desired, but maybe keep them? Prompt implies deduplication.

    // Deduplicate words (e.g., "polynomials polynomials" -> "polynomials")
    const unique = [...new Set(parts)];

    // Capitalize
    return unique.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// NCERT ID Generation: ${grade}_${subject}_${chapter}
// e.g., 9_social_science_nazism_and_the_rise_of_hitler
function generateNCERTId(grade, subject, topicSlug) {
    const s = subject.toLowerCase().replace(/\s+/g, '_');
    // topicSlug usually comes as "math_polynomials_quiz" or similar
    // We need to extract the core topic part.
    // If the topicSlug is already "nazism_and_the_rise_of_hitler", great.
    // If it's "9_social_science_nazism...", we need to parse it.
    // Let's assume topicSlug is relatively clean or needs processing.
    // The prompt says: "match the IDs seen in the logs (e.g., 9_social_science_nazism...)"
    // If topicSlug is "nazism_and_the_rise_of_hitler", and we prepend grade_subject...

    // Clean topicSlug: remove grade, subject if present
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
        const chapterKey = formatChapterName(topicSlug); // Display Name

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
                // Sorting sessions desc (already done by query, but ensure)
                data.sessions.sort((a, b) => b.timestamp - a.timestamp);

                const totalAttempts = data.sessions.length;
                const lastAttempt = data.sessions[0].timestamp ? data.sessions[0].timestamp.toDate().toLocaleDateString() : "N/A";

                // Trend: Look at last 3 sessions
                let trend = "stable";
                if (totalAttempts >= 2) {
                    const latest = data.sessions[0].mistakes.length;
                    const prev = data.sessions[1].mistakes.length;
                    if (latest < prev) trend = "improving";
                    else if (latest > prev) trend = "declining";
                }

                // Unique Mistakes Processing
                const uniqueMistakes = new Map();
                data.sessions.forEach(session => {
                    session.mistakes.forEach(m => {
                        // Use question ID or text as key
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

                // Fetch NCERT Data
                const grade = data.sessions[0].class_id || "9";
                const ncertId = generateNCERTId(grade, subject, data.slug);
                const ncertData = await fetchNCERTSummary(ncertId);

                // Prepare Hints
                const mistakesList = Array.from(uniqueMistakes.values());

                html += `
                    <div class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden group hover:shadow-md transition">
                        <!-- Chapter Header -->
                        <div class="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center cursor-pointer" onclick="this.nextElementSibling.classList.toggle('hidden');">
                            <div>
                                <h3 class="text-lg font-bold text-slate-900">${chapterKey}</h3>
                                <p class="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">
                                    ${mistakesList.length} Unique Mistakes
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
                                    <span class="font-black text-slate-400 uppercase">Attempts:</span>
                                    <span class="font-bold text-slate-700">${totalAttempts}</span>
                                </div>
                                <div class="w-px h-4 bg-slate-200"></div>
                                <div class="flex items-center gap-2">
                                    <span class="font-black text-slate-400 uppercase">Last Active:</span>
                                    <span class="font-bold text-slate-700">${lastAttempt}</span>
                                </div>
                                <div class="w-px h-4 bg-slate-200"></div>
                                <div class="flex items-center gap-2">
                                    <span class="font-black text-slate-400 uppercase">Trend:</span>
                                    ${trend === 'improving' ? '<span class="text-success-green font-bold flex items-center gap-1"><i class="fas fa-arrow-down"></i> Improving</span>' :
                                      trend === 'declining' ? '<span class="text-danger-red font-bold flex items-center gap-1"><i class="fas fa-arrow-up"></i> Issues Rising</span>' :
                                      '<span class="text-slate-500 font-bold">Stable</span>'}
                                </div>
                            </div>

                            <!-- Mistakes List -->
                            <div class="space-y-6">
                `;

                mistakesList.forEach((m, idx) => {
                    const isRepeated = m.count > 1;

                    // Hint Logic
                    let hintHtml = "";
                    if (ncertData) {
                        const qText = (m.question || "").toLowerCase();

                        // 1. Search Formula Vault
                        let match = null;
                        if (ncertData.formulaVault) {
                            const vault = Array.isArray(ncertData.formulaVault) ? ncertData.formulaVault : Object.values(ncertData.formulaVault);
                            match = vault.find(f => {
                                const label = (f.label || f.name || "").toLowerCase();
                                return label && qText.includes(label);
                            });
                        }

                        // 2. Search Definitions (if no formula match)
                        if (!match && ncertData.oneLineDefinitions) {
                            const defs = Array.isArray(ncertData.oneLineDefinitions) ? ncertData.oneLineDefinitions : Object.values(ncertData.oneLineDefinitions);
                            // definition might be string or object
                            const defMatch = defs.find(d => {
                                const text = (typeof d === 'string' ? d : (d.term || d.text || "")).toLowerCase();
                                // Simple keyword match? Or just show a random one?
                                // Prompt says: "linked to a specific concept".
                                // Let's try matching known concepts if possible.
                                // If d is object {term: "...", def: "..."}
                                return text && qText.includes(text.split(':')[0]);
                            });
                            if (defMatch) {
                                match = {
                                    label: "Key Definition",
                                    content: typeof defMatch === 'string' ? defMatch : (defMatch.definition || defMatch.text)
                                };
                            }
                        }

                        if (match) {
                            const label = match.label || match.name || "Concept Hint";
                            const content = match.tex || match.content || match.value || "";
                            hintHtml = `
                                <div class="mt-4 p-4 bg-indigo-50 rounded-xl border-l-4 border-indigo-500 relative">
                                    <div class="text-[10px] font-black text-indigo-600 uppercase tracking-wide mb-2 flex items-center gap-2">
                                        <i class="fas fa-book-open"></i> Study This First: ${label}
                                    </div>
                                    <div class="text-indigo-900 font-medium text-sm">
                                        $$${content}$$
                                    </div>
                                </div>
                            `;
                        }
                    }

                    html += `
                        <div class="relative pl-6 border-l-2 ${isRepeated ? 'border-danger-red' : 'border-slate-200'}">
                            <span class="absolute -left-[9px] top-0 w-4 h-4 rounded-full ${isRepeated ? 'bg-danger-red ring-4 ring-red-100' : 'bg-slate-200'} border-2 border-white"></span>

                            <div class="mb-2">
                                <span class="text-[10px] font-black ${isRepeated ? 'text-danger-red' : 'text-slate-400'} uppercase tracking-wider">
                                    ${isRepeated ? 'Repeated Error (' + m.count + 'x)' : 'Question ' + (idx + 1)}
                                </span>
                                <p class="text-slate-900 font-bold mt-2 text-lg leading-relaxed">${cleanText(m.question)}</p>
                            </div>

                            <!-- Answer Hidden for Unbiased Re-attempt -->
                            <div class="flex gap-2 mt-4">
                                <button class="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-cbse-blue hover:text-white transition" onclick="this.nextElementSibling.classList.toggle('hidden'); this.remove();">
                                    Reveal Answer
                                </button>
                                <div class="hidden p-3 bg-green-50 text-green-800 rounded-lg text-sm font-medium border border-green-100">
                                    Correct: ${cleanText(m.correct)}
                                </div>
                            </div>

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
