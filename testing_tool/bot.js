#!/usr/bin/env node
/**
 * Ready4Exam Quiz Bot — testing_tool/bot.js
 *
 * Flow per subject:
 *   curriculum.html → click subject → chapter-selection.html
 *   Count N chapters, then loop i = 0..N-1:
 *     chapter-selection.html → click chapter[i]
 *     → difficulty modal → Simple
 *     → quiz-engine.html → answer all questions → submit
 *     → dismiss alert → navigate directly back to chapter-selection.html
 *   When all chapters done → back to curriculum.html → next subject
 *
 * Usage:
 *   node bot.js
 *   HEADLESS=true node bot.js
 */
'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const CFG = {
  baseUrl      : 'https://karnkeshav.github.io/masterpage_1',
  username     : 's.10.a',
  password     : 'Ready4Exam@2026',
  subjects     : ['Science', 'Mathematics', 'Social Science'],
  headless     : process.env.HEADLESS === 'true',
  slowMo       : 80,
  pageTimeout  : 60_000,
  quizTimeout  : 120_000,
  screenshotDir: path.join(__dirname, 'bot_screenshots'),
  reportPath   : path.join(__dirname, 'quiz_bot_report.md'),
};

const latency = [];
const results = [];
const botStart = Date.now();

const iso = () => new Date().toISOString().replace('T', ' ').split('.')[0];
function log(msg, icon = '  ') { console.log(`[${iso()}] ${icon} ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

const _m = {};
function mark(id)  { _m[id] = Date.now(); }
function measure(label, id) {
  const ms = Date.now() - (_m[id] ?? Date.now());
  latency.push({ label, ms, ts: iso() });
  log(`⏱  ${label}: ${ms} ms`);
  return ms;
}

// Prevent a dialog-race unhandled rejection from killing the process
process.on('unhandledRejection', reason => {
  log(`[unhandledRejection] ${reason} — continuing`, '⚠️');
});

// Random A / B / C / D
const OPTIONS = ['A', 'B', 'C', 'D'];
function rnd() { return OPTIONS[Math.floor(Math.random() * 4)]; }

// Radio inputs are class="hidden" — use state:'attached', never 'visible'
async function waitForRadios(page) {
  await page.waitForSelector('#question-list input[type="radio"]', {
    state: 'attached', timeout: CFG.quizTimeout,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────
async function login(page) {
  log('Opening homepage…', '🔗');
  mark('home');
  await page.goto(CFG.baseUrl + '/index.html', {
    waitUntil: 'domcontentloaded', timeout: CFG.pageTimeout,
  });
  measure('Homepage load', 'home');

  await page.evaluate(() => {
    ['username', 'password'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  });
  await sleep(300);
  await page.fill('#username', CFG.username);
  await page.fill('#password', CFG.password);

  log('Logging in…', '🔐');
  mark('login');
  await page.click('#sovereign-login-form button');
  await page.waitForURL('**/consoles/student.html**', { timeout: CFG.pageTimeout });
  measure('Login → student console', 'login');
  await page.waitForSelector('#app:not(.hidden)', { timeout: CFG.pageTimeout });
  log('Student console ready.');
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATE TO CHAPTER-SELECTION FOR A SUBJECT
// Called at the START of each subject AND before each chapter in the loop.
// Direct page.goto — no dependency on any back button.
// ─────────────────────────────────────────────────────────────────────────────
async function goToChapterSelection(page, subject, grade) {
  mark('chapsel');
  const url = `${CFG.baseUrl}/app/chapter-selection.html`
            + `?subject=${encodeURIComponent(subject)}&grade=${grade}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CFG.pageTimeout });
  // Wait until chapter cards are in the DOM
  await page.waitForFunction(() => {
    const area = document.getElementById('content-area');
    return area && area.querySelectorAll('div[onclick^="startQuiz"]').length > 0;
  }, { timeout: CFG.pageTimeout });
  measure(`→ chapter-selection (${subject})`, 'chapsel');
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPE CHAPTER LIST  (called once per subject to count + store metadata)
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeChapters(page) {
  return await page.evaluate(() =>
    Array.from(document.querySelectorAll('#content-area div[onclick^="startQuiz"]'))
      .map((card, index) => {
        const m = card.getAttribute('onclick')
          .match(/startQuiz\('([^']*)',\s*'([^']*)',\s*'([^']*)'\)/);
        return m ? { tableId: m[1], title: m[2], grade: m[3], index } : null;
      }).filter(Boolean)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANSWER ALL QUESTIONS AND SUBMIT
// Returns once the results screen is visible and the alert has been dismissed.
// Does NOT navigate anywhere — navigation is the caller's job.
// ─────────────────────────────────────────────────────────────────────────────
async function answerAndSubmit(page, chapterTitle) {
  let total  = 0;
  const qMs  = [];
  const MAX  = 200;

  for (let safety = 0; safety < MAX; safety++) {

    // Wait for radio buttons to be attached in the DOM
    await waitForRadios(page);

    const t0 = Date.now();

    // Read counter  "N / Total"
    const counter = await page
      .$eval('#question-counter', el => el.textContent.trim())
      .catch(() => '1/1');
    const [curStr, totStr] = counter.split('/');
    const current = parseInt(curStr) || safety + 1;
    total         = parseInt(totStr) || 1;

    const choice = rnd();
    log(`    Q${current}/${total}  →  option ${choice}`);

    // Click via the <label> wrapper (the visible element around the hidden radio)
    await page.evaluate(preferred => {
      const radios = Array.from(
        document.querySelectorAll('#question-list input[type="radio"]')
      );
      if (!radios.length) return;
      const target = radios.find(r => r.value === preferred) || radios[0];
      const label  = target.closest('label');
      if (label) label.click(); else target.click();
    }, choice);

    qMs.push(Date.now() - t0);
    await sleep(250);

    // ── Submit button visible? ─────────────────────────────────────────────
    const canSubmit = await page.evaluate(() => {
      const b = document.getElementById('submit-btn');
      return b && !b.classList.contains('hidden');
    });

    if (canSubmit) {
      log(`    Submitting "${chapterTitle}"…`);
      mark('sub');
      await page.click('#submit-btn');

      // Wait for results screen
      await page.waitForSelector('#results-screen:not(.hidden)', {
        timeout: CFG.pageTimeout,
      });
      measure(`Submit → results (${chapterTitle})`, 'sub');

      // Allow time for the alert to fire (quiz-engine uses a 300 ms setTimeout)
      await sleep(800);

      const avgMs = qMs.length
        ? Math.round(qMs.reduce((a, b) => a + b, 0) / qMs.length) : 0;
      return { total, avgMs };
    }

    // ── Next button ────────────────────────────────────────────────────────
    const canNext = await page.evaluate(() => {
      const b = document.getElementById('next-btn');
      return b && !b.classList.contains('hidden');
    });
    if (canNext) {
      await page.click('#next-btn');
      await sleep(200);
    } else {
      await sleep(400); // briefly wait for UI to settle
    }
  }

  throw new Error(`Safety cap: no Submit after ${MAX} iterations`);
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN ONE CHAPTER
// ─────────────────────────────────────────────────────────────────────────────
async function runChapter(page, chapter, subject, num, total) {
  log(`\n  [${num}/${total}] "${chapter.title}" (${chapter.tableId})`);

  const entry = {
    subject, chapter: chapter.title, tableId: chapter.tableId, grade: chapter.grade,
    status: 'pending', totalQ: 0, durationMs: 0,
    quizLoadMs: 0, avgAnswerMs: 0, error: null, screenshot: null,
  };
  const t0 = Date.now();

  try {
    // ── Click chapter card by DOM index ──────────────────────────────────────
    mark('ch');
    const clicked = await page.evaluate(idx => {
      const card = document.querySelectorAll(
        '#content-area div[onclick^="startQuiz"]'
      )[idx];
      if (card) { card.click(); return true; }
      return false;
    }, chapter.index);
    if (!clicked) throw new Error('Chapter card not found at index ' + chapter.index);

    // ── Difficulty modal ──────────────────────────────────────────────────────
    await page.waitForSelector('#symmetric-difficulty-modal', { timeout: 12_000 });
    measure(`Chapter → modal (${chapter.title})`, 'ch');
    log('    Difficulty modal appeared');

    // ── Click Simple ──────────────────────────────────────────────────────────
    mark('simple');
    await page.evaluate(() => {
      const modal = document.getElementById('symmetric-difficulty-modal');
      if (!modal) return;
      for (const btn of modal.querySelectorAll('button')) {
        if (btn.textContent.trim() === 'Simple') { btn.click(); return; }
      }
      if (typeof window.launchQuiz === 'function') window.launchQuiz('Simple');
    });

    // ── Wait for quiz-engine URL ──────────────────────────────────────────────
    await page.waitForURL('**/quiz-engine.html**', { timeout: CFG.pageTimeout });

    // ── Wait for first question ───────────────────────────────────────────────
    log('    Waiting for questions…');
    await waitForRadios(page);
    entry.quizLoadMs = measure(`Simple → first question (${chapter.title})`, 'simple');
    log(`    Questions ready in ${entry.quizLoadMs} ms`);

    // ── Answer + submit ───────────────────────────────────────────────────────
    const qr = await answerAndSubmit(page, chapter.title);
    entry.totalQ      = qr.total;
    entry.avgAnswerMs = qr.avgMs;
    entry.status      = 'success';
    log(`    ✅ ${qr.total} questions done (avg ${qr.avgMs} ms/q)`);

  } catch (err) {
    entry.status = 'failed';
    entry.error  = err.message;
    log(`    ❌ FAILED: ${err.message}`, '❌');
    try {
      ensureDir(CFG.screenshotDir);
      const ssPath = path.join(CFG.screenshotDir, `FAIL_${chapter.tableId}.png`);
      await page.screenshot({ path: ssPath, fullPage: true });
      entry.screenshot = `bot_screenshots/FAIL_${chapter.tableId}.png`;
      log(`    📸 ${entry.screenshot}`);
    } catch (_) {}
  }

  entry.durationMs = Date.now() - t0;
  return entry;
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN ALL CHAPTERS FOR ONE SUBJECT
//
// Key design:
//   1. Navigate to chapter-selection once to COUNT chapters (N).
//   2. Loop i = 0 .. N-1:
//        a. Navigate directly to chapter-selection (fresh page load every time)
//        b. Re-scrape so DOM index[i] matches the correct card
//        c. Run that chapter
// ─────────────────────────────────────────────────────────────────────────────
async function runSubject(page, subject) {
  log(`\n${'='.repeat(60)}`);
  log(`  SUBJECT: ${subject.toUpperCase()}`);
  log(`${'='.repeat(60)}`);
  mark(`subj_${subject}`);

  // ── First visit: count chapters ───────────────────────────────────────────
  await goToChapterSelection(page, subject, '10');    // grade will be confirmed below
  const initialList = await scrapeChapters(page);

  if (initialList.length === 0) {
    log('  No chapters — skipping', '⏭️');
    results.push({
      subject, chapter: '(none)', tableId: '', grade: '?',
      status: 'skipped', totalQ: 0, durationMs: 0,
      quizLoadMs: 0, avgAnswerMs: 0, error: 'No chapters found', screenshot: null,
    });
    return;
  }

  const grade     = initialList[0].grade;
  const N         = initialList.length;
  // Store a stable ordered list of { tableId, title, grade } for the loop
  const chapterList = initialList.map(c => ({ tableId: c.tableId, title: c.title, grade: c.grade }));

  log(`  ${N} chapters found for ${subject} (grade ${grade})`);

  // ── Loop: one chapter per iteration ──────────────────────────────────────
  for (let i = 0; i < N; i++) {
    const ch = chapterList[i];

    // Navigate directly to chapter-selection for this subject
    // (fresh load every iteration — avoids stale DOM, avoids needing the back button)
    log(`\n  Navigating to chapter-selection for chapter ${i + 1}/${N}…`);
    await goToChapterSelection(page, subject, grade);

    // Re-scrape to get current DOM index for this chapter
    const fresh = await scrapeChapters(page);
    const target = fresh.find(c => c.tableId === ch.tableId);
    if (!target) {
      log(`  ⚠️  Chapter "${ch.title}" not found on page — skipping`, '⚠️');
      results.push({
        subject, chapter: ch.title, tableId: ch.tableId, grade,
        status: 'failed', totalQ: 0, durationMs: 0,
        quizLoadMs: 0, avgAnswerMs: 0,
        error: 'Chapter card not found after re-scrape', screenshot: null,
      });
      continue;
    }

    const result = await runChapter(page, target, subject, i + 1, N);
    results.push(result);

    // After the quiz, the page is on quiz-engine.html (results screen).
    // The next iteration starts with goToChapterSelection() — no back button needed.
    log(`  Chapter ${i + 1}/${N} done. Moving to next…`);
  }

  measure(`Subject total: ${subject}`, `subj_${subject}`);
  log(`\n  ✅ ${subject} complete — all ${N} chapters processed.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN REPORT
// ─────────────────────────────────────────────────────────────────────────────
function buildReport() {
  const now     = new Date();
  const totalMs = Date.now() - botStart;
  const ok      = results.filter(r => r.status === 'success').length;
  const bad     = results.filter(r => r.status === 'failed').length;
  const skip    = results.filter(r => r.status === 'skipped').length;

  let md = `# Ready4Exam Quiz Bot — Audit Report\n\n`;
  md += `> **Generated:** ${now.toUTCString()}  \n`;
  md += `> **Account:** \`${CFG.username}\` | **Difficulty:** Simple\n\n---\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total chapters | **${results.length}** |\n`;
  md += `| ✅ Completed | **${ok}** |\n`;
  md += `| ❌ Failed | **${bad}** |\n`;
  md += `| ⏭️ Skipped | **${skip}** |\n`;
  md += `| ⏱ Runtime | **${(totalMs / 60000).toFixed(1)} min** |\n\n`;

  md += `## Latency Log\n\n`;
  md += `> 🟢 <1 s  🟡 1–3 s  🔴 >3 s\n\n`;
  md += `| Timestamp | Event | ms |\n|-----------|-------|----|\n`;
  latency.forEach(({ ts, label, ms }) => {
    const d = ms < 1000 ? '🟢' : ms < 3000 ? '🟡' : '🔴';
    md += `| ${ts} | ${label} | ${d} ${ms} |\n`;
  });
  md += '\n';

  for (const subject of CFG.subjects) {
    const rows = results.filter(r => r.subject === subject);
    if (!rows.length) continue;
    md += `## ${subject}\n\n`;
    md += `> ✅ ${rows.filter(r => r.status === 'success').length} `
        + `  ❌ ${rows.filter(r => r.status === 'failed').length}\n\n`;
    md += `| # | Chapter | Table ID | Status | Q count | Load ms | Duration s |\n`;
    md += `|---|---------|----------|--------|---------|---------|------------|\n`;
    rows.forEach((r, i) => {
      const icon = { success: '✅', failed: '❌', skipped: '⏭️' }[r.status] ?? '?';
      md += `| ${i + 1} | ${r.chapter} | \`${r.tableId}\` | ${icon} `
          + `| ${r.totalQ || '—'} | ${r.quizLoadMs || '—'} | ${(r.durationMs / 1000).toFixed(1)} |\n`;
    });
    md += '\n';
  }

  const failed = results.filter(r => r.status === 'failed');
  if (failed.length) {
    md += `## ❌ Failed Chapters\n\n`;
    md += `| Subject | Chapter | Table ID | Error | Fix |\n`;
    md += `|---------|---------|----------|-------|-----|\n`;
    failed.forEach(r => {
      let fix = 'Review screenshot';
      if (/timeout/i.test(r.error))   fix = 'Quiz never rendered — check Supabase table';
      if (/safety cap/i.test(r.error)) fix = 'Submit never appeared — UI bug';
      if (/modal/i.test(r.error))      fix = 'Difficulty modal did not appear';
      md += `| ${r.subject} | ${r.chapter} | \`${r.tableId}\` | ${r.error} | ${fix} |\n`;
    });
    if (failed.some(r => r.screenshot)) md += `\nScreenshots in \`bot_screenshots/\`\n`;
    md += '\n';
  } else {
    md += `## ✅ All Chapters Completed Successfully\n\n`;
  }

  md += `\n---\n*Ready4Exam Quiz Bot — ${now.toUTCString()}*\n`;
  return md;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  log('Quiz Bot starting', '🤖');
  log(`Subjects : ${CFG.subjects.join(', ')}`);
  log(`Headless : ${CFG.headless}`);

  const browser = await chromium.launch({
    headless: CFG.headless,
    slowMo  : CFG.slowMo,
    args    : ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    viewport : { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
             + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(CFG.pageTimeout);

  // Auto-dismiss every native alert/confirm/prompt
  page.on('dialog', async dialog => {
    log(`    [dialog] "${dialog.message().split('\n')[0]}" — accepted`);
    await dialog.accept();
  });

  try {
    await login(page);

    for (const subject of CFG.subjects) {
      try {
        await runSubject(page, subject);
      } catch (err) {
        log(`Subject crash (${subject}): ${err.message}`, '❌');
        console.error(err.stack);
        results.push({
          subject, chapter: 'ALL', tableId: '', grade: '?',
          status: 'failed', totalQ: 0, durationMs: 0,
          quizLoadMs: 0, avgAnswerMs: 0,
          error: `Subject crash: ${err.message}`, screenshot: null,
        });
      }
    }
  } catch (err) {
    log(`Fatal: ${err.message}`, '❌');
    console.error(err.stack);
    ensureDir(CFG.screenshotDir);
    await page.screenshot({
      path: path.join(CFG.screenshotDir, 'FATAL.png'), fullPage: true,
    }).catch(() => {});
  } finally {
    fs.writeFileSync(CFG.reportPath, buildReport(), 'utf8');
    log(`Report → ${CFG.reportPath}`, '📄');
    log(`Chapters: ${results.length} | ✅ ${results.filter(r => r.status === 'success').length} | ❌ ${results.filter(r => r.status === 'failed').length}`);
    log(`Runtime : ${((Date.now() - botStart) / 60000).toFixed(1)} min`);
    await browser.close();
    log('Done.', '🤖');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
