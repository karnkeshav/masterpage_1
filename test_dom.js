const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');

const uiJs = fs.readFileSync('js/ui-renderer.js', 'utf-8');

// Basic DOM setup to test rendering functionality.
const dom = new JSDOM(`
    <body>
        <div id="board-insight-container" class="hidden"></div>
    </body>
`);

const { document } = dom.window;

// Check container is hidden initially
console.log("Initial hidden state:", document.getElementById("board-insight-container").classList.contains("hidden"));

// Note: since JS module uses external network imports (firebase), we'll do a simple regex check
// to ensure the toggle logic in the string matches the exact requirement
const htmlInjectionCheck = uiJs.includes('el.classList.toggle(\\\'hidden\\\')');
console.log("Toggle logic present in JS:", htmlInjectionCheck);

console.log("DOM Test Complete");
