#!/usr/bin/env node
/**
 * Ready4Exam Quiz Bot
 * ─────────────────────────────────────────────────────────────────────────────
 * Automates the full quiz flow across all Science, Mathematics, and Social
 * Science chapters for a Grade-10 student account.
 *
 * Features
 *   • Intercepts Supabase REST responses to extract correct_answer_key values
 *     so every question is answered correctly before submitting.
 *   • Measures latency at every navigation step (login, page loads, quiz loads,
 *     per-question response times, submission round-trips).
 *   • Detects broken quizzes (empty Supabase table, network errors, UI hangs)
 *     and captures a screenshot for each failure.
 *   • Writes a detailed Markdown report upon completion.
 *
 * Usage
 *   node bot.js                  # headed browser (recommended first run)
 *   HEADLESS=true node bot.js   # headless (for CI / unattended)
 *
 * Prerequisites
 *   npm install
 *   npx playwright install chromium
 */

'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────

const CFG = {
  baseUrl    : 'https://karnkeshav.github.io/masterpage_1',
  username   : 's.10.a',
  password   : 'Ready4Exam@2026',
  subjects   : ['Science', 'Mathematics', 'Social Science'],
  difficulty : 'Simple',
  headless   : process.env.HEADLESS === 'true',
  slowMo     : 120,          // ms between UI actions (lower = faster, may miss renders)
  timeout    : 60_000,       // 60 s per page/element wait
  reportDir  : process.cwd(),
  screenshotDir: path.join(process.cwd(), 'bot_screenshots'),
};

// ─── Shared State ─────────────────────────────────────────────────────────────

