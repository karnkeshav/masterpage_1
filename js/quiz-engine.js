import { initializeServices, getInitializedClients } from "./config.js";
import { fetchQuestions, saveResult, getChapterMastery, saveMistakes } from "./api.js";
import * as UI from "./ui-renderer.js";
import { initializeAuthListener, requireAuth } from "./auth-paywall.js";
import { showExpiredPopup } from "./firebase-expiry.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/* -----------------------------------
    1. STRICT GATEKEEPER (Security)
----------------------------------- */
export async function checkClassAccess(classId, subject) {
    try {
        const { auth, db } = getInitializedClients();

        const user = auth.currentUser;
        if (!user) return { allowed: false, reason: "no_user" };

        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
            return { allowed: false, reason: "no_record" };
        }

        const data = snap.data();

        // Admin Bypass
        const ADMIN_EMAILS = ["keshav.karn@gmail.com", "ready4urexam@gmail.com"];
        if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
            return { allowed: true };
        }

        // Logic: Check Active Classes
        const paidClasses = data.paidClasses || {};
        const isClassActive = paidClasses[classId.toString()] === true;
        const lockedClasses = Object.keys(paidClasses).filter(key => paidClasses[key] === true);
        const isLockedToSomething = lockedClasses.length > 0;

        if (isClassActive) {
            return { allowed: true };
        }
        else if (isLockedToSomething) {
            console.log(`User is locked to Class ${lockedClasses[0]}, but requested Class ${classId}`);
            return { allowed: false, reason: "exclusive_member" };
        }
        else {
            try {
                // Auto-lock new student to this class
                await updateDoc(userRef, {
                    [`paidClasses.${classId}`]: true
                });
                console.log(`Auto-locked user to Class ${classId}`);
                return { allowed: true };
            } catch (err) {
                console.error("Auto-lock failed:", err);
                return { allowed: false, reason: "write_error" };
            }
        }
    } catch (error) {
        console.error("Access Check Failed:", error);
        return { allowed: false, reason: "error" };
    }
}

let quizState = {
    classId: "",
    subject: "",
    topicSlug: "",
    difficulty: "",
    questions: [],
    currentQuestionIndex: 0,
    userAnswers: {},
    isSubmitted: false,
    quizMode: "standard",
    latency: [],
    lastActionTime: 0
};

let questionsPromise = null;

/* -----------------------------------
    2. HEADER & URL PARSING (Fixed)
----------------------------------- */
function parseUrlParameters() {
    const params = new URLSearchParams(location.search);

    quizState.difficulty = params.get("difficulty") || "Simple";
    // Important: Prefer 'grade' param over 'class' as that's what Class Hub sends
    quizState.classId = params.get("grade") || params.get("class") || "9";
    quizState.subject = params.get("subject") || "Physics";

    // Check for Term Prep Mode
    const mode = params.get("mode");
    if (mode === "term_prep") {
        quizState.quizMode = "term_prep";
        quizState.topicSlug = params.get("chapters"); // Comma separated list
        UI.updateHeader(`Term Prep: ${quizState.subject}`, quizState.difficulty);
        return;
    }

    const explicitTable = params.get("table");
    const fallbackTopic = params.get("topic") || params.get("topicSlug") || "";

    // The 'table' param is the exact Supabase ID. Old links might only have 'topic'
    quizState.topicSlug = explicitTable || fallbackTopic;

    // Safety Check: Redirect if missing critical params
    if (!quizState.topicSlug) {
        alert("System Error: No quiz topic specified. Returning to dashboard.");
        window.location.href = "consoles/student.html";
        return;
    }

    // A. TRY TO GET EXACT CHAPTER NAME FROM URL
    // If explicitTable exists, the 'topic' parameter contains the human-readable chapter name!
    let displayChapter = params.get("chapter_name") || (explicitTable ? fallbackTopic : "");

    // B. FALLBACK: IF NO NAME IN URL, CLEAN THE ID
    if (!displayChapter) {
        displayChapter = quizState.topicSlug
            .replace(/[_-]/g, " ") // Replace underscores/dashes with space
            .replace(/quiz|worksheet/ig, "") // Remove 'quiz' to avoid "Set Set"
            .trim();

        // Remove Subject if it's in the name (e.g. "Physics Motion" -> "Motion")
        const subjectRegex = new RegExp(`^${quizState.subject}\\s*`, "i");
        displayChapter = displayChapter.replace(subjectRegex, "").trim();
    } else {
        // Decode URI (e.g., "Force%20and%20Motion" -> "Force and Motion")
        displayChapter = decodeURIComponent(displayChapter);
    }

    // C. FORMATTING
    // Title Case
    displayChapter = displayChapter.replace(/\b\w/g, c => c.toUpperCase());
    // Fix "And" to "and"
    displayChapter = displayChapter.replace(/\bAnd\b/g, "and");

    // D. SET HEADER: Class : Subject - Chapter Name Worksheet
    const fullTitle = `Class ${quizState.classId} : ${quizState.subject} - ${displayChapter} Worksheet`;

    UI.updateHeader(fullTitle, quizState.difficulty);
}

