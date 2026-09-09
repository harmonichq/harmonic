import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { dayReturnTarget } from './day.js';
import { UTILITY_TITLE } from './utilities.js';

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

test('every utility Open Day declares its origin AND the label its return is named for', () => {
  // S76 reads data-utility-from and data-utility-label off this control. The
  // first port shipped only the origin, so the story could not read the name it
  // then had to match.
  const source = readFileSync(new URL('./utilities.js', import.meta.url), 'utf8');
  const controls = [...source.matchAll(/data-action="day"[^`]*?>Open /g)].map((match) => match[0]);
  assert.ok(controls.length >= 2, `expected the carbs and questions Open Day controls, found ${controls.length}`);
  for (const control of controls) {
    assert.match(control, /data-date=/, 'a contextual Open Day carries no date');
    assert.match(control, /data-subject=/, 'a contextual Open Day carries no canonical subject');
    assert.match(control, /data-utility-from=/, 'a utility Open Day declares no origin');
    assert.match(control, /data-utility-label=/, 'a utility Open Day declares no origin label');
    assert.match(control, /data-return-focus=/, 'a utility Open Day names no precise return target');
  }
});

test('the Day return is named by the same table the control declares from', () => {
  for (const [kind, title] of Object.entries(UTILITY_TITLE)) {
    const back = dayReturnTarget({ date: '2024-06-26', subject: 's', from: `overview.${kind}` });
    assert.equal(back.label, title, `${kind} returns under a different name than its pane`);
    assert.equal(back.utility, kind);
    assert.equal(back.destination, 'overview', 'the return lands on the destination it was opened over');
  }
});
