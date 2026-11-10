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
//       auto or scroll anywhere else is a nested scroll area, but for the one
//       exception SCROLL_EXEMPT names
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

/** What may scroll on its own beside a page or pane, and why: (f)'s own allowlist. */
export const SCROLL_EXEMPT = [
  { selector: '.ui-dayscreen__month--phone > .ui-dayscreen__weeks',
    reason: 'the phone\'s Day month, whose weeks scroll under its name and ‹ › so a short phone or a six-week month '
      + 'ends above the tab bar with scrim to tap: §2.3 ban 6\'s one exception, the operator\'s, 2026-11-10 (#649)' },
];

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

// The interactivity prechecks (#582), over what a keyboard walk of the same
// rendered story found. scripts/ui-stories.mjs walks every story with the keys
// a keyboard user has (Tab, Shift+Tab, Enter, Escape) and hit-tests every
// control; these rules judge what it saw. A story is walked once, at the width
// of its frame (its layout): the screens' phone and desktop stories are each
// walked at their own width, and (l)'s 44 px applies to a phone-width frame.
//
//   (g) reachable: everything that responds to a tap has a role and is
//       reached by Tab, and every Tab stop is a visible control
//   (h) visible focus: each element Tab reaches, a page or pane the browser
//       lets Tab scroll among them, looks different focused (the caret of a
//       field that draws one is its focus; a time or date field draws none)
//   (i) named: every control and every exposed graphic has an accessible
//       name, read as words (no two pieces of its text run together, no badge
//       inside it); a graphic drawn as an image hides no text of its own; a
//       tab, and a button of a toggle group, exposes its state; nothing
//       focusable hides inside aria-hidden
//   (j) order: no positive tabindex, and Tab never runs back against reading
//       order (up within a column, or leftward along a line) inside one
//       region: a scrolling pane, or what lies outside every pane
//   (k) Escape and return: a dialog is opened from a control that declares
//       it, takes focus when it opens, keeps Tab and Shift+Tab inside it while
//       open (with the part drawn apart from it that belongs to its cycle),
//       closes on Escape and gives focus back to its trigger; focus never lands
//       on a control an open dialog covers; and it is marked modal (aria-modal)
//       exactly when nothing beside it takes a tap
//   (l) target size: on phone every control takes a tap 44 px across, through
//       its centre both ways (the edge of the screen counts as part of it); at
//       any width, a control pinned over a scrolling page (a bar, the tab bar)
//       takes its own taps whatever scrolls beneath it
//   (m) announced: a status (a transient bar's label, a Prompt's "Recorded")
//       is in a live region
//   (n) contrast: the colour tokens, checked once (contrastProblems)

/** What may skip a rule, and why: the precheck's own allowlist. */
export const INTERACTION_EXEMPT = [
  { selector: '.ui-scrim', rules: ['g', 'l'],
    reason: 'a sheet or popover\'s scrim: a tap outside closes it, and its key is Escape on the dialog, which (k) walks' },
  { selector: '.ui-dayscreen:has(.ui-dayscreen__skeleton) .ui-header__bar .ui-button[aria-haspopup="dialog"]', rules: ['k'],
    reason: 'Day\'s + Log carbs while the day loads: its sheet opens once the day lands, which a loading story never '
      + 'does, and it reads closed until then; every loaded Day story walks it open, closed by Escape and returned' },
  { selector: '.ui-prompt-swipe--open .ui-prompt__answer', rules: ['l'],
    reason: 'the Mid swipe stories hold a finger\'s frame still (the story-only held swipe), its answers slid under the '
      + 'card\'s edge; in the app a Prompt never rests there, since a swipe that commits answers Not sure' },
];
// Also skipped, in the walk itself, while a dialog is open: (g) for a control
// outside its Tab cycle, which Tab does not reach until it closes (unless it is
// a status's, which belongs in the cycle), and (l) for one the dialog or its
// scrim covers, which no tap reaches. Its name is still read, and a control
// beside an open dialog is checked for (l) as any.

/** Where the app writes a status (m) reads: the transient bar's label, and the
 *  words a status may be outside it. */
export const STATUS_SELECTOR = '.ui-bar__label';
export const STATUS_TEXTS = [/^Not saved$/, /^Recorded$/, /^Waiting for pump$/, /^Focus started$/, /^Snoozed until\b/];

export const TARGET = 44;

