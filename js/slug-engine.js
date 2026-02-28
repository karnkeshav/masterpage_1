export class SlugEngine {
    constructor(curriculum) {
        this.curriculum = curriculum || {};
        // Ported exactly from manageSupabase.js, added 'and' for "surface areas and volumes" -> "surface_volumes"
        this.SKIP_WORDS = ["as","of","the","a","an","in","on","for","to","and","ki","ke","ka"];
        // Legacy: Expose themes for UI compatibility (e.g., app/study-content.html)
        this.themes = {
            "Mathematics": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: "fa-calculator", bar: "bg-blue-500" },
            "Science": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", icon: "fa-flask", bar: "bg-purple-500" },
            "Social Science": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: "fa-landmark", bar: "bg-amber-500" },
            "General": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", icon: "fa-cubes", bar: "bg-slate-500" }
        };
    }

    /** CANONICAL SLUGGER: Mirrors gemini_frontend.js */
    createSlug(text) {
        if (!text) return "";
        return text.toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
    }

    /** SMART LOOKUP: Finds the official NCERT title from curriculum.js */
    getOfficialTitle(subject, chapter) {
        const target = this.createSlug(chapter);
        const subjectNode = this.curriculum[subject];
        if (!subjectNode) return chapter;

        const allChapters = Array.isArray(subjectNode) ? subjectNode : Object.values(subjectNode).flat();
        const match = allChapters.find(ch =>
            this.createSlug(ch.chapter_title).includes(target) ||
            target.includes(this.createSlug(ch.chapter_title))
        );
        return match ? match.chapter_title : chapter;
    }

    /** GENERATOR: Supabase Table Slug (Mirror of manageSupabase.js) */
    getQuizTableSlug(grade, subject, topic) {
        let sPart = (subject || "").toLowerCase().trim().split(" ")[0]; 
        if ((subject || "").toLowerCase().includes("social")) sPart = "social";

        // Let's use the official curriculum string so we filter the exact words they generated from
        const officialTopic = this.getOfficialTitle(subject, topic);
        const chapter = (officialTopic || topic || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
        const words = chapter.split(" ").filter(Boolean);
        const filtered = words.filter(w => !this.SKIP_WORDS.includes(w));
        
        const finalWords = filtered.length > 0 ? filtered : words;
        const first = finalWords[0] || "ch";
        const last = finalWords[finalWords.length - 1] || "x"; // If 1 word, first and last are the same
        
        return `${sPart}_${first}_${last}_${grade}_quiz`;
    }

    /** GENERATOR: Firestore Document ID (Mirror of gemini_frontend.js) */
    getFirestoreId(grade, subject, topic) {
        let sClean = this.createSlug(subject);
        const socialBooks = ["geography", "history", "civics", "economics", "political_science", "social"];
        if (socialBooks.includes(sClean) || sClean.includes("social")) sClean = "social_science";
        if (sClean === "maths" || sClean === "math") sClean = "mathematics";

        const officialTopic = this.getOfficialTitle(subject, topic);
        return `${grade}_${sClean}_${this.createSlug(officialTopic)}`;
    }

    /**
     * PARSER: Determines Subject context from any slug or raw text
     */
    getSubjectContext(topicSlug) {
        const s = topicSlug.toLowerCase();
        let subject = "General";
        let section = "General";
        let chapterName = topicSlug.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());

        for (const [subj, sections] of Object.entries(this.curriculum)) {
            for (const [sec, chapters] of Object.entries(sections)) {
                for (const ch of chapters) {
                    const title = ch.chapter_title.toLowerCase();
                    if (s.includes(title) || title.includes(s.replace(/_/g, " "))) {
                        subject = subj;
                        section = sec;
                        chapterName = ch.chapter_title;
                        return this._formatContext(subject, section, chapterName);
                    }
                }
            }
        }

        if (s.includes("math")) { subject = "Mathematics"; section = "Algebra"; }
        else if (s.includes("science")) { subject = "Science"; section = "Physics"; }
        else if (s.includes("social")) { subject = "Social Science"; section = "History"; }

        return this._formatContext(subject, section, chapterName);
    }

    _formatContext(subject, section, chapterName) {
        // Use constructor themes if available, else fallback
        const theme = (this.themes && this.themes[subject]) ? this.themes[subject] : this.themes["General"];
        return { subject, section, chapterName, theme };
    }

    /**
     * Analyzes attempt history for a specific topic.
     * @param {Array} scores - Array of score objects { mistakes: [{id, question}], timestamp: Date/Object }
     * @param {string} topicSlug
     * @returns {object} { friction: [], victory: [] }
     */
    analyzeAttemptHistory(scores, topicSlug) {
        // Sort by timestamp desc (newest first)
        const attempts = scores.sort((a, b) => {
            const tA = a.timestamp instanceof Date ? a.timestamp.getTime() : (a.timestamp?.toMillis ? a.timestamp.toMillis() : 0);
            const tB = b.timestamp instanceof Date ? b.timestamp.getTime() : (b.timestamp?.toMillis ? b.timestamp.toMillis() : 0);
            return tB - tA;
        });

        if (attempts.length === 0) return { friction: [], victory: [] };

        const latest = attempts[0];
        const latestMistakes = new Set(latest.mistakes?.map(m => m.id) || []);

        const frictionMap = new Map();
        const victoryMap = new Map();

        // 1. Friction: Must be in latest. Check how many consecutive previous attempts also have it.
        latest.mistakes?.forEach(m => {
            const history = [latest.timestamp];
            let isPersistent = false;

            // Check previous attempts
            for (let i = 1; i < attempts.length; i++) {
                const prev = attempts[i];
                const prevMistakes = new Set(prev.mistakes?.map(pm => pm.id) || []);
                if (prevMistakes.has(m.id)) {
                    history.push(prev.timestamp);
                    isPersistent = true; // At least one previous consecutive miss
                } else {
                    break; // Streak broken
                }
            }

            if (isPersistent) {
                frictionMap.set(m.id, {
                    id: m.id,
                    text: m.question,
                    timestamps: history, // All consecutive timestamps
                    topic: topicSlug
                });
            }
        });

        // 2. Victory: NOT in latest, but WAS in previous (attempts[1]).
        if (attempts.length > 1) {
            const previous = attempts[1];
            previous.mistakes?.forEach(m => {
                if (!latestMistakes.has(m.id)) {
                    // It was missed in previous, but passed in latest.
                    victoryMap.set(m.id, {
                        id: m.id,
                        text: m.question,
                        masteryDate: latest.timestamp instanceof Date ? latest.timestamp.toDateString() : (latest.timestamp?.toDate ? latest.timestamp.toDate().toDateString() : "Just now"),
                        topic: topicSlug
                    });
                }
            });
        }

        return {
            friction: Array.from(frictionMap.values()),
            victory: Array.from(victoryMap.values())
        };
    }
}
