const { chromium } = require('playwright');
const fs = require('fs');

async function runCurriculumAgent() {
    console.log("🚀 Starting Curriculum Integrity Agent...");

    const BASE_URL = 'http://localhost:8080';
    const DEFAULT_PASSWORD = 'Ready4Exam@2026';
    const REPORT_PATH = 'report.md';

    const students = [
        { email: 'ready4urexam+s.6.a@gmail.com',    grade: '6',  subjects: ['Science', 'Mathematics'] },
        { email: 'ready4urexam+s.9.a@gmail.com',    grade: '9',  subjects: ['Science', 'Mathematics'] },
        { email: 'ready4urexam+s.11.pcm@gmail.com', grade: '11', subjects: ['Physics', 'Mathematics'] },
        { email: 'ready4urexam+s.11.pcb1@gmail.com',grade: '11', subjects: ['Physics', 'Science'] },
        { email: 'ready4urexam+s.12.pcm@gmail.com', grade: '12', subjects: ['Physics', 'Mathematics'] },
    ];

    const difficulties = ['Simple', 'Medium', 'Advanced'];

    let report = '\n## Curriculum Integrity Agent Results\n\n';
    report += '| Student | Grade | Subject | Topic | Tier | Status | Score |\n';
    report += '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

    // One browser, but a fresh isolated context + page per student.
    const browser = await chromium.launch({ headless: true });

    for (const student of students) {
        console.log(`\n[AUTH] Logging in as: ${student.email}`);

        // Fresh context per student — no cookie/auth bleed between runs.
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            await page.goto(BASE_URL, { waitUntil: 'load' });

            // Wait for the JS-rendered login form before filling.
            // Without this, page.fill times out because the form isn't in
            // the DOM yet when page.goto resolves.
            await page.waitForSelector('#login-email', { state: 'visible', timeout: 20000 });

            await page.fill('#login-email', student.email);
            await page.fill('#login-password', DEFAULT_PASSWORD);
            await page.click('#login-submit-btn');

            await page.waitForURL('**/student.html', { timeout: 20000 });
            console.log(`[SUCCESS] Authenticated ${student.email}`);

            for (const subject of student.subjects) {
                const topic = 'Motion';

                for (const tier of difficulties) {
                    const quizUrl = `${BASE_URL}/app/quiz-engine.html?grade=${student.grade}&subject=${subject}&topic=${topic}&difficulty=${tier}`;
                    console.log(`[NAV] Running: ${subject} > ${topic} [${tier}]`);

                    try {
                        await page.goto(quizUrl, { waitUntil: 'load' });
                        await page.waitForSelector('#quiz-content', { state: 'visible', timeout: 10000 });

                        const questions = await page.$$('.question-card');
                        for (const q of questions) {
                            const options = await q.$$('.option-btn');
                            if (options.length > 0) await options[0].click();
                        }

                        await page.click('#submit-btn');
                        await page.waitForSelector('#final-score-percent', { state: 'visible', timeout: 10000 });
                        const score = await page.innerText('#final-score-percent');

                        report += `| ${student.email} | ${student.grade} | ${subject} | ${topic} | ${tier} | ✅ Success | ${score} |\n`;
                    } catch (e) {
                        const isLocked = await page.isVisible('text=LOCKED').catch(() => false);
                        if (isLocked) {
                            report += `| ${student.email} | ${student.grade} | ${subject} | ${topic} | ${tier} | 🔒 Locked | N/A |\n`;
                        } else {
                            report += `| ${student.email} | ${student.grade} | ${subject} | ${topic} | ${tier} | ❌ Error | ${e.message.substring(0, 40)}... |\n`;
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`[ERROR] Execution failed for ${student.email}: ${err.message}`);
            report += `| ${student.email} | ${student.grade} | — | — | — | ❌ Auth Failed | ${err.message.substring(0, 40)}... |\n`;
        } finally {
            // Close context instead of clicking logout — works whether or not
            // login succeeded, and fully clears all cookies/storage.
            await context.close();
        }
    }

    await browser.close();

    fs.appendFileSync(REPORT_PATH, report);
    console.log("\n🏁 Agent Simulation Finished.");
}

module.exports = { runCurriculumAgent };
