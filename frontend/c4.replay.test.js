import test from 'node:test';
import assert from 'node:assert/strict';
import { withReplayAssertionTimeout } from './replay-assertions.mjs';
import { historicalAbsence, C4_RETIREMENTS, assertS107RosterGeometry } from './c4.replay.mjs';
import { REGISTRY } from './desk-behavior.replay.mjs';
import { storyCase } from './replay-cases.mjs';

function inputPage(rows, roster = { trials: [{}], focuses: [{}] }) {
  return {
    url: () => 'http://synthetic.invalid/',
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

test('S106 and S107 are unique app-only C4 stories with their required manufactured cases', () => {
  for (const [id, expectedCase, term] of [['S106', 'pattern-near-tie', 'HV2-17'], ['S107', 'showcase', 'HV2-11']]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, term);
    assert.equal(storyCase(id), expectedCase);
  }
});

test('S107 keeps a grouped comparison heading distinct from readable mixed-tier case rows', () => {
  const rect = (left, right, top = 0, bottom = 10) => ({ left, right, top, bottom });
  const event = { comparisonCohort: 'matched',
    description: { text: '130 · Completed carb bolus', truncated: false, ...rect(120, 260) }, tier: null };
  const fired = { description: { text: '130 · Completed carb bolus', truncated: false, ...rect(120, 260) },
    tier: { text: 'Meets criteria', ...rect(280, 360) } };
  const near = { description: { text: '130 · Completed carb bolus', truncated: false, ...rect(120, 260) },
    tier: { text: 'Borderline', ...rect(280, 350) } };
  const expectedCohorts = [
    { key: 'matched', name: 'Matched' },
    { key: 'nearly_matched', name: 'Nearly matched' },
    { key: 'comparison', name: 'Other completed carb-bolus meals' },
  ];
  assert.doesNotThrow(() => assertS107RosterGeometry({
    comparison: { cohortHeadings: expectedCohorts.map(cohort => cohort.name), rows: [event] }, tierRows: [fired, near], expectedCohorts,
  }));
  assert.throws(() => assertS107RosterGeometry({
    comparison: { cohortHeadings: expectedCohorts.slice(1).map(cohort => cohort.name), rows: [event] }, tierRows: [fired, near], expectedCohorts,
  }), /exact served cohorts once/);
  assert.throws(() => assertS107RosterGeometry({
    comparison: { cohortHeadings: expectedCohorts.map(cohort => cohort.name), rows: [{ ...event, description: { ...event.description, truncated: true } }] },
    tierRows: [fired, near], expectedCohorts,
  }), /fully readable/);
  assert.throws(() => assertS107RosterGeometry({
    comparison: { cohortHeadings: expectedCohorts.map(cohort => cohort.name), rows: [event] },
    tierRows: [{ ...fired, tier: { ...fired.tier, truncated: true } }, near], expectedCohorts,
  }), /fully readable/);
  assert.throws(() => assertS107RosterGeometry({
    comparison: { cohortHeadings: expectedCohorts.map(cohort => cohort.name), rows: [event] },
    tierRows: [{ ...fired, tier: { ...fired.tier, ...rect(240, 360) } }, near], expectedCohorts,
  }), /columns overlap/);
});

test('S108–S112 are unique app-only C4 stories with their required manufactured cases', () => {
  for (const [id, expectedCase, term] of [
    ['S108', 'showcase', 'HV2-34'], ['S109', 'showcase', 'HV2-34'],
    ['S110', 'edit-chain', 'HV2-28'], ['S111', 'edit-chain', 'HV2-28'], ['S112', 'edit-chain', 'HV2-28'],
  ]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, term);
    assert.equal(storyCase(id), expectedCase);
  }
});

