const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// The click handler inside `custom-ui-logic` is:
//     const startQuizBtns = document.querySelectorAll('button');
//     let startQuizBtn;
//     startQuizBtns.forEach(btn => { ... });
//     if(startQuizBtn) { startQuizBtn.id = 'start-quiz-btn'; startQuizBtn.addEventListener(...) }

// But because there's also a form button, maybe it's finding the wrong one or not attaching correctly because we are doing this in the script dynamically after load?
// Let's completely rewrite the custom-ui-logic block to be clean and simple without document.querySelectorAll('button').

const cheerio = require('cheerio');
const $ = cheerio.load(html);

$('#custom-ui-logic').text(`
  document.addEventListener('DOMContentLoaded', () => {
    // Login Modal Toggle Logic (if modal still exists)
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
    const startQuizBtn = document.getElementById('start-quiz-btn');

    if(startQuizBtn) {
      startQuizBtn.addEventListener('click', () => {
        const selects = document.querySelectorAll('.form-select');
        const board = selects[0] ? selects[0].value : 'Unknown';
        const classVal = selects[1] ? selects[1].value.replace('Grade ', '') : '9';
        const subject = selects[2] ? selects[2].value : 'Unknown';
        const level = selects[3] ? selects[3].value : 'Simple';

        console.log('Button clicked! Target:', "./app/quiz-engine.html?board=" + encodeURIComponent(board));
        const targetUrl = "./app/quiz-engine.html?board=" + encodeURIComponent(board) +
                          "&class=" + encodeURIComponent(classVal) +
                          "&subject=" + encodeURIComponent(subject) +
                          "&difficulty=" + encodeURIComponent(level);

        window.location.href = targetUrl;
      });
    } else {
        console.error('Start Quiz button not found in DOM.');
    }
  });
`);

fs.writeFileSync('index.html', $.html(), 'utf8');
