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
            console.log(`[SERVER] 📡 Active listener detected at ${BASE_URL}.`);
            resolve(null);
        });
        req.on('error', () => {
            console.log(`[SERVER] 🛠️ No listener found. Deploying environment...`);
            const { server } = require('./server.js');
            server.listen(8080, () => resolve(server));
        });
    });
}

async function main() {
    console.log("====================================================");
    console.log("READY4EXAM: CLASS 10 INTEGRATED PIPELINE");
    console.log("====================================================");

    const reportPath = 'report.md';
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

    let ownedServer = null;
    try {
        ownedServer = await ensureServer();

        // WARM-UP: Ensure page paints before Lighthouse starts to avoid NO_FCP
        console.log("[WARM-UP] ☕ Pre-loading application to stabilize Lighthouse...");
        await new Promise(r => setTimeout(r, 2000));

        console.log("\n[1/2] RESILIENCE AUDITS");
        await runPerformanceTests();
        await runOutageTest();
        await runStressTest();

        console.log("\n[2/2] CURRICULUM INTEGRITY SCAN...");
        await runCurriculumAgent();

    } catch (err) {
        console.error("\n[CRITICAL] Pipeline Failed:", err.message);
    } finally {
        if (ownedServer) {
            ownedServer.close(() => console.log("\n[SERVER] 🏁 Decommissioned."));
        }
    }
}

main();
