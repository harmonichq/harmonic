// #358 reproduction — the Diagnose surface reports a change staged that the
// server refused to record.
//
// Independent of #357 by construction: the refusal is injected here with
// `page.route`, so this driver reproduces the surface defect whether or not the
// backend still rejects an all-day I:C block.
//
//   PLAYWRIGHT_MODULE=<playwright> BASE_URL=http://127.0.0.1:8765 [TOKEN=qa] \
//   node openspec/changes/rejected-plan-save-unstages/evidence/repro-358.mjs
//
// BASE_URL must be a `harmonic serve --no-fetch` on a committed synthetic
// database — the QA copy-then-serve command in AGENTS.md, "The data boundary".
// Run `uv sync --frozen --extra api --extra sync` first, or that serve dies on a
// bare virtualenv with `ModuleNotFoundError: No module named 'uvicorn'`. The
// first page load computes the analysis cold and can exceed this driver's
// 30-second `networkidle` wait; a second run against the same warm serve
// succeeds. TOKEN is ignored by a serve started with `--token ''`.
//
// FAILS CLOSED: a missing driver, an unreachable app, or a database publishing
// no stageable finding exits nonzero rather than reporting a pass.
//
// Exit 0 once the surface reverts a refused stage; exit 1 while it does not.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const missing = [];
if (!process.env.PLAYWRIGHT_MODULE) missing.push('PLAYWRIGHT_MODULE is unset');
if (!process.env.BASE_URL) missing.push('BASE_URL is unset');
if (missing.length) {
  console.error(`repro-358 cannot run:\n  - ${missing.join('\n  - ')}`);
  process.exit(2);
}
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const BASE_URL = process.env.BASE_URL;
const TOKEN = process.env.TOKEN || 'qa';
const DETAIL = 'synthetic plan rejection for the #358 reproduction';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript((token) => {
  localStorage.setItem('ciq_token', token);
  localStorage.setItem('tab', 'diagnose');
}, TOKEN);
const page = await context.newPage();
await page.route('**/api/plan', async (route) => {
  if (route.request().method() !== 'PUT') return route.continue();
  return route.fulfill({ status: 400, contentType: 'application/json',
    body: JSON.stringify({ detail: DETAIL }) });
});

const surface = () => page.evaluate(() => {
  const button = document.querySelector('.stagebtn');
  const setup = document.querySelector('#app')?.__vue_app__?._instance?.setupState;
  const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  return {
    stageButton: text(button) || null,
    dataStaged: button?.dataset.staged ?? null,
    watchDock: text(document.querySelector('#watch-dock')),
    planBadge: document.querySelector('#plan-badge')?.dataset.count ?? null,
    planDraftItems: setup?.planItems?.size ?? null,
    toast: text(document.querySelector('.toast')) || null,
  };
});

// The findings queue is replaced by the level a row drills into, so each
// candidate is tried from a fresh arrival rather than by re-indexing a queue
// that is no longer on screen. Which findings a no-fetch database publishes
// differs per database, so the row is discovered rather than pinned to one.
const openQueue = async () => {
  await page.goto(`${BASE_URL}/diagnose`, { waitUntil: 'networkidle' });
  await page.locator('.dw').waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: '24 h', exact: true }).click();
  await page.waitForTimeout(800);
};

try {
  await openQueue();
  const ids = await page.evaluate(() => [...document.querySelectorAll('.qrow[data-id]')]
    .map((row) => row.dataset.id));
  let staged = null;
  for (const id of ids.slice(0, 8)) {
    await page.locator(`.qrow[data-id="${id}"]`).click();
    await page.waitForTimeout(1200);
    if (await page.locator('.stagebtn').count()) { staged = id; break; }
    await openQueue();
  }
  if (staged === null) {
    console.error(`repro-358: none of this server's ${ids.length} findings offers a stage control`);
    process.exit(2);
  }
  console.log(`staging finding ${staged}`);
  console.log('before staging:', JSON.stringify(await surface(), null, 1));
  await page.locator('.stagebtn').first().click();
  await page.waitForTimeout(1500);
  const after = await surface();
  console.log('after a refused save:', JSON.stringify(after, null, 1));

  // The dock is reported above but deliberately not asserted on here. When the
  // served database has a watched Trial, `watchDockView` returns its `trial`
  // branch and reaches the `plan` branch only when nothing is watched
  // (`frontend/watched-change-dock.js`), so a `Plan · staged` assertion would be
  // inert against this database. The dock's own share of the defect is asserted
  // in the cockpit-shell browser suite, which stubs `/api/outcomes/trend` empty
  // and so does reach that branch.
  const lies = after.dataStaged === 'true'
    || after.planBadge !== '0'
    || after.planDraftItems !== 0;
  console.log(lies
    ? 'FAIL — the surface reports a change the server refused as staged'
    : 'PASS — the surface reports nothing staged');
  if (after.toast !== `Plan save failed: ${DETAIL}`) {
    console.log(`FAIL — the failure message is not the server's detail: ${after.toast}`);
    process.exit(1);
  }
  process.exit(lies ? 1 : 0);
} finally {
  await browser.close();
}