/* -----------------------------------
    3. LOAD QUIZ
----------------------------------- */
async function loadQuiz() {
    try {
        UI.showStatus("Preparing worksheet...", "text-blue-600 font-bold");

        // --- FORTRESS PHILOSOPHY: GATEKEEPER ---
        // Block 'Advanced' if 'Medium' mastery < 85% (Skip if Guest Mode)
        const urlParams = new URLSearchParams(window.location.search);
        const isGuestMode = urlParams.get("mode") === "guest";
        if (quizState.difficulty === "Advanced" && quizState.quizMode === "standard" && !isGuestMode) {
            const { auth } = getInitializedClients();
            if (auth.currentUser) {
                const mastery = await getChapterMastery(auth.currentUser.uid, quizState.topicSlug);
                if (mastery < 85) {
                    // VISUAL INTELLIGENCE: Peel Back Animation
                    UI.triggerPeelBack("quiz-content");

                    alert(`🔒 LOCKED: You scored ${mastery}% on Medium.\nYou need 85% mastery to unlock Advanced questions.`);
                    // Redirect back
                    const subject = quizState.subject || "Physics";
                    window.location.href = `curriculum.html?grade=${quizState.classId}&subject=${encodeURIComponent(subject)}`;
                    return;
                }
            }
        }

        const processedQuestions = await questionsPromise;
        quizState.questions = processedQuestions;

        if (quizState.questions.length > 0) {
            UI.hideStatus();

            // Init Performance Vector
            quizState.latency = new Array(quizState.questions.length).fill(0);
            quizState.lastActionTime = Date.now();

            renderQuestion();
            UI.showView("quiz-content");
        }
    } catch (e) {
        UI.showStatus(`Error: ${e.message}`, "text-red-600");
    }
}

/* -----------------------------------
    4. RENDER QUESTION
----------------------------------- */
function renderQuestion() {
    const q = quizState.questions[quizState.currentQuestionIndex];
    UI.renderQuestion(
        q,
        quizState.currentQuestionIndex + 1,
        quizState.userAnswers[q.id],
        quizState.isSubmitted
    );
    UI.updateNavigation(
        quizState.currentQuestionIndex,
        quizState.questions.length,
        quizState.isSubmitted
    );
}

function updateLatency() {
    const now = Date.now();
    const diff = (now - quizState.lastActionTime) / 1000; // in seconds
    quizState.latency[quizState.currentQuestionIndex] += diff;
    quizState.lastActionTime = now;
}

/* -----------------------------------
    5. ANSWER HANDLERS
----------------------------------- */
function handleAnswerSelection(id, opt) {
    if (!quizState.isSubmitted) {
        updateLatency();
        quizState.userAnswers[id] = opt;
        renderQuestion();
    }
}

function handleNavigation(delta) {
    updateLatency();
    quizState.currentQuestionIndex += delta;
    renderQuestion();
}

