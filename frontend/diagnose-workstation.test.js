import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import {
  buildIcBlocks, occurrenceDescription, occurrenceFacts, queryState, renderEventComparisonRoster, renderIsfLevel,
  renderSlotLevel, renderLane,
} from './diagnose-workstation.js';
import { buildSlotLane } from './diagnose-workstation-chart.js';
import { ANCHOR_STATE_WORD } from './day-chart.js';
import { validFindingCaseFile, sameFindingCaseWindow, assertMatchingFindingCasePreparation } from './finding-case-file-validation.js';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';
import { populateFindingsProjectionInput } from './browser-fixture-population.js';
import {
  patternCaseResponse,
  generatedFindingPose,
  generatedFindingProjection,
} from './diagnose-replay.mjs';

test('queryState reads Diagnose state from the canonical route query', () => {
  const original = globalThis.window;
  try {
    globalThis.window = {
      location: { hash: '', search: '?mode=drawn' },
    };
    assert.equal(queryState('typical'), 'drawn');

    globalThis.window.location.search = '?mode=dense';
    assert.equal(queryState('typical'), 'dense');
  } finally {
    globalThis.window = original;
  }
});

/* #255 split two roles that a single grey had been doing both jobs for: the
   quiet grid ink a chart's gridlines recede into, and the stronger edge a chart
   vessel is cut with. They are separate tokens because they must be free to
   move apart. #416 deleted frontend/index.test.js with the rest of v1; the two
   stylesheets are still shipped and still imported by main.js, so the coupling
   is pinned here, beside the sheet's other rules. */
test('#255 · grid ink and vessel edge stay two roles, derived not literal', () => {
  const css = readFileSync(new URL('./diagnose-workstation.css', import.meta.url), 'utf8');
  const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
  assert.match(theme, /--mk-line: var\(--wk-rule\);/,
    'chart grid ink derives from the quiet rule role');
  assert.match(css, /--ck-tile-edge: var\(--wk-rule-strong\);/,
    'chart vessel edges derive from the strong edge role, not grid ink');
});

/* ADR 341 retired the dock: All charts opens the complete catalog directly,
   with no dock mode and no drag handle. A dormant selector for the retired
   strip is how it comes back — the markup returns and the sheet still styles
   it — so the stylesheet is pinned clean of all three. */
test('#341 · the retired dock leaves no dormant selector behind', () => {
  const css = readFileSync(new URL('./diagnose-workstation.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /data-dock|data-raised|dock-handle/,
    'the retired strip has no dormant selector that can resurrect it');
});

test('#341 · All charts visibly marks the current chart without changing geometry', () => {
  const css = readFileSync(new URL('./diagnose-workstation.css', import.meta.url), 'utf8');
  assert.match(css,
    /\.tile-field\[data-explorer\] > \.tile-row > \.evidence-tile\[data-selected\] \{\s*box-shadow: inset 0 0 0 2px var\(--ck-focus-mark\), var\(--ck-cell-shadow\);\s*\}/,
    'the current catalog chart has a token-owned inset mark distinct from an ordinary cell');
});

test('#302 · a settled tile refreshes the mounted findings-row mini', () => {
  const source = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');
  const fetchTile = source.match(/async function fetchTile\([\s\S]*?\n  \}/);
  assert.ok(fetchTile, 'the workstation keeps one tile-fetch completion path');
  assert.match(fetchTile[0], /descriptor\.state = descriptorHasData\(descriptor\) \? 'ok' : 'empty';[\s\S]*?\n      paint\(\);/,
    'a fetched compact-row descriptor repaints the level, remounting its pending mini');
});

test('#302 · the rail mini defines every cohort ink the shared chart reads off it', () => {
  /* The comparison builder resolves each cohort's colour with
     `getComputedStyle(surface)`, and the workstation hands it the row's own
     `.mini` element as that surface. A token the rail never defines resolves to
     the empty string, which is not a failure the reader sees as missing ink —
     ECharts silently substitutes its own default palette. That is how a stock
     chart-library blue got drawn into the rail, so the coupling is pinned here
     rather than left to a screenshot. */
  const comparison = readFileSync(
    new URL('./diagnose-event-comparison.js', import.meta.url), 'utf8');
  const style = comparison.match(/^const STYLE = \{[\s\S]*?\n\};/m);
  assert.ok(style, 'the comparison chart still declares its cohort styles in one map');
  const tokens = [...style[0].matchAll(/color: '(--[a-z-]+)'/g)].map((match) => match[1]);
  assert.ok(tokens.length >= 3, `every cohort names a colour token (${tokens})`);
  const css = readFileSync(new URL('./diagnose-workstation.css', import.meta.url), 'utf8');
  const mini = css.match(/\.dw \.qrow \.mini \{[\s\S]*?\n\}/);
  assert.ok(mini, 'the rail still styles the row mini in one block');
  for (const token of tokens) {
    // an ink weight may wrap the token, but the hue is always the app's own
    assert.match(mini[0], new RegExp(`${token}:[^;]*var\\(--`),
      `the rail mini defines ${token} on an app token, never on the chart library's default`);
  }
  // declarations only — a comment is free to cite an issue number
  assert.doesNotMatch(mini[0].replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-fA-F]{3,8}\b/,
    'the cell carries no colour literal where the theme already names the value');
});

