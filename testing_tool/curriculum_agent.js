const { chromium } = require('playwright');
const fs = require('fs');

async function runCurriculumAgent() {
    console.log("🚀 Starting Curriculum Integrity Agent...");
    
    // Set headless: false if you want to watch the agent work in PowerShell
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const BASE_URL = 'http://localhost:8080';
    const DEFAULT_PASSWORD = 'Ready4Exam@2026';
    const REPORT_PATH = 'report.md';

    // Simulation List (Example: Replace with your actual 25 students)
    const students = [
        { email: 'ready4urexam+s.6.a@gmail.com', grade: '6' },
        { email: 'ready4urexam+s.9.a@gmail.com', grade: '9' },
        { email: 'ready4urexam+s.11.pcm@gmail.com', grade: '11' }
    ];

    const subjects = ['Physics', 'Mathematics', 'Science'];
    const difficulties = ['Simple', 'Medium', 'Advanced'];

    let report = '## Curriculum Integrity Agent Results\n\n';
    report += '| Student | Grade | Subject | Topic | Tier | Status | Score |\n';
    report += '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

    for (const student of students) {
        console.log(`\n[AUTH] Logging in: ${student.email}`);
        
        try {
            await page.goto(BASE_URL);
            await page.fill('input[type="email"]', student.email);
            await page.fill('input[type="password"]', DEFAULT_PASSWORD);
            await page.click('#login-submit-btn');
            await page.waitForURL('**/student.html');

            for (const subject of subjects) {
                const topics = ['Motion', 'Algebra']; // Actual topics from your CSV data

                for (const topic of topics) {
                    for (const tier of difficulties) {
                        console.log(`[NAV] Testing Grade ${student.grade} ${subject} - ${topic} [${tier}]`);
                        
                        const quizUrl = `${BASE_URL}/app/quiz-engine.html?grade=${student.grade}&subject=${subject}&topic=${topic}&difficulty=${tier}`;
                        await page.goto(quizUrl);

                        try {
                            await page.waitForSelector('#quiz-content', { state: 'visible', timeout: 10000 });

                            // Answer Logic
                            const questions = await page.$$('.question-card');
                            for (const q of questions) {
                                const options = await q.$$('.option-btn');
                                // Simulate random performance (Passing vs failing)
                                const choice = Math.random() > 0.3 ? 0 : 1; 
                                await options[choice].click();
                            }

                            await page.click('#submit-btn');
                            await page.waitForSelector('#final-score-percent', { state: 'visible' });
                            const score = await page.innerText('#final-score-percent');
                            
                            report += `| ${student.email} | ${student.grade} | ${subject} | ${topic} | ${tier} | ✅ Success | ${score} |\n`;

                        } catch (e) {
                            const isLocked = await page.isVisible('text=LOCKED');
                            if (isLocked) {
                                report += `| ${student.email} | ${student.grade} | ${subject} | ${topic} | ${tier} | 🔒 Locked | N/A |\n`;
                            } else {
                                report += `| ${student.email} | ${student.grade} | ${subject} | ${topic} | ${tier} | ❌ Error | ${e.message.substring(0, 20)}... |\n`;
                            }
                        }
                    }
                }
            }
            await page.click('#logout-btn');
        } catch (err) {
            console.error(`[ERROR] Student ${student.email} failed: ${err.message}`);
        }
    }

    fs.appendFileSync(REPORT_PATH, report);
    await browser.close();
}

module.exports = { runCurriculumAgent };
