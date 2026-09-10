import test from 'node:test';
import assert from 'node:assert/strict';
import { storyCase, createCaseServer } from './replay-cases.mjs';

test('S56 requires the saved Focus title after reload, rather than its raw subject', async () => {
  const { C3_STORIES } = await import('./c3.replay.mjs');
  const offered = { key: 'synthetic-pattern', subject: 'pattern:synthetic-pattern' };
  const saved = { id: 7, pattern_key: offered.key, subject: offered.subject };
  const title = 'Served Pattern title';
  const pageFor = stageText => {
    let reloaded = false;
    return {
      url: () => 'http://127.0.0.1:8765/v2/?to=changes',
      goto: async () => {}, reload: async () => { reloaded = true; },
      request: { get: async url => {
        const path = new URL(url).pathname;
        assert.ok(['/api/focus', '/api/verify/trials'].includes(path));
        const payload = path === '/api/focus'
          ? { admission: { state: 'available', active_id: saved.id, focus_pin: { available: true } },
            pinnable_patterns: [offered], focuses: [saved] }
          : { focuses: [{ id: 8, title: 'Another Focus' }, { ...saved, title }] };
        return { status: () => 200, text: async () => JSON.stringify(payload), json: async () => payload };
      } },
      locator: selector => ({
        filter() { return this; }, first() { return this; },
        waitFor: async () => {}, click: async () => {}, count: async () => 0,
        innerText: async () => {
          assert.equal(selector, '.gf-stage-focus');
          assert.ok(reloaded, 'the saved Focus title must survive reload');
          return stageText;
        },
      }),
    };
  };
  await assert.rejects(C3_STORIES.S56(pageFor(offered.subject)), /served Focus title/);
  await C3_STORIES.S56(pageFor(title));
});

test('one invocation selects the generated case each story needs', () => {
  assert.equal(storyCase('S88'), 'basal-lower');
  assert.equal(storyCase('S90'), 'basal-lower');
  assert.equal(storyCase('S100'), 'showcase');
  assert.equal(storyCase('S98'), 'ic-lower');
  assert.equal(storyCase('S90', 'S90=basal-raise,S100=showcase'), 'basal-raise');
  assert.throws(() => storyCase('S88', 'S88=../../real'), /Invalid/);
  assert.throws(() => createCaseServer({ directory: '/tmp', baseURL: 'https://example.com' }), /8765/);
});

test('c2 app selection contains concrete story bodies and excludes the c3 Trial inspection', async () => {
  const { C2_STORIES } = await import('./c2.replay.mjs');
  for (const id of ['S14','S15','S16','S17','S18','S19','S20','S20b','S21','S22','S23','S24','S25','S26','S27','S28','S29','S30','S31','S32','S33','S34','S35','S37','S37b','S38','S39','S40','S41','S42','S43','S44','S89','S97','S98','S99']) {
    assert.equal(typeof C2_STORIES[id], 'function', id);
  }
  assert.equal(C2_STORIES.S36, undefined);
});