const servedCaseFiles = JSON.parse(readFileSync(new URL(
  '../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8'));
const servedProjection = JSON.parse(readFileSync(new URL(
  './__fixtures__/findings-projection.json', import.meta.url), 'utf8'));

test('#432 · a case row names its Occurrence from its served anchor facts', () => {
  const { cases } = servedCaseFiles;
  const meal = cases['finding:carb_undercount'].clock.occurrences[0];
  const cluster = cases['finding:correction_stacking'].clock.occurrences[0];
  const low = cases['finding:over_treated_low'].clock.occurrences[0];
  assert.deepEqual(occurrenceDescription(meal), { value: '40 g · 4 U · peak 148', label: null });
  assert.deepEqual(occurrenceDescription({ ...meal, outcome: null }), { value: '40 g · 4 U', label: null });
  assert.deepEqual(occurrenceDescription({ ...meal, outcome: { ...meal.outcome, kind: 'nadir', bg: 71.4 } }),
    { value: '40 g · 4 U · nadir 71', label: null });
  assert.deepEqual(occurrenceDescription(cluster), { value: '2 U', label: 'Second correction' });
  assert.deepEqual(occurrenceDescription(low), { value: '62', label: 'Low excursion' });
  const bolusRows = Object.values(cases).flatMap((file) => [file.clock, file.event])
    .flatMap((file) => file.occurrences)
    .filter((row) => row.anchor.carbs != null || row.anchor.insulin != null);
  assert.equal(bolusRows.length, 100, 'the capture serves meal and correction rows to describe');
  const source = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');
  for (const owner of ['renderCaseRoster', 'renderEventComparisonRoster']) {
    const body = source.slice(source.indexOf(`function ${owner}`));
    assert.match(body.slice(0, body.indexOf('\n}\n')), /occurrenceDescription\(row\)/,
      `${owner} describes its rows through the one served-facts rule`);
  }
  for (const row of bolusRows) {
    assert.doesNotMatch(occurrenceDescription(row).value, /^—/, JSON.stringify(row.anchor));
  }
});

test('#432 · a selected claimed meal reads as its facts, cause and habit sentence', () => {
  const file = servedCaseFiles.cases['finding:carb_undercount'];
  const [claimed] = file.clock.projection.clock.buckets.flatMap((bucket) => bucket.occurrence_ids);
  const detail = file.selected_event[claimed].selection.detail;
  assert.deepEqual(occurrenceFacts(detail), {
    figure: '40 g · 4 U',
    lines: [
      { kind: 'outcome', text: 'Peak 148 mg/dL, 180 min after the bolus' },
      { kind: 'cause', text: `Attributed to Carb undercount · ${detail.reason.cause.text}` },
      { kind: 'habit', text: 'Carb undercount · Meets criteria' },
    ],
  });
  // ADR 454: the claim's cause text is the claimant's recorded sentence, so the server
  // serves that sentence once, on the cause.
  assert.ok(detail.reason.cause.text);
  assert.equal(detail.reason.habits[0].detail, null);
});

test('#432 · a selected Pattern Occurrence lists each served habit with its band label', () => {
  const detail = servedProjection.pattern_clock_case.selection.detail;
  const { figure, lines } = occurrenceFacts(detail);
  const [bolus] = detail.markers.filter((marker) => marker.kind === 'bolus' && marker.minute === 0);
  assert.deepEqual([bolus.carbs, bolus.insulin], [30, 3], 'the selected meal is its own minute-0 bolus');
  assert.equal(figure, '30 g · 3 U');
  assert.deepEqual(detail.reason.habits.map((habit) => [habit.lever, habit.verdict, habit.detail]), [
    ['carb_undercount', 'outranked',
      'Synthetic carb undercount judgment: this Occurrence did not meet the criteria.'],
    ['late_bolus', 'fired', null],
  ]);
  assert.deepEqual(lines, [
    { kind: 'cause', text: `Attributed to Late bolus · ${detail.reason.cause.text}` },
    { kind: 'habit', text: 'Carb undercount · claimed by another finding · '
      + 'Synthetic carb undercount judgment: this Occurrence did not meet the criteria.' },
    { kind: 'habit', text: 'Late bolus · Meets criteria' },
  ]);
});

test('#432 · a selected correction cluster reads its dose and source corrections, never counts', () => {
  const file = servedCaseFiles.cases['finding:correction_stacking'];
  const row = file.clock.occurrences[0];
  const detail = file.selected_clock[row.id].selection.detail;
  const { figure, lines } = occurrenceFacts(detail);
  assert.equal(figure, '2 U');
  assert.deepEqual(lines.map((line) => line.kind),
    ['cause', 'habit', 'source-correction', 'source-correction']);
  assert.deepEqual(lines.slice(2).map((line) => line.text),
    ['08:30 · 1.5 U correction', '10:00 · 2 U correction']);
  const source = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');
  for (const retired of [/The canvas shows the selected glucose trace/, /glucose readings</,
    /event markers</, /Occurrence's server-owned trace/]) {
    assert.doesNotMatch(source, retired);
  }
});

test('#423 · Diagnose words an outranked occurrence with the Day desk\'s claimed word', () => {
  // One definition: the verdict band's footer and the selected occurrence's tag
  // read VERDICT_RESIDUE_KEY, whose outranked label is built from the word the
  // Episode Log prints, never a second spelling of it.
  const source = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ ANCHOR_STATE_WORD \} from '\.\/day-chart\.js';/);
  assert.match(source,
    /const VERDICT_RESIDUE_KEY = \{ outranked: `\$\{ANCHOR_STATE_WORD\.outranked\} by another finding`, no_data: 'not comparable' \};/);
  assert.equal(`${ANCHOR_STATE_WORD.outranked} by another finding`, 'claimed by another finding');
  // "Factor" is a synonym CONTEXT.md retires for Lever; no desk source keeps it.
  const desk = readdirSync(new URL('.', import.meta.url))
    .filter((name) => /\.m?js$/.test(name) && !/\.test\.m?js$/.test(name));
  for (const name of desk) {
    assert.doesNotMatch(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'), /claimed by another factor/, name);
  }
});

test('#404 · grouped comparison names its cohort once while case rosters keep their varying tier', () => {
  const source = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');
  const comparison = source.slice(source.indexOf('function renderEventComparisonRoster'),
    source.indexOf('function renderClearTrace'));
  const cases = source.slice(source.indexOf('function renderCaseRoster'),
    source.indexOf('function renderEventComparisonRoster'));
  assert.ok(comparison && cases, 'the two roster owners remain distinct');
  assert.match(comparison, /<b>\$\{cohort\.name\}<\/b>/,
    'the grouped comparison owns the constant cohort label in its heading');
  assert.match(comparison, /html: `<span class="when">\$\{when\}<\/span><span class="only">\$\{detail\}<\/span>`/,
    'comparison rows reserve their compact description column for occurrence evidence');
  assert.doesNotMatch(comparison, /<span class="tier">\$\{cohort\.name\}<\/span>/,
    'comparison rows do not repeat the cohort that their heading already names');
  assert.match(cases, /<span class="tier">\$\{label\}<\/span>/,
    'case rows keep their row-varying tier label');
});

test('generated finding story pose preserves a ready id already in its preparation', () => {
  const caseFiles = JSON.parse(readFileSync(
    new URL('../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8',
  ));
  const id = 'finding:missed_meal';
  const preparation = structuredClone(caseFiles.preparation);
  const before = preparation.rendered_rows.filter((row) => row.id === id).length;
  const posed = generatedFindingPose(id)({ preparation, caseFiles }).body;
  assert.equal(posed.rendered_rows.filter((row) => row.id === id).length, before,
    'a queue-projected row is not duplicated in the preparation response');
  assert.equal(posed.findings.rows.filter((row) => row.id === id).length, 1,
    'the findings projection retains one missed-meal row');
});

test('generated missed-meal queue pose does not duplicate a served row', () => {
  const payload = JSON.parse(readFileSync(
    new URL('../mockups/diagnose-workstation.synthetic/payload.json', import.meta.url), 'utf8',
  ));
  const projectionFixture = JSON.parse(readFileSync(
    new URL('./__fixtures__/findings-projection.json', import.meta.url), 'utf8',
  ));
  const caseFiles = JSON.parse(readFileSync(
    new URL('../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8',
  ));
  const id = 'finding:missed_meal';
  const served = projectFindings(populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
    event_charts: projectionFixture.inputs.event_charts,
  }));
  const projection = generatedFindingProjection(id)(served, caseFiles);
  assert.equal(projection.rows.filter((row) => row.id === id).length, 1,
    'the replay sends one ready missed-meal row through the same fixture projection as the built app');
  const preparation = structuredClone(caseFiles.preparation);
  preparation.findings = structuredClone(projection);
  const posed = generatedFindingPose(id)({ preparation, caseFiles }).body;
  assert.equal(posed.findings.rows.filter((row) => row.id === id).length, 1,
    'the combined queue projection and story pose retain one missed-meal finding');
  assert.doesNotThrow(() => assertMatchingFindingCasePreparation(posed, null),
    'the combined pose remains a valid no-duplicate-ready-id preparation response');
});

test('#223 · direction-only Correction factor detail leaves evidence ownership with the analyzer', () => {
  const fixture = JSON.parse(readFileSync(
    new URL('./__fixtures__/findings-projection.json', import.meta.url), 'utf8',
  ));
  const analyzer = fixture.direction_only_inputs.analysis.isf[0];
  const originalDocument = globalThis.document;
  const elements = [];
  const element = (tagName = 'div') => {
    const node = {
      tagName: tagName.toUpperCase(), className: '', dataset: {}, innerHTML: '', children: [],
      append(...children) { this.children.push(...children); },
      addEventListener() {},
    };
    elements.push(node);
    return node;
  };
  try {
    globalThis.document = { createElement: element };
    const host = element();
    renderIsfLevel(host, analyzer, false, () => assert.fail('direction-only detail cannot stage'));

    const [detail] = host.children;
    assert.ok(detail.innerHTML.includes(analyzer.annotation),
      'the rendered detail transcribes the analyzer explanation');
    assert.match(analyzer.annotation, /fasting data agrees with the set factor/i);
    assert.match(analyzer.annotation, /recurring correction-linked lows call for weaker corrections/i);
    const footer = detail.children.find((child) => child.className === 'slot-foot');
    assert.equal(footer?.innerHTML,
      '<span class="foot-note">No new number is available, so there is nothing to stage.</span>',
      'the rendered footer is limited to actionability');
    assert.equal(elements.some((node) => node.tagName === 'BUTTON'), false,
      'the rendered direction-only detail has no stage affordance');
  } finally {
    globalThis.document = originalDocument;
  }
});

test('basal detail states the served support floor', () => {
  const originalDocument = globalThis.document;
  const element = () => ({
    className: '', innerHTML: '', children: [], dataset: {},
    append(...children) { this.children.push(...children); },
    insertAdjacentHTML() {},
    addEventListener() {},
  });
  try {
    globalThis.document = { createElement: element };
    const host = element();
    renderSlotLevel(host, {
      i: 0, startMin: 0, endMin: 30, asserts: false, verdict: 'insufficient',
      slot: {
        current: 0.8, recommended: null, safety_status: 'insufficient evidence',
        annotation: 'not enough nights of steady data yet to point one way',
        estimate: { value: 0.8, lo: 0.7, hi: 0.9, n: 3, wide: false },
      },
    }, new Set(), 30, 11, () => assert.fail('thin detail cannot stage'), {
      nightEvidence: { nights: [], roster_glucose_mean: null, excluded_night_count: 0 },
    });

    const footer = host.children[0].children.find((child) => child.className === 'slot-foot');
    assert.match(footer.innerHTML, /below the 11-night support floor/);
  } finally {
    globalThis.document = originalDocument;
  }
});

class RosterElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.innerHTML = '';
    this.textContent = '';
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.html = [];
  }

  insertAdjacentHTML(_position, html) { this.html.push(html); }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  click() { this.listeners.get('click')?.(); }
}

