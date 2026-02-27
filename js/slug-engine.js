export class SlugEngine {
    constructor(curriculum) {
        this.curriculum = curriculum || {};
    }

    /**
     * CANONICAL SLUGGER (from gemini_frontend.js)
     * Replaces all non-alphanumeric chars with underscores.
     */
    createSlug(text) {
        if (!text) return "";
        return text.toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
    }

    /**
     * GENERATOR: Firestore Document ID (ncert_summaries)
     * Format: grade_subjectSlug_topicSlug
     * Example: 9_social_science_the_french_revolution
     */
    getFirestoreId(grade, subject, topic) {
        const s = this.createSlug(subject);
        const t = this.createSlug(topic);
        return `${grade}_${s}_${t}`;
    }

    /**
     * GENERATOR: Supabase Table Slug (Quiz Questions)
     * Format: subject_firstLast_grade_quiz
     * Example: mathematics_polynomials_polynomials_9_quiz
     */
    getQuizTableSlug(grade, subject, topic) {
        const s = this.createSlug(subject);
        const words = this.createSlug(topic).split("_").filter(w => w);

        // Apply "First_Last" Rule
        const topicSegment = words.length >= 2
            ? `${words[0]}_${words[words.length - 1]}`
            : `${words[0]}_${words[0]}`;

        return `${s}_${topicSegment}_${grade}_quiz`;
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
        const THEMES = {
            "Mathematics": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: "fa-calculator", bar: "bg-blue-500" },
            "Science": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", icon: "fa-flask", bar: "bg-purple-500" },
            "Social Science": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: "fa-landmark", bar: "bg-amber-500" },
            "General": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", icon: "fa-cubes", bar: "bg-slate-500" }
        };
        return { subject, section, chapterName, theme: THEMES[subject] || THEMES["General"] };
    }
}
