// #457 reproduction, port-free. Two browser-suite helpers decide from one
// snapshot of a page that may still be painting. Playwright's locator.count()
// and locator.isVisible() never wait, so a control that paints a moment later is
// simply absent from that snapshot. Each fake page below paints its subject
// PAINT_MS after the helper starts; nothing here launches a browser or binds a port.
//
//   node docs/scope/457-press-wait.repro.mjs
//
// On b03431d2 every row prints "rejected": the late Return press in about 0 ms
// with `no control matched [data-day="return"]`, the absent and hidden presses
// at once without naming a bound, and both railRowLocator rows after the fake
// bound, waiting for a .qmember that never paints. With the #457 change applied
// the late Return press and both railRowLocator rows print "resolved", and the
// absent and hidden presses print "rejected" after about 100 ms with
// `no control matched [data-no-such-control] after 100 ms` and
// `.gf-utility-strip [data-utility="guide"] matched 1 element(s), all hidden after 100 ms`.
// The desk suite's own press is read from its source text, because that module
// cannot be imported without Chromium; it may use only `assert` and the page it
// is given.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { railRowLocator } from '../../frontend/diagnose-replay.mjs';

const PAINT_MS = 50;
// A fake waitFor honours the caller's bound, compressed to at most this.
const FAKE_BOUND_MS = 400;
const boundOf = options => Math.min(options?.timeout ?? FAKE_BOUND_MS, FAKE_BOUND_MS);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function outcome(label, run) {
  const start = Date.now();
  try {
    await run();
    return { label, outcome: 'resolved', ms: Date.now() - start };
  } catch (error) {
    return { label, outcome: 'rejected', message: error.message, ms: Date.now() - start };
  }
}

// ---- the desk suite's press, as the suite defines it at this checkout ----
const suite = readFileSync(new URL('../../frontend/desk.browser.test.mjs', import.meta.url), 'utf8');
const source = suite.match(/\nasync function press\(page, selector[^)]*\) \{[\s\S]*?\n\}\n/)?.[0];
assert.ok(source, 'the desk suite defines no press helper');
const press = new Function('assert', `return (${source.trim()});`)(assert);

// Day's Return control paints PAINT_MS after arrival, as it does once Day's
// reads land (frontend/day.js mount: loadingFrame until bounds, month and day).
// The narrow-only utility strip's Guide button is always attached and never
// visible at a desktop size (frontend/desk.css `.gf-utility-strip`), and no
// control ever matches `[data-no-such-control]`.
const HIDDEN = '.gf-utility-strip [data-utility="guide"]';
function lateReturnPage() {
  const start = Date.now();
  const painted = () => Date.now() - start >= PAINT_MS;
  const clicks = [];
  const locator = selector => {
    const attached = () => selector === HIDDEN || (selector === '[data-day="return"]' && painted());
    const present = () => selector === '[data-day="return"]' && painted();
    let visibleOnly = false;
    const node = {
      count: async () => (visibleOnly ? (present() ? 1 : 0) : (attached() ? 1 : 0)),
      nth: () => node,
      first: () => node,
      filter: ({ visible } = {}) => { visibleOnly = Boolean(visible); return node; },
      isVisible: async () => present(),
      waitFor: async (options) => {
        const until = Date.now() + boundOf(options);
        while (!present()) {
          if (Date.now() > until) throw Object.assign(new Error(`waitFor ${selector}: timeout`), { name: 'TimeoutError' });
          await delay(10);
        }
      },
      click: async () => { assert.ok(present(), `clicked ${selector} before it painted`); clicks.push(selector); },
    };
    return node;
  };
  return { clicks, locator, waitForTimeout: delay };
}

// ---- the replay's rail row resolver, imported as shipped ----
// The rail reads "Loading findings…" (no .qrow, no .qfold) for PAINT_MS, then
// paints. A claimed cause sits under its parent Pattern's fold, closed as a
// Pattern that is not rank one arrives (frontend/diagnose-findings-queue.js
// appendFold); an unclaimed row paints as a plain .qrow beside one closed fold.
// The desk suite's High-carb fixtures rank their only priced Pattern first, so
// its fold opens on arrival and masks the claimed case there today.
function loadingRailPage(id, { claimed }) {
  const start = Date.now();
  const painted = () => Date.now() - start >= PAINT_MS;
  let foldOpen = false;
  const clicks = [];
  const qrow = `#level .qrow[data-id="${id}"]`;
  const member = `#level .qmember[data-id="${id}"]`;
  const fold = '#level .qfold[aria-expanded="false"]';
  const present = selector => {
    if (!painted()) return 0;
    if (selector === fold) return foldOpen ? 0 : 1;
    if (selector === member) return claimed && foldOpen ? 1 : 0;
    if (selector === qrow) return claimed ? 0 : 1;
    return 0;
  };
  const locator = selector => ({
    first() { return this; },
    count: async () => present(selector),
    waitFor: async () => {
      const until = Date.now() + FAKE_BOUND_MS;
      while (!present(selector)) {
        if (Date.now() > until) throw Object.assign(new Error(`waitFor ${selector}: timeout`), { name: 'TimeoutError' });
        await delay(10);
      }
    },
    click: async () => { clicks.push(selector); if (selector === fold) foldOpen = true; },
  });
  const settledRail = () => painted();
  return {
    clicks, locator,
    waitForFunction: async () => {
      const until = Date.now() + FAKE_BOUND_MS;
      while (!settledRail()) {
        if (Date.now() > until) throw Object.assign(new Error('waitForFunction: timeout'), { name: 'TimeoutError' });
        await delay(10);
      }
      return true;
    },
  };
}

const returnPage = lateReturnPage();
const rows = [
  await outcome('press [data-day="return"] as Day paints its Return control', () => press(returnPage, '[data-day="return"]')),
  await outcome('press [data-no-such-control] with a 100 ms bound', () => press(lateReturnPage(), '[data-no-such-control]', 100)),
  await outcome(`press ${HIDDEN} with a 100 ms bound`, () => press(lateReturnPage(), HIDDEN, 100)),
  await outcome('railRowLocator claimed finding:high_carb_sequence while the rail still loads',
    () => railRowLocator(loadingRailPage('finding:high_carb_sequence', { claimed: true }), 'finding:high_carb_sequence')),
  await outcome('railRowLocator unclaimed finding:over_treated_low while the rail still loads',
    () => railRowLocator(loadingRailPage('finding:over_treated_low', { claimed: false }), 'finding:over_treated_low')),
];
for (const row of rows) console.log(JSON.stringify(row));