function laneDocument() {
  const doc = { activeElement: null, createElement(tag) {
    const node = new RosterElement(tag);
    node.focus = () => { doc.activeElement = node; };
    return node;
  } };
  doc.body = doc.createElement('body');
  doc.activeElement = doc.body;
  const host = new RosterElement();
  host.style = {};
  host.contains = node => node === host || host.children.includes(node);
  host.querySelectorAll = () => host.children.filter(node => node.tagName === 'BUTTON' && !node.dataset.clockCopy);
  Object.defineProperty(host, 'innerHTML', { set(value) {
    assert.equal(value, '');
    // Removing a focused descendant blurs it, as the browser does.
    if (host.children.includes(doc.activeElement)) doc.activeElement = doc.body;
    host.children = [];
  } });
  return { doc, host };
}

test('a basal lane repaint keeps the selected slot and its keyboard focus', () => {
  const originalDocument = globalThis.document;
  const { doc, host } = laneDocument();
  const lane = { cells: [
    { i: 0, label: '00:00', verdict: 'hold' },
    { i: 47, label: '23:30', verdict: 'insufficient' },
  ] };
  try {
    globalThis.document = doc;
    let selected = lane.cells[0];
    const paint = () => renderLane(host, lane, selected, new Set(), cell => { selected = cell; paint(); });
    paint();
    host.children[1].click();
    host.children[1].focus();
    // A newly selected slot's evidence completes and the same painter runs again.
    paint();
    assert.deepEqual(host.children.map(node => node.getAttribute('aria-pressed')), ['false', 'true']);
    assert.equal(doc.activeElement, host.children[1], 'the selected slot still owns keyboard focus after evidence repaint');
    // The next input reaches the current buttons and can change selection.
    host.children[0].click();
    host.children[0].focus();
    paint();
    assert.deepEqual(host.children.map(node => node.getAttribute('aria-pressed')), ['true', 'false']);
    assert.equal(doc.activeElement, host.children[0]);
  } finally { globalThis.document = originalDocument; }
});

