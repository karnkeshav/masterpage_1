const puppeteer = require('puppeteer');
const fs = require('fs');

async function runOutageTest() {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setRequestInterception(true);

  page.on('request', (req) => {
    if (req.url().endsWith('.css')) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'testing_tool/outage.png' });
  await browser.close();

  let report = '## Outage Resilience Test Results\\n\\n';
  report += '### CSS Outage Simulation\\n';
  report += 'Blocked all CSS files to simulate a critical resource outage.\\n';
  report += 'A screenshot of the page without CSS has been saved to `outage.png`.\\n\\n';
  fs.appendFileSync('testing_tool/report.md', report);
}

module.exports = { runOutageTest };
