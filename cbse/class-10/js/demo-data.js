// cbse/class-9/js/demo-data.js

export const DEMO_DATA = {
    schoolName: "Greenwood International School (Demo)",
    principal: {
        name: "Dr. Anjali Sharma",
        email: "demo.principal@ready4exam.com",
        alerts: [
            { id: 1, type: "critical", msg: "Class 9B Math Average dropped below 65%", date: "Today" },
            { id: 2, type: "warning", msg: "3 Students in 9C stuck in 'Remedial Loop'", date: "Yesterday" },
            { id: 3, type: "info", msg: "Term 1 Prep: 85% participation rate", date: "2 days ago" }
        ]
    },
    // New: Grade-Wide Aggregation for Executive Dashboard
    gradeReport: [
        { grade: 6, accuracy: 88, completion: 92, peak: "Fractions", friction: "Decimals", risk: 0 },
        { grade: 7, accuracy: 91, completion: 85, peak: "Integers", friction: "Data Handling", risk: 1 },
        { grade: 8, accuracy: 84, completion: 78, peak: "Algebra", friction: "Mensuration", risk: 3 },
        { grade: 9, accuracy: 62, completion: 45, peak: "Polynomials", friction: "Algebra", risk: 12 }, // Conceptual Friction
        { grade: 10, accuracy: 94, completion: 98, peak: "Geometry", friction: "Trigonometry", risk: 0 }, // Peak
        { grade: 11, accuracy: 72, completion: 60, peak: "Thermodynamics", friction: "Rotational Motion", risk: 8 },
        { grade: 12, accuracy: 58, completion: 40, peak: "Optics", friction: "Calculus", risk: 15 } // Conceptual Friction
    ],
    teachers: [
        { id: "t1", name: "Mr. Rajesh Kumar", subject: "Mathematics", classes: ["9A", "9B"], performance: 78 },
        { id: "t2", name: "Ms. Priya Singh", subject: "Science", classes: ["9C", "9D"], performance: 82 },
        { id: "t3", name: "Mr. Ahmed Khan", subject: "Social Science", classes: ["9A", "9C"], performance: 74 },
        { id: "t4", name: "Mrs. Linda D'Souza", subject: "English", classes: ["9B", "9D"], performance: 88 }
    ],
    sections: {
        "9A": { avgScore: 72, riskCount: 5, activeChapter: "Polynomials" },
        "9B": { avgScore: 64, riskCount: 12, activeChapter: "Polynomials" },
        "9C": { avgScore: 81, riskCount: 2, activeChapter: "Force and Laws of Motion" },
        "9D": { avgScore: 79, riskCount: 3, activeChapter: "Force and Laws of Motion" }
    },
    students: [
        { id: "s1", name: "Aarav Gupta", class: "9A", status: "At Risk", mastery: 55 },
        { id: "s2", name: "Ishaan Verma", class: "9B", status: "Advanced", mastery: 92 },
        { id: "s3", name: "Neha Patel", class: "9C", status: "Improving", mastery: 74 },
        { id: "s4", name: "Riya Sharma", class: "9B", status: "Remedial", mastery: 45 }
    ]
};

export function loadDemoDashboard(role) {
    console.log(`Loading Demo Dashboard for ${role}...`);
    window.__DEMO_MODE__ = true;
    return DEMO_DATA;
}
