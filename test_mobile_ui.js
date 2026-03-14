const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Test Desktop
  const contextDesktop = await browser.newContext(devices['Desktop Chrome']);
  const pageDesktop = await contextDesktop.newPage();
  await pageDesktop.goto('http://localhost:8080/index.html');
  await pageDesktop.screenshot({ path: '/home/jules/verification/desktop_view.png', fullPage: true });

  // Test Mobile
  const contextMobile = await browser.newContext(devices['iPhone 12']);
  const pageMobile = await contextMobile.newPage();
  await pageMobile.goto('http://localhost:8080/index.html');
  await pageMobile.screenshot({ path: '/home/jules/verification/mobile_view.png', fullPage: true });

  // Test Selection Engine Logic on Desktop
  await pageDesktop.route('**/*', route => {
    if (route.request().url().includes('quiz-engine.html')) {
        console.log("Navigated to: ", route.request().url());
        route.abort();
    } else {
        route.continue();
    }
  });

  await pageDesktop.click('#start-quiz-btn');
  await pageDesktop.waitForTimeout(1000);

  await browser.close();
})();
