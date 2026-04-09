const fs = require('fs');
let lensData = fs.readFileSync('js/persona-lens.js', 'utf-8');
lensData = lensData.replace('<button onclick="window.location.href=\'/app/consoles/student.html?grade=9\'" class="lens-btn bg-emerald-600">Student (9)</button>',
'<button onclick="window.location.href=\'/app/consoles/student.html?grade=9\'" class="lens-btn bg-emerald-600">Student (9)</button>\n        <button onclick="window.location.href=\'/app/consoles/student.html?grade=10\'" class="lens-btn bg-teal-600">Student (10)</button>\n        <button onclick="window.location.href=\'/app/consoles/student.html?grade=12\'" class="lens-btn bg-cyan-600">Student (12)</button>');
fs.writeFileSync('js/persona-lens.js', lensData);
