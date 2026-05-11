#!/usr/bin/env node
/**
 * Ready4Exam Quiz Bot — testing_tool/bot.js
 *
 * Exact flow:
 *   index.html → login → student.html → click "New Quiz"
 *   → curriculum.html → click subject card
 *   → chapter-selection.html → click each chapter div
 *   → difficulty modal → click "Simple"
 *   → quiz-engine.html → answer every question → submit
 *   → repeat for all chapters, then next subject
 *
 * Usage:
 *   node bot.js                 (headed — watch it run)
 *   HEADLESS=true node bot.js   (background)
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
  difficulty   : 'Simple',
  headless     : process.env.HEADLESS === 'true',
  slowMo       : 150,       // ms between Playwright actions
  timeout      : 60_000,    // ms — max wait per selector/navigation
  screenshotDir: path.join(__dirname, 'bot_screenshots'),
  reportPath   : path.join(__dirname, 'quiz_bot_report.md'),
};

// ─── Shared state ─────────────────────────────────────────────────────────────

/** correct_answer_key values intercepted from Supabase responses */
const answerCache = new Map();   // questionId (string) → "A"|"B"|"C"|"D"

/** Latency log — every timed event */
const latency = [];              // [{ label, ms, timestamp }]

/** One entry per chapter attempt */
const results = [];

/** Quick list of failures for the report */
const errors  = [];

const botStart = Date.now();

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

const iso = () => new Date().toISOString().replace('T', ' ').split('.')[0];