test('a basal lane repaint respects cleared selection and focus outside the lane', () => {
  const originalDocument = globalThis.document;
  const { doc, host } = laneDocument();
  const lane = { cells: [{ i: 0, label: '00:00', verdict: 'hold' }] };
  try {
    globalThis.document = doc;
    renderLane(host, lane, lane.cells[0], new Set(), () => assert.fail('retired callback'));
    host.children[0].focus();
    const otherControl = doc.createElement('button');
    otherControl.focus();
    let picked = null;
    renderLane(host, lane, null, new Set([0]), cell => { picked = cell; });
    assert.equal(host.children[0].getAttribute('aria-pressed'), 'false', 'navigation can still clear selection');
    assert.equal(doc.activeElement, otherControl, 'a selected slot does not steal focus back from another control');
    assert.equal(host.children[0].dataset.staged, 'true', 'the repaint still updates staged state');
    host.children[0].click();
    assert.equal(picked, lane.cells[0], 'the replacement button invokes the current pick callback');
  } finally { globalThis.document = originalDocument; }
});

test('a basal lane repaint does not reclaim focus moved to the spotlight during rebuild', () => {
  const originalDocument = globalThis.document;
  const { doc, host } = laneDocument();
  const lane = { cells: [{ i: 0, label: '00:00', verdict: 'hold' }] };
  try {
    globalThis.document = doc;
    renderLane(host, lane, lane.cells[0], new Set(), () => {});
    host.children[0].focus();
    const spotlight = doc.createElement('div');
    const append = host.append.bind(host);
    host.append = (...children) => {
      append(...children);
      spotlight.focus();
    };
    renderLane(host, lane, lane.cells[0], new Set(), () => {});
    assert.equal(doc.activeElement, spotlight, 'the spotlight keeps focus acquired during the lane rebuild');
    assert.equal(host.children[0].getAttribute('aria-pressed'), 'true', 'retaining spotlight focus does not clear slot selection');
  } finally { globalThis.document = originalDocument; }
});

