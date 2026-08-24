// Browser-level coverage for the first-plan reconcile behavior (#462). This
// drives the real Vue Plan tab against fixture endpoints — it never starts the
// app server or reads a local database — and asserts the RENDERED Deliverable
// card, the thing the *.shot.mjs screenshot generator captures but that is not a
// CI test. Three cases, all with EMPTY apply history (the first plan):
//
//   1. exact pump match  -> "On pump … Confirm & re-baseline"
//   2. divergent pump    -> "Pending", no mis-key table, no confirm action
//   3. nothing staged    -> "nothing to program yet"
//
// It also clicks Confirm and asserts the EFFECTIVE plan is what gets persisted:
// the accepted noon I:C item, not an empty draft (#462).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const FRONTEND = fileURLToPath(new URL('.', import.meta.url));
const MIME = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript' };

// The staged change: noon I:C 5.4 -> 5.7, still a chip in the draft.
const PLAN_ITEMS = [
  { type: 'ic', key: 720, start_min: 720, label: '12:00', current: 5.4, value: 5.7, recommended: 5.7 },
];

// The pump's active profile. `matched` carries the keyed-in noon I:C 5.7 (an
// exact match); otherwise noon is still 5.4 (divergent — not keyed in yet).
function pumpSettings({ matched }) {
  return {
    configured: true,
    fetched_at: '2026-07-20 08:00:00',
    other_profile_count: 1,
    profile: {
      name: matched ? 'P006' : 'P005', idp: matched ? 6 : 5,
      dia_hours: 5, max_bolus: 10, carb_entry: true,
      segments: [
        { start_min: 0, basal_rate: 0.6, isf: 50, carb_ratio: 10, target_bg: 110 },
        { start_min: 360, basal_rate: 0.75, isf: 45, carb_ratio: 8, target_bg: 110 },
        { start_min: 720, basal_rate: 0.7, isf: 50, carb_ratio: matched ? 5.7 : 5.4, target_bg: 110 },
        { start_min: 1320, basal_rate: 0.6, isf: 55, carb_ratio: 10, target_bg: 110 },
      ],
    },
  };
}

