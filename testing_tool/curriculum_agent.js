const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const USER = 's.10.a'; // Hardcoded as requested
const PASS = 'Ready4Exam@2026'; // Hardcoded as requested
const REPORT_PATH = 'report.md';
const SUBJECTS = ['Mathematics', 'Science', 'Social Science'];

async function runCurriculumAgent() {
    console.log("\n[AGENT] 🚀 Starting Class 10 High-Fidelity Audit...");
    
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    let report = '\n## Class 10 Curriculum Integrity Matrix\n\n';
    report += '| Subject | Chapter | Table ID | Status | Outcome |\n';
    report += '| :--- | :--- | :--- | :--- | :--- |\n';

    try {
        // --- 1. HARDENED LOGIN ---
        console.log(`[AUTH] 🔑 Navigating to ${BASE_URL}...`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });

        // WAIT for the app's 200ms "Autofill Killer" in index-auth.js to finish
        await page.waitForTimeout(1000); 

        console.log(`[AUTH] ✍️ Entering credentials for: ${USER}`);
        await page.fill('#username', USER);
        await page.fill('#password', PASS);

        // STABILITY CHECK: If the app cleared the fields, fill them again
        const currentVal = await page.inputValue('#username');
        if (!currentVal) {
            console.log("[AUTH] 🔄 App script cleared fields. Re-filling identity...");
            await page.fill('#username', USER);
            await page.fill('#password', PASS);
        }
        
        await Promise.all([
            page.waitForURL('**/student.html', { timeout: 60000 }),
            page.click('#sovereign-login-form button[type="submit"]')
        ]).catch(async () => {
            if (await page.isVisible('#login-error')) {
                const msg = await page.innerText('#login-error');
                throw new Error(`Auth Rejected: ${msg}`);
            }
            throw new Error("Navigation Timeout: Student Hub failed to load.");
        });
        
        console.log(`[AUTH] ✅ Session Established: Class 10.`);

        // --- 2. CHAPTER SCAN ---
        for (const subject of SUBJECTS) {
            console.log(`\n[SUBJECT] 📁 Auditing: ${subject}`);
            await page.goto(`${BASE_URL}/app/consoles/student.html`);
            await page.click('#start-new-quiz-btn');
            await page.waitForURL('**/curriculum.html');

            const subjectCard = page.locator('#subject-grid > div', { hasText: subject }).first();
            await subjectCard.click();
            await page.waitForURL('**/chapter-selection.html');

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

            console.log(`   [FLOW] Found ${chapters.length} chapters. Starting 'Simple' attempts...`);

            for (const chapter of chapters) {
                process.stdout.write(`      > ${chapter.title.padEnd(42)} `);
                try {
                    await page.goto(page.url()); 
                    await chapterCards.nth(chapter.index).click();
                    
                    const modal = page.locator('#symmetric-difficulty-modal');
                    await modal.waitFor({ state: 'visible' });
                    await modal.getByRole('button', { name: /Simple/i }).click();
                    
                    await page.waitForURL('**/quiz-engine.html');
                    await page.waitForSelector('#quiz-content:not(.hidden)', { timeout: 30000 });

                    // Auto-take logic
                    let quizActive = true;
                    while (quizActive) {
                        await page.locator('#question-list label').first().click();
                        if (await page.locator('#submit-btn:not(.hidden)').count() > 0) {
                            quizActive = false;
                        } else {
                            await page.click('#next-btn');
                            await page.waitForTimeout(50);
                        }
                    }

                    page.once('dialog', d => d.accept().catch(() => {}));
                    await page.click('#submit-btn');
                    
                    await page.waitForSelector('#score-display', { state: 'visible' });
                    const score = await page.innerText('#score-display');
                    
                    process.stdout.write(`✅ [${score}]\n`);
                    report += `| ${subject} | ${chapter.title} | ${chapter.tableId} | ✅ Pass | ${score} |\n`;

                } catch (quizErr) {
                    process.stdout.write(`❌ ERROR\n`);
                    report += `| ${subject} | ${chapter.title} | ${chapter.tableId} | ❌ Fail | ${quizErr.message.substring(0, 30)} |\n`;
                }
            }
        }
    } catch (fatal) {
        console.error(`\n[FATAL] 🛑 Audit Halted: ${fatal.message}`);
        report += `\n**Audit Crash:** ${fatal.message}\n`;
    } finally {
        fs.appendFileSync(REPORT_PATH, report);
        await browser.close();
        console.log("\n[AGENT] 🏁 Scan finished. Matrix saved to report.md.");
    }
}

module.exports = runCurriculumAgent;
