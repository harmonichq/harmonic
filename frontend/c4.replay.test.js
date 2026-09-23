import test from 'node:test';
import assert from 'node:assert/strict';
import { withReplayAssertionTimeout } from './replay-assertions.mjs';
import {
  historicalAbsence, C4_RETIREMENTS, assertS107RosterGeometry, assertBasalLaneGallery, assertRankedMinis,
  assertBasalLaneReachable, LANE_REACH_SIZES, assertRecurringLowsVariant,
} from './c4.replay.mjs';
import { C2_STORIES } from './c2.replay.mjs';
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

test('S108–S114 are unique app-only C4 stories with their required manufactured cases', () => {
  for (const [id, expectedCase, term] of [
    ['S108', 'showcase', 'HV2-34'], ['S109', 'showcase', 'HV2-34'],
    ['S110', 'edit-chain', 'HV2-28'], ['S111', 'edit-chain', 'HV2-28'], ['S112', 'edit-chain', 'HV2-28'],
    ['S113', 'basal-verdict-gallery', 'HV2-17'], ['S114', 'showcase', 'HV2-29'],
  ]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, term);
    assert.equal(storyCase(id), expectedCase);
  }
});

test('S142 and S143 are unique app-only C4 record stories with their manufactured cases', () => {
  for (const [id, expectedCase] of [['S142', 'c3-trial'], ['S143', 'edit-chain']]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, 'HV2-28');
    assert.equal(storyCase(id), expectedCase);
  }
});

test('S115–S117 are unique app-only C4 rail stories, served from the showcase', () => {
  const term = '#413 design lock';
  for (const id of ['S115', 'S116', 'S117']) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, term);
    assert.equal(storyCase(id), 'showcase');
  }
});

test('S127 is a unique app-only Day story, served from the showcase', () => {
  const entries = REGISTRY.filter(([entry]) => entry === 'S127');
  assert.equal(entries.length, 1, 'S127 is registered once');
  assert.equal(entries[0][1].deferred.term, 'HV2-13');
  assert.equal(storyCase('S127'), 'showcase');
});

test('S139 and S140 are unique app-only C4 dock stories on their watched cases', () => {
  for (const [id, expectedCase] of [['S139', 'c3-trial'], ['S140', 'c3-focus']]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, 'HV2-12');
    assert.equal(storyCase(id), expectedCase);
  }
});

test('S151–S153 are unique app-only C4 basal-lane stories, served from the verdict gallery', () => {
  for (const id of ['S151', 'S152', 'S153']) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, 'HV2-17');
    assert.equal(storyCase(id), 'basal-verdict-gallery');
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

// Routes behave as Playwright's do: the newest matching handler takes the
// request, `continue()` sends it on, and `unroute` removes one handler. A
// record read that is sent on renders the open record, which (ADR 430) asks for
// its retained comparison with no control pressed.
function qa414RecordHoldPage({ recordSelector = 'trial:member-1' } = {}) {
  let url = 'http://synthetic.invalid/?to=diagnose';
  let routes = [];
  const fire = (pathname, search = '') => {
    const request = { url: () => `http://synthetic.invalid${pathname}${search}` };
    const params = new URLSearchParams(search);
    const sent = async () => {
      if (params.has('selected') && !params.has('assessment')) fire(pathname, `${search}&assessment=retained`);
    };
    const route = routes.find(([pattern]) => {
      const base = pattern.replace('**', '').replace('*', '');
      return base && pathname.startsWith(base);
    });
    if (route) route[1]({ request: () => request, continue: sent });
    else sent();
  };
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    waitFor: async () => {},
    click: async () => {
      if (selector.startsWith('table.gf-table [data-record]')) fire('/api/verify/trials', `?selected=${recordSelector}`);
    },
    getAttribute: async () => recordSelector,
    count: async () => 1,
    locator: nested => node(nested),
  });
  return {
    url: () => url,
    goto: async target => { url = target; fire('/api/verify/trials', ''); },
    locator: selector => node(selector),
    route: async (pattern, handler) => { routes.unshift([pattern, handler]); },
    unroute: async (pattern, handler) => { routes = routes.filter(([p, h]) => p !== pattern || h !== handler); },
  };
}

test('S112 holds the roster and record reads, then the retained read the record asks for itself', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S112(qa414RecordHoldPage());
});

