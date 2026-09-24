import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ADVISORY, DESTINATIONS, FOOTER_UTILITIES, shellMarkup } from './shell.js';

// The persistent chrome's strings are the lock's "Verbatim strings", copied from
// the selected mock so drift is a diff rather than a judgment call. These read
// them back off the markup the shell actually builds.

test('the three destinations render in the locked order with Diagnose current', () => {
  assert.deepEqual(DESTINATIONS.map(([id]) => id), ['diagnose', 'changes', 'day']);
  const markup = shellMarkup();
  const order = [...markup.matchAll(/data-destination="([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(order, ['diagnose', 'changes', 'day']);
  // Exactly one is current on a cold load, and it is Diagnose (HV2-09).
  const current = [...markup.matchAll(/data-destination="([a-z]+)" aria-current="page"/g)].map((m) => m[1]);
  assert.deepEqual(current, ['diagnose']);
  assert.match(markup, /<nav class="v2-nav" aria-label="Main">/);
});

test('the topbar and footer carry their verbatim strings', () => {
  const markup = shellMarkup();
  assert.match(markup, /<div class="cockpit-identity">.*Harmonic <small>advisory<\/small>/);
  // U+FF0B, the fullwidth plus, not an ASCII '+'.
  assert.match(markup, /<span class="plus">＋<\/span>Log carbs/);
  assert.equal(ADVISORY, 'Advisory only. Review with your clinician before changing pump settings.');
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

/* #736 settled the identity mark, and ADR 47 is what keeps it settled: the
   Harmonic mark is a native capital H in a FILLED burnt-orange rounded square,
   and the square carries its own orange instead of reading --ck-accent, so the
   mark stays one constant object wherever it sits. It rides a dark chrome bar
   and a light browser tab strip, which pull opposite ways, so a constant is the
   only stable answer. The empty aria-hidden span is deliberate: the H is drawn
   by ::before, so it never enters the accessibility tree or a text selection.

   #416 deleted frontend/index.test.js with the rest of v1; these three files
   are still shipped, so the assertions come here, where the chrome's other
   verbatim strings already live. shell.css's comment names this test. */
test('the cockpit identity wears the locked Harmonic mark (#736, ADR 47)', () => {
  const shell = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
  const favicon = readFileSync(new URL('./favicon.svg', import.meta.url), 'utf8');
  const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

  assert.ok(shellMarkup().includes('<span class="cockpit-mark" aria-hidden="true"></span>'),
    'the mark is an empty aria-hidden span; its glyph is drawn by ::before');
  assert.match(shell, /\.cockpit-mark\s*\{[\s\S]*?width:\s*20px;[\s\S]*?height:\s*20px;[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*5px;[\s\S]*?background:\s*#b35b2e;/,
    'the mark keeps the locked 20px burnt-orange rounded square');
  assert.match(shell, /\.cockpit-mark::before\s*\{[\s\S]*?content:\s*"H";[\s\S]*?font-weight:\s*650;/,
    'the mark draws the native capital H at the locked weight');
  assert.doesNotMatch(shell.match(/\.cockpit-mark\s*\{[^}]*\}/)[0], /var\(--ck-accent\)/,
    'the mark does not follow the chrome accent — it is one constant object');
  assert.match(favicon, /fill="#b35b2e"/,
    'the tab icon is the same burnt-orange square as the topbar mark');
  assert.match(page, /<link rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg" \/>/,
    'the head links the SVG app mark so the browser tab is not a blank page icon');
});

test('retired destinations cannot be registered as hidden journey surfaces', async () => {
  const { registerDestination } = await import('./routes.js');
  for (const id of ['overview', 'explore']) {
    assert.throws(() => registerDestination({ id, title: id, mount() {} }), /unknown v2 destination/);
  }
});
