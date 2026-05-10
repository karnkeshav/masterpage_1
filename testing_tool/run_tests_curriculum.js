const fs = require('fs');
const { server } = require('./server.js');
const { runPerformanceTests } = require('./performance_test.js');
const { runOutageTest } = require('./outage_test.js');
const { runStressTest } = require('./stress_test.js');
const { runCurriculumAgent } = require('./curriculum_agent.js');

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
        server.close(() => console.log("\n[SERVER] Shut down."));
    }

    console.log("\n--- ALL TASKS COMPLETE. CHECK report.md ---");
}

main();
