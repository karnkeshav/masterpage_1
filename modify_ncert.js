const fs = require('fs');
let content = fs.readFileSync('js/ncert-renderer.js', 'utf8');
content = content.replace('    renderDynamicContent(container, data, subject);', '    renderDynamicContent(container, data, subject);\n    UI.renderBoardInsights(grade, subject, chapter, document.getElementById(\'board-insight-container\'));');
fs.writeFileSync('js/ncert-renderer.js', content);
