const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CFG = {
  baseUrl: 'https://karnkeshav.github.io/masterpage_1',
  username: 's.10.a',
  password: 'Ready4Exam@2026',
  subjects: ['Science', 'Mathematics', 'Social Science'],
  slowMo: 150, // Human-like delay
  timeout: 60000,
  reportPath: path.join(__dirname, 'quiz_bot_report.md'),
};

const results = [];
const botStart = Date.now();

// --- Utility Functions ---
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runQuizAudit() {
  log('🤖 Starting Pure UI-Reactive Audit...');
  const browser = await chromium.launch({ headless: false, slowMo: CFG.slowMo });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(CFG.timeout);

  try {
    // 1. Login Phase (Bypassing the index-auth.js race condition)
    await page.goto(`${CFG.baseUrl}/index.html`);
    await sleep(1000); // Wait for app security scripts to settle
    await page.fill('#username', CFG.username);
    await page.fill('#password', CFG.password);
    await page.click('#sovereign-login-form button');
    await page.waitForURL('**/student.html');
    log('✅ Logged in successfully.');

    for (const subject of CFG.subjects) {
      log(`\n📚 Auditing Subject: ${subject}`);
      
      // Navigate to Curriculum -> Chapter Selection
      await page.goto(`${CFG.baseUrl}/app/consoles/student.html`);
      await page.click('#start-new-quiz-btn');
      await page.waitForURL('**/curriculum.html');
      
      // Click Subject Card
      await page.click(`#subject-grid div:has-text("${subject}")`);
      await page.waitForURL('**/chapter-selection.html');
      
      // Get all Chapters
      const chapters = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('div[onclick^="startQuiz"]')).map(c => {
          const m = c.getAttribute('onclick').match(/'([^']*)'/g);
          return { id: m[0].replace(/'/g, ''), title: c.querySelector('h4').innerText };
        });
      });
      log(`   Found ${chapters.length} chapters.`);

      for (const chapter of chapters) {
        log(`   📝 Starting Chapter: ${chapter.title}`);
        
        // Trigger Quiz & Select Simple
        await page.click(`div[onclick*="${chapter.id}"]`);
        const simpleBtn = page.locator('#symmetric-difficulty-modal button').filter({ hasText: 'Simple' });
        await simpleBtn.waitFor({ state: 'visible' });
        await simpleBtn.click();

        // 3. THE CRITICAL WAIT: Wait for "Preparing worksheet" to vanish
        log('      ⏳ Waiting for questions to render...');
        await page.waitForURL('**/quiz-engine.html');
        
        // Wait until the radio buttons are actually present in the DOM
        await page.waitForSelector('#question-list input[type="radio"]', { state: 'attached', timeout: 30000 });
        
        // 4. Answer Loop
        const stats = await performQuiz(page);
        results.push({ subject, chapter: chapter.title, ...stats, status: 'Success' });
        log(`      ✅ Finished: ${stats.score}/${stats.total}`);

        // Go back to selection for next chapter
        await page.goto(`${CFG.baseUrl}/app/chapter-selection.html?subject=${encodeURIComponent(subject)}&grade=10`);
      }
    }
  } catch (err) {
    log(`❌ Fatal Error: ${err.message}`);
  } finally {
    generateReport();
    await browser.close();
  }
}

async function performQuiz(page) {
  let finished = false;
  let questionsAnswered = 0;

  while (!finished) {
    // Wait for the UI to be ready for interaction
    await page.waitForSelector('#question-list label', { state: 'visible' });
    
    // Pick the first option (Pure Black-Box behavior)
    await page.locator('#question-list label').first().click();
    questionsAnswered++;

    // Check if Submit is visible, otherwise click Next
    const submitBtn = page.locator('#submit-btn:not(.hidden)');
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      finished = true;
    } else {
      await page.click('#next-btn');
      await sleep(300); // UI transition delay
    }
  }

  // Extract results from the score screen
  await page.waitForSelector('#score-display', { state: 'visible' });
  const scoreText = await page.innerText('#score-display');
  const match = scoreText.match(/(\d+)\s*\/\s*(\d+)/);
  
  return {
    score: match ? match[1] : 0,
    total: match ? match[2] : questionsAnswered
  };
}

function generateReport() {
  let md = `# Audit Report: ${new Date().toLocaleDateString()}\n\n`;
  md += `| Subject | Chapter | Score | Status |\n|---|---|---|---|\n`;
  results.forEach(r => {
    md += `| ${r.subject} | ${r.chapter} | ${r.score}/${r.total} | ${r.status} |\n`;
  });
  fs.writeFileSync(CFG.reportPath, md);
  log(`📄 Report saved to ${CFG.reportPath}`);
}

runQuizAudit();
