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
