
import { fetchChapterSummary } from "./api.js";
import { initializeAuthListener } from "./auth-paywall.js";
import { bindConsoleLogout } from "./guard.js";
import * as UI from "./ui-renderer.js";

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

            await loadContent(grade, subject, chapter);
        } else {
            window.location.href = "../index.html";
        }
    });
}

async function loadContent(grade, subject, chapter) {
    const container = document.getElementById("content-container");
    UI.showSkeleton(container);

    const data = await fetchChapterSummary(grade, subject, chapter);

    if (!data) {
        renderFallback(container, grade);
        return;
    }

    renderDynamicContent(container, data);

    // Critical: Typeset MathJax
    if (window.MathJax) {
        window.MathJax.typesetPromise ? window.MathJax.typesetPromise() : window.MathJax.typeset();
    }
}

function renderDynamicContent(container, data) {
    // 1. Build Tips & Tricks HTML (if exists)
    let tipsHtml = '';
    if (data.tipsAndTricks && data.tipsAndTricks.length > 0) {
        tipsHtml = `
            <div class="glass-panel p-6 rounded-3xl bg-emerald-50 border border-emerald-100 mb-8">
                <h3 class="text-lg font-black text-emerald-700 mb-4 flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-white/50 flex items-center justify-center text-emerald-600 text-sm">💡</span>
                    Tips & Tricks
                </h3>
                <ul class="space-y-3">
                    ${data.tipsAndTricks.map(t => `
                        <li class="flex items-start gap-3 text-sm text-emerald-800 font-medium">
                            <span class="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
                            <span>${t}</span>
                        </li>
                    `).join("")}
                </ul>
            </div>
        `;
    }

    // 2. Build Formula Vault HTML (if exists)
    let formulaHtml = '';
    if (data.formulaVault && data.formulaVault.length > 0) {
        formulaHtml = `
            <div class="md:col-span-2 glass-panel p-6 rounded-3xl bg-slate-900 text-white relative overflow-hidden mt-8">
                <div class="absolute top-0 right-0 p-8 opacity-10 text-9xl">∑</div>
                <h3 class="text-lg font-black text-accent-gold mb-4 flex items-center gap-2 relative z-10">
                    <span class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white text-sm">∫</span>
                    Formula Vault
                </h3>
                <div class="grid md:grid-cols-2 gap-4 relative z-10">
                    ${data.formulaVault.map(f => `
                        <div class="bg-white/10 p-4 rounded-xl border border-white/10">
                            <div class="text-xs text-white/50 uppercase font-bold tracking-widest mb-1">${f.label || 'Formula'}</div>
                            <div class="font-mono text-lg font-bold">${f.tex || f.content}</div>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    // 3. Build Main Grid
    // Major Points & Definitions always try to render, empty check inside map handles empty arrays gracefully
    // But we should wrap them to avoid empty boxes if data is missing completely?
    // The requirement says "dynamically handles different subjects by checking for field existence".

    let majorPointsHtml = '';
    if (data.majorPoints && data.majorPoints.length > 0) {
        majorPointsHtml = `
            <div class="glass-panel p-6 rounded-3xl">
                <h3 class="text-lg font-black text-cbse-blue mb-4 flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 text-sm">📌</span>
                    Core Takeaways
                </h3>
                <ul class="space-y-3">
                    ${data.majorPoints.map(p => `
                        <li class="flex items-start gap-3 text-sm text-slate-600 leading-relaxed">
                            <span class="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-gold flex-shrink-0"></span>
                            <span>${p}</span>
                        </li>
                    `).join("")}
                </ul>
            </div>
        `;
    }

    let glossaryHtml = '';
    if (data.oneLineDefinitions && data.oneLineDefinitions.length > 0) {
        glossaryHtml = `
            <div class="glass-panel p-6 rounded-3xl">
                <h3 class="text-lg font-black text-cbse-blue mb-4 flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 text-sm">📖</span>
                    Glossary
                </h3>
                <div class="space-y-4">
                    ${data.oneLineDefinitions.map(d => `
                        <div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                            <p class="text-sm font-medium text-slate-700">${d}</p>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        ${tipsHtml}
        <div class="grid md:grid-cols-2 gap-8">
            ${majorPointsHtml}
            ${glossaryHtml}
            ${formulaHtml}
        </div>
    `;
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
