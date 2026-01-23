// js/ui-renderer.js
import { cleanKatexMarkers } from './utils.js';

let els = {};
let isInit = false;

const AR_LABELS = {
    A: "Both A and R are true and R is the correct explanation of A.",
    B: "Both A and R are true but R is not the correct explanation of A.",
    C: "A is true but R is false.",
    D: "A is false but R is true."
};

/* -----------------------------------
   INITIALIZE DOM ELEMENTS
----------------------------------- */
export function initializeElements() {
    if (isInit) return;
    els = {
        list: document.getElementById("question-list"),
        header: document.getElementById("chapter-name-display"),
        diff: document.getElementById("difficulty-display"),
        status: document.getElementById("status-message"),
        quiz: document.getElementById("quiz-content"),
        results: document.getElementById("results-screen"),
        paywall: document.getElementById("paywall-screen"),
        prev: document.getElementById("prev-btn"),
        next: document.getElementById("next-btn"),
        submit: document.getElementById("submit-btn"),
        counter: document.getElementById("question-counter"),
        scoreBox: document.getElementById("score-display"),
        analysisModal: document.getElementById("analysis-modal"),
        analysisContent: document.getElementById("analysis-content"),
        welcomeUser: document.getElementById("user-welcome")
    };

    if (!document.getElementById("review-container") && els.results) {
        const rc = document.createElement("div");
        rc.id = "review-container";
        rc.className = "w-full max-w-4xl text-left mt-10 hidden space-y-6";
        els.results.appendChild(rc);
        els.reviewContainer = rc;
    }
    isInit = true;
}

/* -----------------------------------
   MOTIVATIONAL FEEDBACK
----------------------------------- */
function getMotivationalFeedback(score, total) {
    const p = (score / total) * 100;
    if (p === 100) return "Perfect Score! You are thinking like a subject expert.";
    if (p >= 80) return "Excellent work! You are very close to mastery.";
    if (p >= 50) return "Good Progress! A little more practice and you'll reach the top.";
    return "Every attempt builds understanding. Keep practicing with focus.";
}

/* -----------------------------------
   OPTION HTML
----------------------------------- */
function generateOptionHtml(q, opt, selected, submitted, labelText) {
    const text = labelText || (q.options ? q.options[opt] : "") || "";
    const isSel = selected === opt;
    const isCorrect = submitted && q.correct_answer === opt;
    const isWrong = submitted && isSel && !isCorrect;

    const cls = isCorrect ? "border-green-600 bg-green-50" :
                isWrong ? "border-red-600 bg-red-50" :
                isSel ? "border-blue-500 bg-blue-50" :
                "border-gray-100 bg-white active:bg-gray-50";

    return `
        <label class="block cursor-pointer">
            <input type="radio" name="q-${q.id}" data-id="${q.id}" value="${opt}" class="hidden"
                ${isSel ? "checked" : ""} ${submitted ? "disabled" : ""}>
            <div class="flex items-start p-4 border-2 rounded-xl transition-colors ${cls}">
                <span class="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-gray-100 font-bold mr-4">${opt}</span>
                <span class="font-medium">${cleanKatexMarkers(text)}</span>
            </div>
        </label>`;
}

/* -----------------------------------
   QUESTION RENDERER
----------------------------------- */
export function renderQuestion(q, idx, selected, submitted) {
    if (!isInit) initializeElements();
    const type = (q.question_type || "").toLowerCase();

    if (type.includes("ar") || type.includes("assertion")) {
        els.list.innerHTML = `
            <div class="space-y-6">
                <div class="text-xl font-extrabold text-slate-900">Q${idx}. Assertion (A): ${cleanKatexMarkers(q.text)}</div>
                <div class="bg-blue-50 p-6 rounded-2xl border-l-4 border-blue-600">
                    <span class="text-xs font-black uppercase tracking-widest text-blue-600">Reason (R)</span>
                    <div class="text-lg font-bold text-slate-800">${cleanKatexMarkers(q.scenario_reason)}</div>
                </div>
                <div class="italic font-bold text-slate-500 text-sm">Choose the correct option:</div>
                <div class="grid gap-3">
                    ${['A','B','C','D'].map(o => generateOptionHtml(q, o, selected, submitted, AR_LABELS[o])).join("")}
                </div>
            </div>`;
        return;
    }

    if (type.includes("case")) {
        els.list.innerHTML = `
            <div class="grid md:grid-cols-2 gap-8">
                <div class="order-2 md:order-1">
                    <div class="text-xl font-extrabold">Q${idx}: ${cleanKatexMarkers(q.text)}</div>
                    <div class="grid gap-3 mt-4">
                        ${['A','B','C','D'].map(o => generateOptionHtml(q, o, selected, submitted)).join("")}
                    </div>
                </div>
                <div class="order-1 md:order-2 bg-yellow-50 p-6 rounded-2xl italic border border-yellow-100 shadow-sm text-sm">
                    ${cleanKatexMarkers(q.scenario_reason)}
                </div>
            </div>`;
        return;
    }

    els.list.innerHTML = `
        <div class="space-y-6">
            <div class="text-xl font-extrabold">Q${idx}: ${cleanKatexMarkers(q.text)}</div>
            <div class="grid gap-3">
                ${['A','B','C','D'].map(o => generateOptionHtml(q, o, selected, submitted)).join("")}
            </div>
        </div>`;
}

