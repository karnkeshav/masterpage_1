
import { getInitializedClients, fetchChapterSummary } from "./api.js";
import { initializeAuthListener, ensureUserInFirestore } from "./auth-paywall.js";
import { cleanKatexMarkers } from "./utils.js";
import { bindConsoleLogout } from "./guard.js";
import * as UI from "./ui-renderer.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- UI SETUP ---
UI.injectStyles();
bindConsoleLogout("logout-nav-btn", "../index.html");

// --- MATHJAX INJECTION ---
function injectMathJax() {
    if (window.MathJax) return; // Already present

    // Config
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

    // Script
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
    script.async = true;
    document.head.appendChild(script);
}

// --- HELPERS ---

function inferSubject(topicSlug) {
    const s = (topicSlug || "").toLowerCase();
    if (s.includes("science") || s.includes("physics") || s.includes("chem") || s.includes("bio") || s.includes("motion") || s.includes("force") || s.includes("atom") || s.includes("matter")) return "Science";
    if (s.includes("math") || s.includes("algebra") || s.includes("geo") || s.includes("poly") || s.includes("number") || s.includes("linear") || s.includes("surface") || s.includes("volume") || s.includes("stat")) return "Mathematics";
    if (s.includes("social") || s.includes("history") || s.includes("civics") || s.includes("demo") || s.includes("french") || s.includes("nazism") || s.includes("india")) return "Social Science";
    return "General";
}

function capitalize(s) {
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatChapterName(slug) {
    if (!slug) return "General Quiz";
    // Remove _quiz suffix if present
    let name = slug.replace(/_quiz$/, "").replace(/_/g, " ");
    return capitalize(name);
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
    const mistakes = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.mistakes && Array.isArray(data.mistakes)) {
            // Flatten mistakes
            data.mistakes.forEach(m => {
                mistakes.push({
                    ...m,
                    originalDoc: data // Keep context if needed (e.g. timestamp)
                });
            });
        }
    });

    return mistakes;
}

function groupMistakes(mistakes) {
    const groups = {};

    mistakes.forEach(m => {
        const topicSlug = m.chapter_slug || m.topic || "unknown";
        const subject = inferSubject(topicSlug);
        const chapterName = formatChapterName(topicSlug);

        if (!groups[subject]) groups[subject] = {};
        if (!groups[subject][chapterName]) groups[subject][chapterName] = {
            slug: topicSlug,
            mistakes: []
        };

        groups[subject][chapterName].mistakes.push(m);
    });

    return groups;
}