// #433 (D6): a recurring-lows lower names why it lowers, in its title and its
// accessible name, while a measured lower keeps the plain phrase. Both cells
// keep the lower paint (`data-verdict="down"`).
test('a recurring-lows lower cell says the lower comes from recurring lows', () => {
  const originalDocument = globalThis.document;
  const { doc, host } = laneDocument();
  const lane = buildSlotLane([
    { label: '00:30', current: 0.6, recommended: 0.5, asserts_move: true, direction: 'lower',
      safety_status: 'lower', estimate: { n: 30, wide: false } },
    { label: '05:00', current: 0.6, recommended: 0.5, asserts_move: true, direction: 'lower',
      safety_status: 'lower (recurring lows)', estimate: { n: 0, wide: true } },
  ]);
  try {
    globalThis.document = doc;
    renderLane(host, lane, null, new Set(), () => {});
    const [measured, recurring] = host.children;
    assert.equal(measured.dataset.verdict, 'down');
    assert.equal(measured.dataset.reason, undefined);
    assert.equal(measured.title, '00:30 · suggests a lower');
    assert.equal(measured.getAttribute('aria-label'), '00:30 basal slot, suggests a lower');
    assert.equal(recurring.dataset.verdict, 'down');
    assert.equal(recurring.dataset.reason, 'recurring-lows');
    assert.equal(recurring.title, '05:00 · suggests a lower because lows keep happening at this hour');
    assert.equal(recurring.getAttribute('aria-label'),
      '05:00 basal slot, suggests a lower because lows keep happening at this hour');
  } finally { globalThis.document = originalDocument; }
});

const basalCell = {
  i: 0, startMin: 0, endMin: 30, asserts: false, verdict: 'insufficient',
  slot: {
    current: 0.6, recommended: null, safety_status: 'insufficient evidence',
    annotation: 'not enough nights of steady data yet to point one way',
    estimate: { value: 0.8, lo: 0.7, hi: 0.9, n: 3, wide: false },
  },
};

/* A served excluded-night breakdown: all six keys, as the analyzer stamps them
   on every basal slot (#434). */
const excludedReasons = (counts = {}) => ({
  before_current_setting: 0, below_range_or_suspended: 0, above_range: 0,
  insulin_acting: 0, carb_log: 0, other: 0, ...counts,
});

const nightPayload = {
  roster_glucose_mean: 119.5,
  excluded_night_count: 2,
  excluded_night_reasons: excludedReasons({ before_current_setting: 1, carb_log: 1 }),
  nights: [
    { date: '2026-01-01', sign: 1, delivered_rate: 0.8, programmed_rate: 0.6,
      glucose_entry: 111, glucose_exit: 121, glucose_mean: 116,
      t: '2026-01-01T00:00:00', glucose_trace: [{ t: '2026-01-01 00:00:00', bg: 111 }] },
    { date: '2026-01-02', sign: -1, delivered_rate: 0.4, programmed_rate: 0.6,
      t: '2026-01-02T00:00:00', glucose_entry: 109, glucose_exit: 99, glucose_mean: 104,
      glucose_trace: [{ t: '2026-01-02 00:00:00', bg: 109 }] },
    { date: '2026-01-03', sign: null, delivered_rate: 0.6, programmed_rate: 0.6,
      t: '2026-01-03T00:00:00', glucose_entry: null, glucose_exit: null, glucose_mean: null, glucose_trace: [] },
    { date: '2026-01-04', sign: null, delivered_rate: 0.6, programmed_rate: null,
      t: '2026-01-04T00:00:00', glucose_entry: 100, glucose_exit: null, glucose_mean: 100, glucose_trace: [] },
  ],
};