/* -----------------------------------
    6. SUBMIT & RESULTS
----------------------------------- */
async function handleSubmit() {
    updateLatency();
    quizState.isSubmitted = true;

    const stats = {
        total: quizState.questions.length,
        correct: 0,
        mcq: { c: 0, w: 0, t: 0 },
        ar: { c: 0, w: 0, t: 0 },
        case: { c: 0, w: 0, t: 0 }
    };

    quizState.questions.forEach(q => {
        const type = q.question_type.toLowerCase();
        const isCorrect = quizState.userAnswers[q.id] === q.correct_answer;
        const cat = type.includes("ar") ? "ar" : type.includes("case") ? "case" : "mcq";

        stats[cat].t++;
        if (isCorrect) {
            stats.correct++;
            stats[cat].c++;
        } else {
            stats[cat].w++;
        }
    });

    UI.renderResults(stats, quizState.difficulty);

    // --- CLOSED-LOOP REMEDIATION ---
    const percentage = (stats.correct / stats.total) * 100;

    // Generate a shared session ID so quiz_scores and mistake_notebook
    // documents can be reliably joined in mistake-book.html by session_id
    // instead of the previous fragile 5-second timestamp heuristic.
    const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Build real per-type totals from the actual questions in this quiz.
    // This replaces the hardcoded 6/2/2 MCQ/AR/CB assumption in mistake-book.html.
    const typeStats = {
        mcq: stats.mcq.t,
        ar: stats.ar.t,
        cb: stats.case.t
    };

    if (percentage < 85) {
        // Save to Mistake Notebook — now passes difficulty and session_id
        saveMistakes(
            quizState.questions,
            quizState.userAnswers,
            quizState.topicSlug,
            quizState.classId,
            quizState.difficulty,  // fixes: difficulty was never passed before
            sessionId               // links to the quiz_scores document
        );

        // Trigger In-Page Review
        setTimeout(() => {
            alert("⚠️ Mastery Alert: Score below 85%.\nQuestions have been added to your Mistake Notebook.");
            // VISUAL INTELLIGENCE: Focus Mode
            UI.toggleFocusMode(true);
            UI.renderAllQuestionsForReview(quizState.questions, quizState.userAnswers);
        }, 1000);
    }

    saveResult({
        ...quizState,
        score: stats.correct,
        total: stats.total,
        topic: quizState.topicSlug,
        latency_vector: quizState.latency,
        quiz_mode: quizState.quizMode,
        session_id: sessionId,  // links to the mistake_notebook document
        typeStats               // real per-type counts for proficiency profile
    });
}

/* -----------------------------------
    7. EVENTS
----------------------------------- */
function attachDomEvents() {
    document.addEventListener("click", e => {
        const btn = e.target.closest("button, a");
        if (!btn) return;

        if (btn.id === "prev-btn") handleNavigation(-1);
        if (btn.id === "next-btn") handleNavigation(1);
        if (btn.id === "submit-btn") handleSubmit();
        if (btn.id === "btn-review-errors") {
            UI.renderAllQuestionsForReview(quizState.questions, quizState.userAnswers);
        }
        if (btn.id === "back-to-chapters-btn") {
            const subject = quizState.subject || "Physics";
            const grade = quizState.classId || "9";
            // Check mode to return to correct page
            const params = new URLSearchParams(location.search);
            if (params.get("mode") === "term_prep") {
                window.location.href = `curriculum.html?grade=${grade}&mode=term_prep&subject=${encodeURIComponent(subject)}`;
            } else {
                window.location.href = `curriculum.html?grade=${grade}&subject=${encodeURIComponent(subject)}`;
            }
        }
    });
}

function wireGoogleLogin() {
    const btn = document.getElementById("google-signin-btn");
    if (btn) {
        btn.onclick = async () => {
            await requireAuth();
            location.reload();
        };
    }
}

/* -----------------------------------
    8. INITIALIZATION
----------------------------------- */
async function init() {
    UI.initializeElements();
    parseUrlParameters();
    attachDomEvents();
    UI.attachAnswerListeners(handleAnswerSelection);

    const urlParams = new URLSearchParams(window.location.search);
    const isGuestMode = urlParams.get("mode") === "guest";

    // GUEST GATE: Guests are restricted to Simple difficulty only.
    // Redirect to login page if a guest tries Medium or Advanced via URL.
    if (isGuestMode && quizState.difficulty !== "Simple") {
        window.location.href = "../offering.html";
        return;
    }

    try {
        await initializeServices();
        wireGoogleLogin();

        await initializeAuthListener(async user => {
            if (user) {
                UI.updateAuthUI(user);
                questionsPromise = fetchQuestions(quizState.topicSlug, quizState.difficulty);
                await loadQuiz();
            } else if (isGuestMode) {
                // Guest mode: skip paywall, load quiz directly
                questionsPromise = fetchQuestions(quizState.topicSlug, quizState.difficulty);
                await loadQuiz();
            } else {
                UI.showView("paywall-screen");
            }
        });
    } catch (err) {
        console.error("Initialization failed:", err);
        UI.showStatus("System error during startup.", "text-red-600");
    }
}

if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
