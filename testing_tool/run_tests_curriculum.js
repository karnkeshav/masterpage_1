const fs = require('fs');
const { runPerformanceTests } = require('./performance_test.js');
const { runOutageTest } = require('./outage_test.js');
const { runStressTest } = require('./stress_test.js');
const { runCurriculumAgent } = require('./curriculum_agent.js');

async function main() {
  console.log("--- STARTING CURRICULUM INTEGRITY SUITE ---");
  
  const reportPath = 'report.md';
  if (fs.existsSync(reportPath)) {
    fs.unlinkSync(reportPath);
  }

  // Phase 1-3: Core Audits
  await runPerformanceTests();
  await runOutageTest();
  await runStressTest();

  // Phase 4: Automated Agent Simulation
  await runCurriculumAgent();

  console.log("--- ALL TASKS COMPLETE. CHECK report.md ---");
}

main();
