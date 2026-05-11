#!/usr/bin/env node
/**
 * Ready4Exam Quiz Bot — testing_tool/bot.js
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

// ── Random answer selection ───────────────────────────────────────────────────
const OPTIONS = ['A', 'B', 'C', 'D'];
function randomOption() {
  return OPTIONS[Math.floor(Math.random() * OPTIONS.length)];
}

// ── Radio wait helper ─────────────────────────────────────────────────────────
// Radio inputs have class="hidden" — use state:'attached', NOT 'visible'
async function waitForRadios(page, timeout) {
  await page.waitForSelector('#question-list input[type="radio"]', {
    state  : 'attached',
    timeout: timeout ?? CFG.quizTimeout,
  });
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
async function login(page) {
  log('Opening homepage…', '🔗');
  mark('home');
  await page.goto(CFG.baseUrl + '/index.html', {
    waitUntil: 'domcontentloaded', timeout: CFG.pageTimeout,
  });
  measure('Homepage load', 'home');

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
  measure('Login → student console', 'login');
  await page.waitForSelector('#app:not(.hidden)', { timeout: CFG.pageTimeout });
  log('Student console ready.');
}

// ── CLICK "NEW QUIZ" ──────────────────────────────────────────────────────────
async function clickNewQuiz(page) {
  log('Clicking "New Quiz"…', '🔗');
  await page.waitForFunction(() => {
    const btn = document.getElementById('start-new-quiz-btn');
    return btn && btn.href && !btn.href.endsWith('#');
  }, { timeout: CFG.pageTimeout });
  mark('curr');
  await page.click('#start-new-quiz-btn');
  await page.waitForURL('**/curriculum.html**', { timeout: CFG.pageTimeout });
  measure('New Quiz → curriculum.html', 'curr');
  await page.waitForFunction(() => {
    const g = document.getElementById('subject-grid');
    return g && g.querySelectorAll('div[onclick]').length > 0;
  }, { timeout: CFG.pageTimeout });
  log('curriculum.html ready.');
}

// ── CLICK SUBJECT CARD ────────────────────────────────────────────────────────
async function clickSubject(page, subject) {
  log(`Clicking subject: "${subject}"`, '📚');
  mark('chapsel');
  const clicked = await page.evaluate(target => {
    for (const c of document.querySelectorAll('#subject-grid div[onclick]')) {
      if (c.textContent.includes(target)) { c.click(); return true; }
    }
    return false;
  }, subject);
  if (!clicked) throw new Error(`Subject card not found: "${subject}"`);
  await page.waitForURL('**/chapter-selection.html**', { timeout: CFG.pageTimeout });
  measure(`curriculum → chapter-selection (${subject})`, 'chapsel');
  await page.waitForFunction(() => {
    const area = document.getElementById('content-area');
    return area && area.querySelectorAll('div[onclick^="startQuiz"]').length > 0;
  }, { timeout: CFG.pageTimeout });
  log('chapter-selection.html ready.');
}

// ── SCRAPE CHAPTERS ───────────────────────────────────────────────────────────
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

// ── RUN ONE CHAPTER ───────────────────────────────────────────────────────────
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
    // Click chapter card by DOM index
    mark('ch');
    const clicked = await page.evaluate(idx => {
      const card = document.querySelectorAll(
        '#content-area div[onclick^="startQuiz"]'
      )[idx];
      if (card) { card.click(); return true; }
      return false;
    }, chapter.index);
    if (!clicked) throw new Error('Chapter card not found at index ' + chapter.index);

    // Wait for difficulty modal
    await page.waitForSelector('#symmetric-difficulty-modal', { timeout: 12_000 });
    measure(`Chapter → modal (${chapter.title})`, 'ch');
    log('    Modal appeared');

    // Click Simple
    mark('simple');
    await page.evaluate(() => {
      const modal = document.getElementById('symmetric-difficulty-modal');
      if (!modal) return;
      for (const btn of modal.querySelectorAll('button')) {
        if (btn.textContent.trim() === 'Simple') { btn.click(); return; }
      }
      if (typeof window.launchQuiz === 'function') window.launchQuiz('Simple');
    });

    // Wait for quiz-engine URL
    await page.waitForURL('**/quiz-engine.html**', { timeout: CFG.pageTimeout });

    // Wait for first radio to be attached in DOM
    log('    Waiting for questions to load…');
    await waitForRadios(page, CFG.quizTimeout);
    entry.quizLoadMs = measure(`Simple → first question (${chapter.title})`, 'simple');
    log(`    Questions ready in ${entry.quizLoadMs} ms`);

    // Answer every question and submit
    const qResult = await answerAllQuestions(page, chapter.title);
    entry.totalQ      = qResult.total;
    entry.avgAnswerMs = qResult.avgMs;
    entry.status      = 'success';
    log(`    ✅ ${qResult.total} questions done (avg ${qResult.avgMs} ms/q)`);

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

