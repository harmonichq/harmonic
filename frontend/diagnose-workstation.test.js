import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import {
  buildIcBlocks, crumbLabel, frameSubject, icBlockCrumbMeta, occurrenceDescription, occurrenceFacts,
  queryState, renderCaseHead, renderEventComparisonRoster, renderIcBlockLevel, renderIsfLevel,
  renderSlotLevel, renderLane,
} from './diagnose-workstation.js';
import { evidenceDayContext } from './diagnose-context.js';
import { glossaryGroups } from './glossary.js';
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
  assert.equal(bolusRows.length, 98, 'the capture serves meal and correction rows to describe');
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
  const caseFiles = JSON.parse(readFileSync(
    new URL('../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8',
  ));
  const id = 'finding:missed_meal';
  const served = projectFindings(populateFindingsProjectionInput({ exposures: payload.exposures }));
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

test('the correction-factor panel names its setting and prints each value insulin first (#451)', () => {
  const fixture = JSON.parse(readFileSync(
    new URL('./__fixtures__/findings-projection.json', import.meta.url), 'utf8',
  ));
  const held = fixture.inputs.analysis.isf[0];
  const stageable = { ...held, asserts_move: true, recommended: 32,
    evidence: { ...held.evidence, direction: 'strengthen' } };
  const originalDocument = globalThis.document;
  const element = () => ({
    className: '', dataset: {}, innerHTML: '', children: [],
    append(...children) { this.children.push(...children); },
    addEventListener() {},
  });
  const rendered = (node) => [node.innerHTML, ...node.children.map(rendered)].join(' ');
  try {
    globalThis.document = { createElement: element };
    for (const row of [held, stageable]) {
      const host = element();
      renderIsfLevel(host, row, false, () => {});
      const text = rendered(host);
      assert.match(text, /<span class="time">Correction factor<\/span>/, 'the heading names the setting');
      assert.match(text, /daytime Correction factor is not separately identifiable/i, 'the scope sentence names it');
      assert.match(text, /<b>1 U : 36\.00 mg\/dL<\/b>/, 'the current value keeps the panel rounding');
      assert.doesNotMatch(text, /ISF|mg\/dL\/U/);
    }
    const host = element();
    renderIsfLevel(host, stageable, false, () => {});
    assert.match(rendered(host), /<b>1 U : 32\.00 mg\/dL<\/b>/, 'the recommended value reads insulin first');
  } finally {
    globalThis.document = originalDocument;
  }
});

/* #459 (ADR 459 point 1): a stage control whose press would replace a change
   staged for a different setting says so, and names that change, before the
   press. `replaces` is the panel option carrying that change's name. */
function stagePanel459(isfStaged, replaces) {
  const fixture = JSON.parse(readFileSync(
    new URL('./__fixtures__/findings-projection.json', import.meta.url), 'utf8',
  ));
  const held = fixture.inputs.analysis.isf[0];
  const stageable = { ...held, asserts_move: true, recommended: 32,
    evidence: { ...held.evidence, direction: 'strengthen' } };
  const originalDocument = globalThis.document;
  const buttons = [];
  const element = (tagName = 'div') => {
    const node = {
      tagName: tagName.toUpperCase(), className: '', dataset: {}, innerHTML: '', children: [],
      append(...children) { this.children.push(...children); },
      addEventListener() {},
    };
    if (node.tagName === 'BUTTON') buttons.push(node);
    return node;
  };
  try {
    globalThis.document = { createElement: element };
    renderIsfLevel(element(), stageable, isfStaged, () => {}, { replaces });
  } finally {
    globalThis.document = originalDocument;
  }
  assert.equal(buttons.length, 1, 'premise: the stageable panel renders one stage control');
  return buttons[0];
}

test('#459 · a stage control that would replace another setting says so and names the change', () => {
  const button = stagePanel459(false, 'Carb ratio 00:00–24:00');
  assert.equal(button.dataset.staged, 'false');
  assert.equal(button.innerHTML,
    'Replace staged change<span class="sub">replaces Carb ratio 00:00–24:00</span>');
});

test('#459 guard · an already-staged control keeps "Staged · Undo" whatever it would replace', () => {
  for (const replaces of [null, 'Carb ratio 00:00–24:00']) {
    const button = stagePanel459(true, replaces);
    assert.equal(button.dataset.staged, 'true');
    assert.equal(button.innerHTML, 'Staged · <span class="undo">Undo</span><span class="sub">staged for Plan</span>');
  }
});

test('#459 guard · a control that replaces nothing keeps "Stage change" and "staged for Plan"', () => {
  const button = stagePanel459(false, null);
  assert.equal(button.dataset.staged, 'false');
  assert.equal(button.innerHTML, 'Stage change<span class="sub">staged for Plan</span>');
});

test('the breadcrumb names the correction-factor level in the wearer\'s words (#451)', () => {
  const chartTitle = (chartId) => (chartId === 'glucose' ? 'Glucose' : null);
  assert.equal(crumbLabel({ k: 'isf' }, chartTitle), 'Correction factor');
  assert.equal(crumbLabel({ k: 'factors' }, chartTitle), 'Findings');
  assert.equal(crumbLabel({ k: 'slot', cell: { label: '03:00' } }, chartTitle), '03:00 slot');
  assert.equal(crumbLabel({ k: 'block', cell: { label: 'Evening' } }, chartTitle), 'Evening block');
  assert.equal(crumbLabel({ k: 'chart', chartId: 'glucose' }, chartTitle), 'Glucose');
  assert.equal(crumbLabel({ k: 'chart', chartId: 'other' }, chartTitle), 'Chart');
});

test('a case head names the peak hour\'s carb ratio block in the wearer\'s words (#451)', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tag) => new RosterElement(tag) };
    const host = new RosterElement();
    const clock = { buckets: [{ start_min: 1080, end_min: 1200, n: 3 }], peak_bucket_index: 0, total: 3 };
    renderCaseHead(host, {
      finding: { title: 'Highs after meals', lever: 'missed_meal' }, family: 'highs',
      summary: { claimed: 3, denominator: 5 }, projection: { alignment: 'clock', clock }, window: { label: '24 h' },
    }, { cells: [{ startMin: 0, endMin: 1440, label: '00:00', verdict: 'hold' }] }, () => {},
    [{ label: 'Evening', span: '17:00 to 22:00', spans: [[1020, 1320]], verdict: 'hold' }], () => {});
    const link = host.children[0].children.find((child) => child.className === 'slotlink');
    const words = link.html.join(' ');
    assert.match(words, /and in the Evening carb ratio block,/);
    assert.doesNotMatch(words, /I:C/);
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
    assert.equal(recurring.title, '05:00 · suggests a lower because lows keep happening overnight');
    assert.equal(recurring.getAttribute('aria-label'),
      '05:00 basal slot, suggests a lower because lows keep happening overnight');
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
    // ADR 466 decision 6: each value's visible text comes first, then its column
    // and unit in visually hidden text.
    const cellPattern = /<span class="(when|entry|arrow|worst|delta)">([^<]*)(?:<span class="gf-visually-hidden">([^<]*)<\/span>)?<\/span>/g;
    const cells = (row) => [...row.innerHTML.matchAll(cellPattern)].map((match) => match[2].trim());
    const hidden = (row) => [...row.innerHTML.matchAll(cellPattern)].map((match) => match[3]?.trim())
      .filter(Boolean);

    const header = host.html.join('\n').match(/<div class="ev-cols" aria-hidden="true">([^]*?)<\/div>/);
    assert.ok(header, 'one header row, hidden from assistive technology');
    // N1: each name sits in the track of the value it names, on the rows' grid.
    assert.deepEqual([...header[1].matchAll(/<span class="(\w+)" title="([^"]+)">/g)]
      .map((match) => [match[1], match[2]]),
    [['entry', 'Delivered U/h'], ['worst', 'Programmed U/h'], ['delta', 'Night mean mg/dL']],
    'the header names the three columns in order, each in its value\'s track');
    for (const row of rows) {
      assert.deepEqual(hidden(row), ['U/h delivered', 'U/h programmed', 'mg/dL night mean'],
        'each row\'s values carry their column and unit for a screen reader');
    }

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

