from playwright.sync_api import sync_playwright
import os

BASE_URL = "http://localhost:8080"

# Mock Auth Paywall to simulate Master User
AUTH_MOCK_MASTER = """
export async function requireAuth(skipUI) {
    // Simulate Lens Injection like real file
    import("./persona-lens.js").then(m => m.initPersonaLens());
    return { uid: "master", email: "keshav.karn@gmail.com" };
}
export async function initializeAuthListener(cb) {
    import("./persona-lens.js").then(m => m.initPersonaLens());
    cb({ uid: "master", email: "keshav.karn@gmail.com" });
}
export function checkRole() { return true; }
"""

def verify_centralization():
    print("Verifying Centralization & Lens...")

    # 1. Verify Master Config in Class 6 Admin Console
    admin_path = "cbse/class-6/consoles/admin.html"
    with open(admin_path, "r") as f:
        content = f.read()
        if '<script src="/masterpage_1/js/firebase-master-config.js"></script>' in content:
            print(" -> [PASS] Class 6 Admin Console loads Master Config.")
        else:
            print(" -> [FAIL] Class 6 Admin Console missing Master Config script.")

    # 2. Verify Persona Lens in Class 12 (via Playwright)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})

        # Intercept Auth to be Master
        context.route("**/cbse/class-12/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body=AUTH_MOCK_MASTER
        ))

        page = context.new_page()
        try:
            print("Loading Class 12 Index as Master...")
            page.goto(f"{BASE_URL}/cbse/class-12/index.html")

            # Check for Lens
            page.wait_for_selector("#persona-lens", state="visible")
            text = page.inner_text("#persona-lens")

            if "Student (12)" in text:
                print(" -> [PASS] Persona Lens visible with 'Student (12)' button.")
            else:
                print(f" -> [FAIL] Persona Lens text mismatch. Found: {text}")

        except Exception as e:
            print(f" -> [FAIL] Playwright Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_centralization()
