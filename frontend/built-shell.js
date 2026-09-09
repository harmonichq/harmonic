'use strict';

const { existsSync, readFileSync } = require('node:fs');
const { extname, join, resolve } = require('node:path');

// The disk-serving harness for the built surfaces, and the browser-side half of
// the Python route policy. The two must agree: a harness that serves a path the
// server does not is structurally blind to a missing route, which is why the
// page and asset sets below are the same closed sets ciq_autotune/api.py names.
const PAGE_PATHS = new Set(['/', '/day', '/diagnose', '/verify', '/plan', '/settings', '/guide']);
// #389: the v2 desk is one page path with its own fingerprinted asset prefix.
const V2_PAGE = '/v2/';
const V2_ASSET_PREFIX = '/v2/assets/';
const CONTENT_TYPES = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.json': 'application/json',
};

function createBuiltShell({
  dist = process.env.HARMONIC_DIST || join(__dirname, 'dist'),
  distV2 = process.env.HARMONIC_DIST_V2 || join(__dirname, '..', 'frontend-v2', 'dist'),
} = {}) {
  const root = resolve(dist);
  const index = join(root, 'index.html');
  if (!existsSync(index)) {
    throw new Error('frontend/dist/index.html is missing — run npm ci && npm run build');
  }
  const rootV2 = resolve(distV2);
  const indexV2 = join(rootV2, 'index.html');
  if (!existsSync(indexV2)) {
    throw new Error('frontend-v2/dist/index.html is missing — run npm ci && npm run build');
  }

  // Resolve a request to one file, and to the directory that request is allowed
  // to reach. An asset request is confined to its own `assets/` directory, not
  // merely to the build root: `/assets/../index.html` normalises inside the root
  // and would otherwise serve the shell from an asset URL the server 404s.
  function locate(pathname) {
    if (PAGE_PATHS.has(pathname)) return [index, root];
    if (pathname === V2_PAGE) return [indexV2, rootV2];
    if (pathname.startsWith(V2_ASSET_PREFIX)) {
      return [join(rootV2, pathname.slice(V2_PAGE.length)), join(rootV2, 'assets')];
    }
    if (pathname.startsWith('/assets/')) return [join(root, pathname), join(root, 'assets')];
    return [null, null];
  }

  function serve(pathname) {
    const [file, base] = locate(pathname);
    if (!file || !file.startsWith(`${base}/`) || !existsSync(file)) return null;
    return { body: readFileSync(file), contentType: CONTENT_TYPES[extname(file)] || 'application/octet-stream' };
  }

  return { serve };
}

module.exports = { createBuiltShell };
