import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { dayReturnTarget } from './day.js';
import { UTILITY_TITLE, installUtilities, openUtility } from './utilities.js';
import { render, startDesk, view } from './routes.js';
import { glossaryGroups } from './glossary.js';

// The utility pane titles are the lock's verbatim strings, and three separate
// things read them: the pane's own heading, the label a utility's Open Day
// declares to the Day desk, and the name that Day's return is called by. The
// frozen S76 reads the declared label off the control and then requires the
// return to read `Return to <that label>`, so a second table anywhere here is a
// drift the story would catch only in a browser.

test('the utility titles are the locked pane names', () => {
  assert.deepEqual(UTILITY_TITLE, {
    settings: 'App settings',
    pump: 'Pump settings',
    carbs: 'Log carbs',
    questions: 'Carb questions',
    guide: 'Guide',
    glossary: 'Glossary',
  });
});

test('every utility Open Day declares its origin, the label its return is named for, and its item by identity', () => {
  // S76 reads data-utility-from and data-utility-label off this control. The
  // first port shipped only the origin, so the story could not read the name it
  // then had to match. ADR 445: the return target is the item's identity, the
  // routing subject, and no selector rides the control.
  const source = readFileSync(new URL('./utilities.js', import.meta.url), 'utf8');
  const controls = [...source.matchAll(/data-action="day"[^`]*?>Open /g)].map((match) => match[0]);
  assert.ok(controls.length >= 2, `expected the carbs and questions Open Day controls, found ${controls.length}`);
  for (const control of controls) {
    assert.match(control, /data-date=/, 'a contextual Open Day carries no date');
    assert.match(control, /data-subject="\$\{e\(IDENTITY\.(carbs|questions)\(/, 'a utility Open Day names its item by no identity');
    assert.match(control, /data-title=/, 'a utility Open Day carries no printed title');
    assert.match(control, /data-utility-from=/, 'a utility Open Day declares no origin');
    assert.match(control, /data-utility-label=/, 'a utility Open Day declares no origin label');
    assert.doesNotMatch(control, /data-return-focus=/, 'a utility Open Day still names a selector');
  }
});

test('the Day return is named by the same table the control declares from', () => {
  for (const [kind, title] of Object.entries(UTILITY_TITLE)) {
    const back = dayReturnTarget({ date: '2024-06-26', subject: 's', from: `diagnose.${kind}` });
    assert.equal(back.label, title, `${kind} returns under a different name than its pane`);
    assert.equal(back.utility, kind);
    assert.equal(back.destination, 'diagnose', 'the return lands on the destination it was opened over');
  }
});

test('#423 · the Glossary keys each group section by its title, and calls no definition v1\'s', () => {
  // An Episode Log band caption opens the Glossary with its group in view, by this key.
  const source = readFileSync(new URL('./utilities.js', import.meta.url), 'utf8');
  assert.match(source, /<section class="gf-section" data-glossary-group="\$\{e\(group\.title\)\}">/);
  assert.doesNotMatch(source, /v1 definitions/);
});

// ADR 451: the Glossary's definitions are sentences a reader reads, so none joins
// its clauses with an em dash (DESIGN.md, Voice and user-copy register, rule 1).
// A term's unit label is a short label, not a sentence, and is not read here.
test('ADR 451 · no Glossary definition joins its clauses with an em dash', () => {
  const defs = glossaryGroups.flatMap((group) => group.terms.map((term) => [term.term, term.def]));
  assert.ok(defs.length > 0);
  for (const [term, def] of defs) assert.ok(!def.includes('—'), `${term}: ${def}`);
});

// #423: a narrow desk (the 700px query matches) whose reading pane is a sheet.
// The seat records the sheet state each render writes; a launcher can take
// focus only while the sheet it lives in is open, which is what a hidden sheet
// does to its controls in the browser. No destination is installed, so the
// desk renders its unclaimed frame and issues no read. Escape reaches the
// utility's close through the desk's own keydown listener.
const narrowSeat = { innerHTML: '', dataset: {}, querySelectorAll: () => [], insertAdjacentHTML() {},
  querySelector: (selector) => (selector === '.gf-utility-strip' ? { toggleAttribute() {} } : null) };
const narrowListeners = {};
const narrowBrowser = {
  location: { pathname: '/', search: '', hash: '' },
  history: { pushState() {}, replaceState() {} },
  matchMedia: () => ({ matches: true, addEventListener() {} }),
  addEventListener: (type, listener) => { narrowListeners[type] = listener; },
};
const LAUNCHERS = ['[data-log-glossary="findings"]', 'button[data-utility="glossary"]'];
const focusedAt = [];
let narrowSeated = false;
async function onNarrowDesk(run) {
  const previous = globalThis.document;
  globalThis.document = {
    activeElement: null, querySelectorAll: () => [],
    querySelector: (selector) => (LAUNCHERS.includes(selector)
      ? { focus: () => { if (narrowSeat.dataset.sheet === 'open') focusedAt.push(selector); } } : null),
  };
  try {
    if (!narrowSeated) { narrowSeated = true; installUtilities({ glossary: glossaryGroups }); startDesk(narrowSeat, { browser: narrowBrowser }); }
    await run();
  } finally {
    globalThis.document = previous;
  }
}
const pressEscape = () => narrowListeners.keydown({ key: 'Escape' });

test('#423 · on a narrow desk, closing a utility opened from the open sheet keeps the sheet and returns focus there', async () => {
  await onNarrowDesk(async () => {
    // The reader has the Episode Log sheet open and presses a band caption's Glossary control.
    view.sheetOpen = true;
    render();
    focusedAt.length = 0;
    openUtility('glossary', '[data-log-glossary="findings"]', '[data-glossary-group="Episode Log"]');
    assert.equal(narrowSeat.dataset.sheet, 'open', 'a narrow utility takes the sheet');
    pressEscape();
    assert.equal(view.sheetOpen, true, 'closing the Glossary shut the sheet its launcher lives in');
    assert.equal(narrowSeat.dataset.sheet, 'open');
    assert.deepEqual(focusedAt, ['[data-log-glossary="findings"]'], 'focus did not land on the caption control');
  });
});

test('#423 · on a narrow desk, a utility opened with the sheet closed still closes onto the stage', async () => {
  await onNarrowDesk(async () => {
    view.sheetOpen = false;
    render();
    focusedAt.length = 0;
    openUtility('glossary', 'button[data-utility="glossary"]');
    assert.equal(narrowSeat.dataset.sheet, 'open', 'a narrow utility takes the sheet');
    pressEscape();
    assert.equal(view.sheetOpen, false, 'closing a utility opened from the stage left the sheet open');
    assert.equal(narrowSeat.dataset.sheet, 'closed');
  });
});
