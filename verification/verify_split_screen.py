import sys
from playwright.sync_api import sync_playwright
import time
import subprocess
import os

def run():
    print("Starting verification of Split Screen Layout...")
    # Start server
    proc = subprocess.Popen(["python3", "-m", "http.server", "8000"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()

            # 1. Prepare Bypass File
            print("Creating temporary bypassed file...")
            subprocess.run("cp app/consoles/student.html app/consoles/student_test.html", shell=True)

            # Remove the guard entirely
            subprocess.run("sed -i '/guardConsole/d' app/consoles/student_test.html", shell=True)

            # Navigate
            print("Navigating to Bypassed Student Console...")
            page.goto("http://localhost:8000/app/consoles/student_test.html")

            # Wait for DOM
            try:
                page.wait_for_selector("#loading", timeout=5000)
            except:
                print("Loading element not found. Dumping HTML snippet...")
                print(page.content()[:500])
                raise Exception("Page did not load expected structure")

            print("Forcing View for Layout Verification...")
            # Use specific selectors and check existence before modification
            page.evaluate("""
                const loading = document.getElementById('loading');
                if (loading) loading.style.display = 'none';

                const app = document.getElementById('app');
                if (app) {
                    app.classList.remove('hidden');
                    app.style.display = 'block'; // Ensure visibility
                }

                const welcome = document.getElementById('user-welcome');
                if (welcome) welcome.textContent = 'Test User';

                // Mock window.loadConsoleData manually since we might not have a profile
                if (window.loadConsoleData) {
                    window.loadConsoleData({displayName: 'Test User', uid: 'test', classId: '9'});
                } else {
                    console.log("loadConsoleData not ready, waiting...");
                }
            """)

            # If loadConsoleData wasn't ready, we might need to retry or wait.
            # But the script type=module should execute fairly quickly.

            time.sleep(3) # Wait for curriculum load

            # 2. Verify Left Panel (Exam Acceleration)
            print("Verifying Left Panel...")
            try:
                page.wait_for_selector("#acceleration-tree button", timeout=5000)
            except:
                print("Acceleration Tree Empty. Taking screenshot.")
                page.screenshot(path="verification/failed_tree_load.png")
                # Clean up
                subprocess.run("rm app/consoles/student_test.html", shell=True)
                raise Exception("Tree did not populate")

            left_panel = page.locator("#acceleration-tree")
            if not left_panel.is_visible():
                page.screenshot(path="verification/failed_left_panel.png")
                raise Exception("Left Panel not visible")

            print("Left Panel found. Checking Subjects...")
            science_btn = page.locator("#acceleration-tree button").filter(has_text="Science").first

            if not science_btn.is_visible():
                page.screenshot(path="verification/failed_subjects.png")
                raise Exception("Science subject button not found")

            print("Clicking Science...")
            science_btn.click()
            time.sleep(1)

            # 3. Verify Chapters Expansion
            print("Verifying Chapters...")
            # We look for Motion
            motion_btn = page.locator("#tree-Science button").filter(has_text="Motion").first

            if not motion_btn.is_visible():
                page.screenshot(path="verification/failed_chapter_expansion.png")
                raise Exception("Chapter 'Motion' not visible after expanding Science")

            print("Chapter 'Motion' found. Clicking...")
            motion_btn.click()
            time.sleep(2)

            # 4. Verify Right Panel Content Switch
            print("Verifying Content View...")
            content_view = page.locator("#content-view")
            dashboard_view = page.locator("#dashboard-view")

            if not content_view.is_visible():
                 page.screenshot(path="verification/failed_content_view.png")
                 raise Exception("Content View did not appear")

            if dashboard_view.is_visible():
                 raise Exception("Dashboard View did not hide")

            # Check Header
            header_title = page.locator("#content-title")
            if "Motion" not in header_title.inner_text():
                raise Exception(f"Header text mismatch: {header_title.inner_text()}")

            print("Content Loaded. Taking Screenshot.")
            page.screenshot(path="verification/split_screen_success.png")

            # 5. Verify Close Button
            print("Closing Content...")
            close_btn = page.locator("#content-view button").first
            close_btn.click()
            time.sleep(0.5)

            if not dashboard_view.is_visible():
                raise Exception("Dashboard did not reappear after close")

            print("SUCCESS: Split Screen Workflow Verified.")

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
