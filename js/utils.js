// js/utils.js

/**
 * Aggressively cleans text by removing common Katex/LaTeX markers.
 * This is crucial for correctly rendering text that should not be processed
 * by a math renderer or for simple text cleanup.
 * * Markers removed:
 * 1. $$...$$ (Block math)
 * 2. $...$ (Inline math)
 * 3. $latex ... $ (Common WordPress/other platform markers)
 * * @param {string} text - The input text, potentially containing LaTeX markers.
 * @returns {string} The cleaned text.
 */
export function cleanKatexMarkers(text) {
    if (typeof text !== 'string') return '';

    // 1. Remove block math: $$...$$ (Non-greedy match)
    let cleanedText = text.replace(/\$\$[\s\S]*?\$\$/g, '');

    // 2. Remove $latex ... $ and other $...$ that are not escaped or are common math markers
    // This is an aggressive removal. It will remove simple dollar signs if they enclose content.
    // For general quiz text, this is a safe simplification.
    cleanedText = cleanedText.replace(/\$latex\s*[^$]*?\s*\$/gi, ''); // $latex ... $
    cleanedText = cleanedText.replace(/\$[^$]*?\$/g, ''); // $...$ (Inline math)

    // Optional: Clean up excessive whitespace created by removal
    cleanedText = cleanedText.trim().replace(/\s+/g, ' ');

    return cleanedText;
}

/**
 * Helper to capitalize the first letter of a string.
 * @param {string} s - The input string.
 * @returns {string} The capitalized string.
 */
export function capitalizeFirstLetter(s) {
    if (typeof s !== 'string' || s.length === 0) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Normalizes subject names from various inputs (data object or string).
 * @param {Object|string} input - The data object containing subject/topic or the subject string itself.
 * @returns {string} The normalized subject name (Mathematics, Science, Social Science, or General).
 */
export function normalizeSubject(input) {
    let sub = "";
    let slug = "";

    if (typeof input === 'string') {
        sub = input.toLowerCase();
    } else if (input && typeof input === 'object') {
        sub = (input.subject || "").toLowerCase();
        slug = (input.topicSlug || input.topic || "").toLowerCase();
    }

    if (sub.includes("math") || sub.includes("algebra") || sub.includes("geometry")) return "Mathematics";
    if (sub.includes("science") || sub.includes("physics") || sub.includes("chem") || sub.includes("bio")) return "Science";
    if (sub.includes("social")) return "Social Science";

    // Fallback: Check topicSlug if provided
    if (slug) {
        if (slug.includes("triangle") || slug.includes("polynomial") || slug.includes("probability") || slug.includes("math") || slug.includes("algebra") || slug.includes("geo")) return "Mathematics";
        if (slug.includes("motion") || slug.includes("gravitation") || slug.includes("force") || slug.includes("atom") || slug.includes("science") || slug.includes("physics") || slug.includes("chem") || slug.includes("bio")) return "Science";
        if (slug.includes("history") || slug.includes("civics") || slug.includes("social") || slug.includes("geography") || slug.includes("economics")) return "Social Science";
    }

    // If input was just a string and didn't match, return it capitalized (or "General")
    if (typeof input === 'string' && sub) {
        return input.charAt(0).toUpperCase() + input.slice(1);
    }

    return "General";
}

/**
 * Formats a technical slug into a readable chapter name.
 * e.g. science_gravitation_9_quiz -> Gravitation
 * @param {string} slug - The slug to format.
 * @returns {string} The formatted chapter name.
 */
export function formatChapterName(slug) {
    if (!slug) return "General Quiz";

    // science_gravitation_9_quiz -> gravitation
    let parts = slug.replace("_quiz", "").split("_");

    // Remove the subject prefix and grade suffix if format is standard (>= 3 parts)
    // e.g. [science, gravitation, 9] -> [gravitation]
    // Check if first part is a known subject prefix to be safer
    const knownPrefixes = ["science", "math", "social", "history", "geo", "civics", "physics", "chemistry", "biology"];
    if (parts.length >= 3 && knownPrefixes.includes(parts[0].toLowerCase())) {
        parts = parts.slice(1, -1);
    } else if (parts.length === 2 && !isNaN(parts[parts.length-1])) {
            // e.g. gravitation_9 -> gravitation
            parts.pop();
    }

    // Join and remove duplicate words (e.g., "Gravitation Gravitation")
    let name = parts.join(" ");
    return [...new Set(name.split(" "))].join(" ").replace(/\b\w/g, l => l.toUpperCase());
}