// #430: one still-open record on a Changes roster. Pressing its row sends the
// record read and, when `retainedOnOpen`, the retained read the record door
// makes with no control pressed; the rendered record is read back by selector.
function qa430RecordPage({ retainedOnOpen = true, figureState = 'paired', periods = 1, pressed = 1, stillOpen = 1,
  canvases = figureState === 'paired' ? 1 : 0, served = { state: 'unavailable', reason: 'missing_comparison_context' },
  figureReason = 'no retained comparison context was recorded with this change',
  result = 'Unavailable · no retained comparison context was recorded with this change',
  stage = 'Setting change · Still open\ncomparison unavailable' } = {}) {
  let url = 'http://synthetic.invalid/?to=diagnose';
  const listeners = new Set();
  const send = search => {
    const request = { url: () => `http://synthetic.invalid/api/verify/trials${search}` };
    for (const listener of listeners) listener(request);
  };
  const counts = {
    'table.gf-table tr [data-record]': 1,
    '[data-period="before"]': periods, '[data-period="after"]': periods,
    '[data-figure-state="paired"] .gf-chart canvas': figureState === 'paired' ? canvases : 0,
    '[data-figure-state="unavailable"]': figureState === 'unavailable' ? 1 : 0,
    '[data-assessment="retained"][aria-pressed="true"]': pressed,
    '[data-unavailable="ending"]': stillOpen,
    '.gf-stage .gf-chart canvas': canvases,
  };
  const text = { '[data-figure-reason]': figureReason, '[data-reassessment-state]': result, '.gf-stage': stage };
  const node = selector => ({
    first() { return this; },
    locator: nested => node(`${selector} ${nested}`),
    waitFor: async () => {},
    count: async () => counts[selector] ?? 0,
    innerText: async () => text[selector] ?? '',
    getAttribute: async name => (name === 'data-record' ? 'trial:open-1' : null),
    click: async () => {
      send('?selected=open-1&kind=trial');
      if (retainedOnOpen) send('?selected=open-1&kind=trial&assessment=retained');
    },
  });
  return {
    url: () => url,
    goto: async target => { url = target; send(''); },
    locator: selector => node(selector),
    on: (type, listener) => { if (type === 'request') listeners.add(listener); },
    off: (type, listener) => { if (type === 'request') listeners.delete(listener); },
    request: { get: async () => ({ status: () => 200, text: async () => '',
      json: async () => ({ selected: { reassessment: { comparison: { availability: served } } } }) }) },
  };
}

test('S142 opens the still-open record and finds its retained comparison with no press', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S142(qa430RecordPage());
});

test('S142 fails at its feature assertion when opening the record asks for no retained comparison', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(C4_STORIES.S142(qa430RecordPage({ retainedOnOpen: false, figureState: 'not-requested', periods: 0, pressed: 0 })),
    /S142 opening a still-open record must request its retained comparison once, with no control pressed/);
});

test('S143 reads an unavailable figure naming its reason in the result line\u2019s words', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S143(qa430RecordPage({ figureState: 'unavailable', periods: 0 }));
});

test('S143 fails at its feature assertion when the record shows no unavailable figure', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S143(qa430RecordPage({
    figureState: 'not-requested', periods: 0, figureReason: '', result: '',
    stage: 'no clock envelope is retained for this record\n0 → 0 half-hours read',
  }))), /S143 the figure must read as an unavailable comparison/);
});

test('S143 fails when the figure prints the served code instead of its words', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S143(qa430RecordPage({
    figureState: 'unavailable', periods: 0, figureReason: 'missing_comparison_context',
    result: 'Unavailable · missing_comparison_context',
  }))), /S143 the figure must name the reason in words, never its code/);
});

// #413: a cold Diagnose arrival. `reload()` fires the held /api/analyze route
// synchronously (mirroring real navigation, which commits before client-side
// fetches resolve); the loading frame's skeleton is asserted while the read
// is still held open.
function qa413ColdDiagnosePage({ skeletons = { stage: 1, rail: 1 }, marks = 4, skeletonText = '',
  status = 'Loading Diagnose', railWidth = 430, reference = '430px', animationName = 'none', spilled = 0 } = {}) {
  const routes = new Map();
  const fire = pathname => {
    const request = { url: () => `http://synthetic.invalid${pathname}` };
    for (const [pattern, handler] of routes) {
      const base = pattern.replace('**', '').replace('*', '');
      if (base && pathname.startsWith(base)) handler({ request: () => request, continue: async () => {} });
    }
  };
  const pane = selector => (selector.startsWith('.gf-loading ') ? 'stage'
    : selector.includes('.gf-pane-body > .gf-skeleton') ? 'rail' : null);
  const node = selector => ({
    waitFor: async () => {},
    locator: sub => node(`${selector} ${sub}`),
    count: async () => {
      if (selector.endsWith(' .gf-skel')) return marks;
      if (pane(selector)) return skeletons[pane(selector)];
      return 1;
    },
    innerText: async () => skeletonText,
    getAttribute: async name => (name === 'aria-label' ? status : null),
    boundingBox: async () => ({ x: 0, y: 0, width: railWidth, height: 400 }),
  });
  return {
    url: () => 'http://synthetic.invalid/?to=diagnose',
    reload: async () => { fire('/api/analyze'); },
    locator: node,
    route: async (pattern, handler) => { routes.set(pattern, handler); },
    unroute: async pattern => { routes.delete(pattern); },
    emulateMedia: async () => {},
    evaluate: async fn => {
      const src = fn.toString();
      if (src.includes('animationName')) return animationName;
      if (src.includes('getBoundingClientRect')) return spilled;
      return reference;
    },
  };
}

