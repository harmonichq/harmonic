#!/usr/bin/env node
/**
 * #317 before/after renders — the same six states palette-diff.mjs compares,
 * captured from the ticket base and the revision at 1440×900, 1280×800 and
 * 390×844. Each state is reached exactly as the diff reaches it (same path,
 * same readiness root, same drawer handling), so a render and a diff line name
 * the same thing. The Verify ribbon is canvas and the synthetic database holds
 * no Trial, so its renders come through verify-trial-opener.mjs instead.
 *
 *   BASE_URL_BASE=http://127.0.0.1:8318 BASE_URL_REVISION=http://127.0.0.1:8317 \
 *   OUT_DIR=openspec/changes/graphite-palette/evidence/renders \
 *   PLAYWRIGHT_MODULE=$PW/node_modules/playwright VENDOR_DIR=$VENDOR \
 *   node openspec/changes/graphite-palette/evidence/render-states.mjs
 *
 * Fails closed on a missing driver, vendored asset, environment variable or
 * readiness root, naming what is absent. Writes <state>-<w>x<h>-<side>.png.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const missing = [];
const env = (name) => process.env[name] || (missing.push(`${name} is unset`), null);
const PLAYWRIGHT_MODULE = env('PLAYWRIGHT_MODULE');
const VENDOR_DIR = env('VENDOR_DIR');
const OUT_DIR = env('OUT_DIR');
const sides = { base: env('BASE_URL_BASE'), revision: env('BASE_URL_REVISION') };
for (const [side, raw] of Object.entries(sides)) {
  if (!raw) continue;
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) missing.push(`BASE_URL_${side.toUpperCase()} must name localhost`);
}
if (VENDOR_DIR) for (const asset of ['vue.esm-browser.js', 'echarts.min.js']) {
  if (!existsSync(join(VENDOR_DIR, asset))) missing.push(`VENDOR_DIR is missing ${asset}`);
}
if (missing.length) { console.error(`render-states.mjs cannot run:\n  - ${missing.join('\n  - ')}`); process.exit(1); }
const { chromium } = require(PLAYWRIGHT_MODULE);

const STATES = [
  { id: 'shell', tab: 'diagnose', path: '/', ready: '.cockpit-shell' },
  { id: 'shell-drawer', tab: 'diagnose', path: '/', ready: '.cockpit-shell', drawer: true },
  { id: 'diagnose', tab: 'diagnose', path: '/diagnose', ready: '.dw' },
  { id: 'verify', tab: 'verify', path: '/verify', ready: '.vw' },
  { id: 'day', tab: 'day', path: '/day', ready: '.ds-root' },
  { id: 'plan', tab: 'plan', path: '/plan', ready: '.active-profile-ref' },
];
const VIEWPORTS = [[1440, 900], [1280, 800], [390, 844]];
const CDN = new Map([
  ['https://unpkg.com/vue@3/dist/vue.esm-browser.js', 'vue.esm-browser.js'],
  ['https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js', 'echarts.min.js'],
]);
const vendored = new Map();
async function vendorBody(file) {
  if (!vendored.has(file)) vendored.set(file, await readFile(join(VENDOR_DIR, file)));
  return vendored.get(file);
}

const out = resolve(OUT_DIR);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
let written = 0;
try {
  for (const [side, raw] of Object.entries(sides)) {
    const origin = new URL(raw);
    for (const state of STATES) {
      for (const [width, height] of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204 });
          const asset = CDN.get(url.href.split('?')[0]);
          if (asset) return route.fulfill({ body: await vendorBody(asset), contentType: 'text/javascript' });
          if (url.origin === origin.origin) return route.continue();
          return route.abort();
        });
        await page.addInitScript(({ tab }) => {
          localStorage.setItem('ciq_token', 'render-states');
          localStorage.setItem('tab', tab);
        }, { tab: state.tab });
        await page.goto(new URL(state.path, origin).href);
        await page.locator(state.ready).waitFor({ timeout: 20_000 });
        if (state.drawer) {
          const trigger = page.locator('.cockpit-menu-button');
          if (await trigger.isVisible()) {
            await trigger.click();
            await page.locator('.cockpit-drawer').waitFor({ timeout: 10_000 });
          }
        }
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(1200);
        const file = join(out, `${state.id}-${width}x${height}-${side}.png`);
        await page.screenshot({ path: file });
        written += 1;
        console.log(`wrote ${file}`);
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
if (written !== Object.keys(sides).length * STATES.length * VIEWPORTS.length) {
  console.error(`render-states.mjs wrote ${written} renders, expected ${2 * STATES.length * VIEWPORTS.length}`);
  process.exit(1);
}
console.log(`${written} renders written`);
