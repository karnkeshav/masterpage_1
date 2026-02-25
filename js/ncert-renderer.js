import { fetchChapterSummary, logQuizStart } from "./api.js";
import { loadCurriculum } from "./curriculum/loader.js";
import { initializeAuthListener } from "./auth-paywall.js";
import { bindConsoleLogout } from "./guard.js";
import * as UI from "./ui-renderer.js";

// --- HELPERS ---

function sanitize(text) {
    if (typeof text !== 'string') return text || "";
    return text.replace(/\*\*/g, "").trim();
}

function getArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    // Universal Data Parser: Handle Map-like objects by converting to values list
    if (typeof data === 'object') return Object.values(data);
    return [];
}

function getCleanText(item) {
    if (typeof item === 'string') return sanitize(item);
    if (item && typeof item === 'object') {
        // Fix "Undefined" errors by checking multiple field names (tex, content, value, formula, definition)
        // Fix [object Object] by ensuring we extract a string property
        const raw = item.tex || item.content || item.value || item.formula || item.definition || item.text || "";
        return sanitize(raw);
    }
    return "";
}

function getFormulaContent(item) {
    if (typeof item === 'string') return { label: 'Formula', content: item };
    return {
        label: item.label || item.name || 'Formula',
        content: item.tex || item.content || item.formula || item.value || ''
    };
}

// --- NCERT RENDERER LOGIC ---

export async function initStudyContent() {
    UI.injectStyles();
    bindConsoleLogout("logout-nav-btn", "../index.html");

    const params = new URLSearchParams(window.location.search);
    const grade = params.get("grade") || "9";
    const subject = params.get("subject") || "Mathematics";
    const chapter = params.get("chapter") || "Polynomials";

    initializeAuthListener(async (user) => {
        if (user) {
            document.getElementById("user-welcome").textContent = user.displayName || "Scholar";
            document.getElementById("context-badge").textContent = `Grade ${grade}`;
            document.getElementById("chapter-title").textContent = chapter;
            document.getElementById("subject-subtitle").textContent = `${subject} • Class ${grade}`;

            await loadContent(grade, subject, chapter, user);
        } else {
            window.location.href = "../index.html";
        }
    });
}

async function getCurriculumSubDiscipline(grade, subject, chapter) {
    try {
        const curriculum = await loadCurriculum(grade);
        const subjectData = curriculum[subject] || curriculum[Object.keys(curriculum).find(k => k.toLowerCase() === subject.toLowerCase())];

        if (!subjectData) return null;

        // Iterate sub-disciplines (History, Geography, Physics, etc.)
        for (const [sub, chapters] of Object.entries(subjectData)) {
            // Check if chapter exists in list (loose matching)
            const match = chapters.find(c => c.chapter_title.toLowerCase().includes(chapter.toLowerCase()) || chapter.toLowerCase().includes(c.chapter_title.toLowerCase()));
            if (match) return sub;
        }
    } catch (e) {
        console.warn("Curriculum load failed:", e);
    }
    return null;
}

async function loadContent(grade, subject, chapter, user) {
    const container = document.getElementById("content-container");
    UI.showSkeleton(container);

    let data = null;

    // 1. Try Curriculum-Aware Fetch (e.g. Social Science -> Geography)
    const subDiscipline = await getCurriculumSubDiscipline(grade, subject, chapter);
    if (subDiscipline) {
        const specificId = subDiscipline.toLowerCase().replace(/ /g, '_');
        console.log(`[NCERT] Trying specific fetch: ${specificId}`);
        data = await fetchChapterSummary(grade, specificId, chapter);
    }

    // 2. Fallback: Generic Subject Fetch (e.g. Social Science -> social_science)
    if (!data) {
        const genericId = subject.toLowerCase().replace(/ /g, '_');
        console.log(`[NCERT] Fallback to generic fetch: ${genericId}`);
        data = await fetchChapterSummary(grade, genericId, chapter);
    }

    if (!data) {
        renderFallback(container, grade);
        return;
    }

    // Inject discovered discipline if missing
    if (subDiscipline && !data.discipline) data.discipline = subDiscipline;

    renderDynamicContent(container, data, subject);

    // Critical: Typeset MathJax
    if (window.MathJax) {
        window.MathJax.typesetPromise ? window.MathJax.typesetPromise() : window.MathJax.typeset();
    }
}

