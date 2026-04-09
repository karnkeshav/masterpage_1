const fs = require('fs');
let html = fs.readFileSync('app/study-content.html', 'utf8');

if (!html.includes('board-insight-container')) {
    html = html.replace('        <div id="content-container">\n            <!-- Dynamic Content -->\n        </div>', '        <div id="content-container">\n            <!-- Dynamic Content -->\n        </div>\n\n        <div id="board-insight-container" class="mt-12 w-full mx-auto hidden"></div>');
    fs.writeFileSync('app/study-content.html', html);
}
