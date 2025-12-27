const fs = require('fs');
const { runPerformanceTests } = require('./performance_test.js');
const { runOutageTest } = require('./outage_test.js');
const { runStressTest } = require('./stress_test.js');

async function main() {
  // Clear the report file before running tests
  if (fs.existsSync('testing_tool/report.md')) {
    fs.unlinkSync('testing_tool/report.md');
  }

  await runPerformanceTests();
  await runOutageTest();
  await runStressTest();
}

main();
