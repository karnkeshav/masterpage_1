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
            console.log(`[SERVER] 📡 Active server detected. Reusing session.`);
            resolve(null);
        });
        req.on('error', () => {
            console.log(`[SERVER] 🛠️ No server found. Booting local environment...`);
            const { server } = require('./server.js');
            server.listen(8080, () => resolve(server));
        });
    });
}

async function main() {
    console.log("====================================================");
    console.log("CLASS 10 CURRICULUM INTEGRITY PIPELINE");
    console.log("====================================================");

    const reportPath = 'report.md';
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

    let ownedServer = null;
    try {
        ownedServer = await ensureServer();

        console.log("\n[PHASE 1] RESILIENCE AUDITS...");
        await runPerformanceTests();
        await runOutageTest();
        await runStressTest();

        console.log("\n[PHASE 2] CLASS 10 AGENT SCAN...");
        if (typeof runCurriculumAgent === 'function') {
            await runCurriculumAgent();
        } else {
            throw new Error("Module Failure: runCurriculumAgent function not correctly imported.");
        }

    } catch (err) {
        console.error("\n[FATAL] Pipeline Aborted:", err.message);
        fs.appendFileSync(reportPath, `\n## Fatal Pipeline Error\n\`\`\`\n${err.stack}\n\`\`\`\n`);
    } finally {
        if (ownedServer) {
            ownedServer.close(() => console.log("\n[SERVER] 🏁 Shutdown complete."));
        }
    }
    console.log("\n--- PIPELINE EXECUTION COMPLETE ---");
}

main();