function icReplacementDriver({ requestRecovery = true, inspectionError = null,
  staleSubject = '00:00 block', register = 'assert', stageCount = register === 'assert' ? 1 : 0,
  postStageCount = stageCount, postStageText = 'Stage change staged for Plan', canvasCount = 0,
  staleMessage = 'Evidence changed. Refresh findings.' } = {}) {
  const routes = new Map(); const responses = []; const order = [];
  const source = { findings: { analysis_generation: 'synthetic:before', window: { scoped: true } },
    rendered_rows: [{ id: 'ic:0', parameter: 'carb_ratio', register, span: { start_min: 0 } }] };
  const node = {
    first() { return this; }, filter() { return this; },
    waitFor: async () => {}, click: async () => {},
    getAttribute: async () => 'ic:0', innerText: async () => 'Current I:C evidence', count: async () => 1,
  };
  const page = {
    locator: selector => ({ ...node,
      count: async () => selector === '#level .stagebtn' ? (responses.some(r => r.status === 409) ? postStageCount : stageCount)
        : selector.endsWith(' canvas') ? canvasCount : 1,
      evaluateAll: async () => Array.from({ length: responses.some(r => r.status === 409) ? postStageCount : stageCount },
        () => ({ text: responses.some(r => r.status === 409) ? postStageText : 'Stage change staged for Plan', staged: 'false' })),
      innerText: async () => selector.endsWith(' .tile-state') ? staleMessage
        : selector === '#crumb-trail .here' ? (responses.some(r => r.status === 409) ? staleSubject : '00:00 block')
          : 'Current I:C evidence',
      getAttribute: async name => name === 'data-state' ? 'stale-generation' : 'ic:0',
      click: async () => {
      if (selector.endsWith('.tile-pin')) order.push('pin');
      if (selector.endsWith('.tile-body')) order.push('body');
    } }),
    waitForFunction: async () => {},
    evaluate: async () => ({ values: ['10'], series: responses.some(r => r.status === 409)
      ? null : [{ id: 'current', data: [120] }] }),
    route: async (pattern, handler) => routes.set(pattern, handler),
    unroute: async pattern => routes.delete(pattern),
    getByText: () => ({ ...node, waitFor: async () => {
      if (inspectionError) throw inspectionError;
      assert.deepEqual(order, ['All charts', 'pin', 'body', 'Afternoon', 'new generation', 'I:C 409', 'findings recovery', 'All charts']);
      assert.equal(responses.length, 1, 'recovery remains paused while stale evidence is inspected');
    } }),
    getByRole: (_role, { name }) => ({ ...node, click: async () => {
      assert.notEqual(name, 'Morning', 'an unchanged Morning generation does not re-request I:C evidence');
      if (name === 'All charts') { order.push(name); return; }
      if (name !== 'Afternoon') return;
      assert.deepEqual(order, ['All charts', 'pin', 'body'], 'S106 keeps and drills the selected tile before the preset');
      assert.ok(routes.has('**/api/diagnose/carb-ratio-block-evidence*'), '409 installed before the trigger');
      order.push(name);
      const prepare = routes.get('**/api/diagnose/finding-case-file-preparation*');
      assert.equal(typeof prepare, 'function', 'S106 requires its scoped generation perturbation');
      const captured = prepare({
        fetch: async () => ({ ok: () => true, status: () => 200, json: async () => structuredClone(source) }),
        fulfill: async ({ json }) => {
          assert.deepEqual({ ...json, findings: { ...json.findings, analysis_generation: source.findings.analysis_generation } }, source,
            'the perturbation changes only the generation, never the rows or clinical facts');
          assert.equal(json.findings.analysis_generation, 'synthetic:before:scoped');
          order.push('new generation');
          const stale = routes.get('**/api/diagnose/carb-ratio-block-evidence*');
          let bypassed = false;
          await stale({ request: () => ({ url: () => 'http://synthetic/api/diagnose/carb-ratio-block-evidence?block_id=30' }),
            fallback: async () => { bypassed = true; } });
          assert.ok(bypassed, 'an unrelated I:C block must not consume the one-shot 409');
          await stale({ request: () => ({ url: () => 'http://synthetic/api/diagnose/carb-ratio-block-evidence?block_id=0' }),
            fulfill: async response => { responses.push(response); order.push('I:C 409'); } });
          if (!requestRecovery) return;
          const recovery = routes.get('**/api/diagnose/findings*');
          assert.equal(typeof recovery, 'function');
          const detached = recovery({ fulfill: async response => responses.push(response) });
          assert.equal(detached, undefined, 'the holding callback owns no detached promise or rejection timer');
          order.push('findings recovery');
        },
      });
      assert.equal(captured, undefined, 'preparation capture is synchronous too');
    } }),
  };
  return { page, responses, routes };
}

