import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalAbsence, C4_RETIREMENTS } from './c4.replay.mjs';
import { REGISTRY } from '../frontend/harmonic-v2-desktop-behavior.replay.mjs';
import { storyCase } from './replay-cases.mjs';

function inputPage(rows, roster = { trials: [{}], focuses: [{}] }) {
  return {
    url: () => 'http://synthetic.invalid/v2/',
    request: { get: async url => ({ status: () => 200, text: async () => '',
      json: async () => new URL(url).pathname.endsWith('preparation')
        ? { findings: { rows } } : roster }) },
  };
}

test('R18 is a unique app-only registry function with a manufactured history case', () => {
  const entries = REGISTRY.filter(([id]) => id === 'R18');
  assert.equal(entries.length, 1);
  assert.equal(entries[0][1].deferred.term, 'HV2-31');
  assert.equal(storyCase('R18'), 'c4-history');
});

test('R18 fails before touching the UI when historical input is absent', async () => {
  await assert.rejects(historicalAbsence(inputPage([{ kind: 'setting', register: 'assert' }])), /actual register=history/);
});

test('R18 refuses to prove absence by also removing current evidence or records', async () => {
  const history = { kind: 'setting', register: 'history' };
  await assert.rejects(historicalAbsence(inputPage([history])), /current-setting evidence/);
  await assert.rejects(historicalAbsence(inputPage([history, { kind: 'setting', register: 'assert' }],
    { trials: [{}], focuses: [] })), /both Trial and Focus/);
});


test('R17 requires the generated finishable Trial, never a mock ready selector', async () => {
  assert.equal(storyCase('R17'), 'c3-trial');
  const page = admission => ({ url: () => 'http://synthetic.invalid/v2/',
    request: { get: async () => ({ status: () => 200, text: async () => '', json: async () => ({ admission }) }) } });
  await assert.rejects(C4_RETIREMENTS.R17(page({ active_kind: 'focus', can_finish_trial: true })), /served active Trial/);
  await assert.rejects(C4_RETIREMENTS.R17(page({ active_kind: 'trial', can_finish_trial: false })), /finishable Trial/);
});


test('clinical pairs use served setting IDs and the shared Watching control when needed', async () => {
  const { openClinicalConsumer } = await import('../mockups/sweep/harmonic-v2-desktop/clinical-pairs.mjs');
  const original = globalThis.localStorage;
  try {
    for (const side of ['v1', 'v2']) for (const [family, id, parameter] of [
      ['basal', 'basal:180-210', 'basal_rate'], ['isf', 'isf', 'isf'], ['ic', 'ic:0', 'carb_ratio'],
    ]) for (const register of ['assert', 'held', 'blind']) {
      const storage = new Map(); const waits = []; let navigated = false; let expanded = false;
      const watching = register === 'held' || register === 'blind';
      const rowSelector = `#level .qrow[data-id="${id}"]`;
      globalThis.localStorage = { setItem: (key, value) => storage.set(key, value) };
      const node = selector => ({
        first() { return this; },
        waitFor: async options => {
          assert.ok(navigated); assert.equal(options.timeout, 60000);
          if (selector.includes('.qrow')) {
            assert.equal(selector, rowSelector, 'the exact served ID owns the row');
            assert.equal(expanded, watching, 'Watching opens before waiting for its row');
          }
          waits.push(selector);
        },
        getAttribute: async name => {
          if (name === 'aria-expanded') return String(expanded);
          assert.equal(name, 'data-id'); return id;
        },
        click: async () => { if (selector === '#level .qcollapse') expanded = true; },
        getByRole: (role, options) => {
          assert.equal(selector, '#seg-window'); assert.equal(role, 'button');
          assert.deepEqual(options, { name: '24 h', exact: true });
          assert.equal(waits[0], '#level[data-loading="false"]', 'the owner must mount before its clock control');
          return node('clock');
        },
      });
      await openClinicalConsumer({ addInitScript: async run => run(),
        goto: async url => {
          assert.equal(storage.get('ciq_token'), 'synthetic-clinical-pair');
          assert.equal(storage.get('tab'), 'diagnose');
          assert.equal(new URL(url).pathname, side === 'v1' ? '/diagnose' : '/v2/'); navigated = true;
        }, locator: node,
        request: { get: async url => {
          assert.equal(url, 'http://127.0.0.1:8765/api/diagnose/findings');
          return { ok: () => true, status: () => 200, json: async () => ({ rows: [
            { id: 'retired-setting', parameter, register: 'history' }, { id, parameter, register },
          ] }) };
        } },
      }, side, family);
      assert.ok(waits.includes(family === 'basal' ? '#level .case-occurrence' : '#level .numrow'));
      assert.equal(waits.at(-1), `#tile-focal .evidence-tile[data-chart-id="${id}"] canvas`);
    }
  } finally { globalThis.localStorage = original; }
});

test('clinical pairs fail if either consumer misses the expected endpoint or consumes different coordinates', async () => {
  const { sharedClinicalKeys } = await import('../mockups/sweep/harmonic-v2-desktop/clinical-pairs.mjs');
  const endpoint = '/api/diagnose/basal-night-evidence'; const key = `${endpoint}?slot=180`;
  assert.deepEqual(sharedClinicalKeys({ v1: new Set([key]), v2: new Set([key]) }, endpoint), [key]);
  for (const side of ['v1', 'v2']) {
    const seen = { v1: new Set([key]), v2: new Set([key]) }; seen[side] = new Set([`${endpoint}-other?slot=180`]);
    assert.throws(() => sharedClinicalKeys(seen, endpoint), new RegExp(`${side} did not consume`));
  }
  assert.throws(() => sharedClinicalKeys({ v1: new Set([key]), v2: new Set([`${endpoint}?slot=210`]) }, endpoint), /identical clinical response key/);
});

