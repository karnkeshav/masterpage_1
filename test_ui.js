const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Navigate to localhost:8080/index.html
  await page.goto('http://localhost:8080/index.html');

  // Verify modal is initially hidden
  const overlay = page.locator('#login-modal-overlay');
  let isHidden = await overlay.evaluate(el => el.classList.contains('hidden'));
  if(!isHidden) throw new Error("Modal should be hidden initially");

  // Click login
  await page.click('#login-modal');
  isHidden = await overlay.evaluate(el => el.classList.contains('hidden'));
  if(isHidden) throw new Error("Modal should be visible after click");

  // Click close modal
  await page.click('#close-login-modal');
  isHidden = await overlay.evaluate(el => el.classList.contains('hidden'));
  if(!isHidden) throw new Error("Modal should be hidden after close click");

  // Start Quiz widget
  // Wait for page navigation intercept
  await page.route('**/*', route => {
    if (route.request().url().includes('quiz-engine.html')) {
        console.log("Navigated to: ", route.request().url());
        route.abort(); // Prevent actual navigation
    } else {
        route.continue();
    }
  });

  // Since dropdowns have generic options: Select Board, Select Class, Select Subject, Standard
  await page.click('#start-quiz-btn');
  // The route console log will confirm if it worked.

  await browser.close();
})();
