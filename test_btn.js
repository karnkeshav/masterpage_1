const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    let urlList = [];
    page.route('**/*', route => {
        if (route.request().url().includes('quiz-engine.html')) {
            urlList.push(route.request().url());
            route.abort();
        } else {
            route.continue();
        }
    });

    await page.goto('http://localhost:8080/index.html');
    await page.waitForLoadState('networkidle');

    // Evaluate if the start quiz button actually has a listener.
    const result = await page.evaluate(() => {
        const btn = document.getElementById('start-quiz-btn');
        if (!btn) return 'NO BTN';
        btn.click();
        return 'CLICKED';
    });
    console.log(result);
    await page.waitForTimeout(500);
    console.log(page.url());
    console.log('URLs intercepted:', urlList);
    await browser.close();
})();
