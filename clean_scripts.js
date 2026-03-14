const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('index.html', 'utf8');
const $ = cheerio.load(html);

// Remove duplicate script blocks
const scripts = new Set();
$('script:not([src])').each((i, el) => {
    const text = $(el).html();
    if (scripts.has(text)) {
        $(el).remove();
    } else {
        scripts.add(text);
    }
});

fs.writeFileSync('index.html', $.html(), 'utf8');