function log(msg, type = '✅') {
  console.log(`[${iso()}] ${type} ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Stopwatch ────────────────────────────────────────────────────────────────

const marks = {};

function mark(id) { marks[id] = Date.now(); }

function measure(label, markId) {
  const ms = Date.now() - (marks[markId] ?? Date.now());
  latency.push({ label, ms, timestamp: iso() });
  log(`  ⏱  ${label}: ${ms} ms`);
  return ms;
}

// ─── Network intercept — harvest correct answers from Supabase ────────────────

async function setupInterception(page) {
  await page.route('**supabase.co/rest/**', async (route) => {
    mark('sb');
    let response;
    try {
      response = await route.fetch();
    } catch (e) {
      log(`Supabase fetch failed: ${e.message}`, '❌');
      route.abort();
      return;
    }
    measure(`Supabase → ${new URL(route.request().url()).pathname.split('/').pop()}`, 'sb');

    try {
      const body = await response.json();
      if (Array.isArray(body) && body.length > 0) {
        let n = 0;
        body.forEach(q => {
          const id  = String(q.id ?? '');
          const ans = (q.correct_answer_key ?? '').trim().toUpperCase();
          if (id && ans) { answerCache.set(id, ans); n++; }
        });
        if (n > 0) log(`  📥 Cached ${n} answers from Supabase`);
        else       log(`  ⚠️  Supabase returned 0 rows (table empty or wrong difficulty)`, '⚠️');
      }
    } catch (_) { /* non-JSON endpoint — silently skip */ }

    route.fulfill({ response });
  });
}

// ─── Step 1: Login ────────────────────────────────────────────────────────────

async function login(page) {
  log('Opening homepage…', '🔗');
  mark('homepage');
  await page.goto(CFG.baseUrl + '/index.html', { waitUntil: 'networkidle', timeout: CFG.timeout });
  measure('Homepage load', 'homepage');

  // Clear any browser-autofilled values then type credentials
  await page.evaluate(() => {
    const u = document.getElementById('username');
    const p = document.getElementById('password');
    if (u) u.value = '';
    if (p) p.value = '';
  });
  await sleep(300);

  await page.fill('#username', CFG.username);
  await page.fill('#password', CFG.password);

  log('Submitting login form…', '🔐');
  mark('login');

  // The form's submit button is the first <button> inside #sovereign-login-form
  await page.click('#sovereign-login-form button[type="submit"], #sovereign-login-form button');

  // Wait for student console
  await page.waitForURL('**/consoles/student.html**', { timeout: CFG.timeout });
  measure('Login → student console', 'login');

  // Guard reveals #app once Firebase auth resolves
  await page.waitForSelector('#app:not(.hidden)', { timeout: CFG.timeout });
  log('Logged in. Student console ready.');
}

// ─── Step 2: Click "New Quiz" on student console ──────────────────────────────

async function clickNewQuiz(page) {
  log('Clicking "New Quiz" button…', '🔗');

  // student.js sets the href dynamically — wait until it's not "#"
  await page.waitForFunction(() => {
    const btn = document.getElementById('start-new-quiz-btn');
    return btn && btn.href && !btn.href.endsWith('#');
  }, { timeout: CFG.timeout });

  mark('curriculum');
  await page.click('#start-new-quiz-btn');
  await page.waitForURL('**/curriculum.html**', { timeout: CFG.timeout });
  measure('New Quiz → curriculum.html', 'curriculum');

  // Wait for subject cards to render
  await page.waitForFunction(() => {
    const grid = document.getElementById('subject-grid');
    return grid && grid.querySelectorAll('div[onclick]').length > 0;
  }, { timeout: CFG.timeout });

  log('curriculum.html ready with subject cards.');
}

// ─── Step 3: Click a subject card on curriculum.html ─────────────────────────

async function clickSubject(page, subject) {
  log(`Clicking subject card: "${subject}"`, '📚');
  mark(`subject_${subject}`);

  // Subject cards are <div onclick="selectSubject('Science','10')">
  const clicked = await page.evaluate((targetSubject) => {
    const cards = document.querySelectorAll('#subject-grid div[onclick]');
    for (const card of cards) {
      if (card.textContent.trim().includes(targetSubject)) {
        card.click();
        return true;
      }
    }
    return false;
  }, subject);

  if (!clicked) {
    throw new Error(`Subject card not found for "${subject}" on curriculum.html`);
  }

  await page.waitForURL('**/chapter-selection.html**', { timeout: CFG.timeout });
  measure(`curriculum → chapter-selection (${subject})`, `subject_${subject}`);

  // Wait for chapter cards to render (JS fetches curriculum then injects HTML)
  await page.waitForFunction(() => {
    const area = document.getElementById('content-area');
    // Either chapter cards exist, or an error/empty message is shown
    return area && (
      area.querySelectorAll('div[onclick^="startQuiz"]').length > 0 ||
      area.textContent.includes('No content') ||
      area.textContent.includes('Failed')
    );
  }, { timeout: CFG.timeout });

  log('chapter-selection.html ready.');
}

// ─── Step 4: Scrape chapter list ──────────────────────────────────────────────

async function scrapeChapters(page) {
  const chapters = await page.evaluate(() => {
    const cards = document.querySelectorAll('#content-area div[onclick^="startQuiz"]');
    return Array.from(cards).map((card, index) => {
      const raw = card.getAttribute('onclick');
      // onclick="startQuiz('tableId', 'Title', 'grade')"
      const m = raw.match(/startQuiz\('([^']*)',\s*'([^']*)',\s*'([^']*)'\)/);
      return m
        ? { tableId: m[1], title: m[2], grade: m[3], index }
        : null;
    }).filter(Boolean);
  });

  log(`Found ${chapters.length} chapters`);
  return chapters;
}

// ─── Step 5: Click chapter by index and handle the quiz ───────────────────────

async function runChapter(page, chapter, subject, chapterIndex, total) {
  const entry = {
    subject,
    chapter      : chapter.title,
    tableId      : chapter.tableId,
    grade        : chapter.grade,
    status       : 'pending',
    score        : null,
    totalQ       : 0,
    durationMs   : 0,
    quizLoadMs   : 0,
    avgAnswerMs  : 0,
    error        : null,
    screenshot   : null,
  };

  const chStart = Date.now();
  log(`\n  [${chapterIndex + 1}/${total}] "${chapter.title}" (${chapter.tableId})`);

  try {
    // ── 5a. Click the chapter card by index ──────────────────────────────────
    mark('chapter_click');

    const clicked = await page.evaluate((idx) => {
      const cards = document.querySelectorAll('#content-area div[onclick^="startQuiz"]');
      const card  = cards[idx];
      if (card) { card.click(); return true; }
      return false;
    }, chapter.index);

    if (!clicked) throw new Error('Chapter card element not found at index ' + chapter.index);

    // ── 5b. Wait for difficulty modal ────────────────────────────────────────
    await page.waitForSelector('#symmetric-difficulty-modal', { timeout: 15_000 });
    measure(`Chapter click → modal (${chapter.title})`, 'chapter_click');
    log(`      Difficulty modal appeared`);

    // ── 5c. Click the "Simple" button ────────────────────────────────────────
    mark('diff_click');

    // Buttons inside the modal — find the one whose text is "Simple"
    const simpleClicked = await page.evaluate(() => {
      const modal = document.getElementById('symmetric-difficulty-modal');
      if (!modal) return false;
      const btns = modal.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.trim() === 'Simple') { b.click(); return true; }
      }
      // Fallback: call launchQuiz directly
      if (typeof window.launchQuiz === 'function') { window.launchQuiz('Simple'); return true; }
      return false;
    });

    if (!simpleClicked) throw new Error('Simple button not found in difficulty modal');

    // ── 5d. Wait for quiz-engine.html to load ────────────────────────────────
    await page.waitForURL('**/quiz-engine.html**', { timeout: CFG.timeout });

    // Wait until quiz-content visible OR status-message shows an error
    await page.waitForFunction(() => {
      const qc = document.getElementById('quiz-content');
      const sm = document.getElementById('status-message');
      return (qc && !qc.classList.contains('hidden')) ||
             (sm && !sm.classList.contains('hidden') && sm.textContent.trim().length > 0);
    }, { timeout: CFG.timeout });

    measure(`difficulty → quiz loaded (${chapter.title})`, 'diff_click');

    // Check for error in status message
    const loadError = await page.evaluate(() => {
      const sm = document.getElementById('status-message');
      if (sm && !sm.classList.contains('hidden') && sm.textContent.trim()) {
        return sm.textContent.trim();
      }
      return null;
    });
    if (loadError) throw new Error(`Quiz load error: ${loadError}`);

    entry.quizLoadMs = latency[latency.length - 1].ms;
    log(`      Quiz loaded in ${entry.quizLoadMs} ms`);

    // ── 5e. Answer all questions ──────────────────────────────────────────────
    const qResult = await answerAllQuestions(page, chapter);
    entry.score      = qResult.score;
    entry.totalQ     = qResult.total;
    entry.avgAnswerMs = qResult.avgMs;
    entry.status     = 'success';

    const pct = entry.totalQ
      ? Math.round((entry.score / entry.totalQ) * 100)
      : 0;
    log(`      ✅ Score: ${entry.score}/${entry.totalQ} (${pct}%) — avg answer: ${entry.avgAnswerMs} ms`);

  } catch (err) {
    entry.status = 'failed';
    entry.error  = err.message;
    errors.push({ subject, chapter: chapter.title, tableId: chapter.tableId, error: err.message });
    log(`      ❌ FAILED: ${err.message}`, '❌');

    try {
      ensureDir(CFG.screenshotDir);
      const ssPath = path.join(CFG.screenshotDir, `FAIL_${chapter.tableId}.png`);
      await page.screenshot({ path: ssPath, fullPage: true });
      entry.screenshot = `bot_screenshots/FAIL_${chapter.tableId}.png`;
      log(`      📸 Screenshot saved: ${entry.screenshot}`);
    } catch (_) {}
  }

  entry.durationMs = Date.now() - chStart;
  return entry;
}

// ─── Answer loop ──────────────────────────────────────────────────────────────

async function answerAllQuestions(page, chapter) {
  let total  = 0;
  let score  = 0;
  const qMs  = [];

  while (true) {
    // Wait for at least one radio button to appear
    await page.waitForFunction(() => {
      const ql = document.getElementById('question-list');
      return ql && ql.querySelector('input[type="radio"]');
    }, { timeout: CFG.timeout });

    const qStart = Date.now();

    // Read counter "current / total"
    const counter = await page.$eval('#question-counter', el => el.textContent.trim()).catch(() => '1/1');
    const [curStr, totStr] = counter.split('/');
    const current = parseInt(curStr) || 1;
    total         = parseInt(totStr) || 1;

    // Get question id from first radio in current question block
    const qId = await page.evaluate(() => {
      const r = document.querySelector('#question-list input[type="radio"]');
      return r ? r.dataset.id : null;
    });

    const correctAns = qId ? answerCache.get(String(qId)) : null;

    if (correctAns) {
      // Click the radio with the cached correct answer
      const clicked = await page.evaluate((id, ans) => {
        const radio = document.querySelector(
          `#question-list input[type="radio"][data-id="${id}"][value="${ans}"]`
        );
        if (!radio) return false;
        const label = radio.closest('label');
        if (label) label.click(); else radio.click();
        return true;
      }, qId, correctAns);

      if (clicked) score++;
      else {
        // Option radio not found in DOM — fall back to first available option
        await page.evaluate(() => {
          const r = document.querySelector('#question-list input[type="radio"]');
          const l = r && r.closest('label');
          if (l) l.click(); else if (r) r.click();
        });
      }
    } else {
      // No cached answer — just pick the first option so quiz can advance
      await page.evaluate(() => {
        const r = document.querySelector('#question-list input[type="radio"]');
        const l = r && r.closest('label');
        if (l) l.click(); else if (r) r.click();
      });
    }

    qMs.push(Date.now() - qStart);
    await sleep(150); // let UI reflect the selection

    // Check if submit button is now visible (last question)
    const canSubmit = await page.evaluate(() => {
      const b = document.getElementById('submit-btn');
      return b && !b.classList.contains('hidden');
    });

    if (canSubmit || current >= total) {
      // Submit the quiz
      mark('submit');
      await page.click('#submit-btn');
      await page.waitForSelector('#results-screen:not(.hidden)', { timeout: CFG.timeout });
      measure(`Submit → results (${chapter.title})`, 'submit');

      // Parse score from results screen
      const scoreText = await page.$eval('#score-display', el => el.innerText).catch(() => '');
      const m = scoreText.match(/(\d+)\s*[\/\\]\s*(\d+)/);
      const finalScore = m ? parseInt(m[1]) : score;
      const finalTotal = m ? parseInt(m[2]) : total;

      const avgMs = qMs.length
        ? Math.round(qMs.reduce((a, b) => a + b, 0) / qMs.length)
        : 0;

      return { score: finalScore, total: finalTotal, avgMs };
    } else {
      // Click Next
      await page.click('#next-btn');
      await sleep(150);
    }
  }
}

