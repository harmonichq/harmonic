import test from 'node:test';
import assert from 'node:assert/strict';
import { withReplayAssertionTimeout } from './replay-assertions.mjs';
import { drawWindow, issue81SlicedProjection, S107, waitForPreparationWindow } from './diagnose-workstation-behavior.replay.mjs';
import { commitWindow, minuteAtX, snapWindow } from './diagnose-workstation-chart.js';

test('S107 carries the observed wrapped window into its pinned-read proof before release', async () => {
  const run = async (publishWrapped = true) => {
    let observe;
    let gesture = 0;
    let held = false;
    const released = [];
    const windows = [[420, 780], [1320, 120]];
    const projections = ['fp_' + '01a4030c'.repeat(4), 'fp_' + '05280078'.repeat(4)];
    const page = {
      getByRole: () => ({ click: async () => {} }),
      waitForFunction: async () => {}, waitForTimeout: async () => {},
      keyboard: { press: async () => {} },
      locator: () => ({
        getAttribute: async () => 'finding:over_treated_low',
        locator() { return this; }, click: async () => {},
      }),
      on: (event, callback) => { assert.equal(event, 'request'); observe = callback; },
      off: (event, callback) => { assert.equal(event, 'request'); assert.equal(callback, observe); observe = null; },
      evaluate: async callback => {
        // The scalar clock-pan reader accompanies the structured plot/state readers.
        if (callback.toString().includes("Number(document.getElementById('chart')")) return 360;
        return { x: 0, y: 0, w: 1000, h: 400, panOffset: gesture === 2 ? 360 : 0,
          chip: gesture === 2 ? '22:00–02:00' : '07:00–13:00' };
      },
      mouse: {
        down: async () => { gesture++; held = true; },
        move: async () => {
          if (!held || (gesture === 2 && !publishWrapped)) return;
          const [start, end] = windows[gesture - 1];
          for (const path of [
            `/api/diagnose/finding-case-file-preparation?start_min=${start}&end_min=${end}`,
            `/api/diagnose/finding-case-file?projection_id=${projections[gesture - 1]}&finding_id=finding:over_treated_low&alignment=event`,
          ]) observe({ url: () => `http://127.0.0.1:8765${path}` });
        },
        up: async () => { released.push(gesture); held = false; },
      },
    };
    await S107(page);
    assert.deepEqual(released, [1, 2], 'both gestures release after their pinned-read proof');
    assert.equal(observe, null, 'the completed story removes its request observer');
  };
  await run();
  await assert.rejects(withReplayAssertionTimeout(10, () => run(false)), error => {
    assert.match(error.message, /pinned chart re-reads its wrapped intermediate window before release/);
    assert.match(error.message, /saw.*preparations: \[\], cases: \[\]/s);
    assert.doesNotMatch(error.message, /Cannot destructure/);
    return true;
  });
});

// Exercise the public story with a level whose animation outlasts fixed sleeps.
// Loading finishes first; only polling the animation sees its actual completion.
async function slicedProjection(sliceDrift = 0) {
  const originalDocument = globalThis.document;
  let scope = 'whole';
  let animating = true;
  let animationPolls = 0;
  const waitedScopes = [];
  const level = {
    dataset: { loading: 'false' },
    getAnimations: () => {
      animationPolls++;
      if (animating && animationPolls > 1) {
        animating = false;
        waitedScopes.push(scope);
      }
      return animating ? [{}] : [];
    },
  };
  const changeScope = next => { scope = next; animating = true; animationPolls = 0; };
  globalThis.document = {
    getElementById: id => { assert.equal(id, 'level'); return level; },
    querySelector: selector => { assert.equal(selector, '#level'); return level; },
  };
  const page = {
    click: async selector => changeScope(selector.includes('nth-child(5)') ? 'whole' : 'overnight'),
    waitForTimeout: async () => {},
    waitForFunction: async (predicate, arg, options) => {
      for (let poll = 0; poll < 3; poll++) {
        if (predicate(arg)) return;
        assert.ok(options.timeout > 0 && options.timeout <= 30000, 'animation wait is bounded');
      }
      assert.fail('predicate never settled');
    },
    locator: () => ({ count: async () => 0 }),
    mouse: { move: async () => {}, down: async () => {}, up: async () => changeScope('slice') },
    evaluate: async () => ({
      // The plot reader and state reader consume their own fields from this pose.
      x: 0, y: 0, w: 1000, h: 400, gripA: 0, gripB: 360,
      crumbMeta: scope === 'whole' ? '8 findings · 30 days' : '1 in this window',
      chip: scope === 'slice' ? '04:30–06:00' : null,
      queue: scope === 'whole' ? Array.from({ length: 11 }, (_, i) => ({ title: `Row ${i}` }))
        : [{ title: 'Basal 05:30 · raise' }, { title: 'ISF' }],
      queueLeft: 1048 + (scope === 'whole' && animating ? 6 : 0)
        + (scope === 'slice' ? sliceDrift : 0),
    }),
  };
  try {
    await issue81SlicedProjection(page);
    assert.deepEqual(waitedScopes, ['whole', 'slice'], 'both geometry reads await their own animation');
  } finally {
    globalThis.document = originalDocument;
  }
}

test('S43 compares the spine only after each level animation ends', async () => {
  await slicedProjection();
});

test('S43 still rejects a real spine difference after animations end', async () => {
  await assert.rejects(withReplayAssertionTimeout(10, () => slicedProjection(4)), /same inspector content spine: expected 1048, got 1052/);
});

test('drawn preparation windows land on their frozen bounds through the shipped snap path', async () => {
  for (const viewport of [1280, 1440]) for (const expected of [[270, 480], [840, 1260]]) {
    const plot = { x: 20, y: 60, w: viewport - 430, h: 500 };
    const points = [];
    await drawWindow({
      evaluate: async () => plot,
      mouse: { move: async x => points.push(x), down: async () => {}, up: async () => {} },
      waitForTimeout: async () => {},
    }, expected);
    const minutes = points.map(x => minuteAtX({ clientWidth: plot.w }, x - plot.x));
    assert.deepEqual(commitWindow(snapWindow(minutes, 45)), expected,
      `${viewport}px: the actual drawn pixels snap to the frozen window`);
  }
});

test('preparation waits accept only the frozen bounds and report mis-drawn requests', async () => {
  const requested = [[null, null], ['1080', '1440'], ['300', '495']];
  assert.deepEqual(await waitForPreparationWindow(Promise.resolve(['270', '480']),
    ['270', '480'], requested), ['270', '480']);
  await assert.rejects(waitForPreparationWindow(Promise.resolve(['300', '495']),
    ['270', '480'], requested), error => {
    assert.match(error.message, /expected \["270","480"\], got \["300","495"\]/);
    assert.ok(error.message.includes(JSON.stringify(requested)));
    return true;
  });
});

test('both preparation waits time out with every window observed by the barrier', async () => {
  for (const expected of [['270', '480'], ['840', '1260']]) {
    const requested = [[null, null], ['1080', '1440']];
    const waiting = waitForPreparationWindow(new Promise(() => {}), expected, requested, 5);
    requested.push(['825', '1245']);
    await assert.rejects(waiting, error => {
      assert.match(error.message, /Timed out after 5 ms/);
      assert.ok(error.message.includes(JSON.stringify(expected)));
      assert.ok(error.message.includes(JSON.stringify(requested)), 'diagnostics include later observations');
      return true;
    });
  }
});
