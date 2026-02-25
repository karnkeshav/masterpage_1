/**
 * Ready4Exam Remediation & Mastery Engine
 * Standardized logic for Slug Decoding, Tier Calculation, and Study Handshakes.
 */

export const RemediationEngine = {
    // 1. Convert slug (e.g., "9_math_polynomials") to Readable Labels
    decodeSlug(slug) {
        if (!slug) return { grade: 'N/A', subject: 'Unknown', chapter: 'Unknown' };
        const parts = slug.split('_');
        const grade = parts[0] || '9';
        const rawSub = parts[1] || '';
        const rawChap = parts.slice(2).join(' ') || 'General';

        const subjectMap = { 'math': 'Mathematics', 'sci': 'Science', 'sst': 'Social Science' };
        return {
            grade,
            subject: subjectMap[rawSub] || rawSub.charAt(0).toUpperCase() + rawSub.slice(1),
            chapter: rawChap.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        };
    },

    // 2. Determine Subject Status based on Mastery Depth
    // Thresholds: >30% Advanced = Challenger | >40% Medium = Standard
    getTierStatus(masteryData) {
        const { simpleCount, mediumCount, advancedCount, totalChapters } = masteryData;
        if (totalChapters === 0) return 'Foundational';

        const advPerc = (advancedCount / totalChapters) * 100;
        const medPerc = (mediumCount / totalChapters) * 100;

        if (advPerc > 30) return 'Challenger';
        if (medPerc > 40) return 'Standard';
        return 'Foundational';
    },

    // 3. Generate the Study Content URL Handshake
    getStudyURL(slug) {
        const decoded = this.decodeSlug(slug);
        const subjectParam = encodeURIComponent(decoded.subject);
        const chapterParam = encodeURIComponent(decoded.chapter);
        return `../study-content.html?grade=${decoded.grade}&subject=${subjectParam}&chapter=${chapterParam}`;
    }
};
