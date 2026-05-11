#!/usr/bin/env node
/**
 * Ready4Exam Quiz Bot — testing_tool/bot.js
 *
 * Strategy: no Supabase interception, no answer caching.
 * Just drive the UI: wait for radio buttons → pick one → Next → Submit.
 *
 * Usage:
 *   node bot.js
 *   HEADLESS=true node bot.js
 */
'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const CFG = {
  baseUrl      : 'https://karnkeshav.github.io/masterpage_1',
  username     : 's.10.a',
  password     : 'Ready4Exam@2026',
  subjects     : ['Science', 'Mathematics', 'Social Science'],
  headless     : process.env.HEADLESS === 'true',
  slowMo       : 80,
  pageTimeout  : 60_000,   // navigation / page loads
  quizTimeout  : 120_000,  // quiz questions can take longer to fetch
  screenshotDir: path.join(__dirname, 'bot_screenshots'),
  reportPath   : path.join(__dirname, 'quiz_bot_report.md'),
};

// ─── Shared state ─────────────────────────────────────────────────────────────
const latency = [];   // { label, ms, ts }
const results = [];   // one entry per chapter
const botStart = Date.now();

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const iso = () => new Date().toISOString().replace('T', ' ').split('.')[0];

function log(msg, icon = '  ') {
  console.log(`[${iso()}] ${icon} ${msg}`);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// Stopwatch
const _marks = {};
function mark(id) { _marks[id] = Date.now(); }
function measure(label, id) {
  const ms = Date.now() - (_marks[id] ?? Date.now());
  latency.push({ label, ms, ts: iso() });
  log(`⏱  ${label}: ${ms} ms`);
  return ms;
}

// ─── Step 1 — Login ───────────────────────────────────────────────────────────
async function login(page) {
  log('Opening homepage…', '🔗');
  mark('home');
  await page.goto(CFG.baseUrl + '/index.html', {
    waitUntil: 'domcontentloaded',
    timeout  : CFG.pageTimeout,
  });
  measure('Homepage load', 'home');

  // Clear autofill then type credentials
  await page.evaluate(() => {
    ['username', 'password'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  });
  await sleep(300);
  await page.fill('#username', CFG.username);
  await page.fill('#password', CFG.password);

  log('Logging in…', '🔐');
  mark('login');
  await page.click('#sovereign-login-form button');
  await page.waitForURL('**/consoles/student.html**', { timeout: CFG.pageTimeout });
  measure('Login -> student console', 'login');

  // Guard.js reveals #app once Firebase confirms auth
  await page.waitForSelector('#app:not(.hidden)', { timeout: CFG.pageTimeout });
  log('Logged in — student console ready.');
}

// ─── Step 2 — Click "New Quiz" ────────────────────────────────────────────────
async function clickNewQuiz(page) {
  log('Clicking "New Quiz"…', '🔗');

  // student.js sets href dynamically; wait until it's a real URL (not "#")
  await page.waitForFunction(() => {
    const btn = document.getElementById('start-new-quiz-btn');
    return btn && btn.href && !btn.href.endsWith('#');
  }, { timeout: CFG.pageTimeout });

  mark('curriculum');
  await page.click('#start-new-quiz-btn');
  await page.waitForURL('**/curriculum.html**', { timeout: CFG.pageTimeout });
  measure('New Quiz -> curriculum.html', 'curriculum');

  // Wait for subject cards to render
  await page.waitForFunction(() => {
    const g = document.getElementById('subject-grid');
    return g && g.querySelectorAll('div[onclick]').length > 0;
  }, { timeout: CFG.pageTimeout });

  log('curriculum.html ready.');
}

// ─── Step 3 — Click subject card ─────────────────────────────────────────────
async function clickSubject(page, subject) {
  log(`Clicking subject card: "${subject}"`, '📚');
  mark('chapsel');

  const clicked = await page.evaluate(target => {
    const cards = document.querySelectorAll('#subject-grid div[onclick]');
    for (const c of cards) {
      if (c.textContent.includes(target)) { c.click(); return true; }
    }
    return false;
  }, subject);

  if (!clicked) throw new Error(`Subject card not found: "${subject}"`);

  await page.waitForURL('**/chapter-selection.html**', { timeout: CFG.pageTimeout });
  measure(`curriculum -> chapter-selection (${subject})`, 'chapsel');

  // Wait for chapter cards to render
  await page.waitForFunction(() => {
    const area = document.getElementById('content-area');
    return area && area.querySelectorAll('div[onclick^="startQuiz"]').length > 0;
  }, { timeout: CFG.pageTimeout });

  log('chapter-selection.html ready.');
}

// ─── Step 4 — Scrape chapter list ────────────────────────────────────────────
async function scrapeChapters(page) {
  const chapters = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#content-area div[onclick^="startQuiz"]'))
      .map((card, index) => {
        const m = card.getAttribute('onclick')
          .match(/startQuiz\('([^']*)',\s*'([^']*)',\s*'([^']*)'\)/);
        return m ? { tableId: m[1], title: m[2], grade: m[3], index } : null;
      }).filter(Boolean)
  );
  log(`Found ${chapters.length} chapters`);
  return chapters;
}

// ─── Step 5 — Run one chapter ─────────────────────────────────────────────────
async function runChapter(page, chapter, subject, num, total) {
  log(`\n  [${num}/${total}] "${chapter.title}" (${chapter.tableId})`);

  const entry = {
    subject,
    chapter    : chapter.title,
    tableId    : chapter.tableId,
    grade      : chapter.grade,
    status     : 'pending',
    totalQ     : 0,
    durationMs : 0,
    quizLoadMs : 0,
    avgAnswerMs: 0,
    error      : null,
    screenshot : null,
  };
  const t0 = Date.now();

  try {
    // ── 5a. Click the chapter card by DOM index ──────────────────────────────
    mark('ch');
    const clicked = await page.evaluate(idx => {
      const card = document.querySelectorAll(
        '#content-area div[onclick^="startQuiz"]'
      )[idx];
      if (card) { card.click(); return true; }
      return false;
    }, chapter.index);
    if (!clicked) throw new Error('Chapter card not found at index ' + chapter.index);

    // ── 5b. Difficulty modal ─────────────────────────────────────────────────
    await page.waitForSelector('#symmetric-difficulty-modal', { timeout: 12_000 });
    measure(`Chapter → modal (${chapter.title})`, 'ch');
    log('    Modal appeared');

    // ── 5c. Click Simple ─────────────────────────────────────────────────────
    mark('simple');
    await page.evaluate(() => {
      const modal = document.getElementById('symmetric-difficulty-modal');
      if (!modal) return;
      for (const btn of modal.querySelectorAll('button')) {
        if (btn.textContent.trim() === 'Simple') { btn.click(); return; }
      }
      // Fallback — call the global directly
      if (typeof window.launchQuiz === 'function') window.launchQuiz('Simple');
    });

    // ── 5d. Wait for quiz-engine URL ─────────────────────────────────────────
    await page.waitForURL('**/quiz-engine.html**', { timeout: CFG.pageTimeout });

    // ── 5e. Wait for the FIRST radio button to appear ────────────────────────
    //
    //   We do NOT care whether data comes from Supabase or Firestore.
    //   We do NOT care about #quiz-content visibility or #status-message text.
    //   We simply wait until at least one answerable radio button exists.
    //   That is the only signal we need: "questions are on screen".
    //
    log('    Waiting for questions…');
    await page.waitForSelector(
      '#question-list input[type="radio"]',
      { timeout: CFG.quizTimeout }
    );

    entry.quizLoadMs = measure(`Simple → first question (${chapter.title})`, 'simple');
    log(`    Questions ready in ${entry.quizLoadMs} ms`);

    // ── 5f. Answer every question ────────────────────────────────────────────
    const qResult = await answerAllQuestions(page, chapter.title);
    entry.totalQ      = qResult.total;
    entry.avgAnswerMs = qResult.avgMs;
    entry.status      = 'success';
    log(`    ✅ Finished ${qResult.total} questions (avg ${qResult.avgMs} ms each)`);

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

// ─── Step 6 — Answer loop (pure UI — no data source awareness) ───────────────
async function answerAllQuestions(page, chapterTitle) {
  let total   = 0;
  const qMs   = [];
  const MAX_Q = 200; // safety cap
  let safety  = 0;

  while (safety < MAX_Q) {
    safety++;

    // Wait for radio buttons to be present for this question
    await page.waitForSelector(
      '#question-list input[type="radio"]',
      { timeout: CFG.quizTimeout }
    );

    const t0 = Date.now();

    // Read the counter "N / Total"
    const counter = await page
      .$eval('#question-counter', el => el.textContent.trim())
      .catch(() => `${safety}/1`);

    const [curStr, totStr] = counter.split('/');
    const current = parseInt(curStr) || safety;
    total         = parseInt(totStr) || 1;

    log(`    Q${current}/${total}`);

    // ── Pick the FIRST visible radio button ──────────────────────────────────
    //   We don't need the right answer — we just need to pick something so
    //   the quiz can advance.
    await page.evaluate(() => {
      const radios = document.querySelectorAll(
        '#question-list input[type="radio"]:not([disabled])'
      );
      if (radios.length === 0) return;
      // Try option A first, fall back to whichever is first in the DOM
      const optA = Array.from(radios).find(r => r.value === 'A') || radios[0];
      const label = optA.closest('label');
      if (label) label.click();
      else optA.click();
    });

    qMs.push(Date.now() - t0);
    await sleep(200); // let UI register the selection

    // ── Submit or Next ────────────────────────────────────────────────────────
    const submitVisible = await page.evaluate(() => {
      const b = document.getElementById('submit-btn');
      return b && !b.classList.contains('hidden');
    });

    if (submitVisible) {
      log(`    Submitting (${chapterTitle})…`);
      mark('submit');
      await page.click('#submit-btn');
      // Wait for results screen
      await page.waitForSelector('#results-screen:not(.hidden)', {
        timeout: CFG.pageTimeout,
      });
      measure(`Submit → results (${chapterTitle})`, 'submit');
      const avgMs = qMs.length
        ? Math.round(qMs.reduce((a, b) => a + b, 0) / qMs.length)
        : 0;
      return { total, avgMs };
    }

    // If Next is visible, click it; otherwise wait briefly and retry
    const nextVisible = await page.evaluate(() => {
      const b = document.getElementById('next-btn');
      return b && !b.classList.contains('hidden');
    });

    if (nextVisible) {
      await page.click('#next-btn');
      await sleep(150);
    } else {
      // Both buttons hidden — brief pause, then loop again
      await sleep(400);
    }
  }

  throw new Error(`Safety cap: no Submit after ${MAX_Q} iterations`);
}

// ─── Navigate back to chapter-selection ──────────────────────────────────────
async function goBack(page, subject, grade) {
  log('    → back to chapter-selection');
  mark('back');
  const url = `${CFG.baseUrl}/app/chapter-selection.html`
            + `?subject=${encodeURIComponent(subject)}&grade=${grade}`;

  // domcontentloaded is faster than networkidle and sufficient here
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CFG.pageTimeout });

  await page.waitForFunction(() => {
    const area = document.getElementById('content-area');
    return area && area.querySelectorAll('div[onclick^="startQuiz"]').length > 0;
  }, { timeout: CFG.pageTimeout });

  measure('Back → chapter-selection', 'back');
}

// ─── Run all chapters for one subject ────────────────────────────────────────
async function runSubject(page, subject) {
  log(`\n${'='.repeat(60)}`);
  log(`  SUBJECT: ${subject.toUpperCase()}`);
  log(`${'='.repeat(60)}`);
  mark(`subj_${subject}`);

  await clickNewQuiz(page);
  await clickSubject(page, subject);
  const chapters = await scrapeChapters(page);

  if (chapters.length === 0) {
    log('  No chapters — skipping', '⏭️');
    results.push({
      subject, chapter: '(none)', tableId: '', grade: '?',
      status: 'skipped', totalQ: 0, durationMs: 0,
      quizLoadMs: 0, avgAnswerMs: 0, error: 'No chapters found', screenshot: null,
    });
    return;
  }

  const grade = chapters[0].grade;

  for (let i = 0; i < chapters.length; i++) {
    const result = await runChapter(page, chapters[i], subject, i + 1, chapters.length);
    results.push(result);

    if (i < chapters.length - 1) {
      await goBack(page, subject, grade);

      // Re-scrape so DOM indexes stay correct after page reload
      const fresh = await scrapeChapters(page);
      for (let j = i + 1; j < chapters.length; j++) {
        const match = fresh.find(c => c.tableId === chapters[j].tableId);
        if (match) chapters[j].index = match.index;
      }
    }
  }

  measure(`Subject total: ${subject}`, `subj_${subject}`);
}

// ─── Markdown report ─────────────────────────────────────────────────────────
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
  md += `| ⏱ Total runtime | **${(totalMs / 60000).toFixed(1)} min** |\n\n`;

  // Latency log
  md += `## Latency Log\n\n`;
  md += `> 🟢 <1 s  🟡 1–3 s  🔴 >3 s\n\n`;
  md += `| Timestamp | Event | ms |\n|-----------|-------|----|\n`;
  latency.forEach(({ ts, label, ms }) => {
    const d = ms < 1000 ? '🟢' : ms < 3000 ? '🟡' : '🔴';
    md += `| ${ts} | ${label} | ${d} ${ms} |\n`;
  });
  md += '\n';

  // Per-subject chapter tables
  for (const subject of CFG.subjects) {
    const rows = results.filter(r => r.subject === subject);
    if (!rows.length) continue;

    const subOk  = rows.filter(r => r.status === 'success').length;
    const subBad = rows.filter(r => r.status === 'failed').length;
    md += `## ${subject}\n\n`;
    md += `> ✅ ${subOk} completed  ❌ ${subBad} failed\n\n`;
    md += `| # | Chapter | Table ID | Status | Questions | Load ms | Duration s |\n`;
    md += `|---|---------|----------|--------|-----------|---------|------------|\n`;
    rows.forEach((r, i) => {
      const icon = { success: '✅', failed: '❌', skipped: '⏭️' }[r.status] ?? '?';
      md += `| ${i + 1} | ${r.chapter} | \`${r.tableId}\` | ${icon} `
          + `| ${r.totalQ || '—'} | ${r.quizLoadMs || '—'} | ${(r.durationMs / 1000).toFixed(1)} |\n`;
    });
    md += '\n';
  }

  // Failed quiz detail
  const failedRows = results.filter(r => r.status === 'failed');
  if (failedRows.length) {
    md += `## ❌ Failed Chapters\n\n`;
    md += `| Subject | Chapter | Table ID | Error | Fix |\n`;
    md += `|---------|---------|----------|-------|-----|\n`;
    failedRows.forEach(r => {
      let fix = 'Review screenshot';
      if (/timeout/i.test(r.error))
        fix = 'Quiz never rendered — check if table_id exists and has Simple rows in Supabase';
      else if (/modal/i.test(r.error))
        fix = 'Difficulty modal did not appear — chapter card click may have failed';
      else if (/safety cap/i.test(r.error))
        fix = 'Submit button never appeared — possible UI loop or question count bug';
      md += `| ${r.subject} | ${r.chapter} | \`${r.tableId}\` | ${r.error} | ${fix} |\n`;
    });
    if (failedRows.some(r => r.screenshot)) {
      md += `\nScreenshots saved in \`bot_screenshots/\`\n`;
    }
    md += '\n';
  } else {
    md += `## ✅ All Chapters Completed\n\nEvery quiz loaded and finished successfully.\n\n`;
  }

  md += `\n---\n*Ready4Exam Quiz Bot — ${now.toUTCString()}*\n`;
  return md;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
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

  try {
    await login(page);

    for (const subject of CFG.subjects) {
      try {
        await runSubject(page, subject);
      } catch (err) {
        log(`Subject crash (${subject}): ${err.message}`, '❌');
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
      path: path.join(CFG.screenshotDir, 'FATAL.png'),
      fullPage: true,
    }).catch(() => {});
  } finally {
    fs.writeFileSync(CFG.reportPath, buildReport(), 'utf8');
    log(`Report → ${CFG.reportPath}`, '📄');

    const ok  = results.filter(r => r.status === 'success').length;
    const bad = results.filter(r => r.status === 'failed').length;
    log(`Chapters: ${results.length} total | ✅ ${ok} | ❌ ${bad}`);
    log(`Runtime : ${((Date.now() - botStart) / 60000).toFixed(1)} min`);

    await browser.close();
    log('Done.', '🤖');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
