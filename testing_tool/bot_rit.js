#!/usr/bin/env node
/**
 * Ready4Exam Quiz Bot (Correct Answers) — testing_tool/bot_rit.js [FIXED]
 *
 * ENHANCED:
 *   - Multi-account mode: prompt for username + password repeatedly
 *   - Grade detection: automatically detects user's actual grade
 *   - Correct answers: harvests correct_answer_key from Supabase
 *   - Consolidated report: saves to testing_tool/reports/report_<timestamp>.md
 *
 * Usage:
 *   npm run bot_rit
 *   npm run bot_rit:headless
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
  screenshotDir   : path.join(__dirname, 'bot_screenshots_rit'),
  reportsDir      : path.join(__dirname, 'reports'),
};

const answerCache = new Map();
const allResults  = [];
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

async function setupInterception(page) {
  await page.route('**supabase.co/rest/**', async route => {
    mark('sb');
    let response;
    try { response = await route.fetch(); }
    catch (e) {
      log(`Supabase fetch failed: ${e.message}`, '❌');
      await route.abort();
      return;
    }

    const table = new URL(route.request().url()).pathname.split('/').pop();
    measure(`Supabase <- ${table}`, 'sb');

    try {
      const body = await response.json();
      if (Array.isArray(body) && body.length > 0) {
        let n = 0;
        body.forEach(q => {
          const id  = String(q.id ?? '');
          const ans = (q.correct_answer_key ?? '').trim().toUpperCase();
          if (id && ['A','B','C','D'].includes(ans)) {
            answerCache.set(id, ans);
            n++;
          }
        });
        if (n > 0) log(`  📥 Cached ${n} correct answers from ${table}`);
      }
    } catch (_) { /* non-JSON endpoint */ }

    await route.fulfill({ response });
  });
}

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

async function detectGradeAfterLogin(page) {
  log('Detecting user grade…', '🔍');
  try {
    await page.waitForFunction(() => {
      const btn = document.getElementById('start-new-quiz-btn');
      return btn && btn.href && !btn.href.endsWith('#');
    }, { timeout: CFG.pageTimeout });

    await page.click('#start-new-quiz-btn');
    await page.waitForURL('**/curriculum.html**', { timeout: CFG.pageTimeout });

    const url = page.url();
    const gradeMatch = url.match(/grade=(\d+)/);
    const detectedGrade = gradeMatch ? gradeMatch[1] : '?';
    
    log(`Detected grade: ${detectedGrade}`, '✓');
    return detectedGrade;
  } catch (err) {
    log(`Grade detection failed: ${err.message} — defaulting to '10'`, '⚠️');
    return '10';
  }
}

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

    const qId = await page.evaluate(() => {
      const r = document.querySelector('#question-list input[type="radio"]');
      return r ? r.dataset.id : null;
    });

    const correctAns = qId ? (answerCache.get(String(qId)) ?? null) : null;
    const choice     = correctAns ?? rnd();
    const source     = correctAns ? '✓ correct' : '? random (no cache)';

    log(`    Q${current}/${total}  →  ${choice}  [${source}]`);

    // FIX: Pass arguments as object to page.evaluate()
    const clicked = await page.evaluate(({ preferred, qid }) => {
      let radio = qid
        ? document.querySelector(`#question-list input[type="radio"][data-id="${qid}"][value="${preferred}"]`)
        : null;
      if (!radio) {
        const all = document.querySelectorAll('#question-list input[type="radio"]');
        radio = Array.from(all).find(r => r.value === preferred) || all[0];
      }
      if (!radio) return false;
      const label = radio.closest('label');
      if (label) label.click(); else radio.click();
      return true;
    }, { preferred: choice, qid: qId });

    if (!clicked) log(`    Q${current}: no radio found — skipping`, '⚠️');

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