test('S114 stands the skeleton while the cold analyze read is held, then releases it', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S114(qa413ColdDiagnosePage());
});

test('S114 fails when the skeleton still carries text, count or value', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES.S114(qa413ColdDiagnosePage({ skeletonText: '3 findings' })),
    /must state no count, title or value/));
});

test('S114 fails when the rail pane stands without its own skeleton', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES.S114(qa413ColdDiagnosePage({ skeletons: { stage: 1, rail: 0 } })),
    /must carry one rail skeleton block/));
});

test('S114 fails when a skeleton mark runs past the loading card', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES.S114(qa413ColdDiagnosePage({ spilled: 1 })),
    /the loading card must contain its skeleton; 1 mark\(s\) run past it/));
});

test('S114 fails when the rail does not hold the Diagnose reference width', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES.S114(qa413ColdDiagnosePage({ railWidth: 256 })),
    /reference width/));
});

test('S114 fails when the skeleton still animates under reduced motion', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(C4_STORIES.S114(qa413ColdDiagnosePage({ animationName: 'gf-skel-shimmer' })),
    /hold still under reduced motion/);
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


// R8's case ('behavioral-carb-undercount') claims finding:carb_undercount
// under a Pattern (#413): the served row is a `.qmember` under a closed fold,
// never a sibling `.qrow`. A raw `.qrow[data-id]` lookup (the pre-#413
// locator) never resolves for it — this fails on that locator and passes
// only through the fold-aware `railRowLocator` resolution.
function foldedComparisonPage(id) {
  const actions = [];
  const qrowSel = `#level .qrow[data-id="${id}"]`;
  const qmemberSel = `#level .qmember[data-id="${id}"]`;
  const foldSel = '#level .qfold[aria-expanded="false"]';
  let foldClosed = true;
  const node = selector => ({
    first() { return this; },
    filter() { return this; },
    count: async () => {
      if (selector === qrowSel) return 0;
      if (selector === foldSel) return foldClosed ? 1 : 0;
      if (selector === qmemberSel) return 1;
      return 1;
    },
    waitFor: async () => {
      if (selector === qrowSel) throw new Error(`Timeout waiting for ${qrowSel}`);
    },
    click: async () => {
      actions.push(selector);
      if (selector === foldSel) foldClosed = false;
    },
    getAttribute: async () => null,
  });
  return {
    actions,
    url: () => 'http://synthetic.invalid/',
    locator: node,
    getByRole: (_role, { name }) => node(String(name)),
    waitForFunction: async () => true,
    waitForResponse: async predicateFn => {
      const response = {
        url: () => 'http://synthetic.invalid/api/diagnose/finding-case-file?finding_id=' + encodeURIComponent(id),
        ok: () => true,
        json: async () => ({ finding: { id }, projection: { alignment: 'event' } }),
      };
      assert.ok(predicateFn(response), 'fake response never matched the expected finding-case-file request');
      return response;
    },
  };
}

test('R8 opens finding:carb_undercount through its Pattern fold, never a raw qrow lookup', async () => {
  const page = foldedComparisonPage('finding:carb_undercount');
  const file = await C2_STORIES.openComparisonCase(page, 'finding:carb_undercount');
  assert.equal(file.finding.id, 'finding:carb_undercount');
  assert.ok(page.actions.includes('#level .qfold[aria-expanded="false"]'),
    'R8 must open the closed fold before it can reach the claimed cause');
  assert.ok(page.actions.includes('#level .qmember[data-id="finding:carb_undercount"]'),
    'R8 must click the folded .qmember row, not a sibling .qrow');
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

// #413: a fake page for `assertBasalLaneGallery` — the scenario S113 drives
// after `openBasalLane`. It exercises the paint-comparison logic directly,
// without also having to fake that shared opener's own network reads and
// navigation (S31-S35 leave that same boundary to the coordinator's browser
// proof). Every knob defaults to a passing lane; each test below breaks
// exactly one.
function qa413GalleryPage({
  verdicts = { up: 5, down: 5, hold: 30, insufficient: 3, nodata: 5 },
  cellTokens = { up: 'color-mix(up)', down: 'color-mix(down)', hold: 'var(--ck-hold)', insufficient: 'transparent', nodata: 'transparent' },
  keyTokens = null,
  cellImages = { insufficient: 'repeating-linear-gradient(135deg, ...)', nodata: 'radial-gradient(circle, ...)' },
  keyImages = null,
  cellGlyph = { up: '""', down: '""' },
  keyGlyph = null,
  groundColor = 'rgb(20, 18, 15)',
  holdCellColor = 'rgb(164, 156, 144)',
  laneWrapBox = { x: 0, y: 0, width: 400, height: 40 },
  keyBox = { x: 0, y: 0, width: 400, height: 16 },
  laneBox = { x: 0, y: 24, width: 400, height: 11 },
  keyCounts = null,
  order = ['lane-key', 'lane'],
  staged = true,
  distinctSelection = true,
  marks = {},
  // #433: the canvas pane at the run's size — how far the lane runs below its
  // visible box, how far the pane can scroll, and whether the key wrapped
  paneOverrun = 0,
  paneScroll = 0,
  keyWrapped = false,
} = {}) {
  marks = { primary: 'rgb(224, 127, 63)', outlineStyle: 'solid', outlineColor: 'rgb(224, 127, 63)',
    fill: 'color(srgb 0.8 0.5 0.3 / 0.72)', underline: '""', underlineHeight: '2px', clipped: 0, ...marks };
  keyTokens = keyTokens || cellTokens;
  keyImages = keyImages || cellImages;
  keyGlyph = keyGlyph || cellGlyph;
  keyCounts = keyCounts || verdicts;
  const verdictOf = selector => (/data-verdict="([a-z]+)"/.exec(selector) || [])[1];
  // a key entry is its verdict, or its verdict and served reason (#433, D6)
  const entryOf = selector => {
    const reason = (/data-reason="([a-z-]+)"/.exec(selector) || [])[1];
    return reason ? `${verdictOf(selector)}:${reason}` : verdictOf(selector);
  };
  const box = (top, bottom, left, right) => ({ top, bottom, left, right, height: bottom - top });
  const lane = {
    pane: { top: 0, bottom: 616, left: 0, right: 850, overflowY: 'auto', scrollTop: 0, scrollLeft: 0,
      scrollHeight: 616 + paneScroll, clientHeight: 616 },
    wrap: box(575 + paneOverrun, 616 + paneOverrun, 0, 850),
    entries: [['Basal slots', 34, 89], ['raise 5', 100, 152], ['lower 5', 163, 218], ['hold 30', 229, 283],
      ['insufficient 3', 294, 378], ['no data 5', 389, 460]].map(([text, left, right], i, all) => {
      const top = 575 + (keyWrapped && i === all.length - 1 ? 16 : 0);
      return { text, ...box(top, top + 14, left, right) };
    }),
  };
  const node = selector => ({
    first() { return this; },
    click: async () => {},
    waitFor: async () => {},
    getAttribute: async name => {
      const verdict = verdictOf(selector);
      if (verdict === 'up' && name === 'data-staged') return staged ? 'true' : 'false';
      if (verdict === 'up' && name === 'aria-pressed') return distinctSelection ? 'false' : 'true';
      if (verdict === 'down' && name === 'aria-pressed') return 'true';
      return null;
    },
    innerText: async () => String(keyCounts[entryOf(selector)]),
    boundingBox: async () => {
      if (selector === '#lane-wrap') return laneWrapBox;
      if (selector === '#lane-key') return keyBox;
      if (selector === '#lane') return laneBox;
      return null;
    },
    evaluate: async fn => {
      const src = fn.toString();
      const isKey = selector.includes('#lane-key');
      const verdict = verdictOf(selector);
      if (selector === '#lane' && src.includes('backgroundColor')) return groundColor;
      if (src.includes("getPropertyValue('--cell')")) return (isKey ? keyTokens : cellTokens)[verdict];
      if (src.includes('::before')) return (isKey ? keyGlyph : cellGlyph)[verdict] || 'none';
      if (src.includes('backgroundImage')) return (isKey ? keyImages : cellImages)[verdict] || 'none';
      if (src.includes('backgroundColor')) return verdict === 'hold' ? holdCellColor : 'rgba(0, 0, 0, 0)';
      throw new Error(`unexpected evaluate on ${selector}: ${src}`);
    },
  });
  return {
    evaluate: async fn => {
      const src = fn.toString();
      if (fn.name === 'laneGeometry') return lane;
      if (src.includes('lane-wrap')) return order;
      if (src.includes('outlineStyle')) return { ...marks };
      if (src.includes('lane-cell')) return { ...verdicts };
      throw new Error(`unexpected page.evaluate: ${src}`);
    },
    locator: selector => node(selector),
  };
}

test('assertBasalLaneGallery passes on a lane serving all five verdicts, staged and selected', async () => {
  await assertBasalLaneGallery(qa413GalleryPage());
});

test('assertBasalLaneGallery fails closed when the case lacks a served verdict', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ verdicts: { up: 5, down: 5, hold: 30, nodata: 8 } })),
    /premise: the gallery case must serve a insufficient slot/);
});