// ── ANSWER ALL QUESTIONS → SUBMIT → HANDLE ALERT → BACK ──────────────────────
async function answerAllQuestions(page, chapterTitle) {
  let total  = 0;
  const qMs  = [];
  const MAX  = 200;
  let safety = 0;

  while (safety < MAX) {
    safety++;

    // Wait for radios (attached, not visible — they have class="hidden")
    await waitForRadios(page, CFG.quizTimeout);

    const t0 = Date.now();

    // Read counter "N / Total"
    const counter = await page
      .$eval('#question-counter', el => el.textContent.trim())
      .catch(() => `${safety}/1`);
    const [curStr, totStr] = counter.split('/');
    const current = parseInt(curStr) || safety;
    total         = parseInt(totStr) || 1;

    // Pick a random option (A / B / C / D)
    const choice = randomOption();
    log(`    Q${current}/${total} → selecting option ${choice}`);

    // Click via label (the visible element) using page.evaluate to bypass
    // Playwright's visibility check on the hidden radio input
    await page.evaluate(preferred => {
      const radios = Array.from(
        document.querySelectorAll('#question-list input[type="radio"]')
      );
      if (radios.length === 0) return;
      // Try preferred option first; fall back to first radio in DOM
      const target = radios.find(r => r.value === preferred) || radios[0];
      const label  = target.closest('label');
      if (label) label.click();
      else target.click();
    }, choice);

    qMs.push(Date.now() - t0);
    await sleep(250);

    // ── Check Submit ──────────────────────────────────────────────────────────
    const submitVisible = await page.evaluate(() => {
      const b = document.getElementById('submit-btn');
      return b && !b.classList.contains('hidden');
    });

    if (submitVisible) {
      log(`    Submitting quiz…`);
      mark('sub');

      // ── Handle the native alert() that may appear after submit ─────────────
      // quiz-engine.js fires: alert("⚠️ Mastery Alert: Score below 85%...")
      // with a 300 ms setTimeout AFTER submission.
      // We register a one-time handler BEFORE clicking Submit so we never miss it.
      page.once('dialog', async dialog => {
        log(`    Alert: "${dialog.message().split('\n')[0]}" — dismissing`);
        await dialog.accept();
      });

      await page.click('#submit-btn');

      // Wait for results screen
      await page.waitForSelector('#results-screen:not(.hidden)', {
        timeout: CFG.pageTimeout,
      });
      measure(`Submit → results (${chapterTitle})`, 'sub');

      // Small pause so any delayed alert can fire and be caught by the handler
      await sleep(800);

      // ── Click "Back to Chapter Selection" ─────────────────────────────────
      // This button navigates cleanly back without needing page.goto()
      const backBtn = await page.$('#back-to-chapters-btn');
      if (backBtn) {
        log('    Clicking "Back to Chapter Selection"…');
        mark('back_btn');
        await backBtn.click();
        await page.waitForURL('**/chapter-selection.html**', { timeout: CFG.pageTimeout });
        measure(`Back to chapter-selection (${chapterTitle})`, 'back_btn');

        // Wait for chapter cards to re-render
        await page.waitForFunction(() => {
          const area = document.getElementById('content-area');
          return area && area.querySelectorAll('div[onclick^="startQuiz"]').length > 0;
        }, { timeout: CFG.pageTimeout });
        log('    chapter-selection.html ready.');
      } else {
        log('    #back-to-chapters-btn not found — will navigate directly', '⚠️');
      }

      const avgMs = qMs.length
        ? Math.round(qMs.reduce((a, b) => a + b, 0) / qMs.length)
        : 0;
      return { total, avgMs };
    }

    // ── Click Next ────────────────────────────────────────────────────────────
    const nextVisible = await page.evaluate(() => {
      const b = document.getElementById('next-btn');
      return b && !b.classList.contains('hidden');
    });

    if (nextVisible) {
      await page.click('#next-btn');
      await sleep(200);
    } else {
      await sleep(400); // neither button visible yet — wait and retry
    }
  }

  throw new Error(`Safety cap: no Submit after ${MAX} iterations`);
}

