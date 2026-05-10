const fs = require('fs');
const { runPerformanceTests } = require('./performance_test.js');
const { runOutageTest } = require('./outage_test.js');
const { runStressTest } = require('./stress_test.js');
const { runCurriculumAgent } = require('./curriculum_agent.js'); // Import new agent

async function main() {
  console.log("--- STARTING SOVEREIGN TEST SUITE ---");
  
  const reportPath = 'report.md';
  if (fs.existsSync(reportPath)) {
    fs.unlinkSync(reportPath);
  }

  // Phase 1: Site Audits
  console.log("Phase 1: Running Performance Audits...");
  await runPerformanceTests();
  
  console.log("Phase 2: Running Outage Resilience Tests...");
  await runOutageTest();
  
  console.log("Phase 3: Running Infrastructure Stress Tests...");
  await runStressTest();

  // Phase 4: Automated Student Simulation
  console.log("Phase 4: Running Curriculum Integrity Agent...");
  await runCurriculumAgent();

  console.log("--- ALL TESTS COMPLETE. CHECK report.md ---");
}

main();