const RUN_TOGETHER = /[A-Za-z]\d|\d[A-Za-z]/;
const WORD_END = /[\p{L}\p{N}]$/u;
const WORD_START = /^[\p{L}\p{N}]/u;

const at = (control) => `"${control.label}"`;

/**
 * @param {{controls: {label: string, role: string|null, handler: boolean, focusable: boolean,
 *            tabindex: number|null, hidden: boolean, exempt: string[], name: string|null,
 *            pieces?: string[], state: boolean, needsState: boolean,
 *            rect: {x: number, y: number, w: number, h: number}, fixed: boolean, pane: number,
 *            misses?: string[], stolen?: string[]}[],
 *          sequence: {index: number, label: string, changed: boolean, visible?: boolean, covered?: boolean}[],
 *          graphics: {label: string, name: string, hides?: string}[],
 *          statuses: {text: string, live: boolean}[],
 *          dialogs: {name: string, trigger: string|null, opened: boolean, pending?: boolean, inside: boolean,
 *            modal: boolean, beside: number, trapped: boolean, obscured?: string[], closed: boolean|null,
 *            returned: boolean|null}[],
 *          undeclared?: {name: string, opener: string}[]}} walk
 * @returns {string[]} one line per violation; empty when the story passes
 */
export function interactionProblems({ controls, sequence, graphics, statuses, dialogs, undeclared = [] }) {
  const found = [];
  const skips = (control, rule) => control.exempt.includes(rule);
  const reached = new Set(sequence.map((step) => step.index));
  controls.forEach((control, index) => {
    if (control.hidden) {
      if (control.focusable) found.push(`(i) ${at(control)} is focusable inside aria-hidden`);
      return;
    }
    if (!skips(control, 'g')) {
      if (control.handler && !control.role) found.push(`(g) ${at(control)} responds to a tap but has no role`);
      else if (!reached.has(index)) found.push(`(g) ${at(control)} is not reached by Tab`);
    }
    if (control.role && !control.name) found.push(`(i) ${control.role} ${at(control)} has no accessible name`);
    // A name reads as words: no two pieces of its text run into each other (a
    // chart's or a row's pieces read without a space), and no badge drawn on
    // the control, whose count or alert is its description instead.
    const pieces = control.pieces ?? [];
    const joined = pieces.slice(1).some((piece, i) => WORD_END.test(pieces[i]) && WORD_START.test(piece)
      && control.name?.includes(`${pieces[i]}${piece}`));
    if (control.name && (joined || RUN_TOGETHER.test(control.name))) found.push(`(i) "${control.name}" runs text together`);
    for (const badge of control.badges ?? []) {
      if (control.name?.includes(badge)) found.push(`(i) "${control.name}" carries its badge "${badge}" in its name`);
    }
    if (control.needsState && !control.state) found.push(`(i) ${at(control)} exposes no pressed or selected state`);
    if ((control.tabindex ?? 0) > 0) found.push(`(j) ${at(control)} has a positive tabindex (${control.tabindex})`);
    if (control.misses?.length && !skips(control, 'l')) {
      found.push(`(l) ${at(control)} takes no tap ${TARGET / 2} px ${control.misses.join(', ')} of its centre`);
    }
    for (const thief of control.stolen ?? []) found.push(`(l) ${at(control)} loses a tap to "${thief}" scrolled under it`);
  });
  const covers = new Set();
  for (const step of sequence) {
    if (step.covered) covers.add(step.label);
    if (step.index < 0 && step.visible === false) found.push(`(g) Tab stops on "${step.label}", which is not a visible control`);
    else if (!step.changed) found.push(`(h) "${step.label}" looks the same focused`);
  }
  for (let i = 1; i < sequence.length; i += 1) {
    const [a, b] = [controls[sequence[i - 1].index], controls[sequence[i].index]];
    // A pane scrolls on its own, so what sits in it and what sits outside it
    // (the tab bar, the rail) are read region by region, not by where they lie.
    if (!a || !b || a.fixed || b.fixed || a.pane !== b.pane) continue;
    const across = b.rect.x < a.rect.x + a.rect.w && a.rect.x < b.rect.x + b.rect.w;
    const line = Math.min(a.rect.y + a.rect.h, b.rect.y + b.rect.h) - Math.max(a.rect.y, b.rect.y)
      > Math.min(a.rect.h, b.rect.h) / 2;
    if (across && b.rect.y + b.rect.h <= a.rect.y) found.push(`(j) Tab goes up from ${at(a)} to ${at(b)}`);
    else if (line && b.rect.x + b.rect.w <= a.rect.x) found.push(`(j) Tab goes left from ${at(a)} to ${at(b)}`);
  }
  for (const { label, name, hides } of graphics) {
    if (!name) found.push(`(i) a graphic (${label}) has no accessible name and is not aria-hidden`);
    if (hides) found.push(`(i) a graphic drawn as an image (${label}) hides its text "${hides}"`);
  }
  for (const { text, live } of statuses) {
    if (!live) found.push(`(m) "${text}" is not in a live region`);
  }
  for (const { name, opener } of undeclared) {
    found.push(`(k) "${opener}" opens dialog "${name}" but does not declare it (aria-haspopup)`);
  }
  for (const { name, trigger, opened, pending, modal, beside, inside, trapped, obscured = [], closed, returned } of dialogs) {
    const what = `dialog "${name}"${trigger ? ` from "${trigger}"` : ''}`;
    if (!opened) {
      found.push(pending ? `(k) "${trigger}" reads open but draws no dialog`
        : `(k) "${trigger}" declares a dialog that Enter does not open`);
      continue;
    }
    if (modal && beside > 0) found.push(`(k) ${what} is marked modal, but ${beside} control(s) beside it still take a tap`);
    if (!modal && beside === 0) found.push(`(k) ${what} covers the page but is not marked modal (aria-modal)`);
    if (!inside) found.push(`(k) ${what} does not take focus when it opens`);
    if (!trapped) found.push(`(k) ${what} lets Tab leave it while open`);
    for (const label of obscured) covers.add(label);
    if (closed === false) found.push(`(k) ${what} does not close on Escape`);
    if (returned === false) found.push(`(k) ${what} does not give focus back to its trigger`);
  }
  for (const label of covers) found.push(`(k) focus lands on "${label}", which an open dialog covers`);
  return found;
}

