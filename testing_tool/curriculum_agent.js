const { chromium } = require('playwright');
const fs = require('fs');

async function runCurriculumAgent() {
    console.log("🚀 Starting Curriculum Integrity Agent...");

    const BASE_URL = 'http://localhost:8080';
    const DEFAULT_PASSWORD = 'Ready4Exam@2026';
    const REPORT_PATH = 'report.md';
    const DIFFICULTIES = ['Simple', 'Medium', 'Advanced'];

    const students = [
        { email: 'ready4urexam+s.6.a@gmail.com',    grade: '6' },
        { email: 'ready4urexam+s.9.a@gmail.com',    grade: '9' },
        { email: 'ready4urexam+s.11.pcm@gmail.com', grade: '11' },
        { email: 'ready4urexam+s.11.pcb1@gmail.com',grade: '11' },
        { email: 'ready4urexam+s.12.pcm@gmail.com', grade: '12' },
    ];

    let report = '\n## Curriculum Integrity Agent Results\n\n';
    report += '| Student | Grade | Subject | Chapter | Difficulty | Status | Score |\n';
    report += '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

    const browser = await chromium.launch({ headless: true });

    for (const student of students) {
        console.log(`\n[AUTH] Logging in as: ${student.email}`);

        // Fresh isolated context per student — no cookie/auth bleed.
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            // ── Step 1: Login ──────────────────────────────────────────
            await page.goto(BASE_URL, { waitUntil: 'load' });
            // index.html renders the login form via JS; wait for it.
            await page.waitForSelector('#username', { state: 'visible', timeout: 20000 });
            await page.fill('#username', student.email);
            await page.fill('#password', DEFAULT_PASSWORD);
            await page.click('#sovereign-login-form button[type="submit"]');
            // Auth redirects to student.html (B2C) or student.html?schoolId=... (school)
            await page.waitForURL('**/student.html**', { timeout: 20000 });
            console.log(`[SUCCESS] Authenticated ${student.email}`);

            // ── Step 2: Click "New Quiz" ───────────────────────────────
            // Button href is set dynamically to /app/curriculum.html?grade=X
            await page.waitForSelector('#start-new-quiz-btn', { state: 'visible', timeout: 10000 });
            await page.click('#start-new-quiz-btn');
            // curriculum.html renders a subject selection grid
            await page.waitForURL('**/curriculum.html**', { timeout: 10000 });
            await page.waitForSelector('[onclick*="selectSubject"]', { state: 'visible', timeout: 15000 });

            // ── Step 3: Read subjects from the page ───────────────────
            const subjectHandles = await page.$$('[onclick*="selectSubject"]');
            // Extract subject names from onclick="selectSubject('Science', '9')"
            const subjects = [];
            for (const el of subjectHandles) {
                const onclick = await el.getAttribute('onclick');
                const m = onclick?.match(/selectSubject\('([^']+)'/);
                if (m) subjects.push(m[1]);
            }
            console.log(`[SUBJECTS] Found: ${subjects.join(', ')}`);

            // ── Step 4: For each subject ───────────────────────────────
            for (const subject of subjects) {
                const chapterSelUrl = `${BASE_URL}/app/chapter-selection.html?subject=${encodeURIComponent(subject)}&grade=${student.grade}`;
                await page.goto(chapterSelUrl, { waitUntil: 'load' });
                // chapter cards are rendered by JS after curriculum loads
                await page.waitForSelector('[onclick*="startQuiz"]', { state: 'visible', timeout: 15000 });

                // ── Step 5: Read chapters from the page ───────────────
                const chapterHandles = await page.$$('[onclick*="startQuiz"]');
                // Extract title from onclick="startQuiz('table_id', 'Chapter Title', '9')"
                const chapters = [];
                for (const el of chapterHandles) {
                    const onclick = await el.getAttribute('onclick');
                    const m = onclick?.match(/startQuiz\('([^']*)',\s*'([^']*)'/);
                    if (m) chapters.push({ tableId: m[1], title: m[2] });
                }
                console.log(`[${subject}] Found ${chapters.length} chapters`);

                // ── Step 6: For each chapter × each difficulty ─────────
                for (const chapter of chapters) {
                    for (const difficulty of DIFFICULTIES) {
                        console.log(`[QUIZ] ${subject} > ${chapter.title} [${difficulty}]`);

                        const quizUrl = `${BASE_URL}/app/quiz-engine.html?table=${encodeURIComponent(chapter.tableId)}&topic=${encodeURIComponent(chapter.title)}&grade=${student.grade}&difficulty=${difficulty}&subject=${encodeURIComponent(subject)}`;
                        try {
                            await page.goto(quizUrl, { waitUntil: 'load' });

                            // quiz-content is hidden until auth + questions load
                            await page.waitForSelector('#quiz-content:not(.hidden)', { timeout: 15000 });
                            await page.waitForSelector('#question-list label', { timeout: 10000 });

                            // Paginated quiz: click first option → Next → repeat until Submit visible
                            let safety = 60;
                            while (safety-- > 0) {
                                const firstOption = await page.$('#question-list label');
                                if (firstOption) await firstOption.click();

                                const submitVisible = await page.locator('#submit-btn:not(.hidden)').count();
                                if (submitVisible > 0) break;

                                await page.click('#next-btn');
                                await page.waitForTimeout(200);
                            }

                            await page.click('#submit-btn');
                            await page.waitForSelector('#score-display', { state: 'visible', timeout: 10000 });
                            const score = (await page.innerText('#score-display')).trim();

                            report += `| ${student.email} | ${student.grade} | ${subject} | ${chapter.title} | ${difficulty} | ✅ Pass | ${score} |\n`;

                        } catch (e) {
                            const isLocked  = await page.isVisible('text=LOCKED').catch(() => false);
                            const isPaywall = await page.locator('#paywall-screen:not(.hidden)').count().catch(() => 0);

                            let status = '❌ Error';
                            if (isLocked)      status = '🔒 Locked';
                            else if (isPaywall) status = '🔐 Paywall';

                            const msg = e.message.replace(/\|/g, '/').substring(0, 55);
                            report += `| ${student.email} | ${student.grade} | ${subject} | ${chapter.title} | ${difficulty} | ${status} | ${msg}... |\n`;
                        }
                    } // end difficulty loop
                } // end chapter loop
            } // end subject loop

        } catch (err) {
            console.error(`[ERROR] ${student.email}: ${err.message}`);
            report += `| ${student.email} | ${student.grade} | — | — | — | ❌ Auth Failed | ${err.message.substring(0, 55).replace(/\|/g, '/')}... |\n`;
        } finally {
            await context.close();
        }
    } // end student loop

    await browser.close();
    fs.appendFileSync(REPORT_PATH, report);
    console.log("\n🏁 Agent Simulation Finished.");
}

module.exports = { runCurriculumAgent };
