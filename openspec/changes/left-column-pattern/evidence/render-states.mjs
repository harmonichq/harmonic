// Render one named Diagnose left-column state from one checkout, for the #306
// before/after evidence. The opener is the checkout's own behaviour replay
// (`frontend/diagnose-workstation-behavior.replay.mjs` under FRONTEND_ROOT), so
// a base render serves the base frontend and an after render serves the
// revision's — the two trees never mix, which is the mixing the #294 revision
// entry recorded as fatal to a cross-tree replay.
//
//   PLAYWRIGHT_MODULE=<playwright> VENDOR_DIR=<vendored echarts+vue> \
//   FRONTEND_ROOT=<checkout> BASE_URL=http://127.0.0.1:<port> TARGET=app \
//   PAYLOAD=<checkout>/mockups/diagnose-workstation.synthetic/payload.json \
//   OUT=<dir> LABEL=before|after [VIEWPORTS=1440x900,1280x800,390x844] \
//   [STATES=queue-root,...] node openspec/changes/left-column-pattern/evidence/render-states.mjs
//
// Every render is of the committed synthetic Diagnose payload through the
// declared no-fetch server; no real patient data. Fails closed: a missing
// driver, checkout, state or selector exits nonzero rather than skipping.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const need = (name) => process.env[name] || (() => { throw new Error(`${name} is required`); })();
const root = resolve(need('FRONTEND_ROOT'));
const out = resolve(need('OUT'));
const label = need('LABEL');
if (process.env.TARGET !== 'app') throw new Error('TARGET must be app');
const viewports = (process.env.VIEWPORTS || '1440x900,1280x800,390x844').split(',')
  .map((v) => v.split('x').map(Number)).map(([width, height]) => ({ width, height }));

const require = createRequire(import.meta.url);
const { chromium } = require(need('PLAYWRIGHT_MODULE'));
const replay = await import(pathToFileURL(join(root, 'frontend/diagnose-workstation-behavior.replay.mjs')).href);
const { openApp } = replay;

const settle = async (page) => {
  await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false');
  await page.waitForTimeout(700);
};
const preset = async (page, name) => {
  await page.getByRole('button', { name, exact: true }).click();
  await settle(page);
};
const bringUp = async (page) => {
  if (await page.locator('#tile-field').getAttribute('data-dock') === 'hidden') {
    await page.getByRole('button', { name: 'Bring the charts up', exact: true }).click();
    await page.waitForTimeout(300);
  }
};
const rowTitles = (page) => page.evaluate(() => [...document.querySelectorAll('#level .qrow')]
  .map((row) => row.querySelector('.lab')?.textContent.trim() || ''));
const expandWatching = async (page) => {
  const watching = page.getByRole('button', { name: /^Watching/ });
  if (!(await watching.count())) throw new Error('no Watching control in this window');
  await watching.first().click();
  await page.waitForTimeout(400);
};
const drillRow = async (page, match) => {
  // The queue's rows are `#level .qrow`, titled by `.lab` (the replay's own
  // `clickQueueRow` reads the same markup). A held or blind read sits under
  // Watching until the reader expands it.
  let titles = await rowTitles(page);
  let at = titles.findIndex((title) => match.test(title));
  if (at < 0) { await expandWatching(page); titles = await rowTitles(page); at = titles.findIndex((title) => match.test(title)); }
  if (at < 0) throw new Error(`no queue row matching ${match}; saw ${titles.join(', ') || '(none)'}`);
  await page.locator('#level .qrow').nth(at).click();
  await settle(page);
};

// Each state drives the app from the 24 h queue root; the drills use the
// Morning preset, the one window of the committed payload that ranks a basal
// assert, a carb-ratio assert and (under Watching) the correction-factor read
// together. The names are the evidence directory's vocabulary, not the app's.
const STATES = {
  'queue-root': async (page) => {},
  'drill-basal': async (page) => { await preset(page, 'Morning'); await drillRow(page, /^Basal 07:00/); },
  'drill-carb-ratio': async (page) => { await preset(page, 'Morning'); await drillRow(page, /^I:C 07:00/); },
  'drill-correction-factor': async (page) => {
    await preset(page, 'Morning'); await drillRow(page, /^ISF$/);
  },
  'drill-finding': async (page) => { await drillRow(page, /^Over-treated low/); },
  'watching-promoted': async (page) => {
    await preset(page, 'Morning');
    await bringUp(page);
    await page.locator('#tile-row .evidence-tile[data-tail-head]').first().click();
    await page.waitForTimeout(500);
  },
  'drawer-hidden': async (page) => {},
  'drawer-up': async (page) => { await bringUp(page); },
  'explorer': async (page) => {
    await page.locator('#dock-handle button[aria-label="Show every chart"]').click();
    await page.waitForTimeout(500);
  },
};
const wanted = (process.env.STATES || Object.keys(STATES).join(',')).split(',');
for (const name of wanted) if (!STATES[name]) throw new Error(`unknown state ${name}`);

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
let rendered = 0;
try {
  for (const viewport of viewports) {
    for (const name of wanted) {
      const page = await openApp(browser, { state: 'typical', viewport, frontendRoot: join(root, 'frontend') });
      try {
        await page.getByRole('button', { name: '24 h', exact: true }).click();
        await settle(page);
        await STATES[name](page);
        const file = join(out, `${label}-${name}-${viewport.width}x${viewport.height}.png`);
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
if (!rendered) throw new Error('rendered nothing');
console.log(`${label}: ${rendered} renders`);
