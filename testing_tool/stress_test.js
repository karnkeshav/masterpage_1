const puppeteer = require('puppeteer');
const fs = require('fs');

async function runStressTest() {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('http://localhost:8080');

  const startTime = Date.now();
  for (let i = 0; i < 100; i++) {
    await page.click('.board-btn');
  }
  const endTime = Date.now();
  const timeTaken = (endTime - startTime) / 1000;

  await browser.close();

  let report = '## Stress Stability Test Results\\n\\n';
  report += `### Rapid Click Test\\n`;
  report += `Simulated 100 rapid clicks on a board button.\\n`;
  report += `**Time taken:** ${timeTaken} seconds.\\n`;
  if (errors.length > 0) {
    report += `**Errors found:**\\n`;
    report += '```\\n';
    report += errors.join('\\n');
    report += '\\n```\\n';
  } else {
    report += `**No console errors found.**\\n`;
  }
  report += '\\n';

  fs.appendFileSync('testing_tool/report.md', report);
}

module.exports = { runStressTest };