/* ADR 466: the recurring-lows panel reads task 51's served /api/analyze rows —
   01:00 held on the spread nights, 03:00 a recurring-lows lower on the same
   nights, 05:00 held within the threshold (ADR 465) — never a hand-set verdict. */
const recurringLows = JSON.parse(readFileSync(new URL(
  './__fixtures__/basal-night-evidence.json', import.meta.url), 'utf8')).recurring_lows;
const recurringCell = (label) => buildSlotLane(recurringLows.analyze_basal).cells
  .find((cell) => cell.label === label);
const OWNER_SENTENCE = 'The steady nights alone do not establish this step down. '
  + 'It comes from the overnight lows listed below.';
const HEDGE = 'is consistent with this data, not established by it.';

function recurringPanel(label, onDay = () => {}) {
  const host = new RosterElement();
  renderSlotLevel(host, recurringCell(label), new Set(), 30, 8, () => {}, {
    nightEvidence: { nights: [], roster_glucose_mean: null, excluded_night_count: 0 }, onDay,
  });
  return {
    host,
    panel: sentences({ children: [host.children[0]] }),
    extra: host.html.join('\n').replace(/<[^>]*>/g, '').replace(/[ \t\n]+/g, ' '),
    lows: host.children.filter((child) => child.tagName === 'BUTTON'),
    stage: host.children[0].children.find((child) => child.className === 'slot-foot').children
      .filter((child) => child.className === 'stagebtn').length,
  };
}

