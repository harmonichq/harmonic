import test from 'node:test';
import assert from 'node:assert/strict';

import { chartKeyCss, glossaryModule, materialCss, readAppShell } from './app-source.mjs';

// The v2 desk takes the app's material, its Day legend and v1's glossary from
// v1's own file rather than copying them. These prove the lift finds the real
// thing and that a moved marker stops the build rather than shipping a shell
// with no role ladder.

test('the material lift carries the shipped dark role ladder HV2-07 names', () => {
  const material = materialCss();
  for (const [token, value] of [
    ['--wk-canvas', '#0f0d0b'], ['--wk-surface-sunken', '#14120f'], ['--wk-field', '#1e1a17'],
    ['--wk-surface', '#221e1b'], ['--wk-surface-rail', '#2b2622'], ['--wk-rule', '#3f3833'],
    ['--wk-rule-strong', '#453d35'], ['--wk-ink', '#f2ede2'], ['--wk-ink-body', '#cfc8bd'],
    ['--wk-ink-meta', '#a49c90'], ['--wk-ink-nav', '#c6bfb3'],
  ]) {
    assert.match(material, new RegExp(`${token}:${value}`), `${token} is not the locked ${value}`);
  }
  // Inter is the single UI family (HV2-08), declared on the body the desk sits in.
  assert.match(material, /font-family: 'Inter'/);
  // And the theme chooser stays retired: no light block came with it.
  assert.doesNotMatch(material, /prefers-color-scheme|\[data-theme/);
});

test('the Day legend lift takes the shipped rules the figure keys render', () => {
  const rules = chartKeyCss();
  assert.match(rules, /\.ds-chart-legend \{/);
  assert.match(rules, /\.ds-chart-legend span \{/);
  assert.match(rules, /\.ds-chart-legend i \{/);
});

test('the glossary lift is a module of v1 definitions, verbatim', async () => {
  const source = glossaryModule();
  assert.match(source, /^export const glossaryGroups = \[/);
  const groups = (await import(`data:text/javascript,${encodeURIComponent(source)}`)).glossaryGroups;
  assert.ok(groups.length > 0, 'the glossary lifted no groups');
  for (const group of groups) {
    assert.ok(group.title, 'a glossary group has no title');
    assert.ok(group.terms.length, `${group.title} has no terms`);
    for (const term of group.terms) {
      assert.ok(term.term && term.def, `${group.title} has a term with no definition`);
    }
  }
  // CONTEXT.md renames two labels for presentation only; the v1 terms and their
  // definitions are what this lift must carry.
  const terms = groups.flatMap((group) => group.terms.map((term) => term.term));
  assert.ok(terms.includes('ISF'), 'the v1 term ISF is missing');
  assert.ok(terms.includes('I:C'), 'the v1 term I:C is missing');
});

test('every lift fails closed when its marker moves', () => {
  const html = readAppShell();
  // A shell with no material block at all.
  assert.throws(() => materialCss('<html><body></body></html>'), /material lift/);
  // A shell whose material block no longer carries the ladder: the lift found
  // something, and it is still wrong.
  assert.throws(() => materialCss('\n  <style>\n    :root { color: red; }\n    /* #634: #app'), /--wk-canvas/);
  // A duplicated closing marker is ambiguous, not a reason to guess.
  assert.throws(() => materialCss(html + html), /exactly once/);
  assert.throws(() => glossaryModule('<html></html>'), /glossary lift/);
  assert.throws(() => chartKeyCss('<html></html>'), /\.ds-chart-legend/);
});