test('assertBasalLaneGallery fails closed when the raise cell was never staged', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ staged: false })),
    /premise: the raise cell must carry the staged mark/));
});

test('assertBasalLaneGallery fails closed when the staged cell is also the selection', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ distinctSelection: false })),
    /staged cell and the selected cell must be distinct/));
});

test('assertBasalLaneGallery fails when the key count disagrees with the served lane count', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ keyCounts: { up: 4, down: 5, hold: 30, insufficient: 3, nodata: 5 } })),
    /the key's up count must equal the served lane count/);
});

test('assertBasalLaneGallery fails when a key mark does not share its cells\' --cell paint token', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({
      keyTokens: { up: 'color-mix(up)', down: 'wrong-token', hold: 'var(--ck-hold)', insufficient: 'transparent', nodata: 'transparent' },
    })),
    /the down key mark must share the cell's --cell paint token/);
});

test('assertBasalLaneGallery fails when a hold cell paints as the bare ground', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ holdCellColor: 'rgb(20, 18, 15)', groundColor: 'rgb(20, 18, 15)' })),
    /a hold cell must not paint as the bare ground/);
});

test('assertBasalLaneGallery fails when a raise/lower cell carries no directional glyph', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ cellGlyph: { up: 'none', down: '""' } })),
    /a up cell must carry its directional glyph/);
});

