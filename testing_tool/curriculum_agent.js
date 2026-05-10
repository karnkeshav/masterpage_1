const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const DEFAULT_PASSWORD = 'Ready4Exam@2026';
const REPORT_PATH = 'report.md';

// Strict Scope: Class 10, Simple Difficulty, Specific Subjects
const STUDENT = { email: 'ready4urexam+s.10.a@gmail.com', grade: '10' };
const SUBJECTS = ['Mathematics', 'Science', 'Social Science'];

async function runCurriculumAgent() {
    console.log("\n[SYSTEM] 🛡️ Starting Class 10 High-Fidelity Audit...");
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Set a generous timeout for Firebase profile-sync operations
    page.setDefaultTimeout(60000); 

    let report = '\n## Class 10 Curriculum Integrity Report\n\n';
    report += '| Subject | Chapter | Table ID | Status | Performance |\n';
    report += '| :--- | :--- | :--- | :--- | :--- |\n';

    try {
        // --- AUTHENTICATION WITH STABILITY GUARD ---
        console.log(`[AUTH] 🔑 Accessing Portal for ${STUDENT.email}...`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        
        // WAIT for the 200ms "Autofill Killer" in index-auth.js to settle
        await page.waitForTimeout(500); 

        await page.fill('#username', STUDENT.email);
        await page.fill('#password', DEFAULT_PASSWORD);
        
        console.log("[AUTH] 🚀 Submitting Credentials...");
        await Promise.all([
            page.waitForURL('**/student.html', { timeout: 60000 }),
            page.click('#sovereign-login-form button[type="submit"]')
        ]).catch(async () => {
            const errorVisible = await page.isVisible('#login-error');
            if (errorVisible) {
                const msg = await page.innerText('#login-error');
                throw new Error(`Auth Rejected: ${msg}`);
            }
            throw new Error("Navigation Timeout: Check if routeUser() is hanging.");
        });
        
        console.log(`[AUTH] ✅ Session Established: Class 10 Hub.`);

        for (let i = 0; i < SUBJECTS.length; i++) {
            const subject = SUBJECTS[i];
            const progress = Math.round((i / SUBJECTS.length) * 100);
            console.log(`\n[${progress}%] 📁 Scanning Subject: ${subject}`);
            
            // Navigate via the "Knowledge Hub" flow
            await page.goto(`${BASE_URL}/app/consoles/student.html`);
            await page.click('#start-new-quiz-btn');
            await page.waitForURL('**/curriculum.html');

            const subjectCard = page.locator('#subject-grid > div', { hasText: subject }).first();
            if (await subjectCard.count() === 0) {
                console.log(`   [WARN] ${subject} missing from grid.`);
                report += `| ${subject} | — | — | ❌ Missing | Card not found in Hub |\n`;
                continue;
            }
            await subjectCard.click();
            await page.waitForURL('**/chapter-selection.html');

            // Discover Chapters (Smart Locator)
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
                process.stdout.write(`      > ${chapter.title.padEnd(40)} `);
                try {
                    await page.goto(page.url()); // Clear modal state
                    await chapterCards.nth(chapter.index).click();
                    
                    const modal = page.locator('#symmetric-difficulty-modal');
                    await modal.waitFor({ state: 'visible' });
                    await modal.getByRole('button', { name: /Simple/i }).click();
                    
                    await page.waitForURL('**/quiz-engine.html');
                    await page.waitForSelector('#quiz-content:not(.hidden)', { timeout: 30000 });

                    // Automated Taker
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
                    
                    await page.waitForSelector('#score-display', { state: 'visible', timeout: 15000 });
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
        console.error(`\n[FATAL] 🛑 Audit Interrupted: ${fatal.message}`);
        report += `\n**Audit Crash:** ${fatal.message}\n`;
    } finally {
        fs.appendFileSync(REPORT_PATH, report);
        await browser.close();
        console.log("\n[SYSTEM] 🏁 Class 10 Audit Complete. Results in report.md.");
    }
}

module.exports = runCurriculumAgent;
