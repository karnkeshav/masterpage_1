const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { chromium, request } = require(path.resolve(__dirname, '..', 'node_modules', 'playwright'));
const { JSDOM } = require(path.resolve(__dirname, '..', 'node_modules', 'jsdom'));

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'test-results', 'playwright-audit');
const SCREENSHOT_DIR = path.join(OUT_DIR, 'screenshots');
const BASE_URL = 'http://127.0.0.1:4173';
const MAX_CLICK_TARGETS_PER_PAGE = Number(process.env.MAX_CLICK_TARGETS_PER_PAGE || 80);
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 15000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json; charset=utf-8',
};

function rel(file) { return path.relative(REPO_ROOT, file).split(path.sep).join('/'); }
function routeFromFile(file) { return '/' + rel(file); }
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function ensureCleanOutput() { fs.rmSync(OUT_DIR, { recursive: true, force: true }); fs.mkdirSync(SCREENSHOT_DIR, { recursive: true }); }
function isIgnoredPath(filePath) {
  const r = rel(filePath);
  return r.startsWith('node_modules/') || r.startsWith('testing_tool/node_modules/') || r.startsWith('.git/') || r.startsWith('test-results/') || r.includes('/__pycache__/');
}
function walk(dir, predicate, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (isIgnoredPath(full)) continue;
    if (entry.isDirectory()) walk(full, predicate, found);
    else if (predicate(full)) found.push(full);
  }
  return found;
}
function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => { const key = keyFn(item); if (seen.has(key)) return false; seen.add(key); return true; });
}

function normalizeLocalReference(sourceFile, rawValue) {
  if (!rawValue) return null;
  const value = rawValue.trim();
  if (!value || value.startsWith('#') || value.startsWith('javascript:') || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('data:') || value.startsWith('blob:')) return null;
  let url;
  try { url = new URL(value, `${BASE_URL}${routeFromFile(sourceFile)}`); }
  catch (e) { return { rawValue: value, type: 'invalid-url', error: e.message }; }
  if (url.origin !== BASE_URL) return null;
  const cleanPath = path.normalize(decodeURIComponent(url.pathname).replace(/^\/+/, ''));
  if (cleanPath.startsWith('..')) return { rawValue: value, type: 'path-escape', resolvedPath: cleanPath };
  return { rawValue: value, type: 'local', target: path.join(REPO_ROOT, cleanPath || 'index.html'), resolvedPath: cleanPath || 'index.html', hash: url.hash, search: url.search };
}

function extractStaticReferences(html, sourceFile) {
  const refs = [];
  const document = new JSDOM(html).window.document;
  for (const element of document.querySelectorAll('[href], [src], [action]')) {
    for (const attr of ['href', 'src', 'action']) {
      if (!element.hasAttribute(attr)) continue;
      const normalized = normalizeLocalReference(sourceFile, element.getAttribute(attr));
      if (normalized) refs.push({ tag: element.tagName.toLowerCase(), attr, ...normalized });
    }
  }
  return refs;
}

function parseHtmlStatics(html, sourceFile) {
  const document = new JSDOM(html).window.document;
  const localAnchors = [...document.querySelectorAll('a[href]')].map(anchor => {
    const normalized = normalizeLocalReference(sourceFile, anchor.getAttribute('href'));
    return normalized ? { text: (anchor.textContent || anchor.getAttribute('aria-label') || '').trim().slice(0, 120), href: anchor.getAttribute('href'), resolvedPath: normalized.resolvedPath } : null;
  }).filter(Boolean);
  return {
    title: document.title || '',
    buttonCount: document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').length,
    formCount: document.querySelectorAll('form').length,
    clickTargetCount: document.querySelectorAll('a[href], button, [role="button"], input[type="submit"], input[type="button"]').length,
    localAnchors,
  };
}

function startServer() {
  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, BASE_URL);
    let pathname = decodeURIComponent(reqUrl.pathname);
    if (pathname === '/') pathname = '/index.html';
    const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(REPO_ROOT, safePath);
    if (!filePath.startsWith(REPO_ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(`Not found: ${pathname}`); return; }
      res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(4173, '127.0.0.1', () => resolve(server)));
}

