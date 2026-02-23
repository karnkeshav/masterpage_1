import { fetchChapterSummary, logQuizStart } from "./api.js";
import { initializeAuthListener } from "./auth-paywall.js";
import { bindConsoleLogout } from "./guard.js";
import * as UI from "./ui-renderer.js";

// --- HELPERS ---

function sanitize(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\*\*/g, "").trim();
}

function getArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'object') return Object.entries(data).map(([k, v]) => ({ key: k, value: v }));
    return [];
}

function getCleanText(item) {
    if (typeof item === 'string') return sanitize(item);
    if (item && typeof item === 'object') {
        // Extract text property if exists, or values
        return sanitize(item.text || item.value || item.content || item.definition || JSON.stringify(item));
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

async function loadContent(initialGrade, initialSubject, initialChapter, user) {
    const container = document.getElementById("content-container");
    UI.showSkeleton(container);

    // Use initial params for fetching summary
    const data = await fetchChapterSummary(initialGrade, initialSubject, initialChapter);

    if (!data) {
        renderFallback(container, initialGrade);
        return;
    }

    renderDynamicContent(container, data, initialSubject);

    // Critical: Typeset MathJax
    if (window.MathJax && (window.MathJax.typeset || window.MathJax.typesetPromise)) {
        window.MathJax.typesetPromise ? window.MathJax.typesetPromise() : window.MathJax.typeset();
    }

    // Inject "Take Test" Button
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "mt-12 text-center";
    buttonContainer.innerHTML = `
        <button id="take-test-btn" class="px-8 py-4 bg-accent-gold text-cbse-blue font-black rounded-2xl text-lg shadow-lg hover:shadow-xl hover:-translate-y-1 transition flex items-center justify-center gap-3 mx-auto">
            <span>🚀</span> Take Chapter Test
        </button>
    `;
    container.appendChild(buttonContainer);

    // Fix ReferenceError: Use params from URL at click time
    document.getElementById("take-test-btn").onclick = () => {
        const p = new URLSearchParams(window.location.search);
        const g = p.get("grade") || "9";
        const s = p.get("subject") || "Mathematics";
        const c = p.get("chapter") || "Polynomials";
        createDifficultyModal(g, s, c, user);
    };
}

function renderDynamicContent(container, data, subject) {
    const isMathScience = subject.includes("Math") || subject.includes("Science") && !subject.includes("Social");

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

    // 2. Build Formula Vault HTML (Maths & Science Only)
    let formulaHtml = '';
    const formulaData = getArray(data.formulaVault);
    if (isMathScience && formulaData.length > 0) {
        formulaHtml = `
            <div class="md:col-span-2 glass-panel p-6 rounded-3xl bg-slate-900 text-white relative overflow-hidden mt-8">
                <div class="absolute top-0 right-0 p-8 opacity-10 text-9xl">∑</div>
                <h3 class="text-lg font-black text-accent-gold mb-4 flex items-center gap-2 relative z-10">
                    <span class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white text-sm">∫</span>
                    Formula Vault
                </h3>
                <div class="grid md:grid-cols-2 gap-4 relative z-10">
                    ${formulaData.map(item => {
                        const f = getFormulaContent(item);
                        return `
                        <div class="bg-white/10 p-4 rounded-xl border border-white/10">
                            <div class="text-xs text-white/50 uppercase font-bold tracking-widest mb-1">${sanitize(f.label)}</div>
                            <div class="font-mono text-lg font-bold">${f.content}</div>
                        </div>
                    `}).join("")}
                </div>
            </div>
        `;
    }

    // 3. Build Major Points (Core Takeaways)
    let majorPointsHtml = '';
    const majorData = getArray(data.majorPoints);
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

    // 4. Build Glossary (Definitions)
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

    container.innerHTML = `
        ${tipsHtml}
        <div class="grid md:grid-cols-2 gap-8 ${(!majorPointsHtml && !glossaryHtml && !formulaHtml) ? 'hidden' : ''}">
            ${majorPointsHtml}
            ${glossaryHtml}
            ${formulaHtml}
        </div>
    `;
}

function createDifficultyModal(grade, subject, chapter, user) {
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
            <p class="text-slate-500 text-center mb-8 text-sm font-medium">Choose your challenge level to begin.</p>

            <div class="space-y-4">
                <button onclick="window.startQuiz('Simple')" class="w-full p-4 bg-green-50 border-2 border-green-100 rounded-2xl hover:bg-green-100 hover:border-green-300 transition group text-left flex items-center gap-4">
                    <span class="w-10 h-10 rounded-xl bg-green-200 text-green-700 flex items-center justify-center text-xl">🌱</span>
                    <div>
                        <div class="font-bold text-green-800">Simple</div>
                        <div class="text-[10px] text-green-600 font-bold uppercase tracking-wider">Foundation</div>
                    </div>
                    <span class="ml-auto text-green-400 group-hover:translate-x-1 transition">➔</span>
                </button>

                <button onclick="window.startQuiz('Medium')" class="w-full p-4 bg-yellow-50 border-2 border-yellow-100 rounded-2xl hover:bg-yellow-100 hover:border-yellow-300 transition group text-left flex items-center gap-4">
                    <span class="w-10 h-10 rounded-xl bg-yellow-200 text-yellow-700 flex items-center justify-center text-xl">⚡</span>
                    <div>
                        <div class="font-bold text-yellow-800">Medium</div>
                        <div class="text-[10px] text-yellow-600 font-bold uppercase tracking-wider">Standard</div>
                    </div>
                    <span class="ml-auto text-yellow-400 group-hover:translate-x-1 transition">➔</span>
                </button>

                <button onclick="window.startQuiz('Advanced')" class="w-full p-4 bg-red-50 border-2 border-red-100 rounded-2xl hover:bg-red-100 hover:border-red-300 transition group text-left flex items-center gap-4">
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

    window.startQuiz = (difficulty) => {
        logQuizStart(user.uid, subject, chapter, difficulty);
        window.location.href = `quiz-engine.html?grade=${grade}&subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapter)}&difficulty=${difficulty}`;
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
