const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const DEFAULT_PASSWORD = 'Ready4Exam@2026';
const REPORT_PATH = 'report.md';

// Target only Class 10 and Simple difficulty
const STUDENT = { email: 'ready4urexam+s.10.a@gmail.com', grade: '10' };
const SUBJECTS = ['Mathematics', 'Science', 'Social Science'];

async function runCurriculumAgent() {
    console.log("🚀 Starting Class 10 Curriculum Integrity Agent...");
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    let report = '\n## Class 10 Curriculum Health Matrix\n\n';
    report += '| Subject | Chapter | Table ID | Status | Detail |\n';
    report += '| :--- | :--- | :--- | :--- | :--- |\n';

    try {
        // 1. Authentication
        await page.goto(BASE_URL);
        await page.fill('#username', STUDENT.email);
        await page.fill('#password', DEFAULT_PASSWORD);
        await page.click('#sovereign-login-form button[type="submit"]');
        await page.waitForURL('**/student.html');
        console.log(`[AUTH] Logged in as Class 10 student.`);

        for (const subject of SUBJECTS) {
            console.log(`\n[SUBJECT] Entering ${subject}...`);
            
            // 2. Open Curriculum Page
            await page.goto(`${BASE_URL}/app/consoles/student.html`);
            await page.click('#start-new-quiz-btn');
            await page.waitForURL('**/curriculum.html');

            // 3. Select Subject
            const subjectCard = page.locator('#subject-grid > div', { hasText: subject }).first();
            if (await subjectCard.count() === 0) {
                report += `| ${subject} | — | — | ❌ Missing | Subject card not found |\n`;
                continue;
            }
            await subjectCard.click();
            await page.waitForURL('**/chapter-selection.html');

            // 4. Discover Chapters
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

            console.log(`[FLOW] Found ${chapters.length} chapters in ${subject}.`);

            for (const chapter of chapters) {
                console.log(`   > Testing: ${chapter.title} [Simple]`);
                try {
                    // Navigate back to chapter list for each attempt
                    await page.goto(page.url(), { waitUntil: 'load' }); 
                    
                    // Trigger Modal
                    await chapterCards.nth(chapter.index).click();
                    const modal = page.locator('#symmetric-difficulty-modal');
                    await modal.waitFor({ state: 'visible' });
                    
                    // Select Simple
                    await modal.getByRole('button', { name: /Simple/i }).click();
                    await page.waitForURL('**/quiz-engine.html');

                    // 5. Take Quiz
                    await page.waitForSelector('#quiz-content:not(.hidden)', { timeout: 15000 });
                    
                    let questionsFinished = false;
                    let safetyCounter = 0;
                    while (!questionsFinished && safetyCounter < 50) {
                        safetyCounter++;
                        await page.locator('#question-list label').first().click();
                        
                        if (await page.locator('#submit-btn:not(.hidden)').count() > 0) {
                            questionsFinished = true;
                        } else {
                            await page.click('#next-btn');
                            await page.waitForTimeout(200);
                        }
                    }

                    // Submit
                    page.once('dialog', d => d.accept().catch(() => {}));
                    await page.click('#submit-btn');
                    await page.waitForSelector('#score-display', { state: 'visible', timeout: 10000 });
                    
                    const score = await page.innerText('#score-display');
                    report += `| ${subject} | ${chapter.title} | ${chapter.tableId} | ✅ Pass | Score: ${score} |\n`;

                } catch (err) {
                    console.error(`[ERROR] Chapter ${chapter.title} failed: ${err.message}`);
                    report += `| ${subject} | ${chapter.title} | ${chapter.tableId} | ❌ Error | ${err.message.substring(0, 50)} |\n`;
                }
            }
        }
    } catch (fatal) {
        console.error(`[FATAL] Agent crashed: ${fatal.message}`);
        report += `\n**Fatal Error:** ${fatal.message}\n`;
    } finally {
        fs.appendFileSync(REPORT_PATH, report);
        await browser.close();
        console.log("\n🏁 Agent Simulation Complete. Check report.md");
    }
}

// DIRECT EXPORT
module.exports = runCurriculumAgent;