test('S98 copies the S106 pinned Afternoon trigger with a scoped generation before the selected I:C 409', async () => {
  const { C2_STORIES } = await import('./c2.replay.mjs');
  const { page, responses, routes } = icReplacementDriver();
  await C2_STORIES.S98(page);
  assert.deepEqual(responses.map(r => r.status), [409, 503]);
  assert.equal(responses[0].json.detail.code, 'analysis_generation_mismatch');
  assert.equal(routes.size, 0, 'the story removes both interceptions');
});

test('S98 rejects a substituted subject, an unserved staging control, unnamed stale state or retained canvas', async () => {
  const { C2_STORIES } = await import('./c2.replay.mjs');
  for (const [state, expected] of [
    [{ staleSubject: '12:00 block' }, /retains the selected subject/],
    [{ postStageCount: 2 }, /served I:C row/],
    [{ register: 'held', postStageCount: 1 }, /served I:C row/],
    [{ postStageText: 'Stage a different change' }, /adds or substitutes no staging control/],
    [{ staleMessage: '' }, /served stale wording/],
    [{ canvasCount: 1 }, /named stale state replaces the old canvas/],
  ]) {
    const { page, routes } = icReplacementDriver(state);
    await assert.rejects(C2_STORIES.S98(page), expected);
    assert.equal(routes.size, 0, 'negative assertion still cleans up the story routes');
  }
});

test('S98 retains only the staging control permitted by the served I:C register', async () => {
  const { C2_STORIES } = await import('./c2.replay.mjs');
  for (const register of ['assert', 'held']) {
    const { page } = icReplacementDriver({ register });
    await C2_STORIES.S98(page);
  }
});

test('S98 missing recovery rejects into the story chain, clears deadlines and permits the next story', async () => {
  const { C2_STORIES } = await import('./c2.replay.mjs');
  const set = globalThis.setTimeout; const clear = globalThis.clearTimeout;
  const timers = new Set();
  globalThis.setTimeout = (run, ms, ...args) => {
    // Exercise the production thirty-second deadline without a thirty-second test.
    const timer = set(run, ms === 30000 ? 5 : ms, ...args); timers.add(timer); return timer;
  };
  globalThis.clearTimeout = timer => { timers.delete(timer); clear(timer); };
  try {
    const missing = icReplacementDriver({ requestRecovery: false });
    await assert.rejects(C2_STORIES.S98(missing.page),
      /Timed out after 30000 ms: S98 findings recovery after scoped generation and selected I:C 409/);
    assert.equal(missing.routes.size, 0, 'timed-out story removes its interceptions');
    await C2_STORIES.S98(icReplacementDriver().page);
    assert.equal(timers.size, 0, 'both failed and successful story chains clear their deadlines');
  } finally {
    for (const timer of timers) clear(timer);
    globalThis.setTimeout = set; globalThis.clearTimeout = clear;
  }
});

test('S98 releases held recovery in finally when an inspection assertion fails', async () => {
  const { C2_STORIES } = await import('./c2.replay.mjs');
  const error = new Error('synthetic stale-state assertion failed');
  const { page, responses, routes } = icReplacementDriver({ inspectionError: error });
  await assert.rejects(C2_STORIES.S98(page), candidate => candidate === error);
  assert.deepEqual(responses.map(r => r.status), [409, 503]);
  assert.equal(routes.size, 0);
});

test('replay deadlines fail with the wait name and preserve resolved values/errors', async () => {
  const { boundedWait } = await import('./c2.replay.mjs');
  await assert.rejects(boundedWait(new Promise(() => {}), 'S98 Morning preparation request', 5),
    /Timed out after 5 ms: S98 Morning preparation request/);
  const value = {};
  assert.equal(await boundedWait(Promise.resolve(value), 'successful wait', 5), value);
  const error = new Error('original failure');
  await assert.rejects(boundedWait(Promise.reject(error), 'failed wait', 5), candidate => candidate === error);
});

