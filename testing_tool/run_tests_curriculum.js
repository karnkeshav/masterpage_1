const fs = require('fs');
const { server } = require('./server.js');
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
    console.log("--- STARTING INTEGRATED TEST SUITE ---");

    const reportPath = 'report.md';
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

    // Give the server a moment to bind before tests hit it.
    await new Promise(r => setTimeout(r, 500));

    try {
        // Phase 1: Site Audits
        console.log("\n[PHASE 1] Performance audit...");
        await runPerformanceTests();

        console.log("\n[PHASE 1] Outage test...");
        await runOutageTest();

        console.log("\n[PHASE 1] Stress test...");
        await runStressTest();

        // Phase 2: Curriculum Simulation
        console.log("\n[PHASE 2] Curriculum integrity agent...");
        await runCurriculumAgent();

    } catch (err) {
        console.error("\n[FATAL] Test suite aborted:", err.message);
        fs.appendFileSync(reportPath, `\n## Fatal Error\n\`\`\`\n${err.stack}\n\`\`\`\n`);
    } finally {
        // Only close the server if we actually own it (not reusing an external one).
        if (server.listening) {
            server.close(() => console.log("\n[SERVER] Shut down."));
        }
    }

    console.log("\n--- ALL TASKS COMPLETE. CHECK report.md ---");
}

main();
