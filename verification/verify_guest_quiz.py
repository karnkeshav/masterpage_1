from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    # Go to local server
    page.goto("http://localhost:8080/index.html")
    page.wait_for_timeout(1000)

    # Scroll to the quiz section to take a snapshot of the updated buttons
    page.evaluate("document.getElementById('quiz-section').scrollIntoView()")
    page.wait_for_timeout(1000)

    os.makedirs("verification/screenshots", exist_ok=True)
    page.screenshot(path="verification/screenshots/quiz_section.png")
    page.wait_for_timeout(500)

    # Scroll back to top to check the hero section
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(1000)
    page.screenshot(path="verification/screenshots/hero_section.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        os.makedirs("verification/videos", exist_ok=True)
        context = browser.new_context(
            record_video_dir="verification/videos",
            viewport={'width': 1280, 'height': 800}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
