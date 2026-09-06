// #347 spike — does the shell built by 347-vite-build.spike.sh MOUNT against the
// real no-fetch app? Serves that spike's dist from disk through page.route and
// lets /api/* reach BASE_URL (the QA copy-then-serve command in AGENTS.md).
//
//   PLAYWRIGHT_MODULE=<playwright> BASE_URL=http://127.0.0.1:8791 \
//   DIST=<scratch>/proj/frontend/dist node docs/scope/347-built-shell-mount.spike.mjs
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fail = (m) => { console.error(m); process.exit(1); };
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || fail('PLAYWRIGHT_MODULE is required'));
const DIST = process.env.DIST || fail('DIST is required (the build spike\'s frontend/dist)');
const BASE = process.env.BASE_URL || fail('BASE_URL is required (the no-fetch app)');
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = []; const external = [];
page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
page.on('request', (r) => { const u = new URL(r.url()); if (u.origin !== BASE && !u.hostname.startsWith('fonts.')) external.push(r.url()); });
await page.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.hostname.startsWith('fonts.')) return route.abort();
  if (u.pathname.startsWith('/api/')) return route.continue();
  const file = u.pathname.startsWith('/assets/') ? join(DIST, u.pathname) : join(DIST, 'index.html');
  try { return route.fulfill({ body: await readFile(file), contentType: MIME[extname(file)] || 'text/html' }); }
  catch { return route.fulfill({ status: 404, body: 'missing ' + u.pathname }); }
});
await page.addInitScript(() => { localStorage.setItem('ciq_token', 'spike'); localStorage.setItem('tab', 'diagnose'); });
for (const path of ['/diagnose', '/day', '/plan', '/verify']) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => ({
    path: location.pathname,
    echartsGlobal: typeof window.echarts?.init,
    mustachesLeft: /\{\{[^}]+\}\}/.test(document.body.innerText),
    dwMounted: !!document.querySelector('.dw'),
    canvases: document.querySelectorAll('canvas').length,
    bodyChars: document.body.innerText.length,
    title: document.title, text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 160),
  }));
  console.log(JSON.stringify(state));
}
console.log('external requests (want none):', external.length, external.slice(0, 3));
console.log('errors:', errors.length, [...new Set(errors)].slice(0, 6));
await browser.close();
