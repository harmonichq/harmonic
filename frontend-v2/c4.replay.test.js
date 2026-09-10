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