test('assertBasalLaneGallery fails when the insufficient key mark does not mirror its cells\' hatch/dot structure', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ keyImages: { insufficient: 'radial-gradient(circle, ...)', nodata: 'radial-gradient(circle, ...)' } })),
    /the insufficient key mark's structure must match/);
});

test('assertBasalLaneGallery fails when the key does not render above the cells', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ order: ['lane', 'lane-key'] })),
    /the key must render as the lane's head row, above the cells/));
});

test('assertBasalLaneGallery fails when lane cells overflow the lane track', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ marks: { clipped: 48 } })),
    /every lane cell must stand wholly inside the lane's track; 48 overflow it/);
});

test('assertBasalLaneGallery fails when the selected outline is not primary', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ marks: { outlineColor: 'rgb(242, 237, 226)' } })),
    /the selected cell must keep the primary outline/);
});

test('assertBasalLaneGallery fails when the staged mark is not an underline', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ marks: { underlineHeight: '11px' } })),
    /the staged mark must be an underline, not a fill/);
});

// #433: S113's pane checks at the run's own size, and its key counts scoped
// to verdict plus reason.
test('assertBasalLaneGallery fails when the lane overruns the canvas pane at rest', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ paneOverrun: 44 })),
    /the lane and every key entry must stand wholly inside the canvas pane at rest; #lane-wrap overruns it by 44px/));
});

test('assertBasalLaneGallery fails when the canvas pane has a scroll range at a supported size', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ paneScroll: 44 })),
    /the canvas pane must have no scroll range at this size; it scrolls 44px/));
});

test('assertBasalLaneGallery fails when the key wraps onto a second line at a supported size', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ keyWrapped: true })),
    /the key must stand on one line at this size; no data 5 wrapped below the lead entry/));
});

test('assertBasalLaneGallery counts a recurring-lows lower apart from a measured lower', async () => {
  const verdicts = { up: 5, down: 4, 'down:recurring-lows': 1, hold: 30, insufficient: 3, nodata: 5 };
  await assertBasalLaneGallery(qa413GalleryPage({ verdicts }));
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ verdicts, keyCounts: { ...verdicts, 'down:recurring-lows': 2 } })),
    /the key's down:recurring-lows count must equal the served lane count/);
});

