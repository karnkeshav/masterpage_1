
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
export async function loadCurriculum(grade, stream = null) {
    const gradeKey = grade.toString();
    if (!GRADE_MAP[gradeKey]) {
        throw new Error(`Curriculum for Grade ${grade} not found.`);
    }

    try {
        const module = await import(GRADE_MAP[gradeKey]);
        const curriculum = module.default || module.curriculum;

        // For Class 11 and 12, filter by stream if provided
        if ((gradeKey === '11' || gradeKey === '12') && stream) {
            const filtered = {};
            for (const [subject, subData] of Object.entries(curriculum)) {
                // If it is flat array, check the first chapter's section
                if (Array.isArray(subData) && subData.length > 0) {
                    if (subData[0].section && subData[0].section.toLowerCase() === stream.toLowerCase()) {
                        filtered[subject] = subData;
                    }
                } else if (typeof subData === 'object' && subData !== null) {
                    // Check nested books
                    const firstBook = Object.values(subData)[0];
                    if (firstBook && Array.isArray(firstBook) && firstBook.length > 0) {
                        if (firstBook[0].section && firstBook[0].section.toLowerCase() === stream.toLowerCase()) {
                            filtered[subject] = subData;
                        }
                    }
                }
            }
            if (Object.keys(filtered).length > 0) return filtered;
        }

        return curriculum;
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

/**
 * Flattens nested subject data into a single array of chapters.
 * @param {Array|Object} subjectData - The curriculum data for a specific subject.
 * @returns {Array} - A flat array of chapters.
 */
export function flattenSubject(subjectData) {
    if (Array.isArray(subjectData)) {
        return subjectData;
    }
    if (typeof subjectData === 'object' && subjectData !== null) {
        let flatArray = [];
        for (const key in subjectData) {
            if (Array.isArray(subjectData[key])) {
                flatArray = flatArray.concat(subjectData[key]);
            }
        }
        return flatArray;
    }
    return [];
}
