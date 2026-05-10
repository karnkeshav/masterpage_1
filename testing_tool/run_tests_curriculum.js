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
        // Something is serving on port 8080 — trust it and proceed.
        // If the server is misconfigured, the actual tests will surface
        // clearer errors than a generic content-probe failure here.
        console.log(`[SERVER] Reusing existing server at ${BASE_URL}`);
        return null;
    }

    console.log(`[SERVER] No server detected — starting bundled static server at ${BASE_URL}`);
    const { server } = require('./server.js');
    await new Promise((resolve, reject) => {
        if (server.listening) return resolve();
        server.once('listening', resolve);
        server.once('error', reject);
    });
    return server;
}

async function main() {
    console.log("--- STARTING INTEGRATED TEST SUITE ---");

    const reportPath = 'report.md';
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

    let ownedServer = null;
    try {
        ownedServer = await ensureServer();

        console.log("\n[PHASE 1] Performance audit...");
        await runPerformanceTests();

        console.log("\n[PHASE 1] Outage test...");
        await runOutageTest();

        console.log("\n[PHASE 1] Stress test...");
        await runStressTest();

        console.log("\n[PHASE 2] Curriculum integrity agent...");
        await runCurriculumAgent();

    } catch (err) {
        console.error("\n[FATAL] Test suite aborted:", err.message);
        fs.appendFileSync(reportPath, `\n## Fatal Error\n\`\`\`\n${err.stack}\n\`\`\`\n`);
    } finally {
        // Only close the server if we started it ourselves.
        if (ownedServer && ownedServer.listening) {
            ownedServer.close(() => console.log("\n[SERVER] Shut down."));
        }
    }

    console.log("\n--- ALL TASKS COMPLETE. CHECK report.md ---");
}

main();
