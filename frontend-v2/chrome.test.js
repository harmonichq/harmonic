import test from 'node:test';
import assert from 'node:assert/strict';

import { ADVISORY, DESTINATIONS, FOOTER_UTILITIES, shellMarkup } from './shell.js';

// The persistent chrome's strings are the lock's "Verbatim strings", copied from
// the selected mock so drift is a diff rather than a judgment call. These read
// them back off the markup the shell actually builds.

test('the four destinations render in the locked order with Overview current', () => {
  assert.deepEqual(DESTINATIONS.map(([id]) => id), ['overview', 'explore', 'changes', 'day']);
  const markup = shellMarkup();
  const order = [...markup.matchAll(/data-destination="([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(order, ['overview', 'explore', 'changes', 'day']);
  // Exactly one is current on a cold load, and it is Overview (HV2-09).
  const current = [...markup.matchAll(/data-destination="([a-z]+)" aria-current="page"/g)].map((m) => m[1]);
  assert.deepEqual(current, ['overview']);
  assert.match(markup, /<nav class="v2-nav" aria-label="Main">/);
});

test('the topbar and footer carry their verbatim strings', () => {
  const markup = shellMarkup();
  assert.match(markup, /<div class="cockpit-identity">.*Harmonic <small>advisory<\/small>/);
  assert.match(markup, /<span class="cockpit-scope-label">Scope<\/span>/);
  assert.match(markup, /<span>30 d<\/span>/);
  // U+FF0B, the fullwidth plus, not an ASCII '+'.
  assert.match(markup, /<span class="plus">＋<\/span>Log carbs/);
  assert.equal(ADVISORY, 'Advisory only — review with your clinician before changing pump settings.');
  assert.ok(markup.includes(`<span class="cockpit-advisory advisory">${ADVISORY}</span>`));
  assert.match(markup, /<nav class="cockpit-utilities" aria-label="Utilities">/);
});

test('the footer serves Carb questions with its open count, Guide, Settings and Glossary', () => {
  assert.deepEqual(FOOTER_UTILITIES.map(([kind]) => kind), ['questions', 'guide', 'settings', 'glossary']);
  const markup = shellMarkup();
  for (const label of ['Carb questions', 'Guide', 'Settings', 'Glossary']) {
    assert.ok(markup.includes(`>${label}`), `the footer lost ${label}`);
  }
  assert.match(markup, /class="cockpit-questions" data-utility="questions">Carb questions <span class="cockpit-count">0<\/span>/);
  // Pump settings is reached from Changes (HV2-12), never from this strip.
  assert.ok(!markup.includes('data-utility="pump"'), 'Pump settings must not sit in the footer strip');
});