const ST = {
  answerCache : new Map(),   // "questionId" → "A"|"B"|"C"|"D"
  latency     : [],          // [{ label, ms, timestamp }]
  results     : [],          // one entry per chapter attempt
  errors      : [],          // quick error list for report
  botStart    : Date.now(),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ts = () => new Date().toISOString().replace('T', ' ').split('.')[0];

const ICONS = { INFO:'✅', WARN:'⚠️ ', ERROR:'❌', NAV:'🔗', SKIP:'⏭️ ', QUIZ:'📝' };
function log(msg, type = 'INFO') {
  console.log(`[${ts()}] ${ICONS[type] ?? '•'} ${msg}`);
}

/** Simple stopwatch tied to ST.latency */
const Perf = (() => {
  const marks = {};
  return {
    mark   : (id)           => (marks[id] = Date.now()),
    measure: (label, markId) => {
      const ms = Date.now() - (marks[markId] ?? Date.now());
      ST.latency.push({ label, ms, timestamp: ts() });
      return ms;
    },
  };
})();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Network Interception (harvest correct answers from Supabase) ─────────────

async function setupNetworkInterception(page) {
  /**
   * Every quiz question fetch hits:
   *   https://zqhzekzilalbszpfwxhn.supabase.co/rest/v1/<table>?select=...&difficulty=eq.Simple
   * The response is an array of question objects that include correct_answer_key.
   * We cache them so the bot can pick the right radio button.
   */
  await page.route('**supabase.co/**', async (route) => {
    const reqUrl = route.request().url();
    Perf.mark('supabase_req');

    let response;
    try {
      response = await route.fetch();
    } catch (e) {
      log(`Supabase fetch failed: ${e.message}`, 'ERROR');
      await route.abort();
      return;
    }

    const ms = Perf.measure(`Supabase → ${new URL(reqUrl).pathname.split('/').pop()}`, 'supabase_req');

    try {
      const body = await response.json();
      if (Array.isArray(body) && body.length > 0) {
        let cached = 0;
        body.forEach(q => {
          const id  = String(q.id ?? '');
          const ans = (q.correct_answer_key ?? '').trim().toUpperCase();
          if (id && ans) { ST.answerCache.set(id, ans); cached++; }
        });
        if (cached > 0) log(`  Cached ${cached} answers from Supabase (${ms} ms)`);
      } else if (Array.isArray(body) && body.length === 0) {
        log(`  Supabase returned 0 rows for ${new URL(reqUrl).pathname} — table may be empty`, 'WARN');
      }
    } catch (_) {
      // Non-JSON response (e.g. auth endpoints) — passthrough silently
    }

    await route.fulfill({ response });
  });
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login(page) {
  log('Navigating to homepage…', 'NAV');
  Perf.mark('homepage');
  await page.goto(CFG.baseUrl + '/index.html', { waitUntil: 'networkidle', timeout: CFG.timeout });
  Perf.measure('Homepage load', 'homepage');

  // Clear autofill and type credentials
  await page.fill('#username', '');
  await page.fill('#username', CFG.username);
  await page.fill('#password', '');
  await page.fill('#password', CFG.password);

  Perf.mark('login_submit');
  // Submit — the form id is `sovereign-login-form`; its submit button has no type=submit so click last button
  await page.evaluate(() => {
    const form = document.getElementById('sovereign-login-form');
    if (form) {
      const btn = form.querySelector('button');
      if (btn) btn.click();
    }
  });

  // Wait for redirect to student console
  await page.waitForURL('**/consoles/student.html**', { timeout: CFG.timeout });
  const loginMs = Perf.measure('Login + redirect', 'login_submit');

  // Wait for the app to reveal (guard passes)
  await page.waitForSelector('#app:not(.hidden)', { timeout: CFG.timeout });
  log(`Logged in. Student console ready (${loginMs} ms)`);
}

// ─── Detect grade from student console ────────────────────────────────────────

async function detectGrade(page) {
  const grade = await page.evaluate(() => {
    const badge = document.getElementById('context-badge');
    if (badge) {
      const m = badge.textContent.match(/\d+/);
      return m ? m[0] : '10';
    }
    return '10';
  }).catch(() => '10');
  log(`Detected grade: ${grade}`);
  return grade;
}

// ─── Chapter Selection ────────────────────────────────────────────────────────

async function navigateToChapterSelection(page, subject, grade) {
  log(`  Navigating to chapter-selection: subject=${subject}, grade=${grade}`, 'NAV');
  Perf.mark(`chapsel_${subject}`);
  await page.goto(
    `${CFG.baseUrl}/app/chapter-selection.html?subject=${encodeURIComponent(subject)}&grade=${grade}`,
    { waitUntil: 'networkidle', timeout: CFG.timeout }
  );

  // Wait until chapters actually render (the JS fetches curriculum and injects HTML)
  await page.waitForFunction(() => {
    const area = document.getElementById('content-area');
    return area && area.querySelectorAll('[onclick^="startQuiz"]').length > 0;
  }, { timeout: CFG.timeout });

  Perf.measure(`Chapter-selection load (${subject})`, `chapsel_${subject}`);
}

// ─── Scrape chapter list ──────────────────────────────────────────────────────

async function scrapeChapters(page) {
  const chapters = await page.evaluate(() => {
    const cards = document.querySelectorAll('#content-area [onclick^="startQuiz"]');
    return Array.from(cards).map(card => {
      const m = card.getAttribute('onclick').match(/startQuiz\('([^']+)',\s*'([^']+)',\s*'([^']+)'\)/);
      return m ? { tableId: m[1], title: m[2], grade: m[3] } : null;
    }).filter(Boolean);
  });
  log(`  Found ${chapters.length} chapters`);
  return chapters;
}

// ─── Run one chapter quiz ─────────────────────────────────────────────────────

async function runChapterQuiz(page, chapter, subject) {
  const entry = {
    subject,
    chapter     : chapter.title,
    tableId     : chapter.tableId,
    grade       : chapter.grade,
    status      : 'pending',
    score       : null,
    totalQ      : 0,
    durationMs  : 0,
    quizLoadMs  : 0,
    avgQAnswerMs: 0,
    error       : null,
    screenshot  : null,
  };

  const chStart = Date.now();

  try {
    // ── 1. Click the chapter card ──────────────────────────────────────────
    Perf.mark('chapter_click');
    const clicked = await page.evaluate((tid) => {
      const cards = document.querySelectorAll('#content-area [onclick^="startQuiz"]');
      for (const c of cards) {
        if (c.getAttribute('onclick').includes(tid)) { c.click(); return true; }
      }
      return false;
    }, chapter.tableId);

    if (!clicked) throw new Error(`Chapter card not found for tableId: ${chapter.tableId}`);

    // ── 2. Wait for difficulty modal ───────────────────────────────────────
    await page.waitForSelector('#symmetric-difficulty-modal', { timeout: 15_000 });
    Perf.measure(`Chapter click → modal (${chapter.title})`, 'chapter_click');

    // ── 3. Click Simple difficulty ─────────────────────────────────────────
    Perf.mark('diff_select');
    await page.evaluate(() => {
      const btns = document.querySelectorAll('#symmetric-difficulty-modal button');
      for (const b of btns) {
        if (b.textContent.trim() === 'Simple') { b.click(); return; }
      }
      // Fallback: call launchQuiz directly
      if (typeof window.launchQuiz === 'function') window.launchQuiz('Simple');
    });

    // ── 4. Wait for quiz-engine to load ────────────────────────────────────
    await page.waitForURL('**/quiz-engine.html**', { timeout: CFG.timeout });

    // Check if quiz-content is visible OR status-message shows an error
    await page.waitForFunction(() => {
      const qc  = document.getElementById('quiz-content');
      const sm  = document.getElementById('status-message');
      return (qc && !qc.classList.contains('hidden')) ||
             (sm && !sm.classList.contains('hidden') && sm.textContent.trim());
    }, { timeout: CFG.timeout });

    // Detect load error (empty Supabase table)
    const loadError = await page.evaluate(() => {
      const sm = document.getElementById('status-message');
      if (sm && !sm.classList.contains('hidden') && sm.textContent.trim()) {
        return sm.textContent.trim();
      }
      return null;
    });

    if (loadError) throw new Error(`Quiz failed to load: ${loadError}`);

    entry.quizLoadMs = Perf.measure(`Quiz load (${chapter.title})`, 'diff_select');
    log(`    Quiz loaded in ${entry.quizLoadMs} ms`, 'QUIZ');

    // ── 5. Answer all questions ────────────────────────────────────────────
    const qResult = await answerAllQuestions(page, chapter, entry);
    entry.score       = qResult.score;
    entry.totalQ      = qResult.total;
    entry.avgQAnswerMs = qResult.avgMs;
    entry.status      = 'success';

    const pct = entry.totalQ ? Math.round((entry.score / entry.totalQ) * 100) : 0;
    log(`    ✅ ${entry.score}/${entry.totalQ} (${pct}%) — avg answer time: ${entry.avgQAnswerMs} ms`);

  } catch (err) {
    entry.status = 'failed';
    entry.error  = err.message;
    ST.errors.push({ subject, chapter: chapter.title, tableId: chapter.tableId, error: err.message });
    log(`    Failed: ${err.message}`, 'ERROR');

    // Screenshot for debugging
    try {
      ensureDir(CFG.screenshotDir);
      const ssPath = path.join(CFG.screenshotDir, `FAIL_${chapter.tableId}.png`);
      await page.screenshot({ path: ssPath, fullPage: true });
      entry.screenshot = ssPath;
      log(`    Screenshot saved: ${ssPath}`, 'WARN');
    } catch (_) {}
  }

  entry.durationMs = Date.now() - chStart;
  return entry;
}

// ─── Answer loop ──────────────────────────────────────────────────────────────

async function answerAllQuestions(page, chapter, entry) {
  let total    = 0;
  let correct  = 0;
  let answered = 0;
  const qTimes = [];

  while (true) {
    // Wait for question list to have content
    await page.waitForFunction(() => {
      const ql = document.getElementById('question-list');
      return ql && ql.querySelector('input[type="radio"]');
    }, { timeout: CFG.timeout });

    // Read counter e.g. "3/20"
    const counterText = await page.$eval('#question-counter', el => el.textContent).catch(() => '1/1');
    const parts = counterText.split('/');
    const current = parseInt(parts[0]) || 1;
    total = parseInt(parts[1]) || 1;

    const qStart = Date.now();

    // Get the question id from the first radio in this question block
    const qId = await page.evaluate(() => {
      const r = document.querySelector('#question-list input[type="radio"]');
      return r ? r.dataset.id : null;
    });

    const correctAns = qId ? ST.answerCache.get(qId) : null;

    if (correctAns) {
      // Click the radio with the correct value
      const clicked = await page.evaluate((id, ans) => {
        const r = document.querySelector(`input[type="radio"][data-id="${id}"][value="${ans}"]`);
        if (r) {
          const label = r.closest('label');
          if (label) label.click(); else r.click();
          return true;
        }
        return false;
      }, qId, correctAns);

      if (clicked) correct++;
      else {
        // Correct option radio not found — fall back to first option
        await page.evaluate(() => {
          const r = document.querySelector('#question-list input[type="radio"]');
          if (r) { const l = r.closest('label'); if (l) l.click(); else r.click(); }
        });
      }
    } else {
      // No cached answer (table gave no data) — pick first option
      await page.evaluate(() => {
        const r = document.querySelector('#question-list input[type="radio"]');
        if (r) { const l = r.closest('label'); if (l) l.click(); else r.click(); }
      });
    }

    qTimes.push(Date.now() - qStart);
    answered++;

    await sleep(200); // brief pause for UI state update

    // Is submit button visible?
    const submitVisible = await page.evaluate(() => {
      const b = document.getElementById('submit-btn');
      return b && !b.classList.contains('hidden');
    });

    if (submitVisible || current === total) {
      // Submit the quiz
      Perf.mark('submit');
      await page.click('#submit-btn');
      await page.waitForSelector('#results-screen:not(.hidden)', { timeout: CFG.timeout });
      Perf.measure(`Submit → results (${chapter.title})`, 'submit');

      // Parse final score from result screen
      const scoreText = await page.$eval('#score-display', el => el.innerText).catch(() => '');
      const sm = scoreText.match(/(\d+)\s*[\/\\]\s*(\d+)/);
      const finalScore = sm ? parseInt(sm[1]) : correct;
      const finalTotal = sm ? parseInt(sm[2]) : total;

      const avgMs = qTimes.length ? Math.round(qTimes.reduce((a, b) => a + b, 0) / qTimes.length) : 0;
      return { score: finalScore, total: finalTotal, avgMs };
    } else {
      // Click Next
      await page.click('#next-btn');
      await sleep(150);
    }
  }
}

// ─── Run one subject ──────────────────────────────────────────────────────────

async function runSubject(page, subject, grade) {
  log(`\n${'═'.repeat(64)}\n📚  ${subject.toUpperCase()}\n${'═'.repeat(64)}`);

  Perf.mark(`subject_${subject}`);

  await navigateToChapterSelection(page, subject, grade);
  const chapters = await scrapeChapters(page);

  if (chapters.length === 0) {
    log(`  No chapters found for ${subject} — skipping`, 'SKIP');
    ST.results.push({
      subject, chapter: 'ALL', tableId: '', grade,
      status: 'skipped', score: null, totalQ: 0, durationMs: 0,
      quizLoadMs: 0, avgQAnswerMs: 0, error: 'No chapters found', screenshot: null,
    });
    return;
  }

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    log(`\n  [${i + 1}/${chapters.length}] ${ch.title}`);

    const result = await runChapterQuiz(page, ch, subject);
    ST.results.push(result);

    if (i < chapters.length - 1) {
      // Navigate back to chapter selection for the next chapter
      await navigateBackToChapterSelection(page, subject, grade, ch.title);
    }
  }

  Perf.measure(`Full subject: ${subject}`, `subject_${subject}`);
}

// ─── Navigate back after quiz ─────────────────────────────────────────────────

async function navigateBackToChapterSelection(page, subject, grade, prevChapter) {
  Perf.mark('nav_back');
  try {
    // Direct URL navigation is the most reliable after quiz submission
    await page.goto(
      `${CFG.baseUrl}/app/chapter-selection.html?subject=${encodeURIComponent(subject)}&grade=${grade}`,
      { waitUntil: 'networkidle', timeout: CFG.timeout }
    );
    await page.waitForFunction(() => {
      return document.querySelectorAll('#content-area [onclick^="startQuiz"]').length > 0;
    }, { timeout: CFG.timeout });
    Perf.measure(`Back to chapter-selection after "${prevChapter}"`, 'nav_back');
  } catch (e) {
    log(`  Could not navigate back to chapter selection: ${e.message}`, 'WARN');
  }
}

// ─── Markdown Report ──────────────────────────────────────────────────────────

function generateReport() {
  const now        = new Date();
  const totalMs    = Date.now() - ST.botStart;
  const success    = ST.results.filter(r => r.status === 'success').length;
  const failed     = ST.results.filter(r => r.status === 'failed').length;
  const skipped    = ST.results.filter(r => r.status === 'skipped').length;
  const scoredRuns = ST.results.filter(r => r.score !== null && r.totalQ > 0);
  const avgPct     = scoredRuns.length
    ? (scoredRuns.reduce((s, r) => s + (r.score / r.totalQ * 100), 0) / scoredRuns.length).toFixed(1)
    : 'N/A';

  let md = '';

  // ── Header ────────────────────────────────────────────────────────────────
  md += `# Ready4Exam Quiz Bot — Full Audit Report\n\n`;
  md += `> **Generated:** ${now.toUTCString()}  \n`;
  md += `> **Account:** \`${CFG.username}\` | **Difficulty:** ${CFG.difficulty}  \n`;
  md += `> **Subjects audited:** ${CFG.subjects.join(', ')}  \n\n`;
  md += `---\n\n`;

  // ── Executive Summary ─────────────────────────────────────────────────────
  md += `## 📊 Executive Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total chapters attempted | **${ST.results.length}** |\n`;
  md += `| ✅ Successful | **${success}** |\n`;
  md += `| ❌ Failed | **${failed}** |\n`;
  md += `| ⏭️ Skipped | **${skipped}** |\n`;
  md += `| 📈 Avg score (successful quizzes) | **${avgPct}%** |\n`;
  md += `| ⏱️ Total runtime | **${(totalMs / 60000).toFixed(1)} min** |\n`;
  md += `| 🤖 Bot mode | **${CFG.headless ? 'Headless' : 'Headed'}** |\n\n`;

  // ── Latency Report ────────────────────────────────────────────────────────
  md += `## ⏱️ Page & Action Latency\n\n`;
  md += `| Timestamp | Event | Latency |\n`;
  md += `|-----------|-------|---------|\n`;

  // Group: navigation events first, then Supabase, then quiz internals
  const navEvents = ST.latency.filter(l =>
    l.label.match(/load|login|redirect|chapter|subject|back|submit|quiz load/i)
  );
  const supEvents = ST.latency.filter(l => l.label.startsWith('Supabase'));
  const restEvents = ST.latency.filter(l =>
    !l.label.match(/load|login|redirect|chapter|subject|back|submit|quiz load/i) &&
    !l.label.startsWith('Supabase')
  );

  for (const { timestamp, label, ms } of [...navEvents, ...supEvents, ...restEvents]) {
    const bar = ms < 1000 ? '🟢' : ms < 3000 ? '🟡' : '🔴';
    md += `| ${timestamp} | ${label} | ${bar} **${ms} ms** |\n`;
  }
  md += '\n';

  // ── Per-subject Chapter Tables ────────────────────────────────────────────
  for (const subject of CFG.subjects) {
    const rows = ST.results.filter(r => r.subject === subject);
    if (!rows.length) continue;

    const sSuccess = rows.filter(r => r.status === 'success').length;
    const sFailed  = rows.filter(r => r.status === 'failed').length;

    md += `## 📚 ${subject}\n\n`;
    md += `> ${sSuccess} passed · ${sFailed} failed · ${rows.length} total\n\n`;
    md += `| # | Chapter | Table ID | Status | Score | Quiz Load | Total Time |\n`;
    md += `|---|---------|----------|--------|-------|-----------|------------|\n`;

    rows.forEach((r, i) => {
      const icon  = r.status === 'success' ? '✅' : r.status === 'failed' ? '❌' : '⏭️';
      const score = (r.score !== null && r.totalQ > 0)
        ? `${r.score}/${r.totalQ} (${Math.round(r.score / r.totalQ * 100)}%)`
        : '—';
      const loadT = r.quizLoadMs ? `${r.quizLoadMs} ms` : '—';
      const total = `${(r.durationMs / 1000).toFixed(1)} s`;
      md += `| ${i + 1} | ${r.chapter} | \`${r.tableId}\` | ${icon} | ${score} | ${loadT} | ${total} |\n`;
    });
    md += '\n';
  }

  // ── Failed Quizzes Deep-Dive ──────────────────────────────────────────────
  const failedRows = ST.results.filter(r => r.status === 'failed');
  if (failedRows.length) {
    md += `## ❌ Failed Quizzes — Root Cause Analysis\n\n`;

    failedRows.forEach((r, i) => {
      md += `### ${i + 1}. ${r.subject} → ${r.chapter}\n\n`;
      md += `- **Table ID:** \`${r.tableId}\`\n`;
      md += `- **Grade:** ${r.grade}\n`;
      md += `- **Error message:** \`${r.error}\`\n`;

      // Infer probable cause
      let cause = 'Unknown — review manually.';
      if (/no questions found/i.test(r.error)) {
        cause = 'Supabase table **exists but has no rows** matching `difficulty = Simple`. ' +
                'Either the table is empty or the difficulty values differ from "Simple".';
      } else if (/table.*not.*found|relation.*does not exist/i.test(r.error)) {
        cause = 'Supabase table **does not exist** — the `table_id` in the curriculum JS ' +
                'does not match any created table in Supabase.';
      } else if (/timeout/i.test(r.error)) {
        cause = 'Page or element **timed out** — Supabase may have been slow, rate-limited, ' +
                'or the quiz UI never rendered.';
      } else if (/chapter card not found/i.test(r.error)) {
        cause = 'The chapter card\'s `onclick` attribute does not contain the expected `tableId`. ' +
                'Check if the `table_name` field in `chapter-selection.html` resolves correctly.';
      } else if (/network/i.test(r.error)) {
        cause = 'Network failure during question fetch — transient or Supabase is down.';
      }

      md += `- **Probable cause:** ${cause}\n`;
      md += `- **Suggested fix:** Verify \`${r.tableId}\` exists in Supabase and has ≥1 row with \`difficulty = 'Simple'\`.\n`;
      if (r.screenshot) md += `- **Screenshot:** \`${r.screenshot}\`\n`;
      md += '\n';
    });

    // Consolidated fix table
    md += `### Quick Fix Reference\n\n`;
    md += `| Subject | Chapter | Table ID | Action Needed |\n`;
    md += `|---------|---------|----------|---------------|\n`;
    failedRows.forEach(r => {
      const action = /no questions/i.test(r.error)
        ? 'Add Simple-difficulty rows to Supabase table'
        : /does not exist/i.test(r.error)
        ? 'Create Supabase table with correct name'
        : 'Investigate error log / screenshot';
      md += `| ${r.subject} | ${r.chapter} | \`${r.tableId}\` | ${action} |\n`;
    });
    md += '\n';
  } else {
    md += `## ✅ No Failed Quizzes\n\nAll chapters completed successfully.\n\n`;
  }

  // ── Supabase Table Coverage ───────────────────────────────────────────────
  md += `## 🗄️ Supabase Table Coverage\n\n`;
  md += `Tables successfully fetched (questions returned):\n\n`;

  const successTables = ST.results
    .filter(r => r.status === 'success')
    .map(r => `\`${r.tableId}\``);
  md += successTables.length ? successTables.join(', ') + '\n\n' : '_None_\n\n';

  md += `Tables that returned no data or failed:\n\n`;
  const failTables = ST.results
    .filter(r => r.status === 'failed')
    .map(r => `\`${r.tableId}\``);
  md += failTables.length ? failTables.join(', ') + '\n\n' : '_None_\n\n';

  // ── Latency Heatmap ────────────────────────────────────────────────────────
  const navLat = ST.latency.filter(l => l.label.match(/load|login|redirect|chapter|subject/i));
  if (navLat.length) {
    const maxMs = Math.max(...navLat.map(l => l.ms));
    const minMs = Math.min(...navLat.map(l => l.ms));
    md += `## 🌡️ Navigation Latency Summary\n\n`;
    md += `| | Value |\n|--|--|\n`;
    md += `| Slowest navigation | **${maxMs} ms** |\n`;
    md += `| Fastest navigation | **${minMs} ms** |\n`;
    md += `| Avg navigation | **${Math.round(navLat.reduce((s, l) => s + l.ms, 0) / navLat.length)} ms** |\n\n`;

    md += `> 🟢 < 1 s (fast)  🟡 1–3 s (acceptable)  🔴 > 3 s (slow — check network / Firebase cold-start)\n\n`;
  }

  // ── Recommendations ────────────────────────────────────────────────────────
  md += `## 💡 Recommendations\n\n`;

  if (failedRows.length > 0) {
    md += `1. **Fix empty Supabase tables** — ${failedRows.length} chapters have no quiz data. `;
    md += `Use the table IDs above to locate and populate the missing rows.\n`;
    md += `2. **Add a health-check API** — expose a lightweight endpoint that lists all expected `;
    md += `table IDs vs tables that actually have rows, so broken chapters are caught before students encounter them.\n`;
    md += `3. **Smoke-test after every curriculum update** — re-run this bot with \`HEADLESS=true node bot.js\` `;
    md += `after adding new chapters.\n\n`;
  }

  const slowNavs = ST.latency.filter(l => l.label.match(/load/i) && l.ms > 5000);
  if (slowNavs.length) {
    md += `4. **Investigate slow page loads** — ${slowNavs.length} pages took > 5 s to load:\n`;
    slowNavs.forEach(l => md += `   - \`${l.label}\`: ${l.ms} ms\n`);
    md += '\n';
  }

  md += `\n---\n*Generated by Ready4Exam Quiz Bot — ${now.toUTCString()}*\n`;
  return md;
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main() {
  log('🤖 Ready4Exam Quiz Bot starting…');
  log(`   Headless: ${CFG.headless} | Subjects: ${CFG.subjects.join(', ')}`);

  const browser = await chromium.launch({
    headless: CFG.headless,
    slowMo  : CFG.slowMo,
    args    : ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    viewport  : { width: 1280, height: 900 },
    userAgent : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  page.setDefaultTimeout(CFG.timeout);

  // Intercept Supabase BEFORE any navigation so no answers are missed
  await setupNetworkInterception(page);

  try {
    // ── 1. Login ─────────────────────────────────────────────────────────────
    await login(page);
    const grade = await detectGrade(page);

    // ── 2. Process each subject sequentially ─────────────────────────────────
    for (const subject of CFG.subjects) {
      try {
        await runSubject(page, subject, grade);
      } catch (err) {
        log(`Subject "${subject}" crashed: ${err.message}`, 'ERROR');
        ST.results.push({
          subject, chapter: 'ALL', tableId: '', grade,
          status: 'failed', score: null, totalQ: 0, durationMs: 0,
          quizLoadMs: 0, avgQAnswerMs: 0,
          error: `Subject-level crash: ${err.message}`, screenshot: null,
        });
      }
    }

  } catch (err) {
    log(`Fatal error: ${err.message}`, 'ERROR');
    log(err.stack, 'ERROR');
  } finally {
    // ── 3. Write report ───────────────────────────────────────────────────────
    const reportPath = path.join(CFG.reportDir, 'quiz_bot_report.md');
    const report = generateReport();
    fs.writeFileSync(reportPath, report, 'utf8');
    log(`\n📄 Report written → ${reportPath}`);

    // Print quick summary to console
    const success = ST.results.filter(r => r.status === 'success').length;
    const failed  = ST.results.filter(r => r.status === 'failed').length;
    log(`\n${'─'.repeat(50)}`);
    log(`Chapters: ${ST.results.length} total | ✅ ${success} OK | ❌ ${failed} failed`);
    log(`Runtime: ${((Date.now() - ST.botStart) / 60000).toFixed(1)} min`);
    log(`${'─'.repeat(50)}\n`);

    await browser.close();
    log('🤖 Bot finished.');
  }
}

main().catch(err => {
  console.error('Unhandled fatal error:', err);
  process.exit(1);
});
