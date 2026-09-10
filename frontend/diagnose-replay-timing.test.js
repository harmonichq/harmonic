import test from 'node:test';
import assert from 'node:assert/strict';
import { issue81SlicedProjection } from './diagnose-workstation-behavior.replay.mjs';

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
      chip: scope === 'slice' ? 'Window 04:30–06:00' : null,
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
  await assert.rejects(slicedProjection(4), /same inspector content spine: expected 1048, got 1052/);
});
