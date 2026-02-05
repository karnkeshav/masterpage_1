const { chromium } = require('playwright');
const fs = require('fs');

async function runStressTest() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('http://localhost:8080');

  // Verify selector existence first
  // Updated to target the login button since board-btn was removed
  const selector = 'button[type="submit"]';

  try {
      await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
  } catch (e) {
      console.error(`Selector "${selector}" not found! Is the page loaded?`);
      await browser.close();
      return;
  }

  const count = await page.locator(selector).count();
  if (count === 0) {
      console.error("No submit buttons found!");
      await browser.close();
      return;
  }

  const startTime = Date.now();
  const button = page.locator(selector).first();

  console.log("Starting rapid click test on login button...");
  for (let i = 0; i < 100; i++) {
    // Force click to bypass actionability checks for speed/stress testing
    await button.click({ force: true });
  }
  const endTime = Date.now();
  const timeTaken = (endTime - startTime) / 1000;

  await browser.close();

  let report = '## Stress Stability Test Results\n\n';
  report += `### Rapid Click Test\n`;
  report += `Simulated 100 rapid clicks on the login button.\n`;
  report += `**Time taken:** ${timeTaken} seconds.\n`;
  if (errors.length > 0) {
    report += `**Errors found:**\n`;
    report += '```\n';
    report += errors.join('\n');
    report += '\n```\n';
  } else {
    report += `**No console errors found.**\n`;
  }
  report += '\n';

  fs.appendFileSync('report.md', report);
}

module.exports = { runStressTest };
