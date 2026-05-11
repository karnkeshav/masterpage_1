#!/usr/bin/env node
/**
 * Ready4Exam Quiz Bot — testing_tool/bot.js
 * Usage:
 *   node bot.js               (headed)
 *   HEADLESS=true node bot.js (background)
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
  slowMo       : 100,
  timeout      : 90_000,
  screenshotDir: path.join(__dirname, 'bot_screenshots'),
  reportPath   : path.join(__dirname, 'quiz_bot_report.md'),
};

const answerCache = new Map();
const latency     = [];
const results     = [];
const botStart    = Date.now();

const iso = () => new Date().toISOString().replace('T',' ').split('.')[0];
function log(msg, icon='  '){ console.log(`[${iso()}] ${icon} ${msg}`); }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function ensureDir(d){ if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); }

const marks = {};
function mark(id){ marks[id] = Date.now(); }
function measure(label, id){
  const ms = Date.now() - (marks[id] ?? Date.now());
  latency.push({ label, ms, timestamp: iso() });
  log(`⏱  ${label}: ${ms} ms`);
  return ms;
}

// ── Network intercept: harvest correct answers from Supabase ─────────────────
async function setupInterception(page) {
  await page.route('**supabase.co/rest/**', async route => {
    mark('sb');
    let response;
    try { response = await route.fetch(); }
    catch(e){ log(`Supabase fetch failed: ${e.message}`, '❌'); route.abort(); return; }
    const table = new URL(route.request().url()).pathname.split('/').pop();
    measure(`Supabase <- ${table}`, 'sb');
    try {
      const body = await response.json();
      if (Array.isArray(body)) {
        if (body.length === 0) {
          log(`  ⚠  ${table}: 0 rows (table empty or wrong difficulty)`, '⚠️');
        } else {
          let n = 0;
          body.forEach(q => {
            const id  = String(q.id ?? '');
            const ans = (q.correct_answer_key ?? '').trim().toUpperCase();
            if (id && ans){ answerCache.set(id, ans); n++; }
          });
          log(`  📥 Cached ${n} answers from ${table}`);
        }
      }
    } catch(_){ /* non-JSON — pass through */ }
    route.fulfill({ response });
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(page) {
  log('Opening homepage…', '🔗');
  mark('homepage');
  await page.goto(CFG.baseUrl + '/index.html', { waitUntil: 'networkidle', timeout: CFG.timeout });
  measure('Homepage load', 'homepage');

  await page.evaluate(() => {
    ['username','password'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  });
  await sleep(300);
  await page.fill('#username', CFG.username);
  await page.fill('#password', CFG.password);

  log('Submitting login…', '🔐');
  mark('login');
  await page.click('#sovereign-login-form button');
  await page.waitForURL('**/consoles/student.html**', { timeout: CFG.timeout });
  measure('Login -> student console', 'login');
  await page.waitForSelector('#app:not(.hidden)', { timeout: CFG.timeout });
  log('Student console ready.');
}

// ── Click "New Quiz" button ───────────────────────────────────────────────────
async function clickNewQuiz(page) {
  log('Clicking "New Quiz"…', '🔗');
  await page.waitForFunction(() => {
    const btn = document.getElementById('start-new-quiz-btn');
    return btn && btn.href && !btn.href.endsWith('#');
  }, { timeout: CFG.timeout });
  mark('curriculum');
  await page.click('#start-new-quiz-btn');
  await page.waitForURL('**/curriculum.html**', { timeout: CFG.timeout });
  measure('New Quiz -> curriculum.html', 'curriculum');
  await page.waitForFunction(() => {
    const g = document.getElementById('subject-grid');
    return g && g.querySelectorAll('div[onclick]').length > 0;
  }, { timeout: CFG.timeout });
  log('curriculum.html ready.');
}

// ── Click subject card on curriculum.html ─────────────────────────────────────
async function clickSubject(page, subject) {
  log(`Clicking subject: "${subject}"`, '📚');
  mark('chapsel');
  const clicked = await page.evaluate(target => {
    const cards = document.querySelectorAll('#subject-grid div[onclick]');
    for(const c of cards){
      if(c.textContent.trim().includes(target)){ c.click(); return true; }
    }
    return false;
  }, subject);
  if(!clicked) throw new Error(`Subject card not found: "${subject}"`);
  await page.waitForURL('**/chapter-selection.html**', { timeout: CFG.timeout });
  measure(`curriculum -> chapter-selection (${subject})`, 'chapsel');
  await page.waitForFunction(() => {
    const area = document.getElementById('content-area');
    return area && (
      area.querySelectorAll('div[onclick^="startQuiz"]').length > 0 ||
      area.textContent.includes('No content') ||
      area.textContent.includes('Failed')
    );
  }, { timeout: CFG.timeout });
  log('chapter-selection.html ready.');
}

// ── Scrape chapter list ────────────────────────────────────────────────────────
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

// ── Run one chapter ────────────────────────────────────────────────────────────
async function runChapter(page, chapter, subject, num, total) {
  const entry = {
    subject, chapter: chapter.title, tableId: chapter.tableId, grade: chapter.grade,
    status: 'pending', score: null, totalQ: 0,
    durationMs: 0, quizLoadMs: 0, avgAnswerMs: 0, error: null, screenshot: null,
  };
  const chStart = Date.now();
  log(`\n  [${num}/${total}] "${chapter.title}"`);

  try {
    // 1. Click chapter card by index
    mark('ch_click');
    const clicked = await page.evaluate(idx => {
      const card = document.querySelectorAll('#content-area div[onclick^="startQuiz"]')[idx];
      if(card){ card.click(); return true; }
      return false;
    }, chapter.index);
    if(!clicked) throw new Error(`Chapter card not found at index ${chapter.index}`);

    // 2. Wait for difficulty modal
    await page.waitForSelector('#symmetric-difficulty-modal', { timeout: 15_000 });
    measure(`Chapter click -> modal (${chapter.title})`, 'ch_click');
    log('    Difficulty modal appeared');

    // 3. Click Simple
    mark('simple_click');
    const simpleClicked = await page.evaluate(() => {
      const modal = document.getElementById('symmetric-difficulty-modal');
      if(!modal) return false;
      for(const btn of modal.querySelectorAll('button')){
        if(btn.textContent.trim() === 'Simple'){ btn.click(); return true; }
      }
      if(typeof window.launchQuiz === 'function'){ window.launchQuiz('Simple'); return true; }
      return false;
    });
    if(!simpleClicked) throw new Error('Simple button not found in modal');

    // 4. Wait for quiz-engine URL
    await page.waitForURL('**/quiz-engine.html**', { timeout: CFG.timeout });

    // ── KEY FIX ──────────────────────────────────────────────────────────────
    // "Preparing worksheet..." in #status-message is NORMAL loading — NOT an error.
    // We wait until #quiz-content becomes visible, which only happens after
    // Supabase responds and questions are rendered.
    // ─────────────────────────────────────────────────────────────────────────
    await page.waitForFunction(() => {
      const qc = document.getElementById('quiz-content');
      return qc && !qc.classList.contains('hidden');
    }, { timeout: CFG.timeout });

    // Then wait until at least one radio button exists in the question list
    await page.waitForFunction(() => {
      const ql = document.getElementById('question-list');
      return ql && ql.querySelector('input[type="radio"]') !== null;
    }, { timeout: CFG.timeout });

    entry.quizLoadMs = measure(`Simple -> quiz ready (${chapter.title})`, 'simple_click');
    log(`    Quiz ready in ${entry.quizLoadMs} ms`);

    // 5. Answer all questions
    const qResult = await answerAllQuestions(page, chapter.title);
    entry.score       = qResult.score;
    entry.totalQ      = qResult.total;
    entry.avgAnswerMs = qResult.avgMs;
    entry.status      = 'success';
    const pct = entry.totalQ ? Math.round(entry.score / entry.totalQ * 100) : 0;
    log(`    ✅ ${entry.score}/${entry.totalQ} (${pct}%)  avg/q: ${entry.avgAnswerMs} ms`);

  } catch(err) {
    entry.status = 'failed';
    entry.error  = err.message;
    log(`    FAILED: ${err.message}`, '❌');
    try {
      ensureDir(CFG.screenshotDir);
      const p = path.join(CFG.screenshotDir, `FAIL_${chapter.tableId}.png`);
      await page.screenshot({ path: p, fullPage: true });
      entry.screenshot = `bot_screenshots/FAIL_${chapter.tableId}.png`;
      log(`    Screenshot -> ${entry.screenshot}`);
    } catch(_){}
  }

  entry.durationMs = Date.now() - chStart;
  return entry;
}

// ── Answer every question then submit ─────────────────────────────────────────
async function answerAllQuestions(page, chapterTitle) {
  let score = 0;
  let total = 0;
  const qMs = [];
  const MAX_Q = 100;
  let safety = 0;

  while(safety < MAX_Q) {
    safety++;

    // Wait for question to be ready
    await page.waitForFunction(() => {
      const ql = document.getElementById('question-list');
      return ql && ql.querySelector('input[type="radio"]') !== null;
    }, { timeout: CFG.timeout });

    const qStart = Date.now();

    // Read counter "N/Total"
    const counter = await page.$eval('#question-counter', el => el.textContent.trim())
      .catch(() => `${safety}/1`);
    const [curStr, totStr] = counter.split('/');
    const current = parseInt(curStr) || safety;
    total         = parseInt(totStr) || 1;

    log(`    Q${current}/${total}…`);

    // Get question id from first radio
    const qId = await page.evaluate(() => {
      const r = document.querySelector('#question-list input[type="radio"]');
      return r ? r.dataset.id : null;
    });

    const correctAns = qId ? answerCache.get(String(qId)) : null;

    if(correctAns) {
      const picked = await page.evaluate((id, ans) => {
        const radio = document.querySelector(
          `#question-list input[type="radio"][data-id="${id}"][value="${ans}"]`
        );
        if(!radio) return false;
        const label = radio.closest('label');
        if(label) label.click(); else radio.click();
        return true;
      }, qId, correctAns);
      if(picked) score++;
      else {
        log(`    Q${current}: correct radio not in DOM, picking first`, '⚠️');
        await page.evaluate(() => {
          const r = document.querySelector('#question-list input[type="radio"]');
          const l = r && r.closest('label');
          if(l) l.click(); else if(r) r.click();
        });
      }
    } else {
      log(`    Q${current}: no cached answer, picking first`, '⚠️');
      await page.evaluate(() => {
        const r = document.querySelector('#question-list input[type="radio"]');
        const l = r && r.closest('label');
        if(l) l.click(); else if(r) r.click();
      });
    }

    qMs.push(Date.now() - qStart);
    await sleep(200);

    // Check submit vs next
    const submitVisible = await page.evaluate(() => {
      const b = document.getElementById('submit-btn');
      return b && !b.classList.contains('hidden');
    });

    if(submitVisible) {
      log(`    Submitting (${chapterTitle})…`);
      mark('submit');
      await page.click('#submit-btn');
      await page.waitForSelector('#results-screen:not(.hidden)', { timeout: CFG.timeout });
      measure(`Submit -> results (${chapterTitle})`, 'submit');
      const scoreText = await page.$eval('#score-display', el => el.innerText).catch(()=>'');
      const m = scoreText.match(/(\d+)\s*[\/\\]\s*(\d+)/);
      const avgMs = qMs.length ? Math.round(qMs.reduce((a,b)=>a+b,0)/qMs.length) : 0;
      return { score: m ? parseInt(m[1]) : score, total: m ? parseInt(m[2]) : total, avgMs };
    }

    // Click Next to advance
    const nextVisible = await page.evaluate(() => {
      const b = document.getElementById('next-btn');
      return b && !b.classList.contains('hidden');
    });
    if(nextVisible) {
      await page.click('#next-btn');
      await sleep(200);
    } else {
      // Neither Next nor Submit visible — wait a moment then retry
      await sleep(500);
    }
  }

  throw new Error(`Safety cap: no Submit after ${MAX_Q} questions`);
}

// ── Navigate back to chapter-selection ────────────────────────────────────────
async function goBack(page, subject, grade) {
  log('    -> back to chapter-selection');
  mark('back');
  const url = `${CFG.baseUrl}/app/chapter-selection.html`
            + `?subject=${encodeURIComponent(subject)}&grade=${grade}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: CFG.timeout });
  await page.waitForFunction(() => {
    const area = document.getElementById('content-area');
    return area && area.querySelectorAll('div[onclick^="startQuiz"]').length > 0;
  }, { timeout: CFG.timeout });
  measure('Back -> chapter-selection', 'back');
}

// ── Run one subject ────────────────────────────────────────────────────────────
async function runSubject(page, subject) {
  log(`\n${'='.repeat(60)}`);
  log(`  SUBJECT: ${subject.toUpperCase()}`);
  log(`${'='.repeat(60)}`);
  mark(`subj_${subject}`);

  await clickNewQuiz(page);
  await clickSubject(page, subject);
  const chapters = await scrapeChapters(page);

  if(chapters.length === 0) {
    log('  No chapters found — skipping', '⏭️');
    results.push({ subject, chapter:'(none)', tableId:'', grade:'?',
      status:'skipped', score:null, totalQ:0, durationMs:0,
      quizLoadMs:0, avgAnswerMs:0, error:'No chapters found', screenshot:null });
    return;
  }

  const grade = chapters[0].grade;

  for(let i = 0; i < chapters.length; i++) {
    const result = await runChapter(page, chapters[i], subject, i+1, chapters.length);
    results.push(result);
    if(i < chapters.length - 1) {
      await goBack(page, subject, grade);
      const fresh = await scrapeChapters(page);
      for(let j = i+1; j < chapters.length; j++) {
        const match = fresh.find(c => c.tableId === chapters[j].tableId);
        if(match) chapters[j].index = match.index;
      }
    }
  }

  measure(`Entire subject: ${subject}`, `subj_${subject}`);
}

// ── Markdown report ────────────────────────────────────────────────────────────
function buildReport() {
  const now     = new Date();
  const totalMs = Date.now() - botStart;
  const ok      = results.filter(r => r.status==='success').length;
  const bad     = results.filter(r => r.status==='failed').length;
  const skip    = results.filter(r => r.status==='skipped').length;
  const scored  = results.filter(r => r.score!==null && r.totalQ>0);
  const avgPct  = scored.length
    ? (scored.reduce((s,r) => s+(r.score/r.totalQ*100), 0)/scored.length).toFixed(1)
    : 'N/A';

  let md = `# Ready4Exam Quiz Bot — Audit Report\n\n`;
  md += `> **Generated:** ${now.toUTCString()}  \n`;
  md += `> **Account:** \`${CFG.username}\` | **Difficulty:** Simple\n\n---\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total chapters | **${results.length}** |\n`;
  md += `| Passed | **${ok}** |\n`;
  md += `| Failed | **${bad}** |\n`;
  md += `| Skipped | **${skip}** |\n`;
  md += `| Avg score | **${avgPct}%** |\n`;
  md += `| Runtime | **${(totalMs/60000).toFixed(1)} min** |\n\n`;

  md += `## Latency Log\n\n`;
  md += `> 🟢 <1s  🟡 1-3s  🔴 >3s\n\n`;
  md += `| Timestamp | Event | ms |\n|-----------|-------|----|\n`;
  latency.forEach(({timestamp,label,ms}) => {
    const d = ms<1000?'🟢':ms<3000?'🟡':'🔴';
    md += `| ${timestamp} | ${label} | ${d} ${ms} |\n`;
  });
  md += '\n';

  for(const subject of CFG.subjects) {
    const rows = results.filter(r => r.subject===subject);
    if(!rows.length) continue;
    md += `## ${subject}\n\n`;
    md += `| # | Chapter | Table ID | Status | Score | Load ms | Duration s |\n`;
    md += `|---|---------|----------|--------|-------|---------|------------|\n`;
    rows.forEach((r,i) => {
      const icon = {success:'✅',failed:'❌',skipped:'⏭️'}[r.status]??'?';
      const score = r.score!==null && r.totalQ>0
        ? `${r.score}/${r.totalQ} (${Math.round(r.score/r.totalQ*100)}%)`
        : '—';
      md += `| ${i+1} | ${r.chapter} | \`${r.tableId}\` | ${icon} | ${score} | ${r.quizLoadMs||'—'} | ${(r.durationMs/1000).toFixed(1)} |\n`;
    });
    md += '\n';
  }

  const failedRows = results.filter(r => r.status==='failed');
  if(failedRows.length) {
    md += `## Failed Quizzes — Root Cause\n\n`;
    md += `| Subject | Chapter | Table ID | Error | Fix |\n`;
    md += `|---------|---------|----------|-------|-----|\n`;
    failedRows.forEach(r => {
      let fix = 'Review screenshot';
      if(/0 rows|empty/i.test(r.error)) fix = 'Add Simple rows to table';
      else if(/does not exist/i.test(r.error)) fix = 'Create the Supabase table';
      else if(/timeout/i.test(r.error)) fix = 'Check Supabase / network';
      md += `| ${r.subject} | ${r.chapter} | \`${r.tableId}\` | ${r.error} | ${fix} |\n`;
    });
    md += '\n';
    if(failedRows[0].screenshot) {
      md += `Screenshots saved in \`bot_screenshots/\`\n\n`;
    }
  } else {
    md += `## All Chapters Passed\n\nEvery quiz loaded and completed successfully.\n\n`;
  }

  md += `\n---\n*Ready4Exam Quiz Bot — ${now.toUTCString()}*\n`;
  return md;
}

// ── Main ──────────────────────────────────────────────────────────────────────
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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(CFG.timeout);

  await setupInterception(page);

  try {
    await login(page);
    for(const subject of CFG.subjects) {
      try { await runSubject(page, subject); }
      catch(err) {
        log(`Subject crash (${subject}): ${err.message}`, '❌');
        results.push({ subject, chapter:'ALL', tableId:'', grade:'?',
          status:'failed', score:null, totalQ:0, durationMs:0,
          quizLoadMs:0, avgAnswerMs:0, error:`Crash: ${err.message}`, screenshot:null });
      }
    }
  } catch(err) {
    log(`Fatal: ${err.message}`, '❌');
    console.error(err.stack);
    ensureDir(CFG.screenshotDir);
    await page.screenshot({ path: path.join(CFG.screenshotDir,'FATAL.png'), fullPage:true }).catch(()=>{});
  } finally {
    fs.writeFileSync(CFG.reportPath, buildReport(), 'utf8');
    log(`Report -> ${CFG.reportPath}`, '📄');
    const ok  = results.filter(r=>r.status==='success').length;
    const bad = results.filter(r=>r.status==='failed').length;
    log(`Chapters: ${results.length} | ✅ ${ok} | ❌ ${bad}`);
    log(`Runtime: ${((Date.now()-botStart)/60000).toFixed(1)} min`);
    await browser.close();
    log('Done.', '🤖');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
