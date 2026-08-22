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
// The retired staging rule was first scoped to `button.entry` — the element it
// was written for — and is now deleted (#39). This test holds both sides of the
// repair from the outside: it reads the shipped painter for the class the cell
// actually carries, then follows every local stylesheet loaded by the shipped
// app for a retired selector or any rule whose SUBJECT reaches that cell and
// hands it a box. It is
// deliberately not a rendered measurement — the fast gate has no browser —
// but it fails for the same reason a measurement does, and it failed first
// against both the unscoped rule (#31) and the retired selector inventory (#39).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const appHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const stylesheets = [
  ...readdirSync(new URL('.', import.meta.url), { recursive: true })
    .filter((name) => typeof name === 'string' && name.endsWith('.css'))
    .sort()
    .map((name) => ({
      name,
      css: readFileSync(new URL(name, import.meta.url), 'utf8'),
    })),
  ...[...appHtml.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
    .map(([, css], index) => ({ name: `index.html:<style>[${index}]`, css })),
];
const painter = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');

// Only the properties that make a box: what turns an inline run of text into a
// laid-out one, and what adds height to it above its own line.
const BOX_PROP = /(^|;)\s*(display|padding|border)\b[^:;]*:/;

// The rightmost compound is the one the rule actually styles. `.entry .pill`
// styles a pill, not the cell, so it is not this rule's business.
const subjectOf = (selector) => selector.trim().split(/\s*[\s>+~]\s*/).pop();

const rulesReachingTheCell = () => {
  const out = [];
  for (const { name, css } of stylesheets) {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selectors, body] of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const selector of selectors.split(',')) {
        const subject = subjectOf(selector);
        // A `button.entry` rule cannot reach a `<span class="entry">`.
        if (!/\.entry\b/.test(subject) || /^button\b/.test(subject)) continue;
        out.push({ stylesheet: name, selector: selector.trim(), body: body.trim() });
      }
    }
  }
  return out;
};

const retiredSelectors = () => {
  const out = [];
  for (const { name, css } of stylesheets) {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selectors] of flat.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      for (const selector of selectors.split(',')) {
        const trimmed = selector.trim();
        if (/\bbutton\.entry\b/.test(trimmed)
            || (name === 'theme.css' && /\.entry\s+\.sub\b/.test(trimmed))) {
          out.push(`${name}: ${trimmed}`);
        }
      }
    }
  }
  return out;
};

test('the retired level-one staging-entry style stays absent (#39)', () => {
  assert.deepEqual(retiredSelectors(), [],
    'the findings queue retired its per-parameter staging-entry rows; restore '
    + 'that surface only with a new behavior decision and emitter, not dormant CSS');
});

test('the evidence table\'s numeric cell keeps its compact box (#31)', () => {
  assert.match(painter, /<span class="entry">/,
    'the entry-glucose cell is a span in the shipped evidence painter — if this '
    + 'moved, the rest of this test is measuring the wrong element');
  const owners = rulesReachingTheCell();
  assert.deepEqual(owners.map((r) => `${r.stylesheet}: ${r.selector}`),
    ['diagnose-workstation.css: .ev-row .entry'],
    'the evidence cell keeps one production style owner for ink and alignment');
  const boxed = owners.filter((r) => BOX_PROP.test(r.body));
  assert.deepEqual(boxed.map((r) => `${r.stylesheet}: ${r.selector}`), [],
    'no unscoped `.entry` rule may give the evidence cell a box — it is an '
    + 'inline cell in a 4px-padded row, not a grid button with padding and '
    + 'a border on both edges');
});