// A minimal fake page for the #414 chunk 3 stories. `click` on the Diagnose nav
// button simulates the one GET /api/status the retained desk issues by routing
// it through any registered `**/api/status*` handler, so the held-request
// control flow runs without a real browser or server.
function qa414Page({ crumb = 'Finding X', extraRequest = null } = {}) {
  const actions = [];
  const routes = new Map();
  const requestListeners = new Set();
  let url = 'http://synthetic.invalid/?to=diagnose';
  let level = { scrollTop: 0, scrollHeight: 400, clientHeight: 100 };
  const fireRequest = pathname => {
    const request = { url: () => `http://synthetic.invalid${pathname}` };
    for (const listener of requestListeners) listener(request);
    for (const [pattern, handler] of routes) {
      if (pattern.replace('**', '').replace('*', '') && pathname.startsWith(pattern.replace('**', '').replace('*', ''))) {
        handler({ request: () => request, continue: async () => { actions.push(`continued:${pathname}`); } });
      }
    }
  };
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    waitFor: async () => { actions.push(`wait:${selector}`); },
    click: async () => {
      actions.push(`click:${selector}`);
      if (selector === 'nav.v2-nav [data-destination="diagnose"]') {
        if (extraRequest) fireRequest(extraRequest);
        fireRequest('/api/status');
      }
    },
    getAttribute: async name => {
      if (selector.includes('qrow') && name === 'data-id') return 'finding:x';
      if (name === 'aria-pressed') return 'true';
      return null;
    },
    innerText: async () => selector.includes('crumb-trail') ? crumb
      : selector.includes('seg-window') ? 'Slot 03:00' : '',
    evaluate: async fn => {
      if (selector !== '#level') return null;
      if (fn.toString().includes('node.scrollTop = Math.min')) {
        level.scrollTop = Math.min(40, level.scrollHeight - level.clientHeight);
        return level.scrollTop;
      }
      return level.scrollTop;
    },
    count: async () => 1,
  });
  return {
    _actions: actions,
    url: () => url,
    goto: async target => { url = target; actions.push(`goto:${target}`); },
    locator: node,
    getByRole: (_role, { name }) => node(String(name)),
    waitForFunction: async () => { actions.push('waitForFunction'); },
    waitForLoadState: async state => { actions.push(`waitForLoadState:${state}`); },
    route: async (pattern, handler) => { routes.set(pattern, handler); },
    unroute: async pattern => { routes.delete(pattern); },
    on: (type, listener) => { if (type === 'request') requestListeners.add(listener); },
    off: (type, listener) => { if (type === 'request') requestListeners.delete(listener); },
    waitForResponse: () => Promise.resolve({ ok: () => true, url: () => 'http://synthetic.invalid/api/status' }),
  };
}

test('S108 reaches its held-return assertions after a clean round trip through Changes', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa414Page();
  await C4_STORIES.S108(page);
  assert.ok(page._actions.includes('click:[data-destination="diagnose"]'));
  assert.ok(page._actions.includes('click:nav.v2-nav [data-destination="diagnose"]'));
  assert.ok(page._actions.includes('continued:/api/status'), 'the held status read must be released and continued');
});

test('S108 fails when the return issues more than the held status check', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa414Page({ extraRequest: '/api/diagnose/findings' });
  await assert.rejects(C4_STORIES.S108(page), /no request besides the held status check/);
});

test('S108 surfaces a lost status response as its own assertion, never an unhandled rejection', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa414Page();
  // Playwright's own waitForResponse can reject on its own clock, independent
  // of the held-request wait. Before the fix, a bare unattached promise like
  // this crashed the whole runner instead of failing this one story.
  page.waitForResponse = () => Promise.reject(new Error('synthetic Playwright response timeout'));
  const unhandled = [];
  const onUnhandledRejection = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandledRejection);
  try {
    await assert.rejects(C4_STORIES.S108(page),
      /S108 the return must issue GET \/api\/status; none arrived within 30 s/);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandled, [], 'the lost response must never escape as an unhandled rejection');
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
});

test('S109 settles the network before scrolling, then preserves the offset across the held round trip', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa414Page();
  await C4_STORIES.S109(page);
  assert.equal(page._actions.filter(action => action === 'waitForLoadState:networkidle').length, 1,
    'S109 must settle on the network before reading #level');
  const waitIndex = page._actions.indexOf('waitForLoadState:networkidle');
  const scrollWaitIndex = page._actions.indexOf('wait:#level');
  assert.ok(waitIndex >= 0 && scrollWaitIndex > waitIndex,
    'S109 must wait for the settled network before touching the reading pane');
});

