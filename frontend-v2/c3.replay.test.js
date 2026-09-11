import test from 'node:test';
import assert from 'node:assert/strict';
import { withReplayAssertionTimeout } from '../frontend/replay-assertions.mjs';
import { openApp, REGISTRY, goto, harnessCheck, harnessSelect, S24 } from '../frontend/harmonic-v2-desktop-behavior.replay.mjs';
import { C3_CASES, C3_STORIES } from './c3.replay.mjs';
import { S03 } from '../frontend/diagnose-workstation-behavior.replay.mjs';

const refused = ['S45', 'S45b', 'S46', 'S47', 'S48', 'S50', 'S51', 'S52', 'S54', 'S54b', 'S55'];
function appBrowser() {
  let visits = 0;
  const page = {
    on() {}, route: async () => {},
    goto: async () => { visits += 1; return { status: () => 200, ok: () => true }; },
    waitForSelector: async () => {}, waitForFunction: async () => {},
    evaluate: async () => ({ destination: 'diagnose', currentCount: 1, panes: 2, loading: false }),
  };
  const context = { newPage: async () => page };
  return { browser: { newContext: async () => context }, page, visits: () => visits };
}
for (const id of refused) {
  test(`${id} opens its registered app case without a prototype scenario selector`, async () => {
    const [, , options] = REGISTRY.find(row => row[0] === id);
    const { browser, page, visits } = appBrowser();
    const opened = await openApp(browser, { ...options, storyId: id, caseName: C3_CASES[id] });
    assert.equal(opened.page, page);
    assert.equal(opened.target, 'app');
    assert.equal(visits(), 1);
  });
}
test('a prototype-only nondefault state still refuses without an app story', async () => {
  const { browser, visits } = appBrowser();
  await assert.rejects(openApp(browser, { state: 'active', storyId: 'S1' }), /cannot honour state=active/);
  assert.equal(visits(), 0);
});
function apiPage(data) {
  const reads = [];
  return {
    reads, url: () => 'http://127.0.0.1:8765/v2/',
    request: { get: async (url, options) => {
      assert.equal(options.timeout, 30000);
      reads.push(new URL(url));
      const body = typeof data === 'function' ? data(new URL(url)) : data;
      return { status: () => 200, text: async () => JSON.stringify(body), json: async () => body };
    } },
  };
}
for (const id of [...refused, 'S49']) {
  test(`${id} refuses unavailable served state before touching the view`, async () => {
    const page = apiPage({ admission: { state: 'unavailable', active_kind: null }, trials: [], focuses: [] });
    await assert.rejects(C3_STORIES[id](page), /case must publish available follow-up admission/);
    assert.equal(page.reads[0].pathname, '/api/verify/trials');
  });
}

