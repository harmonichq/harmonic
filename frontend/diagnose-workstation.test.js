import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { queryState, renderIsfLevel, renderSlotLevel } from './diagnose-workstation.js';
import { assertMatchingFindingCasePreparation } from './finding-case-file-validation.js';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';
import {
  generatedFindingPose,
  generatedFindingProjection,
} from './diagnose-workstation-behavior.replay.mjs';

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

test('selected detail describes its glucose trace in product language', () => {
  const source = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');
  assert.match(source, /The canvas shows the selected glucose trace and evidence markers\./);
  assert.doesNotMatch(source, /Occurrence's server-owned trace/);
});

test('C44/C56 replay poses enter the existing Findings queue once', () => {
  const source = readFileSync(new URL('./diagnose-workstation-behavior.replay.mjs', import.meta.url), 'utf8');
  for (const story of ['C44', 'C56']) {
    const body = source.match(new RegExp(`export const ${story} = async \\(page\\) => \\{([\\s\\S]*?)\\n\\};`));
    assert.ok(body, `${story} story exists`);
    assert.match(body[1], /await openWholeDay\(page\);\s*await clickQueueRow\(page, 'Missed \/ unannounced meal'\);/,
      `${story} reaches the queue from the 24-hour surface`);
    assert.doesNotMatch(body[1], /getByRole\('button', \{ name: 'Findings'/,
      `${story} does not wait for a retired second Findings control`);
  }
  assert.match(source, /\['C56', C56, 'typical', \{ findingsProjectionInputs: generatedFindingProjection\('finding:missed_meal'\),\s*caseScenario:/,
    'C56 passes its generated queue pose to the app opener, not only to the case handler');
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
  const served = projectFindings({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
    event_charts: projectionFixture.inputs.event_charts,
  });
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

const basalCell = {
  i: 0, startMin: 0, endMin: 30, asserts: false, verdict: 'insufficient',
  slot: {
    current: 0.6, recommended: null, safety_status: 'insufficient evidence',
    annotation: 'not enough nights of steady data yet to point one way',
    estimate: { value: 0.8, lo: 0.7, hi: 0.9, n: 3, wide: false },
  },
};

const nightPayload = {
  roster_glucose_mean: 119.5,
  excluded_night_count: 2,
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
    assert.match(host.html.join('\n'), /2 excluded nights/);
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

test('basal slot evidence states distinguish loading and unavailable data', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    for (const [nightEvidence, message] of [[{ pending: true }, 'Loading nights…'], [{ stale: true }, 'Night evidence unavailable.']]) {
      const host = new RosterElement();
      renderSlotLevel(host, basalCell, new Set(), 30, 8, () => {}, { nightEvidence });
      assert.match(host.html.join('\n'), new RegExp(message));
      assert.equal(host.children.filter((child) => child.className === 'ev-row case-occurrence').length, 0);
    }
  } finally {
    globalThis.document = originalDocument;
  }
});

test('basal night evidence leaves the numbers and staging block byte-identical', () => {
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
      'the existing parameter numbers remain the untouched first panel');
    assert.equal(withRoster.children[0].children.find((child) => child.className === 'slot-foot').innerHTML,
      plain.children[0].children.find((child) => child.className === 'slot-foot').innerHTML,
      'the existing staging block is byte-identical');
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

test('basal night roster preserves null served mean and exit as em dashes', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tagName) => new RosterElement(tagName) };
    const payload = structuredClone(nightPayload);
    payload.roster_glucose_mean = null;
    const host = new RosterElement();
    renderSlotLevel(host, basalCell, new Set(), 30, 8, () => {}, { nightEvidence: payload, shownCount: 5 });
    assert.match(host.html.join('\n'), /— mg\/dL mean/);
    assert.match(host.children.map((child) => child.innerHTML).join('\n'), /<span class="worst">—<\/span>/);
  } finally { globalThis.document = originalDocument; }
});

test('slot-frame requests fence a swapped slot and Day uses the served night timestamp', () => {
  const source = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');
  assert.match(source, /const request = \+\+frame\.nightEvidenceRequest;/);
  assert.match(source, /frame\.nightEvidenceRequest !== request/);
  assert.match(source, /t: night\.t/);
  assert.doesNotMatch(source, /t: night\.glucose_trace\?\.\[0\]\?\.t/);
});