/** WCAG 2.x relative luminance of an sRGB colour, [r, g, b] in 0–255. */
export function luminance([r, g, b]) {
  const linear = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The grounds the components draw text on, and the inks they draw it in. */
export const GROUNDS = ['--wk-canvas', '--wk-surface', '--wk-surface-rail', '--wk-surface-sunken'];
export const INKS = ['--wk-ink', '--wk-ink-body', '--wk-ink-meta', '--wk-ink-nav', '--primary', '--danger',
  '--wk-status-favorable', '--wk-status-adverse', '--ui-meal', '--glucose-low', '--glucose-very-high'];

/** Every token pair checked, and the ratio WCAG asks of it: 4.5:1 for text
 *  (1.4.3), 3:1 for a focus indicator or a glucose band's fill (1.4.11). */
export const CONTRAST_PAIRS = [
  ...INKS.flatMap((ink) => GROUNDS.map((ground) => ({ fg: ink, bg: ground, min: 4.5 }))),
  { fg: '--on-primary', bg: '--primary', min: 4.5 },
  ...['--wk-canvas', '--wk-surface'].map((ground) => ({ fg: '--ring', bg: ground, min: 3 })),
  ...['--glucose-very-low', '--glucose-low', '--glucose-in-range', '--glucose-high', '--glucose-very-high']
    .map((band) => ({ fg: band, bg: '--wk-surface', min: 3 })),
];

/** A pair that may fall short, and why: the precheck's own allowlist. */
export const CONTRAST_EXEMPT = ['--wk-canvas', '--wk-surface'].map((bg) => ({ fg: '--ring', bg,
  reason: 'the lock sets the focus ring as --primary at 34% (§4.1); it reads near 1.9:1, and raising it changes a locked '
    + 'token, so it waits on the operator (#582)' }));

/**
 * @param {{fg: string, bg: string, min: number, rgb: {fg: number[], bg: number[]}}[]} pairs each
 *   token pair as the page paints it, the foreground composited over its ground
 * @returns {string[]} one line per pair under its ratio
 */
export function contrastProblems(pairs) {
  const found = [];
  for (const { fg, bg, min, rgb } of pairs) {
    if (CONTRAST_EXEMPT.some((exempt) => exempt.fg === fg && exempt.bg === bg)) continue;
    const ratio = contrastRatio(rgb.fg, rgb.bg);
    if (ratio + 1e-9 < min) found.push(`(n) ${fg} on ${bg} is ${ratio.toFixed(2)}:1, under ${min}:1`);
  }
  return found;
}
