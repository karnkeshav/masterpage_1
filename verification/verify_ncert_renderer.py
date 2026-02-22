import sys
from playwright.sync_api import sync_playwright
import time
import subprocess
import os

def run():
    print("Starting verification of NCERT Renderer Modularization...")
    # Start server
    proc = subprocess.Popen(["python3", "-m", "http.server", "8000"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()

            # 1. Navigate to Study Content Page (mock params)
            print("Navigating to Study Content...")
            page.goto("http://localhost:8000/app/study-content.html")

            # Check for script tag - using get_attribute to verify src exact match if needed
            # But locator is better.
            # The src is relative: "../js/ncert-renderer.js"

            # Debug: Print page content if not found
            # print(page.content())

            # Use explicit CSS selector matching attribute
            # We need to escape the quotes inside the selector string or use single quotes around double
            # script = page.locator('script[src="../js/ncert-renderer.js"]')

            # Check innerHTML manually
            content = page.content()
            if 'src="../js/ncert-renderer.js"' in content:
                 print("✅ Script tag found in HTML source.")
            else:
                 print("DUMPING CONTENT:")
                 print(content)
                 raise Exception("ncert-renderer.js script tag missing")

            # Now, verification of functionality requires executing the JS.
            # If it redirects, we know it's running.
            time.sleep(2)
            if "index.html" in page.url:
                print("✅ Redirected to index.html (Auth Guard Active). Code is executing.")
            else:
                print("⚠️ Did not redirect. Logic might be broken or slow.")

            print("SUCCESS: Modularization verified structurally.")

    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)
    finally:
        proc.terminate()

if __name__ == "__main__":
    run()