function screenshotName(route, suffix) { return route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 120) + `_${suffix}.png`; }
async function pageHealthAudit(browser, route) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const consoleMessages = [], pageErrors = [], failedRequests = [], badResponses = [];
  page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) consoleMessages.push({ type: msg.type(), text: msg.text().slice(0, 1000) }); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), failure: req.failure()?.errorText || 'unknown' }));
  page.on('response', response => { if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() }); });
  let navigation = { ok: false, status: null, error: null };
  try {
    const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    navigation = { ok: !!response && response.ok(), status: response ? response.status() : null, error: null };
    await page.waitForLoadState('load', { timeout: NAV_TIMEOUT_MS }).catch(() => {});
    await wait(500);
  } catch (e) { navigation.error = e.message; }
  const title = await page.title().catch(() => '');
  const buttonCount = await page.locator('button, [role="button"], input[type="submit"], input[type="button"]').count().catch(() => 0);
  const formCount = await page.locator('form').count().catch(() => 0);
  const clickTargetCount = await page.locator('a[href], button, [role="button"], input[type="submit"], input[type="button"]').count().catch(() => 0);
  const screenshot = path.join(SCREENSHOT_DIR, screenshotName(route, 'page'));
  await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
  await page.close();
  return { route, title, navigation, consoleMessages, pageErrors, failedRequests, badResponses, buttonCount, formCount, clickTargetCount, localAnchors: [], screenshot: rel(screenshot), auditMode: 'playwright-browser' };
}

async function clickAudit(browser, route) {
  const findings = [];
  const probe = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await probe.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }).catch(() => null);
  const targets = await probe.locator('a[href], button, [role="button"], input[type="submit"], input[type="button"]').evaluateAll((els, max) => els.slice(0, max).map((el, index) => {
    const rect = el.getBoundingClientRect();
    return { index, tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().slice(0, 120), href: el.getAttribute('href'), type: el.getAttribute('type'), visible: !!(rect.width && rect.height) };
  }), MAX_CLICK_TARGETS_PER_PAGE).catch(() => []);
  await probe.close();
  for (const target of targets.filter(t => t.visible)) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [], failed = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('requestfailed', req => failed.push({ url: req.url(), failure: req.failure()?.errorText || 'unknown' }));
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      await page.locator('a[href], button, [role="button"], input[type="submit"], input[type="button"]').nth(target.index).click({ timeout: 3000 });
      await wait(300);
      findings.push({ route, target, result: 'clicked', finalUrl: page.url().replace(BASE_URL, ''), errors: errors.slice(0, 5), failed: failed.slice(0, 5) });
    } catch (e) { findings.push({ route, target, result: 'failed-to-click', error: e.message.slice(0, 1000), errors: errors.slice(0, 5), failed: failed.slice(0, 5) }); }
    await page.close().catch(() => {});
  }
  return findings;
}

function formatList(items, formatter, empty = '- None found.') { return items.length ? items.map(formatter).join('\n') : empty; }
function writeReports(summary) {
  fs.writeFileSync(path.join(OUT_DIR, 'audit-results.json'), JSON.stringify(summary, null, 2));
  const brokenStatic = summary.staticReferences.filter(ref => ref.issue);
  const pagesWithErrors = summary.pageAudits.filter(p => p.navigation.error || !p.navigation.ok || p.consoleMessages.length || p.pageErrors.length || p.failedRequests.length || p.badResponses.length);
  const failedClicks = summary.clickAudits.filter(c => c.result !== 'clicked' || c.errors.length || c.failed.length);
  let md = '# Playwright Exhaustive Codebase Audit\n\n';
  md += `Generated: ${summary.generatedAt}\n\nBase URL: \`${BASE_URL}\`\n\n`;
  if (summary.environmentNotes.length) md += `## Environment Notes\n\n${summary.environmentNotes.map(note => `- ${note}`).join('\n')}\n\n`;
  md += '## Executive Summary\n\n';
  md += `- HTML pages discovered: **${summary.htmlPages.length}**\n- Static local references checked: **${summary.staticReferences.length}**\n- Broken/invalid static local references: **${brokenStatic.length}**\n- Pages loaded with Playwright: **${summary.pageAudits.length}**\n- Pages with runtime warnings/errors/failed requests: **${pagesWithErrors.length}**\n- Visible click targets exercised: **${summary.clickAudits.length}**\n- Click targets with failures/errors: **${failedClicks.length}**\n\n`;
  md += '## Broken or Invalid Static Local References\n\n' + formatList(brokenStatic, ref => `- **${ref.issue}** in \`${ref.source}\`: \`${ref.rawValue}\` -> \`${ref.resolvedPath || ref.error || ''}\``) + '\n\n';
  md += '## Runtime Page Health Gaps\n\n' + formatList(pagesWithErrors, p => {
    const bits = [];
    if (p.navigation.error) bits.push(`navigation error: ${p.navigation.error}`); else if (!p.navigation.ok) bits.push(`HTTP status: ${p.navigation.status}`);
    if (p.pageErrors.length) bits.push(`page errors: ${p.pageErrors.slice(0, 3).join(' | ')}`);
    if (p.consoleMessages.length) bits.push(`console: ${p.consoleMessages.slice(0, 3).map(m => `${m.type}: ${m.text}`).join(' | ')}`);
    if (p.failedRequests.length) bits.push(`failed requests: ${p.failedRequests.slice(0, 3).map(r => `${r.url} (${r.failure})`).join(' | ')}`);
    if (p.badResponses.length) bits.push(`bad responses: ${p.badResponses.slice(0, 3).map(r => `${r.status} ${r.url}`).join(' | ')}`);
    return `- \`${p.route}\` — ${bits.join('; ')}${p.screenshot ? `. Screenshot: \`${p.screenshot}\`` : ''}`;
  }) + '\n\n';
  md += '## Workflow / Click-Target Gaps\n\n' + formatList(failedClicks, c => {
    const label = c.target.text || c.target.href || `${c.target.tag}${c.target.type ? `[type=${c.target.type}]` : ''}`;
    const details = [];
    if (c.error) details.push(c.error);
    if (c.errors.length) details.push(`errors: ${c.errors.slice(0, 2).join(' | ')}`);
    if (c.failed.length) details.push(`failed requests: ${c.failed.slice(0, 2).map(r => `${r.url} (${r.failure})`).join(' | ')}`);
    return `- From \`${c.route}\`, target \`${label}\` — ${c.result}; ${details.join('; ')}`;
  }) + '\n\n';
  md += '## Page Inventory\n\n' + summary.pageAudits.map(p => `- \`${p.route}\` — mode ${p.auditMode}, status ${p.navigation.status || 'n/a'}, title \`${p.title}\`, forms ${p.formCount}, buttons ${p.buttonCount}, click targets ${p.clickTargetCount}`).join('\n');
  md += '\n\n## Files Generated\n\n- `test-results/playwright-audit/report.md`\n- `test-results/playwright-audit/audit-results.json`\n- `test-results/playwright-audit/screenshots/`\n';
  fs.writeFileSync(path.join(OUT_DIR, 'report.md'), md);
}

