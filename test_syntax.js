const fs = require('fs');
const content = fs.readFileSync('js/admin-console.js', 'utf8');
const acorn = require('acorn');
try {
  acorn.parse(content, { sourceType: 'module', ecmaVersion: 2020 });
  console.log('Syntax OK');
} catch(e) {
  console.error('Syntax Error:', e.message);
}
