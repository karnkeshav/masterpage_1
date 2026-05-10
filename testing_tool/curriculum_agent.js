const { chromium } = require('playwright');
const fs = require('fs');

async function runCurriculumAgent() {
    console.log("🚀 Starting Curriculum Integrity Agent...");
    
    // Set headless: false to watch the agent in your browser
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const BASE_URL = 'http://localhost:8080';
    const DEFAULT_PASSWORD = 'Ready4Exam@2026';
    const REPORT_PATH = 'report.md';

    // List of students following your exact ID pattern
    const students = [
        { email: 'ready4urexam+s.6.a@gmail.com', grade: '6' },
        { email: 'ready4urexam+s.9.a@gmail.com', grade: '9' },
        { email: 'ready4urexam+s.11.pcm@gmail.com', grade: '11' },
        { email: 'ready4urexam+s.11.pcb1@gmail.com', grade: '11' },
        { email: 'ready4urexam+s.12.pcm@gmail.com', grade: '12' }
    ];

    const subjects = ['Physics', 'Mathematics', 'Science'];
    const difficulties = ['Simple', 'Medium', 'Advanced'];

    let report = '\n## Curriculum Integrity Agent Results\n\n';
    report += '| Student | Grade | Subject | Topic | Tier | Status | Score |\n';
    report += '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

    for (const student of students) {
        console.log(`\n[AUTH] Logging in as: ${student.email}`);
        
        try {
            await page.goto(BASE_URL);
            
            // TARGET SPECIFIC LOGIN IDS (Fixes the "reset-email" timeout)
            await page.fill('#login-email', student.email);
            await page.fill('#login-password', DEFAULT_PASSWORD);
            await page.click('#login-submit-btn');
            
            await page.waitForURL('**/student.html', { timeout: 15000 });
            console.log(`[SUCCESS] Authenticated ${student.email}`);

            for (const subject of subjects) {
                const topic = 'Motion'; // Topic slug from your curriculum data

                for (const tier of difficulties) {
                    const quizUrl = `${BASE_URL}/app/quiz-engine.html?grade=${student.grade}&subject=${subject}&topic=${topic}&difficulty=${tier}`;
                    console.log(`[NAV] Running: ${subject} > ${topic} [${tier}]`);
                    
                    await page.goto(quizUrl);

                    try {
                        await page.waitForSelector('#quiz-content', { state: 'visible', timeout: 10000 });
                        
                        // Answer simulation
                        const questions = await page.$$('.question-card');
                        for (const q of questions) {
                            const options = await q.$$('.option-btn');
                            await options[0].click(); // Simulate clicking the first answer
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
                            report += `| ${student.email} | ${student.grade} | ${subject} | ${topic} | ${tier} | ❌ Error | ${e.message.substring(0, 15)}... |\n`;
                        }
                    }
                }
            }
            // Logout and clear state for next student
            await page.goto(`${BASE_URL}/app/consoles/student.html`);
            await page.click('#logout-btn');
            await context.clearCookies();
        } catch (err) {
            console.error(`[ERROR] Execution failed for ${student.email}: ${err.message}`);
        }
    }

    fs.appendFileSync(REPORT_PATH, report);
    await browser.close();
    console.log("\n🏁 Agent Simulation Finished.");
}

module.exports = { runCurriculumAgent };
