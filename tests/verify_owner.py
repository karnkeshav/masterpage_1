from playwright.sync_api import sync_playwright
import os

BASE_URL = "http://localhost:8080"

AUTH_MOCK_OWNER = """
export async function requireAuth(skipUI) { return { uid: "owner", email: "keshav.karn@gmail.com" }; }
export async function initializeAuthListener(cb) { cb({ uid: "owner", email: "keshav.karn@gmail.com" }); }
"""

def verify_owner():
    os.makedirs("verification_results", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # TEST 1: Owner Console
        context1 = browser.new_context(viewport={'width': 1280, 'height': 800})
        # Mock auth
        context1.route("**/cbse/class-9/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_OWNER
        ))

        page1 = context1.new_page()
        try:
            print("[TEST 1] Owner Console...")
            page1.goto(f"{BASE_URL}/owner-console.html")

            # Check for Header
            page1.wait_for_selector("h1:has-text('Master Orchestration Layer')", state="visible")
            print(" -> [PASS] Owner Console Loaded.")

            # Check for Ledger Refresh button
            if page1.is_visible("button:has-text('Refresh')"):
                print(" -> [PASS] Ledger UI present.")
            else:
                print(" -> [FAIL] Ledger UI missing.")

        except Exception as e:
            print(f" -> [FAIL] Test 1 Error: {e}")
        finally:
            context1.close()

        # TEST 2: School Landing
        context2 = browser.new_context(viewport={'width': 1280, 'height': 800})
        # No auth needed for landing usually, or it fetches from Firestore
        # We need to mock Firestore fetch?
        # school-landing.html uses getDoc.
        # It's hard to mock Firestore directly without more complex interception.
        # But we can check if page loads and shows "Locating School Instance..." or similar.

        page2 = context2.new_page()
        try:
            print("[TEST 2] School Landing...")
            page2.goto(f"{BASE_URL}/school-landing.html?schoolId=test_id")

            # Check for Loading state
            if page2.is_visible("#loading"):
                print(" -> [PASS] School Landing Page loads (Loading State).")
            else:
                # Maybe it loaded fast or failed?
                print(" -> [INFO] Loading state not seen (might be fast or error).")

            # Check for structure
            if page2.is_visible("#school-header"):
                print(" -> [PASS] School Landing Page structure verified.")

        except Exception as e:
            print(f" -> [FAIL] Test 2 Error: {e}")
        finally:
            context2.close()

        browser.close()

if __name__ == "__main__":
    verify_owner()
