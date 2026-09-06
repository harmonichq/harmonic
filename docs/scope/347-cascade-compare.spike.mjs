// #347 spike — does building the shell change the rendered cascade? Vite hoists
// the five stylesheet links that precede the inline <style> blocks into one CSS
// chunk injected after them. Render the SOURCE shell (served from frontend/ with
// the CDN modules routed to VENDOR_DIR) and the BUILT shell (from DIST) against
// the same no-fetch app, and compare every element's computed style on the four
// surfaces. Fonts are aborted on both sides.
//
//   PLAYWRIGHT_MODULE=<playwright> VENDOR_DIR=<vendored vue+echarts> \
//   BASE_URL=http://127.0.0.1:8791 DIST=<build spike's frontend/dist> \
//   node docs/scope/347-cascade-compare.spike.mjs
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const fail = (m) => { console.error(m); process.exit(1); };
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || fail('PLAYWRIGHT_MODULE is required'));
const VENDOR = process.env.VENDOR_DIR || fail('VENDOR_DIR is required');
const DIST = process.env.DIST || fail('DIST is required');
const BASE = process.env.BASE_URL || fail('BASE_URL is required');
const FRONTEND = fileURLToPath(new URL('../../frontend/', import.meta.url));
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const PAGES = ['/diagnose', '/day', '/plan', '/verify'];

async function routeSide(page, side) {
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname.startsWith('fonts.')) return route.abort();
    if (u.pathname.startsWith('/api/')) return route.continue();
    if (u.href.includes('unpkg.com/vue')) return route.fulfill({ body: await readFile(join(VENDOR, 'vue.esm-browser.js')), contentType: 'text/javascript' });
    if (u.href.includes('echarts')) return route.fulfill({ body: await readFile(join(VENDOR, 'echarts.min.js')), contentType: 'text/javascript' });
    const root = side === 'source' ? FRONTEND : DIST;
    const rel = u.pathname.startsWith('/assets/') ? (side === 'source' ? u.pathname.slice('/assets/'.length) : u.pathname) : 'index.html';
    try { return route.fulfill({ body: await readFile(join(root, rel)), contentType: MIME[extname(rel)] || 'text/html' }); }
    catch { return route.fulfill({ status: 404, body: 'missing ' + u.pathname }); }
  });
  await page.addInitScript(() => { localStorage.setItem('ciq_token', 'spike'); localStorage.setItem('tab', 'diagnose'); });
}

const snapshot = () => [...document.querySelectorAll('body *')].map((el) => {
  const cs = getComputedStyle(el);
  const props = {};
  for (let i = 0; i < cs.length; i += 1) { const p = cs[i]; props[p] = cs.getPropertyValue(p); }
  return { key: `${el.tagName}#${el.id}.${el.className && el.className.baseVal === undefined ? el.className : ''}`, props };
});

const browser = await chromium.launch();
let totalDiff = 0;
for (const path of PAGES) {
  const sides = {};
  for (const side of ['source', 'built']) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await routeSide(page, side);
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    sides[side] = await page.evaluate(snapshot);
    await page.close();
  }
  const a = sides.source; const b = sides.built;
  const n = Math.min(a.length, b.length);
  const diffs = [];
  for (let i = 0; i < n; i += 1) {
    if (a[i].key !== b[i].key) { diffs.push({ i, key: [a[i].key, b[i].key], prop: '(element order)' }); continue; }
    for (const p of Object.keys(a[i].props)) {
      if (a[i].props[p] !== b[i].props[p]) diffs.push({ i, key: a[i].key, prop: p, source: a[i].props[p], built: b[i].props[p] });
    }
  }
  totalDiff += diffs.length + Math.abs(a.length - b.length);
  console.log(JSON.stringify({ path, elements: { source: a.length, built: b.length }, differingProperties: diffs.length, sample: diffs.slice(0, 8) }));
}
console.log('TOTAL DIFFERENCES:', totalDiff);
await browser.close();