/* -----------------------------------
   RESULTS + COGNITIVE FEEDBACK
----------------------------------- */
export function renderResults(stats, diff) {
    if (!isInit) initializeElements();
    showView("results-screen");

    const motivation = getMotivationalFeedback(stats.correct, stats.total);

    els.scoreBox.innerHTML = `
        <div class="text-4xl font-black text-slate-900">${stats.correct} / ${stats.total}</div>
        <div class="mt-3 px-4 py-3 bg-blue-50 rounded-2xl text-sm font-bold text-blue-800 leading-relaxed text-center">
            ${motivation}
        </div>`;

    const analysisBtn = document.getElementById("btn-show-analysis");
    if (analysisBtn) {
        analysisBtn.onclick = () => {
            const getScore = t => stats[t].t ? stats[t].c / stats[t].t : 0;
            const skills = [
                { name: "Memory Power (MCQ)", score: getScore("mcq"), strength: "You recall definitions and facts confidently.", improve: "Revise key points and summaries for better retention." },
                { name: "Logic & Connection (Assertion–Reason)", score: getScore("ar"), strength: "You understand cause–effect relationships well.", improve: "Practice explaining why statements support each other." },
                { name: "Application of Concepts (Case Study)", score: getScore("case"), strength: "You apply concepts to real situations effectively.", improve: "Break problems into steps before answering." }
            ];

            const strong = skills.filter(s => s.score >= 0.7).map(s => s.name);
            const weak = skills.filter(s => s.score < 0.7).map(s => s.name);

            els.analysisContent.innerHTML = `
                <div class="space-y-5">
                    <div class="p-5 rounded-3xl bg-slate-50 border">
                        <h4 class="text-sm font-black uppercase tracking-widest mb-2 text-slate-400">Overall Cognitive Insight</h4>
                        <p class="text-sm leading-relaxed">
                            <b>Strength:</b> ${strong.length ? strong.join(", ") : "You are building your foundation steadily."}
                            <br>
                            <b>Needs Improvement:</b> ${weak.length ? weak.join(", ") : "Keep challenging yourself with higher-level questions."}
                        </p>
                    </div>
                    ${skills.map(s => {
                        const pct = Math.round(s.score * 100);
                        const good = s.score >= 0.7;
                        return `
                        <div class="p-4 rounded-2xl border ${good ? "bg-green-50 border-green-100" : "bg-indigo-50 border-indigo-100"}">
                            <div class="flex justify-between items-center mb-1">
                                <span class="text-xs font-black uppercase">${s.name}</span>
                                <span class="font-bold">${pct}%</span>
                            </div>
                            <div class="w-full bg-gray-200 h-2 rounded-full overflow-hidden mb-2">
                                <div class="h-full ${good ? "bg-green-500" : "bg-indigo-500"}" style="width:${pct}%"></div>
                            </div>
                            <p class="text-xs">${good ? s.strength : s.improve}</p>
                        </div>`;
                    }).join("")}
                </div>`;
            els.analysisModal?.classList.remove("hidden");
        };
    }
}

