from playwright.sync_api import sync_playwright
import os

BASE_URL = "http://localhost:8080/app/study-content.html?grade=10&subject=Science&chapter=Chemical%20Reactions"

AUTH_MOCK_USER = """
export async function requireAuth(skipUI) {
    return { uid: "test-student", email: "student@ready4exam.com" };
}
export async function initializeAuthListener(cb) { cb({ uid: "test-student", email: "student@ready4exam.com", displayName: "Test Student" }); }
export function checkDemoAccess() { return false; }
export async function ensureUserInFirestore(u) { return u; }
"""

def run_cuj(page):
    print("Navigating to study content page...")
    page.goto(BASE_URL)
    page.wait_for_timeout(3000)

    # Scroll down to make sure MathJax renders
    page.evaluate("window.scrollBy(0, document.body.scrollHeight)")
    page.wait_for_timeout(2000)

    # Take screenshot
    page.screenshot(path="/home/jules/verification/screenshots/verification.png", full_page=True)
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        context.route("**/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_USER
        ))
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
