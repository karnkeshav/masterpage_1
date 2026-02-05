const fs = require('fs');
const { runPerformanceTests } = require('./performance_test.js');
const { runOutageTest } = require('./outage_test.js');
const { runStressTest } = require('./stress_test.js');

async function main() {
  // Clear the report file before running tests
  const reportPath = 'report.md';
  if (fs.existsSync(reportPath)) {
    fs.unlinkSync(reportPath);
  }

  await runPerformanceTests();
  await runOutageTest();
  await runStressTest();
}

main();