// These exercise story control flow without Chromium. A missing helper or an
// unreachable setup control must not be mistaken for the feature assertion.
// The coordinator still owns the actual browser fail-first proof.
function qa404Page() {
  const actions = [];
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    waitFor: async () => {},
    click: async () => { actions.push(selector); },
    boundingBox: async () => ({ x: 0, y: 0, width: 500, height: 210 }),
    evaluate: async fn => fn({ clientWidth: 500 }),
  });
  return {
    actions, node,
    url: () => 'http://synthetic.invalid/v2/',
    goto: async () => {},
    locator: node,
    getByRole: (_role, { name }) => node(String(name)),
    waitForFunction: async () => {},
    mouse: { move: async () => {}, down: async () => {}, up: async () => {} },
  };
}

const copy404 = 'S101 custom Window chip contains only the span';
const graph404 = 'S102 thin basal slot click left the Pattern graph on stage';
const window404 = 'S103 backing out of a slot must restore each reader-selected window';
const day404 = 'S104 day click detached the standing stage, reading pane or navigator while the read was pending';

test('S101 reaches the Window copy assertion after the shared full-day opener', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa404Page();
  page.locator = selector => ({ ...page.node(selector), innerText: async () => 'Window 15:30–21:30 ×' });
  await assert.rejects(C4_STORIES.S101(page), { code: 'ERR_ASSERTION', message: new RegExp(copy404) });
  assert.deepEqual(page.actions, ['[data-destination="diagnose"]', '24 h']);
});

test('S102 reaches graph identity after opening a Pattern and selecting a thin slot', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa404Page();
  const id = 'pattern:highs_after_meals';
  page.request = { get: async () => ({ status: () => 200, text: async () => '',
    json: async () => ({ rendered_rows: [{ id, kind: 'pattern', pattern_chart: { key: 'highs_after_meals' } }] }) }) };
  page.locator = selector => ({ ...page.node(selector), getAttribute: async () => id });
  page.getByRole = (_role, { name }) => ({ ...page.node(String(name)), getAttribute: async () => 'nodata' });
  await assert.rejects(C4_STORIES.S102(page), { code: 'ERR_ASSERTION', message: new RegExp(graph404) });
  assert.deepEqual(page.actions.slice(0, 4), ['[data-destination="diagnose"]', '24 h', 'All charts',
    `#tile-row .evidence-tile[data-chart-id="${id}"]`]);
  assert.equal(page.actions.at(-1), String(/^12:00 basal slot,/));
});

test('S103 reaches its aggregate return assertion after exercising all three window entries', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa404Page();
  const whole = { label: '24 h', min: 0, max: 95 };
  const morning = { ...whole, label: 'Morning' };
  const drawn = { ...whole, label: 'Window 15:30–21:30 ×' };
  const reads = [whole, whole, morning, morning, drawn, whole];
  page.evaluate = async () => { assert.ok(reads.length); return reads.shift(); };
  await assert.rejects(C4_STORIES.S103(page), error => {
    assert.equal(error.code, 'ERR_ASSERTION'); assert.ok(error.message.includes(window404));
    assert.deepEqual(error.actual, [{ mode: 'drawn', before: drawn, after: whole }]);
    return true;
  });
  assert.equal(reads.length, 0);
  assert.equal(page.actions.filter(action => action === 'Findings').length, 3);
  assert.equal(page.actions.filter(action => action === '24 h').length, 3);
  assert.ok(page.actions.includes('Morning'));
});

test('S104 establishes a populated week before observing teardown and releases the held read on failure', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa404Page();
  let previousPicked = false, handler, responded, continued = false, disposed = false, unregistered = false;
  const date = '2024-06-23';
  const response = new Promise(resolve => { responded = resolve; });
  page.getByRole = (role, options) => {
    assert.equal(role, 'button'); assert.equal(options.name, 'Previous recorded day');
    return { isEnabled: async () => true, click: async () => { previousPicked = true; } };
  };
  page.locator = selector => ({ ...page.node(selector),
    evaluateAll: async fn => {
      assert.ok(previousPicked, 'the Sunday arrival must first step into its preceding week');
      return fn([{ dataset: { pick: date } }]);
    },
    getAttribute: async () => { throw new Error('the unresolved arrival-week locator must not be read'); },
    click: async () => {
      if (selector === 'nav.v2-nav [data-destination="day"]') return;
      assert.equal(selector, `.gf-nav-col[data-pick="${date}"]`);
      void handler({ continue: async () => { continued = true; responded(); } });
    },
  });
  page.evaluateHandle = async () => {
    assert.ok(previousPicked, 'capture the frame only after the setup day settles');
    return { evaluate: async fn => fn({ stage: { isConnected: false }, reading: { isConnected: false }, nav: { isConnected: false } }),
      dispose: async () => { disposed = true; } };
  };
  page.route = async (pattern, run) => { assert.equal(pattern, '**/api/model-view*'); handler = run; };
  page.waitForResponse = () => response;
  page.unroute = async () => { unregistered = true; };
  await assert.rejects(C4_STORIES.S104(page), { code: 'ERR_ASSERTION', message: new RegExp(day404) });
  assert.equal(continued, true); assert.equal(disposed, true); assert.equal(unregistered, true);
});
