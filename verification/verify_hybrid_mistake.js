
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Mock Firestore Data
  // We need multiple attempts to test "Trend" and "Victory"
  const mockScores = [
      // 1. Math: Persistent Friction (Missed 'q1' in latest AND previous)
      // Latest Attempt
      {
          data: () => ({
              topic: '9_math_algebra_basics',
              score: 85,
              difficulty: 'simple',
              mistakes: [{ id: 'q1', question: 'Solve x+1=2' }], // Missed
              timestamp: { toDate: () => new Date('2023-02-22') }
          })
      },
      // Previous Attempt
      {
          data: () => ({
              topic: '9_math_algebra_basics',
              score: 90,
              difficulty: 'simple',
              mistakes: [{ id: 'q1', question: 'Solve x+1=2' }], // Missed previously too
              timestamp: { toDate: () => new Date('2023-02-20') }
          })
      },
      // 2. Science: Victory (Missed 'q2' in old, correct in new)
      // Latest (Correct)
      {
          data: () => ({
              topic: '9_science_motion',
              score: 95,
              difficulty: 'simple',
              mistakes: [],
              timestamp: { toDate: () => new Date('2023-02-25') }
          })
      },
      // Previous (Missed)
      {
          data: () => ({
              topic: '9_science_motion',
              score: 40,
              difficulty: 'advanced',
              mistakes: [{ id: 'ar_q2', question: 'Force formula' }], // AR type
              timestamp: { toDate: () => new Date('2023-02-10') }
          })
      }
  ];

  // Intercept module loading
  await page.route('**/*.js', async route => {
      const url = route.request().url();
      if (url.includes('firebase-firestore.js')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: `
              export const collection = (db, name) => ({ _name: name });
              export const query = (coll, ...args) => ({ _type: coll._name });
              export const where = () => {};
              export const orderBy = () => {};
              export const getDocs = async (q) => {
                 if (q._type === 'quiz_scores') {
                     return { empty: false, docs: window.mockScores };
                 }
                 return { empty: true, docs: [] };
              };
            `
          });
      } else if (url.includes('auth-paywall.js')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/javascript',
                body: `
                    export const initializeAuthListener = (cb) => cb({ uid: 'test-user', displayName: 'Test User' });
                    export const ensureUserInFirestore = async () => ({ classId: '9' });
                `
            });
      } else if (url.includes('api.js')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/javascript',
                body: `
                    export const getInitializedClients = async () => ({ db: {}, auth: {} });
                `
            });
      } else if (url.includes('guard.js')) {
            await route.fulfill({
                 status: 200,
                 contentType: 'application/javascript',
                 body: `export const bindConsoleLogout = () => {};`
            });
      } else if (url.includes('curriculum/loader.js')) {
             await route.fulfill({
                 status: 200,
                 contentType: 'application/javascript',
                 body: `
                    export const loadCurriculum = async () => ({
                        "Mathematics": { "Algebra": [{ chapter_title: "Algebra Basics" }] },
                        "Science": { "Physics": [{ chapter_title: "Motion" }] }
                    });
                 `
            });
      } else if (url.includes('utils.js')) {
             await route.fulfill({
                 status: 200,
                 contentType: 'application/javascript',
                 body: `export const cleanKatexMarkers = (t) => t;`
            });
      } else if (url.includes('ui-renderer.js')) {
            await route.fulfill({
                 status: 200,
                 contentType: 'application/javascript',
                 body: `
                    export const injectStyles = () => {};
                    export const showSkeleton = () => {};
                 `
            });
      } else {
          await route.continue();
      }
  });

  // Inject mock data
  await page.addInitScript(() => {
      window.mockScores = [
          {
              data: () => ({
                  topic: '9_math_algebra_basics', score: 85, difficulty: 'simple',
                  mistakes: [{ id: 'q1', question: 'Solve x+1=2' }],
                  timestamp: { toDate: () => new Date('2023-02-22') }
              })
          },
          {
              data: () => ({
                  topic: '9_math_algebra_basics', score: 90, difficulty: 'simple',
                  mistakes: [{ id: 'q1', question: 'Solve x+1=2' }],
                  timestamp: { toDate: () => new Date('2023-02-20') }
              })
          },
          {
              data: () => ({
                  topic: '9_science_motion', score: 95, difficulty: 'simple',
                  mistakes: [],
                  timestamp: { toDate: () => new Date('2023-02-25') }
              })
          },
          {
              data: () => ({
                  topic: '9_science_motion', score: 40, difficulty: 'advanced',
                  mistakes: [{ id: 'ar_q2', question: 'Force formula' }],
                  timestamp: { toDate: () => new Date('2023-02-10') }
              })
          }
      ];
  });


  const filePath = path.resolve(__dirname, '../app/mistake-book.html');
  await page.goto(`file://${filePath}`);

  // Wait for content
  await page.waitForSelector('#mistakes-container');
  await page.waitForTimeout(1000);

  // 1. Verify Tier 1: Success Shield & Behavioral Profile
  const content = await page.content();
  if (!content.includes('Diagnostic Status') || !content.includes('Proficiency Profile')) {
      console.error('Tier 1 elements missing (Shield/Profile).');
      process.exit(1);
  }

  // Verify Proficiency Pills
  if (!content.includes('MCQ') || !content.includes('AR') || !content.includes('Application')) {
      console.error('Proficiency Pills missing.');
      process.exit(1);
  }

  // 2. Verify Tier 2: Subject Navigator (Math)
  // Should see Friction button
  if (!content.includes('Friction (1)')) { // 1 Chapter with friction
      console.error('Math Friction count incorrect.');
      process.exit(1);
  }

  // 3. Verify Trend Logic (Dates)
  // Toggle Math Friction
  await page.evaluate(() => window.toggleList('Mathematics', 'friction'));
  await page.waitForTimeout(500);

  // Find "Algebra Basics"
  const mathChapter = page.locator('text=Algebra Basics');
  if (await mathChapter.count() === 0) {
      console.error('Math Chapter not found in Friction list.');
      process.exit(1);
  }

  // Inspect
  await mathChapter.first().hover();
  await page.waitForTimeout(500);
  const inspectorHtml = await page.locator('#inspector-panel').innerHTML();

  // Check for dates: Feb 22, Feb 20
  // Note: Date formatting might vary, but "Feb" should be there.
  if (!inspectorHtml.includes('Feb 22') || !inspectorHtml.includes('Feb 20')) {
      console.error('Inspector missing Trend Dates (Expected Feb 22, Feb 20).');
      console.log('Got:', inspectorHtml);
      process.exit(1);
  }

  // 4. Verify Victory Gallery (Science)
  await page.evaluate(() => window.toggleList('Science', 'victory'));
  await page.waitForTimeout(500);

  const sciChapter = page.locator('text=Motion');
  if (await sciChapter.count() === 0) {
      console.error('Science Chapter not found in Victory list.');
      process.exit(1);
  }

  await sciChapter.first().hover();
  await page.waitForTimeout(500);
  const inspectorHtmlSci = await page.locator('#inspector-panel').innerHTML();

  if (!inspectorHtmlSci.includes('Mastered')) {
      console.error('Inspector missing Victory Badge.');
      process.exit(1);
  }

  console.log('Two-Tier Diagnostic Console Verified.');
  await page.screenshot({ path: 'verification/diagnostic_console.png', fullPage: true });
  await browser.close();
})();
