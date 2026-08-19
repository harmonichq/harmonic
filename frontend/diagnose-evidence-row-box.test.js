// #31: the evidence table's numeric cell is an inline cell, not a box.
//
// `diagnose-workstation.css` defines `.entry` for level 1's slot-lane STAGING
// BUTTON — `display: grid`, `padding: 8px var(--ck-pad)`, and a hairline on
// BOTH edges. The Diagnose evidence table's entry-glucose cell is a
// `<span class="entry">` inside `.ev-row`, and `.ev-row .entry` sets only ink
// and alignment, so the staging button's box landed on every evidence row: the
// three-digit reading was laid out as a 33px grid box and carried the row to
// 42px, where `.ev-row`'s own 4px padding asks for roughly 25px. Seven rows
// paid 119px of the inspector column's height for it.
//
// The staging rule is scoped to `button.entry` now — the element it was
// written for. This test holds that scoping from the outside rather than
// trusting the selector text: it reads the shipped painter for the class the
// cell actually carries, then reads the stylesheet for any rule whose SUBJECT
// reaches that cell and hands it a box. It is deliberately not a rendered
// measurement — the fast gate has no browser — but it fails for the same
// reason a measurement does, and it failed first against the unscoped rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./diagnose-workstation.css', import.meta.url), 'utf8');
const painter = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');

// Only the properties that make a box: what turns an inline run of text into a
// laid-out one, and what adds height to it above its own line.
const BOX_PROP = /(^|;)\s*(display|padding|border)\b[^:;]*:/;

// The rightmost compound is the one the rule actually styles. `.entry .pill`
// styles a pill, not the cell, so it is not this rule's business.
const subjectOf = (selector) => selector.trim().split(/\s*[\s>+~]\s*/).pop();

const rulesReachingTheCell = () => {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  for (const [, selectors, body] of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of selectors.split(',')) {
      const subject = subjectOf(selector);
      // A `button.entry` rule cannot reach a `<span class="entry">`.
      if (!/\.entry\b/.test(subject) || /^button\b/.test(subject)) continue;
      out.push({ selector: selector.trim(), body: body.trim() });
    }
  }
  return out;
};

test('the evidence table\'s numeric cell keeps its compact box (#31)', () => {
  assert.match(painter, /<span class="entry">/,
    'the entry-glucose cell is a span in the shipped evidence painter — if this '
    + 'moved, the rest of this test is measuring the wrong element');
  const boxed = rulesReachingTheCell().filter((r) => BOX_PROP.test(r.body));
  assert.deepEqual(boxed.map((r) => r.selector), [],
    'no unscoped `.entry` rule may give the evidence cell a box — it is an '
    + 'inline cell in a 4px-padded row, not a grid button with padding and '
    + 'a border on both edges');
});
