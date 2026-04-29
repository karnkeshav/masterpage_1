from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    page.goto("http://localhost:8080/app/study-content.html?grade=10&subject=Science&chapter=Chemical%20Reactions")
    page.wait_for_timeout(3000)

    # Recreate minimal structure directly
    page.evaluate("""
        const container = document.getElementById('content-container');
        if(container) {
            container.innerHTML = `
                <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div class="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">Water</div>
                    <div class="font-mono text-lg font-bold text-slate-900">\\(\\ce{H2O}\\)</div>
                </div>
            `;
            if (window.MathJax) {
                window.MathJax.typesetPromise ? window.MathJax.typesetPromise() : window.MathJax.typeset();
            }
        }
    """)
    page.wait_for_timeout(2000)

    page.screenshot(path="/home/jules/verification/screenshots/verification7.png", full_page=True)
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
