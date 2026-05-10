const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const DEFAULT_PASSWORD = process.env.TEST_STUDENT_PASSWORD || 'Ready4Exam@2026';
const REPORT_PATH = process.env.REPORT_PATH || 'report.md';
const LOGIN_TIMEOUT_MS = Number(process.env.LOGIN_TIMEOUT_MS || 30000);
const MAX_CHAPTERS_PER_SUBJECT = Number(process.env.MAX_CHAPTERS_PER_SUBJECT || 0);
const DIFFICULTIES = (process.env.DIFFICULTIES || 'Simple,Medium,Advanced')
    .split(',')
    .map(level => level.trim())
    .filter(Boolean);

const STUDENTS = [
    { email: 'ready4urexam+s.6.a@gmail.com',    grade: '6',  subjects: ['Science', 'Mathematics'] },
    { email: 'ready4urexam+s.7.a@gmail.com',    grade: '7',  subjects: ['Science', 'Mathematics'] },
    { email: 'ready4urexam+s.8.a@gmail.com',    grade: '8',  subjects: ['Science', 'Mathematics'] },
    { email: 'ready4urexam+s.9.a@gmail.com',    grade: '9',  subjects: ['Science', 'Mathematics'] },
    { email: 'ready4urexam+s.10.a@gmail.com',   grade: '10', subjects: ['Science', 'Mathematics'] },
    { email: 'ready4urexam+s.11.pcm@gmail.com', grade: '11', subjects: ['Physics', 'Chemistry', 'Mathematics'] },
    { email: 'ready4urexam+s.11.pcb1@gmail.com',grade: '11', subjects: ['Physics', 'Chemistry', 'Biology'] },
    { email: 'ready4urexam+s.12.pcm@gmail.com', grade: '12', subjects: ['Physics', 'Chemistry', 'Mathematics'] },
    { email: 'ready4urexam+s.12.pcb1@gmail.com',grade: '12', subjects: ['Physics', 'Chemistry', 'Biology'] },
];

function sanitizeCell(value) {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .replace(/\|/g, '/')
        .trim()
        .slice(0, 140);
}

