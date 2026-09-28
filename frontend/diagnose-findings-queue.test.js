import { expandSequenceFixture } from './eating-sequence-fixture.js';
/* The findings queue's copy and row grammar (lock terms 34–45), against the real
 * projection's own frozen output — never a hand-written row.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIAGNOSE_EVIDENCE_CHARTS } from './diagnose-evidence-charts.js';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';
import { populateFindingsProjectionInput, populateFindingCasePreparation } from './browser-fixture-population.js';
import { fileURLToPath } from 'node:url';
import {
  EMPTY_LINE, EMPTY_SIFT_LINE, HELD_PREFIX, TAIL_NOTE, eventChartCoordinate,
  MIN_ROW_MINI_WIDTH, TIER,
  renderFindingsQueue,
  caseFileAlignment, queueMeta, queueRows, presentedRows,
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
  addEventListener(name, callback) { (this.listeners ||= {})[name] = callback; }
}

const descendants = (node) => (node.children || []).flatMap((child) => [child, ...descendants(child)]);

/* Paint one projection through the module's own entry point and hand back the
   host beside what the render returned. */
const paint = (projection, view = null, onDrill = () => {}) => {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new Node(tag) };
  try {
    const host = new Node();
    return { host, ...renderFindingsQueue(host, projection, onDrill, view) };
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

test('#413 · no frontend Pattern word list remains (PATTERN_COPY and its readers)', () => {
  // The backend serves the count sentence (#413 ADR); the desk holds no word
  // list of its own keyed by Pattern or lever. Scan every module this change
  // touches — a reappearing PATTERN_COPY, however renamed the import, is the
  // exact regression this ledger closed.
  for (const relative of [
    './diagnose-findings-queue.js', './diagnose-evidence-charts.js',
    './diagnose-workstation-chart.js', './diagnose-eating-sequences.js',
    './diagnose-workstation.js',
  ]) {
    const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
    assert.doesNotMatch(source, /PATTERN_COPY/, `${relative} still reads the retired word table`);
  }
});

test('term 45 · the meta has three forms and no others', () => {
  // Meta counts only the rows a reader can currently see.
  assert.equal(queueMeta(W.global), '8 findings · 30 days');
  assert.equal(queueMeta(W.afternoon), '5 in this window');
  assert.equal(queueMeta(fixture.no_data.global), '5 findings · 30 days');
  // never sort language, never the window range restated — the chip owns the hours
  for (const projection of [W.global, W.afternoon, W.overnight, fixture.no_data.morning]) {
    const meta = queueMeta(projection);
    assert.doesNotMatch(meta, /ranked|sort|bar:/i, `${meta} carries sort language`);
    assert.doesNotMatch(meta, /\d\d:\d\d/, `${meta} restates the window range`);
  }
});

/* PAST-SETTING READS ARE RETIRED FROM THE APP — Connor, 2026-09-08, shown the
   historical carb-ratio row in Explore: "no." and "We dont' need historical
   reads in the app." They were previously demoted into the Watching disclosure.
   The fixture below really does carry a `history` row, so an app that still
   presented one would fail here rather than pass vacuously. */
const WINDOW_NAMES = ['global', 'morning', 'overnight', 'quiet', 'afternoon', 'low_block', 'rebound'];

test('a past-setting read is absent from the queue, not collapsed into Watching', () => {
  const served = WINDOW_NAMES.flatMap((name) => (W[name].rows || []));
  assert.ok(served.some((row) => row.register === 'history'),
    'this fixture must actually serve a history row, or the absence below proves nothing');
  for (const name of WINDOW_NAMES) {
    const rows = queueRows(W[name]);
    assert.deepEqual(rows.filter((row) => row.register === 'history'), [],
      `${name} still presents a past-setting read`);
    assert.deepEqual(rows.filter((row) => row.flavor === 'watching'), [],
      `${name} still flavours a row as a past-setting read`);
    assert.deepEqual(presentedRows(W[name]).filter((row) => row.register === 'history'), [],
      `${name} still presents a past-setting row through the shared presentation`);
  }
  // The one window whose only Watching member WAS the past-setting read now
  // carries no disclosure at all, rather than an empty one.
  assert.deepEqual(queueRows(W.global).filter((row) => row.collapsed), []);
});

test('Watching still holds the held and blind reads it always did', () => {
  for (const name of WINDOW_NAMES) {
    const rows = queueRows(W[name]);
    const watching = rows.filter((row) => ['held', 'blind'].includes(row.register));
    assert.ok(watching.every((row) => row.collapsed), `${name} collapses every Watching row`);
    assert.ok(rows.filter((row) => ['assert', 'finding'].includes(row.register))
      .every((row) => !row.collapsed), `${name} keeps actionable rows visible`);
  }
  assert.ok(queueRows(W.morning).some((row) => row.collapsed),
    'a current-setting held read is still reachable through its disclosure');
  // ADR 467: 03:00–04:00 overlaps the overnight band, so the overnight Pattern is
  // its one shown row and every other read there stays in Watching.
  const quiet = queueRows(W.quiet);
  assert.deepEqual(quiet.filter((row) => !row.hidden && !row.collapsed).map((row) => row.id),
    ['pattern:overnight_lows_no_iob']);
  assert.ok(quiet.filter((row) => row.id !== 'pattern:overnight_lows_no_iob').every((row) => row.collapsed),
    'quiet collapses every read that is not its Pattern');
});

/* The served quiet window without its one Pattern row: the fixture's only stretch of
   Watching reads, so the all-Watching state paints from served rows (ADR 467 put the
   overnight Pattern into 03:00–04:00). */
const WATCHING_ONLY = { ...W.quiet, rows: W.quiet.rows.filter((row) => row.kind !== 'pattern') };

test('Watching rows stay in their disclosure while Sift is active', () => {
  const selected = new Set(['highs']);
  const rows = queueRows(W.morning, selected);
  const watching = rows.filter((row) => ['held', 'blind'].includes(row.register));
  assert.ok(watching.length > 0, 'this window carries a Watching read to keep');
  assert.ok(watching.every((row) => row.collapsed));
});

test('all-Watching queue keeps its empty line compact above the disclosure', () => {
  const quiet = queueRows(WATCHING_ONLY);
  assert.ok(quiet.length > 0 && quiet.every((row) => row.collapsed), 'the window is all Watching');
  const { host } = paint(WATCHING_ONLY);
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

test('#395 · settings, Causes, and Patterns interleave in server order', () => {
  const rows = queueRows(W.global);
  // A claimed cause folds under its parent Pattern (#413), so the top-level
  // order carries no `habit` entries for the two claimed causes here.
  assert.deepEqual(rows.map((r) => r.flavor),
    ['setting', 'pattern', 'pattern', 'setting', 'pattern', 'setting', 'habit', 'pattern']);
  // the order is the projection's, untouched
  const topLevel = presentedRows(W.global).filter((r) => !r.claimed_by);
  assert.deepEqual(rows.map((r) => r.title), topLevel.map((r) => r.title));
});

test('#302 · weights and captions walk the served rows without assigning a priority', () => {
  const rows = queueRows(W.global);
  assert.equal(TIER.next_in_line, 'Next in line');
  assert.equal(TIER.worth_a_look, 'Worth a look');
  assert.equal(MIN_ROW_MINI_WIDTH, 120);
  // ADR 469: the tiers are bands of the one ranking, so each tier word prints at
  // most once, in the row (rank one) or as a caption.
  const shownRows = rows.filter((row) => !row.hidden && !row.collapsed);
  const words = [
    ...shownRows.filter((row) => row.rank === 1 && row.weight === 'priced').map((row) => TIER[row.tier]),
    ...shownRows.map((row) => row.caption),
  ].filter(Boolean);
  assert.deepEqual(words, [...new Set(words)], `a tier word repeats: ${JSON.stringify(words)}`);
  assert.deepEqual(shownRows.map(({ id, weight }) => ({ id, weight })), [
    { id: 'ic:720', weight: 'priced' },
    { id: 'pattern:highs_after_meals', weight: 'anchored' },
    { id: 'pattern:lows_after_meals', weight: 'anchored' },
    { id: 'basal:30-90', weight: 'priced' },
    { id: 'pattern:overnight_lows_no_iob', weight: 'anchored' },
    { id: 'basal:330-360', weight: 'priced' },
    { id: 'finding:over_treated_low', weight: 'priced' },
    { id: 'pattern:lows_after_correcting_highs', weight: 'tail' },
  ]);
  assert.ok(rows.filter((row) => row.weight === 'tail').every((row) => row.caption === null));
  // ADR 465: the quiet window also holds the fixture's recurring-lows hold at 03:00.
  assert.deepEqual(queueRows(W.quiet).map((row) => row.weight), ['priced', 'collapsed', 'collapsed']);
  // With their setting sifted out, both meals Patterns rank alone (ADR 469 decision 6).
  const meals = queueRows(W.global, new Set(['meals'])).filter((row) => !row.hidden && !row.collapsed);
  assert.deepEqual(meals.map(({ id, weight, caption }) => ({ id, weight, caption })), [
    { id: 'pattern:highs_after_meals', weight: 'priced', caption: null },
    { id: 'pattern:lows_after_meals', weight: 'priced', caption: null },
  ]);
  const morning = queueRows(W.morning).filter((row) => !row.hidden && !row.collapsed);
  assert.deepEqual(morning.map((row) => row.weight), ['priced', 'anchored']);
});

test('#469 · a Pattern ranked with its setting holds no position of its own', () => {
  const rows = queueRows(W.global).filter((row) => !row.hidden && !row.collapsed);
  const ids = rows.map((row) => row.id);
  for (const id of ['pattern:highs_after_meals', 'pattern:lows_after_meals', 'pattern:overnight_lows_no_iob']) {
    const row = rows.find((entry) => entry.id === id);
    const anchor = row.raw.anchored_by;
    assert.ok(anchor, `${id} is served with an anchor`);
    assert.deepEqual({ rank: row.rank, caption: row.caption, urgent: row.urgent, weight: row.weight },
      { rank: null, caption: null, urgent: false, weight: 'anchored' }, id);
    const between = rows.slice(ids.indexOf(anchor) + 1, ids.indexOf(id));
    assert.ok(between.every((entry) => entry.raw.anchored_by === anchor),
      `${id} follows ${anchor} with only its fellow anchored rows between`);
  }
  assert.deepEqual(['basal:30-90', 'basal:330-360', 'finding:over_treated_low']
    .map((id) => rows.find((row) => row.id === id).rank), [2, 3, 4]);
});

test('#469 · a Pattern whose setting a sift hides ranks alone, with no tier word', () => {
  // ic:720's only chip is highs, so the meals sift is the one that hides it.
  const view = { selected: new Set(['meals']) };
  const shown = queueRows(W.global, view.selected).filter((row) => !row.hidden && !row.collapsed);
  assert.ok(!shown.some((row) => row.id === 'ic:720'), 'premise: the meals sift hides ic:720');
  const highs = shown.find((row) => row.id === 'pattern:highs_after_meals');
  assert.deepEqual({ rank: highs.rank, caption: highs.caption, urgent: highs.urgent },
    { rank: 1, caption: null, urgent: false });
  const { host } = paint(W.global, view);
  const button = descendants(host).find((node) => node.tag === 'button' && node.dataset.id === highs.id);
  assert.ok(!button.children.some((child) => child.className === 'tier'),
    'no tier word is painted in the row');
});

test('#469 · the served rank note prints after the detail line', () => {
  const noteOf = (projection, id) => {
    const { host } = paint(projection);
    const button = descendants(host).find((node) => node.tag === 'button' && node.dataset.id === id);
    return descendants(button).find((node) => node.className === 'scope-note')?.textContent;
  };
  const { host } = paint(W.global);
  const anchored = descendants(host).find((node) => node.children?.some((child) =>
    child.tag === 'button' && child.dataset.id === 'pattern:overnight_lows_no_iob'));
  assert.equal(anchored.className, 'qitem anchored');
  assert.equal(noteOf(W.global, 'pattern:overnight_lows_no_iob'), ' · Ranked with its setting');
  assert.equal(noteOf(W.afternoon, 'finding:over_treated_low'), ' · Ranked on all 30 days');
});

test('#469 · a correction factor that cannot stage gives its own reason, not the tail note', () => {
  const projection = fixture.direction_only_windows.global;
  const rows = queueRows(projection);
  const isf = rows.find((row) => row.id === 'isf');
  assert.equal(isf.seam, false, 'the correction factor opens no tail seam');
  assert.deepEqual(isf.detail,
    { kind: 'reason', text: 'No new number is available, so there is nothing to stage.' });
  assert.deepEqual(rows.filter((row) => row.seam).map((row) => row.id),
    ['pattern:lows_after_correcting_highs']);
  const { host } = paint(projection);
  const button = descendants(host).find((node) => node.tag === 'button' && node.dataset.id === 'isf');
  assert.equal(button.children.find((child) => child.className === 'why')?.textContent,
    'No new number is available, so there is nothing to stage.');
});

test('#413 · the rail shows served urgency: the first priced tier is urgent, later tiers stay quiet', () => {
  const rows = queueRows(W.global);
  // ic:720 is rank one and its tier ("next_in_line") is the first priced tier
  // the reader can see; every OTHER row sharing that tier is urgent too,
  // whether or not it happens to carry the caption.
  assert.deepEqual(rows.filter((row) => row.urgent).map((row) => row.id),
    ['ic:720', 'basal:30-90', 'basal:330-360']);
  assert.ok(rows.filter((row) => !row.urgent).every((row) =>
    row.tier !== 'next_in_line' || row.weight !== 'priced'));
  const shared = { rows: W.global.rows.map((row) => ({ ...row, tier: 'next_in_line' })) };
  const uniform = queueRows(shared);
  const priced = uniform.filter((row) => row.weight === 'priced');
  assert.ok(priced.length > 1);
  assert.ok(priced.every((row) => row.urgent), 'every row shares the one served tier');
});

test('#341 · every priced row, including rank one, receives the common mini mount slot', () => {
  const result = paint(W.global);
  // A claimed cause is no longer a row of its own (#413) — it folds onto its
  // parent Pattern's `members` instead of appearing in the top-level list.
  const topLevel = presentedRows(W.global).filter((row) => !row.claimed_by);
  assert.equal(result.rows.length, topLevel.length);
  assert.deepEqual(result.miniSlots.map(({ row }) => row.id), [
    'ic:720', 'pattern:highs_after_meals',
    'pattern:lows_after_meals', 'basal:30-90', 'pattern:overnight_lows_no_iob',
    'basal:330-360', 'finding:over_treated_low',
  ]);
  assert.ok(result.miniSlots.every(({ host }) => host.className === 'mini'));
  // Cause lines carry no mini of their own — the parent's mini stands for the group.
  const parent = result.rows.find((row) => row.id === 'pattern:highs_after_meals');
  assert.deepEqual(parent.members.map((member) => member.id), ['finding:carb_undercount']);
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
  // Claimed causes fold under their Pattern (#413) — member lines render only
  // once their parent's toggle opens, closed on arrival unless the parent is
  // rank one, so this default paint shows only the top-level rows.
  assert.deepEqual(items.map((item) => item.className),
    ['qitem', 'qitem anchored', 'qitem anchored', 'qitem', 'qitem anchored', 'qitem', 'qitem', 'qitem tail'],
    'each shown row is enclosed, and anchored and tail items are marked for their spacing');
  for (const item of items) {
    assert.equal(item.attributes.role, 'listitem');
    // A Pattern's fold toggle rides inside its own item, after the row (#413).
    assert.deepEqual(item.children.slice(1).map((child) => child.className),
      item.children.length > 1 ? ['qfold'] : []);
    const [row] = item.children;
    const title = row.children.find((child) => child.className === 'lab')?.textContent;
    assert.equal(row.tag, 'button', `${title} is a real control`);
    assert.equal(row.attributes.role, undefined,
      `${title} keeps its implicit button role`);
    assert.equal(row.children.find((child) => child.className === 'n')?.attributes['aria-hidden'],
      'true', `${title} still hides the rank numeral the item's position announces`);
  }
  /* This window's only Watching member was the retired past-setting read, so
     no disclosure renders at all — an empty one would be a control for nothing.
     The disclosure's own shape is covered where it still has members, by
     'all-Watching queue keeps its empty line compact above the disclosure'. */
  assert.equal(list.children.filter((child) => child.className === 'qcollapse').length, 0);
});

test('#413 · a Pattern folds its causes: closed on arrival unless it is rank one, toggled by the reader', () => {
  const { host } = paint(W.global);
  const list = host.children.find((node) => node.className === 'q');
  // The toggle and its causes live inside the Pattern's own list item — never
  // bare in the rail's list, where they would read as sibling rows (#413).
  assert.deepEqual(list.children.filter((node) => ['qfold', 'qcauses', 'qitem member'].includes(node.className)), []);
  const toggles = descendants(list).filter((node) => node.className === 'qfold');
  // Neither Pattern that owns causes here is rank one, so both arrive closed —
  // named by their served cause count, no member line rendered underneath.
  assert.deepEqual(toggles.map((toggle) => toggle.textContent), ['1 cause', '2 causes']);
  assert.ok(toggles.every((toggle) => toggle.attributes['aria-expanded'] === 'false'));
  assert.ok(toggles.every((toggle) => toggle.attributes['aria-controls'] === undefined));
  assert.deepEqual(descendants(list).filter((node) => node.className === 'qitem member'), []);

  let toggled;
  const view = { openMembers: new Map(), onToggleMembers: (id, wasOpen) => { toggled = [id, wasOpen]; } };
  const forced = paint(W.global, view);
  const forcedList = forced.host.children.find((node) => node.className === 'q');
  descendants(forcedList).find((node) => node.className === 'qfold').listeners.click();
  assert.deepEqual(toggled, ['pattern:highs_after_meals', false]);

  // Rank one opens by default — a Pattern with claimed causes at rank one
  // shows its members without any explicit toggle.
  const rankOneOwns = { rows: [
    { ...W.global.rows.find((row) => row.id === 'pattern:highs_after_meals'), priority: 90 },
    W.global.rows.find((row) => row.id === 'finding:carb_undercount'),
  ] };
  const { host: openHost } = paint(rankOneOwns);
  const openList = openHost.children.find((node) => node.className === 'q');
  const [parentItem] = openList.children.filter((node) => node.className === 'qitem');
  const [row, toggle, causes] = parentItem.children;
  assert.equal(row.dataset.id, 'pattern:highs_after_meals');
  assert.equal(toggle.attributes['aria-expanded'], 'true');
  // The open causes are their own nested list, named by the toggle.
  assert.equal(causes.className, 'qcauses');
  assert.equal(causes.attributes.role, 'list');
  assert.equal(toggle.attributes['aria-controls'], causes.id);
  assert.deepEqual(causes.children.map((item) => [item.className, item.attributes.role]),
    [['qitem member', 'listitem']]);
  // One line per cause: its name, its share of the Pattern's count, its drill,
  // and its counts outside that count set apart beneath (#424) — no gutter mark
  // of its own, because the causes list draws the parent's spine.
  const line = causes.children[0].children[0];
  assert.deepEqual(line.children.map((child) => child.className), ['lab', 'go', 'den', 'out']);
});

test('#413 · an unpriced row prints its served count sentence under its title', () => {
  // ADR 467 folds the fixture windows' unpriced Causes under their Pattern, so the
  // premise is read from the desk suite's served 12:00–18:00 window.
  const window = fixture.browser_windows['720-1080'];
  const tail = queueRows(window).find((row) => row.weight === 'tail' && row.detail?.kind === 'sentences');
  assert.ok(tail, 'premise: the fixture serves an unpriced row with a count sentence');
  const { host } = paint(window);
  const button = descendants(host).find((node) => node.tag === 'button' && node.dataset.id === tail.id);
  const den = button.children.find((child) => child.className === 'den');
  assert.ok(den, `${tail.id} must print its served count sentence`);
  assert.deepEqual(den.children.filter((child) => child.className === 'v').map((child) => child.textContent),
    tail.detail.parts.map((part) => part.count));
  assert.ok(!button.children.some((child) => ['mini', 'sum'].includes(child.className)),
    'the tail stays quiet: no mini, no summary');
});

test('term 36 · a row is flavored by the server register, glyph and word together', () => {
  const rows = queueRows(W.afternoon);
  assert.deepEqual(new Set(rows.map((row) => row.flavor)), new Set(['setting', 'pattern', 'habit']),
    'the served scoped fixture exercises every public queue flavor');
  for (const row of rows) assert.equal(row.flavor,
    row.raw.kind === 'pattern' ? 'pattern' : row.raw.kind === 'setting' ? 'setting' : 'habit');
});

test('term 35 · a claimed cause keeps EVERY served fold sentence, never a merged total', () => {
  const parent = queueRows(W.global).find((r) => r.id === 'pattern:highs_after_meals');
  const carbUndercount = parent.members.find((m) => m.title === 'Carb undercount');
  assert.equal(carbUndercount.raw.fold_sentences.length, 2);
  assert.deepEqual(carbUndercount.sentences, carbUndercount.raw.fold_sentences.map((s) => ({
    count: `${s.count} of ${s.denominator}`, noun: s.noun, scope: s.scope,
  })));
});

/* #424 — a folded cause's line reads its served fold sentences, never its own
   count sentences: its share of the Pattern's count first, then every count
   outside that count, set apart on a second row. #468 — that row leads with
   "not in this Pattern's count" only under a Pattern that serves a count; under
   one that serves none there is no count to be outside of, so it prints the
   counts alone. The desk computes no share and decides no scope; the words are
   the painter's only addition. */
const lineText = (node) => (typeof node === 'string' ? node
  : node.className === 'sep' ? ' · '
    : `${node.textContent || ''}${(node.children || []).map(lineText).join('')}`);

const openFold = (parentId) => {
  const parent = W.global.rows.find((row) => row.id === parentId);
  const members = W.global.rows.filter((row) => row.claimed_by === parentId);
  const { host } = paint({ rows: [{ ...parent, priority: 90 }, ...members] });
  return descendants(host).filter((node) => node.className === 'qmember');
};

test('#424, #468 · a folded cause leads with its share of the Pattern and names the count it sets the rest apart from', () => {
  const parent = queueRows(W.global).find((row) => row.id === 'pattern:highs_after_meals');
  const carb = parent.members.find((member) => member.id === 'finding:carb_undercount');
  assert.deepEqual(carb.sentences, [
    { count: '1 of 3', noun: 'meals', scope: 'pattern' },
    { count: '2 of 4', noun: 'highs', scope: 'outside' },
  ]);

  const [line] = openFold('pattern:highs_after_meals');
  const part = (cls) => line.children.find((child) => child.className === cls);
  assert.equal(lineText(part('den')), '1 of 3 meals');
  assert.ok(parent.raw.count_sentences?.length, 'premise: this Pattern serves a count');
  assert.equal(lineText(part('out')), 'not in this Pattern\'s count · 2 of 4 highs');
  assert.doesNotMatch(lineText(line), /ran high|undercounted/, 'the line prints no outcome word');
});

test('#468 · under a Pattern that serves no count, a cause line sets its counts apart with no lead words', () => {
  const parent = queueRows(W.global).find((row) => row.id === 'pattern:lows_after_correcting_highs');
  assert.equal(parent.raw.count_sentences, null, 'premise: this Pattern serves no count');
  assert.deepEqual(parent.members.map((member) => member.id),
    ['finding:correction_on_iob', 'finding:correction_stacking']);
  for (const member of parent.members) {
    assert.deepEqual(member.sentences.map((sentence) => sentence.scope), ['outside'], member.id);
  }

  const lines = openFold('pattern:lows_after_correcting_highs');
  assert.deepEqual(lines.map((line) => lineText(line.children.find((child) => child.className === 'den'))),
    ['', '']);
  assert.deepEqual(lines.map((line) => lineText(line.children.find((child) => child.className === 'out'))), [
    '1 of 5 lows',
    '1 of 1 correction clusters',
  ]);
  for (const line of lines) assert.doesNotMatch(lineText(line), /outside the count|this Pattern's count/);
});

test('term 42 · the seam opens once, before the first UNPRICED ranked row', () => {
  const rows = queueRows(W.global);
  const seams = rows.filter((r) => r.seam);
  assert.equal(seams.length, 1);
  assert.equal(seams[0].title, 'Lows after correcting highs');
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
    global: ['Lows after correcting highs'],
    afternoon: ['Lows after correcting highs'],
    low_block: ['Lows after correcting highs'],
    morning: [],
    overnight: ['Lows after correcting highs'],
    quiet: [],
    rebound: ['Lows after correcting highs'],
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
  const topLevel = presentedRows(projection).filter((row) => !row.claimed_by);
  assert.deepEqual(rows.map((row) => row.tier), topLevel.map((row) => row.tier));
});

test('term 14/38 · a held row is words-first and offers no stage affordance', () => {
  const isf = queueRows(W.low_block).find((r) => r.title === 'Correction factor');
  assert.equal(isf.register, 'held');
  assert.equal(isf.stageable, false);
  assert.deepEqual(isf.detail, {
    kind: 'reason',
    text: 'no direction asserted: fasting data agrees with the set factor',
  });
  assert.equal(HELD_PREFIX, 'no direction asserted: ');
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

/* RETIRED:Connor Griffin:2026-09-08 — "no." / "We dont' need historical reads in
   the app." S41 and S43 asserted the past-setting row's own presentation (its
   Watching flavour, its server position, its past/support detail line). The row
   is no longer presented, so those assertions have no subject; their absence is
   asserted above instead. S42 is RETAINED below with its history clause dropped:
   the held/blind half of that sift is unrelated to the retirement. */
test('S42 · a sift keeps held and blind reads in Watching', () => {
  const rows = queueRows(W.morning, new Set(['highs']));
  const watching = rows.filter((row) => row.collapsed);
  assert.deepEqual(watching.map((row) => row.register), ['held', 'held']);
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

test('an asserting correction-factor row prints its numbers insulin first (#451)', () => {
  const raw = {
    ...W.low_block.rows.find((row) => row.parameter === 'isf'),
    register: 'assert', direction: 'strengthen', priority: 73, tier: 'next_in_line',
    asserts_move: true, current: 30, recommended: 32,
  };
  const [row] = queueRows({ ...W.low_block, rows: [raw] });
  assert.deepEqual(row.detail, { kind: 'nums', now: 'now 1 U : 30.0 mg/dL → ', then: '1 U : 32.0 mg/dL' });
  assert.doesNotMatch(`${row.detail.now}${row.detail.then}`, /mg\/dL\/U/);
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
  const ic = queueRows(W.global).find((r) => r.title.startsWith('Carb ratio'));
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
  const parent = rows.find((row) => row.id === 'pattern:lows_after_correcting_highs');
  assert.equal(parent.hidden, false);
  assert.ok(parent.members.some((member) => member.title === 'Correction stacking'),
    'the claimed cause still folds under its visible parent');
  // It is the only visible ranked row and is unpriced, so there is no priced
  // row before it. The unselected high rows cannot open a visible seam.
  assert.deepEqual(rows.filter((row) => row.seam).map((row) => row.id),
    ['pattern:lows_after_correcting_highs']);
  assert.ok(rows.filter((row) => row.hidden).every((row) => row.raw.priority != null));
});

test('slice 4 · the rank numeral spells visible position among priced ranked rows only', () => {
  const rows = queueRows(W.global);
  // A row anchored beneath its shown setting holds no position of its own (ADR 469).
  const priced = rows.filter((row) => !row.hidden && !row.collapsed && row.weight !== 'anchored'
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
  assert.deepEqual(isf.detail, { kind: 'reason',
    text: 'No new number is available, so there is nothing to stage.' },
  'the row gives its own staging refusal (ADR 469)');
  assert.equal(isf.summary, isf.raw.annotation, 'the queue transcribes the analyzer explanation');
  assert.match(isf.summary, /fasting data agrees with the set factor/i);
  assert.match(isf.summary, /recurring correction-linked lows call for weaker corrections/i);
  assert.deepEqual(rows.map((row) => row.raw.id),
    presentedRows(projected).filter((row) => !row.claimed_by).map((row) => row.id),
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
  assert.equal(queueMeta(W.global, new Set(['meals'])), '2 findings · 30 days');
  assert.equal(queueMeta(W.afternoon, new Set(['meals'])), '2 in this window');
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

// The default replay input differs from the history fixture above. Exercise its
// actual preparation and painter so a claimed Lever cannot disappear in the join.
test('#395/#413 · the default replay keeps its claimed Late bolus reachable, folded, under every matching sift', () => {
  const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
  const payload = read('../mockups/diagnose-workstation.synthetic/payload.json');
  const projection = projectFindings(populateFindingsProjectionInput({ exposures: payload.exposures }));
  assert.ok(!projection.rows.some((row) => row.id === 'finding:carb_undercount'),
    'Carb undercount is not a subject in this input');
  const preparation = populateFindingCasePreparation(
    read('../mockups/diagnose-workstation.synthetic/finding-case-files.json').preparation, projection);
  const input = { ...preparation.findings, rows: preparation.rendered_rows };
  const chips = ['highs', 'lows', 'meals', 'corrections'];
  for (let mask = 1; mask < 16; mask += 1) {
    const selected = new Set(chips.filter((_, index) => mask & (1 << index)));
    if (!selected.has('highs') && !selected.has('meals')) continue;
    const openMembers = new Map([['pattern:highs_after_meals', true]]);
    const { host, rows } = paint(input, { selected, openMembers });
    const parent = rows.find((row) => row.id === 'pattern:highs_after_meals');
    assert.equal(parent.hidden, false);
    const member = parent.members.find((m) => m.id === 'finding:late_bolus');
    assert.ok(member, `Late bolus stays folded under its parent under ${[...selected]}`);
    const list = host.children.find((node) => node.className === 'q');
    const button = descendants(list).find((node) => node.dataset?.id === member.id);
    assert.equal(button?.tag, 'button', `Late bolus remains a control under ${[...selected]}`);
  }
});


test('#395/#413 · a Pattern detail reads the served count sentence and ignores headline wording', () => {
  const base = W.global.rows.find((row) => row.kind === 'pattern');
  for (const [count, denominator, noun, outcome] of [
    [3, 20, 'meals', 'ran high'],
    [7, 20, 'meals', 'ran low'],
    [1, 4, 'lows', 'rebounded high'],
    [2, 9, 'lows', 'followed a correction'],
    [5, 30, 'nights', 'ran low overnight'],
  ]) {
    const row = { ...base, headline: 'A headline with no recurrence to parse',
      count_sentences: [{ sentence: `${count} of ${denominator} ${noun} ${outcome}`,
        count, denominator, noun, outcome }] };
    assert.deepEqual(queueRows({ rows: [row] })[0].detail,
      { kind: 'sentences', parts: [{ count: `${count} of ${denominator}`, noun, outcome }] });
  }
});

test('#395 · counts under review keeps its drill without a rate or chart host', () => {
  const base = W.global.rows.find((row) => row.kind === 'pattern');
  const raw = { ...base, pattern: { ...base.pattern, k: 21, n: 20, count_status: 'under_review' } };
  let drilled;
  const { host, miniSlots } = paint({ rows: [raw] }, null, (row) => { drilled = row; });
  const list = host.children.find((node) => node.className === 'q');
  const button = list.children.find((node) => node.className.startsWith('qitem')).children[0];
  assert.equal(button.children.find((node) => node.className === 'den pattern-status').textContent,
    'counts under review');
  assert.ok(!button.children.some((node) => ['mini', 'sum', 'tag pattern'].includes(node.className)));
  assert.deepEqual(miniSlots, []);
  button.listeners.click();
  assert.equal(drilled, raw);
});

test('#413 · a Pattern with no served count sentence renders like any other row without one', () => {
  const base = W.global.rows.find((row) => row.kind === 'pattern');
  // `admission_route: "none"` — a real, reachable state (findings_projection.py
  // `_pattern_count_sentences`) distinct from the now-unreachable unknown-key
  // case #1.1's backend test forecloses.
  const row = { ...base, count_sentences: null, pattern: { ...base.pattern, count_status: null } };
  assert.equal(queueRows({ rows: [row] })[0].detail, null);
  const { host } = paint({ rows: [row] });
  const button = host.children.find((node) => node.className === 'q').children[0].children[0];
  assert.ok(!button.children.some((node) => node.className.startsWith('den')));
  assert.ok(button.children.some((node) => node.className === 'tag pattern'));
});

test('#413 · an unpriced claimed member folds under the Pattern, printing every served sentence', () => {
  const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
  const payload = read('../mockups/diagnose-workstation.synthetic/payload.json');
  const projection = projectFindings(populateFindingsProjectionInput({ exposures: payload.exposures }));
  const rows = queueRows(projection);
  // Correction stacking is the server's unpriced claimed member (Late bolus carries
  // its server price); it folds under Lows after correcting highs.
  const parent = rows.find((row) => row.id === 'pattern:lows_after_correcting_highs');
  const stacking = parent?.members?.find((member) => member.id === 'finding:correction_stacking');
  assert.ok(stacking, 'Correction stacking folds under Lows after correcting highs');
  assert.equal(stacking.raw.priority, null);
  assert.equal(stacking.raw.fold_sentences.length, 2, 'premise: the folded cause serves both fold sentences');
  assert.deepEqual(stacking.sentences, stacking.raw.fold_sentences.map((s) => ({
    count: `${s.count} of ${s.denominator}`, noun: s.noun, scope: s.scope,
  })), 'every served fold sentence is kept, never merged');
});


test('#413 · a claimed cause keeps every served appearance, not only the one matching its parent', () => {
  const base = W.global.rows.find((row) => row.kind === 'pattern');
  const parent = { ...base, id: 'pattern:lows_after_correcting_highs',
    pattern: { ...base.pattern, key: 'lows_after_correcting_highs' } };
  const member = { id: 'finding:correction_stacking', kind: 'habit', register: 'finding',
    claimed_by: parent.id, fold_sentences: [
      { count: 6, denominator: 20, noun: 'lows', outcome: 'followed stacked corrections',
        sentence: '6 of 20 lows followed stacked corrections', scope: 'pattern' },
      { count: 2, denominator: 12, noun: 'correction clusters', outcome: 'went low',
        sentence: '2 of 12 correction clusters went low', scope: 'outside' },
    ] };
  const [{ members }] = queueRows({ rows: [parent, member] });
  assert.deepEqual(members[0].sentences, [
    { count: '6 of 20', noun: 'lows', scope: 'pattern' },
    { count: '2 of 12', noun: 'correction clusters', scope: 'outside' },
  ]);
});

test('#413 · a claim naming no served row falls back to an ordinary row, never a silent drop', () => {
  // The backend always stamps `claimed_by` and appends its owning Pattern row
  // in the same pass (findings_projection.py `_pattern_rows`), so this crosses
  // no currently reachable payload — but the projection crosses the server
  // boundary and nothing enforces that coupling with a test, so an orphaned
  // claim must still surface the row rather than vanish.
  const orphan = { id: 'finding:orphaned_cause', kind: 'habit', register: 'finding',
    claimed_by: 'pattern:not_served', priority: 40, tier: 'worth_a_look',
    count_sentences: [{ count: 3, denominator: 9, noun: 'highs', outcome: 'ran high',
      sentence: '3 of 9 highs ran high' }] };
  const rows = queueRows({ rows: [orphan] });
  assert.equal(rows.length, 1, 'the orphaned claim must still appear as its own row');
  assert.equal(rows[0].id, 'finding:orphaned_cause');
  assert.equal(rows[0].members, null);
  assert.deepEqual(rows[0].detail, {
    kind: 'sentences', parts: [{ count: '3 of 9', noun: 'highs', outcome: 'ran high' }],
  });
});

test('#395 · the browser input publishes only its renderable mini hosts in served order', () => {
  const cases = JSON.parse(readFileSync(new URL(
    '../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8'));
  // The projection fixture's own inputs carry their own rosters; they need no
  // browser population.
  const prepared = populateFindingCasePreparation(cases.preparation, projectFindings(fixture.inputs));
  const { miniSlots } = paint({ ...prepared.findings, rows: prepared.rendered_rows });
  const chartable = miniSlots.filter(({ row }) => DIAGNOSE_EVIDENCE_CHARTS.some((entry) => entry.matches(row)))
    .map(({ row }) => row.id);
  // Carb undercount is claimed by Highs after meals, so it folds under its
  // parent (#413) and no longer mounts a mini of its own.
  assert.deepEqual(chartable, [
    'ic:720', 'pattern:highs_after_meals',
    'basal:30-90', 'basal:330-360', 'finding:over_treated_low',
  ]);
  const chartless = prepared.rendered_rows.find((row) => row.id === 'pattern:lows_after_correcting_highs');
  assert.ok(chartless, 'the manufactured input retains the uncharted Pattern parent');
  assert.deepEqual(DIAGNOSE_EVIDENCE_CHARTS.filter((entry) => entry.matches(chartless)), [],
    'a Pattern without a served case file does not manufacture a mini host');
});


test('#395 · Pattern and Lever drills request event cases; chartless rows retain clock entry', () => {
  const pattern = W.global.rows.find((row) => row.pattern_chart);
  const lever = W.global.rows.find((row) => row.event_chart);
  assert.ok(pattern && lever, 'generated rows carry both kinds of case coordinate');
  assert.equal(caseFileAlignment(pattern), 'event');
  assert.equal(caseFileAlignment(lever), 'event');
  assert.equal(caseFileAlignment({ ...pattern, pattern_chart: null }), 'clock');
  assert.equal(caseFileAlignment(undefined), 'clock');
});

test('#342/#413 · sequence habits fold under their Pattern with the inherited member grammar', () => {
  const generated = expandSequenceFixture(JSON.parse(readFileSync(new URL(
    '../mockups/eating-sequence-findings.synthetic/payload.json', import.meta.url), 'utf8')));
  for (const name of ['high_carb_sequence_empty', 'repeat_eating_empty', 'both_covered']) {
    const prepared = generated.states[name].windows.global.preparation;
    const projection = { ...prepared.findings, rows: prepared.rendered_rows };
    const painted = queueRows(projection);
    const parent = painted.find((row) => row.id === 'pattern:highs_after_meals');
    const members = parent?.members || [];
    assert.equal(members.length, name === 'both_covered' ? 2 : 1);
    for (const member of members) {
      assert.equal(member.sentences.length, 1);
      assert.equal(member.sentences[0].noun, 'sequences');
      assert.equal(member.sentences[0].count,
        `${member.raw.count_sentences[0].count} of ${member.raw.count_sentences[0].denominator}`);
      assert.equal(caseFileAlignment(member.raw), 'event');
    }
    assert.equal(queueMeta(projection), `${projection.counts.finding} findings · 30 days`);
  }
});
