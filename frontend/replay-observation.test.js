import test from 'node:test';
import assert from 'node:assert/strict';
import { harnessSelect, S24 } from './harmonic-v2-desktop-behavior.replay.mjs';
import { S03 } from './diagnose-workstation-behavior.replay.mjs';
import { C3_STORIES } from '../frontend-v2/c3.replay.mjs';

async function shortDeadline(run) {
  const set = globalThis.setTimeout;
  globalThis.setTimeout = (callback, ms, ...args) => set(callback, ms === 30000 ? 10 : ms, ...args);
  try { await run(); } finally { globalThis.setTimeout = set; }
}

test('harness selection resolves the option and dispatches before an intervening render', async () => {
  const previous = globalThis.document;
  const changes = [];
  const select = value => ({
    options: [{ value, textContent: 'Synthetic case' }], selected: '',
    get value() { return this.selected; },
    set value(next) { this.selected = this.options.some(option => option.value === next) ? next : ''; },
    dispatchEvent() { changes.push(this.value); },
  });
  let node = select('first-render');
  globalThis.document = { querySelector: () => node };
  try {
    await harnessSelect({
      evaluate: async (run, arg) => {
        const result = run(arg);
        if (!changes.length) node = select('next-render');
        return result;
      },
      waitForTimeout: async () => {},
    }, 'scenario', 'Synthetic');
    assert.deepEqual(changes, ['first-render'], 'one event carries an option from that same render');
    assert.equal(node.value, 'first-render');
  } finally { globalThis.document = previous; }
});

test('harness selection rejects a change that never lands without redispatching', async () => {
  const previous = globalThis.document;
  let changes = 0;
  const node = { value: '', options: [{ value: 'synthetic', textContent: 'Synthetic case' }],
    dispatchEvent() { changes++; this.value = ''; } };
  globalThis.document = { querySelector: () => node };
  try {
    await shortDeadline(() => assert.rejects(harnessSelect({
      evaluate: async (run, arg) => run(arg), waitForTimeout: async () => {},
    }, 'scenario', 'Synthetic'), /selected "", expected "synthetic"/));
    assert.equal(changes, 1);
  } finally { globalThis.document = previous; }
});

test('S24 waits for a held cohort member before taking its starting baseline', async () => {
  const previous = globalThis.document;
  const ids = ['a', 'b'];
  let selected = null;
  let baselineReads = 0;
  let steps = 0;
  globalThis.document = {
    querySelectorAll: selector => {
      if (selector.includes('aria-pressed')) {
        if (++baselineReads === 3) selected = 'a';
        return selected ? [{ dataset: { occ: selected } }] : [];
      }
      return ids.map(occ => ({ dataset: { occ } }));
    },
    querySelector: selector => selector.includes('data-destination')
      ? { dataset: { destination: 'explore' } } : selected ? { dataset: { occ: selected } } : null,
  };
  const control = selector => ({
    count: async () => 1, nth() { return this; }, isVisible: async () => true,
    click: async () => {
      if (!selector.includes('meal')) return;
      assert.ok(selected, 'no step may use a null baseline');
      steps++; selected = selected === 'a' ? 'b' : 'a';
    },
  });
  try {
    await S24({ locator: control, evaluate: async run => run(), waitForTimeout: async () => {} });
    assert.equal(baselineReads, 3);
    assert.equal(steps, 4);
  } finally { globalThis.document = previous; }
});

function trialPage() {
  const days = [
    { date: '2024-05-15', n_readings: 288, tir: 100, tbr: 0, meals: 2 },
    { date: '2024-05-16', n_readings: 288, tir: 90, tbr: 1, meals: 3 },
  ];
  const roster = { admission: { state: 'available', active_kind: 'trial', active_id: 1, can_finish_trial: true } };
  const detail = { id: 1, kind: 'trial', day_rows: { before_period: days }, reassessment: { comparison: {} } };
  let baselineReads = 0;
  let changedDay = false;
  const page = {
    url: () => 'http://127.0.0.1:8765/v2/', goto: async () => {},
    request: { get: async () => ({ status: () => 200, text: async () => '', json: async () => ({ ...roster, selected: detail }) }) },
    selectOption: async (selector, value) => {
      if (selector.includes('evidence-day')) {
        assert.ok(baselineReads >= 2, 'wait for the served Before day before selecting the next day');
        assert.equal(value, '1'); changedDay = true;
      }
    },
    locator: selector => ({
      filter() { return this; }, first() { return this; }, waitFor: async () => {}, click: async () => {},
      inputValue: async () => selector.includes('evidence-period') ? 'before_period' : '0',
      evaluateAll: async () => ['0', '1'],
      evaluate: async () => ++baselineReads === 1
        ? { copy: '', figure: 'Old Trial day', values: ['90%', '1%', '3'] }
        : { copy: 'May 15 — not necessarily a complete day', figure: 'May 15, 2024\n288 glucose readings', values: ['100%', '0%', '2'] },
      innerText: async () => changedDay ? 'May 16 — not necessarily a complete day' : '',
    }),
  };
  return { page, roster, baselineReads: () => baselineReads };
}

test('S48 waits for the served first Before day rather than retaining old Trial text', async () => {
  const driver = trialPage();
  await C3_STORIES.S48(driver.page);
  assert.equal(driver.baselineReads(), 2);
});

test('S51 rereads admission while waiting for the finish form', async () => {
  const { page, roster } = trialPage();
  let reads = 0;
  const get = page.request.get;
  page.request.get = async (...args) => {
    reads++;
    roster.admission.can_finish_trial = reads >= 4;
    return get(...args);
  };
  let value = '';
  page.fill = async (_selector, text) => { value = text; };
  const locator = page.locator;
  page.locator = selector => ({ ...locator(selector), isDisabled: async () => !value.trim(), getAttribute: async () => null });
  await C3_STORIES.S51(page);
  assert.equal(reads, 4, 'the fourth read observes updated admission');
});

test('S03 reports all four failed touch claims and runs each gesture once', async () => {
  let touches = 0;
  let down = false;
  let cursor = 'crosshair';
  let gripA = 50;
  let gripB = 150;
  let chip = 'initial';
  const page = {
    waitForTimeout: async () => {},
    evaluate: async () => ({
      x: 0, y: 0, w: 400, h: 200, gripA, gripB, chip, cursor,
      live: down ? ['brace-b'] : [], readout: down ? '10:00' : null,
      plotTop: 20, plotBottom: 174, laneTop: 200,
      edges: ['brace-a', 'brace-b'].map(id => ({ id, left: 50, top: 20, bottom: 174, hitTop: 20, hitBottom: 174 })),
    }),
    mouse: {
      move: async (x, y) => { cursor = y > 174 ? 'crosshair' : 'col-resize'; if (down) gripB = x; },
      down: async () => { down = true; },
      up: async () => { down = false; chip = 'resized'; },
    },
    context: () => ({ newCDPSession: async () => ({
      send: async (_method, event) => {
        if (event.type === 'touchEnd') {
          touches++;
          // Both gestures leave their target unmoved and move the far gate.
          if (touches === 1) gripB += 10; else gripA += 10;
        }
      },
      detach: async () => {},
    }) }),
  };
  await shortDeadline(() => assert.rejects(S03(page), error => {
    for (const claim of ['primary touch moves the left full-height gate', 'left primary touch holds the far gate',
      'primary touch moves the right full-height gate', 'right primary touch holds the far gate']) {
      assert.ok(error.message.includes(claim), claim);
    }
    return true;
  }));
  assert.equal(touches, 2, 'neither the failed left wait nor the right wait repeats its action');
});
