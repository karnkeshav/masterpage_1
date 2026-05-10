const fs = require('fs');
const http = require('http');
const { runPerformanceTests } = require('./performance_test.js');
const { runOutageTest } = require('./outage_test.js');
const { runStressTest } = require('./stress_test.js');
const { runCurriculumAgent } = require('./curriculum_agent.js');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

function fetchText(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, body }));
    });
    req.on('error', () => resolve({ ok: false, body: '' }));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve({ ok: false, body: '' });
    });
  });
}

async function ensureServer() {
  const rootCheck = await fetchText(BASE_URL);
  if (rootCheck.ok) {
    const routeCheck = await fetchText(`${BASE_URL}/app/consoles/student.html`);
    if (routeCheck.ok && routeCheck.body.includes('start-new-quiz-btn')) {
      console.log(`[SERVER] Reusing existing static server at ${BASE_URL}`);
      return null;
    }

    throw new Error(
      `${BASE_URL} is already in use, but it is not serving app/ routes correctly. ` +
      'Stop the old testing_tool/server.js process and rerun this command.'
    );
  }

  console.log(`[SERVER] Starting local static server at ${BASE_URL}`);
  const server = require('./server.js');

  await new Promise((resolve) => {
    if (server.listening) resolve();
    else server.on('listening', resolve);
  });

  return server;
}

async function main() {
  console.log('--- STARTING INTEGRATED TEST SUITE ---');

  const reportPath = 'report.md';
  if (fs.existsSync(reportPath)) {
    fs.unlinkSync(reportPath);
  }

  const server = await ensureServer();

  try {
    // Phase 1: Site Audits
    await runPerformanceTests();
    await runOutageTest();
    await runStressTest();

    // Phase 2: Curriculum Simulation
    await runCurriculumAgent();

    console.log('--- ALL TASKS COMPLETE. CHECK report.md ---');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('[SERVER] Local static server stopped.');
    }
  }
}

main().catch((error) => {
  console.error('--- TEST SUITE FAILED ---');
  console.error(error);
  process.exitCode = 1;
});