// #433: a fake page for `assertBasalLaneReachable` — S151's scenario. Each size
// names how far the lane runs below the canvas pane's visible box at rest
// (`below`), whether the pane can scroll that far (`scrolls`), and how far the
// last key entry, the last cell and the chart run past its right edge
// (`past`). A wheel moves the fake pane within its scroll range, as a browser
// would; nothing else ever moves.
function qa433ReachPage(sizes = {}) {
  let viewport = { width: 1280, height: 720 };
  let offset = 0;
  const log = [];
  const at = () => ({ below: 0, scrolls: true, past: 0, ...sizes[`${viewport.width}x${viewport.height}`] });
  const box = (top, bottom, left, right) => ({ top, bottom, left, right, height: bottom - top });
  const reading = () => {
    const { below, scrolls, past } = at();
    const range = scrolls ? below : 0;
    const scrollTop = Math.min(offset, range);
    const bottom = 400 + below - scrollTop; // the lane's bottom edge; the pane's is 400
    return {
      viewport: { ...viewport },
      root: { scrollTop: 0, scrollLeft: 0, scrollHeight: viewport.height, clientHeight: viewport.height,
        scrollWidth: viewport.width, clientWidth: viewport.width },
      pane: { top: 100, bottom: 400, left: 0, right: 400, overflowY: scrolls ? 'auto' : 'visible',
        scrollTop, scrollLeft: 0, scrollHeight: 300 + range, clientHeight: 300 },
      head: box(160 - scrollTop, 190 - scrollTop, 0, 400),
      wrap: box(bottom - 41, bottom, 0, 400 + past),
      key: box(bottom - 41, bottom - 27, 34, past ? 400 + past : 348),
      entries: [['Basal slots', 34, 89], ['raise 1', 100, 152], ['no data 44', 163, past ? 400 + past : 348]]
        .map(([text, left, right]) => ({ text, ...box(bottom - 41, bottom - 27, left, right) })),
      cells: [0, 1, 2].map(i => ({ cell: String(i), verdict: 'nodata', name: `slot ${i}`,
        ...box(bottom - 19, bottom - 8, 34 + i * 105, i === 2 && past ? 400 + past : 134 + i * 105) })),
      chart: box(190 - scrollTop, bottom - 41, 0, 400 + past),
      ancestors: [{ name: '.panes', scrollTop: 0, scrollLeft: 0 }],
    };
  };
  return {
    log,
    viewportSize: () => ({ ...viewport }),
    setViewportSize: async size => { viewport = { ...size }; log.push(`${size.width}x${size.height}`); },
    evaluate: async fn => {
      if (fn.name === 'laneGeometry') return reading();
      throw new Error(`unexpected page.evaluate: ${fn}`);
    },
    mouse: {
      move: async () => {},
      wheel: async (_x, y) => {
        const { below, scrolls } = at();
        offset = Math.min(scrolls ? below : 0, Math.max(0, offset + y));
      },
    },
  };
}

test('assertBasalLaneReachable passes when the pane scrolls a short window\'s lane into reach', async () => {
  const page = qa433ReachPage({ '1200x560': { below: 44 }, '832x560': { below: 44 } });
  await assertBasalLaneReachable(page);
  assert.deepEqual(page.log, [...LANE_REACH_SIZES.map(size => `${size.width}x${size.height}`), '1280x720'],
    'every split size is visited, then the run\'s own size restored');
});

