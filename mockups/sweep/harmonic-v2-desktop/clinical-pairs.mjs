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
    for (const [side, path] of [['v2', '/v2/?to=diagnose'], ['v1', '/diagnose']]) {
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
        await page.goto(`http://127.0.0.1:8765${path}`);
        await page.getByRole('button', { name: '24 h', exact: true }).click();
        const row = page.locator(`#level .qrow[data-id^="${family}:"]`).first();
        await row.waitFor({ timeout: 60000 }); await row.click();
        await page.locator('#level .case-occurrence').first().waitFor({ timeout: 60000 });
        await page.locator('#tile-focal canvas').first().waitFor({ timeout: 60000 });
        assert.equal(errors.length, 0, errors.map(String).join('\n'));
        await captureStory(page, { directory: out, id: `clinical-${family}-${side}`, target: side,
          viewport: process.env.VIEWPORT, caseName });
      } finally { await context.close(); }
    }
    const common = [...seen.v1].filter(key => key.startsWith(endpoint) && seen.v2.has(key));
    assert.ok(common.length, `${family}: both compositions must consume the identical clinical response key`);
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