async function runChapter(page, chapter, subject, num, total) {
  log(`\n  [${num}/${total}] "${chapter.title}" (${chapter.tableId})`);

  const entry = {
    subject, chapter: chapter.title, tableId: chapter.tableId, grade: chapter.grade,
    status: 'pending', totalQ: 0, durationMs: 0,
    quizLoadMs: 0, avgAnswerMs: 0, error: null, screenshot: null,
  };
  const t0 = Date.now();

  answerCache.clear();
  log('    Answer cache cleared for this chapter');

  try {
    mark('ch');
    const clicked = await page.evaluate((idx) => {
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

    log(`    Answer cache has ${answerCache.size} entries for this quiz`);

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
      entry.screenshot = `bot_screenshots_rit/FAIL_${chapter.tableId}.png`;
      log(`    📸 ${entry.screenshot}`);
    } catch (_) {}
  }

  entry.durationMs = Date.now() - t0;
  return entry;
}

async function runSubject(page, subject, userGrade) {
  log(`\n${'='.repeat(60)}`);
  log(`  SUBJECT: ${subject.toUpperCase()}`);
  log(`${'='.repeat(60)}`);
  mark(`subj_${subject}`);

  await goToChapterSelection(page, subject, userGrade);
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

function buildConsolidatedReport() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').split('-').slice(0, 4).join('-');
  
  const ok   = allResults.filter(r => r.status === 'success').length;
  const bad  = allResults.filter(r => r.status === 'failed').length;
  const skip = allResults.filter(r => r.status === 'skipped').length;

  let md = `# Ready4Exam Quiz Bot (Correct Answers) — Consolidated Report\n\n`;
  md += `> **Generated:** ${now.toUTCString()}  \n`;
  md += `> **Mode:** Correct answers from Supabase \`correct_answer_key\`  \n`;
  md += `> **Accounts tested:** ${runMetadata.length}\n`;
  md += `> **Total chapters:** ${allResults.length}\n`;
  md += `> **✅ Completed:** ${ok} | **❌ Failed:** ${bad} | **⏭️ Skipped:** ${skip}\n\n---\n\n`;

  const byGrade = {};
  runMetadata.forEach(meta => {
    const key = `Grade ${meta.grade} — ${meta.username}`;
    byGrade[key] = { meta, results: allResults.filter(r => r.grade === meta.grade || r.grade === '?') };
  });

  Object.entries(byGrade).forEach(([gradeKey, { meta, results: resPerGrade }]) => {
    if (!resPerGrade.length) return;
    md += `## ${gradeKey}\n\n`;
    const subjects = [...new Set(resPerGrade.map(r => r.subject))];
    
    subjects.forEach(subject => {
      const subRows = resPerGrade.filter(r => r.subject === subject);
      const subOk   = subRows.filter(r => r.status === 'success').length;
      const subBad  = subRows.filter(r => r.status === 'failed').length;
      
      md += `### ${subject}\n\n`;
      md += `> ✅ ${subOk} completed  |  ❌ ${subBad} failed\n\n`;
      md += `| Chapter | Status | Q | Duration |\n`;
      md += `|---------|--------|---|----------|\n`;
      
      subRows.forEach(r => {
        const icon = { success: '✅', failed: '❌', skipped: '⏭️' }[r.status] ?? '?';
        md += `| ${r.chapter} | ${icon} | ${r.totalQ || '—'} | ${(r.durationMs / 1000).toFixed(1)}s |\n`;
      });
      md += '\n';
    });
  });

  const failed = allResults.filter(r => r.status === 'failed');
  if (failed.length) {
    md += `## ❌ Failed Chapters Summary\n\n`;
    md += `> **Total failed:** ${failed.length}\n\n`;
    md += `| Grade | Subject | Chapter | Error |\n`;
    md += `|-------|---------|---------|-------|\n`;
    failed.forEach(r => {
      let shortError = r.error;
      if (r.error.length > 40) shortError = r.error.substring(0, 37) + '...';
      md += `| ${r.grade} | ${r.subject} | ${r.chapter} | ${shortError} |\n`;
    });
    md += '\n';
  } else {
    md += `## ✅ All Chapters Completed Successfully\n\n`;
  }

  md += `\n---\n*Ready4Exam Quiz Bot (Correct Answers) — ${now.toUTCString()}*\n`;
  return { md, timestamp };
}

async function main() {
  log('Ready4Exam Quiz Bot (Correct Answers — Multi-Account Mode)', '🤖');
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

    await setupInterception(page);

    page.on('dialog', async dialog => {
      log(`    [dialog] "${dialog.message().split('\n')[0]}" — accepted`);
      await dialog.accept();
    });

    let grade = '?';
    try {
      await login(page, username, password);

      const detectedGrade = await detectGradeAfterLogin(page);
      grade = detectedGrade;

      for (const subject of CFG.subjects) {
        try {
          await runSubject(page, subject, detectedGrade);
        } catch (err) {
          log(`Subject crash (${subject}): ${err.message}`, '❌');
          console.error(err.stack);
          allResults.push({
            subject, chapter: 'ALL', tableId: '', grade: detectedGrade,
            status: 'failed', totalQ: 0, durationMs: 0,
            quizLoadMs: 0, avgAnswerMs: 0,
            error: `Subject crash: ${err.message}`, screenshot: null,
          });
        }
      }

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
      accountNum, username, grade,
      startTime: accountStart, endTime: Date.now(),
    });
  }

  await browser.close();

  log(`\n${'='.repeat(70)}`);
  log('GENERATING CONSOLIDATED REPORT', '📄');
  log(`${'='.repeat(70)}\n`);

  ensureDir(CFG.reportsDir);
  const { md, timestamp } = buildConsolidatedReport();
  const reportFile = path.join(CFG.reportsDir, `report_${timestamp}.md`);
  
  try {
    fs.writeFileSync(reportFile, md, 'utf8');
    const absPath = path.resolve(reportFile);
    log(`📄 Report saved: ${reportFile}`, '✅');
    log(`   Absolute path: ${absPath}`, '  ');
    if (fs.existsSync(reportFile)) {
      const stats = fs.statSync(reportFile);
      log(`   Size: ${stats.size} bytes`, '  ');
    }
  } catch (err) {
    log(`❌ Failed to write report: ${err.message}`, '❌');
    log(`   Attempted path: ${path.resolve(reportFile)}`, '  ');
  }
  log(`\nSummary:`);
  log(`  Total accounts: ${runMetadata.length}`);
  log(`  Total chapters: ${allResults.length}`);
  log(`  Passed: ${allResults.filter(r => r.status === 'success').length}`);
  log(`  Failed: ${allResults.filter(r => r.status === 'failed').length}`);

  log('\nDone.', '🤖');
}

main().catch(err => { console.error(err); process.exit(1); });
