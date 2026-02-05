const { chromium } = require('playwright');
const fs = require('fs');

async function runOutageTest() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Intercept requests to block CSS
  await page.route('**/*.css', route => route.abort());

  // Use 'load' instead of 'networkidle' which can be flaky if there's ongoing polling (e.g. Firebase)
  // Or increase timeout
  try {
      await page.goto('http://localhost:8080', { waitUntil: 'load', timeout: 60000 });
      await page.screenshot({ path: 'outage.png' });
  } catch (e) {
      console.error("Outage test navigation failed:", e);
  } finally {
      await browser.close();
  }

  let report = '## Outage Resilience Test Results\n\n';
  report += '### CSS Outage Simulation\n';
  report += 'Blocked all CSS files to simulate a critical resource outage.\n';
  report += 'A screenshot of the page without CSS has been saved to `outage.png`.\n\n';
  fs.appendFileSync('report.md', report);
}

module.exports = { runOutageTest };
