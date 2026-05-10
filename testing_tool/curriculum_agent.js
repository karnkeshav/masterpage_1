const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'http://localhost:8080'; // Change to your local server URL
const DEFAULT_PASSWORD = 'Ready4Exam@2026';
const REPORT_PATH = 'report.md';

/**
 * Automated Agent to perform quizzes across all grades and difficulties.
 */
async function runCurriculumAgent() {
    console.log("🚀 Starting Curriculum Integrity Agent...");
    
    const browser = await chromium.launch({ headless: true }); // Set to false to watch the agent
    const context = await browser.newPage();

    // 1. Load Curriculum Data (Assuming your CSV structure)
    // In a real scenario, you'd parse data/cbse/data_2025-12-27.csv here.
    const testPlan = [
        { grade: '9', subject: 'Physics', topic: 'Motion', difficulty: 'Simple', targetScore: 0.95 },
        { grade: '9', subject: 'Physics', topic: 'Motion', difficulty: 'Medium', targetScore: 0.40 }, // Fail
        { grade: '10', subject: 'Chemistry', topic: 'Acids-and-Bases', difficulty: 'Simple', targetScore: 0.80 },
        { grade: '11', subject: 'Physics', topic: 'Atoms', difficulty: 'Advanced', targetScore: 0.95 }
    ];

    // 2. Load Student Users from your CSV
    const students = [
        { email: 'ready4urexam+s.9.a@gmail.com', grade: '9' },
        { email: 'ready4urexam+s.10.b@gmail.com', grade: '10' }
    ];

    let report = '## Curriculum Integrity Agent Report\n\n';
    report += '| Student | Grade | Topic | Difficulty | Status | Result |\n';
    report += '| :--- | :--- | :--- | :--- | :--- | :--- |\n';

    for (const student of students) {
        console.log(`\n[AUTH] Impersonating: ${student.email}`);
        
        try {
            // Login Phase
            await context.goto(BASE_URL);
            await context.fill('#login-email', student.email);
            await context.fill('#login-password', DEFAULT_PASSWORD);
            await context.click('#login-submit-btn');
            await context.waitForURL('**/student.html');

            for (const task of testPlan) {
                if (task.grade !== student.grade) continue;

                console.log(`[NAV] Testing: ${task.subject} > ${task.topic} [${task.difficulty}]`);
                
                const quizUrl = `${BASE_URL}/app/quiz-engine.html?grade=${task.grade}&subject=${task.subject}&topic=${task.topic}&difficulty=${task.difficulty}`;
                await context.goto(quizUrl);

                // Wait for the Quiz Engine to load questions
                try {
                    await context.waitForSelector('#quiz-content', { state: 'visible', timeout: 15000 });
                    
                    // Interaction: Answering questions
                    const questions = await context.$$('.question-card');
                    console.log(`[ACTION] Found ${questions.length} questions. Injecting ${task.targetScore * 100}% performance...`);

                    for (let i = 0; i < questions.length; i++) {
                        const isCorrect = Math.random() < task.targetScore;
                        const options = await questions[i].$$('.option-btn');
                        
                        // Simple simulation: click first option for simplicity or random for failure
                        if (isCorrect) {
                            await options[0].click(); // Assuming 0 is correct for simulation
                        } else {
                            await options[1].click(); 
                        }
                    }

                    // Submit the quiz
                    await context.click('#submit-btn');
                    await context.waitForSelector('#results-view', { state: 'visible' });
                    
                    const scoreText = await context.innerText('#final-score-percent');
                    console.log(`[RESULT] Quiz Finished. Score: ${scoreText}`);
                    
                    report += `| ${student.email} | ${task.grade} | ${task.topic} | ${task.difficulty} | ✅ Success | ${scoreText} |\n`;

                } catch (e) {
                    console.error(`[ERROR] Quiz failed to load or submit: ${e.message}`);
                    
                    // Check for "LOCKED" alert for Advanced tier
                    const isLocked = await context.isVisible('text=LOCKED');
                    if (isLocked && task.difficulty === 'Advanced') {
                        console.log(`[FORTRESS] Advanced tier correctly locked for student.`);
                        report += `| ${student.email} | ${task.grade} | ${task.topic} | ${task.difficulty} | 🔒 Locked | N/A |\n`;
                    } else {
                        report += `| ${student.email} | ${task.grade} | ${task.topic} | ${task.difficulty} | ❌ Failed | ${e.message} |\n`;
                    }
                }
            }

            // Logout for next student
            await context.click('#logout-btn');
        } catch (e) {
            console.error(`[CRITICAL] Agent failure for student ${student.email}: ${e.message}`);
        }
    }

    fs.appendFileSync(REPORT_PATH, report);
    await browser.close();
    console.log("\n🏁 Agent Tasks Completed. Report appended to report.md");
}

module.exports = { runCurriculumAgent };
