const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'http://localhost:8080';
const USER = 's.10.a';
const PASS = 'Ready4Exam@2026';
const REPORT_PATH = 'report.md';
const SUBJECTS = ['Mathematics', 'Science', 'Social Science'];

async function runCurriculumAgent() {
    console.log("\n[SYSTEM] 🛡️ Starting Class 10 Module-Injection Audit...");
    
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    let report = '\n## Class 10 Curriculum Integrity Matrix\n\n';
    report += '| Subject | Chapter | Table ID | Status | Outcome |\n';
    report += '| :--- | :--- | :--- | :--- | :--- |\n';

    try {
        // --- STEP 1: LOAD ENVIRONMENT ---
        console.log(`[INIT] 🌐 Loading Application Environment...`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });

        // --- STEP 2 & 3: INJECT AUTH LOGIC ---
        console.log(`[AUTH] 💉 Injecting Sovereign Identity: ${USER}...`);
        
        const loginResult = await page.evaluate(async ({ u, p }) => {
            // Dynamically import the app's internal auth module
            const authModule = await import('/js/auth-paywall.js');
            const configModule = await import('/js/config.js');
            
            try {
                // Call the internal auth bridge directly (bypasses the HTML form)
                await authModule.authenticateWithCredentials(u, p);
                
                // Get the initialized client to verify state
                const { auth } = await configModule.getInitializedClients();
                if (auth.currentUser) {
                    // Manually trigger the app's routing logic
                    await authModule.routeUser(auth.currentUser);
                    return { success: true };
                }
                return { success: false, error: "Firebase session not established." };
            } catch (err) {
                return { success: false, error: err.message };
            }
        }, { u: USER, p: PASS });

        if (!loginResult.success) {
            throw new Error(`Injection Failed: ${loginResult.error}`);
        }

        // --- STEP 4: VERIFY REDIRECTION ---
        console.log("[AUTH] 🚀 Waiting for internal routeUser redirect...");
        await page.waitForURL('**/student.html', { timeout: 45000 });
        console.log(`[AUTH] ✅ Dashbaord Verified. Identity: Class 10.`);

        // --- STEP 5: CURRICULUM AUDIT ---
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

            console.log(`   [FLOW] Found ${chapters.length} chapters. Running scans...`);

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

                    // Quiz Taker Logic
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
        console.log("\n[SYSTEM] 🏁 Audit cycle finished. Report updated.");
    }
}

module.exports = runCurriculumAgent;