async function main() {
  ensureCleanOutput();
  const htmlFiles = walk(REPO_ROOT, file => file.endsWith('.html'));
  const htmlPages = htmlFiles.map(file => ({ file: rel(file), route: routeFromFile(file) }));
  const staticReferences = [];
  for (const file of htmlFiles) {
    for (const ref of extractStaticReferences(fs.readFileSync(file, 'utf8'), file)) {
      if (ref.type !== 'local') { staticReferences.push({ source: rel(file), ...ref, issue: ref.type }); continue; }
      const exists = fs.existsSync(ref.target) || fs.existsSync(`${ref.target}.html`) || fs.existsSync(path.join(ref.target, 'index.html'));
      staticReferences.push({ source: rel(file), tag: ref.tag, attr: ref.attr, rawValue: ref.rawValue, resolvedPath: ref.resolvedPath, issue: exists ? null : 'missing-local-target' });
    }
  }
  const server = await startServer();
  let browser = null;
  const pageAudits = [], clickAudits = [], environmentNotes = [];
  try {
    const apiContext = await request.newContext({ baseURL: BASE_URL });
    for (const page of htmlPages) {
      const response = await apiContext.get(page.route, { timeout: NAV_TIMEOUT_MS });
      const statics = parseHtmlStatics(await response.text(), path.join(REPO_ROOT, page.file));
      pageAudits.push({ route: page.route, ...statics, navigation: { ok: response.ok(), status: response.status(), error: null }, consoleMessages: [], pageErrors: [], failedRequests: [], badResponses: response.status() >= 400 ? [{ url: `${BASE_URL}${page.route}`, status: response.status() }] : [], screenshot: null, auditMode: 'playwright-api-request' });
    }
    await apiContext.dispose();
    try {
      browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath(), args: ['--no-sandbox'] });
      pageAudits.length = 0;
      for (const page of htmlPages) pageAudits.push(await pageHealthAudit(browser, page.route));
      for (const page of htmlPages) clickAudits.push(...await clickAudit(browser, page.route));
    } catch (browserError) {
      environmentNotes.push(`Chromium browser launch failed, so this run used Playwright APIRequest plus static link/workflow analysis only: ${browserError.message}`);
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  const summary = { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, limits: { maxClickTargetsPerPage: MAX_CLICK_TARGETS_PER_PAGE, navigationTimeoutMs: NAV_TIMEOUT_MS }, htmlPages, staticReferences: uniqueBy(staticReferences, r => `${r.source}|${r.attr}|${r.rawValue}|${r.resolvedPath}|${r.issue}`), pageAudits, clickAudits, environmentNotes };
  writeReports(summary);
  console.log(`Audit complete. Broken refs: ${summary.staticReferences.filter(r => r.issue).length}; runtime page gaps: ${summary.pageAudits.filter(p => p.navigation.error || !p.navigation.ok || p.consoleMessages.length || p.pageErrors.length || p.failedRequests.length || p.badResponses.length).length}; click/workflow gaps: ${summary.clickAudits.filter(c => c.result !== 'clicked' || c.errors.length || c.failed.length).length}`);
  console.log(`Report: ${path.join(OUT_DIR, 'report.md')}`);
}

main().catch(error => { console.error(error); process.exit(1); });
