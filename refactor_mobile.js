const fs = require('fs');
const cheerio = require('cheerio');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const stitchHtml = fs.readFileSync('stitch2.html', 'utf8');

const $index = cheerio.load(indexHtml);
const $stitch = cheerio.load(stitchHtml);

// Save things we want to keep
const loginOverlay = $index('#login-modal-overlay').parent().html() || $index('#login-modal-overlay')[0].outerHTML || '';
const customScript = $index('#custom-ui-logic')[0].outerHTML || '';

// Other scripts/elements to keep
const scriptsToKeep = [];
$index('body > script:not(#custom-ui-logic)').each((i, el) => {
    scriptsToKeep.push($index(el).toString());
});

const floatBtn = $index('.whatsapp-float').toString();

// Replace body with Stitch body
$index('body').html($stitch('body').html());
$index('body').attr('class', $stitch('body').attr('class'));

// Keep original head styles + new ones
$index('head style').last().append($stitch('head style').text());

// Add back what we saved
$index('body').append(loginOverlay);
$index('body').append(floatBtn);
scriptsToKeep.forEach(s => $index('body').append(s));
$index('body').append(customScript);

// Update logic hook IDs in the new DOM
// Login form trigger: Stitch doesn't have an ID for login button, let's find it.
// Actually, Stitch 2's generated design has the login INSIDE the main screen ("System Access" card).
// Let's replace the content of that card with the actual form or just use it as the form!

// Wait, the prompt said:
// "1. A clean 'System Access' card containing an Identity ID input, a Secure Passkey input, and an 'Authenticate & Bind' button"
// We don't need a modal anymore if it's directly on the page!

// Let's modify the new `System Access` card to have the correct form ID and input IDs so `auth-paywall.js` works directly.

const $systemAccessSection = $index('h3:contains("System Access")').closest('section');
if ($systemAccessSection.length) {
    // Add the form ID
    $systemAccessSection.find('.space-y-4').wrap('<form id="sovereign-login-form"></form>');

    const inputs = $systemAccessSection.find('input');
    // First input is Identity ID
    if (inputs.length >= 1) $index(inputs[0]).attr('id', 'username');
    // Second input is Password
    if (inputs.length >= 2) $index(inputs[1]).attr('id', 'password');

    // The button needs type="submit"
    const submitBtn = $systemAccessSection.find('button:contains("Authenticate & Bind")');
    if (submitBtn.length) {
        submitBtn.attr('type', 'submit');
    }

    // Add error box
    $systemAccessSection.find('form').append('<div id="login-error" class="hidden text-red-400 text-xs font-bold text-center bg-red-900/20 p-2 rounded mt-2"></div>');
}

// Remove the old modal overlay if it exists, since we now have inline login.
$index('#login-modal-overlay').remove();

// Update "Selection Engine" button ID
const startQuizBtn = $index('button:contains("Start Quiz")');
if (startQuizBtn.length) {
    startQuizBtn.attr('id', 'start-quiz-btn');
}

// Ensure the "Board not listed" link is an actual mailto link
const boardLink = $index('a:contains("Board not listed")');
if (boardLink.length) {
    boardLink.attr('href', 'mailto:ready4urexam@gmail.com');
}

fs.writeFileSync('index.html', $index.html(), 'utf8');
console.log('Mobile refactor complete');
