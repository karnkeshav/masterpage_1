import sys
from playwright.sync_api import sync_playwright
import time
import subprocess
import os

def run():
    print("Starting verification...")
    # Start server
    proc = subprocess.Popen(["python3", "-m", "http.server", "8000"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()

            # 1. Navigate
            print("Navigating to Chapter Selection...")
            page.goto("http://localhost:8000/app/chapter-selection.html?grade=9&subject=Science")

            # Wait for content
            print("Waiting for content...")
            try:
                page.wait_for_selector(".group", timeout=10000)
            except Exception as e:
                print("Failed to load content. Taking screenshot.")
                page.screenshot(path="verification/failed_load.png")
                raise e

            print("Content loaded. Finding first chapter...")
            first_card = page.locator(".group").first
            title = first_card.locator("h4").inner_text()
            print(f"Clicking chapter: {title}")

            # Click
            first_card.click()

            # Verify Modal
            print("Verifying Modal visibility...")
            modal = page.locator("#difficulty-modal")
            if not modal.is_visible():
                print("Modal not visible! Taking screenshot.")
                page.screenshot(path="verification/failed_modal.png")
                raise Exception("Modal not visible")

            print("Modal visible. Taking screenshot.")
            page.screenshot(path="verification/modal_visible.png")

            # Click Medium
            print("Clicking Medium...")
            page.get_by_text("Medium").click()

            # Verify Redirect
            print("Verifying Redirect...")
            page.wait_for_url("**/quiz-engine.html*", timeout=5000)
            final_url = page.url
            print(f"Redirected to: {final_url}")

            if "difficulty=Medium" not in final_url:
                raise Exception(f"Missing difficulty param: {final_url}")

            if "table=" not in final_url:
                 raise Exception(f"Missing table param: {final_url}")

            print("SUCCESS: Quiz flow verified.")

    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)
    finally:
        proc.terminate()

if __name__ == "__main__":
    run()
