
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
  const mockScores = [
      // 1. Math: Persistent Friction (Missed 'q1' in latest AND previous)
      {
          data: () => ({
              topic: '9_math_algebra_basics',
              score: 85,
              difficulty: 'simple',
              mistakes: [{ id: 'q1', question: 'Solve x+1=2' }],
              timestamp: { toDate: () => new Date('2023-01-02') }
          })
      },
      {
          data: () => ({
              topic: '9_math_algebra_basics',
              score: 90,
              difficulty: 'simple',
              mistakes: [{ id: 'q1', question: 'Solve x+1=2' }],
              timestamp: { toDate: () => new Date('2023-01-01') }
          })
      },
      // 2. Science: Victory (Missed 'q2' in old, correct in new)
      {
          data: () => ({
              topic: '9_science_motion',
              score: 95,
              difficulty: 'simple',
              mistakes: [], // Correct now!
              timestamp: { toDate: () => new Date('2023-01-04') }
          })
      },
      {
          data: () => ({
              topic: '9_science_motion',
              score: 40,
              difficulty: 'advanced',
              mistakes: [{ id: 'q2', question: 'Force formula' }],
              timestamp: { toDate: () => new Date('2023-01-03') }
          })
      }
  ];

  // Intercept module loading to provide mocks
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
                 // Only return mock scores
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
      } else if (url.includes('slug-engine.js')) {
             // We need to serve the real file or a mock. Since we created it, we can read it?
             // Or we can mock it if we want to isolate verification.
             // But we want to test integration.
             // Since we are running in browser context, we can just serve the content of the file we wrote.
             // But we can't easily 'read' local file in route handler without fs.
             // Playwright route handler runs in Node, so we CAN use fs.
             const content = fs.readFileSync(path.resolve(__dirname, '../js/slug-engine.js'), 'utf8');
             await route.fulfill({
                 status: 200,
                 contentType: 'application/javascript',
                 body: content
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

  // Inject mock data into window
  await page.addInitScript((scores) => {
      window.mockScores = scores.map(s => ({
          data: () => {
              const d = s.data();
              // Fix timestamp function
              d.timestamp = { toDate: () => new Date(d.timestamp.toDate()) };
              return d;
          }
      }));
      // Need to handle the 'toDate' logic which is lost in serialization.
      // Serialization only passes JSON.
      // So we pass raw data and reconstruct mocks in browser.
  }, mockScores.map(s => {
      const d = s.data();
      return { ...d, timestamp: { toDate: d.timestamp.toDate().toISOString() } }; // Pass ISO string
  }));

  // Fix init script logic
  await page.addInitScript(() => {
     // Reconstruct window.mockScores with proper functions
     const raw = window.mockScores || []; // Wait, the previous addInitScript passed data as arg, but didn't assign to window in the browser context unless we did it.
     // Playwright addInitScript(fn, arg) executes fn(arg) in browser.
  });

  // Correct way to inject:
  await page.addInitScript(() => {
      window.mockScores = [
          {
              data: () => ({
                  topic: '9_math_algebra_basics', score: 85, difficulty: 'simple',
                  mistakes: [{ id: 'q1', question: 'Solve x+1=2' }],
                  timestamp: { toDate: () => new Date('2023-01-02') }
              })
          },
          {
              data: () => ({
                  topic: '9_math_algebra_basics', score: 90, difficulty: 'simple',
                  mistakes: [{ id: 'q1', question: 'Solve x+1=2' }],
                  timestamp: { toDate: () => new Date('2023-01-01') }
              })
          },
          {
              data: () => ({
                  topic: '9_science_motion', score: 95, difficulty: 'simple',
                  mistakes: [],
                  timestamp: { toDate: () => new Date('2023-01-04') }
              })
          },
          {
              data: () => ({
                  topic: '9_science_motion', score: 40, difficulty: 'advanced',
                  mistakes: [{ id: 'q2', question: 'Force formula' }],
                  timestamp: { toDate: () => new Date('2023-01-03') }
              })
          }
      ];
  });


  const filePath = path.resolve(__dirname, '../app/mistake-book.html');
  await page.goto(`file://${filePath}`);

  // Wait for content
  await page.waitForSelector('#mistakes-container');
  await page.waitForTimeout(1000);

  // 1. Verify Mastery Cards (Layer 1)
  const content = await page.content();
  if (!content.includes('Mathematics') || !content.includes('Science')) {
      console.error('Mastery Cards not rendered.');
      process.exit(1);
  }

  // 2. Verify Persistent Friction (Math)
  // Should see 'Persistent Friction' count > 0 for Math
  await page.evaluate(() => window.toggleChapterList('Mathematics', 'friction'));
  await page.waitForTimeout(500);

  const mathChapter = page.locator('text=Algebra Basics');
  if (await mathChapter.count() === 0) {
      console.error('Math Persistent Friction item not found.');
      process.exit(1);
  }

  // Inspect Math
  await mathChapter.first().hover();
  await page.waitForTimeout(500);
  const inspectorHtml = await page.locator('#inspector-panel').innerHTML();

  if (!inspectorHtml.includes('Solve x+1=2')) {
      console.error('Inspector missing persistent friction question.');
      process.exit(1);
  }

  // Check Heat Dots: Missed in 2 consecutive attempts -> 2 dots?
  // My logic says: history = [latest, previous] -> 2 dots.
  const dotCount = (inspectorHtml.match(/heat-dot/g) || []).length;
  if (dotCount !== 2) {
      console.error(`Expected 2 heat dots (consecutive misses), found ${dotCount}`);
      process.exit(1);
  }

  // 3. Verify Victory Gallery (Science)
  // Should see 'Victory Gallery' count > 0 for Science
  await page.evaluate(() => window.toggleChapterList('Science', 'victory'));
  await page.waitForTimeout(500);

  const scienceChapter = page.locator('text=Motion');
  if (await scienceChapter.count() === 0) {
      console.error('Science Victory Gallery item not found.');
      process.exit(1);
  }

  // Inspect Science
  await scienceChapter.first().hover();
  await page.waitForTimeout(500);
  const inspectorHtmlSci = await page.locator('#inspector-panel').innerHTML();

  if (!inspectorHtmlSci.includes('Force formula')) {
      console.error('Inspector missing victory question.');
      process.exit(1);
  }

  if (!inspectorHtmlSci.includes('🏆 Mastered')) {
      console.error('Inspector missing Victory badge.');
      process.exit(1);
  }

  console.log('Hybrid Mistake Book Verified: Integration with SlugEngine & QuizScores successful.');
  await page.screenshot({ path: 'verification/hybrid_mistake_book.png', fullPage: true });
  await browser.close();
})();
