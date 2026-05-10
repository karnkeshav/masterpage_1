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

    const browser = await chromium.launch({ headless: true });

    for (const student of students) {
        console.log(`\n[AUTH] Logging in as: ${student.email}`);

        // Fresh isolated context per student.
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            await page.goto(BASE_URL, { waitUntil: 'load' });

            // Login form on index.html uses #username / #password (NOT #login-email).
            await page.waitForSelector('#username', { state: 'visible', timeout: 20000 });
            await page.fill('#username', student.email);
            await page.fill('#password', DEFAULT_PASSWORD);

            // Submit by pressing the form's submit button.
            await page.click('#sovereign-login-form button[type="submit"]');

            await page.waitForURL('**/student.html**', { timeout: 20000 });
            console.log(`[SUCCESS] Authenticated ${student.email}`);

            for (const subject of student.subjects) {
                const topic = 'Motion';

                for (const tier of difficulties) {
                    const quizUrl = `${BASE_URL}/app/quiz-engine.html?grade=${student.grade}&subject=${subject}&topic=${topic}&difficulty=${tier}`;
                    console.log(`[NAV] Running: ${subject} > ${topic} [${tier}]`);

                    try {
                        await page.goto(quizUrl, { waitUntil: 'load' });

                        // Wait for the quiz to render (it un-hides #quiz-content
                        // after auth + curriculum load resolve).
                        await page.waitForSelector('#quiz-content:not(.hidden)', { timeout: 15000 });
                        await page.waitForSelector('#question-list label', { timeout: 10000 });

                        // Quiz is paginated: one question on screen at a time.
                        // Click first option, click Next, repeat until Submit appears.
                        let safety = 50;
                        while (safety-- > 0) {
                            // Pick first radio option of the visible question.
                            const firstOption = await page.$('#question-list label');
                            if (firstOption) await firstOption.click();

                            // If Submit is now visible, this was the last question.
                            const submitVisible = await page.locator('#submit-btn:not(.hidden)').count();
                            if (submitVisible > 0) break;

                            // Otherwise advance to next question.
                            await page.click('#next-btn');
                            // Tiny wait for re-render of next question.
                            await page.waitForTimeout(150);
                        }

                        await page.click('#submit-btn');

                        // Score appears in #score-display (format "X/Y").
                        await page.waitForSelector('#score-display', { state: 'visible', timeout: 10000 });
                        const score = (await page.innerText('#score-display')).trim();

                        report += `| ${student.email} | ${student.grade} | ${subject} | ${topic} | ${tier} | ✅ Success | ${score} |\n`;
                    } catch (e) {
                        const isLocked = await page.isVisible('text=LOCKED').catch(() => false);
                        const isPaywall = await page.locator('#paywall-screen:not(.hidden)').count().catch(() => 0);
                        if (isLocked) {
                            report += `| ${student.email} | ${student.grade} | ${subject} | ${topic} | ${tier} | 🔒 Locked | N/A |\n`;
                        } else if (isPaywall > 0) {
                            report += `| ${student.email} | ${student.grade} | ${subject} | ${topic} | ${tier} | 🔐 Paywall | N/A |\n`;
                        } else {
                            report += `| ${student.email} | ${student.grade} | ${subject} | ${topic} | ${tier} | ❌ Error | ${e.message.substring(0, 60).replace(/\|/g, '/')}... |\n`;
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`[ERROR] Execution failed for ${student.email}: ${err.message}`);
            report += `| ${student.email} | ${student.grade} | — | — | — | ❌ Auth Failed | ${err.message.substring(0, 60).replace(/\|/g, '/')}... |\n`;
        } finally {
            await context.close();
        }
    }

    await browser.close();

    fs.appendFileSync(REPORT_PATH, report);
    console.log("\n🏁 Agent Simulation Finished.");
}

module.exports = { runCurriculumAgent };