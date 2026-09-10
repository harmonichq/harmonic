// Shared shipped clinical renderer vs v2 composition, fed identical response bytes.
// These are synthetic evidence artifacts, not independent fidelity verdicts.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaseServer } from '../../../frontend-v2/replay-cases.mjs';
import { captureStory } from '../../../frontend-v2/capture.mjs';
const require = createRequire(import.meta.url);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
// v1 gates Diagnose on its browser token even when the synthetic server uses
// --token ''. Both shells mount the same owner's #seg-window / #level controls.
export async function openClinicalConsumer(page, side, family) {
  assert.ok(['v1', 'v2'].includes(side), 'clinical consumer must be v1 or v2');
  assert.ok(['basal', 'isf', 'ic'].includes(family), 'clinical family must be basal, isf or ic');
  await page.addInitScript(() => {
    localStorage.setItem('ciq_token', 'synthetic-clinical-pair');
    localStorage.setItem('tab', 'diagnose');
  });
  await page.goto(`http://127.0.0.1:8765${side === 'v2' ? '/v2/?to=diagnose' : '/diagnose'}`);
  await page.locator('#level[data-loading="false"]').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#seg-window').getByRole('button', { name: '24 h', exact: true }).click();
  await page.locator('#level[data-loading="false"]').waitFor({ state: 'visible', timeout: 60000 });
  const response = await page.request.get('http://127.0.0.1:8765/api/diagnose/findings', { timeout: 60000 });
  assert.ok(response.ok(), `clinical ${family} findings: HTTP ${response.status()}`);
  const projection = await response.json();
  const parameter = { basal: 'basal_rate', isf: 'isf', ic: 'carb_ratio' }[family];
  // IDs belong to the projection: ISF is "isf", without a colon or slot suffix.
  const finding = projection.rows.find(row => row.parameter === parameter && row.register !== 'history');
  assert.ok(finding, `the 24 h findings projection has no current ${family} row`);
  if (finding.register === 'held' || finding.register === 'blind') {
    const watching = page.locator('#level .qcollapse');
    await watching.waitFor({ state: 'visible', timeout: 60000 });
    if (await watching.getAttribute('aria-expanded') !== 'true') await watching.click();
  }
  const id = finding.id;
  const row = page.locator(`#level .qrow[data-id=${JSON.stringify(id)}]`);
  await row.waitFor({ timeout: 60000 });
  await row.click();
  // Basal has a supporting-night roster; the ISF and I:C owners expose their
  // served numeric evidence instead of a prototype occurrence list.
  await page.locator(family === 'basal' ? '#level .case-occurrence' : '#level .numrow').first().waitFor({ timeout: 60000 });
  await page.locator(`#tile-focal .evidence-tile[data-chart-id="${id}"] canvas`).first().waitFor({ timeout: 60000 });
}

export function sharedClinicalKeys(seen, endpoint) {
  const clinical = side => [...seen[side]].filter(key => key.split('?')[0] === endpoint);
  for (const side of ['v1', 'v2']) assert.ok(clinical(side).length, `${side} did not consume ${endpoint}`);
  const common = clinical('v1').filter(key => seen.v2.has(key));
  assert.ok(common.length, `both compositions must consume the identical clinical response key: ${endpoint}`);
  return common;
}

export async function main() {
  const out = resolve(process.env.CAPTURE_DIR || '');
  assert.ok(process.env.CAPTURE_DIR && !out.startsWith(repo + '/'), 'CAPTURE_DIR must name fresh external scratch');
  const [width, height] = (process.env.VIEWPORT || '').split('x').map(Number);
  assert.ok([[1280, 720], [1440, 900]].some(([w, h]) => w === width && h === height), 'VIEWPORT must be a locked desktop size');
  const viewport = { width, height };
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
  await mkdir(out, { recursive: false });
  const server = createCaseServer({ directory: join(out, 'stores'), repo });
  const browser = await chromium.launch();
  const font = await readFile(join(repo, 'frontend-v2/fonts/inter.css'));
  try {
    for (const [family, caseName, endpoint] of [
      ['basal', 'basal-lower', '/api/diagnose/basal-night-evidence'],
      ['isf', 'isf-strengthen', '/api/diagnose/isf-rest-window-evidence'],
      ['ic', 'ic-lower', '/api/diagnose/carb-ratio-block-evidence'],
    ]) {
      await server.start(`clinical-${family}`, caseName);
      const cache = new Map(); const seen = { v1: new Set(), v2: new Set() }; const errors = [];
      for (const side of ['v2', 'v1']) {
        const context = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce' });
        try {
          await context.route('**/*', async route => {
            try {
              const request = route.request(); const url = new URL(request.url());
              if (url.hostname === 'fonts.googleapis.com') return await route.fulfill({ body: font, contentType: 'text/css' });
              if (url.origin !== 'http://127.0.0.1:8765') throw new Error(`external request: ${url.href}`);
              if (!url.pathname.startsWith('/api/')) return await route.continue();
              assert.equal(request.method(), 'GET', 'clinical pairing is read-only');
              url.searchParams.sort(); const key = url.pathname + url.search;
              if (!cache.has(key)) cache.set(key, (async () => {
                const response = await route.fetch({ timeout: 60000 });
                assert.equal(response.status(), 200, `${key}: ${response.status()}`);
                const body = await response.body();
                return { body, contentType: 'application/json', status: 200 };
              })());
              const response = await cache.get(key); seen[side].add(key);
              await route.fulfill(response);
            } catch (error) { errors.push(error); await route.abort(); }
          });
          const page = await context.newPage();
          await openClinicalConsumer(page, side, family);
          assert.ok([...seen[side]].some(key => key.split('?')[0] === endpoint), `${side} did not consume ${endpoint}`);
          assert.equal(errors.length, 0, errors.map(String).join('\n'));
          await captureStory(page, { directory: out, id: `clinical-${family}-${side}`, target: side,
            viewport: process.env.VIEWPORT, caseName });
        } finally { await context.close(); }
      }
      const common = sharedClinicalKeys(seen, endpoint);
      const proof = [];
      for (const [index, key] of common.entries()) {
        const { body } = await cache.get(key); const filename = `${family}-response-${index}.json`;
        await writeFile(join(out, filename), body);
        proof.push({ key, filename, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex'), consumers: ['v1', 'v2'] });
      }
      await writeFile(join(out, `${family}-pairs.json`), JSON.stringify({ synthetic: true, caseName, viewport,
        source: 'shipped v1 clinical renderer', target: 'v2 composition', identical_responses: proof }, null, 2));
      process.stdout.write(`PAIRED ${family}: ${common.length} identical clinical response(s)\n`);
    }
  } finally { await browser.close(); await server.stop(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