test('basal slot detail groups served nights, selects one, and preserves roster mechanics', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const host = new RosterElement();
    const selected = [];
    renderSlotLevel(host, basalCell, new Set(), 30, 8, () => {}, {
      nightEvidence: nightPayload, selectedId: '2026-01-01', shownCount: 5,
      onSelect: (id) => selected.push(id), onMore() {}, onClear() {}, onDay() {},
    });

    assert.match(host.html.join('\n'), /Nights of steady data/);
    assert.match(host.html.join('\n'), /Ran above.*1 night/);
    assert.match(host.html.join('\n'), /Ran below.*1 night/);
    assert.match(host.html.join('\n'), /Ran as set.*1 night/);
    assert.match(host.html.join('\n'), /No programmed rate.*1 night/);
    assert.ok(host.html.includes(
      '<div class="empty">2 excluded nights: 1 before the current rate, 1 logged carbs</div>'),
    'the one excluded-night line names the served total and each served reason');
    const rows = host.children.filter((child) => child.className === 'ev-row case-occurrence');
    assert.equal(rows.length, 4);
    assert.equal(rows[0].getAttribute('aria-pressed'), 'true');
    rows[1].click();
    assert.deepEqual(selected, ['2026-01-02']);
    assert.match(host.children.map((child) => child.innerHTML).join('\n'), /Jan 1/);
    assert.match(host.children.map((child) => child.innerHTML).join('\n'), /111/);
  } finally {
    globalThis.document = originalDocument;
  }
});

/* #434: the panel's one excluded-night line names every nonzero served reason,
   in rank order, and still prints only when the served total is nonzero. */
test('basal slot panel names each served excluded-night reason on its one line', () => {
  const originalDocument = globalThis.document;
  const excludedLines = (count, reasons) => {
    const host = new RosterElement();
    renderSlotLevel(host, basalCell, new Set(), 30, 8, () => {}, {
      nightEvidence: { ...nightPayload, excluded_night_count: count,
        excluded_night_reasons: excludedReasons(reasons) },
    });
    return host.html.filter((html) => /excluded night/.test(html));
  };
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    assert.deepEqual(excludedLines(5, { before_current_setting: 3, below_range_or_suspended: 1, insulin_acting: 1 }),
      ['<div class="empty">5 excluded nights: 3 before the current rate, 1 low or suspended, 1 insulin on board</div>']);
    assert.deepEqual(excludedLines(1, { below_range_or_suspended: 1 }),
      ['<div class="empty">1 excluded night: 1 low or suspended</div>'], 'one night, in the singular');
    assert.deepEqual(excludedLines(1, { other: 1 }),
      ['<div class="empty">1 excluded night: 1 other reason</div>'], 'one other night, in the singular');
    assert.deepEqual(excludedLines(2, { other: 2 }),
      ['<div class="empty">2 excluded nights: 2 other reasons</div>'], 'two other nights, in the plural');
    assert.deepEqual(excludedLines(0, {}), [], 'no excluded nights, no line');
  } finally {
    globalThis.document = originalDocument;
  }
});

test('basal slot evidence states distinguish loading and unavailable data', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    for (const [nightEvidence, message, busy] of [[{ pending: true }, 'Loading nights…', true], [{ stale: true }, 'Night evidence unavailable.', false]]) {
      const host = new RosterElement();
      renderSlotLevel(host, basalCell, new Set(), 30, 8, () => {}, { nightEvidence });
      const html = host.html.join('\n');
      assert.match(html, new RegExp(message));
      // only the pending line tells assistive tech the region is being updated
      assert.equal(/aria-busy="true"/.test(html), busy, `${message} aria-busy`);
      assert.equal(host.children.filter((child) => child.className === 'ev-row case-occurrence').length, 0);
    }
  } finally {
    globalThis.document = originalDocument;
  }
});

/* NOT a byte-identity check against origin/main — this renders the same head
   twice in this tree, so an edit to the numbers or the staging markup moves both
   sides together and it stays green. What it does prove is the roster's own
   claim: adding nights beneath the block perturbs nothing inside it. */
test('the night roster perturbs nothing in the numbers and staging block', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const plain = new RosterElement();
    const withRoster = new RosterElement();
    renderSlotLevel(plain, basalCell, new Set(), 30, 8, () => {}, {
      nightEvidence: { nights: [], roster_glucose_mean: null, excluded_night_count: 0 },
    });
    renderSlotLevel(withRoster, basalCell, new Set(), 30, 8, () => {}, { nightEvidence: nightPayload });
    assert.equal(withRoster.children[0].innerHTML, plain.children[0].innerHTML,
      'a served roster leaves the parameter numbers identical to a roster-free render');
    assert.equal(withRoster.children[0].children.find((child) => child.className === 'slot-foot').innerHTML,
      plain.children[0].children.find((child) => child.className === 'slot-foot').innerHTML,
      'a served roster leaves the staging block identical to a roster-free render');
  } finally {
    globalThis.document = originalDocument;
  }
});

test('basal night roster caps and expands its served rows', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const payload = structuredClone(nightPayload);
    payload.nights = Array.from({ length: 7 }, (_, index) => ({ ...payload.nights[0], date: `2026-02-0${index + 1}` }));
    const collapsed = new RosterElement();
    const more = [];
    renderSlotLevel(collapsed, basalCell, new Set(), 30, 8, () => {}, {
      nightEvidence: payload, shownCount: 5, onMore: () => more.push('expand'),
    });
    assert.equal(collapsed.children.filter((child) => child.className === 'ev-row case-occurrence').length, 5);
    const toggle = collapsed.children.find((child) => child.className === 'more');
    assert.equal(toggle.textContent, '2 more');
    toggle.click();
    assert.deepEqual(more, ['expand']);
    const expanded = new RosterElement();
    renderSlotLevel(expanded, basalCell, new Set(), 30, 8, () => {}, {
      nightEvidence: payload, shownCount: Infinity,
    });
    assert.equal(expanded.children.filter((child) => child.className === 'ev-row case-occurrence').length, 7);
  } finally { globalThis.document = originalDocument; }
});

