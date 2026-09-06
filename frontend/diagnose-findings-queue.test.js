/* The findings queue's copy and row grammar (lock terms 34–45), against the real
 * projection's own frozen output — never a hand-written row.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EMPTY_LINE, EMPTY_SIFT_LINE, HELD_PREFIX, TAIL_NOTE, eventChartCoordinate,
  MIN_ROW_MINI_WIDTH, TIER,
  renderFindingsQueue,
  queueMeta, queueRows,
} from './diagnose-findings-queue.js';

const fixture = JSON.parse(readFileSync(
  fileURLToPath(new URL('./__fixtures__/findings-projection.json', import.meta.url)), 'utf8'));
const W = fixture.windows;

/* The render tests paint against a stub DOM. It records the tag each node was
   created as and the attributes it was set, because what a row is EXPOSED as is
   the thing this module has to get right (#363) — a stub that discards both
   cannot see a role at all. */
class Node {
  constructor(tag = '') {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.attributes = {};
  }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener() {}
}

/* Paint one projection through the module's own entry point and hand back the
   host beside what the render returned. */
const paint = (projection, view = null) => {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new Node(tag) };
  try {
    const host = new Node();
    return { host, ...renderFindingsQueue(host, projection, () => {}, view) };
  } finally {
    globalThis.document = previous;
  }
};