function qa414EditChainPage({ summary = '3 setting changes · Basal · Sep 8 – Sep 10', editKey = 'edit-1',
  memberRecord = 'trial:member-1', memberCount = 3, flatCount = 1, cellWord = 'Not watched', cellCount = 4 } = {}) {
  let url = 'http://synthetic.invalid/?to=changes&subject=history';
  const node = selector => ({
    filter() { return this; }, first() { return this; }, nth() { return this; },
    waitFor: async () => {},
    click: async () => { if (selector.startsWith('[data-record')) url += `&occurrence=record:${memberRecord}`; },
    count: async () => {
      if (selector.includes('gf-edit-row')) return 1;
      if (selector.includes(`data-edit-member="${editKey}"`)) return memberCount;
      if (selector.includes(':not(.gf-edit-row):not([data-edit-member])')) return flatCount;
      if (selector === '[data-record-open="true"]') return cellCount;
      return 1;
    },
    getAttribute: async name => {
      if (name === 'data-edit') return editKey;
      if (name === 'data-record') return memberRecord;
      return null;
    },
    innerText: async () => selector.includes('gf-edit-summary') ? summary
      : selector.includes('following-sibling::small') ? cellWord : '',
    locator: nested => node(nested),
  });
  return {
    url: () => url,
    goto: async target => { url = target; },
    locator: node,
  };
}

test('S110 counts the titled Edit entry and its members, then addresses and reloads the exact member record', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S110(qa414EditChainPage());
});

test('S110 fails when the served Edit entry does not name its member count', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(C4_STORIES.S110(qa414EditChainPage({ summary: 'Basal changed' })),
    /must name its member count/);
});

test('S111 fails on a raw disposition token, and passes on the served word', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S111(qa414EditChainPage());
  await assert.rejects(C4_STORIES.S111(qa414EditChainPage({ cellWord: 'not_selected_for_watch' })),
    /never a raw disposition token/);
});

function qa414RecordHoldPage({ recordSelector = 'trial:member-1' } = {}) {
  let url = 'http://synthetic.invalid/?to=diagnose';
  const routes = new Map();
  const fire = (pathname, search = '') => {
    const request = { url: () => `http://synthetic.invalid${pathname}${search}` };
    for (const [pattern, handler] of routes) {
      const base = pattern.replace('**', '').replace('*', '');
      if (base && pathname.startsWith(base)) handler({ request: () => request, continue: async () => {} });
    }
  };
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    waitFor: async () => {},
    click: async () => {
      if (selector.startsWith('table.gf-table [data-record]')) fire('/api/verify/trials', `?selected=${recordSelector}`);
      if (selector === '[data-assessment="retained"]') fire('/api/verify/trials', `?selected=${recordSelector}&assessment=retained`);
    },
    getAttribute: async () => recordSelector,
    count: async () => 1,
    locator: nested => node(nested),
  });
  return {
    url: () => url,
    goto: async target => { url = target; fire('/api/verify/trials', ''); },
    locator: selector => node(selector),
    route: async (pattern, handler) => { routes.set(pattern, handler); },
    unroute: async pattern => { routes.delete(pattern); },
  };
}

test('S112 holds the roster, record and reassessment reads in turn and reaches its final assertion', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S112(qa414RecordHoldPage());
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
  const page = admission => ({ url: () => 'http://synthetic.invalid/',
    request: { get: async () => ({ status: () => 200, text: async () => '', json: async () => ({ admission }) }) } });
  await assert.rejects(C4_RETIREMENTS.R17(page({ active_kind: 'focus', can_finish_trial: true })), /served active Trial/);
  await assert.rejects(C4_RETIREMENTS.R17(page({ active_kind: 'trial', can_finish_trial: false })), /finishable Trial/);
});