test('assertBasalLaneReachable fails on a key entry past the canvas pane\'s right edge', async () => {
  await assert.rejects(assertBasalLaneReachable(qa433ReachPage({ '832x560': { past: 58.75 } })),
    /832×560 horizontal: 1 of 3 key entries run past the canvas pane's client box, "no data 44" by 58\.75px/);
});

test('assertBasalLaneReachable fails on a lane below a canvas pane that cannot scroll', async () => {
  await assert.rejects(assertBasalLaneReachable(qa433ReachPage({ '1200x560': { below: 44, scrolls: false } })),
    /1200×560 vertical: #lane-wrap overruns the canvas pane's visible box by 44px at rest, and the pane cannot scroll \(overflow-y: visible\)/);
});

test('assertBasalLaneReachable names a vertical failure at one size and a horizontal one at another, once', async () => {
  const page = qa433ReachPage({ '1200x560': { below: 44, scrolls: false }, '832x560': { past: 58.75 } });
  await assert.rejects(assertBasalLaneReachable(page), error => {
    assert.match(error.message, /^S151 the basal lane must stay within reach at every split size; \d+ failures:/);
    assert.match(error.message, /1200×560 vertical: #lane-wrap still overruns the canvas pane's visible box by 44px after wheeling the pane/);
    assert.match(error.message, /832×560 horizontal: 1 of 3 key entries run past the canvas pane's client box, "no data 44" by 58\.75px/);
    assert.match(error.message, /832×560 horizontal: #chart runs past the canvas pane's client box by 58\.75px/);
    return true;
  });
  assert.equal(page.log.at(-1), '1280x720', 'the run\'s own size is restored even when checks failed');
});

// #433 (D6): a fake page for `assertRecurringLowsVariant` — S113's route on the
// `basal-recurring-low-no-clean-median` store. That store's 05:00 slot serves no
// steady night, so no `#level .case-occurrence` row ever renders: a wait on one
// times out here, as it did in the browser. The defaults are the branch's lane;
// the key-word knobs reproduce base, which counts the slot under plain "lower".
function qa433RecurringLowsPage({
  keyEntries = ['Basal slots', 'lower · recurring lows 1', 'no data 47'],
  counts = { 'down:recurring-lows': 1, nodata: 47 },
} = {}) {
  const asked = [];
  let panel = null;
  const verdictOf = selector => (/data-verdict="([a-z]+)"/.exec(selector) || [])[1];
  const entryOf = selector => {
    const reason = (/data-reason="([a-z-]+)"/.exec(selector) || [])[1];
    return reason ? `${verdictOf(selector)}:${reason}` : verdictOf(selector);
  };
  const recurring = selector => selector.includes('[data-reason="recurring-lows"]');
  const node = selector => {
    asked.push(selector);
    const self = {
      filter() { return self; },
      first() { return self; },
      waitFor: async () => {
        if (selector.includes('case-occurrence')) {
          throw new Error('locator.waitFor: Timeout 30000ms exceeded (this store renders no steady night)');
        }
      },
      click: async () => {
        if (recurring(selector)) {
          panel = { time: '05:00–05:30', verdict: 'lower (recurring lows)', recommended: '0.48', stage: 1,
            text: '05:00–05:30 lower (recurring lows) Recommended 0.48 Stage change' };
        }
      },
      count: async () => (selector === '#lane > button.lane-cell' ? 48
        : recurring(selector) ? counts['down:recurring-lows'] || 0 : 0),
      getAttribute: async name => (name === 'aria-label' && recurring(selector)
        ? '05:00 basal slot, suggests a lower because lows keep happening at this hour' : null),
      evaluateAll: async () => [...keyEntries],
      innerText: async () => String(counts[entryOf(selector)]),
      evaluate: async fn => {
        const src = fn.toString();
        if (src.includes("getPropertyValue('--cell')")) return `token(${verdictOf(selector)})`;
        if (src.includes('::before')) return verdictOf(selector) === 'down' ? '""' : 'none';
        if (src.includes('backgroundImage')) return verdictOf(selector) === 'nodata' ? 'radial-gradient(circle, ...)' : 'none';
        throw new Error(`unexpected evaluate on ${selector}: ${src}`);
      },
    };
    return self;
  };
  return {
    asked,
    // the store's served preparation: one basal Finding, the 05:00 slot's, which
    // the old `openBasalLane` route drills before its steady-night wait
    url: () => 'http://synthetic.invalid/',
    request: { get: async () => ({ ok: () => true, status: () => 200,
      json: async () => ({ rendered_rows: [{ id: 'basal:300-330' }] }) }) },
    locator: node,
    getByRole: (role, { name }) => {
      asked.push(`${role}:${name}`);
      return { click: async () => {} };
    },
    waitForFunction: async () => {},
    evaluate: async fn => {
      if (fn.name === 'readSlotPanel') return panel && { ...panel };
      if (fn.toString().includes('lane-cell')) return { ...counts };
      throw new Error(`unexpected page.evaluate: ${fn}`);
    },
  };
}

test('assertRecurringLowsVariant reaches the lane on a store with no steady night, never waiting for one', async () => {
  const page = qa433RecurringLowsPage();
  await assertRecurringLowsVariant(page);
  assert.ok(page.asked.includes('button:24 h'), 'the route opens the 24 h rail');
  assert.ok(page.asked.includes('#lane > button.lane-cell'), 'the route waits for the 48 basal slots');
  assert.deepEqual(page.asked.filter(selector => selector.includes('case-occurrence')), [],
    'the route never waits for a steady-night row, which this store never renders');
  assert.ok(page.asked.includes('#lane > .lane-cell[data-verdict="down"][data-reason="recurring-lows"]'),
    'the route opens the recurring-lows cell itself');
});

test('assertRecurringLowsVariant fails at the key word when the key counts the slot under plain "lower"', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertRecurringLowsVariant(qa433RecurringLowsPage({
      keyEntries: ['Basal slots', 'lower 1', 'no data 47'], counts: { down: 1, nodata: 47 },
    })),
    /S113 the key must read "lower · recurring lows 1"; it reads \["Basal slots","lower 1","no data 47"\]/));
});

// #413: a fake page for `assertRankedMinis` — the scenario S116 drives after
// opening the rail. `graphics` maps a row id to its mounted mini's graphic
// texts; an absent id is an unmounted mini. The story's own in-page function
// runs against a DOM shaped as the served desk mounts a mini: the ECharts
// instance on `SPAN.mini`, its canvas inside an inner DIV, and `getOption()`
// returning the texts as ONE graphic group's `elements` (coordinator probe of
// the branch showcase, 2026-09-22).
function qa413MiniPage(graphics) {
  const charts = new Map();
  const miniFor = (id) => {
    if (!(id in graphics)) return null;
    const mini = { tagName: 'SPAN' };
    const div = { tagName: 'DIV', parentElement: mini };
    mini.querySelector = (selector) => (selector === 'canvas' ? { tagName: 'CANVAS', parentElement: div } : null);
    charts.set(mini, { getOption: () => ({ graphic: [{ type: 'group',
      elements: graphics[id].map((text) => ({ type: 'text', style: { text } })) }] }) });
    return mini;
  };
  return {
    evaluate: async (fn, id) => {
      const saved = { document: globalThis.document, window: globalThis.window, CSS: globalThis.CSS };
      Object.assign(globalThis, {
        CSS: { escape: (value) => value },
        window: { echarts: { getInstanceByDom: (node) => charts.get(node) } },
        document: { querySelector: (selector) => {
          const match = /^\.qrow\[data-id="([^"]+)"\] \.mini$/.exec(selector);
          return match ? miniFor(match[1]) : null;
        } },
      });
      try { return fn(id); } finally { Object.assign(globalThis, saved); }
    },
  };
}
const minied = { id: 'pattern:p', pattern_chart: { key: 'p' },
  count_sentences: [{ outcome: 'ran high', count: 5, denominator: 12, noun: 'meals' }] };

test('assertRankedMinis passes when every mounted mini draws its served count sentence', async () => {
  await assertRankedMinis(qa413MiniPage({ 'pattern:p': ['RAN HIGH · 5', 'TYPICAL · 12'] }), [minied]);
});

test('assertRankedMinis fails at its premise when no row carries a chart coordinate', async () => {
  await assert.rejects(assertRankedMinis(qa413MiniPage({}), [{ id: 'finding:x' }]),
    /S116 premise: the showcase must rank a mini-bearing Pattern or Cause/);
});

test('assertRankedMinis reaches its feature assertion when the row serves no count sentence', async () => {
  const unserved = { id: 'pattern:p', pattern_chart: { key: 'p' } };
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertRankedMinis(qa413MiniPage({ 'pattern:p': ['RAN HIGH · 5', 'TYPICAL · 12'] }), [unserved]),
    /must draw from its served count sentence; none is served/));
});