test('the root filter has no retired Event charts view or state', () => {
  const queue = readFileSync(fileURLToPath(
    new URL('./diagnose-findings-queue.js', import.meta.url)), 'utf8');
  const workstation = readFileSync(fileURLToPath(
    new URL('./diagnose-workstation.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(queue, /eventChartsOnly/);
  assert.doesNotMatch(workstation, /eventChartsOnly|Event charts/);
});

test('term 45 · the meta has three forms and no others', () => {
  // Meta counts only the rows a reader can currently see.
  assert.equal(queueMeta(W.global), '7 findings · 30 days');
  assert.equal(queueMeta(W.afternoon), '3 in this window');
  assert.equal(queueMeta(fixture.no_data.global), '30 days');
  // never sort language, never the window range restated — the chip owns the hours
  for (const projection of [W.global, W.afternoon, W.overnight, fixture.no_data.morning]) {
    const meta = queueMeta(projection);
    assert.doesNotMatch(meta, /ranked|sort|bar:/i, `${meta} carries sort language`);
    assert.doesNotMatch(meta, /\d\d:\d\d/, `${meta} restates the window range`);
  }
});

test('Watching rows collapse by default, without changing actionable rows', () => {
  for (const name of ['global', 'morning', 'overnight', 'quiet', 'afternoon', 'low_block', 'rebound']) {
    const rows = queueRows(W[name]);
    const watching = rows.filter((row) => ['held', 'blind', 'history'].includes(row.register));
    assert.ok(watching.length > 0, `${name} has Watching rows`);
    assert.ok(watching.every((row) => row.collapsed), `${name} collapses every Watching row`);
    assert.ok(rows.filter((row) => ['assert', 'finding'].includes(row.register))
      .every((row) => !row.collapsed), `${name} keeps actionable rows visible`);
  }
  const quiet = queueRows(W.quiet);
  assert.ok(quiet.every((row) => row.collapsed), 'quiet is all Watching');
  assert.equal(quiet.filter((row) => !row.hidden && !row.collapsed).length, 0,
    'quiet has no shown row and takes the empty-copy state');
});

test('Watching rows stay in their disclosure while Sift is active', () => {
  const selected = new Set(['highs']);
  const rows = queueRows(W.global, selected);
  assert.ok(rows.filter((row) => row.register === 'history').every((row) => row.collapsed));
});

test('all-Watching queue keeps its empty line compact above the disclosure', () => {
  const { host } = paint(W.quiet);
  assert.equal(host.children[0].textContent, EMPTY_LINE);
  assert.equal(host.children[0].className, 'quiet-line sift-empty',
    'the empty line is compact when the Watching disclosure follows');
  assert.equal(host.children[1].className, 'q');
  assert.equal(host.children[1].children[0].className, 'qcollapse');
  assert.match(host.children[1].children[0].textContent, /^Watching · \d+ reads?$/);
});

test('term 45 · singular counts read "1 finding"/"1 day", never "1 findings"/"1 days"', () => {
  const oneFinding = { rows: [{ register: 'finding' }], window: { scoped: false },
    findings_window: { days: 30 } };
  assert.equal(queueMeta(oneFinding), '1 finding · 30 days');
  const oneDay = { rows: [{ register: 'finding' }], window: { scoped: false },
    findings_window: { days: 1 } };
  assert.equal(queueMeta(oneDay), '1 finding · 1 day');
  const emptyOneDay = { rows: [], window: { scoped: false }, findings_window: { days: 1 } };
  assert.equal(queueMeta(emptyOneDay), '1 day');
});

test('term 41 · a scoped EMPTY window says only how much history it looked at', () => {
  // term 41 governs an empty WINDOW, so the empty form beats the scoped one:
  // ranking language needs something ranked, and "0 in this window" counts a thing
  // that is not there
  assert.equal(fixture.no_data.morning.window.scoped, true);
  assert.equal(queueMeta(fixture.no_data.morning), '30 days');
  assert.equal(EMPTY_LINE, 'No pattern or setting asserts a direction in this window.');
});

test('term 34 · settings and habits interleave in one list, ordered by the server', () => {
  const rows = queueRows(W.global);
  assert.deepEqual(rows.map((r) => r.flavor),
    ['setting', 'setting', 'setting', 'habit', 'habit', 'habit', 'habit', 'watching']);
  // the order is the projection's, untouched
  assert.deepEqual(rows.map((r) => r.title), W.global.rows.map((r) => r.title));
});

test('#302 · weights and captions walk the served rows without assigning a priority', () => {
  const rows = queueRows(W.global);
  assert.equal(TIER.next_in_line, 'Next in line');
  assert.equal(TIER.worth_a_look, 'Worth a look');
  assert.equal(MIN_ROW_MINI_WIDTH, 120);
  assert.deepEqual(rows.filter((row) => !row.hidden && !row.collapsed)
    .map(({ id, weight, caption }) => ({ id, weight, caption })), [
      { id: 'ic:720', weight: 'priced', caption: null },
      { id: 'basal:30-90', weight: 'priced', caption: null },
      { id: 'basal:330-360', weight: 'priced', caption: null },
      { id: 'finding:over_treated_low', weight: 'priced', caption: 'Worth a look' },
      { id: 'finding:carb_undercount', weight: 'priced', caption: null },
    { id: 'finding:correction_on_iob', weight: 'tail', caption: null },
    { id: 'finding:correction_stacking', weight: 'tail', caption: null },
  ]);
  assert.ok(rows.filter((row) => row.weight === 'tail').every((row) => row.caption === null));
  assert.deepEqual(queueRows(W.quiet).map((row) => row.weight), ['collapsed', 'collapsed']);
  const meals = queueRows(W.global, new Set(['meals'])).filter((row) => !row.hidden && !row.collapsed);
  assert.deepEqual(meals.map(({ id, weight, caption }) => ({ id, weight, caption })), [
    { id: 'finding:carb_undercount', weight: 'priced', caption: null },
  ]);
  const morning = queueRows(W.morning).filter((row) => !row.hidden && !row.collapsed);
  assert.deepEqual(morning.map((row) => row.weight), ['priced']);
});

test('#341 · every priced row, including rank one, receives the common mini mount slot', () => {
  const result = paint(W.global);
  assert.equal(result.rows.length, W.global.rows.length);
  assert.deepEqual(result.miniSlots.map(({ row }) => row.id), [
    'ic:720', 'basal:30-90', 'basal:330-360', 'finding:over_treated_low', 'finding:carb_undercount',
  ]);
  assert.ok(result.miniSlots.every(({ host }) => host.className === 'mini'));
});

test('#341 · rank one keeps its served tier word within the common priced-row structure', () => {
  const { host } = paint(W.global);
  const painted = host.children.find((child) => child.className === 'q').children
    .filter((child) => child.className.startsWith('qitem'))
    .map((item) => item.children[0]);
  const [hero] = painted;
  assert.equal(hero.className, 'qrow priced');
  // the eyebrow is READ where it is seen: numeral, tier word, then the title
  assert.deepEqual(hero.children.map((child) => child.className),
    ['n', 'tier', 'lab', 'tag setting', 'go', 'sum', 'den nums', 'mini']);
  assert.equal(hero.children[1].textContent, TIER.next_in_line);
  // no other weight prints one — a compact row's tier is the caption above it
  assert.ok(painted.slice(1).every((row) =>
    !row.children.some((child) => child.className === 'tier')));
});

test('#363 · every drilling row is painted as a button, inside its own list item', () => {
  const { host } = paint(W.global);
  const list = host.children.find((child) => child.className === 'q');
  assert.equal(list.attributes.role, 'list');
  /* ARIA roles are not additive. A `listitem` on the row REPLACES its implicit
     `button` role, so the screen's primary drill stops being exposed as a
     control at all — the list position is carried by the enclosing item
     instead, which is what keeps the rank numeral's aria-hidden honest. */
  assert.deepEqual(list.children.filter((child) => child.className.startsWith('qrow'))
    .map((child) => [child.className, child.attributes.role]), [],
    'no row sits in the list itself, carrying a role of its own');
  const items = list.children.filter((child) => child.className.startsWith('qitem'));
  assert.deepEqual(items.map((item) => item.className),
    ['qitem', 'qitem', 'qitem', 'qitem', 'qitem', 'qitem tail', 'qitem tail'],
    'each shown row is enclosed, and a tail item is marked for the tail spacing');
  for (const item of items) {
    assert.equal(item.attributes.role, 'listitem');
    assert.equal(item.children.length, 1);
    const [row] = item.children;
    const title = row.children.find((child) => child.className === 'lab')?.textContent;
    assert.equal(row.tag, 'button', `${title} is a real control`);
    assert.equal(row.attributes.role, undefined,
      `${title} keeps its implicit button role`);
    assert.equal(row.children.find((child) => child.className === 'n')?.attributes['aria-hidden'],
      'true', `${title} still hides the rank numeral the item's position announces`);
  }
  // the disclosure is a control of the queue itself, not a finding, so it is bare
  assert.equal(list.children.at(-1).className, 'qcollapse');
});

test('term 36 · a row is flavored by the server register, glyph and word together', () => {
  for (const row of queueRows(W.afternoon)) {
    assert.equal(row.flavor, row.raw.kind === 'setting' ? 'setting' : 'habit');
  }
});

test('term 35 · a finding keeps EVERY family appearance, never a merged total', () => {
  const carbUndercount = queueRows(W.global).find((r) => r.title === 'Carb undercount');
  assert.deepEqual(carbUndercount.detail,
    { kind: 'appearances', parts: [{ count: '2 of 4', noun: 'highs' }, { count: '1 of 3', noun: 'meals' }] });
});

test('term 42 · the seam opens once, before the first UNPRICED ranked row', () => {
  const rows = queueRows(W.global);
  const seams = rows.filter((r) => r.seam);
  assert.equal(seams.length, 1);
  assert.equal(seams[0].title, 'Correction on active insulin');
  assert.equal(seams[0].raw.priority, null);
  // every row above it is priced; the seam is the boundary, not a heading
  const at = rows.indexOf(seams[0]);
  assert.ok(rows.slice(0, at).every((r) => r.raw.priority != null));
  assert.equal(TAIL_NOTE, 'Not recurring often enough to rank yet.');
});

test('term 42 · fixture windows never caption a held or blind row as the tail', () => {
  // These are the fixture's server-owned queue positions. A held/blind row is
  // demoted, but it is not the unpriced ranked row the tail sentence describes.
  const expected = {
    global: ['Correction on active insulin'],
    afternoon: ['Correction stacking'],
    low_block: [],
    morning: [],
    overnight: ['Correction on active insulin'],
    quiet: [],
    rebound: ['Correction stacking'],
  };
  for (const [window, titles] of Object.entries(expected)) {
    assert.deepEqual(queueRows(W[window]).filter((row) => row.seam).map((row) => row.title),
      titles, window);
  }
});

test('term 42 · held and blind rows never open the seam — they are their own register', () => {
  const rows = queueRows(W.afternoon);
  const demoted = rows.filter((r) => r.register === 'held' || r.register === 'blind');
  assert.ok(demoted.length >= 2);
  assert.ok(demoted.every((r) => !r.seam));
  // the server's unpriced-tail tier also covers the held and blind tail rows
  assert.ok(demoted.every((r) => r.tier === 'noted'));
});

test('the queue consumes the server tier and never reclassifies a row', () => {
  const projection = {
    ...W.global,
    rows: W.global.rows.map((row) => ({
      ...row,
      // Deliberately contradict the fields the former browser derivation read.
      register: row.register === 'assert' ? 'blind' : 'assert',
      priority: row.priority == null ? 99 : null,
    })),
  };
  const rows = queueRows(projection);
  assert.deepEqual(rows.map((row) => row.tier), W.global.rows.map((row) => row.tier));
});

test('term 14/38 · a held row is words-first and offers no stage affordance', () => {
  const isf = queueRows(W.low_block).find((r) => r.title === 'ISF');
  assert.equal(isf.register, 'held');
  assert.equal(isf.stageable, false);
  assert.deepEqual(isf.detail, {
    kind: 'reason',
    text: 'no direction asserted — fasting data agrees with the set factor',
  });
  assert.equal(HELD_PREFIX, 'no direction asserted — ');
});

test('term 14 · a blind span carries the analyzer\u2019s own reason, verbatim', () => {
  const blind = queueRows(W.afternoon).find((r) => r.register === 'blind');
  assert.equal(blind.title, 'Basal 19:30 to 21:00');
  assert.equal(blind.detail.text, `${HELD_PREFIX}no data`);
  assert.equal(blind.stageable, false);
});

test('term 38 · every asserting setting row stages', () => {
  const settings = queueRows(W.global).filter((r) => r.register === 'assert');
  assert.ok(settings.length > 0);
  assert.ok(settings.every((r) => r.register === 'assert' && r.stageable));
});

test('S41/S43 · history stays in server order as Watching with past evidence only', () => {
  const rows = queueRows(W.global);
  const history = rows.find((row) => row.register === 'history');
  assert.equal(rows.at(-1), history, 'server placed history last and the browser preserved it');
  assert.equal(history.flavor, 'watching');
  assert.equal(history.stageable, false);
  assert.deepEqual(history.detail, {
    kind: 'history', past: 'past 6.0 g/U', support: '3 meal runs',
  });
  assert.doesNotMatch(JSON.stringify(history.detail), /programmed|now|5\.0/);
});

test('S42 · a sift collapses held, blind, and history into Watching', () => {
  const rows = queueRows(W.morning, new Set(['highs']));
  const watching = rows.filter((row) => row.collapsed);
  assert.deepEqual(watching.map((row) => row.register), ['held', 'held', 'history']);
  assert.ok(watching.every((row) => !row.hidden));
});

test('ISF actionability requires the exact carried backend verdict', () => {
  const base = {
    ...W.low_block.rows.find((row) => row.parameter === 'isf'),
    register: 'assert', direction: 'strengthen', priority: 73, tier: 'next_in_line',
    recommended: 30.2,
  };
  for (const [label, verdict] of [
    ['false', false], ['null', null], ['missing', undefined],
    ['truthy string', 'true'], ['truthy number', 1], ['object', {}],
  ]) {
    const raw = { ...base };
    if (label !== 'missing') raw.asserts_move = verdict;
    else delete raw.asserts_move;
    const [row] = queueRows({ ...W.low_block, rows: [raw] });
    assert.equal(row.register, 'assert', `${label}: direction-derived register survives`);
    assert.equal(row.tier, 'next_in_line', `${label}: server tier survives`);
    assert.equal(row.stageable, false, `${label}: verdict is held closed`);
    assert.deepEqual(row.detail, {
      kind: 'support', parts: [{ count: '5', noun: 'fasting nights' }, '30 d run'],
    }, `${label}: stale numeric action line is suppressed at the queue root`);
  }

  const [actionable] = queueRows({ ...W.low_block, rows: [{ ...base, asserts_move: true }] });
  assert.equal(actionable.register, 'assert');
  assert.equal(actionable.stageable, true);
  assert.equal(actionable.detail.kind, 'nums');
  assert.match(`${actionable.detail.now}${actionable.detail.then}`, /36\.0.*30\.2/,
    'the exact-true row retains both action values without locking unit copy here');
});

test('term 16 · a merged span prints its OWN support denominator, never an invented average', () => {
  const merged = queueRows(W.global).find((r) => r.title === 'Basal 00:30 to 01:30 · raise');
  assert.equal(merged.raw.current, null, 'the server left the span\u2019s numbers on its members');
  assert.deepEqual(merged.detail,
    { kind: 'support', parts: [{ count: '19', noun: 'nights of steady data' }, '30 d run'] });
});

test('a single asserting item prints the number pair the mock shows', () => {
  const slot = queueRows(W.global).find((r) => r.title === 'Basal 05:30 · raise');
  assert.deepEqual(slot.detail, { kind: 'nums', now: 'now 0.8 U/hr → ', then: '0.96 U/hr' });
  const ic = queueRows(W.global).find((r) => r.title.startsWith('I:C'));
  assert.deepEqual(ic.detail, { kind: 'nums', now: 'now 5.7 g/U → ', then: '5.0 g/U' });
});

test('an empty window yields no rows at all, so the calm line is what renders', () => {
  assert.deepEqual(queueRows(fixture.no_data.morning), []);
  assert.deepEqual(queueRows(null), []);
});

test('term 42 · with nothing priced there is no boundary, so no seam sentence', () => {
  // the shape the committed demo payload lands in: no tuning_levers, no scenario
  // priorities, so every ranked row is unpriced and the tail has nothing to follow
  const unpriced = {
    window: { scoped: false }, findings_window: { days: 30 },
    rows: fixture.windows.global.rows.map((r) => ({
      ...r, priority: null, tier: 'noted',
    })),
  };
  assert.equal(queueRows(unpriced).filter((r) => r.seam).length, 0);
});

test('chips sift only on published membership and keep withheld reads reachable', () => {
  const selected = new Set(['highs']);
  const rows = queueRows(W.afternoon, selected);
  for (const row of rows.filter((row) => row.raw.chips.length)) {
    assert.equal(row.hidden, !row.raw.chips.includes('highs'), row.title);
    assert.equal(row.collapsed, false, row.title);
  }
  const withheld = rows.filter((row) => row.register === 'held' || row.register === 'blind');
  assert.ok(withheld.length > 0);
  assert.ok(withheld.every((row) => !row.hidden && row.collapsed));
  assert.equal(EMPTY_SIFT_LINE, 'No findings match the current filters.');
});

test('a sift computes its priced seam over only visible rows', () => {
  const rows = queueRows(W.global, new Set(['lows', 'corrections']));
  const hiddenTail = rows.find((row) => row.title === 'Correction stacking');
  assert.equal(hiddenTail.hidden, false);
  // It is the only visible ranked row and is unpriced, so there is no priced
  // row before it. The unselected high rows cannot open a visible seam.
  assert.deepEqual(rows.filter((row) => row.seam), []);
  assert.ok(rows.filter((row) => row.hidden).every((row) => row.raw.priority != null));
});

test('slice 4 · the rank numeral spells visible position among priced ranked rows only', () => {
  const rows = queueRows(W.global);
  const priced = rows.filter((row) => !row.hidden && !row.collapsed
    && ['assert', 'finding'].includes(row.register) && row.raw.priority != null);
  assert.ok(priced.length > 1);
  assert.deepEqual(priced.map((row) => row.rank), priced.map((_, index) => index + 1),
    'numerals are 1..N in the server’s own order — no re-ranking');
  for (const row of rows) {
    if (!priced.includes(row)) assert.equal(row.rank, null, `${row.title} holds no rank`);
  }
  // a sift renumbers exactly as it re-positions: still 1..N over what is visible
  const sifted = queueRows(W.global, new Set(['lows', 'corrections']))
    .filter((row) => row.rank != null);
  assert.deepEqual(sifted.map((row) => row.rank), sifted.map((_, index) => index + 1));
});

test('slice 4 · the evidence summary is the assert row’s own annotation, revealed', () => {
  const rows = queueRows(W.global);
  for (const row of rows) {
    if (row.register === 'assert' && typeof row.raw.annotation === 'string') {
      assert.equal(row.summary, row.raw.annotation, row.title);
    } else {
      assert.equal(row.summary, null, `${row.title} composes no summary`);
    }
  }
});

test('#223 · direction-only Correction factor stays asserted after priced rows without an action', () => {
  const projected = fixture.direction_only_windows.global;
  const rows = queueRows(projected);
  const isf = rows.find((row) => row.raw.parameter === 'isf');
  const lastPriced = rows.findLastIndex((row) => row.raw.priority != null);

  assert.ok(isf, 'the analyzer-produced Correction factor warning remains reachable');
  assert.equal(isf.register, 'assert');
  assert.ok(rows.indexOf(isf) > lastPriced, 'the warning follows every priced row in server order');
  assert.equal(isf.rank, null, 'an unpriced warning receives no numeral');
  assert.equal(isf.stageable, false, 'the analyzer staging verdict exposes no stage affordance');
  assert.equal(isf.detail.kind, 'support', 'the row uses the existing unpriced detail seam');
  assert.equal(isf.summary, isf.raw.annotation, 'the queue transcribes the analyzer explanation');
  assert.match(isf.summary, /fasting data agrees with the set factor/i);
  assert.match(isf.summary, /recurring correction-linked lows call for weaker corrections/i);
  assert.deepEqual(rows.map((row) => row.raw.id), projected.rows.map((row) => row.id),
    'automatic candidates retain backend order');
});

test('a null selection is byte-identical to the unsifted queue', () => {
  assert.deepEqual(queueRows(W.global), queueRows(W.global, null));
});

test('#83 · malformed coordinates never make a row eligible', () => {
  const source = W.global.rows.find((row) => row.event_chart !== null);
  for (const event_chart of [{}, [], { lever: 'late_bolus' },
    { lever: '', window: { start_min: 0, end_min: 1440, scoped: false } },
    { lever: 'late_bolus', window: {} },
    { lever: 'late_bolus', window: { start_min: 0, end_min: 1440, scoped: false }, extra: true }]) {
    const row = { ...source, event_chart };
    assert.equal(eventChartCoordinate(row), null);
  }
});

test('event-chart eligibility accepts a server-owned lever-and-window coordinate', () => {
  const row = { ...W.global.rows.find((item) => item.event_chart !== null),
    event_chart: { lever: 'meal_bolus_short',
      window: { start_min: null, end_min: null, scoped: false } } };
  assert.deepEqual(eventChartCoordinate(row), row.event_chart);
});

test('metadata and empty copy describe Sift, the only root filter', () => {
  assert.equal(queueMeta(W.global, new Set(['meals'])), '1 finding · 30 days');
  assert.equal(queueMeta(W.afternoon, new Set(['meals'])), '30 days');
  assert.equal(EMPTY_SIFT_LINE, 'No findings match the current filters.');
});

test('#63 · the sentence never enters the queue meta, which counts the window', () => {
  // term 45: the meta is the queue's own copy and nothing else goes there. The two
  // answer different questions — one counts rows in the window, the other counts
  // highs across the whole findings window — and merging them would let a scoped
  // reader take the highs number as a statement about the hours they drew.
  for (const name of ['global', 'afternoon', 'quiet']) {
    assert.doesNotMatch(queueMeta(W[name]), /no cause/);
  }
});
