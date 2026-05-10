const fs = require('fs');
const { runPerformanceTests } = require('./performance_test.js');
const { runOutageTest } = require('./outage_test.js');
const { runStressTest } = require('./stress_test.js');
const { runCurriculumAgent } = require('./curriculum_agent.js');

async function main() {
  console.log("--- STARTING INTEGRATED TEST SUITE ---");
  
  const reportPath = 'report.md';
  if (fs.existsSync(reportPath)) {
    fs.unlinkSync(reportPath);
  }

  // Phase 1: Site Audits
  await runPerformanceTests();
  await runOutageTest();
  await runStressTest();

  // Phase 2: Curriculum Simulation
  await runCurriculumAgent();

  console.log("--- ALL TASKS COMPLETE. CHECK report.md ---");
}

// THIS LINE IS REQUIRED TO RUN THE CODE
main();
