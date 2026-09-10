import test from 'node:test';
import assert from 'node:assert/strict';
import { openApp, REGISTRY } from '../frontend/harmonic-v2-desktop-behavior.replay.mjs';
import { C3_CASES, C3_STORIES } from './c3.replay.mjs';

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
  await assert.rejects(C3_STORIES.S49(outcomePage({ ...measured, meals: '1' })), /'1' !== '0'/);
});
for (const [denominator, n, text] of [['meals', 0, 'no meals'], ['readings', 0, 'no readings'], ['readings', 288, 'unavailable']]) {
  test(`S49 distinguishes ${text} from an observed zero`, async () => {
    const data = {
      outcomes: [{ key: 'sample', before: null, after: 0, denominator, denominators: { before: n, after: 288 } }],
      cells: { '[data-outcome="sample"] td:nth-child(2)': text, '[data-outcome="sample"] td:nth-child(3)': '0%\n288 readings' },
    };
    await C3_STORIES.S49(outcomePage(data));
    data.cells['[data-outcome="sample"] td:nth-child(2)'] = '0%';
    await assert.rejects(C3_STORIES.S49(outcomePage(data)), /must name its missing population or measurement/);
  });
}
test('S49 rejects a missing-value label substituted for an observed zero', async () => {
  const data = structuredClone(measured);
  data.cells['[data-outcome="tbr"] td:nth-child(2)'] = 'no readings';
  await assert.rejects(C3_STORIES.S49(outcomePage(data)), /expected to not match/);
});
test('an app story rejects a selected record different from the admitted watch', async () => {
  const page = apiPage({ admission: { state: 'available', active_kind: 'trial', active_id: 'one' }, selected: { id: 'two', kind: 'trial' } });
  await assert.rejects(C3_STORIES.S45(page), /selected record must be the admitted watch/);
});
test('history cannot treat the active Trial as a saved ending', async () => {
  const page = apiPage({ admission: { state: 'available', active_id: 'one' }, trials: [{ id: 'one', ending: { kind: 'user_finished' } }] });
  await assert.rejects(C3_STORIES.S54b(page), /ended Trial cannot occupy the active seat/);
});
