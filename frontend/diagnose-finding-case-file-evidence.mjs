import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { openApp } from './diagnose-workstation-behavior.replay.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const ROOT = '/private/tmp/harmonic-79-evidence';
const BASE_FRONTEND = process.env.BASE_FRONTEND;
if (!BASE_FRONTEND) throw new Error('BASE_FRONTEND is required');

const states = [
  'meal-clock-claimed-less-than-fired', 'meal-event-selected',
  'correction-pair-event', 'missed-meal-high-event', 'meal-short-high-selected',
  'active-failure-preserved', 'stale-shadow-refresh', 'unavailable-occurrence',
];
const recovery = new Set(states.slice(5));
const viewports = { wide: { width: 1440, height: 900 }, narrow: { width: 390, height: 844 } };
const themes = ['light', 'dark'];
const wait = (page, ms = 350) => page.waitForTimeout(ms);
const error = (status, code, message) => ({ status, body: { detail: { code, message } } });

async function wholeDay(page) {
  const button = page.getByRole('button', { name: '24 h', exact: true });
  if (await button.count()) { await button.evaluate((node) => node.click()); await wait(page); }
}
async function finding(page, title) {
  const exact = page.locator('#level .qrow').filter({ has: page.locator('.lab', { hasText: title }) });
  const row = await exact.count() ? exact.first() : page.locator('#level .qrow[data-state="finding"]').first();
  if (await row.count()) { await row.click(); await wait(page, 500); }
}
async function eventAndSelection(page, select = false) {
  const event = page.getByRole('button', { name: 'By event', exact: true });
  if (await event.count()) { await event.evaluate((node) => node.click()); await wait(page, 550); }
  if (select) {
    const row = page.locator('#level .case-occurrence, #level .ev-row').first();
    if (await row.count()) { await row.click(); await wait(page, 500); }
  }
}

async function pose(page, state, phase) {
  await wholeDay(page);
  if (state.startsWith('meal-clock')) return finding(page, 'Meal over-delivery');
  if (state === 'meal-event-selected') {
    await finding(page, 'Meal over-delivery'); return eventAndSelection(page, true);
  }
  if (state === 'correction-pair-event') {
    await finding(page, 'Correction stacking'); return eventAndSelection(page, true);
  }
  if (state === 'missed-meal-high-event') {
    await finding(page, 'Missed / unannounced meal'); return eventAndSelection(page, false);
  }
  if (state === 'meal-short-high-selected') {
    await finding(page, 'Meal bolus fell short'); return eventAndSelection(page, true);
  }
  await finding(page, 'Meal over-delivery');
  if (phase === 'revision') {
    await eventAndSelection(page, state === 'unavailable-occurrence');
    if (state === 'stale-shadow-refresh') await wait(page, 150);
  }
}

function scenario(state) {
  if (state === 'active-failure-preserved') return { case: async ({ request, body }) =>
    request === 2 ? error(500, 'inconsistent_projection', 'Synthetic active failure.') : { body } };
  if (state === 'unavailable-occurrence') return { case: async ({ request, body }) =>
    request === 2 ? { body: { ...body, selection: { state: 'unavailable',
      requested_id: `o_${'9'.repeat(32)}`, detail: null } } } : { body } };
  if (state === 'stale-shadow-refresh') return {
    preparation: async ({ request, preparation }) => {
      if (request === 5) { await new Promise((done) => setTimeout(done, 1800)); }
      return { body: preparation };
    },
    case: async ({ request, body }) => request === 2
      ? error(409, 'stale_projection', 'Synthetic stale preparation.') : { body },
  };
  return null;
}

await mkdir(join(ROOT, 'base'), { recursive: true });
await mkdir(join(ROOT, 'revision'), { recursive: true });
const browser = await chromium.launch();
const rows = [];
for (const state of states) {
  for (const phase of ['base', 'revision']) {
    for (const [viewportName, viewport] of Object.entries(viewports)) {
      for (const theme of themes) {
        const key = { state_id: state, phase, viewport: viewportName, theme };
        if (phase === 'base' && recovery.has(state)) {
          rows.push({ ...key, status: 'not_applicable',
            reason: 'The base has no request seam capable of reaching this recovery state.' });
          continue;
        }
        const page = await openApp(browser, {
          state: 'typical', theme, viewport, appSource: 'fixture',
          fixtureBaseUrl: 'http://127.0.0.1:8766/',
          frontendRoot: phase === 'base' ? resolve(BASE_FRONTEND) : undefined,
          caseScenario: phase === 'revision' ? scenario(state) : null,
        });
        await pose(page, state, phase);
        const image = join(ROOT, phase, `${state}__${viewportName}__${theme}.png`);
        await page.screenshot({ path: image });
        await page.close();
        rows.push({ ...key, status: 'captured', image });
      }
    }
  }
}
await browser.close();
await writeFile(join(ROOT, 'manifest.json'), `${JSON.stringify({ rows }, null, 2)}\n`);
const images = rows.filter((row) => row.status === 'captured').length;
const na = rows.filter((row) => row.status === 'not_applicable').length;
console.log(`evidence: ${rows.length} rows, ${images} images, ${na} not_applicable`);
