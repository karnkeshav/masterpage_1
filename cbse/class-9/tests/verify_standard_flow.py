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

def verify_standard_flow():
    os.makedirs("verification", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 1200})

        # Intercept routes for mocking
        context.route("**/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK
        ))
        context.route("**/js/firebase-expiry.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=EXPIRY_MOCK
        ))

        page = context.new_page()

        try:
            print("Verifying Home Page (Standard Mode)...")
            page.goto(f"{BASE_URL}/index.html")
            time.sleep(2)

            # Ensure we are in Standard Mode (default)
            # The "Chapter Mastery" button should have the active class
            # But we can just proceed to select a subject.

            print("Selecting Subject (Standard)...")
            page.wait_for_selector("#subject-grid .subject-card", state="visible")
            card = page.locator("#subject-grid .subject-card").first
            card.scroll_into_view_if_needed()

            with page.expect_navigation():
                card.click()

            print("Arrived at Chapter Selection...")
            time.sleep(1)

            # 1. Select Book
            print("Selecting Book...")
            page.wait_for_selector(".topic-btn", state="visible")
            page.locator(".topic-btn").first.click()

            # 2. Select Single Chapter
            print("Selecting Single Chapter...")
            time.sleep(1)
            # First button is Back, Second is a Chapter
            chapters = page.locator(".topic-btn")
            if chapters.count() > 1:
                chapters.nth(1).click()

            # 3. Select Difficulty
            print("Selecting Difficulty...")
            page.click(".difficulty-btn[data-diff='Medium']")

            print("Starting Quiz (Standard)...")
            # In standard flow, clicking Start Quiz goes DIRECTLY to quiz-engine.html
            page.click("#start-quiz")

            print("Waiting for Quiz Engine...")
            page.wait_for_url("**/quiz-engine.html*")

            # Check query params to ensure it's NOT term_prep
            url = page.url
            if "mode=term_prep" in url:
                raise Exception("Regression: Standard flow triggered Term Prep mode!")

            print("Standard Flow Verification SUCCESS!")

        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

        finally:
            browser.close()

if __name__ == "__main__":
    verify_standard_flow()
