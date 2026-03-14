from playwright.sync_api import sync_playwright
import os

BASE_URL = "http://localhost:8080"

AUTH_MOCK_STUDENT = """
export async function requireAuth(skipUI) { return { uid: "s1", email: "student@school.com" }; }
export async function initializeAuthListener(cb) { cb({ uid: "s1", email: "student@school.com", displayName: "Test Student" }); }
export function checkRole() { return false; }
"""

AUTH_MOCK_PRINCIPAL = """
export async function requireAuth(skipUI) { return { uid: "p1", email: "principal@school.com" }; }
export async function initializeAuthListener(cb) { cb({ uid: "p1", email: "principal@school.com" }); }
export async function checkRole(role) { return role === 'principal'; }
"""

def verify_school_portal():
    os.makedirs("verification_results", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # TEST 1: Verify Login Form Presence
        context1 = browser.new_context(viewport={'width': 1280, 'height': 800})
        context1.route("**/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body="export async function initializeAuthListener(cb) { }"
        ))
        page1 = context1.new_page()
        try:
            print("[TEST 1] Checking Login Form...")
            page1.goto(f"{BASE_URL}/index.html")

            page1.wait_for_selector("#sovereign-login-form", state="visible")
            page1.wait_for_selector("#username", state="visible")
            page1.wait_for_selector("#password", state="visible")
            print(" -> [PASS] Login Form exists and is visible.")

            # TEST 1b: Verify Start Quiz Button Widget Logic
            print("[TEST 1b] Checking Start Quiz Widget...")

            nav_url = []
            def intercept_route(route):
                if 'quiz-engine.html' in route.request.url:
                    nav_url.append(route.request.url)
                    route.abort()
                else:
                    route.continue_()

            page1.route("**/*", intercept_route)

            # Since the button is disabled by default until selections are made,
            # we need to make the selections to enable it, OR force click it.
            # Our widget logic requires real selections to build the URL.

            # Select CBSE
            page1.click("button[data-board='CBSE']")

            # Select Class 10
            page1.select_option("#class-select", "10")
            page1.wait_for_timeout(500)

            # Select Science
            page1.select_option("#subject-select", "Science")
            page1.wait_for_timeout(500)

            # Select the first available chapter that has a value
            page1.evaluate('''() => {
               const chapSel = document.getElementById('chapter-select');
               for(let i=0; i<chapSel.options.length; i++) {
                   if(chapSel.options[i].value && JSON.parse(chapSel.options[i].value).table_id) {
                       chapSel.selectedIndex = i;
                       window.checkChapter();
                       break;
                   }
               }
            }''')

            page1.click("#start-quiz-btn")
            page1.wait_for_timeout(1000)

            if len(nav_url) > 0 and 'table=' in nav_url[0]:
                 print(" -> [PASS] Start Quiz navigates with correct default params: " + nav_url[0])
            else:
                 print(" -> [FAIL] Start Quiz did not navigate correctly: " + str(nav_url))

        except Exception as e:
            print(f" -> [FAIL] Test 1 Error: {e}")
        finally:
            context1.close()

        # TEST 2: Student Console (No Redirect)
        context2 = browser.new_context(viewport={'width': 1280, 'height': 800})
        context2.route("**/cbse/class-9/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_STUDENT
        ))
        # Mock UI Renderer for showSkeleton
        context2.route("**/cbse/class-9/js/ui-renderer.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body="export function showSkeleton() { console.log('Skeleton Shown'); }"
        ))
        # Mock Config/Firestore to avoid errors (optional but good)

        page2 = context2.new_page()
        try:
            print("[TEST 2] Checking Student Console...")
            page2.goto(f"{BASE_URL}/cbse/class-9/consoles/student.html")

            # Should NOT redirect to index.html
            # Wait a bit
            page2.wait_for_timeout(2000)

            if "consoles/student.html" in page2.url:
                print(" -> [PASS] Student Console loaded without redirect.")
            else:
                print(f" -> [FAIL] Redirected to {page2.url}")

        except Exception as e:
            print(f" -> [FAIL] Test 2 Error: {e}")
        finally:
            context2.close()

        # TEST 3: Principal Dashboard Heatmap
        context3 = browser.new_context(viewport={'width': 1280, 'height': 800})
        context3.route("**/cbse/class-9/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_PRINCIPAL
        ))

        page3 = context3.new_page()
        try:
            print("[TEST 3] Checking Principal Dashboard...")
            page3.goto(f"{BASE_URL}/cbse/class-9/consoles/principal.html")

            # Wait for heatmap
            page3.wait_for_selector("#heatmap-grid", state="visible")

            # Check content
            content = page3.inner_text("#heatmap-grid")
            if "Class 6" in content and "Class 12" in content:
                print(" -> [PASS] Heatmap contains Class 6-12 data.")
            else:
                print(" -> [FAIL] Heatmap missing class data.")

        except Exception as e:
            print(f" -> [FAIL] Test 3 Error: {e}")
        finally:
            context3.close()

        browser.close()

if __name__ == "__main__":
    verify_school_portal()
