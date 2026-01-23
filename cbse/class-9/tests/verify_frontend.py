from playwright.sync_api import sync_playwright
import time
import os

BASE_URL = "http://localhost:8080/cbse/class-9"

AUTH_MOCK = """
export async function requireAuth() { return { uid: "test-user", email: "test@example.com" }; }
export async function checkRole() { return true; }
export async function getUserRole() { return "student"; }
export async function ensureUserInFirestore() {}
export async function revokeAccess() {}
export async function bulkOnboarding() {}
"""

EXPIRY_MOCK = """
export async function checkClassAccess() { return { allowed: true }; }
export function showExpiredPopup() {}
export async function ensureUserDocExists() { return {}; }
export function isSignupExpired() { return false; }
"""

def verify_frontend():
    os.makedirs("verification", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a larger viewport to ensure elements are visible without much scrolling
        context = browser.new_context(viewport={'width': 1280, 'height': 1200})

        # Intercept routes for mocking
        context.route("**/js/auth-paywall.js", lambda route: route.fulfill(
            status=200,
            content_type="application/javascript",
            body=AUTH_MOCK
        ))

        context.route("**/js/firebase-expiry.js", lambda route: route.fulfill(
            status=200,
            content_type="application/javascript",
            body=EXPIRY_MOCK
        ))

        page = context.new_page()
        page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))

        try:
            print("Verifying Home Page...")
            page.goto(f"{BASE_URL}/index.html")

            # Wait for animation
            time.sleep(2)

            page.wait_for_selector("#mode-term", state="visible")
            page.screenshot(path="verification/1_homepage_standard.png")

            print("Clicking Term Prep...")
            page.click("#mode-term")
            time.sleep(1) # Allow DOM update
            page.screenshot(path="verification/2_homepage_term_prep.png")

            print("Waiting for subject grid...")
            # Ensure subject grid is visible
            page.wait_for_selector("#subject-grid .subject-card", state="visible")

            # Scroll to the first card to avoid navbar overlap
            card = page.locator("#subject-grid .subject-card").first
            card.scroll_into_view_if_needed()

            print("Navigating to Chapter Selection...")
            # We expect navigation to chapter-selection.html
            with page.expect_navigation(timeout=10000):
                card.click()

            print("Arrived at Chapter Selection. Verifying...")
            time.sleep(2)
            page.screenshot(path="verification/3_chapter_selection.png")

            # 1. Select a Book first
            print("Selecting a Book...")
            page.wait_for_selector(".topic-btn", state="visible")

            # Click the first book
            page.locator(".topic-btn").first.click()

            # 2. Select Chapters
            print("Selecting chapters...")
            # Wait for back button or new list of chapters
            time.sleep(1)

            # In Term Prep mode, we click multiple chapters
            # The first button is "Back to Books", so we start from second (index 1)
            chapters = page.locator(".topic-btn")
            count = chapters.count()
            print(f"Found {count} buttons (including Back).")

            if count > 1:
                chapters.nth(1).click() # First chapter
                if count > 2:
                    chapters.nth(2).click() # Second chapter

            # 3. Select Difficulty
            print("Selecting Difficulty...")
            page.wait_for_selector(".difficulty-btn", state="visible")
            page.click(".difficulty-btn[data-diff='Simple']")

            print("Starting Prep...")
            # Click "Start Quiz" / "Proceed to Prep"
            page.click("#start-quiz")

            # Should go to cognitive-priming.html
            print("Waiting for Cognitive Priming...")
            page.wait_for_url("**/cognitive-priming.html*")
            time.sleep(2)
            page.screenshot(path="verification/4_cognitive_priming.png")

            print("Cognitive Priming Loaded. Clicking Start Quiz...")
            # Click Start Quiz
            page.click("#start-btn")

            # Should go to quiz-engine.html
            print("Waiting for Quiz Engine...")
            page.wait_for_url("**/quiz-engine.html*")
            time.sleep(2)
            page.screenshot(path="verification/5_quiz_engine.png")

            print("Frontend Verification SUCCESS!")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
            import traceback
            traceback.print_exc()

        finally:
            browser.close()

if __name__ == "__main__":
    verify_frontend()