// A small page driver exercises the real story against independent served data
// and displayed text, including the coordinator's Meals 0 regression.
function outcomePage({ outcomes, cells, meals = '0' }) {
  const data = {
    admission: { state: 'available', active_kind: 'trial', active_id: 'synthetic-trial' },
    selected: { id: 'synthetic-trial', kind: 'trial',
      day_rows: { trial_period: [{ meals: 0 }] },
      reassessment: { comparison: { outcomes } } },
  };
  const page = apiPage(data);
  page.goto = async () => {};
  const texts = {
    '.gf-day-read': 'May 15, 2024\n288 glucose readings\nTime in range\t100%\nTime below range\t0%\nMeals\t0\nA day with readings is not necessarily a complete day of data.',
    '.gf-day-read tbody tr:last-child .v': meals,
    '[data-table="outcomes"]': `Before\tTrial\n${Object.values(cells).join('\n')}`,
    ...cells,
  };
  const inputs = { '[data-select="evidence-period"]': 'trial_period', '[data-select="evidence-day"]': '0' };
  page.locator = selector => {
    const node = {
      filter: () => node, first: () => node, waitFor: async () => {}, click: async () => {},
      inputValue: async () => { assert.ok(selector in inputs, selector); return inputs[selector]; },
      innerText: async () => { assert.ok(selector in texts, selector); return texts[selector]; },
    };
    return node;
  };
  return page;
}
const measured = {
  outcomes: [{ key: 'tbr', before: 0, after: 0, denominator: 'readings', denominators: { before: 288, after: 288 } }],
  cells: { '[data-outcome="tbr"] td:nth-child(2)': '0%\n288 readings', '[data-outcome="tbr"] td:nth-child(3)': '0%\n288 readings' },
};
test('S49 accepts the served daily Meals 0 and observed outcome zeroes', async () => {
  await C3_STORIES.S49(outcomePage(measured));
});
test('S49 rejects a daily count that differs from its selected served day', async () => {
  await assert.rejects(withReplayAssertionTimeout(10, () => C3_STORIES.S49(outcomePage({ ...measured, meals: '1' }))), /'1' !== '0'/);
});
for (const [denominator, n, text] of [['meals', 0, 'no meals'], ['readings', 0, 'no readings'], ['readings', 288, 'unavailable']]) {
  test(`S49 distinguishes ${text} from an observed zero`, async () => {
    const data = {
      outcomes: [{ key: 'sample', before: null, after: 0, denominator, denominators: { before: n, after: 288 } }],
      cells: { '[data-outcome="sample"] td:nth-child(2)': text, '[data-outcome="sample"] td:nth-child(3)': '0%\n288 readings' },
    };
    await C3_STORIES.S49(outcomePage(data));
    data.cells['[data-outcome="sample"] td:nth-child(2)'] = '0%';
    await assert.rejects(withReplayAssertionTimeout(10, () => C3_STORIES.S49(outcomePage(data))), /must name its missing population or measurement/);
  });
}
test('S49 rejects a missing-value label substituted for an observed zero', async () => {
  const data = structuredClone(measured);
  data.cells['[data-outcome="tbr"] td:nth-child(2)'] = 'no readings';
  await assert.rejects(withReplayAssertionTimeout(10, () => C3_STORIES.S49(outcomePage(data))), /expected to not match/);
});
test('an app story rejects a selected record different from the admitted watch', async () => {
  const page = apiPage({ admission: { state: 'available', active_kind: 'trial', active_id: 'one' }, selected: { id: 'two', kind: 'trial' } });
  await assert.rejects(C3_STORIES.S45(page), /selected record must be the admitted watch/);
});
test('history cannot treat the active Trial as a saved ending', async () => {
  const page = apiPage({ admission: { state: 'available', active_id: 'one' }, trials: [{ id: 'one', ending: { kind: 'user_finished' } }] });
  await assert.rejects(C3_STORIES.S54b(page), /ended Trial cannot occupy the active seat/);
});

test('a delayed destination is re-read without repeating the navigation click', async () => {
  let clicks = 0;
  let reads = 0;
  const control = {
    count: async () => 1,
    nth: () => control,
    isVisible: async () => true,
    click: async () => { clicks++; },
  };
  await goto({
    locator: () => control,
    waitForTimeout: async () => {},
    evaluate: async () => { reads++; return reads < 3 ? 'overview' : 'explore'; },
  }, 'explore');
  assert.equal(clicks, 1, 'the original action stays single-shot');
  assert.equal(reads, 3, 'each attempt reads the destination exactly once');
});

test('late harness controls are observed before their one change event', async () => {
  const previous = globalThis.document;
  const changes = [];
  const control = { options: [{ value: 'synthetic', textContent: 'Synthetic case' }],
    dispatchEvent: event => { changes.push(event.type); } };
  let reads = 0;
  const page = {
    evaluate: async (read, arg) => read(arg),
    waitForTimeout: async () => {},
  };
  try {
    globalThis.document = { querySelector: () => ++reads === 1 ? null : control };
    assert.equal(await harnessSelect(page, 'scenario', 'Synthetic'), 'Synthetic case');
    assert.equal(control.value, 'synthetic');
    assert.deepEqual(changes, ['change']);
    reads = 0;
    await harnessCheck(page, 'readFails', true);
    assert.equal(control.checked, true);
    assert.deepEqual(changes, ['change', 'change'], 'waiting never redispatches a change');
  } finally { globalThis.document = previous; }
});

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
    await withReplayAssertionTimeout(10, () => assert.rejects(harnessSelect({
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
  await withReplayAssertionTimeout(10, () => assert.rejects(S03(page), error => {
    for (const claim of ['primary touch moves the left full-height gate', 'left primary touch holds the far gate',
      'primary touch moves the right full-height gate', 'right primary touch holds the far gate']) {
      assert.ok(error.message.includes(claim), claim);
    }
    return true;
  }));
  assert.equal(touches, 2, 'neither the failed left wait nor the right wait repeats its action');
});