test('draft retry waits for the PUT, not the disappearing error control', async () => {
  const { C2_STORIES } = await import('./c2.replay.mjs');
  let items = []; let listen;
  const response = { ok: () => true, url: () => 'http://127.0.0.1:8765/api/plan', request: () => ({ method: () => 'PUT' }) };
  const page = {
    url: () => 'http://127.0.0.1:8765/v2/?to=changes', waitForFunction: async () => {},
    request: { get: async url => {
      const snapshot = new URL(url).pathname === '/api/plan' ? { items: [...items] } : { history: [] };
      return { ok: () => true, status: () => 200, json: async () => snapshot };
    } },
    waitForResponse: (predicate, options) => {
      assert.ok(options.timeout > 0);
      return new Promise(resolve => { listen = () => { if (predicate(response)) resolve(response); }; });
    },
    locator: selector => ({
      first() { return this; }, filter() { return this; }, waitFor: async () => {},
      innerText: async () => 'Saving the draft failed', evaluate: async () => true,
      click: async () => {
        if (selector !== '[data-set="retry-save"]') return;
        // The view already removed Retry; the asynchronous PUT has not settled.
        setImmediate(() => { items = [{ type: 'basal', start_min: 180, value: .54 }]; listen?.(); });
      },
    }),
  };
  await C2_STORIES.S40(page, { failNext: (method, path) => {
    assert.equal(method, 'PUT'); assert.equal(path, '/api/plan');
  } });
  assert.equal(items.length, 1);
});

test('S99 reads the full-width unavailable stage without requiring a two-pane wrapper', async () => {
  const { C2_STORIES } = await import('./c2.replay.mjs');
  const guidance = { disposition: 'unavailable', selected: null, reasons: {}, unavailable: 'reconciliation_required' };
  const reads = [];
  const locator = selector => ({
    first() { return this; }, filter() { return this; }, waitFor: async () => {}, click: async () => {},
    count: async () => 0,
    innerText: async () => {
      reads.push(selector);
      assert.notEqual(selector, '.gf-desk', 'emptyFrame has a full-width stage, not a two-pane desk');
      return selector === '#level' ? 'No direction asserted' : 'No action from this read. Harmonic has not reconciled the latest data.';
    },
  });
  const page = {
    url: () => 'http://127.0.0.1:8765/v2/?to=changes',
    request: { get: async () => ({ ok: () => true, status: () => 200, json: async () => guidance }) },
    locator, getByRole: () => locator('button'), getByText: () => locator('text'),
    waitForFunction: async () => {}, route: async () => {}, unroute: async () => {}, goto: async () => {},
  };
  await C2_STORIES.S99(page);
  assert.equal(reads.filter(selector => selector === '.gf-stage[aria-label="Changes"]').length, 2);
});

test('S9 loads the measured Inter face even when document fonts ready already resolved', async () => {
  const { C2_STORIES } = await import('./c2.replay.mjs');
  const previousDocument = globalThis.document;
  const previousStyle = globalThis.getComputedStyle;
  const face = { family: 'Inter', status: 'unloaded' };
  let loaded = false;
  globalThis.document = { fonts: {
    ready: Promise.resolve(),
    async load(font, text) {
      assert.equal(font, '700 18.24px Inter'); assert.equal(text, 'Current change');
      await Promise.resolve(); face.status = 'loaded'; loaded = true; return [face];
    },
    *[Symbol.iterator]() { yield face; },
  } };
  globalThis.getComputedStyle = () => ({ fontFamily: 'Inter', fontSize: '18.24px', fontWeight: '700' });
  const node = { first() { return this; }, filter() { return this; }, waitFor: async () => {},
    click: async () => {}, evaluate: run => run({ textContent: 'Current change' }) };
  try {
    await C2_STORIES.S9({ locator: () => node, waitForFunction: async () => {} });
    assert.ok(loaded, 'the title waits for its own font rather than the earlier ready snapshot');
  } finally { globalThis.document = previousDocument; globalThis.getComputedStyle = previousStyle; }
});