// ── NAVIGATE BACK (fallback if back button didn't navigate) ───────────────────
async function goBackIfNeeded(page, subject, grade) {
  // If we're already on chapter-selection (back button worked), this is a no-op
  if (page.url().includes('chapter-selection')) {
    return;
  }
  log('    → navigating directly to chapter-selection');
  mark('back_direct');
  const url = `${CFG.baseUrl}/app/chapter-selection.html`
            + `?subject=${encodeURIComponent(subject)}&grade=${grade}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CFG.pageTimeout });
  await page.waitForFunction(() => {
    const area = document.getElementById('content-area');
    return area && area.querySelectorAll('div[onclick^="startQuiz"]').length > 0;
  }, { timeout: CFG.pageTimeout });
  measure('Direct back → chapter-selection', 'back_direct');
}

// ── RUN ALL CHAPTERS FOR ONE SUBJECT ─────────────────────────────────────────
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
      // Ensure we're on chapter-selection before next iteration
      await goBackIfNeeded(page, subject, grade);

      // Re-scrape so DOM indexes stay accurate
      const fresh = await scrapeChapters(page);
      for (let j = i + 1; j < chapters.length; j++) {
        const match = fresh.find(c => c.tableId === chapters[j].tableId);
        if (match) chapters[j].index = match.index;
      }
    }
  }

  measure(`Subject total: ${subject}`, `subj_${subject}`);
}

// ── MARKDOWN REPORT ───────────────────────────────────────────────────────────
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

  const failedRows = results.filter(r => r.status === 'failed');
  if (failedRows.length) {
    md += `## ❌ Failed Chapters\n\n`;
    md += `| Subject | Chapter | Table ID | Error | Likely Fix |\n`;
    md += `|---------|---------|----------|-------|------------|\n`;
    failedRows.forEach(r => {
      let fix = 'Review screenshot';
      if (/timeout/i.test(r.error))
        fix = 'Quiz never rendered — check Supabase table has Simple rows';
      else if (/modal/i.test(r.error))
        fix = 'Difficulty modal did not appear';
      else if (/safety cap/i.test(r.error))
        fix = 'Submit never appeared — possible UI bug';
      md += `| ${r.subject} | ${r.chapter} | \`${r.tableId}\` | ${r.error} | ${fix} |\n`;
    });
    if (failedRows.some(r => r.screenshot))
      md += `\nScreenshots saved in \`bot_screenshots/\`\n`;
    md += '\n';
  } else {
    md += `## ✅ All Chapters Completed\n\nEvery quiz loaded and submitted successfully.\n\n`;
  }

  md += `\n---\n*Ready4Exam Quiz Bot — ${now.toUTCString()}*\n`;
  return md;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
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

  // Global fallback: catch any unexpected alert/confirm/prompt that slips through
  page.on('dialog', async dialog => {
    log(`    [global dialog] "${dialog.message().split('\n')[0]}" — auto-accepting`);
    await dialog.accept();
  });

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
      path: path.join(CFG.screenshotDir, 'FATAL.png'), fullPage: true,
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
