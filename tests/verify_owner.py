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
        context1.route("**/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_OWNER
        ))

        # Override initial loading logic to show the app
        context1.add_init_script("""
            window.addEventListener('load', () => {
                setTimeout(() => {
                    const loadingEl = document.getElementById("loading");
                    const appEl = document.getElementById("app");
                    if (loadingEl) loadingEl.classList.add("hidden");
                    if (appEl) appEl.classList.remove("hidden");
                }, 100);
            });
        """)

        page1 = context1.new_page()
        try:
            print("[TEST 1] Owner Console...")
            page1.goto(f"{BASE_URL}/app/consoles/owner.html")

            page1.wait_for_timeout(2000)

            # Check for Command Center header (rendered by shell.js)
            page1.wait_for_selector("text=Command Center", state="visible")
            print(" -> [PASS] Owner Console Loaded.")

            # Check for B2B Schools tab
            if page1.is_visible("[data-tab='b2b']"):
                print(" -> [PASS] B2B Schools tab present.")
            else:
                print(" -> [FAIL] B2B Schools tab missing.")

            # Check for B2C Users tab
            if page1.is_visible("[data-tab='b2c']"):
                print(" -> [PASS] B2C Users tab present.")
            else:
                print(" -> [FAIL] B2C Users tab missing.")

            # Check for Financial Ledger tab
            if page1.is_visible("[data-tab='ledger']"):
                print(" -> [PASS] Financial Ledger tab present.")
            else:
                print(" -> [FAIL] Financial Ledger tab missing.")

            # Check for Revenue chart canvas
            if page1.is_visible("#b2bRevenueChart") or page1.is_visible("#revenueChart"):
                print(" -> [PASS] Revenue chart present.")
            else:
                print(" -> [FAIL] Revenue chart missing.")

            # Check for System Pulse section
            if page1.is_visible("text=Session uptime"):
                print(" -> [PASS] System Pulse section present.")
            else:
                print(" -> [FAIL] System Pulse section missing.")

            # Check for Provision School button
            if page1.is_visible(".js-provision-btn"):
                print(" -> [PASS] Provision School button present.")
            else:
                print(" -> [FAIL] Provision School button missing.")

        except Exception as e:
            print(f" -> [FAIL] Test 1 Error: {e}")
        finally:
            context1.close()

        # TEST 2: School Landing
        context2 = browser.new_context(viewport={'width': 1280, 'height': 800})

        page2 = context2.new_page()
        try:
            print("[TEST 2] School Landing...")
            page2.goto(f"{BASE_URL}/school-landing.html?schoolId=test_id")

            # Check for Loading state
            if page2.is_visible("#loading"):
                print(" -> [PASS] School Landing Page loads (Loading State).")
            else:
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
