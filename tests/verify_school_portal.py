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

        # TEST 1: School Portal Modal in Index
        context1 = browser.new_context(viewport={'width': 1280, 'height': 800})
        # Mock auth to return user so modal shows up
        context1.route("**/cbse/class-9/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_STUDENT
        ))
        page1 = context1.new_page()
        try:
            print("[TEST 1] Checking School Portal Modal...")
            page1.goto(f"{BASE_URL}/index.html")
            page1.wait_for_selector("#portalChoiceModal", state="visible")

            # Click "School / Demo"
            page1.click(".portal-btn:has-text('School')")

            # Should show #schoolRoleModal
            page1.wait_for_selector("#schoolRoleModal", state="visible")

            # Check for 4 buttons
            buttons = page1.locator("#schoolRoleModal .portal-btn")
            count = buttons.count()
            if count == 4:
                print(" -> [PASS] School Role Modal shows 4 options.")
            else:
                print(f" -> [FAIL] Expected 4 options, found {count}")

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