function renderDynamicContent(container, data, subject) {
    // Robust Subject Check (Case Insensitive)
    const lowerSub = subject.toLowerCase();

    // Determine Discipline from Data or Fallback
    const discipline = (data.discipline || data.book || subject).toLowerCase();

    const isChemistry = discipline.includes("chemistry");
    const isBiology = discipline.includes("biology");
    const isPhysics = discipline.includes("physics");
    const isMath = lowerSub.includes("math") || discipline.includes("math");
    const isHistory = discipline.includes("history");
    const isSocial = lowerSub.includes("social") || isHistory || discipline.includes("civics") || discipline.includes("geography") || discipline.includes("economics");

    // Visibility Rules
    // Physics/Math/Chemistry: Show Formula Vault
    // Biology/Civics/Economics/History: Hide Formula Vault
    const showFormula = (isMath || isPhysics || isChemistry) && !isBiology && !isSocial;

    const formulaTitle = isChemistry ? "Equation Vault" : "Formula Vault";
    const formulaIcon = isChemistry ? "⚗️" : "∫";

    // 1. Build Tips & Tricks HTML (Common)
    let tipsHtml = '';
    const tipsData = getArray(data.tipsAndTricks);
    if (tipsData.length > 0) {
        tipsHtml = `
            <div class="glass-panel p-6 rounded-3xl bg-emerald-50 border border-emerald-100 mb-8">
                <h3 class="text-lg font-black text-emerald-700 mb-4 flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-white/50 flex items-center justify-center text-emerald-600 text-sm">💡</span>
                    Tips & Tricks
                </h3>
                <ul class="space-y-3">
                    ${tipsData.map(t => `
                        <li class="flex items-start gap-3 text-sm text-emerald-800 font-medium">
                            <span class="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                            <span>${getCleanText(t)}</span>
                        </li>
                    `).join("")}
                </ul>
            </div>
        `;
    }

    // 2. Build Formula/Equation Vault HTML
    let formulaHtml = '';
    const formulaData = getArray(data.formulaVault || data.equationVault); // Support equationVault field too
    if (showFormula && formulaData.length > 0) {
        formulaHtml = `
            <div class="md:col-span-2 glass-panel p-6 rounded-3xl bg-white border border-slate-200 relative overflow-hidden mt-8 shadow-sm">
                <div class="absolute top-0 right-0 p-8 opacity-5 text-9xl text-slate-900">∑</div>
                <h3 class="text-lg font-black text-slate-900 mb-4 flex items-center gap-2 relative z-10">
                    <span class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 text-sm">${formulaIcon}</span>
                    ${formulaTitle}
                </h3>
                <div class="grid md:grid-cols-2 gap-4 relative z-10">
                    ${formulaData.map(item => {
                        const f = getFormulaContent(item);
                        return `
                        <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div class="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">${sanitize(f.label)}</div>
                            <div class="font-mono text-lg font-bold text-slate-900">${f.content}</div>
                        </div>
                    `}).join("")}
                </div>
            </div>
        `;
    }

    // 3. Build Major Points (Core Takeaways)
    // "Biology/Civics/Economics: ... prioritize Core Takeaways"
    // So we show majorPoints for everyone EXCEPT History (which uses Timeline) or maybe History also shows it?
    // Prompt: "History: Replace the vault with a new container for Chronology/Timeline Data."
    // Prompt: "Biology/Civics/Economics: ... prioritize Core Takeaways and Glossaries."
    // So Biology/Civics/Econ SHOW Core Takeaways.
    let majorPointsHtml = '';
    const majorData = getArray(data.majorPoints || data.coreTakeaways);
    if (majorData.length > 0) {
        majorPointsHtml = `
            <div class="glass-panel p-6 rounded-3xl">
                <h3 class="text-lg font-black text-cbse-blue mb-4 flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 text-sm">📌</span>
                    Core Takeaways
                </h3>
                <ul class="space-y-3">
                    ${majorData.map(p => `
                        <li class="flex items-start gap-3 text-sm text-slate-600 leading-relaxed">
                            <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-gold flex-shrink-0"></span>
                            <span>${getCleanText(p)}</span>
                        </li>
                    `).join("")}
                </ul>
            </div>
        `;
    }

    // 4. Build Subject-Specific Data (Social Science / History Timeline)
    let socialDataHtml = '';
    if (isSocial) {
        let specificData = [];
        let label = "Key Insights";
        let icon = "📜";

        // History: Chronology/Timeline Data
        if (isHistory && (data.timeline || data.historyData)) {
            specificData = getArray(data.timeline || data.historyData);
            label = "Chronology & Timeline";
            icon = "⏳";
        }
        else if (data.civicsData) {
            specificData = getArray(data.civicsData);
            label = "Civic Concepts";
            icon = "⚖️";
        } else if (data.geographyData) {
            specificData = getArray(data.geographyData);
            label = "Geographic Facts";
            icon = "🌍";
        } else if (data.economicsData) {
            specificData = getArray(data.economicsData);
            label = "Economic Principles";
            icon = "💰";
        } else if (data.socialScienceData) {
             specificData = getArray(data.socialScienceData);
        }

        if (specificData.length > 0) {
             socialDataHtml = `
            <div class="glass-panel p-6 rounded-3xl">
                <h3 class="text-lg font-black text-cbse-blue mb-4 flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 text-sm">${icon}</span>
                    ${label}
                </h3>
                <ul class="space-y-3">
                    ${specificData.map(p => `
                        <li class="flex items-start gap-3 text-sm text-slate-600 leading-relaxed">
                            <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0"></span>
                            <span>${getCleanText(p)}</span>
                        </li>
                    `).join("")}
                </ul>
            </div>
        `;
        }
    }

    // 5. Build Glossary (Definitions - Common)
    let glossaryHtml = '';
    const glossaryData = getArray(data.oneLineDefinitions);
    if (glossaryData.length > 0) {
        glossaryHtml = `
            <div class="glass-panel p-6 rounded-3xl">
                <h3 class="text-lg font-black text-cbse-blue mb-4 flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 text-sm">📖</span>
                    Glossary
                </h3>
                <div class="space-y-4">
                    ${glossaryData.map(d => `
                        <div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                            <p class="text-sm font-medium text-slate-700">${getCleanText(d)}</p>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    // Layout Assembly
    container.innerHTML = `
        ${tipsHtml}
        <div class="grid md:grid-cols-2 gap-8 ${(!majorPointsHtml && !glossaryHtml && !formulaHtml && !socialDataHtml) ? 'hidden' : ''}">
            ${majorPointsHtml}
            ${socialDataHtml}
            ${glossaryHtml}
            ${formulaHtml}
        </div>
    `;

    // Inject "Take Chapter Test" Action Section
    const actionSection = document.createElement("div");
    actionSection.className = "mt-12 pt-8 border-t border-slate-200 text-center";
    actionSection.innerHTML = `
        <button id="btn-target-test" class="px-10 py-4 bg-cbse-blue text-white font-black rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 mx-auto">
            <span>Take Chapter Test</span>
            <i class="fas fa-chevron-right"></i>
        </button>
        <p class="mt-4 text-xs text-slate-400 font-bold uppercase tracking-widest">Mastery Level: Recommended 85%+</p>
    `;
    container.appendChild(actionSection);

    document.getElementById("btn-target-test").onclick = () => {
        launchTargetedQuiz(grade, subject, chapter, user);
    };
}

function launchTargetedQuiz(grade, subject, chapter, user) {
    // Remove existing modal if any
    const existing = document.getElementById("difficulty-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "difficulty-modal";
    modal.className = "fixed inset-0 bg-cbse-blue/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-in";
    modal.innerHTML = `
        <div class="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl relative">
            <button id="close-modal-btn" class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-red-50 hover:text-red-500 transition">✕</button>
            <h3 class="text-2xl font-black text-cbse-blue mb-2 text-center">Select Difficulty</h3>
            <p class="text-slate-500 text-center mb-8 text-sm font-medium">Select Difficulty: Simple, Medium, or Advanced</p>

            <div class="space-y-4">
                <button onclick="window.startTargetedQuiz('Simple')" class="w-full p-4 bg-green-50 border-2 border-green-100 rounded-2xl hover:bg-green-100 hover:border-green-300 transition group text-left flex items-center gap-4">
                    <span class="w-10 h-10 rounded-xl bg-green-200 text-green-700 flex items-center justify-center text-xl">🌱</span>
                    <div>
                        <div class="font-bold text-green-800">Simple</div>
                        <div class="text-[10px] text-green-600 font-bold uppercase tracking-wider">Foundation</div>
                    </div>
                    <span class="ml-auto text-green-400 group-hover:translate-x-1 transition">➔</span>
                </button>

                <button onclick="window.startTargetedQuiz('Medium')" class="w-full p-4 bg-yellow-50 border-2 border-yellow-100 rounded-2xl hover:bg-yellow-100 hover:border-yellow-300 transition group text-left flex items-center gap-4">
                    <span class="w-10 h-10 rounded-xl bg-yellow-200 text-yellow-700 flex items-center justify-center text-xl">⚡</span>
                    <div>
                        <div class="font-bold text-yellow-800">Medium</div>
                        <div class="text-[10px] text-yellow-600 font-bold uppercase tracking-wider">Standard</div>
                    </div>
                    <span class="ml-auto text-yellow-400 group-hover:translate-x-1 transition">➔</span>
                </button>

                <button onclick="window.startTargetedQuiz('Advanced')" class="w-full p-4 bg-red-50 border-2 border-red-100 rounded-2xl hover:bg-red-100 hover:border-red-300 transition group text-left flex items-center gap-4">
                    <span class="w-10 h-10 rounded-xl bg-red-200 text-red-700 flex items-center justify-center text-xl">🔥</span>
                    <div>
                        <div class="font-bold text-red-800">Advanced</div>
                        <div class="text-[10px] text-red-600 font-bold uppercase tracking-wider">Challenger</div>
                    </div>
                    <span class="ml-auto text-red-400 group-hover:translate-x-1 transition">➔</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("close-modal-btn").onclick = () => modal.remove();

    window.startTargetedQuiz = (difficulty) => {
        // Step 2: Slug Construction
        const topicSlug = `${grade}_${subject.toLowerCase().split(' ')[0]}_${chapter.toLowerCase().replace(/\s+/g, '_')}`;

        logQuizStart(user.uid, subject, chapter, difficulty);

        // Step 3: Direct Redirect
        window.location.href = `quiz-engine.html?topic=${encodeURIComponent(topicSlug)}&difficulty=${difficulty}&grade=${grade}&subject=${encodeURIComponent(subject)}`;
    };
}

function renderFallback(container, grade) {
    container.innerHTML = `
        <div class="text-center py-12">
            <div class="text-6xl mb-4">🚧</div>
            <h3 class="text-xl font-black text-slate-700 mb-2">Content Under Construction</h3>
            <p class="text-slate-500 max-w-md mx-auto">We are currently digitizing the summary for this chapter. Please check back later or visit the Warm-up Room.</p>
            <a href="curriculum.html?grade=${grade}" class="inline-block mt-6 px-6 py-3 bg-cbse-blue text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition">Go to Warm-up Room</a>
        </div>
    `;
}

// Auto-init if running in browser context
if (typeof window !== 'undefined') {
    initStudyContent();
}
