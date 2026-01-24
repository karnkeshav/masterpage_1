from playwright.sync_api import sync_playwright
import time
import os

BASE_URL = "http://localhost:8080"

# Mocks
AUTH_MOCK_NULL = """
export async function requireAuth(skipUI) { return null; }
export async function initializeAuthListener(cb) { cb(null); }
export function checkDemoAccess() { return false; }
"""

AUTH_MOCK_DEMO = """
export async function requireAuth(skipUI) {
    console.log("Mock requireAuth called");
    return { uid: "demo-user", email: "demo.principal@ready4exam.com" };
}
export async function initializeAuthListener(cb) { cb({ uid: "demo-user", email: "demo.principal@ready4exam.com" }); }
export function checkDemoAccess(u) { return true; }
export function checkRole() { return false; }
"""

AUTH_MOCK_MASTER = """
export async function requireAuth(skipUI) {
    // Simulate Lens Injection
    console.log("Mock requireAuth Master called");
    import("./persona-lens.js").then(m => m.initPersonaLens());
    return { uid: "master", email: "keshav.karn@gmail.com" };
}
export async function initializeAuthListener(cb) {
    import("./persona-lens.js").then(m => m.initPersonaLens());
    cb({ uid: "master", email: "keshav.karn@gmail.com" });
}
export function checkDemoAccess(u) { return false; }
export function checkRole() { return true; }
"""

def verify_enterprise():
    os.makedirs("verification_results", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---------------------------------------------------------
        # TEST 1: Open Entry (No Login Wall)
        # ---------------------------------------------------------
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        context.route("**/cbse/class-9/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_NULL
        ))

        page = context.new_page()
        page.on("console", lambda msg: print(f"[TEST 1 LOG]: {msg.text}"))

        try:
            print("[TEST 1] Open Entry Flow...")
            page.goto(f"{BASE_URL}/index.html")

            try:
                page.wait_for_selector("#portalChoiceModal", state="visible", timeout=2000)
                print(" -> FAILED: Portal Modal shouldn't appear for guest.")
            except:
                print(" -> SUCCESS: No blocking modal on load.")

            if page.is_visible("#desktop-login-btn"):
                print(" -> SUCCESS: Login button visible.")
            else:
                print(" -> FAILED: Login button missing.")

        except Exception as e:
            print(f"[TEST 1] ERROR: {e}")
        finally:
            context.close()

        # ---------------------------------------------------------
        # TEST 2: Demo Access (School Portal)
        # ---------------------------------------------------------
        context_demo = browser.new_context(viewport={'width': 1280, 'height': 800})
        context_demo.route("**/cbse/class-9/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_DEMO
        ))

        page_demo = context_demo.new_page()
        page_demo.on("console", lambda msg: print(f"[TEST 2 LOG]: {msg.text}"))

        try:
            print("[TEST 2] Demo Access Flow...")
            page_demo.goto(f"{BASE_URL}/index.html")

            # Modal should appear
            print("Waiting for modal...")
            # Ensure we check for VISIBILITY
            page_demo.wait_for_selector("#portalChoiceModal", state="visible")
            print(" -> Portal Modal Visible.")

            page_demo.click(".portal-btn:has-text('School')")

            page_demo.wait_for_url("**/consoles/admin.html")
            print(" -> SUCCESS: Redirected to Admin Console for Demo User.")

        except Exception as e:
            print(f"[TEST 2] ERROR: {e}")
            page_demo.screenshot(path="verification_results/error_demo.png")
        finally:
            context_demo.close()

        # ---------------------------------------------------------
        # TEST 3: Master Persona Lens
        # ---------------------------------------------------------
        context_master = browser.new_context(viewport={'width': 1280, 'height': 800})
        context_master.route("**/cbse/class-9/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_MASTER
        ))

        page_master = context_master.new_page()
        page_master.on("console", lambda msg: print(f"[TEST 3 LOG]: {msg.text}"))

        try:
            print("[TEST 3] Master Persona Lens...")
            # Go to Root Index (which uses requireAuth logic)
            page_master.goto(f"{BASE_URL}/index.html")

            # Wait for Persona Lens
            # We assume index.html logic calls requireAuth, which (in Mock) imports lens
            page_master.wait_for_selector("#persona-lens", state="visible")
            print(" -> SUCCESS: Persona Lens Widget Visible.")

        except Exception as e:
            print(f"[TEST 3] ERROR: {e}")
            page_master.screenshot(path="verification_results/error_master.png")
        finally:
            context_master.close()

        browser.close()

if __name__ == "__main__":
    verify_enterprise()