// These exercise story control flow without Chromium. A missing helper or an
// unreachable setup control must not be mistaken for the feature assertion.
// The coordinator still owns the actual browser fail-first proof.
function qa404Page() {
  const actions = [];
  const brace = (width = 500, range = [720, 1080]) => {
    const x = minute => 34 + minute / 1425 * (width - 86);
    return { width, selected: 'Afternoon', grips: Object.fromEntries(['a', 'b'].map((name, index) =>
      [name, { x: x(range[index]), y: 70, left: x(range[index]) }])) };
  };
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    waitFor: async () => {},
    click: async () => { actions.push(selector); },
    boundingBox: async () => ({ x: 0, y: 0, width: 500, height: 210 }),
    evaluate: async fn => fn.toString().includes('document.querySelector') ? brace() : 500,
  });
  return {
    actions, node,
    url: () => 'http://synthetic.invalid/',
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
  assert.deepEqual(page.actions, ['[data-destination="diagnose"]', '24 h', 'Afternoon']);
});

test('S102 reaches graph identity after opening a Pattern and selecting a thin slot', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa404Page();
  const id = 'pattern:highs_after_meals';
  page.request = { get: async () => ({ status: () => 200, text: async () => '',
    json: async () => ({ rendered_rows: [{ id, kind: 'pattern', pattern_chart: { key: 'highs_after_meals' } }] }) }) };
  page.locator = selector => ({ ...page.node(selector), getAttribute: async () => id });
  page.getByRole = (_role, { name }) => ({ ...page.node(String(name)), getAttribute: async () => 'nodata' });
  await assert.rejects(withReplayAssertionTimeout(80, () => C4_STORIES.S102(page)),
    error => error.cause?.code === 'ERR_ASSERTION' && error.message.includes(graph404));
  assert.deepEqual(page.actions.slice(0, 4), ['[data-destination="diagnose"]', '24 h', 'All charts',
    `#tile-row .evidence-tile[data-chart-id="${id}"]`]);
  assert.equal(page.actions.at(-1), String(/^12:00 basal slot,/));
});

test('S102 waits through intermediate focal frames without selecting the slot again', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa404Page();
  const id = 'pattern:highs_after_meals';
  page.request = { get: async () => ({ status: () => 200, text: async () => '',
    json: async () => ({ rendered_rows: [{ id, kind: 'pattern', pattern_chart: {} }] }) }) };
  const frames = [null, id, 'basal:720'];
  page.locator = selector => ({ ...page.node(selector), getAttribute: async () => frames.shift() });
  page.getByRole = (_role, { name }) => ({ ...page.node(String(name)), getAttribute: async () => 'nodata' });
  await C4_STORIES.S102(page);
  assert.equal(frames.length, 0);
  assert.equal(page.actions.filter(action => action === String(/^12:00 basal slot,/)).length, 1);
});

