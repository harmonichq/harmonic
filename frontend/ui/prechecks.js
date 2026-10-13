// The component stories' prechecks (#483), as one pure function over what a
// rendered story shows. scripts/ui-stories.mjs gathers the input in Chromium;
// prechecks.test.js proves each rule fires.
//
//   (a) no sentence or question in visible text
//   (b) every visible word and accessible name is in the glossary allowlist
//   (c) every button declares its role and is that role's §4.1 height
//   (d) at most one primary-filled control
//   (e) every visible number sits in a [data-source] whose fixture field it equals
import { resolveField } from './provenance.js';

// §4.1, one height per role.
export const ROLE_HEIGHTS = { primary: 50, secondary: 32, text: 32, icon: 44, segment: 28, nav: 44 };

const WORD = /[A-Za-z][A-Za-z'’-]*/g;
const SENTENCE = /[A-Za-z][^.!?]*[.!?](\s|$)/;

/**
 * @param {{texts: {text: string, source: string|null}[], names: string[],
 *          buttons: {role: string|null, height: number, label: string}[], primaries: number}} shown
 * @param {{fixtures: object, allowed: Set<string>}} sources
 * @returns {string[]} one line per violation; empty when the story passes
 */
export function precheckProblems({ texts, names, buttons, primaries }, { fixtures, allowed }) {
  const found = [];
  for (const { text } of texts) {
    if (text.includes('?') || SENTENCE.test(text)) found.push(`(a) sentence or question: "${text}"`);
  }
  for (const text of [...texts.map((t) => t.text), ...names]) {
    for (const word of text.match(WORD) ?? []) {
      if (!allowed.has(word.toLowerCase())) found.push(`(b) "${word}" is not in the glossary allowlist`);
    }
  }
  for (const { role, height, label } of buttons) {
    if (!Object.hasOwn(ROLE_HEIGHTS, role ?? '')) {
      found.push(`(c) button "${label}" declares no known role (${role})`);
    } else if (Math.abs(height - ROLE_HEIGHTS[role]) > 0.5) {
      found.push(`(c) ${role} button "${label}" is ${height}px, not ${ROLE_HEIGHTS[role]}px`);
    }
  }
  if (primaries > 1) found.push(`(d) ${primaries} primary-filled controls`);
  for (const { text, source } of texts) {
    if (!/\d/.test(text)) continue;
    if (!source) {
      found.push(`(e) "${text}" names no fixture field`);
      continue;
    }
    let value;
    try {
      value = resolveField(fixtures, source);
    } catch (error) {
      found.push(`(e) "${text}": ${error.message}`);
      continue;
    }
    if (String(value) !== text) found.push(`(e) "${text}" is not ${source} (${JSON.stringify(value)})`);
  }
  return found;
}