// A fixture server for one scenario. `items` is the plan draft; `matched` picks
// the pump profile. Records every PUT /api/plan body so the test can assert what a
// confirmation persists. History is always empty — this is the FIRST plan.
function fixtureServer({ items, matched }) {
  const savedDrafts = [];
  let applied = false;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (body) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === '/api/plan' && req.method === 'PUT') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || '{}');
      savedDrafts.push(body.items || []);
      return json({ items: body.items || [], updated_at: '2026-07-20 08:01:00' });
    }
    if (url.pathname === '/api/plan/apply' && req.method === 'POST') {
      applied = true;
      const last = savedDrafts[savedDrafts.length - 1] || items;
      return json({ applied_at: '2026-07-20 08:02:00', items: last });
    }
    if (url.pathname === '/api/plan') return json({ items });
    if (url.pathname === '/api/plan/history') return json({ history: [] });
    if (url.pathname === '/api/pump-settings') return json(pumpSettings({ matched }));
    if (url.pathname === '/api/status') return json({ earliest_data_day: '2026-06-20', latest_data_day: '2026-07-20' });
    if (url.pathname === '/api/credentials') return json({ configured: true });
    if (url.pathname === '/api/analyze') return json({ basal: [], isf: [], ic: [], behavioral: [], epochs: [], settling: {} });
    if (url.pathname === '/api/scenarios') return json({ patterns: [], low_confidence: [], episodes: {}, priority_active_threshold: 30 });
    if (url.pathname === '/api/backtest') return json({});
    if (url.pathname === '/api/day-navigator') return json({ days: [] });
    if (url.pathname === '/api/prompts' || url.pathname === '/api/carbs') return json([]);
    if (url.pathname === '/api/focus') return json({ focuses: [] });
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }

    const file = url.pathname === '/' || url.pathname === '/plan'
      ? 'index.html' : url.pathname.replace(/^\/assets\//, '');
    try {
      const body = await readFile(join(FRONTEND, file));
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  return { server, savedDrafts, wasApplied: () => applied };
}

async function openPlanCard(page, origin) {
  await page.addInitScript(() => {
    localStorage.setItem('ciq_token', 'fixture-token');
    localStorage.setItem('tab', 'plan');
  });
  await page.goto(`${origin}/plan`);
  const card = page.locator('.card.full', { has: page.locator('h2', { hasText: 'Deliverable' }) });
  await card.waitFor();
  return card;
}

// Wait until the Deliverable card's text does (present) / does not (present=false)
// match `re` — polling reactivity so an edit's re-render is not raced.
async function waitCardText(page, re, present = true) {
  await page.waitForFunction(({ src, flags, want }) => {
    const cards = [...document.querySelectorAll('.card.full')];
    const card = cards.find((c) => /Deliverable — pump-ready/.test(c.innerText));
    if (!card) return false;
    return new RegExp(src, flags).test(card.innerText) === want;
  }, { src: re.source, flags: re.flags, want: present }, { timeout: 5000 });
}

// Type a value into a deliverable cell and fire the @change the handler listens
// for (fill alone does not dispatch 'change').
async function setCell(input, value) {
  await input.fill(String(value));
  await input.dispatchEvent('change');
}

async function withScenario(scenario, run) {
  const fixture = fixtureServer(scenario);
  await new Promise((resolve) => fixture.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${fixture.server.address().port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await run(page, origin, fixture);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => fixture.server.close(resolve));
  }
}

test('first exact match renders "Confirm & re-baseline" and confirming persists the effective plan (#462)', async () => {
  await withScenario({ items: PLAN_ITEMS, matched: true }, async (page, origin, fixture) => {
    const card = await openPlanCard(page, origin);
    const text = await card.innerText();
    assert.match(text, /On pump/);
    assert.match(text, /Confirm & re-baseline/);

    // Confirming persists the EFFECTIVE plan (accepted noon I:C), not an empty
    // draft — proving the confirmation records what is actually on the pump.
    const applyPosted = page.waitForResponse(
      (r) => r.url().endsWith('/api/plan/apply') && r.request().method() === 'POST');
    await card.getByRole('button', { name: /Confirm & re-baseline/ }).click();
    await applyPosted;
    assert.equal(fixture.wasApplied(), true, 'apply was posted');
    const persisted = fixture.savedDrafts[fixture.savedDrafts.length - 1];
    assert.ok(persisted && persisted.length >= 1, 'a non-empty effective plan was persisted');
    const ic = persisted.find((i) => i.type === 'ic' && i.start_min === 720);
    assert.ok(ic, 'the noon I:C item is persisted');
    assert.equal(ic.value, 5.7);
  });
});

test('a divergent first plan stays pending with no mis-key table (#462)', async () => {
  await withScenario({ items: PLAN_ITEMS, matched: false }, async (page, origin) => {
    const card = await openPlanCard(page, origin);
    const text = await card.innerText();
    assert.match(text, /Pending/);
    assert.doesNotMatch(text, /Confirm & re-baseline/);
    assert.doesNotMatch(text, /likely a keying error/);
  });
});

test('a first plan with nothing staged says there is nothing to program (#393)', async () => {
  await withScenario({ items: [], matched: false }, async (page, origin) => {
    const card = await openPlanCard(page, origin);
    const text = await card.innerText();
    assert.match(text, /nothing to program yet/);
    assert.doesNotMatch(text, /Confirm & re-baseline/);
  });
});

test('editing a first-plan cell then reverting it leaves nothing staged and cannot confirm (#462)', async () => {
  // Start with nothing staged. Hand-edit 00:00 ISF 50 -> 60 (a real proposal), then
  // back to 50. The revert must clear the override: the plan returns to "nothing to
  // program", never exposes Confirm, and nothing is ever persisted (no false
  // 50 -> 50 history item).
  await withScenario({ items: [], matched: false }, async (page, origin, fixture) => {
    const card = await openPlanCard(page, origin);
    await waitCardText(page, /nothing to program yet/);

    const isf = card.locator('table tbody tr').first().locator('input.plan-value').nth(1);
    await setCell(isf, 60);
    await waitCardText(page, /Pending/);              // now a real staged edit
    await waitCardText(page, /Confirm & re-baseline/, false);

    await setCell(isf, 50);                            // revert to the current value
    await waitCardText(page, /nothing to program yet/);
    await waitCardText(page, /Confirm & re-baseline/, false);

    // No Confirm action was ever available, and hand-edits never hit the server —
    // there is no path to a first apply-history entry.
    assert.equal(await card.getByRole('button', { name: /Confirm & re-baseline/ }).count(), 0);
    assert.deepEqual(fixture.savedDrafts, []);
    assert.equal(fixture.wasApplied(), false);
  });
});
