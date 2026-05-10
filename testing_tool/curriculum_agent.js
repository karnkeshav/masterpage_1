const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const DEFAULT_PASSWORD = 'Ready4Exam@2026';
const REPORT_PATH = 'report.md';

const STUDENT = { email: 'ready4urexam+s.10.a@gmail.com', grade: '10' };
const SUBJECTS = ['Mathematics', 'Science', 'Social Science'];

async function runCurriculumAgent() {
    console.log("\n[AGENT] 🚀 Initializing Class 10 Integrity Scan...");
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(40000);

    let report = '\n## Class 10 Curriculum Integrity Report\n\n';
    report += '| Subject | Chapter | Table ID | Status | Outcome |\n';
    report += '| :--- | :--- | :--- | :--- | :--- |\n';

    try {
        // --- AUTHENTICATION ---
        console.log(`[AUTH] 🔑 Attempting login for ${STUDENT.email}...`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.fill('#username', STUDENT.email);
        await page.fill('#password', DEFAULT_PASSWORD);
        
        await Promise.all([
            page.waitForURL('**/student.html', { timeout: 60000 }),
            page.click('#sovereign-login-form button[type="submit"]')
        ]).catch(async () => {
            if (await page.isVisible('#login-error')) {
                const msg = await page.innerText('#login-error');
                throw new Error(`Auth Rejected: ${msg}`);
            }
            throw new Error("Auth Timeout: Student hub did not load.");
        });
        console.log(`[AUTH] ✅ Success. Entered Class 10 Hub.`);

        for (const subject of SUBJECTS) {
            console.log(`\n[SUBJECT] 📁 Processing: ${subject}`);
            
            // Navigate to subject curriculum
            await page.goto(`${BASE_URL}/app/consoles/student.html`);
            await page.click('#start-new-quiz-btn');
            await page.waitForURL('**/curriculum.html');

            const subjectCard = page.locator('#subject-grid > div', { hasText: subject }).first();
            if (await subjectCard.count() === 0) {
                console.log(`[WARN] Subject ${subject} not found in grid.`);
                report += `| ${subject} | — | — | ⚠️ Missing | Subject not available in hub |\n`;
                continue;
            }
            await subjectCard.click();
            await page.waitForURL('**/chapter-selection.html');

            // Discover all chapters
            const chapterCards = page.locator('[onclick^="startQuiz"]');
            await chapterCards.first().waitFor({ state: 'visible' });
            
            const chapters = await chapterCards.evaluateAll(nodes => nodes.map((node, index) => {
                const onclick = node.getAttribute('onclick') || '';
                const tableMatch = onclick.match(/startQuiz\('([^']*)'/);
                return { 
                    index, 
                    title: node.querySelector('h4')?.textContent?.trim() || `Chapter ${index + 1}`,
                    tableId: tableMatch ? tableMatch[1] : 'N/A'
                };
            }));

            console.log(`[FLOW] 📍 Found ${chapters.length} chapters in ${subject}. Starting Simple attempts...`);

            for (const chapter of chapters) {
                process.stdout.write(`   > ${chapter.title}... `);
                try {
                    await page.goto(page.url()); // Ensure modal state reset
                    await chapterCards.nth(chapter.index).click();
                    
                    const modal = page.locator('#symmetric-difficulty-modal');
                    await modal.waitFor({ state: 'visible' });
                    await modal.getByRole('button', { name: /Simple/i }).click();
                    
                    await page.waitForURL('**/quiz-engine.html');
                    await page.waitForSelector('#quiz-content:not(.hidden)', { timeout: 25000 });

                    // Simulate Quiz interaction
                    let isQuizActive = true;
                    let qCount = 0;
                    while (isQuizActive) {
                        qCount++;
                        await page.locator('#question-list label').first().click();
                        
                        if (await page.locator('#submit-btn:not(.hidden)').count() > 0) {
                            isQuizActive = false;
                        } else {
                            await page.click('#next-btn');
                            await page.waitForTimeout(100);
                        }
                    }

                    // Handle native "Are you sure?" confirmation
                    page.once('dialog', d => d.accept().catch(() => {}));
                    await page.click('#submit-btn');
                    
                    await page.waitForSelector('#score-display', { state: 'visible' });
                    const score = await page.innerText('#score-display');
                    
                    process.stdout.write(`✅ Completed (${score})\n`);
                    report += `| ${subject} | ${chapter.title} | ${chapter.tableId} | ✅ Pass | Score: ${score} |\n`;

                } catch (quizErr) {
                    process.stdout.write(`❌ Failed\n`);
                    console.log(`      [ERR] ${quizErr.message}`);
                    report += `| ${subject} | ${chapter.title} | ${chapter.tableId} | ❌ Error | ${quizErr.message.substring(0, 50)} |\n`;
                }
            }
        }
    } catch (fatal) {
        console.error(`\n[FATAL] 🛑 Agent Crashed: ${fatal.message}`);
        report += `\n**Critical Failure:** ${fatal.message}\n`;
    } finally {
        fs.appendFileSync(REPORT_PATH, report);
        await browser.close();
        console.log("\n[AGENT] 🏁 Integrity scan finished. Findings saved to report.md.");
    }
}

module.exports = runCurriculumAgent;
