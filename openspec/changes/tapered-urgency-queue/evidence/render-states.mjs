#!/usr/bin/env node
/**
 * Render one side of #302's Diagnose queue matrix from the live QA showcase.
 * The localhost server supplies both the app and its API responses; only the
 * two shipping CDN modules are replaced with the repository's browser-gate
 * copies. CHECKOUT_ROOT is verified against an asset served by BASE_URL so a
 * base render cannot silently use revision frontend bytes (or vice versa).
 *
 *   PLAYWRIGHT_MODULE=<playwright> VENDOR_DIR=<vendor> TARGET=app \
 *   CHECKOUT_ROOT=<checkout> BASE_URL=http://127.0.0.1:<port> \
 *   OUT=<evidence/renders> LABEL=before|after \
 *   node openspec/changes/tapered-urgency-queue/evidence/render-states.mjs
 *
 * Writes LABEL-STATE-WIDTHxHEIGHT.png for the four states and five viewports
 * pinned in design.md. Fails closed on missing inputs, a mixed checkout/server,
 * a bad response, a browser error, an unreachable state, or a partial matrix.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const missing = [];
const env = (name) => process.env[name] || (missing.push(`${name} is unset`), null);
const playwrightModule = env('PLAYWRIGHT_MODULE');
const vendorDir = env('VENDOR_DIR');
const checkoutRoot = env('CHECKOUT_ROOT');
const baseUrl = env('BASE_URL');
const outDir = env('OUT');
const label = env('LABEL');
if (process.env.TARGET !== 'app') missing.push(`TARGET must be app, got ${process.env.TARGET || '(unset)'}`);
if (label && !['before', 'after'].includes(label)) missing.push(`LABEL must be before or after, got ${label}`);
let origin;
if (baseUrl) {
  try { origin = new URL(baseUrl); } catch { missing.push(`BASE_URL=${baseUrl} is not a URL`); }
  if (origin && !['127.0.0.1', 'localhost'].includes(origin.hostname)) {
    missing.push('BASE_URL must name localhost');
  }
}
if (vendorDir) for (const asset of ['vue.esm-browser.js', 'echarts.min.js']) {
  if (!existsSync(join(vendorDir, asset))) missing.push(`VENDOR_DIR is missing ${asset}`);
}
if (checkoutRoot && !existsSync(join(checkoutRoot, 'frontend/diagnose-findings-queue.js'))) {
  missing.push('CHECKOUT_ROOT does not contain frontend/diagnose-findings-queue.js');
}
if (missing.length) {
  console.error(`render-states.mjs cannot run:\n  - ${missing.join('\n  - ')}`);
  process.exit(1);
}

const servedQueue = await fetch(new URL('/assets/diagnose-findings-queue.js', origin));
if (!servedQueue.ok) throw new Error(`served queue asset returned ${servedQueue.status}`);
const [servedSource, checkoutSource] = await Promise.all([
  servedQueue.text(),
  readFile(join(checkoutRoot, 'frontend/diagnose-findings-queue.js'), 'utf8'),
]);
if (servedSource !== checkoutSource) {
  throw new Error('BASE_URL frontend does not match CHECKOUT_ROOT');
}

const { chromium } = require(playwrightModule);
const cdn = new Map([
  ['https://unpkg.com/vue@3/dist/vue.esm-browser.js', 'vue.esm-browser.js'],
  ['https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js', 'echarts.min.js'],
]);
const vendored = new Map();
async function vendorBody(file) {
  if (!vendored.has(file)) vendored.set(file, await readFile(join(vendorDir, file)));
  return vendored.get(file);
}

const viewports = [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [390, 844]];
const stateNames = ['queue-root', 'watching-expanded', 'drill-compact', 'drill-tail'];
const settleQueue = async (page) => {
  await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false');
  await page.waitForTimeout(700);
};
const drill = async (page, id) => {
  const row = page.locator(`#level .qrow[data-id="${id}"]`);
  if (await row.count() !== 1) throw new Error(`expected one queue row ${id}`);
  await row.click();
  await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false'
    && !document.querySelector('#level .qrow'));
  await page.waitForTimeout(700);
  const focalId = await page.locator('#tile-focal .evidence-tile').getAttribute('data-chart-id');
  if (focalId !== id) throw new Error(`drilling ${id} seated ${focalId || '(no chart)'}`);
};
const states = {
  'queue-root': async () => {},
  'watching-expanded': async (page) => {
    const toggle = page.locator('#level .qcollapse');
    if (await toggle.count() !== 1) throw new Error('expected one Watching disclosure');
    await toggle.click();
    const history = page.locator('#level .qrow[data-state="history"]');
    await history.waitFor();
    await history.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  },
  'drill-compact': (page) => drill(page, 'finding:over_treated_low'),
  'drill-tail': (page) => drill(page, 'finding:correction_on_iob'),
};

const out = resolve(outDir);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
let rendered = 0;
try {
  for (const [width, height] of viewports) {
    for (const name of stateNames) {
      const page = await browser.newPage({ viewport: { width, height } });
      const problems = [];
      page.on('pageerror', (error) => problems.push(`pageerror: ${error}`));
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(`console: ${message.text()}`);
      });
      page.on('response', (response) => {
        if (response.status() >= 400) problems.push(`response: ${response.status()} ${response.url()}`);
      });
      try {
        await page.route('**/*', async (route) => {
          const url = new URL(route.request().url());
          if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204 });
          const asset = cdn.get(url.href.split('?')[0]);
          if (asset) return route.fulfill({ body: await vendorBody(asset), contentType: 'text/javascript' });
          if (url.origin === origin.origin) return route.continue();
          return route.abort();
        });
        await page.addInitScript(() => {
          localStorage.setItem('ciq_token', 'render-states');
          localStorage.setItem('tab', 'diagnose');
        });
        await page.goto(new URL('/diagnose', origin).href);
        await page.locator('.dw').waitFor({ timeout: 20_000 });
        await page.getByRole('button', { name: '24 h', exact: true }).click();
        await settleQueue(page);
        if (await page.locator('#level .qrow[data-id="basal:180-240"]').count() !== 1) {
          throw new Error('24 h showcase queue did not render basal:180-240');
        }
        await states[name](page);
        if (problems.length) throw new Error(problems.join('\n'));
        const file = join(out, `${label}-${name}-${width}x${height}.png`);
        await page.screenshot({ path: file, fullPage: false });
        rendered += 1;
        console.log(`rendered ${file}`);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
const expected = viewports.length * stateNames.length;
if (rendered !== expected) throw new Error(`${label}: rendered ${rendered}, expected ${expected}`);
console.log(`${label}: ${rendered} renders`);
