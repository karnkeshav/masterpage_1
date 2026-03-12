const fs = require('fs');
const cheerio = require('cheerio');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const stitchHtml = fs.readFileSync('stitch.html', 'utf8');

const $index = cheerio.load(indexHtml);
const $stitch = cheerio.load(stitchHtml);

// 1. Extract the new layout from stitch.html
const newLayout = $stitch('.flex.h-screen').html();

// 2. Extract the existing login form from index.html
const form = $index('#sovereign-login-form');
const existingLoginForm = form.parent().html();

// 3. Replace the `.split-layout` in index.html with the new layout
$index('.split-layout').replaceWith(`<div class="flex h-screen w-full flex-col lg:flex-row">${newLayout}</div>`);

// Ensure we don't accidentally duplicate
$index('#login-modal-overlay').remove();

// 4. Update Header "Login" button ID and Modal Logic
$index('body').append(`
<div id="login-modal-overlay" class="modal-backdrop hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
  <div class="relative w-full max-w-md p-6">
    <button id="close-login-modal" class="absolute top-4 right-4 text-white/50 hover:text-white text-2xl font-bold">&times;</button>
    ${existingLoginForm}
  </div>
</div>
`);

// Ensure the new CSS styles from stitch.html are in the <head>
const stitchStyles = $stitch('style').html();
$index('head').append(`<style>${stitchStyles}</style>`);

// Add custom logic script at the end of body
$index('body').append(`
<script id="custom-ui-logic">
  document.addEventListener('DOMContentLoaded', () => {
    // Login Modal Toggle Logic
    const loginBtn = document.getElementById('login-modal');
    const modalOverlay = document.getElementById('login-modal-overlay');
    const closeBtn = document.getElementById('close-login-modal');

    if(loginBtn && modalOverlay) {
      loginBtn.addEventListener('click', () => {
        modalOverlay.classList.remove('hidden');
      });
    }

    if(closeBtn && modalOverlay) {
      closeBtn.addEventListener('click', () => {
        modalOverlay.classList.add('hidden');
      });
    }

    // Selection Widget Logic
    const startQuizBtns = document.querySelectorAll('button');
    let startQuizBtn;
    startQuizBtns.forEach(btn => {
      if(btn.textContent.includes('Start Quiz')) {
        startQuizBtn = btn;
      }
    });

    if(startQuizBtn) {
      startQuizBtn.id = 'start-quiz-btn';
      startQuizBtn.addEventListener('click', () => {
        const selects = document.querySelectorAll('.form-select');
        const board = selects[0] ? selects[0].value : 'Unknown';
        const classVal = selects[1] ? selects[1].value.replace('Grade ', '') : '9';
        const subject = selects[2] ? selects[2].value : 'Unknown';
        const level = selects[3] ? selects[3].value : 'Simple';

        const targetUrl = "./app/quiz-engine.html?board=" + encodeURIComponent(board) +
                          "&class=" + encodeURIComponent(classVal) +
                          "&subject=" + encodeURIComponent(subject) +
                          "&difficulty=" + encodeURIComponent(level);

        window.location.href = targetUrl;
      });
    }
  });
</script>
`);

$index('header.bg-cbse-blue').remove();

const stitchBodyClasses = $stitch('body').attr('class');
$index('body').attr('class', stitchBodyClasses);

if ($stitch('html').hasClass('dark')) {
  $index('html').addClass('dark');
}

fs.writeFileSync('index.html', $index.html(), 'utf8');
console.log('Successfully refactored index.html');