/* The rail reads as sentences on screen, so the assertions below read the same
   way the browser stories do — tags stripped, whitespace collapsed — rather than
   pinning markup a purely visual edit would churn. */
const sentences = (host) => host.children.map((child) => child.innerHTML)
  .join('\n').replace(/<[^>]*>/g, '').replace(/[ \t\n]+/g, ' ').trim();

test('basal night detail prints the served rates and glucose beside the roster mean', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const host = new RosterElement();
    renderSlotLevel(host, basalCell, new Set(), 30, 8, () => {}, {
      nightEvidence: nightPayload, selectedId: '2026-01-01', shownCount: 5,
    });

    const detail = sentences(host);
    assert.match(detail, /0\.80 U\/h delivered · 0\.60 U\/h programmed/,
      'the detail prints both served rates as served');
    assert.match(detail, /116 mg\/dL this night · 120 mg\/dL roster mean/,
      'the detail prints the night mean beside the served roster mean');
  } finally { globalThis.document = originalDocument; }
});

test('basal night detail prints every null served rate and mean as an em dash', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const noMean = new RosterElement();
    renderSlotLevel(noMean, basalCell, new Set(), 30, 8, () => {}, {
      nightEvidence: nightPayload, selectedId: '2026-01-03', shownCount: 5,
    });
    assert.match(sentences(noMean), /— mg\/dL this night · 120 mg\/dL roster mean/,
      'a null served night mean prints as an em dash, not a blank or a zero');

    const noProgrammed = new RosterElement();
    renderSlotLevel(noProgrammed, basalCell, new Set(), 30, 8, () => {}, {
      nightEvidence: nightPayload, selectedId: '2026-01-04', shownCount: 5,
    });
    assert.match(sentences(noProgrammed), /0\.60 U\/h delivered · — U\/h programmed/,
      'a night with no programmed rate prints an em dash on the same spine');
  } finally { globalThis.document = originalDocument; }
});

test('basal night detail names the group the served night was sorted into', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    for (const [date, label] of [['2026-01-01', 'Ran above'], ['2026-01-02', 'Ran below'],
      ['2026-01-03', 'Ran as set'], ['2026-01-04', 'No programmed rate']]) {
      const host = new RosterElement();
      renderSlotLevel(host, basalCell, new Set(), 30, 8, () => {}, {
        nightEvidence: nightPayload, selectedId: date, shownCount: 5,
      });
      const head = host.children.find((child) => child.className === 'inner occ-detail');
      assert.match(head.innerHTML, new RegExp(`<span class="tag">${label}</span>`),
        `the ${label} night carries its group as the sibling detail tag`);
      assert.match(head.innerHTML, /<span class="when">Jan \d+ · 00:00–00:30<\/span>/,
        `the ${label} night's head carries the slot span beside the date`);
    }
  } finally { globalThis.document = originalDocument; }
});

/* Spec :28 — the row is date, delivered against programmed, in-slot mean. Entry
   and exit belong to the selected night's detail block; a row carrying them
   instead cannot be compared against its own programmed rate. */
test('each basal night row prints the served date, both rates and the in-slot mean', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const host = new RosterElement();
    renderSlotLevel(host, basalCell, new Set(), 30, 8, () => {}, {
      nightEvidence: nightPayload, shownCount: 5,
    });
    const rows = host.children.filter((child) => child.className === 'ev-row case-occurrence');
    const cells = (row) => [...row.innerHTML.matchAll(/<span class="(when|entry|arrow|worst|delta)">([^<]*)<\/span>/g)]
      .map((match) => match[2].trim());

    assert.deepEqual(cells(rows[0]), ['Jan 1', '0.80', '·', '0.60', '116'],
      'the ran-above night compares its delivered rate against its programmed rate');
    assert.deepEqual(cells(rows[1]), ['Jan 2', '0.40', '·', '0.60', '104'],
      'the ran-below night prints the same four served facts');
    assert.deepEqual(cells(rows[2]), ['Jan 3', '0.60', '·', '0.60', '—'],
      'a null served in-slot mean prints as an em dash');
    assert.deepEqual(cells(rows[3]), ['Jan 4', '0.60', '·', '—', '100'],
      'a night with no served programmed rate prints an em dash in its place');
    assert.doesNotMatch(rows[0].innerHTML, /111|121/,
      'entering and leaving glucose stay in the detail block, off the row');
  } finally { globalThis.document = originalDocument; }
});

test('basal night roster preserves a null served roster mean as an em dash', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const payload = structuredClone(nightPayload);
    payload.roster_glucose_mean = null;
    const host = new RosterElement();
    renderSlotLevel(host, basalCell, new Set(), 30, 8, () => {}, { nightEvidence: payload, shownCount: 5 });
    assert.match(host.html.join('\n'), /— mg\/dL mean/);
  } finally { globalThis.document = originalDocument; }
});