test('S103 reaches its aggregate return assertion after exercising all three window entries', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa404Page();
  const whole = { label: '24 h', min: 0, max: 95 };
  const morning = { ...whole, label: 'Morning' };
  const drawn = { ...whole, label: '15:30–21:30 ×' };
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

for (const width of [480, 760]) {
  test(`S101 measures the brace at chart width ${width} and observes each snapped move before release`, async () => {
    const { C4_STORIES } = await import('./c4.replay.mjs');
    const { xAtMinute, minuteAtX, snapWindow } = await import('./diagnose-workstation-chart.js');
    const page = qa404Page();
    const chart = { clientWidth: width };
    let range = [720, 1080], origin = 120, measured = false, laidOut = false;
    let pointer, held = false, edge, pending = null, chip = null;
    const measurements = [], painted = [], moves = [];
    page.locator = selector => ({ ...page.node(selector),
      evaluate: async fn => {
        assert.equal(selector, '#chart');
        if (!laidOut) return width;
        assert.ok(laidOut, 'wait for layout and animations before sampling grip pixels');
        measured = true; laidOut = false;
        measurements.push([...range]);
        return { width, selected: 'Afternoon', grips: Object.fromEntries(['a', 'b'].map((name, i) =>
          [name, { x: origin + xAtMinute(chart, range[i]), y: 68, left: xAtMinute(chart, range[i]) }])) };
      },
      innerText: async () => chip,
    });
    page.waitForFunction = async (predicate, expected, options) => {
      if (predicate.constructor.name === 'AsyncFunction') { laidOut = true; return; }
      if (typeof expected !== 'string') return;
      assert.equal(options.timeout, 7000);
      // The app paints on a frame, and pointerup cancels an outstanding frame.
      // A chip wait must occur while held, before release, to observe that paint.
      if (pending) {
        assert.ok(held); range = pending; pending = null;
        chip = `Window ${expected} ×`; painted.push([...range]);
      }
      assert.equal(chip?.replace(/^Window\s+/, '').replace('×', '').trim(), expected);
    };
    page.mouse = {
      move: async (x, y) => {
        assert.ok(measured, 'the gesture must use freshly measured grips');
        assert.equal(y, 68, 'use the grip, not a guessed mid-chart ordinate');
        pointer = x; moves.push(x);
        if (held) {
          const minute = minuteAtX(chart, x - origin);
          pending = edge === 'a' ? snapWindow([minute, range[1]], 45, 'end')
            : snapWindow([range[0], minute], 45, 'start');
        }
      },
      down: async () => {
        held = true;
        edge = Math.abs(pointer - origin - xAtMinute(chart, range[0])) < 1 ? 'a' : 'b';
        assert.ok(Math.abs(pointer - origin - xAtMinute(chart, range[edge === 'a' ? 0 : 1])) < 1);
      },
      up: async () => {
        assert.equal(pending, null, 'releasing before paint loses the final move');
        held = false; measured = false; origin += 23; // force a fresh measurement for the other edge
      },
    };
    await assert.rejects(C4_STORIES.S101(page), { code: 'ERR_ASSERTION', message: new RegExp(copy404) });
    assert.deepEqual(measurements, [[720, 1080], [720, 1290]]);
    assert.deepEqual(painted, [[720, 1290], [930, 1290]]);
    assert.equal(moves.at(1), moves.at(2), 'the first resize repeats its terminal coordinate before release');
    assert.equal(moves.at(4), moves.at(5), 'the second resize repeats its terminal coordinate before release');
  });
}

test('S101 rejects an unpainted 24 h brace before it can drag the named Afternoon preset', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const { xAtMinute } = await import('./diagnose-workstation-chart.js');
  const page = qa404Page();
  const chart = { clientWidth: 480 };
  const stale = [0, 1440];
  page.locator = selector => ({ ...page.node(selector),
    evaluate: async fn => fn.toString().includes('document.querySelector')
      ? ({ width: chart.clientWidth, selected: 'Afternoon', grips: Object.fromEntries(
      ['a', 'b'].map((name, index) => [name, {
        x: xAtMinute(chart, stale[index]), y: 68, left: xAtMinute(chart, stale[index]),
      }]),
    ) }) : chart.clientWidth,
  });
  page.mouse.down = async () => assert.fail('a stale 24 h brace must fail before the mouse gesture');
  await assert.rejects(C4_STORIES.S101(page),
    /Afternoon brace must span 12:00–18:00 before dragging/);
  assert.deepEqual(page.actions, ['[data-destination="diagnose"]', '24 h', 'Afternoon']);
});

for (const seen of ['(absent)', '12:00–18:00 ×']) {
  test(`a bounded drawn-window failure reports chip seen: ${seen}`, async () => {
    const { C4_STORIES } = await import('./c4.replay.mjs');
    const page = qa404Page();
    let released = false;
    page.mouse.up = async () => { released = true; };
    page.waitForFunction = async (_predicate, expected, options) => {
      if (typeof expected === 'string') {
        assert.equal(options.timeout, 7000);
        throw new Error('simulated chip timeout');
      }
    };
    const x = minute => 34 + minute / 1425 * (500 - 86);
    page.locator = selector => ({ ...page.node(selector),
      evaluate: async fn => {
        if (selector === '#seg-window') return seen;
        return fn.toString().includes('document.querySelector')
          ? { width: 500, selected: 'Afternoon', grips: Object.fromEntries(['a', 'b'].map((name, index) =>
            [name, { x: x([720, 1080][index]), y: 70, left: x([720, 1080][index]) }])) }
          : 500;
      },
    });
    await assert.rejects(C4_STORIES.S101(page), error => {
      assert.equal(error.code, 'ERR_ASSERTION');
      assert.equal(error.message, `#404 drawn-window premise: expected 12:00–21:30; chip seen: ${seen}`);
      return true;
    });
    assert.equal(released, true, 'a failed live-chip wait must release the pointer');
  });
}
