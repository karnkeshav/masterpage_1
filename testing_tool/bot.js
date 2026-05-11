#!/usr/bin/env node
/**
 * Ready4Exam Quiz Bot — testing_tool/bot.js
 *
 * ENHANCED:
 *   After completing one account, prompts for the next (username + password).
 *   Repeats until user enters 'exit'.
 *   At the end, generates a consolidated report showing failed chapters per class/subject.
 *   Report saved to: testing_tool/reports/report_<timestamp>.md
 *
 * Usage:
 *   node bot.js
 *   HEADLESS=true node bot.js
 */
'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const readline = require('readline');

const CFG = {
  baseUrl         : 'https://karnkeshav.github.io/masterpage_1',
  subjects        : ['Science', 'Mathematics', 'Social Science'],
  headless        : process.env.HEADLESS === 'true',
  slowMo          : 80,
  pageTimeout     : 60_000,
  quizLoadTimeout : 45_000,
  quizTimeout     : 120_000,
  screenshotDir   : path.join(__dirname, 'bot_screenshots'),
  reportsDir      : path.join(__dirname, 'reports'),
};

// Global state: track results across all accounts
const allResults = [];
const runMetadata = [];

const iso = () => new Date().toISOString().replace('T', ' ').split('.')[0];
function log(msg, icon = '  ') { console.log(`[${iso()}] ${icon} ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

const _m = {};
function mark(id)  { _m[id] = Date.now(); }
function measure(label, id) {
  const ms = Date.now() - (_m[id] ?? Date.now());
  log(`⏱  ${label}: ${ms} ms`);
  return ms;
}

process.on('unhandledRejection', reason => {
  log(`[unhandledRejection] ${reason} — continuing`, '⚠️');
});

const OPTIONS = ['A', 'B', 'C', 'D'];
function rnd() { return OPTIONS[Math.floor(Math.random() * 4)]; }

async function waitForRadios(page, timeout) {
  await page.waitForSelector('#question-list input[type="radio"]', {
    state: 'attached', timeout: timeout ?? CFG.quizTimeout,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTIVE PROMPT
// ─────────────────────────────────────────────────────────────────────────────
async function promptUser(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────
async function login(page, username, password) {
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
  await page.fill('#username', username);
  await page.fill('#password', password);

  log(`Logging in as ${username}…`, '🔐');
  mark('login');
  await page.click('#sovereign-login-form button');
  await page.waitForURL('**/consoles/student.html**', { timeout: CFG.pageTimeout });
  measure(`Login → student console (${username})`, 'login');
  await page.waitForSelector('#app:not(.hidden)', { timeout: CFG.pageTimeout });
  log(`Student console ready for ${username}.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATE TO CHAPTER-SELECTION
// ─────────────────────────────────────────────────────────────────────────────
async function goToChapterSelection(page, subject, grade) {
  mark('chapsel');
  const url = `${CFG.baseUrl}/app/chapter-selection.html`
            + `?subject=${encodeURIComponent(subject)}&grade=${grade}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CFG.pageTimeout });
  await page.waitForFunction(() => {
    const area = document.getElementById('content-area');
    return area && area.querySelectorAll('div[onclick^="startQuiz"]').length > 0;
  }, { timeout: CFG.pageTimeout });
  measure(`→ chapter-selection (${subject})`, 'chapsel');
}

// ─────────────────────────────────────────────────────────────────────────────
// SCRAPE CHAPTERS
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
// ANSWER AND SUBMIT
// ─────────────────────────────────────────────────────────────────────────────
async function answerAndSubmit(page, chapterTitle) {
  let total  = 0;
  const qMs  = [];
  const MAX  = 200;

  for (let safety = 0; safety < MAX; safety++) {
    await waitForRadios(page, CFG.quizTimeout);
    const t0 = Date.now();

    const counter = await page
      .$eval('#question-counter', el => el.textContent.trim())
      .catch(() => '1/1');
    const [curStr, totStr] = counter.split('/');
    const current = parseInt(curStr) || safety + 1;
    total         = parseInt(totStr) || 1;

    const choice = rnd();
    log(`    Q${current}/${total}  →  option ${choice}`);

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

    const canSubmit = await page.evaluate(() => {
      const b = document.getElementById('submit-btn');
      return b && !b.classList.contains('hidden');
    });

    if (canSubmit) {
      log(`    Submitting "${chapterTitle}"…`);
      mark('sub');
      await page.click('#submit-btn');
      await page.waitForSelector('#results-screen:not(.hidden)', {
        timeout: CFG.pageTimeout,
      });
      measure(`Submit → results (${chapterTitle})`, 'sub');
      await sleep(800);

      const avgMs = qMs.length
        ? Math.round(qMs.reduce((a, b) => a + b, 0) / qMs.length) : 0;
      return { total, avgMs };
    }

    const canNext = await page.evaluate(() => {
      const b = document.getElementById('next-btn');
      return b && !b.classList.contains('hidden');
    });
    if (canNext) {
      await page.click('#next-btn');
      await sleep(200);
    } else {
      await sleep(400);
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
    mark('ch');
    const clicked = await page.evaluate(idx => {
      const card = document.querySelectorAll(
        '#content-area div[onclick^="startQuiz"]'
      )[idx];
      if (card) { card.click(); return true; }
      return false;
    }, chapter.index);
    if (!clicked) throw new Error('Chapter card not found at index ' + chapter.index);

    await page.waitForSelector('#symmetric-difficulty-modal', { timeout: 12_000 });
    measure(`Chapter → modal (${chapter.title})`, 'ch');
    log('    Difficulty modal appeared');

    mark('simple');
    await page.evaluate(() => {
      const modal = document.getElementById('symmetric-difficulty-modal');
      if (!modal) return;
      for (const btn of modal.querySelectorAll('button')) {
        if (btn.textContent.trim() === 'Simple') { btn.click(); return; }
      }
      if (typeof window.launchQuiz === 'function') window.launchQuiz('Simple');
    });

    await page.waitForURL('**/quiz-engine.html**', { timeout: CFG.pageTimeout });

    log('    Waiting for questions…');
    await waitForRadios(page, CFG.quizLoadTimeout);
    entry.quizLoadMs = measure(`Simple → first question (${chapter.title})`, 'simple');
    log(`    Questions ready in ${entry.quizLoadMs} ms`);

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
// ─────────────────────────────────────────────────────────────────────────────
async function runSubject(page, subject) {
  log(`\n${'='.repeat(60)}`);
  log(`  SUBJECT: ${subject.toUpperCase()}`);
  log(`${'='.repeat(60)}`);
  mark(`subj_${subject}`);

  await goToChapterSelection(page, subject, '10');
  const initialList = await scrapeChapters(page);

  if (initialList.length === 0) {
    log('  No chapters — skipping', '⏭️');
    allResults.push({
      subject, chapter: '(none)', tableId: '', grade: '?',
      status: 'skipped', totalQ: 0, durationMs: 0,
      quizLoadMs: 0, avgAnswerMs: 0, error: 'No chapters found', screenshot: null,
    });
    return;
  }

  const grade      = initialList[0].grade;
  const N          = initialList.length;
  const chapterList = initialList.map(c => ({
    tableId: c.tableId, title: c.title, grade: c.grade,
  }));

  log(`  ${N} chapters found for ${subject} (grade ${grade})`);

  for (let i = 0; i < N; i++) {
    const ch = chapterList[i];

    log(`\n  Navigating to chapter-selection for chapter ${i + 1}/${N}…`);
    await goToChapterSelection(page, subject, grade);

    const fresh  = await scrapeChapters(page);
    const target = fresh.find(c => c.tableId === ch.tableId);

    if (!target) {
      log(`  ⚠️  "${ch.title}" not found on page — skipping`, '⚠️');
      allResults.push({
        subject, chapter: ch.title, tableId: ch.tableId, grade,
        status: 'failed', totalQ: 0, durationMs: 0,
        quizLoadMs: 0, avgAnswerMs: 0,
        error: 'Chapter card not found after re-scrape', screenshot: null,
      });
      continue;
    }

    const result = await runChapter(page, target, subject, i + 1, N);
    allResults.push(result);

    if (result.status === 'failed') {
      log(`  ⏭️  Chapter ${i + 1}/${N} FAILED — skipping to next chapter`, '⏭️');
    } else {
      log(`  Chapter ${i + 1}/${N} done. Moving to next…`);
    }
  }

  measure(`Subject total: ${subject}`, `subj_${subject}`);
  log(`\n  ✅ ${subject} complete — all ${N} chapters processed.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSOLIDATED REPORT — ACROSS ALL ACCOUNTS
// Shows failed chapters grouped by class/subject
// ─────────────────────────────────────────────────────────────────────────────
function buildConsolidatedReport() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').split('-').slice(0, 4).join('-');
  
  const ok   = allResults.filter(r => r.status === 'success').length;
  const bad  = allResults.filter(r => r.status === 'failed').length;
  const skip = allResults.filter(r => r.status === 'skipped').length;

  let md = `# Ready4Exam Quiz Bot — Consolidated Report\n\n`;
  md += `> **Generated:** ${now.toUTCString()}  \n`;
  md += `> **Accounts tested:** ${runMetadata.length}\n`;
  md += `> **Total chapters:** ${allResults.length}\n`;
  md += `> **✅ Completed:** ${ok} | **❌ Failed:** ${bad} | **⏭️ Skipped:** ${skip}\n\n---\n\n`;

  // Group by account + grade
  const byAccount = {};
  runMetadata.forEach(meta => {
    const key = `${meta.username} (Grade ${meta.grade})`;
    byAccount[key] = { meta, results: [] };
  });

  allResults.forEach(r => {
    const key = Object.keys(byAccount)[0]; // simple approach: first account
    // Better: find matching account by username in r (if stored)
    // For now, associate with the account the result came from
    Object.values(byAccount).forEach(acc => {
      if (!acc.results.length || acc.results[0].grade === r.grade) {
        acc.results.push(r);
      }
    });
  });

  // Per account
  Object.entries(byAccount).forEach(([accountKey, { meta, results: resPerAccount }]) => {
    if (!resPerAccount.length) resPerAccount = allResults;
    
    md += `## ${accountKey}\n\n`;
    const subjects = [...new Set(resPerAccount.map(r => r.subject))];
    
    subjects.forEach(subject => {
      const subRows = resPerAccount.filter(r => r.subject === subject);
      const subOk   = subRows.filter(r => r.status === 'success').length;
      const subBad  = subRows.filter(r => r.status === 'failed').length;
      
      md += `### ${subject}\n\n`;
      md += `> ✅ ${subOk} completed  |  ❌ ${subBad} failed\n\n`;
      md += `| Chapter | Table ID | Status | Q | Duration |\n`;
      md += `|---------|----------|--------|---|----------|\n`;
      
      subRows.forEach(r => {
        const icon = { success: '✅', failed: '❌', skipped: '⏭️' }[r.status] ?? '?';
        md += `| ${r.chapter} | \`${r.tableId}\` | ${icon} | ${r.totalQ || '—'} | ${(r.durationMs / 1000).toFixed(1)}s |\n`;
      });
      md += '\n';
    });
  });

  // Failed chapters summary
  const failed = allResults.filter(r => r.status === 'failed');
  if (failed.length) {
    md += `## ❌ Failed Chapters Summary\n\n`;
    md += `> **Total failed:** ${failed.length}\n\n`;
    md += `| Grade | Subject | Chapter | Table ID | Error |\n`;
    md += `|-------|---------|---------|----------|-------|\n`;
    failed.forEach(r => {
      let shortError = r.error;
      if (r.error.length > 40) shortError = r.error.substring(0, 37) + '...';
      md += `| ${r.grade} | ${r.subject} | ${r.chapter} | \`${r.tableId}\` | ${shortError} |\n`;
    });
    md += '\n';
  } else {
    md += `## ✅ All Chapters Completed Successfully\n\n`;
  }

  md += `\n---\n*Ready4Exam Quiz Bot — ${now.toUTCString()}*\n`;
  return { md, timestamp };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOOP — PROMPTS FOR MULTIPLE ACCOUNTS
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  log('Ready4Exam Quiz Bot (Multi-Account Mode)', '🤖');
  log(`Subjects : ${CFG.subjects.join(', ')}`);
  log(`Headless : ${CFG.headless}\n`);

  const browser = await chromium.launch({
    headless: CFG.headless,
    slowMo  : CFG.slowMo,
    args    : ['--disable-blink-features=AutomationControlled'],
  });

  let accountNum = 0;

  while (true) {
    accountNum++;
    log(`\n${'='.repeat(70)}`);
    log(`ACCOUNT ${accountNum}`);
    log(`${'='.repeat(70)}\n`);

    const username = await promptUser(`[Account ${accountNum}] Username (or 'exit' to finish): `);
    if (username.toLowerCase() === 'exit') {
      log('Exiting account loop.', '👋');
      break;
    }

    const password = await promptUser(`[Account ${accountNum}] Password: `);

    const accountStart = Date.now();

    const context = await browser.newContext({
      viewport : { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
               + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(CFG.pageTimeout);

    page.on('dialog', async dialog => {
      log(`    [dialog] "${dialog.message().split('\n')[0]}" — accepted`);
      await dialog.accept();
    });

    let grade = '?';
    try {
      await login(page, username, password);

      for (const subject of CFG.subjects) {
        try {
          await runSubject(page, subject);
        } catch (err) {
          log(`Subject crash (${subject}): ${err.message}`, '❌');
          console.error(err.stack);
          allResults.push({
            subject, chapter: 'ALL', tableId: '', grade: '?',
            status: 'failed', totalQ: 0, durationMs: 0,
            quizLoadMs: 0, avgAnswerMs: 0,
            error: `Subject crash: ${err.message}`, screenshot: null,
          });
        }
      }

      // Infer grade from results
      const gradeFromResults = allResults.find(r => r.grade !== '?');
      if (gradeFromResults) grade = gradeFromResults.grade;

    } catch (err) {
      log(`Account error (${username}): ${err.message}`, '❌');
      console.error(err.stack);
    } finally {
      await context.close();
    }

    const failedChapters = allResults.filter(r => r.status === 'failed');
    const passedChapters = allResults.filter(r => r.status === 'success');

    log(`\nAccount ${accountNum} Summary:`);
    log(`  Username: ${username}`);
    log(`  Grade: ${grade}`);
    log(`  ✅ Passed: ${passedChapters.length}`);
    log(`  ❌ Failed: ${failedChapters.length}`);

    runMetadata.push({
      accountNum,
      username,
      password: '*'.repeat(password.length),
      grade,
      startTime: accountStart,
      endTime: Date.now(),
      totalChapters: allResults.length,
      failedCount: failedChapters.length,
    });
  }

  await browser.close();

  // ── Generate consolidated report ──────────────────────────────────────────
  log(`\n${'='.repeat(70)}`);
  log('GENERATING CONSOLIDATED REPORT', '📄');
  log(`${'='.repeat(70)}\n`);

  ensureDir(CFG.reportsDir);
  const { md, timestamp } = buildConsolidatedReport();
  const reportFile = path.join(CFG.reportsDir, `report_${timestamp}.md`);
  fs.writeFileSync(reportFile, md, 'utf8');

  log(`📄 Report saved: ${reportFile}`);
  log(`\nSummary:`);
  log(`  Total accounts: ${runMetadata.length}`);
  log(`  Total chapters: ${allResults.length}`);
  log(`  Passed: ${allResults.filter(r => r.status === 'success').length}`);
  log(`  Failed: ${allResults.filter(r => r.status === 'failed').length}`);

  log('\nDone.', '🤖');
}

main().catch(err => { console.error(err); process.exit(1); });
