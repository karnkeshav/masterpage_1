import { initializeServices, getInitializedClients } from "./config.js"; 
import { fetchQuestions, saveResult, getChapterMastery } from "./api.js";
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
    quizState.classId = params.get("class") || "6";
    quizState.subject = params.get("subject") || "Physics";

    // Check for Term Prep Mode
    const mode = params.get("mode");
    if (mode === "term_prep") {
        quizState.quizMode = "term_prep";
        quizState.topicSlug = params.get("chapters"); // Comma separated list
        UI.updateHeader(`Term Prep: ${quizState.subject}`, quizState.difficulty);
        return;
    }

    quizState.topicSlug = params.get("table") || params.get("topic") || "";

    // A. TRY TO GET EXACT CHAPTER NAME FROM URL
    let displayChapter = params.get("chapter_name");

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
        // Block 'Advanced' if 'Medium' mastery < 85%
        if (quizState.difficulty === "Advanced" && quizState.quizMode === "standard") {
            const { auth } = getInitializedClients();
            const mastery = await getChapterMastery(auth.currentUser.uid, quizState.topicSlug);
            if (mastery < 85) {
                alert(`🔒 LOCKED: You scored ${mastery}% on Medium.\nYou need 85% mastery to unlock Advanced questions.`);
                // Redirect back
                const subject = quizState.subject || "Physics";
                window.location.href = `chapter-selection.html?subject=${encodeURIComponent(subject)}`;
                return;
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
        ar:  { c: 0, w: 0, t: 0 },
        case:{ c: 0, w: 0, t: 0 }
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
    if (percentage < 85) {
        // Trigger Mistake Notebook
        setTimeout(() => {
            alert("⚠️ Mastery Alert: Score below 85%.\nOpening Mistake Notebook for remediation.");
            UI.renderAllQuestionsForReview(quizState.questions, quizState.userAnswers);
        }, 1000);
    }

    saveResult({ 
        ...quizState, 
        score: stats.correct, 
        total: stats.total,
        topic: quizState.topicSlug,
        latency_vector: quizState.latency,
        quiz_mode: quizState.quizMode
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
            // Check mode to return to correct page
            const params = new URLSearchParams(location.search);
            if (params.get("mode") === "term_prep") {
                window.location.href = `chapter-selection.html?mode=term_prep&subject=${encodeURIComponent(subject)}`;
            } else {
                window.location.href = `chapter-selection.html?subject=${encodeURIComponent(subject)}`;
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
    parseUrlParameters(); // Sets the Header
    attachDomEvents();
    UI.attachAnswerListeners(handleAnswerSelection);

    try {
        await initializeServices();
        wireGoogleLogin();

        // Check Auth & Access
        await initializeAuthListener(async user => {
            if (user) {
                UI.updateAuthUI(user);

                const access = await checkClassAccess(quizState.classId, quizState.subject);
                
                if (access.allowed) {
                    questionsPromise = fetchQuestions(quizState.topicSlug, quizState.difficulty);
                    await loadQuiz(); 
                } else {
                    UI.hideStatus();
                    UI.showView("paywall-screen"); 
                    showExpiredPopup(access.reason);
                }
            } else {
                UI.showView("paywall-screen");
            }
        });
    } catch (err) {
        console.error("Initialization failed:", err);
        UI.showStatus("System error during startup.", "text-red-600");
    }
}

document.addEventListener("DOMContentLoaded", init);