// ─── Navigate back to chapter-selection after a quiz ─────────────────────────

async function goBackToChapterSelection(page, subject, grade) {
  mark('back');
  const url = `${CFG.baseUrl}/app/chapter-selection.html` +
              `?subject=${encodeURIComponent(subject)}&grade=${grade}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: CFG.timeout });

  // Wait for chapter cards to re-render
  await page.waitForFunction(() => {
    const area = document.getElementById('content-area');
    return area && area.querySelectorAll('div[onclick^="startQuiz"]').length > 0;
  }, { timeout: CFG.timeout });

  measure('Back to chapter-selection', 'back');
}

// ─── Run all chapters for one subject ────────────────────────────────────────

async function runSubject(page, subject) {
  log(`\n${'═'.repeat(62)}`);
  log(`  📚  ${subject.toUpperCase()}`);
  log(`${'═'.repeat(62)}`);

  mark(`subject_total_${subject}`);

  // Navigate via the real UI: New Quiz → curriculum → subject card
  await clickNewQuiz(page);
  await clickSubject(page, subject);

  const chapters = await scrapeChapters(page);

  if (chapters.length === 0) {
    log(`  No chapters found — skipping subject`, '⏭️');
    results.push({
      subject, chapter: '(none)', tableId: '', grade: '?',
      status: 'skipped', score: null, totalQ: 0, durationMs: 0,
      quizLoadMs: 0, avgAnswerMs: 0, error: 'No chapters found', screenshot: null,
    });
    return;
  }

  // Grab the grade from any chapter (they all carry the same grade)
  const grade = chapters[0].grade;

  for (let i = 0; i < chapters.length; i++) {
    const result = await runChapter(page, chapters[i], subject, i, chapters.length);
    results.push(result);

    if (i < chapters.length - 1) {
      // Go back and re-scrape — the page may have re-rendered
      await goBackToChapterSelection(page, subject, grade);
      // Re-fetch chapter list so indexes remain accurate after page reload
      const refreshed = await scrapeChapters(page);
      // Update the remaining chapter objects with fresh index data
      for (let j = i + 1; j < chapters.length; j++) {
        const fresh = refreshed.find(c => c.tableId === chapters[j].tableId);
        if (fresh) chapters[j].index = fresh.index;
      }
    }
  }

  measure(`Entire subject: ${subject}`, `subject_total_${subject}`);
}

// ─── Markdown report ─────────────────────────────────────────────────────────

function buildReport() {
  const now      = new Date();
  const totalMs  = Date.now() - botStart;
  const success  = results.filter(r => r.status === 'success').length;
  const failed   = results.filter(r => r.status === 'failed').length;
  const skipped  = results.filter(r => r.status === 'skipped').length;

  const scored   = results.filter(r => r.score !== null && r.totalQ > 0);
  const avgPct   = scored.length
    ? (scored.reduce((s, r) => s + (r.score / r.totalQ * 100), 0) / scored.length).toFixed(1)
    : 'N/A';

  let md = `# Ready4Exam Quiz Bot — Full Audit Report\n\n`;
  md += `> **Generated:** ${now.toUTCString()}  \n`;
  md += `> **Account:** \`${CFG.username}\` | **Difficulty:** ${CFG.difficulty}  \n`;
  md += `> **Subjects:** ${CFG.subjects.join(', ')}\n\n---\n\n`;

  // ── Executive Summary ─────────────────────────────────────────────────────
  md += `## 📊 Executive Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total chapters attempted | **${results.length}** |\n`;
  md += `| ✅ Successful | **${success}** |\n`;
  md += `| ❌ Failed | **${failed}** |\n`;
  md += `| ⏭️ Skipped | **${skipped}** |\n`;
  md += `| 📈 Avg score (successful quizzes) | **${avgPct}%** |\n`;
  md += `| ⏱️ Total runtime | **${(totalMs / 60000).toFixed(1)} min** |\n\n`;

  // ── Latency ───────────────────────────────────────────────────────────────
  md += `## ⏱️ Latency Log\n\n`;
  md += `> 🟢 < 1 s  🟡 1–3 s  🔴 > 3 s\n\n`;
  md += `| Timestamp | Event | Latency |\n|-----------|-------|---------|\n`;
  latency.forEach(({ timestamp, label, ms }) => {
    const dot = ms < 1000 ? '🟢' : ms < 3000 ? '🟡' : '🔴';
    md += `| ${timestamp} | ${label} | ${dot} ${ms} ms |\n`;
  });
  md += '\n';

  // ── Per-subject tables ────────────────────────────────────────────────────
  for (const subject of CFG.subjects) {
    const rows = results.filter(r => r.subject === subject);
    if (!rows.length) continue;

    md += `## 📚 ${subject}\n\n`;
    md += `> ✅ ${rows.filter(r => r.status === 'success').length} passed  `;
    md += `❌ ${rows.filter(r => r.status === 'failed').length} failed  `;
    md += `⏭️ ${rows.filter(r => r.status === 'skipped').length} skipped\n\n`;

    md += `| # | Chapter | Table ID | Status | Score | Quiz Load | Duration |\n`;
    md += `|---|---------|----------|--------|-------|-----------|----------|\n`;
    rows.forEach((r, i) => {
      const icon  = { success: '✅', failed: '❌', skipped: '⏭️', pending: '⏳' }[r.status] ?? '?';
      const score = (r.score !== null && r.totalQ > 0)
        ? `${r.score}/${r.totalQ} (${Math.round(r.score / r.totalQ * 100)}%)`
        : '—';
      md += `| ${i + 1} | ${r.chapter} | \`${r.tableId}\` | ${icon} | ${score} | ${r.quizLoadMs || '—'} ms | ${(r.durationMs / 1000).toFixed(1)} s |\n`;
    });
    md += '\n';
  }

  // ── Failed quiz deep-dive ─────────────────────────────────────────────────
  const failedRows = results.filter(r => r.status === 'failed');
  if (failedRows.length) {
    md += `## ❌ Failed Quizzes — Root Cause Analysis\n\n`;
    failedRows.forEach((r, i) => {
      md += `### ${i + 1}. ${r.subject} → ${r.chapter}\n\n`;
      md += `- **Table ID:** \`${r.tableId}\`\n`;
      md += `- **Grade:** ${r.grade}\n`;
      md += `- **Error:** \`${r.error}\`\n`;

      let cause = 'Unknown — review screenshot.';
      if (/no questions|0 rows/i.test(r.error))
        cause = 'Supabase table exists but has **no rows** with `difficulty = \'Simple\'`.';
      else if (/does not exist|relation/i.test(r.error))
        cause = 'Supabase **table does not exist** — `table_id` in curriculum JS has no matching table.';
      else if (/timeout/i.test(r.error))
        cause = 'Page or element **timed out** — Supabase slow / rate-limited, or quiz UI never rendered.';
      else if (/chapter card/i.test(r.error))
        cause = 'Chapter card index mismatch after page reload — DOM re-rendered differently.';
      else if (/modal/i.test(r.error))
        cause = 'Difficulty modal did not appear after clicking the chapter card.';

      md += `- **Probable cause:** ${cause}\n`;
      md += `- **Fix:** Verify \`${r.tableId}\` exists in Supabase with ≥ 1 row where \`difficulty = 'Simple'\`.\n`;
      if (r.screenshot) md += `- **Screenshot:** \`${r.screenshot}\`\n`;
      md += '\n';
    });

    md += `### Quick-fix Table\n\n`;
    md += `| Subject | Chapter | Table ID | Action |\n|---------|---------|----------|--------|\n`;
    failedRows.forEach(r => {
      const action = /no questions|0 rows/i.test(r.error)
        ? 'Add Simple rows to existing table'
        : /does not exist/i.test(r.error)
        ? 'Create the Supabase table'
        : 'Review screenshot / logs';
      md += `| ${r.subject} | ${r.chapter} | \`${r.tableId}\` | ${action} |\n`;
    });
    md += '\n';
  } else {
    md += `## ✅ All Quizzes Passed\n\nEvery chapter loaded and completed successfully.\n\n`;
  }

  // ── Supabase coverage ─────────────────────────────────────────────────────
  md += `## 🗄️ Supabase Table Coverage\n\n`;
  const okTables = results.filter(r => r.status === 'success').map(r => `\`${r.tableId}\``);
  const badTables = results.filter(r => r.status === 'failed').map(r => `\`${r.tableId}\``);
  md += `**Working tables (${okTables.length}):** ${okTables.join(' ') || '_none_'}\n\n`;
  md += `**Broken tables (${badTables.length}):** ${badTables.join(' ') || '_none_'}\n\n`;

  md += `\n---\n*Ready4Exam Quiz Bot — ${now.toUTCString()}*\n`;
  return md;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('🤖 Quiz Bot starting', '🤖');
  log(`   Subjects: ${CFG.subjects.join(', ')}`);
  log(`   Headless: ${CFG.headless}`);

  const browser = await chromium.launch({
    headless: CFG.headless,
    slowMo  : CFG.slowMo,
    args    : ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport : { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
               'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  page.setDefaultTimeout(CFG.timeout);

  // Intercept Supabase BEFORE first navigation so no answers are missed
  await setupInterception(page);

  try {
    await login(page);

    for (const subject of CFG.subjects) {
      await runSubject(page, subject);
    }
  } catch (err) {
    log(`Fatal error: ${err.message}`, '❌');
    console.error(err.stack);
    try {
      ensureDir(CFG.screenshotDir);
      await page.screenshot({ path: path.join(CFG.screenshotDir, 'FATAL_error.png'), fullPage: true });
    } catch (_) {}
  } finally {
    // Always write the report
    const report = buildReport();
    fs.writeFileSync(CFG.reportPath, report, 'utf8');
    log(`\n📄 Report → ${CFG.reportPath}`);

    const ok  = results.filter(r => r.status === 'success').length;
    const bad = results.filter(r => r.status === 'failed').length;
    log(`\n${'─'.repeat(50)}`);
    log(`Chapters: ${results.length} total | ✅ ${ok} OK | ❌ ${bad} failed`);
    log(`Runtime: ${((Date.now() - botStart) / 60000).toFixed(1)} min`);
    log(`${'─'.repeat(50)}`);

    await browser.close();
    log('🤖 Done.');
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
