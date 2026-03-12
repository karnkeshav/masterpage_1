import re

with open('tests/verify_school_portal.py', 'r') as f:
    content = f.read()

# Replace TEST 1 completely with our new modal verification logic.
pattern = r"# TEST 1: School Portal Modal in Index.*?(?=# TEST 2: Student Console \(No Redirect\))"

new_test1 = """# TEST 1: Verify Login Modal Toggle
        context1 = browser.new_context(viewport={'width': 1280, 'height': 800})
        # Mock auth to DO NOTHING on listener so modal doesn't do unexpected things.
        context1.route("**/js/auth-paywall.js", lambda route: route.fulfill(
            status=200, content_type="application/javascript", body="export async function initializeAuthListener(cb) { }"
        ))
        page1 = context1.new_page()
        try:
            print("[TEST 1] Checking Login Modal Toggle...")
            page1.goto(f"{BASE_URL}/index.html")

            # Wait for button
            page1.wait_for_selector("#login-modal", state="visible")

            # Initially, the overlay should be hidden (using class 'hidden')
            is_hidden_initially = page1.locator("#login-modal-overlay").evaluate("el => el.classList.contains('hidden')")
            if not is_hidden_initially:
                print(" -> [FAIL] Modal is NOT hidden initially.")

            # Click Login button
            page1.click("#login-modal")

            # Check if overlay is now visible (i.e., 'hidden' class is removed)
            is_hidden_after_click = page1.locator("#login-modal-overlay").evaluate("el => el.classList.contains('hidden')")
            if is_hidden_after_click:
                print(" -> [FAIL] Modal is still hidden after click.")
            else:
                print(" -> [PASS] Login Modal opens successfully.")

            # Click Close button
            page1.click("#close-login-modal")

            # Check if overlay is hidden again
            is_hidden_after_close = page1.locator("#login-modal-overlay").evaluate("el => el.classList.contains('hidden')")
            if not is_hidden_after_close:
                print(" -> [FAIL] Modal is NOT hidden after close.")
            else:
                print(" -> [PASS] Login Modal closes successfully.")

            # TEST 1b: Verify Start Quiz Button Widget Logic
            print("[TEST 1b] Checking Start Quiz Widget...")

            # We intercept navigation to quiz-engine.html to verify URL construction.
            nav_url = []
            def intercept_route(route):
                if 'quiz-engine.html' in route.request.url:
                    nav_url.append(route.request.url)
                    route.abort()
                else:
                    route.continue_()

            page1.route("**/*", intercept_route)

            # Click Start Quiz
            page1.click("#start-quiz-btn")
            page1.wait_for_timeout(1000) # give it a moment to catch route

            if len(nav_url) > 0 and 'board=Select' in nav_url[0]:
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