async function renderMistakeBook(user) {
    const container = document.getElementById("mistake-container");
    if (!container) {
        console.error("Mistake container not found!");
        return;
    }

    container.innerHTML = `
        <div class="flex flex-col gap-4 animate-pulse">
            <div class="h-8 bg-slate-200 rounded w-1/3"></div>
            <div class="h-32 bg-slate-200 rounded w-full"></div>
            <div class="h-32 bg-slate-200 rounded w-full"></div>
        </div>
    `;

    try {
        const allMistakes = await fetchMistakes(user);

        if (allMistakes.length === 0) {
            container.innerHTML = `
                <div class="glass-panel p-12 rounded-3xl text-center border border-white/40">
                    <div class="text-6xl mb-6">🎉</div>
                    <h3 class="text-2xl font-black text-slate-700 mb-2">Clean Sheet!</h3>
                    <p class="text-slate-500 font-medium max-w-md mx-auto">You haven't recorded any mistakes yet. Keep practicing quizzes to build your personalized error log.</p>
                    <a href="consoles/student.html" class="inline-block mt-8 px-8 py-3 bg-cbse-blue text-white font-bold rounded-xl hover:shadow-lg hover:-translate-y-1 transition">Go to Dashboard</a>
                </div>
            `;
            return;
        }

        const grouped = groupMistakes(allMistakes);
        let html = "";

        // Iterate Subjects
        for (const [subject, chapters] of Object.entries(grouped)) {
            html += `
                <div class="mb-12">
                    <h2 class="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                        <span class="w-2 h-8 bg-cbse-blue rounded-full"></span>
                        ${subject}
                    </h2>
                    <div class="grid gap-6">
            `;

            // Iterate Chapters
            for (const [chapterName, data] of Object.entries(chapters)) {
                // Fetch NCERT Summary for this chapter
                // Note: inferSubject returns "Mathematics", "Science", "Social Science"
                // api.js fetchChapterSummary expects: grade, subject, topic
                // Mistake data usually has class_id, but it's inside 'originalDoc' or 'm'
                // We'll take the class_id from the first mistake in the group
                const firstMistake = data.mistakes[0];
                // Access class_id from originalDoc if available, else infer
                let grade = "9";
                if (firstMistake.originalDoc && firstMistake.originalDoc.class_id) {
                    grade = firstMistake.originalDoc.class_id;
                }

                const summary = await fetchChapterSummary(grade, subject, data.slug);
                let formulaVault = [];
                if (summary && summary.formulaVault) {
                    if (Array.isArray(summary.formulaVault)) formulaVault = summary.formulaVault;
                    else formulaVault = Object.values(summary.formulaVault);
                }

                html += `
                    <div class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden group hover:shadow-md transition">
                        <!-- Chapter Header -->
                        <div class="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center cursor-pointer" onclick="this.nextElementSibling.classList.toggle('hidden');">
                            <div>
                                <h3 class="text-lg font-bold text-slate-900">${chapterName}</h3>
                                <p class="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1">${data.mistakes.length} Mistakes Recorded</p>
                            </div>
                            <div class="w-8 h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center transition group-hover:bg-cbse-blue group-hover:text-white">
                                <i class="fas fa-chevron-down"></i>
                            </div>
                        </div>

                        <!-- Mistakes List (Accordion Body) -->
                        <div class="hidden p-6 bg-white space-y-8">
                `;

                // Iterate Mistakes
                data.mistakes.forEach((m, idx) => {
                    // Match Concept Hint
                    let hintHtml = "";
                    if (formulaVault.length > 0) {
                        // Simple fuzzy match: Check if any formula label is in question text or explanation
                        // Or if mistake 'id' (question ID) matches a key (less likely given UUIDs)
                        // Or if 'topic' matches label
                        // Since we don't have explicit conceptID on mistake, we do best effort text match
                        // The prompt says: "compare its conceptID or topic against the formulaVault labels"
                        // We use data.slug (topic) mostly.
                        // Let's try to find a formula that matches the specific question content/context if possible
                        // But mostly we might just show a relevant formula for the CHAPTER if we can't be specific.
                        // Wait, prompt says: "extract that *specific* formula... and inject it".
                        // If no specific match, maybe don't show generic list to avoid clutter.
                        // Let's try matching keywords from question against formula labels.

                        const qText = (m.question || "").toLowerCase();
                        const relevantFormula = formulaVault.find(f => {
                            const label = (f.label || f.name || "").toLowerCase();
                            return label && qText.includes(label);
                        });

                        if (relevantFormula) {
                            const label = relevantFormula.label || relevantFormula.name || "Concept Hint";
                            const content = relevantFormula.tex || relevantFormula.content || relevantFormula.value || "";
                            hintHtml = `
                                <div class="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100 relative overflow-hidden">
                                    <div class="absolute top-0 right-0 p-2 opacity-10 text-6xl text-indigo-900">💡</div>
                                    <div class="text-[10px] font-black text-indigo-600 uppercase tracking-wide mb-2 flex items-center gap-2">
                                        <i class="fas fa-lightbulb"></i> NCERT Concept: ${label}
                                    </div>
                                    <div class="text-indigo-900 font-medium text-sm">
                                        $$${content}$$
                                    </div>
                                </div>
                            `;
                        }
                    }

                    html += `
                        <div class="relative pl-6 border-l-2 border-slate-100 last:mb-0">
                            <span class="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-200 border-2 border-white"></span>

                            <div class="mb-4">
                                <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider">Question ${idx + 1}</span>
                                <p class="text-slate-800 font-bold mt-1 text-base leading-relaxed">${cleanKatexMarkers(m.question)}</p>
                            </div>

                            <div class="grid md:grid-cols-2 gap-4 mb-4">
                                <div class="p-3 bg-red-50 rounded-xl border border-red-100">
                                    <div class="text-[10px] font-black text-danger-red uppercase mb-1">Your Answer</div>
                                    <div class="text-red-900 font-bold text-sm">${cleanKatexMarkers(m.selected)}</div>
                                </div>
                                <div class="p-3 bg-green-50 rounded-xl border border-green-100">
                                    <div class="text-[10px] font-black text-success-green uppercase mb-1">Correct Answer</div>
                                    <div class="text-green-900 font-bold text-sm">${cleanKatexMarkers(m.correct)}</div>
                                </div>
                            </div>

                            ${m.explanation ? `
                                <div class="text-sm text-slate-500 bg-slate-50 p-4 rounded-xl mb-2">
                                    <span class="font-bold text-slate-700 block mb-1 text-xs uppercase">Explanation</span>
                                    ${cleanKatexMarkers(m.explanation)}
                                </div>
                            ` : ''}

                            ${hintHtml}
                        </div>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;

        // Render Math
        if (window.MathJax && (window.MathJax.typeset || window.MathJax.typesetPromise)) {
            window.MathJax.typesetPromise ? window.MathJax.typesetPromise() : window.MathJax.typeset();
        }

    } catch (e) {
        console.error("Mistake Book Error:", e);
        container.innerHTML = `
            <div class="text-center py-12">
                <div class="text-4xl mb-4">⚠️</div>
                <h3 class="text-xl font-bold text-slate-700">Unable to load mistakes</h3>
                <p class="text-slate-500 text-sm mt-2">Please check your connection and try again.</p>
            </div>
        `;
    }
}

// --- INIT ---

injectMathJax();

initializeAuthListener(async (user) => {
    if (user) {
        const displayName = user.displayName || "Scholar";
        const profile = await ensureUserInFirestore(user);

        // Update Header Context
        const welcomeEl = document.getElementById("user-welcome");
        if (welcomeEl) welcomeEl.textContent = displayName;

        const badgeEl = document.getElementById("context-badge");
        if (badgeEl) {
            if (profile && profile.classId) {
                badgeEl.textContent = `Grade ${profile.classId}`;
            } else {
                badgeEl.style.display = "none";
            }
        }

        await renderMistakeBook(user);
    } else {
        window.location.href = "../index.html";
    }
});
