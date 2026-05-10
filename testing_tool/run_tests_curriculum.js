const fs = require('fs');
const http = require('http');
const { runPerformanceTests } = require('./performance_test.js');
const { runOutageTest } = require('./outage_test.js');
const { runStressTest } = require('./stress_test.js');

// DIRECT IMPORT (Matches the direct export in curriculum_agent.js)
const runCurriculumAgent = require('./curriculum_agent.js');

const BASE_URL = 'http://localhost:8080';

async function ensureServer() {
    return new Promise((resolve) => {
        const req = http.get(BASE_URL, (res) => {
            console.log(`[SERVER] Reusing existing server at ${BASE_URL}`);
            resolve(null);
        });
        req.on('error', () => {
            console.log(`[SERVER] Starting bundled static server at ${BASE_URL}`);
            const { server } = require('./server.js');
            server.listen(8080, () => resolve(server));
        });
    });
}

async function main() {
    console.log("--- STARTING INTEGRATED TEST SUITE ---");
    const reportPath = 'report.md';
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

    let ownedServer = null;
    try {
        ownedServer = await ensureServer();

        console.log("\n[PHASE 1] Basic Resilience Audits...");
        await runPerformanceTests();
        await runOutageTest();
        await runStressTest();

        console.log("\n[PHASE 2] Starting Curriculum Agent (Class 10 Flow)...");
        
        // Double-check before calling to prevent crash
        if (typeof runCurriculumAgent === 'function') {
            await runCurriculumAgent();
        } else {
            throw new Error("Import failed: runCurriculumAgent is not a function. Check exports.");
        }

    } catch (err) {
        console.error("\n[FATAL] Test suite aborted:", err.message);
        fs.appendFileSync(reportPath, `\n## Fatal Error\n\`\`\`\n${err.stack}\n\`\`\`\n`);
    } finally {
        if (ownedServer) {
            ownedServer.close(() => console.log("[SERVER] Shut down."));
        }
    }
    console.log("\n--- ALL TASKS COMPLETE ---");
}

main();
