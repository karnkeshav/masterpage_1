
import { getInitializedClients, initializeServices } from "./api.js";
import { normalizeSubject, formatChapterName, cleanKatexMarkers } from "./utils.js";
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initializeAuthListener } from "./auth-paywall.js";

// Initialize MathJax if not present
if (!window.MathJax) {
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
    script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
    script.async = true;
    document.head.appendChild(script);
}

// Data Loader
async function loadMistakes(user) {
    const container = document.getElementById("mistakes-container");
    if (!container) return;

    container.innerHTML = `<div class="text-center p-8 animate-pulse text-slate-400">Loading your learning journey...</div>`;

    try {
        const { db } = await getInitializedClients();
        const uid = user.uid;

        // 1. Fetch Mistakes
        // Use implied collection name from user request: "mistakes collection"
        // But api.js uses "mistake_notebook". I will stick to "mistake_notebook" based on api.js usage.
        const mistakesQ = query(
            collection(db, "mistake_notebook"),
            where("user_id", "==", uid),
            orderBy("timestamp", "desc")
        );

        const mistakesSnap = await getDocs(mistakesQ);

        if (mistakesSnap.empty) {
            renderEmptyState(container);
            return;
        }

        // 2. Group Mistakes by Subject -> Chapter
        const tree = {}; // { Subject: { ChapterName: [mistakes] } }
        const chapterRefs = {}; // { ChapterName: { subject, topicSlug, rawChapter } }

        mistakesSnap.forEach(docSnap => {
            const data = docSnap.data();
            // Normalize Subject
            const subject = normalizeSubject({ topic: data.topic, subject: data.subject });
            // Format Chapter Name
            const rawSlug = data.topic || data.chapter_slug || "";
            const chapter = formatChapterName(rawSlug);

            if (!tree[subject]) tree[subject] = {};
            if (!tree[subject][chapter]) tree[subject][chapter] = [];

            // Add mistakes
            (data.mistakes || []).forEach(m => {
                tree[subject][chapter].push({
                    ...m,
                    originalSlug: rawSlug,
                    docId: docSnap.id
                });
            });

            chapterRefs[chapter] = { subject, topicSlug: rawSlug, rawChapter: data.chapter || rawSlug };
        });

        // 3. Fetch NCERT Summaries for each Chapter
        // ID Convention: ${grade}${subject}${chapter} (e.g. 9ScienceGravitation)
        // We need to infer Grade. Default to 9 if not in profile.
        // Or check user profile? Since we have user object, we can try to get profile.
        // But loadMistakes receives user object from auth listener which is Auth User.
        // We can try to fetch profile or default to 9.
        let grade = "9";
        // Attempt to get grade from session storage or profile if available in window
        if (window.userProfile?.classId) grade = window.userProfile.classId;

        const ncertData = {}; // { ChapterName: SummaryDocData }

        const chapters = Object.keys(chapterRefs);
        await Promise.all(chapters.map(async (chName) => {
            const ref = chapterRefs[chName];
            // Construct ID: 9ScienceGravitation
            // Remove spaces from chapter name for ID? formatChapterName returns "Gravitation".
            // If it has spaces (e.g. "Linear Equations"), ID likely removes them?
            // "Naming convention ${grade}${subject}${chapter}" - usually CamelCase or concatenated.
            // I'll assume concatenated without spaces for safety, or keep spaces if Firestore IDs allow.
            // Most consistent is removing spaces.
            const cleanCh = chName.replace(/\s+/g, "");
            const id = `${grade}${ref.subject}${cleanCh}`;

            try {
                const summaryDoc = await getDoc(doc(db, "ncert_summaries", id));
                if (summaryDoc.exists()) {
                    ncertData[chName] = summaryDoc.data();
                }
            } catch (e) {
                console.warn(`NCERT Fetch failed for ${id}`, e);
            }
        }));

        // 4. Render UI
        renderMistakeTree(container, tree, ncertData);

        // 5. Trigger MathJax
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise();
        }

    } catch (e) {
        console.error("Mistake Manager Error:", e);
        container.innerHTML = `<div class="text-center text-red-500 p-4">Failed to load mistakes. Please try again later.</div>`;
    }
}

function renderEmptyState(container) {
    container.innerHTML = `
       <div class="text-center p-12 bg-white rounded-3xl border border-dashed border-slate-300">
           <div class="text-4xl mb-4">🎉</div>
           <h3 class="text-xl font-bold text-slate-700">No Mistakes Recorded!</h3>
           <p class="text-slate-500">Keep practicing to find areas for improvement.</p>
       </div>
   `;
}