const countLine = (harm) => `Overnight lows on ${harm.recurrence_nights} night`
  + `${harm.recurrence_nights === 1 ? '' : 's'} counted since this rate was set, across the whole night, `
  + `not this half hour alone. A step down needs lows on ${harm.recurrence_bar} night`
  + `${harm.recurrence_bar === 1 ? '' : 's'}.`;

test('ADR 466 · a recurring-lows lower says the overnight lows own its step down', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const { panel } = recurringPanel('03:00');
    assert.ok(panel.includes(OWNER_SENTENCE), `the interval sentence names the lows: ${panel}`);
    assert.ok(!panel.includes(HEDGE), 'the hedge that the data does not establish a move is replaced');
  } finally { globalThis.document = originalDocument; }
});

test('ADR 466 · a recurring-lows lower shows the served count and each low, each opening Day', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const opened = [];
    const { extra, lows } = recurringPanel('03:00', (low) => opened.push(low.t));
    const harm = recurringCell('03:00').slot.evidence.harm;
    assert.ok(extra.includes(countLine(harm)), `the count line prints the served count and bar: ${extra}`);
    assert.ok(extra.includes('Lows in this half hour'));
    assert.equal(lows.length, harm.lows.length);
    assert.equal(lows.length, 2, 'premise: the served row carries two lows');
    lows.forEach((row, index) => {
      const low = harm.lows[index];
      const date = new Date(`${low.t.slice(0, 10)}T00:00:00`)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      assert.equal(row.innerHTML.replace(/<[^>]*>/g, '').trim(),
        `${date} · ${low.t.slice(11, 16)} · ${Math.round(low.bg)} mg/dL`);
      assert.ok(!row.className.includes('case-occurrence'), 'a low row is not a roster occurrence');
      row.click();
    });
    assert.deepEqual(opened, harm.lows.map((low) => low.t), 'each row hands its own served low to Day');
  } finally { globalThis.document = originalDocument; }
});

test('ADR 466 · a slot held within the threshold lists its lows and stages nothing', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const { extra, lows, stage } = recurringPanel('05:00');
    const harm = recurringCell('05:00').slot.evidence.harm;
    assert.ok(extra.includes(countLine(harm)), `the held slot prints the count line: ${extra}`);
    assert.equal(lows.length, harm.lows.length);
    assert.ok(lows.length > 0);
    assert.equal(stage, 0, 'a held slot offers no Stage change');
  } finally { globalThis.document = originalDocument; }
});

test('ADR 466 · a slot with no recurring lows keeps today\'s hedge and no lows list', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const { panel, extra, lows } = recurringPanel('01:00');
    assert.ok(panel.includes(HEDGE), `the held spread slot keeps the hedge: ${panel}`);
    assert.ok(!extra.includes('Overnight lows on'));
    assert.equal(lows.length, 0);
  } finally { globalThis.document = originalDocument; }
});

