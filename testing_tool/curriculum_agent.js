const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const HARDCODED_USER = 's.10.a';
const HARDCODED_PASS = 'Ready4Exam@2026';
const REPORT_PATH = 'report.md';

const SUBJECTS = ['Mathematics', 'Science', 'Social Science'];

async function runCurriculumAgent() {
    console.log("\n[SYSTEM] 🛡️ Initializing Class 10 Sovereign Audit...");
    console.log(`[CONFIG] Identity: ${HARDCODED_USER} | Difficulty: Simple`);
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(60000); // 60s to handle Firebase sync latency

    let report = '\n## Class 10 Curriculum Integrity Report\n\n';
    report += '| Subject | Chapter | Table ID | Status | Score |\n';
    report += '| :--- | :--- | :--- | :--- | :--- |\n';

    try {
        // --- 1. AUTHENTICATION & SESSION SYNC ---
        console.log(`[AUTH] 🔑 Accessing Portal...`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });

        // Check if we are already auto-routing (session persistence)
        if (page.url().includes('student.html')) {
            console.log("[AUTH] ⚡ Session pre-active. Auto-routing to Hub.");
        } else {
            // Wait for index-auth.js to finish its 200ms clear-field timeout
            await page.waitForTimeout(1000); 

            await page.fill('#username', HARDCODED_USER);
            await page.fill('#password', HARDCODED_PASS);
            
            console.log("[AUTH] 🚀 Submitting Sovereign Credentials...");
            await Promise.all([
                page.waitForURL('**/student.html', { timeout: 60000 }),
                page.click('#sovereign-login-form button[type="submit"]')
            ]).catch(async () => {
                const errorVisible = await page.isVisible('#login-error');
                if (errorVisible) {
                    const msg = await page.innerText('#login-error');
                    throw new Error(`Auth Rejected: ${msg}`);
                }
                throw new Error("Navigation Timeout: Student Hub failed to load.");
            });
        }
        console.log(`[AUTH] ✅ Success. Class 10 session established.`);

        // --- 2. CURRICULUM SCAN ---
        for (const subject of SUBJECTS) {
            console.log(`\n[SUBJECT] 📁 Auditing: ${subject}`);
            
            await page.goto(`${BASE_URL}/app/consoles/student.html`);
            await page.click('#start-new-quiz-btn');
            await page.waitForURL('**/curriculum.html');

            const subjectCard = page.locator('#subject-grid > div', { hasText: subject }).first();
            if (await subjectCard.count() === 0) {
                console.log(`   [WARN] ${subject} missing from Knowledge Hub.`);
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

            console.log(`   [FLOW] ${chapters.length} chapters detected. Starting Simple attempts...`);

            for (const chapter of chapters) {
                process.stdout.write(`      > ${chapter.title.padEnd(42)} `);
                try {
                    await page.goto(page.url()); // Modal reset
                    await chapterCards.nth(chapter.index).click();
                    
                    const modal = page.locator('#symmetric-difficulty-modal');
                    await modal.waitFor({ state: 'visible' });
                    await modal.getByRole('button', { name: /Simple/i }).click();
                    
                    await page.waitForURL('**/quiz-engine.html');
                    await page.waitForSelector('#quiz-content:not(.hidden)', { timeout: 30000 });

                    // Quiz Automation
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
        console.log("\n[SYSTEM] 🏁 Audit cycle finished. Matrix saved to report.md.");
    }
}

module.exports = runCurriculumAgent;
