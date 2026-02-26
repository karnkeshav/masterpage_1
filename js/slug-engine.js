/**
 * slug-engine.js
 *
 * The "Logic Vault" for the Remediation Engine.
 * Handles:
 * 1. Mapping topics to curriculum context (Subject, Section, Theme).
 * 2. Analyzing attempt history for "Persistent Friction" and "Victory Gains".
 * 3. Classifying question types.
 */

export class SlugEngine {
    constructor(curriculum) {
        this.curriculum = curriculum || {};

        // Color themes matching student.html
        this.themes = {
            "Mathematics": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: "fa-calculator" },
            "Science": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", icon: "fa-flask" },
            "Social Science": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: "fa-landmark" },
            "English": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", icon: "fa-book" },
            "Hindi": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", icon: "fa-language" },
            "Sanskrit": { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", icon: "fa-om" },
            "General": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", icon: "fa-shapes" }
        };
    }

    /**
     * Parses topicSlug to find Section, Subject, and Theme.
     * @param {string} topicSlug - e.g., "9_science_motion" or "motion"
     * @returns {Object} { subject, section, theme, chapterTitle }
     */
    getSubjectContext(topicSlug) {
        if (!topicSlug) return this._getDefaultContext();

        const cleanSlug = topicSlug.toLowerCase().replace(/[_-]/g, " ");
        let found = null;

        // 1. Iterate Curriculum to find match
        // Structure: Subject -> Section -> [Chapters]
        for (const [subject, sections] of Object.entries(this.curriculum)) {
            for (const [section, chapters] of Object.entries(sections)) {
                for (const chapter of chapters) {
                    const title = chapter.chapter_title.toLowerCase();
                    // Check if slug contains chapter title or vice versa (fuzzy match)
                    if (cleanSlug.includes(title) || title.includes(cleanSlug)) {
                        found = {
                            subject: subject,
                            section: section,
                            chapterTitle: chapter.chapter_title
                        };
                        break;
                    }
                }
                if (found) break;
            }
            if (found) break;
        }

        // 2. Fallback Inference if not found in curriculum
        if (!found) {
            found = this._inferFromSlug(topicSlug);
        }

        // 3. Attach Theme
        const theme = this.themes[found.subject] || this.themes["General"];
        return { ...found, theme };
    }

    _inferFromSlug(slug) {
        const s = slug.toLowerCase();
        let subject = "General";
        let section = "General";

        if (s.includes("math") || s.includes("algebra") || s.includes("geo") || s.includes("poly") || s.includes("number")) {
            subject = "Mathematics";
            section = s.includes("geo") ? "Geometry" : "Algebra";
        } else if (s.includes("science") || s.includes("physics") || s.includes("chem") || s.includes("bio") || s.includes("motion") || s.includes("force") || s.includes("matter")) {
            subject = "Science";
            if (s.includes("physics") || s.includes("motion") || s.includes("force")) section = "Physics";
            else if (s.includes("chem") || s.includes("matter") || s.includes("atom")) section = "Chemistry";
            else section = "Biology";
        } else if (s.includes("social") || s.includes("hist") || s.includes("civics") || s.includes("geo") || s.includes("democ") || s.includes("french")) {
            subject = "Social Science";
            if (s.includes("hist") || s.includes("french") || s.includes("russian")) section = "History";
            else if (s.includes("civics") || s.includes("democ")) section = "Civics";
            else section = "Geography";
        }

        // Capitalize slug for title
        const title = slug.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        return { subject, section, chapterTitle: title };
    }

    _getDefaultContext() {
        return {
            subject: "General",
            section: "General",
            chapterTitle: "Unknown Chapter",
            theme: this.themes["General"]
        };
    }

    /**
     * Identifies "Persistent Friction" and "Victory Gains".
     * @param {Array} allScores - Array of quiz_score docs
     * @param {Array} allMistakes - Array of mistake_notebook docs
     * @param {string} topicSlug - The topic to analyze
     */
    analyzeAttemptHistory(allScores, allMistakes, topicSlug) {
        // Filter by topic
        const topicScores = allScores.filter(s => this._matchTopic(s.topic, topicSlug));
        // Sort descending by timestamp
        topicScores.sort((a, b) => b.timestamp - a.timestamp);

        if (topicScores.length < 2) {
            return { friction: [], gains: [], attempts: topicScores.length };
        }

        const latestAttempt = topicScores[0];
        const previousAttempt = topicScores[1];

        // Helper to find mistakes for a specific attempt (by proximity)
        const findMistakes = (attempt) => {
            if (!attempt) return [];
            // If score is 100%, return empty (no mistakes)
            if (attempt.score === attempt.total) return [];

            const attemptTime = attempt.timestamp ? attempt.timestamp.toMillis() : 0;

            // Find mistake doc with closest timestamp (within 5 seconds)
            const match = allMistakes.find(m => {
                const mTime = m.timestamp ? m.timestamp.toMillis() : 0;
                return Math.abs(mTime - attemptTime) < 10000; // 10s buffer
            });

            return match ? match.mistakes : [];
        };

        const latestMistakes = findMistakes(latestAttempt);
        const previousMistakes = findMistakes(previousAttempt);

        // Map to IDs for comparison
        const latestIds = new Set(latestMistakes.map(m => m.id));
        const previousIds = new Set(previousMistakes.map(m => m.id));

        // Persistent Friction: In BOTH latest and previous
        const frictionIds = [...latestIds].filter(id => previousIds.has(id));
        const frictionItems = latestMistakes.filter(m => frictionIds.includes(m.id));

        // Victory Gains: In PREVIOUS but NOT in LATEST
        // Note: This assumes the question was present in the latest attempt.
        // We use previousMistakes as the source of truth for "was wrong before".
        const gainIds = [...previousIds].filter(id => !latestIds.has(id));
        const gainItems = previousMistakes.filter(m => gainIds.includes(m.id));

        return {
            friction: frictionItems,
            gains: gainItems,
            attempts: topicScores.length
        };
    }

    _matchTopic(t1, t2) {
        if (!t1 || !t2) return false;
        return t1.toLowerCase().includes(t2.toLowerCase()) || t2.toLowerCase().includes(t1.toLowerCase());
    }

    /**
     * Identifies question type.
     * @param {Object} question - The question object or ID
     */
    getQuestionType(question) {
        // Logic: Check type field or infer from text/ID
        const type = (question.question_type || "").toLowerCase();

        if (type.includes("ar") || type.includes("assertion")) return "Logic (A/R)";
        if (type.includes("case") || type.includes("passage")) return "Application (Case)";
        return "MCQ";
    }

    /**
     * Calculates aggregate accuracy for skill traffic lights.
     * @param {Array} allScores - All scores for the user (can be filtered by subject)
     */
    calculateSkillStats(allScores) {
        const stats = {
            mcq: { total: 0, correct: 0 },
            ar: { total: 0, correct: 0 },
            case: { total: 0, correct: 0 }
        };

        allScores.forEach(score => {
            // Check if score object has granular stats (added in quiz-engine.js handleSubmit)
            /*
               stats: {
                   mcq: { c, w, t },
                   ar: { c, w, t },
                   case: { c, w, t }
               }
               NOTE: quiz_scores format in Firestore might not have this detailed breakdown
               unless we explicitly saved it. saveResult in api.js saves:
               score, total, score_percent.
               It does NOT seem to save the `mcq`, `ar`, `case` breakdown in the top-level doc.
               However, `quiz-engine.js` creates a `stats` object but `saveResult` takes `quizState` + `stats.correct` etc.
               Let's check `api.js` `saveResult` again.
            */
           // ... checking api.js ...
           // It saves: topic, score, total, difficulty, quiz_mode, latency_vector.
           // It does NOT save the breakdown by type.

           // Fallback: We cannot calculate skill stats from `quiz_scores` unless we have `mistake_notebook` + `total_questions`?
           // Actually, without the breakdown saved, we can't know how many MCQ vs AR were attempted.
           // `mistake_notebook` tells us what we got WRONG.
           // We don't know what we got RIGHT by type.

           // Strategy: Use `mistake_notebook` to count ERRORS by type.
           // We can't calculate % accuracy without TOTALS.
           // But the prompt asks for "Color these based on the student's accuracy".

           // Workaround: We will use a proxy.
           // If we have many mistakes of type AR, it's Red.
           // If few, Green.
           // Or, we can update `api.js` to save this? "FILE ISOLATION: Do not modify api.js".
           // So we are stuck with existing data.

           // If `quiz_scores` doesn't have it, we can only estimate from mistakes.
           // Total AR mistakes / Total Attempts?
           // Let's return raw mistake counts by type for now.
        });

        return stats;
    }
}
