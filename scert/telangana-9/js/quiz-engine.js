import { initializeServices, getInitializedClients } from "./config.js";
import { fetchQuestions, saveResult } from "./api.js";
import * as UI from "./ui-renderer.js";
import { initializeAuthListener, requireAuth } from "./auth-paywall.js";
import { showExpiredPopup, checkClassAccess } from "./firebase-expiry.js";

let quizState = { classId: "", subject: "", topicSlug: "", difficulty: "", questions: [], currentQuestionIndex: 0, userAnswers: {}, isSubmitted: false };
let questionsPromise = null;

function parseUrlParameters() {
    const params = new URLSearchParams(location.search);
    quizState.difficulty = params.get("difficulty") || "Simple";
    quizState.classId = params.get("class") || "11";
    quizState.subject = params.get("subject") || "Physics";
    quizState.topicSlug = params.get("table") || params.get("topic") || "";

    let displayChapter = params.get("chapter_name");
    if (!displayChapter) {
        displayChapter = quizState.topicSlug.replace(/[_-]/g, " ").replace(/quiz|worksheet/ig, "").trim();
        const subjectRegex = new RegExp(`^${quizState.subject}\\s*`, "i");
        displayChapter = displayChapter.replace(subjectRegex, "").trim();
    } else { displayChapter = decodeURIComponent(displayChapter); }

    displayChapter = displayChapter.replace(/\b\w/g, c => c.toUpperCase()).replace(/\bAnd\b/g, "and"); 
    const displayClass = quizState.classId.replace("TS_", ""); // CLEAN DISPLAY
    UI.updateHeader(`Class ${displayClass} : ${quizState.subject} - ${displayChapter} Worksheet`, quizState.difficulty);
}

async function loadQuiz() {
    try {
        UI.showStatus("Preparing worksheet...", "text-blue-600 font-bold");
        quizState.questions = await questionsPromise;
        if (quizState.questions.length > 0) { UI.hideStatus(); renderQuestion(); UI.showView("quiz-content"); }
    } catch (e) { UI.showStatus(`Error: ${e.message}`, "text-red-600"); }
}

function renderQuestion() {
    const q = quizState.questions[quizState.currentQuestionIndex];
    UI.renderQuestion(q, quizState.currentQuestionIndex + 1, quizState.userAnswers[q.id], quizState.isSubmitted);
    UI.updateNavigation(quizState.currentQuestionIndex, quizState.questions.length, quizState.isSubmitted);
}

function handleAnswerSelection(id, opt) { if (!quizState.isSubmitted) { quizState.userAnswers[id] = opt; renderQuestion(); } }
function handleNavigation(delta) { quizState.currentQuestionIndex += delta; renderQuestion(); }

async function handleSubmit() {
    quizState.isSubmitted = true;
    const stats = { total: quizState.questions.length, correct: 0, mcq: { c: 0, w: 0, t: 0 }, ar: { c: 0, w: 0, t: 0 }, case:{ c: 0, w: 0, t: 0 } };
    quizState.questions.forEach(q => {
        const type = q.question_type.toLowerCase();
        const isCorrect = quizState.userAnswers[q.id] === q.correct_answer;
        const cat = type.includes("ar") ? "ar" : type.includes("case") ? "case" : "mcq";
        stats[cat].t++; if (isCorrect) { stats.correct++; stats[cat].c++; } else { stats[cat].w++; }
    });
    UI.renderResults(stats, quizState.difficulty);
    saveResult({ ...quizState, score: stats.correct, total: stats.total, topic: quizState.topicSlug });
}

function attachDomEvents() {
    document.addEventListener("click", e => {
        const btn = e.target.closest("button, a");
        if (!btn) return;
        if (btn.id === "prev-btn") handleNavigation(-1);
        if (btn.id === "next-btn") handleNavigation(1);
        if (btn.id === "submit-btn") handleSubmit();
        if (btn.id === "btn-review-errors") UI.renderAllQuestionsForReview(quizState.questions, quizState.userAnswers);
        if (btn.id === "back-to-chapters-btn") window.location.href = `chapter-selection.html?subject=${encodeURIComponent(quizState.subject)}`;
    });
}

async function init() {
    UI.initializeElements(); parseUrlParameters(); attachDomEvents(); UI.attachAnswerListeners(handleAnswerSelection);
    try {
        await initializeServices();
        const btn = document.getElementById("google-signin-btn");
        if (btn) btn.onclick = async () => { await requireAuth(); location.reload(); };
        await initializeAuthListener(async user => {
            if (user) {
                UI.updateAuthUI(user);
                const access = await checkClassAccess(quizState.classId, quizState.subject);
                if (access.allowed) {
                    questionsPromise = fetchQuestions(quizState.topicSlug, quizState.difficulty);
                    await loadQuiz(); 
                } else { UI.hideStatus(); UI.showView("paywall-screen"); showExpiredPopup(access.reason); }
            } else { UI.showView("paywall-screen"); }
        });
    } catch (err) { console.error("Init failed:", err); UI.showStatus("System error.", "text-red-600"); }
}
document.addEventListener("DOMContentLoaded", init);
