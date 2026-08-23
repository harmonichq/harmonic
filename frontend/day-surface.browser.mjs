// Browser-level lifecycle coverage for the keyed Day surface. This deliberately
// uses the real Vue app and browser fetches rather than evaluating index.html or
// calling component hooks: the surface must not mount until /api/status has clamped
// a cold route date to the available pump-data bounds.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createBrowserRunner } = require('./browser-runner.js');
const FRONTEND = fileURLToPath(new URL('.', import.meta.url));
const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript' };

// #554: one Chromium process for the whole command; each subtest still gets
// its own fresh page (== fresh Playwright context) via runner.browser().
const runner = createBrowserRunner(() => chromium.launch());
after(() => runner.close());

function fixtureServer(days = [], { readDelay = 0 } = {}) {
  const timelineRequests = [];
  const missingRequests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (body, delay = 0) => setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    }, delay);

    if (url.pathname === '/api/status') {
      // Keep status pending long enough to reproduce the cold-hash race.
      json({ earliest_data_day: '2026-07-05', latest_data_day: '2026-07-13' }, 100);
      return;
    }
    if (url.pathname === '/api/timeline') {
      timelineRequests.push(url.searchParams.get('start'));
      // readDelay keeps the per-day reads in flight long enough that stepping
      // to the next day has to CANCEL them (the #387 flood-abort path).
      json({ cgm: [], boluses: [], basal: [], pump_events: [], sleep_windows: [] }, readDelay);
      return;
    }
    if (url.pathname === '/api/model-view') {
      json({ episodes: [], window: { cgm: [] } }, readDelay);
      return;
    }
    if (url.pathname === '/api/carbs') { json([], readDelay); return; }
    if (url.pathname === '/api/prompts') { json([]); return; }
    if (url.pathname === '/api/day-navigator') { json({ days }); return; }
    if (url.pathname === '/api/credentials' || url.pathname === '/api/pump-settings') {
      json({ configured: false });
      return;
    }
    if (url.pathname === '/api/plan') { json({ items: [] }); return; }
    if (url.pathname === '/api/plan/history') { json({ history: [] }); return; }
    if (url.pathname === '/api/backtest') { json({}); return; }
    if (url.pathname === '/api/analyze') {
      json({ basal: [], isf: [], ic: [], behavioral: [], epochs: [], settling: {} });
      return;
    }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }

    const file = url.pathname === '/' || url.pathname === '/day'
      ? 'index.html' : url.pathname.replace(/^\/assets\//, '');
    try {
      const body = await readFile(join(FRONTEND, file));
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      missingRequests.push(url.pathname);
      res.writeHead(404); res.end('not found');
    }
  });
  return { server, timelineRequests, missingRequests };
}

test('a cold Day hash mounts only the status-clamped day and fetches its timeline once', async () => {
  const { server, timelineRequests, missingRequests } = fixtureServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const browser = await runner.browser();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => localStorage.setItem('ciq_token', 'fixture-token'));

  try {
    await page.goto(`http://127.0.0.1:${port}/day?date=2026-07-19`);
    await page.waitForSelector('.ds-root');
    await page.waitForTimeout(150);

    assert.deepEqual(timelineRequests, ['2026-07-13T00:00:00']);
    assert.equal(await page.locator('.dn-sel-date').textContent(), 'Jul 13');
    assert.deepEqual(missingRequests, []);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('rapid back-navigation cancels the days stepped through, not just the one landed on', async () => {
  // #387: mashing ‹ used to fire an uncancelled batch of reads for EVERY day
  // passed through, flooding the single worker and freezing the app. With the
  // per-day AbortController, leaving a day aborts its in-flight reads, so a fast
  // walk-back leaves only the landed day's reads to complete.
  const days = ['2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13']
    .map((iso) => ({ iso, has_data: true, lows: 0, highs: 0, tir: 70,
      curve: [{ x: 0, bg: 100 }, { x: 1, bg: 100 }] }));
  // 400ms read delay: the reads for each day are still in flight as we step past it.
  const { server } = fixtureServer(days, { readDelay: 400 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const browser = await runner.browser();
  const page = await browser.newPage();
  const errors = [];
  const aborted = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (req) => {
    const path = new URL(req.url()).pathname;
    if (/^\/api\/(timeline|model-view|carbs)$/.test(path)
        && /ERR_ABORTED/.test(req.failure()?.errorText || '')) {
      aborted.push(path);
    }
  });
  await page.addInitScript(() => localStorage.setItem('ciq_token', 'fixture-token'));

  try {
    await page.goto(`http://127.0.0.1:${port}/day?date=2026-07-13`);
    await page.waitForSelector('.ds-root');
    const prev = page.locator('.dn-daynav button[title="Previous day with data"]');
    await prev.waitFor();
    // Step Jul 13 → 09 faster than the 400ms reads can settle: each step remounts
    // the keyed surface, and the outgoing day's in-flight reads must abort.
    for (let i = 0; i < 4; i++) await prev.click();
    await page.waitForTimeout(700);  // let the abort fire and the landed day settle

    // The days stepped through had their reads cancelled (never completed).
    assert.ok(aborted.length >= 1, `expected stepped-through reads to abort, got ${JSON.stringify(aborted)}`);
    // Landed on the earliest day, rendered without an error flash from the aborts.
    assert.equal(await page.locator('.dn-sel-date').textContent(), 'Jul 9');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Day navigator names mixed excursions in both tile summaries', async () => {
  // All three days sit in the Sun→Sat week of the selected day (Jul 13), so each
  // one renders in the collapsed week strip: Jul 11 (Sat) belongs to the PRIOR
  // week and would never appear there.
  const days = [{
    iso: '2026-07-12', has_data: true, lows: 0, highs: 0, tir: 75,
    curve: [{ x: 0, bg: 100 }, { x: 1, bg: 100 }],
  }, {
    iso: '2026-07-13', has_data: true, lows: 1, highs: 1, tir: 50,
    curve: [{ x: 0, bg: 100 }, { x: 1, bg: 100 }],
  }, {
    iso: '2026-07-14', has_data: true, lows: 0, highs: 0, tir: 60,
    curve: [{ x: 0, bg: 100 }, { x: 1, bg: 100 }],
  }];
  const { server } = fixtureServer(days);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const browser = await runner.browser();
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('ciq_token', 'fixture-token'));

  try {
    await page.goto(`http://127.0.0.1:${port}/day?date=2026-07-13`);
    const calmTile = page.locator('.dn-col[aria-label="Sun Jul 12 — on target, 75% TIR"]');
    await calmTile.waitFor();
    assert.equal((await calmTile.getAttribute('aria-label')).match(/% TIR/g).length, 1);

    const neutralTile = page.locator('.dn-col[aria-label="Tue Jul 14 — in range, 60% TIR"]');
    await neutralTile.waitFor();
    assert.equal((await neutralTile.getAttribute('aria-label')).match(/% TIR/g).length, 1);

    const stripLabel = 'Mon Jul 13' +
      ' — 1 low, 1 high, 50% TIR';
    const stripTile = page.locator(`.dn-col[aria-label="${stripLabel}"]`);
    await stripTile.waitFor();
    assert.equal(await stripTile.locator('.dn-cl-sev').textContent(), '▽1 △1 50%');

    await page.locator('.dn-month-pill').click();
    const monthTile = page.locator('.dn-cell[title="2026-07-13 · 1 low, 1 high, 50% TIR"]');
    await monthTile.waitFor();
    assert.equal(await monthTile.locator('.dn-csev').textContent(), '▽1 △1 50');

  } finally {
    await page.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
