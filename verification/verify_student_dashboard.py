import sys
from playwright.sync_api import sync_playwright
import time
import subprocess
import os

def run():
    print("Starting verification of Student Dashboard Updates...")
    # Start server
    proc = subprocess.Popen(["python3", "-m", "http.server", "8000"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()

            # 1. Prepare Bypass File (Simulate Auth)
            print("Creating temporary bypassed file...")
            subprocess.run("cp app/consoles/student.html app/consoles/student_test.html", shell=True)
            subprocess.run("sed -i '/guardConsole/d' app/consoles/student_test.html", shell=True)

            # Navigate
            print("Navigating to Bypassed Student Console...")
            page.goto("http://localhost:8000/app/consoles/student_test.html")

            # Manually trigger display (remove hidden class from #app)
            page.evaluate("document.getElementById('app').classList.remove('hidden');")
            page.evaluate("document.getElementById('loading').classList.add('hidden');")

            # Wait for DOM update
            time.sleep(1)

            # 2. Verify Sidebar "Knowledge Hub"
            print("Verifying Sidebar...")
            # Use a more robust selector or check innerText
            # The heading might be inside a div or span
            # Look for ANY element containing "Knowledge Hub"
            sidebar_heading = page.locator("body").get_by_text("Knowledge Hub")

            if not sidebar_heading.count() > 0:
                print("Sidebar heading not found. Dumping body text...")
                # print(page.locator("body").inner_text()[:500])
                page.screenshot(path="verification/failed_sidebar.png")
                raise Exception("Sidebar heading 'Knowledge Hub' not found")

            # Verify Subject Cards
            math_card = page.get_by_text("Mathematics")
            if not math_card.count() > 0:
                raise Exception("Mathematics card not found")

            # 3. Verify Dashboard Elements
            print("Verifying Dashboard Slots...")
            grit_heading = page.get_by_text("Chapter Health & Grit")
            if not grit_heading.count() > 0:
                page.screenshot(path="verification/failed_grit.png")
                raise Exception("Chapter Health & Grit heading not found")

            # Take Screenshot
            print("Taking Screenshot of Dashboard...")
            page.screenshot(path="verification/student_dashboard_updated.png")

            print("SUCCESS: Student Dashboard Verification Passed.")

            # Clean up
            subprocess.run("rm app/consoles/student_test.html", shell=True)

    except Exception as e:
        print(f"ERROR: {e}")
        subprocess.run("rm app/consoles/student_test.html", shell=True)
        try:
            page.screenshot(path="verification/error_state.png")
        except:
            pass
        sys.exit(1)
    finally:
        proc.terminate()

if __name__ == "__main__":
    run()