/* -----------------------------------
   REVIEW MY MISTAKES
----------------------------------- */
export function renderAllQuestionsForReview(qs, ua) {
    if (!isInit) initializeElements();
    if (!els.reviewContainer) return;

    els.reviewContainer.classList.remove("hidden");

    const header = `
        <div class="mb-10 text-center">
            <h3 class="text-3xl font-black text-slate-900">The Learning Map</h3>
            <p class="italic text-sm text-slate-500">Understanding grows by comparison.</p>
        </div>`;

    const questions = qs.map((q, i) => {
        const userAns = ua[q.id];
        const correctAns = q.correct_answer;
        const isCorrect = userAns === correctAns;
        const isAR = q.question_type.toLowerCase().includes("ar");
        const getText = k => isAR ? AR_LABELS[k] : (q.options ? q.options[k] : "N/A");

        return `
            <div class="p-6 bg-white rounded-2xl border mb-6 relative shadow-sm">
                <div class="absolute top-0 right-0 px-3 py-1 text-[10px] font-black text-white uppercase tracking-tighter ${isCorrect ? "bg-green-500" : "bg-amber-400"}">
                    ${isCorrect ? "Mastered" : "Growing"}
                </div>
                <p class="font-bold mb-4 text-sm md:text-base">Q${i + 1}. ${cleanKatexMarkers(q.text)}</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span class="text-[10px] font-black uppercase text-slate-400">Your Thought</span>
                        <p class="text-xs md:text-sm font-medium">${userAns ? cleanKatexMarkers(getText(userAns)) : "Skipped"}</p>
                    </div>
                    <div class="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                        <span class="text-[10px] font-black uppercase text-indigo-400">The Golden Key</span>
                        <p class="text-xs md:text-sm font-bold text-indigo-900">${cleanKatexMarkers(getText(correctAns))}</p>
                    </div>
                </div>
            </div>`;
    }).join("");

    els.reviewContainer.innerHTML = header + questions;
    els.reviewContainer.scrollIntoView({ behavior: "smooth" });
}

/* -----------------------------------
   UI HELPERS
----------------------------------- */
export function hideStatus() { els.status?.classList.add("hidden"); }
export function updateHeader(t, d) { if(els.header) els.header.textContent = t; if(els.diff) els.diff.textContent = `Difficulty: ${d}`; }
export function showView(v) {
    [els.quiz, els.results, els.paywall].forEach(x => x?.classList.add("hidden"));
    const target = v === "quiz-content" ? els.quiz : v === "results-screen" ? els.results : els.paywall;
    target?.classList.remove("hidden");
}
export function showStatus(m, c = "") {
    if (!els.status) return;
    els.status.textContent = m;
    els.status.className = c;
    els.status.classList.remove("hidden");
}
export function updateNavigation(i, t, s) {
    els.prev?.classList.toggle("hidden", i === 0);
    els.next?.classList.toggle("hidden", i === t - 1);
    els.submit?.classList.toggle("hidden", s || i !== t - 1);
    if (els.counter) els.counter.textContent = `${i + 1}/${t}`;
}
export function attachAnswerListeners(fn) {
    els.list.onclick = e => {
        const radio = e.target.closest('input[type="radio"]');
        if (radio) fn(radio.dataset.id, radio.value);
    };
}

/* -----------------------------------
   IDENTITY & ACCESS UI HELPERS
----------------------------------- */
export function updateAuthUI(u) {
    if (!isInit) initializeElements();
    if (u && els.welcomeUser) {
        // Displays "Student: [Name]" using the Google Display Name
        const name = u.displayName || u.email.split("@")[0];
        els.welcomeUser.textContent = `Student: ${name}`;
        els.welcomeUser.classList.remove("hidden");
    }
}

export function showPaywallLoading(isLoading = true) {
    const btn = document.getElementById("google-signin-btn");
    if (!btn) return;
    if (isLoading) {
        btn.innerHTML = `<span class="animate-pulse">Verifying Account...</span>`;
        btn.disabled = true;
    } else {
        btn.innerHTML = `Continue with Google`;
        btn.disabled = false;
    }
}

/* -----------------------------------
   RESPONSIVE DATA GRID (Mobile Cards vs Desktop Table)
----------------------------------- */
export function renderResponsiveGrid(container, data, columns, renderCardFn) {
    if (!container) return;

    // Simple breakpoint check (Tailwind 'md' is 768px)
    const isMobile = window.innerWidth < 768;

    if (isMobile && renderCardFn) {
        // Mobile View: Cards (Accordion-ready if needed)
        container.innerHTML = `
            <div class="space-y-4">
                ${data.map(item => renderCardFn(item)).join("")}
            </div>`;
    } else {
        // Desktop View: High Density Table
        const headers = columns.map(c => `<th class="p-4 font-bold text-slate-500 uppercase text-[10px] tracking-wider">${c.header}</th>`).join("");
        const rows = data.map(item => {
            const cells = columns.map(c => {
                const content = c.cell ? c.cell(item) : (item[c.key] || "");
                return `<td class="p-4 align-middle border-b border-slate-50 group-hover:bg-slate-50 transition">${content}</td>`;
            }).join("");
            return `<tr class="group">${cells}</tr>`;
        }).join("");

        container.innerHTML = `
            <div class="overflow-x-auto rounded-xl border border-slate-200">
                <table class="w-full text-sm text-left">
                    <thead class="bg-slate-50 border-b border-slate-100">
                        <tr>${headers}</tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-slate-50">${rows}</tbody>
                </table>
            </div>
        `;
    }
}
