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
            console.log(`[SERVER] 📡 Active listener detected at ${BASE_URL}. Reusing session.`);
            resolve(null);
        });
        req.on('error', () => {
            console.log(`[SERVER] 🛠️ No listener found. Deploying static environment...`);
            const { server } = require('./server.js');
            server.listen(8080, () => resolve(server));
        });
    });
}

async function main() {
    console.log("====================================================");
    console.log("READY4EXAM: CLASS 10 INTEGRITY PIPELINE");
    console.log("====================================================");

    const reportPath = 'report.md';
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);

    let ownedServer = null;
    try {
        ownedServer = await ensureServer();

        console.log("\n[1/2] RESILIENCE AUDITS");
        await runPerformanceTests();
        await runOutageTest();
        await runStressTest();

        console.log("\n[2/2] CURRICULUM INTEGRITY");
        if (typeof runCurriculumAgent === 'function') {
            await runCurriculumAgent();
        } else {
            throw new Error("Export Disconnect: curriculum_agent.js failed to export function.");
        }

    } catch (err) {
        console.error("\n[CRITICAL] Pipeline Failed:", err.message);
        fs.appendFileSync(reportPath, `\n## Fatal Pipeline Error\n\`\`\`\n${err.stack}\n\`\`\`\n`);
    } finally {
        if (ownedServer) {
            ownedServer.close(() => console.log("\n[SERVER] 🏁 Environment safely decommissioned."));
        }
    }
    console.log("\n--- PIPELINE EXECUTION FINISHED ---");
}

main();