test('ADR 466 guard · a plain lower whose interval reaches the setting keeps the hedge', () => {
  // Hand-built on purpose: this pins the frontend's status-string branch, not a
  // backend verdict.
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const host = new RosterElement();
    renderSlotLevel(host, {
      i: 6, startMin: 180, endMin: 210, asserts: true, verdict: 'down',
      slot: {
        current: 0.6, recommended: 0.54, safety_status: 'lower',
        annotation: 'one cautious step down is supported at this time',
        estimate: { value: 0.54, lo: 0.45, hi: 0.66, n: 30, wide: false },
      },
    }, new Set(), 30, 8, () => {}, {
      nightEvidence: { nights: [], roster_glucose_mean: null, excluded_night_count: 0 },
    });
    const panel = sentences({ children: [host.children[0]] });
    assert.ok(panel.includes(HEDGE), panel);
    assert.ok(!panel.includes(OWNER_SENTENCE));
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

/* #464 — the carb-ratio block panel prints the settled design beneath the
   numbers block: every figure is a served field of the block-evidence payload,
   read here straight from the committed synthetic capture. */
const icCapture = JSON.parse(readFileSync(new URL(
  '../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json', import.meta.url), 'utf8')).cases;
const icExplained = icCapture.explained;
const icBlockCell = buildIcBlocks([{
  block_id: 0, label: 'Morning', start_min: 0, end_min: 720, current_values: [5.0],
  recommended: 5.2, direction: 'raise', asserts_move: true, state: 'numeric',
  n_runs: 18, n_meals: 30, annotation: 'a conservative one-step move would loosen this ratio',
  held_reason: null, estimate: { value: 5.3704, lo: 5.2452, hi: 5.4832, wide: false },
}])[0];

/* Every string the panel wrote, in document order: the level host's own
   inserted markup and the markup of each element appended beneath it. */
function icPanelText(host) {
  return [...host.html, ...host.children.slice(1).map((child) => child.innerHTML)].join('\n');
}

/* The capture's held overnight block, as the analyze feed serves its cell: no
   move asserted, so nothing recommended. */
const icHeldCell = buildIcBlocks([{
  block_id: 1200, label: 'Overnight', start_min: 1200, end_min: 420, current_values: [5.0],
  recommended: null, direction: null, asserts_move: false, state: 'numeric',
  n_runs: 9, n_meals: 18, annotation: null, held_reason: null,
  estimate: { value: 5.0, lo: 5.0, hi: 5.0, wide: false },
}])[0];

function renderIcPanel(evidence, options = {}, cell = icBlockCell) {
  const host = new RosterElement();
  renderIcBlockLevel(host, cell, new Set(), () => {}, null, { evidence, ...options });
  return host;
}

function withRosterDocument(run) {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
  try { return run(); } finally { globalThis.document = originalDocument; }
}

/* Captured from the pre-change tree (the block level before #464's panel), so
   this is a byte-identity check against that rendering, not a render compared
   with itself. */
const IC_NUMBERS_BLOCK = '\n    <div class="slot-head">\n      <span class="time">00:00–12:00</span>\n      <span class="verdict">Morning · suggests a looser ratio</span>\n    </div>\n    \n    <div class="numrows">\n      <div class="numrow"><span class="k">Current</span><b>5.00</b>\n        <span class="qual">g/U, programmed now</span></div>\n      <div class="numrow"><span class="k">Estimate</span><b>5.37</b>\n        <span class="qual">g/U, the interval below brackets THIS number</span></div>\n      <div class="numrow"><span class="k">Recommended</span><b>5.20</b>\n        <span class="qual">g/U, one conservative step</span></div>\n    </div>\n    <div class="slot-stats">CI 5.25–5.48 g/U on the estimate\n      <span></span></div>\n    \n    \n    <div class="slot-stats">18 meal runs <span>·</span> 30 meals</div>\n    <div class="slot-say">a conservative one-step move would loosen this ratio</div>';

test('#464 · the numbers and staging block is byte-identical to the pre-change rendering', () => {
  withRosterDocument(() => {
    const host = renderIcPanel(icExplained);
    assert.equal(host.children[0].innerHTML, IC_NUMBERS_BLOCK);
    const foot = host.children[0].children.find((child) => child.className === 'slot-foot');
    assert.equal(foot.children[0].innerHTML, 'Stage change<span class="sub">staged for Plan</span>');
  });
});

test('#464 · each panel line prints the served values of the explained block', () => {
  withRosterDocument(() => {
    const text = icPanelText(renderIcPanel(icExplained));
    for (const line of [
      '<div class="lvl-cap">Why this move</div>',
      '<div class="slot-stats">18 of 24 counted runs measured looser than 5.00 g/U; the estimate\'s range 5.25–5.48 leaves 5.00 out.</div>',
      '<div class="slot-stats">The ratio counts all the insulin a run used — boluses, corrections, Control-IQ basal changes — with the glucose change converted at your correction factor, judged where the run ended.</div>',
      '<div class="slot-stats">Of the 24 counted runs, 8 ended lower than they started, 16 about flat and 0 higher, where they ended; for 10 of them that end came after a later meal past 12:00.</div>',
      '<div class="slot-stats">Recommended 5.20 is half the gap from the programmed 5.00 toward the 5.37 estimate, rounded to the pump\'s 0.1 g/U step.</div>',
      '<div class="lvl-cap">The case against</div>',
      '<div class="slot-stats">8 of the 26 morning meals on counted runs peaked above 180 before their next bolus (13 counting later meals within 5 h 15 min of the bolus); a looser ratio can raise peaks.</div>',
      '<div class="lvl-cap">Lows after morning boluses</div>',
      '<div class="slot-stats">2 lows, 3 h 30 min to 3 h 30 min after the bolus; the 2 lows on counted runs point toward less insulin, the same way as the suggestion.</div>',
    ]) assert.ok(text.includes(line), `missing: ${line}`);
  });
});

test('#464 · the recommendation and lows-bearing sentences leave when served null', () => {
  withRosterDocument(() => {
    const evidence = structuredClone(icExplained);
    evidence.block.recommendation.sentence = null;
    evidence.harm_evidence.bearing_sentence = null;
    const text = icPanelText(renderIcPanel(evidence));
    assert.doesNotMatch(text, /Recommended 5\.20 is half the gap/);
    assert.ok(text.includes('<div class="slot-stats">2 lows, 3 h 30 min to 3 h 30 min after the bolus.</div>'));
    assert.equal((text.match(/class="slot-stats"/g) || []).length, 5,
      'three Why lines, the case against and the lows line');
  });
});

test('#464 · a collecting, below-floor or unmeasured-alone block keeps the numbers block and gains no section', () => {
  withRosterDocument(() => {
    // The capture has no unmeasured-alone case; the analyzer's third unmeasured
    // state (ic.py) is served the same way, as `block.state`.
    const unmeasuredAlone = { ...icExplained, block: { ...icExplained.block, state: 'unmeasured-alone' } };
    for (const [name, evidence] of [['all_rejected', icCapture.all_rejected],
      ['below_floor', icCapture.below_floor], ['unmeasured-alone', unmeasuredAlone]]) {
      assert.notEqual(evidence.block.state, 'numeric', `${name} is served unmeasured`);
      const host = renderIcPanel(evidence);
      const text = icPanelText(host);
      assert.equal(host.html.length, 0, `${name} inserts nothing beneath the numbers block`);
      assert.equal(host.children.length, 1, `${name} appends nothing beneath the numbers block`);
      assert.doesNotMatch(text,
        /Why this move|What the counted runs measured|The case against|The case for|After these meals|Lows after|class="slot-stats"/);
    }
  });
});

test('#464 · a payload missing a served fact prints the unavailable line beneath the numbers block', () => {
  withRosterDocument(() => {
    for (const drop of [(p) => { delete p.runs; }, (p) => { delete p.harm_evidence.lows; },
      (p) => { delete p.outcomes.counts; }, (p) => { delete p.block.state; },
      (p) => { p.block.state = 'numerical'; }, (p) => { delete p.harm_evidence.groups.counted_run; },
      (p) => { delete p.block.run_ends.flat; }, (p) => { delete p.block.run_ends.unread; },
      (p) => { delete p.outcomes.window_min; },
      (p) => { delete p.block.direction; }, (p) => { p.block.direction = 'up'; },
      (p) => { delete p.harm_evidence.groups.total; }]) {
      const evidence = structuredClone(icExplained);
      drop(evidence);
      const host = renderIcPanel(evidence);
      assert.equal(host.children[0].innerHTML, IC_NUMBERS_BLOCK);
      assert.deepEqual(host.html, ['<div class="empty">Run evidence unavailable.</div>'],
        `no half-written panel precedes the unavailable line: ${drop}`);
      assert.equal(host.children.length, 1);
    }
  });
});

test('#464 · the lows count prints the served total, not the row count', () => {
  withRosterDocument(() => {
    const evidence = structuredClone(icExplained);
    evidence.harm_evidence.groups.total = 5;
    const text = icPanelText(renderIcPanel(evidence));
    assert.ok(text.includes('<div class="slot-stats">5 lows, 3 h 30 min to 3 h 30 min after the bolus;'));
  });
});

test('#464 · the case against prints the served window, and a looser ratio only on a served raise', () => {
  withRosterDocument(() => {
    assert.equal(icExplained.block.direction, 'raise', 'premise: the explained block asserts a raise');
    const caseAgainst = (text) => text.split('\n')
      .find((line) => line.includes('meals on counted runs peaked above'));
    const widened = structuredClone(icExplained);
    widened.outcomes.window_min = 240;
    assert.equal(caseAgainst(icPanelText(renderIcPanel(widened))),
      '<div class="inner"><div class="slot-stats">8 of the 26 morning meals on counted runs peaked above 180 '
      + 'before their next bolus (13 counting later meals within 4 h of the bolus); a looser ratio can '
      + 'raise peaks.</div></div>');

    /* A held block serves no move, even where its runs measured looser. */
    const unmoved = structuredClone(icExplained);
    unmoved.block.direction = null;
    assert.equal(unmoved.block.side.direction, 'above', 'premise: the runs still measured looser');
    const unmovedText = icPanelText(renderIcPanel(unmoved));
    assert.doesNotMatch(unmovedText, /a looser ratio can raise peaks/);
    assert.ok(unmovedText.includes('<div class="lvl-cap">What the counted runs measured</div>\n'
      + '<div class="inner"><div class="slot-stats">18 of 24 counted runs measured looser than'),
      'the served side prints under a caption that argues no move');

    const held = icCapture.cross_midnight;
    assert.equal(held.block.direction, null, 'premise: the overnight block asserts no move');
    assert.equal(caseAgainst(icPanelText(renderIcPanel(held, {}, icHeldCell))),
      '<div class="inner"><div class="slot-stats">0 of the 18 overnight meals on counted runs peaked above 180 '
      + 'before their next bolus (0 counting later meals within 5 h 15 min of the bolus).</div></div>');
  });
});

test('#464 · a held block\'s panel prints no recommendation step', () => {
  withRosterDocument(() => {
    const held = icCapture.cross_midnight;
    assert.equal(held.block.asserts_move, false, 'premise: the overnight block is held');
    assert.equal(held.block.state, 'numeric', 'premise: and measured');
    const text = icPanelText(renderIcPanel(held, {}, icHeldCell));
    assert.ok(text.includes('<div class="lvl-cap">What the counted runs measured</div>'));
    assert.ok(text.includes('<div class="slot-stats">Of the 9 counted runs, 0 ended lower than they started, '
      + '9 about flat and 0 higher, where they ended; for 0 of them that end came after a later meal past 07:00.</div>'));
    assert.doesNotMatch(text, /Recommended|half the gap/);
  });
});

test('#464 · the panel\'s captions follow the served move', () => {
  withRosterDocument(() => {
    const captions = (text) => [...text.matchAll(/<div class="lvl-cap">([^<]*)<\/div>/g)]
      .map((match) => match[1]);
    assert.equal(icExplained.block.direction, 'raise', 'premise: the explained block asserts a raise');
    assert.deepEqual(captions(icPanelText(renderIcPanel(icExplained))),
      ['Why this move', 'The case against', 'Lows after morning boluses']);

    const held = icCapture.cross_midnight;
    assert.equal(held.block.direction, null, 'premise: the overnight block asserts no move');
    assert.deepEqual(captions(icPanelText(renderIcPanel(held, {}, icHeldCell))).slice(0, 2),
      ['What the counted runs measured', 'After these meals']);

    // A modified copy of the explained block: `block.direction` set to 'lower'.
    const lowered = structuredClone(icExplained);
    lowered.block.direction = 'lower';
    const text = icPanelText(renderIcPanel(lowered));
    assert.deepEqual(captions(text), ['Why this move', 'The case for', 'Lows after morning boluses']);
    assert.doesNotMatch(text, /a looser ratio can raise peaks/, 'the meals line adds that clause only on a raise');
  });
});

test('#464 · the run-ends line names the served unread count only when there is one', () => {
  withRosterDocument(() => {
    const endsLine = (text) => text.split('\n').find((line) => line.includes('counted runs, '))
      ?.match(/<div class="slot-stats">(Of the [^<]*)<\/div>/)[1];
    assert.equal(icExplained.block.run_ends.unread, 0, 'premise: every explained run was read');
    assert.equal(endsLine(icPanelText(renderIcPanel(icExplained))),
      'Of the 24 counted runs, 8 ended lower than they started, 16 about flat and 0 higher, where they '
      + 'ended; for 10 of them that end came after a later meal past 12:00.');

    // A modified copy of the explained block: `block.run_ends.unread` set to 3.
    const unread = structuredClone(icExplained);
    unread.block.run_ends.unread = 3;
    assert.equal(endsLine(icPanelText(renderIcPanel(unread))),
      'Of the 24 counted runs, 8 ended lower than they started, 16 about flat and 0 higher, where they '
      + 'ended; for 10 of them that end came after a later meal past 12:00; 3 had no reading where they ended.');
  });
});

test('#464 · the lows rows equal the served lows in three groups with the served run ratio joined', () => {
  withRosterDocument(() => {
    // The two added lows are invented, dated before the scan's span.
    const evidence = structuredClone(icExplained);
    evidence.runs.push({ ...evidence.runs[0], run_id: '2024-01-13T09:00:00', true_ic: 6.0,
      pool_reason: 'earlier-ratio-or-uncurrent-chain' });
    evidence.harm_evidence.lows.push(
      { t: '2024-01-13T12:05:00', bg: 64.4, dominant_bolus_t: '2024-01-13T09:00:00',
        minutes_after_bolus: 185, group: 'uncounted-run', run_id: '2024-01-13T09:00:00', bolus_carbs: 60 },
      { t: '2024-01-20T16:08:00', bg: 61, dominant_bolus_t: '2024-01-20T15:00:00',
        minutes_after_bolus: 68, group: 'not-a-meal-run', run_id: null, bolus_carbs: 10 },
    );
    Object.assign(evidence.harm_evidence.groups, { uncounted_run: 1, not_a_meal_run: 1 });
    const host = renderIcPanel(evidence);
    const text = icPanelText(host);
    const rows = host.children.filter((child) => child.className === 'ev-row case-occurrence');
    assert.deepEqual(rows.map((row) => row.dataset.occurrenceId),
      evidence.harm_evidence.lows.map((low) => low.t));
    for (const subhead of ['<b>On counted runs</b><span class="n"> · 2</span>',
      '<b>On runs not counted</b><span class="n"> · 1</span>',
      '<b>After a bolus that is not one of these meals</b><span class="n"> · 1</span>']) {
      assert.ok(text.includes(subhead), `missing subhead: ${subhead}`);
    }
    const rowText = rows.map((row) => row.innerHTML.replace(/<[^>]+>/g, ''));
    const dateOf = (line) => line.slice(0, line.indexOf(' · '));
    assert.deepEqual(rowText.map(dateOf),
      ['Feb 7', 'Feb 8', 'Jan 13', 'Jan 20']);
    assert.deepEqual(rowText.map((line) => line.slice(dateOf(line).length)), [
      ' · bolus 09:00 → low 12:30 · 68 mg/dL · 3 h 30 min later · run 5.75 g/U',
      ' · bolus 09:00 → low 12:30 · 68 mg/dL · 3 h 30 min later · run 5.75 g/U',
      ' · bolus 09:00 → low 12:05 · 64 mg/dL · 3 h 5 min later · run 6.00 g/U',
      ' · bolus 15:00 → low 16:08 · 61 mg/dL · 1 h 8 min later',
    ]);
  });
});

test('#464 · a lows row opens Day at the low\'s own instant and previews its run on the tile', () => {
  withRosterDocument(() => {
    const opened = [];
    const previewed = [];
    const [first, second] = icExplained.harm_evidence.lows;
    const host = renderIcPanel(icExplained, {
      selectedRunId: second.run_id,
      onDay: (occurrence) => opened.push(occurrence),
      onPreviewRun: (runId) => previewed.push(runId),
    });
    const rows = host.children.filter((child) => child.className === 'ev-row case-occurrence');
    assert.deepEqual(rows.map((row) => row.getAttribute('aria-pressed')), ['false', 'true'],
      'the tile\'s selected run presses the row on it');
    rows[0].click();
    const day = evidenceDayContext({ occurrence: opened[0],
      current: { subject: frameSubject({ k: 'block', cell: icBlockCell, rowId: null }) } });
    assert.equal(day.moment, first.t);
    assert.equal(day.date, first.t.slice(0, 10));
    assert.equal(day.subject, 'ic:0');
    rows[0].listeners.get('mouseenter')();
    rows[1].listeners.get('focus')();
    assert.deepEqual(previewed, [first.run_id, second.run_id]);
    assert.notEqual(first.run_id, second.run_id, 'the two served lows sit on two runs');
  });
});

test('#464 · the breadcrumb keeps the shipped support count, payload or not', () => {
  assert.equal(icBlockCrumbMeta(icBlockCell, icExplained), '18 meal runs · 30 meals',
    'the crumb agrees with the numbers block beneath it once the evidence lands');
  assert.equal(icBlockCrumbMeta(icBlockCell, { pending: true }), '18 meal runs · 30 meals');
});

test('#464 · the block panel states loading and unavailable evidence', () => {
  withRosterDocument(() => {
    assert.match(renderIcPanel({ pending: true }).html.join('\n'), /aria-busy="true">Loading run evidence…/);
    assert.match(renderIcPanel({ failed: true }).html.join('\n'), /Run evidence unavailable\./);
    assert.match(renderIcPanel(undefined).html.join('\n'), /Run evidence unavailable\./);
  });
});

/* The case head's "View segment" opens a block with no row id at all, so the
   published subject must come off the frame's block rather than off `rowId`. */
test('#464 · a block frame publishes its subject from the block it holds, never from rowId', () => {
  assert.equal(frameSubject({ k: 'block', cell: { id: 660 }, rowId: null }), 'ic:660',
    'the View segment path opens a block with no row id, and Day must still resolve a subject');
  assert.equal(frameSubject({ k: 'block', cell: { id: 660 }, rowId: 'ic:660' }), 'ic:660',
    'the findings-queue path already carries the matching row id, and the two paths must agree');
  assert.equal(frameSubject({ k: 'slot', cell: { startMin: 90 }, rowId: null }), 'basal:90');
  assert.equal(frameSubject({ k: 'factor', rowId: 'finding:1' }), 'finding:1');
});

test('#464 · the glossary names Meal run, Support, Directional-only and Chain-end read', () => {
  const icTerms = glossaryGroups.find((group) => group.title === 'I:C').terms.map((term) => term.term);
  for (const term of ['Meal run', 'Support', 'Directional-only', 'Chain-end read']) {
    assert.ok(icTerms.includes(term), `glossary names ${term}`);
  }
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
   heading does, with its served count, and names the Occurrences outside the
   comparison only when that served count is non-zero. #468 — each cohort is
   followed once by the band's own words for the band states it serves, comma-joined
   in one pair of parentheses, with no count. It computes no count and derives no
   link; only the band counts "not comparable". */
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

test('#424, #468 · a same-population caption names each cohort as its heading does, with the band states it holds', () => {
  const captures = JSON.parse(readFileSync(new URL(
    '../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8'));
  const caseFile = captures.cases['finding:carb_undercount'].event;
  const { cohorts, counts } = caseFile.projection;
  const { caption, headings } = renderedCaption(caseFile);

  assert.deepEqual(cohorts.map((cohort) => cohort.band_states),
    [['fired'], ['near_miss'], ['clean', 'outranked', 'no_data']], 'premise: the served band states');
  assert.equal(caption,
    '6 Matched (meets criteria) · 1 Nearly matched (borderline) · 3 Other meal opportunities'
    + ' (does not meet, claimed by another finding, not comparable)');
  for (const cohort of cohorts) {
    assert.ok(headings.some((html) => html.includes(`<b>${cohort.name}</b>`)
      && html.includes(`· ${counts[cohort.key]} occurrence`)), `${cohort.name} heading matches`);
  }
  assert.equal(cohorts.reduce((sum, cohort) => sum + counts[cohort.key], 0),
    caseFile.summary.denominator);
  assert.doesNotMatch(caption, /\d+ not comparable|outside the comparison/);
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
