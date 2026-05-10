const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const HARDCODED_USER = 's.10.a';
const HARDCODED_PASS = 'Ready4Exam@2026';
const REPORT_PATH = 'report.md';

const SUBJECTS = ['Mathematics', 'Science', 'Social Science'];

async function runCurriculumAgent() {
    console.log("\n[SYSTEM] 🛡️ Initializing Class 10 Sovereign Audit (High-Fidelity)...");
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Set global timeout for slow Firestore/Firebase operations
    page.setDefaultTimeout(60000); 

    let report = '\n## Class 10 Curriculum Integrity Report\n\n';
    report += '| Subject | Chapter | Table ID | Status | Outcome |\n';
    report += '| :--- | :--- | :--- | :--- | :--- |\n';

    try {
        // --- 1. SMART AUTHENTICATION ---
        console.log(`[AUTH] 🔑 Accessing Portal...`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });

        // STABILITY GUARD: Wait for index-auth.js 200ms "field killer" to finish
        console.log("[AUTH] ⏳ Waiting for application stabilization...");
        await page.waitForTimeout(1000); 

        await page.fill('#username', HARDCODED_USER);
        await page.fill('#password', HARDCODED_PASS);
        
        console.log("[AUTH] 🚀 Submitting Sovereign Credentials...");
        await page.click('#sovereign-login-form button[type="submit"]');

        // STATE MONITOR: Race between Redirect and Error Message
        await Promise.race([
            page.waitForURL('**/student.html', { timeout: 45000 }),
            page.waitForSelector('#login-error:not(.hidden)', { timeout: 45000 }).then(async () => {
                const msg = await page.innerText('#login-error');
                throw new Error(`Login Rejected by App: "${msg}"`);
            })
        ]);
        
        console.log(`[AUTH] ✅ Session Established: Class 10 Hub.`);

        // --- 2. CURRICULUM AUDIT ---
        for (const subject of SUBJECTS) {
            console.log(`\n[SUBJECT] 📁 Auditing: ${subject}`);
            
            await page.goto(`${BASE_URL}/app/consoles/student.html`);
            await page.click('#start-new-quiz-btn');
            await page.waitForURL('**/curriculum.html');

            const subjectCard = page.locator('#subject-grid > div', { hasText: subject }).first();
            if (await subjectCard.count() === 0) {
                console.log(`   [WARN] ${subject} missing from grid.`);
                report += `| ${subject} | — | — | ❌ Missing | Card not found |\n`;
                continue;
            }
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

            console.log(`   [FLOW] Found ${chapters.length} chapters. Running 'Simple' attempts...`);

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
                            await page.waitForTimeout(100);
                        }
                    }

                    page.once('dialog', d => d.accept().catch(() => {}));
                    await page.click('#submit-btn');
                    
                    await page.waitForSelector('#score-display', { state: 'visible' });
                    const score = await page.innerText('#score-display');
                    
                    process.stdout.write(`✅ [${score}]\n`);
                    report += `| ${subject} | ${chapter.title} | ${chapter.tableId} | ✅ Pass | ${score} |\n`;

                } catch (quizErr) {
                    process.stdout.write(`❌ FAIL\n`);
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
        console.log("\n[SYSTEM] 🏁 Audit cycle finished. See report.md.");
    }
}

module.exports = runCurriculumAgent;
