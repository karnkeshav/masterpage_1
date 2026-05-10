const { chromium } = require('playwright');
const fs = require('fs');

async function runCurriculumAgent() {
    console.log("🚀 Starting Curriculum Integrity Agent...");
    
    // Set headless: false if you want to watch the browser in real-time
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const BASE_URL = 'http://localhost:8080';
    const DEFAULT_PASSWORD = 'Ready4Exam@2026';
    const REPORT_PATH = 'report.md';

    // 1. Full Student List from your CSV 
    const students = [
        { email: 'ready4urexam+s.6.a@gmail.com', grade: '6' },
        { email: 'ready4urexam+s.6.b@gmail.com', grade: '6' },
        { email: 'ready4urexam+s.6.c@gmail.com', grade: '6' },
        { email: 'ready4urexam+s.7.a@gmail.com', grade: '7' },
        { email: 'ready4urexam+s.7.b@gmail.com', grade: '7' },
        { email: 'ready4urexam+s.7.c@gmail.com', grade: '7' },
        { email: 'ready4urexam+s.8.a@gmail.com', grade: '8' },
        { email: 'ready4urexam+s.8.b@gmail.com', grade: '8' },
        { email: 'ready4urexam+s.8.c@gmail.com', grade: '8' },
        { email: 'ready4urexam+s.9.a@gmail.com', grade: '9' },
        { email: 'ready4urexam+s.9.b@gmail.com', grade: '9' },
        { email: 'ready4urexam+s.9.c@gmail.com', grade: '9' },
        { email: 'ready4urexam+s.10.a@gmail.com', grade: '10' },
        { email: 'ready4urexam+s.10.b@gmail.com', grade: '10' },
        { email: 'ready4urexam+s.10.c@gmail.com', grade: '10' },
        { email: 'ready4urexam+s.11.pcm@gmail.com', grade: '11' },
        { email: 'ready4urexam+s.11.pcb1@gmail.com', grade: '11' },
        { email: 'ready4urexam+s.11.pcb2@gmail.com', grade: '11' },
        { email: 'ready4urexam+s.11.comm@gmail.com', grade: '11' },
        { email: 'ready4urexam+s.11.hum@gmail.com', grade: '11' },
        { email: 'ready4urexam+s.12.pcm@gmail.com', grade: '12' },
        { email: 'ready4urexam+s.12.pcb1@gmail.com', grade: '12' },
        { email: 'ready4urexam+s.12.pcb2@gmail.com', grade: '12' },
        { email: 'ready4urexam+s.12.comm@gmail.com', grade: '12' },
        { email: 'ready4urexam+s.12.hum@gmail.com', grade: '12' }
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
            
            // FIX: Using specific IDs to avoid "reset-email" modal conflict
            await page.fill('#login-email', student.email);
            await page.fill('#login-password', DEFAULT_PASSWORD);
            await page.click('#login-submit-btn');
            
            await page.waitForURL('**/student.html', { timeout: 10000 });

            for (const subject of subjects) {
                // Topic names should match your curriculum slugs
                const topics = ['Motion', 'Algebra']; 

                for (const topic of topics) {
                    for (const tier of difficulties) {
                        const quizUrl = `${BASE_URL}/app/quiz-engine.html?grade=${student.grade}&subject=${subject}&topic=${topic}&difficulty=${tier}`;
                        await page.goto(quizUrl);

                        try {
                            await page.waitForSelector('#quiz-content', { state: 'visible', timeout: 10000 });

                            const questions = await page.$$('.question-card');
                            for (const q of questions) {
                                const options = await q.$$('.option-btn');
                                // Target high performance (80% chance for correct answer)
                                const choice = Math.random() > 0.2 ? 0 : 1; 
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
            // Ensure student is logged out before next iteration
            await page.goto(`${BASE_URL}/app/consoles/student.html`);
            await page.click('#logout-btn');
        } catch (err) {
            console.error(`[ERROR] Student ${student.email} failed: ${err.message}`);
        }
    }

    fs.appendFileSync(REPORT_PATH, report);
    await browser.close();
    console.log("🏁 Agent Finished.");
}

module.exports = { runCurriculumAgent };
