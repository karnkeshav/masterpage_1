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
    // In a real app, this would replace the fetch calls or state
    // For now, we just expose it globally or return it
    window.__DEMO_MODE__ = true;
    return DEMO_DATA;
}