function renderMistakeTree(container, tree, ncertData) {
    let html = "";
    const subjects = Object.keys(tree).sort();

    subjects.forEach(subject => {
        const chapters = tree[subject];

        // Top Level: Subject Header
        html += `
            <div class="mb-10">
                <h2 class="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                    <span class="w-1.5 h-8 bg-blue-600 rounded-full"></span>
                    ${subject}
                </h2>
                <div class="space-y-4">
        `;

        Object.keys(chapters).sort().forEach(chapter => {
            const mistakes = chapters[chapter];
            const summary = ncertData[chapter];
            const uniqueId = `grp-${subject}-${chapter}`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

            // Mid Level: Chapter Card (Accordion Trigger)
            html += `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onclick="toggleMistakeAccordion('${uniqueId}')" class="w-full flex items-center justify-between p-6 text-left hover:bg-slate-50 transition group">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-full bg-red-50 text-red-500 flex items-center justify-center font-bold text-sm group-hover:bg-red-100 transition">
                                ${mistakes.length}
                            </div>
                            <div>
                                <h3 class="font-bold text-slate-900 text-lg group-hover:text-blue-600 transition">${chapter}</h3>
                                <p class="text-xs text-slate-400 font-medium uppercase tracking-wide">Mistakes</p>
                            </div>
                        </div>
                        <i id="icon-${uniqueId}" class="fas fa-chevron-down text-slate-300 transition-transform duration-300 group-hover:text-slate-500"></i>
                    </button>

                    <div id="${uniqueId}" class="hidden border-t border-slate-100 bg-slate-50/50">
                        <div class="p-6 space-y-8">
            `;

            // Detail Level: Mistakes List
            mistakes.forEach((m, idx) => {
                // Reflection Injection: Concept Hint
                let hint = null;
                if (summary && summary.formulaVault) {
                    // Match logic: Check if m.topic, m.conceptID, or m.explanation contains keywords from formulaVault keys/labels
                    // formulaVault is likely an array or object. Assuming array of objects { label, formula, description } based on standard patterns?
                    // Or based on user request "formulaVault labels".
                    // Let's assume formulaVault is an array of { label: "...", formula: "..." }.

                    // Simple heuristic: Does mistake explanation or question contain the label?
                    // Or if mistake has a 'concept' field (not standard in previous schema, but maybe in newer).
                    // We'll search for matches in explanation text.

                    const textToSearch = (m.explanation || "") + " " + (m.question || "");

                    if (Array.isArray(summary.formulaVault)) {
                         const match = summary.formulaVault.find(f => textToSearch.toLowerCase().includes((f.label || "").toLowerCase()));
                         if (match) hint = match;
                    }
                }

                html += `
                    <div class="relative pl-6 border-l-2 border-slate-200">
                        <div class="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-200 border-2 border-white"></div>

                        <div class="mb-4">
                            <h4 class="font-bold text-slate-900 text-base leading-relaxed mb-2">${m.question}</h4>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                <!-- Wrong Answer -->
                                <div class="bg-red-50 p-4 rounded-xl border border-red-100">
                                    <div class="text-[10px] font-bold text-red-400 uppercase tracking-wide mb-1">Your Answer</div>
                                    <div class="font-medium text-red-900">${m.selected}</div>
                                </div>

                                <!-- Correct Answer -->
                                <div class="bg-green-50 p-4 rounded-xl border border-green-100">
                                    <div class="text-[10px] font-bold text-green-600 uppercase tracking-wide mb-1">Correct Answer</div>
                                    <div class="font-bold text-green-900">${m.correct}</div>
                                </div>
                            </div>
                        </div>

                        <!-- Concept Hint (NCERT Reflection) -->
                        ${hint ? `
                            <div class="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-4">
                                <div class="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600">
                                    <i class="fas fa-lightbulb"></i>
                                </div>
                                <div>
                                    <div class="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">Concept Hint</div>
                                    <div class="text-slate-800 text-sm font-medium mb-1">${hint.label || "Key Concept"}</div>
                                    <div class="text-slate-700 text-sm font-mono bg-white/50 p-2 rounded border border-amber-100 inline-block">
                                        $$${hint.formula || ""}$$
                                    </div>
                                    ${hint.description ? `<p class="text-xs text-slate-500 mt-1">${hint.description}</p>` : ''}
                                </div>
                            </div>
                        ` : ''}

                        ${m.explanation && !hint ? `
                            <div class="mt-4 text-sm text-slate-600 italic">
                                <span class="font-bold not-italic text-slate-500 mr-1">Note:</span> ${m.explanation}
                            </div>
                        ` : ''}

                    </div>
                `;
            });

            html += `
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Global Toggle Function
window.toggleMistakeAccordion = (id) => {
    const el = document.getElementById(id);
    const icon = document.getElementById(`icon-${id}`);
    if (el && icon) {
        if (el.classList.contains('hidden')) {
            el.classList.remove('hidden');
            icon.style.transform = 'rotate(180deg)';
        } else {
            el.classList.add('hidden');
            icon.style.transform = 'rotate(0deg)';
        }
    }
};

// Initialize
initializeAuthListener((user) => {
    if (user) {
        loadMistakes(user);
    } else {
        // Redirect handled by auth-paywall usually, or show login
        console.warn("No user for Mistake Book");
    }
});
