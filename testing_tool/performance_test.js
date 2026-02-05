const { chromium } = require('playwright');
const fs = require('fs');

async function runPerformanceTests() {
  const lighthouse = (await import('lighthouse')).default;

  // Launch Chromium using Playwright with remote debugging enabled
  const browser = await chromium.launch({
    args: ['--remote-debugging-port=9222', '--headless', '--no-sandbox']
  });

  const options = {
    logLevel: 'info',
    output: 'html',
    onlyCategories: ['performance'],
    port: 9222, // Connect to Playwright's browser instance
  };

  const url = 'http://localhost:8080';
  let report = '## Performance Test Results\n\n';

  try {
    // Mobile test
    const mobileOptions = {
      ...options,
      formFactor: 'mobile',
      screenEmulation: {
        mobile: true,
        width: 360,
        height: 640,
        deviceScaleFactor: 2,
        disabled: false,
      },
    };
    const mobileRunnerResult = await lighthouse(url, mobileOptions);
    const mobileReportHtml = mobileRunnerResult.report;
    fs.writeFileSync('lighthouse-mobile-report.html', mobileReportHtml);

    const mobileMetrics = mobileRunnerResult.lhr.audits;
    report += '### Mobile\n';
    report += `- **First Contentful Paint:** ${mobileMetrics['first-contentful-paint'].displayValue}\n`;
    report += `- **Speed Index:** ${mobileMetrics['speed-index'].displayValue}\n`;
    report += `- **Largest Contentful Paint:** ${mobileMetrics['largest-contentful-paint'].displayValue}\n`;
    report += `- **Time to Interactive:** ${mobileMetrics['interactive'].displayValue}\n`;
    report += `- **Cumulative Layout Shift:** ${mobileMetrics['cumulative-layout-shift'].displayValue}\n\n`;

    // Desktop test
    const desktopOptions = {
      ...options,
      formFactor: 'desktop',
      screenEmulation: {
        mobile: false,
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
        disabled: false,
      },
    };
    const desktopRunnerResult = await lighthouse(url, desktopOptions);
    const desktopReportHtml = desktopRunnerResult.report;
    fs.writeFileSync('lighthouse-desktop-report.html', desktopReportHtml);

    const desktopMetrics = desktopRunnerResult.lhr.audits;
    report += '### Desktop\n';
    report += `- **First Contentful Paint:** ${desktopMetrics['first-contentful-paint'].displayValue}\n`;
    report += `- **Speed Index:** ${desktopMetrics['speed-index'].displayValue}\n`;
    report += `- **Largest Contentful Paint:** ${desktopMetrics['largest-contentful-paint'].displayValue}\n`;
    report += `- **Time to Interactive:** ${desktopMetrics['interactive'].displayValue}\n`;
    report += `- **Cumulative Layout Shift:** ${desktopMetrics['cumulative-layout-shift'].displayValue}\n\n`;

    fs.appendFileSync('report.md', report);
  } finally {
    await browser.close();
  }
}

module.exports = { runPerformanceTests };
