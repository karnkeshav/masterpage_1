
const GRADE_MAP = {
    "6": "./class-6.js",
    "7": "./class-7.js",
    "8": "./class-8.js",
    "9": "./class-9.js",
    "10": "./class-10.js",
    "11": "./class-11.js",
    "12": "./class-12.js"
};

/**
 * Dynamically loads the curriculum for a specific grade.
 * @param {string|number} grade - The grade level (e.g., 9, "10").
 * @returns {Promise<Object>} - The curriculum object.
 */
export async function loadCurriculum(grade) {
    const gradeKey = grade.toString();
    if (!GRADE_MAP[gradeKey]) {
        throw new Error(`Curriculum for Grade ${grade} not found.`);
    }

    try {
        // Dynamic import relative to this file
        const module = await import(GRADE_MAP[gradeKey]);
        return module.default || module.curriculum;
    } catch (error) {
        console.error(`Failed to load curriculum for Grade ${grade}:`, error);
        throw error;
    }
}

/**
 * Helper to get the current grade from URL parameters.
 * Defaults to "9" if not found.
 */
export function getGradeFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("grade") || "9";
}
