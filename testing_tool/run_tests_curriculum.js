const fs = require('fs');
const http = require('http');
const { runPerformanceTests } = require('./performance_test.js');
const { runOutageTest } = require('./outage_test.js');
const { runStressTest } = require('./stress_test.js');
const runCurriculumAgent = require('./curriculum_agent.js');

const BASE_URL = 'http://localhost:8080';

async function ensureServer() {
    return new Promise((resolve) => {
        const req = http.get(BASE_URL, (res) => {
            console.log(`[SERVER] 🛰️ Reusing existing server at ${BASE_URL}`);
            resolve(null);
        });
        req.on('error', () => {
            console.log(`[SERVER] 🛠️ No server detected. Booting bundled static server...`);
            const { server } = require('./server.js');
            server.listen(8080, () => {
                console.log(`[SERVER] 🚀 Live at http://localhost:8080`);
                resolve(server);
            });
        });
    });
}

async function main() {
    console.log("====================================================");
    console.log("--- SOVEREIGN INTEGRATED TEST SUITE: CLASS 10 ---");
    console.log("====================================================");

    const reportPath = 'report.md';
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

    let ownedServer = null;
    try {
        ownedServer = await ensureServer();

        console.log("\n[PHASE 1] Basic Site Resilience Audits...");
        await runPerformanceTests();
        await runOutageTest();
        await runStressTest();

        console.log("\n[PHASE 2] Initiating Class 10 Curriculum Agent...");
        if (typeof runCurriculumAgent === 'function') {
            await runCurriculumAgent();
        } else {
            throw new Error("Module Loading Error: runCurriculumAgent function not exported correctly.");
        }

    } catch (err) {
        console.error("\n[FATAL] 🛑 INTEGRATED SUITE ABORTED:", err.message);
        fs.appendFileSync(reportPath, `\n## Fatal Execution Error\n\`\`\`\n${err.stack}\n\`\`\`\n`);
    } finally {
        if (ownedServer) {
            ownedServer.close(() => console.log("\n[SERVER] 🏁 Shutdown complete."));
        }
    }
    console.log("\n--- PIPELINE EXECUTION COMPLETE. CHECK report.md ---");
}

main();
