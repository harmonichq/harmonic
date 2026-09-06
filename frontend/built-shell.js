'use strict';

const { existsSync, readFileSync } = require('node:fs');
const { extname, join, resolve } = require('node:path');

const PAGE_PATHS = new Set(['/', '/day', '/diagnose', '/verify', '/plan', '/settings', '/guide']);
const CONTENT_TYPES = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.json': 'application/json',
};

function createBuiltShell({ dist = process.env.HARMONIC_DIST || join(__dirname, 'dist') } = {}) {
  const root = resolve(dist);
  const index = join(root, 'index.html');
  if (!existsSync(index)) {
    throw new Error('frontend/dist/index.html is missing — run npm ci && npm run build');
  }

  function serve(pathname) {
    const file = PAGE_PATHS.has(pathname)
      ? index
      : pathname.startsWith('/assets/') ? join(root, pathname) : null;
    if (!file || !file.startsWith(`${root}/`) || !existsSync(file)) return null;
    return { body: readFileSync(file), contentType: CONTENT_TYPES[extname(file)] || 'application/octet-stream' };
  }

  return { serve };
}

module.exports = { createBuiltShell };
