const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff2':'font/woff2',
    '.woff': 'font/woff',
};

// Serve the entire repo root as a static site.
// The repo root is one level up from this testing_tool directory.
const ROOT = path.join(__dirname, '..');

const server = http.createServer((req, res) => {
    // Strip query strings and decode URI
    const urlPath = decodeURIComponent(req.url.split('?')[0]);

    // Default to index.html for root
    const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

    // Security: prevent path traversal outside ROOT
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`404 Not Found: ${urlPath}`);
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(8080, () => {
    console.log(`Static server running on http://localhost:8080 (root: ${ROOT})`);
});

module.exports = { server };