test('assertRankedMinis fails when a mini draws words other than the served sentence', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertRankedMinis(qa413MiniPage({ 'pattern:p': ['MATCHED · 5', 'TYPICAL · 12'] }), [minied]),
    /must draw the served outcome word and count/));
});

test('assertRankedMinis fails when no candidate mini is mounted', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertRankedMinis(qa413MiniPage({}), [minied]),
    /at least one ranked mini must be mounted/));
});

// #429: a fake page for S139/S140 — the served admission, the dock at the foot
// of the Diagnose inspector, and the Changes landing its link opens.
function qa429DockPage(kind, { label = 'Open Changes ›' } = {}) {
  let url = 'http://synthetic.invalid/';
  const roster = { admission: { state: 'available', active_kind: kind, active_id: kind === 'trial' ? 'basal:390' : 7 },
    trials: [], focuses: [{ id: 7, pinned_at: '2026-08-04 09:00:00' }] };
  const detail = kind === 'focus' ? 'Pinned 08-04 · adherence and outcome are read in Changes'
    : 'Maturing — 6 of 14 days since 08-11';
  const text = {
    '.inspector > .watch': `${kind.toUpperCase()} · WATCHING\nThe watched change\n${detail}\n${label}`,
    '.inspector > .watch .go': label,
    '.inspector > .watch .how': detail,
    '.gf-stage-trial .gf-title': 'Basal 06:30 · 0.85 → 1.05 U/hr',
  };
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    locator: sub => node(`${selector} ${sub}`),
    waitFor: async () => {},
    click: async () => { if (selector === '.inspector > .watch .go') url = 'http://synthetic.invalid/changes?subject=watch'; },
    getAttribute: async name => (selector === '.inspector > .watch' && name === 'data-state' ? kind : null),
    innerText: async () => text[selector] ?? '',
  });
  return {
    url: () => url,
    request: { get: async href => ({ status: () => 200, text: async () => '',
      json: async () => (new URL(href).searchParams.has('selected')
        ? { ...roster, selected: { changes: [{ slot: '06:30' }] } } : roster) }) },
    locator: node,
  };
}

test('S139 and S140 pass when the dock names Changes and its link lands on the watch', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S139(qa429DockPage('trial'));
  await C4_STORIES.S140(qa429DockPage('focus'));
});

test('S139 and S140 fail at the label, not at a premise, when the dock still reads "Open Verify ›"', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  for (const [id, kind] of [['S139', 'trial'], ['S140', 'focus']]) {
    await withReplayAssertionTimeout(10, () => assert.rejects(
      C4_STORIES[id](qa429DockPage(kind, { label: 'Open Verify ›' })),
      error => error.message.includes(`${id} the dock's link must read "Open Changes ›"`)
        && !error.message.includes('premise')));
  }
});
