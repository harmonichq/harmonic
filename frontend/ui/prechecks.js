// The component stories' prechecks (#483), as one pure function over what a
// rendered story shows. scripts/ui-stories.mjs gathers the input in Chromium;
// prechecks.test.js proves each rule fires.
//
//   (a) no sentence or question in visible text
//   (b) every visible word and accessible name is in the glossary allowlist
//   (c) every button declares its role and is that role's §4.1 height
//   (d) at most one primary-filled control
//   (f) nothing scrolls on its own but a screen's page or a desktop pane,
//       marked [data-scroll="page"] (§2.3 ban 6): an element with overflow
//       auto or scroll anywhere else is a nested scroll area
//   (e) every visible number sits in a [data-source] whose fixture field (or
//       formula over fields, printed in its data-format) it equals. A chart's
//       scale labels are not served values: axis ticks, and the fixed glucose
//       thresholds a band or a metric is named by ("<54", "54–69", "Below 70",
//       "10–90%"). A plain number, clock, range or bound inside [data-axis] is
//       exempt, signed where a scale runs either side of a line ("+1.9",
//       "−1.4", the Day chart's basal), and nothing else there is.
//
// The Glossary list (inside `.glossary`) is the one place a sentence may
// appear (§2.3 ban 1): its terms and definitions are §1.5's own text, so (a),
// (b) and (e) skip it. Nothing outside `.glossary` is exempt.
import { formatValue, resolveSource } from './provenance.js';

// §4.1, one height per role; a list row is a 48 px minimum.
export const ROLE_HEIGHTS = { primary: 50, secondary: 32, text: 32, icon: 44, segment: 28, nav: 44, answer: 44 };
export const ROLE_MIN_HEIGHTS = { row: 48 };

const WORD = /[A-Za-z][A-Za-z'’-]*/g;
const SENTENCE = /[A-Za-z][^.!?]*[.!?](\s|$)/;
const SCALE = /^[<>+−]?\d+(\.\d+)?([–:]\d+)?%?$/;

/**
 * @param {{texts: {text: string, source: string|null, format?: string|null, axis?: boolean, glossary?: boolean}[], names: string[],
 *          buttons: {role: string|null, height: number, label: string}[], primaries: number,
 *          scrolls?: string[]}} shown
 * @param {{fixtures: object, allowed: Set<string>}} sources
 * @returns {string[]} one line per violation; empty when the story passes
 */
export function precheckProblems({ texts: shown, names, buttons, primaries, scrolls = [] }, { fixtures, allowed }) {
  const found = [];
  const texts = shown.filter((text) => !text.glossary);
  for (const { text } of texts) {
    if (text.includes('?') || SENTENCE.test(text)) found.push(`(a) sentence or question: "${text}"`);
  }
  for (const text of [...texts.map((t) => t.text), ...names]) {
    for (const word of text.match(WORD) ?? []) {
      if (!allowed.has(word.toLowerCase())) found.push(`(b) "${word}" is not in the glossary allowlist`);
    }
  }
  for (const { role, height, label } of buttons) {
    if (Object.hasOwn(ROLE_MIN_HEIGHTS, role ?? '')) {
      if (height + 0.5 < ROLE_MIN_HEIGHTS[role]) {
        found.push(`(c) ${role} button "${label}" is ${height}px, under ${ROLE_MIN_HEIGHTS[role]}px`);
      }
    } else if (!Object.hasOwn(ROLE_HEIGHTS, role ?? '')) {
      found.push(`(c) button "${label}" declares no known role (${role})`);
    } else if (Math.abs(height - ROLE_HEIGHTS[role]) > 0.5) {
      found.push(`(c) ${role} button "${label}" is ${height}px, not ${ROLE_HEIGHTS[role]}px`);
    }
  }
  if (primaries > 1) found.push(`(d) ${primaries} primary-filled controls`);
  for (const where of scrolls) found.push(`(f) a nested scroll area: ${where}`);
  for (const { text, source, format, axis } of texts) {
    if (!/\d/.test(text)) continue;
    if (axis && SCALE.test(text)) continue;
    if (!source) {
      found.push(`(e) "${text}" names no fixture field`);
      continue;
    }
    let shown;
    try {
      shown = formatValue(resolveSource(fixtures, source, format ?? undefined), format ?? undefined);
    } catch (error) {
      found.push(`(e) "${text}": ${error.message}`);
      continue;
    }
    if (shown !== text) found.push(`(e) "${text}" is not ${source}${format ? ` as ${format}` : ''} (${shown})`);
  }
  return found;
}
