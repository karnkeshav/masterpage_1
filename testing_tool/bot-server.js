#!/usr/bin/env node
// testing_tool/bot-server.js
//
// WebSocket bot server — streams Playwright bot output to the browser UI.
// Start with: node bot-server.js
// Then open:  https://ready4exam.in/bots  (or http://localhost:4545)
//
// Env vars:
//   BOT_PORT=4545   (default)
//   HEADLESS=true   (can be overridden per-run by the UI)
'use strict';

const http       = require('http');
const WebSocket  = require('ws');
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const PORT     = parseInt(process.env.BOT_PORT || '4545');
const BASE_URL = 'https://karnkeshav.github.io/masterpage_1';
const PAGE_TO  = 60_000;
const QUIZ_TO  = 120_000;
const QLOAD_TO = 45_000;
const REPORTS  = path.join(__dirname, 'reports');
const SHOTS_RND = path.join(__dirname, 'bot_screenshots');
const SHOTS_RIT = path.join(__dirname, 'bot_screenshots_rit');

const OPTS = ['A', 'B', 'C', 'D'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso   = () => new Date().toISOString().replace('T', ' ').split('.')[0];
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function rnd() { return OPTS[Math.floor(Math.random() * 4)]; }

// ─── Shared bot functions ─────────────────────────────────────────────────────

async function waitForRadios(page) {
    await page.waitForSelector('#question-list input[type="radio"]', {
        state: 'attached', timeout: QUIZ_TO,
    });
}

async function login(page, username, password, log) {
    log('Opening homepage…', '🔗');
    await page.goto(BASE_URL + '/index.html', {
        waitUntil: 'domcontentloaded', timeout: PAGE_TO,
    });
    await page.evaluate(() => {
        ['username', 'password'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
    });
    await sleep(300);
    await page.fill('#username', username);
    await page.fill('#password', password);
    log(`Logging in as ${username}…`, '🔐');
    await page.click('#sovereign-login-form button');
    await page.waitForURL('**/consoles/student.html**', { timeout: PAGE_TO });
    await page.waitForSelector('#app:not(.hidden)', { timeout: PAGE_TO });
    log(`Student console ready for ${username}.`, '✓');
}

async function detectGrade(page, log) {
    log('Detecting grade…', '🔍');
    try {
        await page.goto(BASE_URL + '/app/consoles/student.html', {
            waitUntil: 'domcontentloaded', timeout: PAGE_TO,
        });
        await page.waitForFunction(() => {
            const btn = document.getElementById('start-new-quiz-btn');
            return btn && btn.href && !btn.href.endsWith('#');
        }, { timeout: PAGE_TO });

        const grade = await page.evaluate(() => {
            const m = document.getElementById('start-new-quiz-btn')?.href?.match(/grade=(\d+)/);
            return m ? m[1] : null;
        });

        if (grade) { log(`Grade detected: ${grade}`, '✓'); return grade; }

        await page.click('#start-new-quiz-btn');
        await page.waitForURL('**/curriculum.html**', { timeout: PAGE_TO });
        const m = page.url().match(/grade=(\d+)/);
        const g = m ? m[1] : '10';
        log(`Grade detected: ${g}`, '✓');
        return g;
    } catch (e) {
        log(`Grade detection failed (${e.message}) — defaulting to 10`, '⚠️');
        return '10';
    }
}

async function goToChapters(page, subject, grade) {
    const url = `${BASE_URL}/app/chapter-selection.html`
              + `?subject=${encodeURIComponent(subject)}&grade=${grade}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TO });
    await page.waitForFunction(() => {
        const a = document.getElementById('content-area');
        return a && a.querySelectorAll('div[onclick^="startQuiz"]').length > 0;
    }, { timeout: PAGE_TO });
}

async function scrapeChapters(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('#content-area div[onclick^="startQuiz"]'))
            .map((el, i) => {
                const m = el.getAttribute('onclick')
                    .match(/startQuiz\('([^']*)',\s*'([^']*)',\s*'([^']*)'\)/);
                return m ? { tableId: m[1], title: m[2], grade: m[3], index: i } : null;
            }).filter(Boolean)
    );
}

// ─── RANDOM BOT ───────────────────────────────────────────────────────────────

async function answerRandom(page, title, log) {
    const qMs = [];
    for (let i = 0; i < 200; i++) {
        await waitForRadios(page);
        const t0 = Date.now();
        const counter = await page.$eval('#question-counter', el => el.textContent.trim()).catch(() => '1/1');
        const [cur, tot] = counter.split('/');
        const choice = rnd();
        log(`    Q${cur}/${tot} → ${choice}`);
        await page.evaluate(c => {
            const rs = Array.from(document.querySelectorAll('#question-list input[type="radio"]'));
            const t  = rs.find(r => r.value === c) || rs[0];
            (t.closest('label') || t).click();
        }, choice);
        qMs.push(Date.now() - t0);
        await sleep(250);

        const canSub = await page.evaluate(() => {
            const b = document.getElementById('submit-btn');
            return b && !b.classList.contains('hidden');
        });
        if (canSub) {
            log(`    Submitting "${title}"…`);
            await page.click('#submit-btn');
            await page.waitForSelector('#results-screen:not(.hidden)', { timeout: PAGE_TO });
            await sleep(800);
            const avg = qMs.length ? Math.round(qMs.reduce((a, b) => a + b, 0) / qMs.length) : 0;
            return { total: parseInt(tot) || 1, avgMs: avg };
        }
        const canNext = await page.evaluate(() => {
            const b = document.getElementById('next-btn');
            return b && !b.classList.contains('hidden');
        });
        if (canNext) { await page.click('#next-btn'); await sleep(200); }
        else await sleep(400);
    }
    throw new Error('Safety cap: no Submit after 200 iterations');
}

async function runChapterRandom(page, chapter, subject, num, total, results, log) {
    log(`\n  [${num}/${total}] "${chapter.title}"`, '📋');
    const entry = {
        subject, chapter: chapter.title, tableId: chapter.tableId, grade: chapter.grade,
        status: 'pending', totalQ: 0, durationMs: 0, error: null,
    };
    const t0 = Date.now();
    try {
        const clicked = await page.evaluate(idx => {
            const c = document.querySelectorAll('#content-area div[onclick^="startQuiz"]')[idx];
            if (c) { c.click(); return true; } return false;
        }, chapter.index);
        if (!clicked) throw new Error('Chapter card not found at index ' + chapter.index);

        await page.waitForSelector('#symmetric-difficulty-modal', { timeout: 12_000 });
        await page.evaluate(() => {
            const modal = document.getElementById('symmetric-difficulty-modal');
            if (!modal) return;
            for (const btn of modal.querySelectorAll('button')) {
                if (btn.textContent.trim() === 'Simple') { btn.click(); return; }
            }
            if (typeof window.launchQuiz === 'function') window.launchQuiz('Simple');
        });

        await page.waitForURL('**/quiz-engine.html**', { timeout: PAGE_TO });
        log('    Waiting for questions…');
        await waitForRadios(page);

        const qr = await answerRandom(page, chapter.title, log);
        entry.totalQ = qr.total;
        entry.status = 'success';
        log(`    ✅ ${qr.total} questions done`, '✅');
    } catch (err) {
        entry.status = 'failed';
        entry.error  = err.message;
        log(`    ❌ FAILED: ${err.message}`, '❌');
        try {
            ensureDir(SHOTS_RND);
            await page.screenshot({ path: path.join(SHOTS_RND, `FAIL_${chapter.tableId}.png`), fullPage: true });
        } catch (_) {}
    }
    entry.durationMs = Date.now() - t0;
    results.push(entry);
}

async function runSubjectRandom(page, subject, grade, results, log) {
    log(`\n${'─'.repeat(55)}`, '');
    log(`  SUBJECT: ${subject.toUpperCase()}`, '📚');
    log(`${'─'.repeat(55)}`, '');
    await goToChapters(page, subject, grade);
    const list = await scrapeChapters(page);
    if (!list.length) {
        log('  No chapters — skipping', '⏭️');
        results.push({ subject, chapter: '(none)', status: 'skipped', error: 'No chapters found', durationMs: 0 });
        return;
    }
    const chaps = list.map(c => ({ tableId: c.tableId, title: c.title, grade: c.grade }));
    log(`  ${chaps.length} chapters found`);

    for (let i = 0; i < chaps.length; i++) {
        await goToChapters(page, subject, grade);
        const fresh  = await scrapeChapters(page);
        const target = fresh.find(c => c.tableId === chaps[i].tableId);
        if (!target) {
            log(`  ⚠️ "${chaps[i].title}" not found — skipping`, '⚠️');
            results.push({ subject, chapter: chaps[i].title, status: 'failed', error: 'Not found after re-scrape', durationMs: 0 });
            continue;
        }
        await runChapterRandom(page, target, subject, i + 1, chaps.length, results, log);
    }
    log(`  ✅ ${subject} complete`, '✅');
}

// ─── RIT BOT (95%+) ──────────────────────────────────────────────────────────

async function setupInterception(page, cache, log) {
    await page.route('**supabase.co/rest/**', async route => {
        let response;
        try { response = await route.fetch(); } catch { await route.abort(); return; }
        try {
            const body = await response.json();
            if (Array.isArray(body)) {
                let n = 0;
                body.forEach(q => {
                    const id  = String(q.id ?? '');
                    const ans = (q.correct_answer_key ?? '').trim().toUpperCase();
                    if (id && 'ABCD'.includes(ans)) { cache.set(id, ans); n++; }
                });
                if (n > 0) log(`  📥 Cached ${n} correct answers`, '📥');
            }
        } catch (_) {}
        await route.fulfill({ response });
    });
}

async function answerRit(page, title, shouldGet100, cache, log) {
    const qMs = [];
    for (let i = 0; i < 200; i++) {
        await waitForRadios(page);
        const t0 = Date.now();
        const counter = await page.$eval('#question-counter', el => el.textContent.trim()).catch(() => '1/1');
        const [cur, tot] = counter.split('/');

        const qId = await page.evaluate(() => {
            const r = document.querySelector('#question-list input[type="radio"]');
            return r ? r.dataset.id : null;
        });
        const correct = qId ? cache.get(String(qId)) : null;

        let choice, source;
        if (shouldGet100) {
            choice = correct || rnd();
            source = correct ? '100%' : 'rnd';
        } else {
            choice = (correct && Math.random() < 0.95) ? correct : rnd();
            source = (choice === correct) ? '95%' : 'wrong';
        }
        log(`    Q${cur}/${tot} → ${choice}  [${source}]`);

        await page.evaluate(({ c, qid }) => {
            const all = Array.from(document.querySelectorAll('#question-list input[type="radio"]'));
            const r   = (qid ? all.find(x => x.dataset.id === qid && x.value === c) : null)
                     || all.find(x => x.value === c) || all[0];
            if (r) (r.closest('label') || r).click();
        }, { c: choice, qid: qId });

        qMs.push(Date.now() - t0);
        await sleep(250);

        const canSub = await page.evaluate(() => {
            const b = document.getElementById('submit-btn');
            return b && !b.classList.contains('hidden');
        });
        if (canSub) {
            log(`    Submitting "${title}"…`);
            await page.click('#submit-btn');
            await page.waitForSelector('#results-screen:not(.hidden)', { timeout: PAGE_TO });
            await sleep(800);
            const avg = qMs.length ? Math.round(qMs.reduce((a, b) => a + b, 0) / qMs.length) : 0;
            return { total: parseInt(tot) || 1, avgMs: avg };
        }
        const canNext = await page.evaluate(() => {
            const b = document.getElementById('next-btn');
            return b && !b.classList.contains('hidden');
        });
        if (canNext) { await page.click('#next-btn'); await sleep(200); }
        else await sleep(400);
    }
    throw new Error('Safety cap: no Submit after 200 iterations');
}

async function runChapterRit(page, chapter, subject, num, total, shouldGet100, difficulty, cache, results, log) {
    const marker = shouldGet100 ? '⭐ 100%' : '~95%';
    log(`\n  [${num}/${total}] "${chapter.title}"  [${marker}] [${difficulty}]`, '📋');
    const entry = {
        subject, chapter: chapter.title, tableId: chapter.tableId, grade: chapter.grade,
        difficulty, status: 'pending', totalQ: 0, durationMs: 0, error: null,
    };
    const t0 = Date.now();
    cache.clear();

    try {
        const clicked = await page.evaluate(idx => {
            const c = document.querySelectorAll('#content-area div[onclick^="startQuiz"]')[idx];
            if (c) { c.click(); return true; } return false;
        }, chapter.index);
        if (!clicked) throw new Error('Chapter card not found at index ' + chapter.index);

        await page.waitForSelector('#symmetric-difficulty-modal', { timeout: 12_000 });
        const diffOk = await page.evaluate(d => {
            const modal = document.getElementById('symmetric-difficulty-modal');
            if (!modal) return false;
            for (const btn of modal.querySelectorAll('button')) {
                if (btn.textContent.trim() === d) { btn.click(); return true; }
            }
            if (typeof window.launchQuiz === 'function') { window.launchQuiz(d); return true; }
            return false;
        }, difficulty);
        if (!diffOk) throw new Error(`Could not click ${difficulty} button`);

        await page.waitForURL('**/quiz-engine.html**', { timeout: PAGE_TO });
        await waitForRadios(page);

        const qr = await answerRit(page, chapter.title, shouldGet100, cache, log);
        entry.totalQ = qr.total;
        entry.status = 'success';
        log(`    ✅ ${qr.total} questions done`, '✅');
    } catch (err) {
        entry.status = 'failed';
        entry.error  = err.message;
        log(`    ❌ FAILED: ${err.message}`, '❌');
        try {
            ensureDir(SHOTS_RIT);
            await page.screenshot({ path: path.join(SHOTS_RIT, `FAIL_${chapter.tableId}.png`), fullPage: true });
        } catch (_) {}
    }
    entry.durationMs = Date.now() - t0;
    results.push(entry);
}

async function runSubjectRit(page, subject, grade, difficulty, cache, results, log) {
    log(`\n${'─'.repeat(55)}`, '');
    log(`  SUBJECT: ${subject.toUpperCase()} [${difficulty}]`, '📚');
    log(`${'─'.repeat(55)}`, '');
    await goToChapters(page, subject, grade);
    const list = await scrapeChapters(page);
    if (!list.length) {
        log('  No chapters — skipping', '⏭️');
        results.push({ subject, chapter: '(none)', difficulty, status: 'skipped', error: 'No chapters found', durationMs: 0 });
        return;
    }
    const chaps     = list.map(c => ({ tableId: c.tableId, title: c.title, grade: c.grade }));
    const get100idx = Math.floor(Math.random() * chaps.length);
    log(`  ${chaps.length} chapters found — chapter ${get100idx + 1} will score 100%`);

    for (let i = 0; i < chaps.length; i++) {
        await goToChapters(page, subject, grade);
        const fresh  = await scrapeChapters(page);
        const target = fresh.find(c => c.tableId === chaps[i].tableId);
        if (!target) {
            log(`  ⚠️ "${chaps[i].title}" not found — skipping`, '⚠️');
            results.push({ subject, chapter: chaps[i].title, difficulty, status: 'failed', error: 'Not found after re-scrape', durationMs: 0 });
            continue;
        }
        await runChapterRit(page, target, subject, i + 1, chaps.length, i === get100idx, difficulty, cache, results, log);
    }
    log(`  ✅ ${subject} complete`, '✅');
}

// ─── Report builder ───────────────────────────────────────────────────────────

function buildReport(results, accounts, mode) {
    const now  = new Date();
    const ok   = results.filter(r => r.status === 'success').length;
    const bad  = results.filter(r => r.status === 'failed').length;
    const skip = results.filter(r => r.status === 'skipped').length;

    let md = `# Ready4Exam Bot — ${mode === 'rit' ? '95%+ Mode' : 'Random Mode'} Report\n\n`;
    md += `> **Generated:** ${now.toUTCString()}  \n`;
    md += `> **Accounts:** ${accounts.map(a => `${a.username} (Grade ${a.grade})`).join(', ')}\n`;
    md += `> **Total:** ${results.length} chapters | ✅ ${ok} | ❌ ${bad} | ⏭️ ${skip}\n\n---\n\n`;

    [...new Set(results.map(r => r.subject))].forEach(subject => {
        const rows = results.filter(r => r.subject === subject);
        const sOk  = rows.filter(r => r.status === 'success').length;
        const sBad = rows.filter(r => r.status === 'failed').length;
        md += `## ${subject}\n\n> ✅ ${sOk} | ❌ ${sBad}\n\n`;
        md += mode === 'rit'
            ? '| Chapter | Difficulty | Status | Q | Duration |\n|---------|------------|--------|---|----------|\n'
            : '| Chapter | Status | Q | Duration |\n|---------|--------|---|----------|\n';
        rows.forEach(r => {
            const icon = { success: '✅', failed: '❌', skipped: '⏭️' }[r.status] ?? '?';
            const dur  = ((r.durationMs || 0) / 1000).toFixed(1) + 's';
            md += mode === 'rit'
                ? `| ${r.chapter} | ${r.difficulty || '—'} | ${icon} | ${r.totalQ || '—'} | ${dur} |\n`
                : `| ${r.chapter} | ${icon} | ${r.totalQ || '—'} | ${dur} |\n`;
        });
        md += '\n';
    });

    const failed = results.filter(r => r.status === 'failed');
    if (failed.length) {
        md += `## ❌ Failed Chapters\n\n| Subject | Chapter | Error |\n|---------|---------|-------|\n`;
        failed.forEach(r => {
            const e = (r.error || '').length > 60 ? r.error.slice(0, 57) + '…' : (r.error || '?');
            md += `| ${r.subject} | ${r.chapter} | ${e} |\n`;
        });
        md += '\n';
    } else {
        md += `## ✅ All Chapters Completed Successfully\n\n`;
    }

    md += `\n---\n*Ready4Exam Bot Server — ${now.toUTCString()}*\n`;
    return md;
}

// ─── Main runner (called per WebSocket message) ───────────────────────────────

async function runBot(config, send) {
    const log = (msg, icon = '  ') => {
        const line = `[${iso()}] ${icon} ${msg}`;
        console.log(line);
        send({ type: 'log', msg, icon, line });
    };

    const { mode, accounts, subjects, difficulty = 'Simple', headless = true } = config;
    const results   = [];
    const accMeta   = [];

    process.on('unhandledRejection', reason => {
        log(`[unhandledRejection] ${reason}`, '⚠️');
    });

    const browser = await chromium.launch({
        headless,
        slowMo: 80,
        args: ['--disable-blink-features=AutomationControlled'],
    });

    for (const acc of accounts) {
        log(`\n${'═'.repeat(60)}`, '');
        log(`Account: ${acc.username}`, '👤');
        log(`${'═'.repeat(60)}`, '');

        const context = await browser.newContext({
            viewport:  { width: 1280, height: 900 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        });
        const page = await context.newPage();
        page.setDefaultTimeout(PAGE_TO);
        page.on('dialog', async d => {
            log(`[dialog] "${d.message().split('\n')[0]}" — accepted`);
            await d.accept();
        });

        let grade = '?';
        try {
            await login(page, acc.username, acc.password, log);
            grade = await detectGrade(page, log);
            accMeta.push({ username: acc.username, grade });

            if (mode === 'rit') {
                const cache = new Map();
                await setupInterception(page, cache, log);
                for (const subject of subjects) {
                    try {
                        await runSubjectRit(page, subject, grade, difficulty, cache, results, log);
                    } catch (err) {
                        log(`Subject crash (${subject}): ${err.message}`, '❌');
                        results.push({ subject, chapter: 'ALL', difficulty, status: 'failed', error: `Crash: ${err.message}`, durationMs: 0 });
                    }
                }
            } else {
                for (const subject of subjects) {
                    try {
                        await runSubjectRandom(page, subject, grade, results, log);
                    } catch (err) {
                        log(`Subject crash (${subject}): ${err.message}`, '❌');
                        results.push({ subject, chapter: 'ALL', status: 'failed', error: `Crash: ${err.message}`, durationMs: 0 });
                    }
                }
            }
        } catch (err) {
            log(`Account error (${acc.username}): ${err.message}`, '❌');
            console.error(err.stack);
        } finally {
            await context.close();
        }
    }

    await browser.close();

    const report = buildReport(results, accMeta, mode);
    ensureDir(REPORTS);
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const file = path.join(REPORTS, `report_${ts}.md`);
    fs.writeFileSync(file, report, 'utf8');
    log(`\n📄 Report saved → ${file}`, '📄');

    send({ type: 'done', report, results, filename: `report_${ts}.md` });
}

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end([
        '🤖 Ready4Exam Bot Server is running.',
        `   WebSocket: ws://localhost:${PORT}`,
        '   Open https://ready4exam.in/bots in your browser.',
    ].join('\n') + '\n');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    console.log(`[${iso()}] ✓ Browser connected`);
    let busy = false;

    // Send a ping message so the UI knows the server is alive
    ws.send(JSON.stringify({ type: 'ready' }));

    ws.on('message', async raw => {
        if (busy) {
            ws.send(JSON.stringify({ type: 'error', msg: 'A bot session is already running. Wait for it to complete.' }));
            return;
        }

        let config;
        try { config = JSON.parse(raw.toString()); }
        catch { ws.send(JSON.stringify({ type: 'error', msg: 'Invalid config JSON.' })); return; }

        if (config.type !== 'start') return;
        if (!config.accounts?.length) {
            ws.send(JSON.stringify({ type: 'error', msg: 'No accounts provided.' }));
            return;
        }

        busy = true;
        const send = data => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
        };

        try {
            await runBot(config, send);
        } catch (err) {
            console.error(err);
            send({ type: 'error', msg: err.message });
        } finally {
            busy = false;
        }
    });

    ws.on('close', () => console.log(`[${iso()}] Browser disconnected`));
    ws.on('error', err => console.warn(`[${iso()}] WS error: ${err.message}`));
});

server.listen(PORT, () => {
    console.log(`\n🤖  Ready4Exam Bot Server`);
    console.log(`    WebSocket → ws://localhost:${PORT}`);
    console.log(`    Open     → https://ready4exam.in/bots`);
    console.log(`    Headless → ${process.env.HEADLESS !== 'false'}`);
    console.log(`    (Set HEADLESS=false to see the browser)\n`);
});