test('#356 · a carb-ratio block names the day edge 24:00 and keeps its geometry', () => {
  /* The findings queue row that opens this panel carries the server's own
     label for the same block, `00:00 to 24:00`. Naming the block from a bare
     clock formatter reduced its exclusive end minute modulo one day, so the
     whole-day block announced a zero-length interval one click below the row
     that had just named the whole day. The cells are built from block payloads
     here, not from a hand-set span, so the producer is what is pinned. */
  const [wholeDay, throughMidnight] = buildIcBlocks([
    {
      block_id: 0,
      label: 'All day',
      start_min: 0,
      end_min: 1440,
      current_values: [5.6],
      recommended: 5.7,
      direction: 'raise',
      asserts_move: true,
      state: 'numeric',
    },
    {
      block_id: 1200,
      label: 'Overnight',
      start_min: 1200,
      end_min: 360,
      current_values: [5.6],
      recommended: 5.5,
      direction: 'lower',
      asserts_move: true,
      state: 'numeric',
    },
  ]);

  assert.equal(wholeDay.span, '00:00–24:00');
  assert.equal(wholeDay.wraps, false);
  assert.deepEqual(wholeDay.spans, [[0, 1440]]);

  assert.equal(throughMidnight.span, '20:00–06:00');
  assert.equal(throughMidnight.wraps, true);
  assert.deepEqual(throughMidnight.spans, [[1200, 1440], [0, 360]]);
});


test('#395 · fixture Pattern cases retain every requested clock and event coordinate', () => {
  const capture = JSON.parse(readFileSync(new URL(
    '../mockups/diagnose-event-comparison.synthetic/capture.json', import.meta.url), 'utf8'));
  const preparation = JSON.parse(readFileSync(new URL(
    '../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8')).preparation;
  for (const alignment of ['clock', 'event']) {
    const url = new URL('http://app.local/api/diagnose/finding-case-file');
    url.search = new URLSearchParams({ projection_id: preparation.projection_id,
      finding_id: 'pattern:highs_after_meals', alignment });
    const response = patternCaseResponse(capture, url, preparation.coordinates.window);
    assert.equal(validFindingCaseFile(response), true);
    assert.equal(response.projection_id, preparation.projection_id);
    assert.equal(response.finding.id, url.searchParams.get('finding_id'));
    assert.equal(response.projection.alignment, alignment);
    assert.deepEqual(response.window, preparation.coordinates.window);
    assert.equal(sameFindingCaseWindow(response.window, null), true);
    assert.equal(response.selection.state, 'none');
    assert.equal(response.selection.requested_id, null);
    if (alignment === 'clock') assert.equal(response.projection.clock.buckets.length, 12);
  }
});

/* #424 — the Response comparison caption names every served cohort as its section
   heading does, with its served count, links the band's own words once where a
   cohort serves the band state it holds, and names the Occurrences outside the
   comparison only when that served count is non-zero. It computes no count and
   derives no link; the band keeps "not comparable" for no data. */
function renderedCaption(caseFile) {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const host = new RosterElement();
    renderEventComparisonRoster(host, caseFile, null, () => {}, () => {}, 5);
    const [caption, ...rest] = host.html;
    return {
      caption: caption.match(/<span class="meta">([\s\S]*?)<\/span>/)[1].replace(/\s+/g, ' ').trim(),
      headings: rest,
    };
  } finally {
    globalThis.document = originalDocument;
  }
}

test('#424 · a same-population caption names each cohort as its heading does and adds up', () => {
  const captures = JSON.parse(readFileSync(new URL(
    '../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8'));
  const caseFile = captures.cases['finding:carb_undercount'].event;
  const { cohorts, counts } = caseFile.projection;
  const { caption, headings } = renderedCaption(caseFile);

  assert.equal(caption,
    '6 Matched (meets criteria) · 1 Nearly matched (borderline) · 3 Other meal opportunities');
  for (const cohort of cohorts) {
    assert.ok(headings.some((html) => html.includes(`<b>${cohort.name}</b>`)
      && html.includes(`· ${counts[cohort.key]} occurrence`)), `${cohort.name} heading matches`);
  }
  assert.equal(cohorts.reduce((sum, cohort) => sum + counts[cohort.key], 0),
    caseFile.summary.denominator);
  assert.doesNotMatch(caption, /not comparable|outside the comparison/);
});

test('#424 · a cross-population caption names its Highs outside the comparison', () => {
  const missed = JSON.parse(readFileSync(new URL(
    './__fixtures__/missed-meal-comparison.json', import.meta.url), 'utf8'));

  assert.equal(renderedCaption(missed.payload).caption,
    '2 Matched · 0 Nearly matched (borderline) · 1 Completed carb-bolus meals'
    + ' · 1 high outside the comparison');
  assert.equal(renderedCaption(missed.zero_payload).caption,
    '0 Matched · 0 Nearly matched (borderline) · 1 Completed carb-bolus meals'
    + ' · 3 highs outside the comparison');
});
