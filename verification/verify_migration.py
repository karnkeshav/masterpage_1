
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # 1. Verify Class Hub (Public)
    print("Verifying Class Hub...")
    page.goto("http://localhost:8000/app/class-hub.html?grade=9")
    page.wait_for_timeout(2000) # Wait for modules to load
    page.screenshot(path="verification/1_class_hub.png")

    # 2. Verify Curriculum Selection (Public)
    print("Verifying Curriculum...")
    page.goto("http://localhost:8000/app/curriculum.html?grade=9&subject=Science")
    page.wait_for_timeout(2000)
    page.screenshot(path="verification/2_curriculum.png")

    # 3. Verify Student Console (Unauth state)
    print("Verifying Student Console...")
    page.goto("http://localhost:8000/app/consoles/student.html")
    page.wait_for_timeout(2000)
    page.screenshot(path="verification/3_student_console.png")

    # 4. Verify Review (Unauth state)
    print("Verifying Review Page...")
    page.goto("http://localhost:8000/app/review.html")
    page.wait_for_timeout(2000)
    page.screenshot(path="verification/4_review.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
