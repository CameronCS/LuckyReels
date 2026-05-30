'use strict';
require('dotenv').config();
const http = require('http');
const fs   = require('fs');
const path = require('path');

const db                             = require('./lib/db');
const { setupWS, gracefulShutdown } = require('./lib/ws');

const PORT = process.env.PORT || 3000;
const DIR  = path.join(__dirname, 'public');

// ── MIME + security headers ────────────────────────────────────────
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "connect-src 'self'",
  "img-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

// ── Static file server ─────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url      = req.url.split('?')[0];
  const filePath = path.join(DIR, url === '/' ? 'index.html' : url);
  const relative = path.relative(DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  const ext      = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const headers = { 'Content-Type': MIME[ext] || 'text/plain', 'X-Content-Type-Options': 'nosniff' };
    if (ext === '.html') {
      headers['Content-Security-Policy'] = CSP;
      headers['X-Frame-Options']         = 'DENY';
      headers['Referrer-Policy']         = 'strict-origin-when-cross-origin';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

setupWS(server);

server.listen(PORT, () => {
  console.log(`\nLucky Reels → http://localhost:${PORT}`);
  console.log(`Admin panel  → http://localhost:${PORT}/admin.html\n`);
});

// ── Graceful shutdown ──────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n${signal} — shutting down gracefully...`);
  gracefulShutdown(server);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