async function loginAsStudent(page, student) {
    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForSelector('#username', { state: 'visible', timeout: LOGIN_TIMEOUT_MS });
    await page.fill('#username', student.email);
    await page.fill('#password', DEFAULT_PASSWORD);

    await Promise.all([
        page.waitForLoadState('domcontentloaded').catch(() => undefined),
        page.click('#sovereign-login-form button[type="submit"]'),
    ]);

    const loginOutcome = await Promise.race([
        page.waitForURL(url => /\/app\/consoles\/student\.html(?:$|[?#])/.test(url.pathname + url.search), { timeout: LOGIN_TIMEOUT_MS })
            .then(() => ({ ok: true })),
        page.locator('#login-error:not(.hidden)').waitFor({ state: 'visible', timeout: LOGIN_TIMEOUT_MS })
            .then(async () => ({ ok: false, message: await page.locator('#login-error').innerText() })),
    ]).catch(error => ({ ok: false, message: error.message }));

    if (!loginOutcome.ok) {
        const currentUrl = page.url();
        const errorText = await page.locator('#login-error').innerText().catch(() => '');
        throw new Error(`Student console was not reached. URL=${currentUrl} ${errorText || loginOutcome.message || ''}`);
    }

    await page.waitForSelector('#start-new-quiz-btn', { state: 'visible', timeout: 20000 });
}

async function openCurriculumFromConsole(page, grade) {
    await page.goto(`${BASE_URL}/app/consoles/student.html`, { waitUntil: 'load' });
    await page.waitForSelector('#start-new-quiz-btn', { state: 'visible', timeout: 20000 });

    const href = await page.getAttribute('#start-new-quiz-btn', 'href');
    if (!href || !href.includes(`grade=${grade}`)) {
        throw new Error(`New Quiz link did not resolve for grade ${grade}. href=${href}`);
    }

    await page.click('#start-new-quiz-btn');
    await page.waitForURL(url => /\/app\/curriculum\.html/.test(url.pathname), { timeout: 15000 });
    await page.waitForSelector('#subject-grid', { state: 'visible', timeout: 15000 });
}

async function selectSubject(page, subject) {
    const subjectCard = page.locator('#subject-grid > div', { hasText: subject }).first();
    if (await subjectCard.count() === 0) {
        return false;
    }

    await subjectCard.click();
    await page.waitForURL(url => /\/app\/chapter-selection\.html/.test(url.pathname), { timeout: 15000 });
    await page.waitForSelector('#content-area', { state: 'visible', timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');
    return true;
}

async function discoverChapters(page) {
    const cards = page.locator('[onclick^="startQuiz"]');
    await cards.first().waitFor({ state: 'visible', timeout: 15000 });

    const chapters = await cards.evaluateAll(nodes => nodes.map((node, index) => {
        const onclick = node.getAttribute('onclick') || '';
        const tableMatch = onclick.match(/startQuiz\('([^']*)'/);
        const title = node.querySelector('h4')?.textContent?.trim() || `Chapter ${index + 1}`;
        const tableId = tableMatch ? tableMatch[1] : '';
        return { index, title, tableId };
    }));

    return MAX_CHAPTERS_PER_SUBJECT > 0 ? chapters.slice(0, MAX_CHAPTERS_PER_SUBJECT) : chapters;
}

async function launchChapterDifficulty(page, chapter, difficulty) {
    const chapterCards = page.locator('[onclick^="startQuiz"]');
    await chapterCards.nth(chapter.index).click();

    const modal = page.locator('#symmetric-difficulty-modal');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await modal.getByRole('button', { name: new RegExp(difficulty, 'i') }).click();

    await page.waitForURL(url => /\/app\/quiz-engine\.html/.test(url.pathname), { timeout: 15000 });
}

async function answerAndSubmitQuiz(page) {
    await page.waitForSelector('#quiz-content:not(.hidden), #paywall-screen:not(.hidden), #status-message', { timeout: 25000 });

    if (await page.locator('#paywall-screen:not(.hidden)').count()) {
        return { status: '🔐 Paywall', score: 'N/A' };
    }

    const visibleQuiz = page.locator('#quiz-content:not(.hidden)');
    await visibleQuiz.waitFor({ state: 'visible', timeout: 25000 });
    await page.waitForSelector('#question-list label', { timeout: 15000 });

    let safety = 100;
    while (safety-- > 0) {
        const firstOption = page.locator('#question-list label').first();
        await firstOption.click();

        if (await page.locator('#submit-btn:not(.hidden)').count()) {
            break;
        }

        await page.click('#next-btn');
        await page.waitForTimeout(100);
    }

    if (safety <= 0) {
        throw new Error('Quiz pagination safety limit reached before submit button appeared.');
    }

    page.once('dialog', dialog => dialog.accept().catch(() => undefined));
    await page.click('#submit-btn');
    await page.waitForSelector('#results-screen:not(.hidden) #score-display', { state: 'visible', timeout: 20000 });

    const score = (await page.innerText('#score-display')).trim().replace(/\s+/g, ' ');
    return { status: '✅ Success', score };
}

async function runCurriculumAgent() {
    console.log('🚀 Starting Curriculum Integrity Agent...');

    let report = '\n## Curriculum Integrity Agent Results\n\n';
    report += `Config: difficulties=${DIFFICULTIES.join(', ')}, maxChaptersPerSubject=${MAX_CHAPTERS_PER_SUBJECT || 'all'}\n\n`;
    report += '| Student | Grade | Subject | Chapter | Table | Tier | Status | Score / Details |\n';
    report += '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n';

    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

    for (const student of STUDENTS) {
        console.log(`\n[AUTH] Logging in as: ${student.email}`);

        const context = await browser.newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(20000);

        page.on('console', msg => {
            if (msg.type() === 'error') console.log(`[BROWSER:${student.email}] ${msg.text()}`);
        });

        try {
            await loginAsStudent(page, student);
            console.log(`[SUCCESS] Authenticated ${student.email}`);

            for (const subject of student.subjects) {
                try {
                    await openCurriculumFromConsole(page, student.grade);
                    const subjectFound = await selectSubject(page, subject);
                    if (!subjectFound) {
                        report += `| ${student.email} | ${student.grade} | ${subject} | — | — | — | ⚠️ Missing Subject | Subject card was not present |\n`;
                        continue;
                    }

                    const chapterSelectionUrl = page.url();
                    const chapters = await discoverChapters(page);
                    if (chapters.length === 0) {
                        report += `| ${student.email} | ${student.grade} | ${subject} | — | — | — | ⚠️ No Chapters | No chapter cards rendered |\n`;
                        continue;
                    }

                    console.log(`[FLOW] ${student.grade} ${subject}: ${chapters.length} chapter(s)`);

                    for (const chapter of chapters) {
                        for (const tier of DIFFICULTIES) {
                            console.log(`[QUIZ] ${subject} > ${chapter.title} [${tier}]`);
                            try {
                                await page.goto(chapterSelectionUrl, { waitUntil: 'load' });
                                await page.waitForSelector('[onclick^="startQuiz"]', { state: 'visible', timeout: 15000 });
                                await launchChapterDifficulty(page, chapter, tier);
                                const result = await answerAndSubmitQuiz(page);
                                report += `| ${student.email} | ${student.grade} | ${sanitizeCell(subject)} | ${sanitizeCell(chapter.title)} | ${sanitizeCell(chapter.tableId)} | ${tier} | ${result.status} | ${sanitizeCell(result.score)} |\n`;
                            } catch (error) {
                                const locked  = await page.locator('text=/LOCKED|Mastery Alert/i').count().catch(() => 0);
                                const paywall = await page.locator('#paywall-screen:not(.hidden)').count().catch(() => 0);
                                const status  = locked ? '🔒 Locked' : paywall ? '🔐 Paywall' : '❌ Error';
                                report += `| ${student.email} | ${student.grade} | ${sanitizeCell(subject)} | ${sanitizeCell(chapter.title)} | ${sanitizeCell(chapter.tableId)} | ${tier} | ${status} | ${sanitizeCell(error.message)} |\n`;
                            }
                        }
                    }
                } catch (subjectError) {
                    report += `| ${student.email} | ${student.grade} | ${sanitizeCell(subject)} | — | — | — | ❌ Subject Flow Error | ${sanitizeCell(subjectError.message)} |\n`;
                }
            }
        } catch (err) {
            console.error(`[ERROR] Execution failed for ${student.email}: ${err.message}`);
            report += `| ${student.email} | ${student.grade} | — | — | — | — | ❌ Auth Failed | ${sanitizeCell(err.message)} |\n`;
        } finally {
            await context.close();
        }
    }

    await browser.close();
    fs.appendFileSync(REPORT_PATH, report);
    console.log('\n🏁 Agent Simulation Finished.');
}

module.exports = { runCurriculumAgent };