test('desk readiness waits past immediate navigation and utility loading, without sleeps', async () => {
  const { waitForDesk } = await import('./c2.replay.mjs');
  const original = globalThis.document;
  let loading = true;
  globalThis.document = {
    querySelector: selector => selector === '#level' ? { dataset: { loading: String(loading) } }
      : selector.includes('.gf-loading') && loading ? {} : null,
    querySelectorAll: () => loading ? [{ textContent: 'Loading settings…' }] : [],
  };
  try {
    await waitForDesk({ waitForFunction: async (ready, _arg, options) => {
      assert.equal(options.timeout, 30000);
      assert.equal(ready(), false, 'aria-current can change while Day or settings still loads');
      loading = false;
      assert.equal(ready(), true, 'the same predicate accepts the completed read');
    } });
  } finally { globalThis.document = original; }
});

test('chart readiness does not count a cold overview before its evidence tiles mount', async () => {
  const { waitForCharts } = await import('./c2.replay.mjs');
  const original = globalThis.document;
  let tiles = [];
  globalThis.document = { querySelectorAll: () => tiles };
  try {
    await waitForCharts({
      locator: () => ({ first() { return this; }, waitFor: async () => {} }),
      waitForFunction: async (ready, _arg, options) => {
        assert.equal(options.timeout, 30000);
        assert.equal(ready(), false, 'the overview canvas alone cannot settle the composition');
        tiles = [{ dataset: { state: 'ok' }, querySelector: selector => selector === '.tile-state'
          ? { textContent: 'Loading evidence…' } : null }];
        assert.equal(ready(), false, 'a served tile still loading cannot be counted');
        tiles = [{ dataset: { state: 'ok' }, querySelector: () => null }];
        assert.equal(ready(), false, 'an ok tile with no canvas cannot be counted');
        tiles = [{ dataset: { state: 'ok' }, querySelector: selector => selector === 'canvas' ? {} : null }];
        assert.equal(ready(), true, 'completed evidence is ready for the unchanged count assertion');
      },
    });
  } finally { globalThis.document = original; }
});


test('S29 observes the focus event before a later repaint can move activeElement', async () => {
  const { clickAndObserveFocus } = await import('./c2.replay.mjs');
  const previous = globalThis.document;
  let listener; let removed = false; let disposed = false;
  const target = { matches: selector => selector === '#level' };
  globalThis.document = {
    activeElement: null,
    addEventListener: (type, fn, capture) => { assert.equal(type, 'focusin'); assert.equal(capture, true); listener = fn; },
    removeEventListener: (type, fn, capture) => { assert.equal(type, 'focusin'); assert.equal(fn, listener); assert.equal(capture, true); removed = true; },
  };
  const page = {
    evaluateHandle: async (install, selector) => {
      const value = install(selector);
      return { value, evaluate: async fn => fn(value), dispose: async () => { disposed = true; } };
    },
    waitForFunction: async (ready, handle, options) => {
      assert.equal(options.timeout, 30000);
      assert.equal(document.activeElement, null, 'a late instantaneous focus poll would miss the successful handoff');
      assert.equal(ready(handle.value), true);
    },
  };
  try {
    assert.equal(await clickAndObserveFocus(page, { click: async () => {
      assert.equal(typeof listener, 'function', 'listen before the navigation click');
      document.activeElement = target; listener({ target });
      document.activeElement = null; // an intervening repaint before the await resumes
    } }, '#level'), true);
    assert.ok(removed && disposed);
    removed = disposed = false;
    page.waitForFunction = async (ready, handle) => {
      assert.equal(ready(handle.value), false, 'a different focus target cannot satisfy the proof');
      throw new Error('synthetic bounded focus deadline');
    };
    await assert.rejects(clickAndObserveFocus(page, { click: async () => {
      const wrong = { matches: () => false }; document.activeElement = wrong; listener({ target: wrong });
    } }, '#level'), /bounded focus deadline/);
    assert.ok(removed && disposed, 'failure removes the observer too');
  } finally { globalThis.document = previous; }
});
