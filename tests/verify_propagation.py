from playwright.sync_api import sync_playwright
import time
import os

BASE_URL = "http://localhost:8080"

# Mock Auth with specific roles for testing
AUTH_MOCK_ADMIN = """
export async function requireAuth() { return { uid: "test-admin", email: "keshav.karn@gmail.com" }; }
export async function checkRole(role) { return role === 'admin'; }
export async function getUserRole() { return "admin"; }
export async function ensureUserInFirestore() {}
"""

AUTH_MOCK_STUDENT = """
export async function requireAuth() { return { uid: "test-student", email: "student@example.com" }; }
export async function checkRole(role) { return role === 'student'; }
export async function getUserRole() { return "student"; }
export async function ensureUserInFirestore() {}
"""

def verify_propagation():
    os.makedirs("verification_results", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---------------------------------------------------------
        # TEST 1: Root Login & School Portal Redirection (Admin)
        # ---------------------------------------------------------
        context_admin = browser.new_context(viewport={'width': 1280, 'height': 800})
        # Mock Auth as Admin
        context_admin.route("**/cbse/class-9/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_ADMIN
        ))

        page_admin = context_admin.new_page()

        try:
            print("[TEST 1] Root Login & School Portal (Admin)...")
            page_admin.goto(f"{BASE_URL}/index.html")

            # 1. Check if Portal Modal Appears (since requireAuth succeeds)
            page_admin.wait_for_selector("#portalChoiceModal", state="visible")
            print(" -> Portal Modal Visible")

            # 2. Click School Portal
            page_admin.click(".portal-btn:has-text('School')")

            # 3. Verify Redirection to Admin Console
            page_admin.wait_for_url("**/cbse/class-9/consoles/admin.html")
            print(" -> Redirected to Admin Console: SUCCESS")

        except Exception as e:
            print(f"[TEST 1] FAILED: {e}")

        finally:
            context_admin.close()

        # ---------------------------------------------------------
        # TEST 2: Student Portal & Class 11 Term Prep
        # ---------------------------------------------------------
        context_student = browser.new_context(viewport={'width': 1280, 'height': 800})
        # Mock Auth as Student
        context_student.route("**/cbse/class-9/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_STUDENT
        ))
        # Mock Class 11 specific auth/quiz if needed, but we rely on propagation
        # We need to mock auth for Class 11 too because it imports from its own js folder
        context_student.route("**/cbse/class-11/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_STUDENT
        ))
        # Mock Firebase Expiry for Class 11
        context_student.route("**/cbse/class-11/js/firebase-expiry.js", lambda route: route.fulfill(
             status=200, content_type="application/javascript", body="export async function checkClassAccess() { return { allowed: true }; } \n export function showExpiredPopup() {}"
        ))

        page_student = context_student.new_page()

        try:
            print("[TEST 2] Student Portal & Class 11 Term Prep...")
            page_student.goto(f"{BASE_URL}/index.html")

            # 1. Portal Modal
            page_student.wait_for_selector("#portalChoiceModal", state="visible")

            # 2. Click Student Portal
            page_student.click(".portal-btn:has-text('Student')")

            # 3. Modal should close
            page_student.wait_for_selector("#portalChoiceModal", state="hidden")
            print(" -> Student Portal Selected, Modal Closed")

            # 4. Navigate to Class 11 (Simulate clicks)
            # Click CBSE
            page_student.click(".board-btn[data-board='CBSE']")
            time.sleep(0.5)
            # Click Class 11 Card
            with page_student.expect_navigation():
                page_student.click("a[href='./cbse/class-11/index.html']")

            print(" -> Navigated to Class 11 Hub")

            # 5. Check Term Prep Toggle
            page_student.wait_for_selector("#mode-term", state="visible")
            page_student.click("#mode-term")
            print(" -> Term Prep Mode Toggled")

            # 6. Select a Stream (for Class 11)
            # Check if stream section is visible
            if page_student.is_visible("#stream-section"):
                print(" -> Stream Section Detected. Selecting Science...")
                page_student.click("#stream-section .subject-card:has-text('Science')")

            # 7. Select a Subject
            # Wait for grid
            page_student.wait_for_selector("#subject-grid .subject-card", state="visible")
            card = page_student.locator("#subject-grid .subject-card").first
            card.scroll_into_view_if_needed()

            with page_student.expect_navigation():
                card.click()

            print(" -> Entered Chapter Selection")

            # 8. Check Multi-Select UI (Term Prep)
            # Wait for buttons
            page_student.wait_for_selector(".topic-btn")
            # Select Book
            page_student.locator(".topic-btn").first.click()
            time.sleep(0.5)

            # Select Chapters (should allow multi)
            chapters = page_student.locator(".topic-btn")
            if chapters.count() > 2:
                chapters.nth(1).click()
                chapters.nth(2).click()

                # Check for 'selected' class on multiple items
                sel = page_student.locator(".topic-btn.selected")
                if sel.count() >= 2:
                    print(" -> Multi-Select Working: SUCCESS")
                else:
                    print(f" -> Multi-Select FAILED (Count: {sel.count()})")
            else:
                 print(" -> Not enough chapters to test multi-select, but UI loaded.")

        except Exception as e:
            print(f"[TEST 2] FAILED: {e}")
            import traceback
            traceback.print_exc()
            page_student.screenshot(path="verification_results/error_student.png")

        finally:
            context_student.close()
            browser.close()

if __name__ == "__main__":
    verify_propagation()
