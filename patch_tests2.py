import re

with open('tests/verify_school_portal.py', 'r') as f:
    content = f.read()

# Replace TEST 1 completely with our new inline login verification logic.
pattern = r"# TEST 1: Verify Login Modal Toggle.*?(?=# TEST 2: Student Console \(No Redirect\))"

new_test1 = """# TEST 1: Verify Login Form Presence
        context1 = browser.new_context(viewport={'width': 1280, 'height': 800})
        context1.route("**/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body="export async function initializeAuthListener(cb) { }"
        ))
        page1 = context1.new_page()
        try:
            print("[TEST 1] Checking Login Form...")
            page1.goto(f"{BASE_URL}/index.html")

            page1.wait_for_selector("#sovereign-login-form", state="visible")
            page1.wait_for_selector("#username", state="visible")
            page1.wait_for_selector("#password", state="visible")
            print(" -> [PASS] Login Form exists and is visible.")

            # TEST 1b: Verify Start Quiz Button Widget Logic
            print("[TEST 1b] Checking Start Quiz Widget...")

            nav_url = []
            def intercept_route(route):
                if 'quiz-engine.html' in route.request.url:
                    nav_url.append(route.request.url)
                    route.abort()
                else:
                    route.continue_()

            page1.route("**/*", intercept_route)

            page1.click("#start-quiz-btn")
            page1.wait_for_timeout(1000)

            if len(nav_url) > 0 and 'board=' in nav_url[0]:
                 print(" -> [PASS] Start Quiz navigates with correct default params: " + nav_url[0])
            else:
                 print(" -> [FAIL] Start Quiz did not navigate correctly: " + str(nav_url))

        except Exception as e:
            print(f" -> [FAIL] Test 1 Error: {e}")
        finally:
            context1.close()

        """

new_content = re.sub(pattern, new_test1, content, flags=re.DOTALL)

with open('tests/verify_school_portal.py', 'w') as f:
    f.write(new_content)

print("Patched verify_school_portal.py")
