/* The Diagnose inspector's level 1 — ONE ranked findings queue (lock terms 34–45).
 *
 * Pump settings and behavioural findings interleave in a single list: the one
 * ranking by urgency the backend's unified 0–100 priority orders (ADR 469). There
 * is no settings tier, no patterns tier and no "Factors" heading: the crumb root is
 * `Findings` and position is the whole ranking statement (no bars, no score
 * numerals, no tint). A Pattern ranked with its setting sits beneath that setting
 * and takes no position of its own. "Next in line" and "Worth a look" are bands of
 * the one ranking, so each prints at most once; "Not recurring often enough to
 * rank yet" heads only the rows unranked for want of recurrence.
 *
 * EVERYTHING THIS MODULE RENDERS IS SERVER-OWNED (terms 39/40, ADR 730). The
 * projection arrives already classified, merged, outcome-anchored, counted and
 * ordered by `GET /api/diagnose/findings`; this module composes no membership, no
 * floor, no direction, no rank and no denominator. It decides one thing the wire
 * cannot: which of a row's own fields becomes its single detail line. That is the
 * #273/#465 rule applied to the queue — a frontend predicate of our own is how the
 * thin-slot hold survived four fixes.
 *
 * Split so the policy-free half is testable without a DOM: `queueMeta` and
 * `queueRows` are pure functions over a projection and are node-tested against the
 * committed `frontend/__fixtures__/findings-projection.json`, which is the real
 * projection's own frozen output.
 */
import { settingValue } from './plan.js';
import { isfStageNote } from './diagnose-workstation-data.js';

/** Term 41 — the empty findings window is a result, not a void. */
export const EMPTY_LINE = 'No pattern or setting asserts a direction in this window.';
/** A sift can exclude assertions without making the window itself empty. */
export const EMPTY_SIFT_LINE = 'No findings match the current filters.';
/** Term 42 — the sentence that lives inside the doubled gap, naming the tail. */
export const TAIL_NOTE = 'Not recurring often enough to rank yet.';
/** Term 14 — a held row's reason line; the suffix is the backend's own words.
    A colon joins the label to that clause (ADR 451: no prose em dash). */
export const HELD_PREFIX = 'no direction asserted: ';

/* Term 36 — glyph + word, at caps-label rank. The GLYPH differentiates; the hue
   only has to stay out of the way (it is `--secondary`, never a clinical token and
   never a hue a chart mark spends). */
export const FLAVOR = {
  setting: { word: 'Setting', glyph: '⚙' },
  habit: { word: 'Cause', glyph: '◈' },
  pattern: { word: 'Pattern', glyph: '◇' },
  watching: { word: 'Watching', glyph: '◌' },
};

/* The server owns the tier slug. This map only gives its two priced slugs their
   settled reader-facing spelling; a new slug remains uncaptioned until the
   server contract and design record name it. */
export const TIER = {
  next_in_line: 'Next in line',
  worth_a_look: 'Worth a look',
};

/* The rail measures this host after it is painted. The workstation owns the
   measurement and mounting lifecycle; this is the rail's legibility floor. */
export const MIN_ROW_MINI_WIDTH = 120;

/* Display units per parameter. Formatting, not policy: the projection publishes the
   numbers and the parameter id, and a unit is how a number is spelled. A correction
   factor is spelled insulin first by the desk's one formatter (ADR 451). */
const UNIT = { basal_rate: 'U/hr', carb_ratio: 'g/U' };
const shown = (parameter, value) =>
  (parameter === 'isf' ? settingValue(parameter, num(value)) : `${num(value)} ${UNIT[parameter]}`);

/**
 * A rate as the surface spells it: rounded to the two decimals every parameter
 * detail panel prints (`u()` in diagnose-workstation.js), trailing zeros trimmed,
 * one decimal minimum so a column stays even.
 *
 * The rounding is not cosmetic. A queue row reading `1.041` above a detail panel
 * reading `1.04` is two numbers for one fact, and the reader cannot tell which one
 * the pump would get.
 */
function num(value) {
  const text = Number(value).toFixed(2).replace(/0$/, '');
  return text.endsWith('.') ? `${text}0` : text;
}

/** The note a whole-day row that is not a Pattern carries after its detail line:
    the served `window_scope`, in words. The queue's renderer reads it here; the
    desk replay restates it (the replay may not import app modules), and the
    replay's node test holds the two identical. */
export function scopeNote(row) {
  return row.window_scope === 'whole_day' && row.kind !== 'pattern' ? ' · Whole day' : '';
}

/** Validate the additive server coordinate as protocol data, without deciding
 * which Finding kinds are eligible. Membership remains entirely server-owned. */
export function eventChartCoordinate(row) {
  const coordinate = row?.event_chart;
  if (coordinate === null || typeof coordinate !== 'object' || Array.isArray(coordinate)) return null;
  if (Object.keys(coordinate).length !== 2
      || !Object.hasOwn(coordinate, 'lever') || !Object.hasOwn(coordinate, 'window')) return null;
  if (typeof coordinate.lever !== 'string' || coordinate.lever.length === 0) return null;
  const { window } = coordinate;
  if (window === null || typeof window !== 'object' || Array.isArray(window)
      || typeof window.scoped !== 'boolean'
      || (window.scoped && (typeof window.start_min !== 'number'
                            || typeof window.end_min !== 'number'))
      || (!window.scoped && (window.start_min !== null || window.end_min !== null))) return null;
  return coordinate;
}

/** A published Pattern or Lever chart enters the same event case-file drill. */
export function caseFileAlignment(row) {
  return row?.pattern_chart || eventChartCoordinate(row) ? 'event' : 'clock';
}

/**
 * Term 45 — the queue's meta copy, and nothing else ever goes there.
 *
 * Global reads `N findings · 30 days`, a scoped window reads `N in this window`,
 * and an EMPTY window — scoped or not — reads only how much history was looked at
 * (term 41: no count, no sort language). Ranking language needs something ranked,
 * and "0 in this window" counts a thing that is not there. Never the window range
 * restated either: the follow chip and the chart's own window label already print
 * the hours, and a third copy one line apart is noise.
 */
export function queueMeta(projection, selected = null) {
  const rows = queueRows(projection, selected)
    .filter((row) => !row.hidden && !row.collapsed);
  const days = projection?.findings_window?.days;
  const dayWord = days === 1 ? 'day' : 'days';
  if (!rows.length) return `${days} ${dayWord}`;
  if (projection?.window?.scoped) return `${rows.length} in this window`;
  const findingWord = rows.length === 1 ? 'finding' : 'findings';
  return `${rows.length} ${findingWord} · ${days} ${dayWord}`;
}

/* #413 ADR "The backend serves the count sentence" — the projection publishes
   `count_sentences` beside `headline`: one per count-bearing Pattern row, one per
   served family appearance of a Cause row. The desk holds no noun or outcome word
   list of its own and prints every served sentence, in served order, never
   merged (term 35). */
function sentenceParts(row) {
  return (row.count_sentences || []).map((s) => ({
    count: `${s.count} of ${s.denominator}`, noun: s.noun, outcome: s.outcome,
  }));
}

/* #424 — for the fold, a cause's count sentences are its served `fold_sentences`:
   its share of the Pattern's count first (scope `pattern`), then its counts outside
   that count. The desk computes no share and decides no scope. */
function foldParts(row) {
  return (row.fold_sentences || []).map((s) => ({
    count: `${s.count} of ${s.denominator}`, noun: s.noun, scope: s.scope,
  }));
}

/**
 * A parameter row's own support denominator, in its own noun and naming its own run
 * (term 16). `nights of steady data` belongs to basal alone — I:C names meal runs, ISF names
 * fasting nights — and every one of them is read off the row, never inferred.
 */
function supportPart(row) {
  const support = row.support || {};
  if (support.n == null) return null;
  const run = support.run_days == null ? null : `${support.run_days} d run`;
  return [{ count: String(support.n), noun: support.noun }, run];
}

/**
 * The one detail line an asserting parameter row prints.
 *
 * The number pair when the row carries one — a single slot, an I:C block, ISF — and
 * the support denominator when it does not. A MERGED span deliberately carries no
 * `current`/`recommended`: the projection leaves them on its members rather than
 * inventing a span average, and re-deriving one here is exactly the composition
 * term 40 forbids. Both branches are one line in one slot, so no row's geometry
 * moves against another's.
 */
function assertDetail(row) {
  // ISF keeps its direction-derived queue register, but only the
  // backend's exact permission verdict may expose an action number. Legacy,
  // malformed, and explicitly held rows keep their evidence denominator here.
  if (row.parameter === 'isf' && row.asserts_move !== true) {
    const support = supportPart(row);
    return support ? { kind: 'support', parts: support } : null;
  }
  const spelled = row.parameter === 'isf' || Boolean(UNIT[row.parameter]);
  if (row.current != null && row.recommended != null && spelled) {
    return { kind: 'nums', now: `now ${shown(row.parameter, row.current)} → `,
      then: shown(row.parameter, row.recommended) };
  }
  const support = supportPart(row);
  return support ? { kind: 'support', parts: support } : null;
}

/**
 * The findings rows this app presents, in the server's order.
 *
 * PAST-SETTING READS ARE RETIRED FROM THE APP. Connor, 2026-09-08, on being shown
 * the historical carb-ratio row in Explore: "no." and "We dont' need historical
 * reads in the app." They were previously demoted into the Watching disclosure;
 * the instruction is that they are absent, not hidden behind one.
 *
 * This is the ONE place that decides it. Every presentation of the findings rows
 * — the queue, its meta count, its mini charts, and anything a later surface
 * builds from them — starts here, so no second classifier can disagree about
 * what the reader is shown. The server still publishes the register and the
 * backend read is untouched; the app simply does not present it.
 */
export function presentedRows(projection) {
  return (projection?.rows || []).filter((row) => row.register !== 'history');
}

/**
 * The queue's display rows, in the server's order, with the server's ranking tier
 * and each row's single detail line chosen.
 *
 * The seam (term 42) opens before the first unpriced row of the ranked head —
 * `assert` and `finding`, the two registers priority can reach — and only where a
 * priced row precedes it. With nothing priced, the sentence would caption the
 * whole list instead of the tail. An asserting row whose served verdict keeps it
 * from staging is unranked for that reason, not for want of recurrence, so it
 * never opens the seam and its detail line is its own staging refusal (ADR 469).
 * The demoted `held` and `blind` registers follow the seam and are not its
 * subject: each owns its own reason line. It uses the server's row facts to place
 * existing markup; it does not classify or infer the row's published tier.
 *
 * A ROW ANCHORED TO ITS SETTING HOLDS NO POSITION OF ITS OWN (ADR 469). The server
 * serves `anchored_by` and sorts the row beneath its setting; while that setting
 * row is shown, the anchored row is weighted `anchored` and carries no numeral,
 * caption or stripe. When a sift hides the setting row, the anchored row is the one
 * visible holder of that Priority and takes a numeral, but still no tier word,
 * caption or stripe, and it stays out of the tier and stripe bookkeeping.
 *
 * A CLAIMED CAUSE IS NOT A ROW OF ITS OWN (#413, "A Pattern owns its causes in
 * the rail") — PROVIDED its named parent is actually served in this
 * projection. It never enters the returned list as a sibling; instead it is
 * folded onto its parent Pattern's `members` array, in served order, carrying
 * every one of its served fold sentences (#424). A member outside its parent's
 * fold has nothing to be reachable through, so there is no independent
 * hidden/collapsed state to track for it — it shows exactly when its parent
 * does.
 *
 * A CLAIM NAMING NO SERVED ROW IS NOT A FOLD, AND NEVER A SILENT DROP. The
 * backend's `_pattern_rows` always stamps `claimed_by` and appends its owning
 * Pattern row in the same pass (findings_projection.py), so every currently
 * reachable payload keeps the two coupled — but nothing enforces that
 * coupling with a test the way #413's count-sentence coverage does, and this
 * projection crosses the server boundary. A cause whose named parent is
 * absent from the served rows falls back to an ordinary top-level row (its
 * own rank, tier and detail) rather than vanishing, so a malformed or
 * future-shaped payload degrades to a plain row, never a missing one.
 */
export function queueRows(projection, selected = null) {
  const rows = presentedRows(projection);
  const presentIds = new Set(rows.map((row) => row.id));
  const sifting = selected !== null;
  const filtered = rows.map((row) => {
    const chips = row.chips || [];
    const watching = row.register === 'held' || row.register === 'blind';
    // Watching reads remain reachable through their disclosure rather than
    // competing with actionable findings.
    const siftedOut = chips.length > 0 && sifting && !chips.some((chip) => selected.has(chip));
    const hidden = siftedOut;
    const collapsed = watching;
    const claimedBy = row.claimed_by && presentIds.has(row.claimed_by) ? row.claimed_by : null;
    return { row, hidden, collapsed, claimedBy };
  });
  let pricedSeen = false;
  let seamOpened = false;
  let rankCounter = 0;
  let previousPricedTier = null;
  /* Term 3.2 — "the rail shows served urgency": the FIRST priced tier the
     reader can see is the urgent one. Every row that shares it carries the
     stripe, whether or not it happens to be the row that names the tier. */
  let firstPricedTier;
  let firstPricedTierSet = false;
  const built = [];
  const shownIds = new Set();
  for (const { row, hidden, collapsed, claimedBy } of filtered) {
    if (claimedBy) continue; // folded onto its parent below
    // The divider belongs to rows the reader can currently see, not to an
    // excluded row or to a read represented by the collapsed count.
    const shown = !hidden && !collapsed;
    if (shown) shownIds.add(row.id);
    const ranked = row.register === 'assert' || row.register === 'finding';
    const unpriced = ranked && row.priority == null;
    const stageable = row.register === 'assert'
      && (row.parameter !== 'isf' || row.asserts_move === true);
    const refused = unpriced && row.register === 'assert' && !stageable;
    const anchored = Boolean(row.anchored_by) && !unpriced;
    const anchorShown = anchored && shownIds.has(row.anchored_by);
    const pricedRanked = shown && ranked && !unpriced && !anchored;
    const seam = shown && unpriced && !refused && pricedSeen && !seamOpened;
    if (seam) seamOpened = true;
    const weight = collapsed ? 'collapsed'
      : !shown ? null
        : unpriced ? 'tail' : anchorShown ? 'anchored' : 'priced';
    const caption = pricedRanked && pricedSeen && row.tier !== previousPricedTier
      ? TIER[row.tier] || null : null;
    if (pricedRanked) {
      if (!firstPricedTierSet) { firstPricedTier = row.tier; firstPricedTierSet = true; }
      previousPricedTier = row.tier;
    }
    if (shown && ranked && !unpriced) pricedSeen = true;
    /* The rank NUMERAL prints the row's visible position among priced ranked
       rows — position was already the whole ranking statement (slice-2 ruling:
       no scores), the numeral just spells it. Nothing is re-ranked here: the
       counter walks the server's own order over the rows a reader can see, so a
       sift renumbers exactly as it re-positions. Unpriced tail and Watching
       rows carry no numeral — they hold no rank to state. */
    const rank = shown && ranked && !unpriced && !anchorShown ? ++rankCounter : null;
    built.push({
      rank,
      /* Slice 4 — the two-line evidence summary is the projection's own
         `annotation` sentence, revealed rather than composed. Only an
         asserting row carries one the queue was not already printing. */
      summary: row.register === 'assert' && typeof row.annotation === 'string'
        && row.annotation ? row.annotation : null,
      id: row.id,
      register: row.register,
      title: row.title,
      flavor: row.kind === 'pattern' ? 'pattern'
        : row.kind === 'setting' ? 'setting' : 'habit',
      pattern: row.kind === 'pattern',
      tier: row.tier,
      weight,
      caption,
      seam,
      hidden,
      collapsed,
      /* ISF carries an independent backend staging verdict. Its
         direction-derived register and rank remain untouched when that verdict
         holds the row; exact true alone exposes the stage affordance. */
      stageable,
      // The served row carries the analyzer's `evidence.direction` as `direction`.
      detail: refused ? { kind: 'reason', text: isfStageNote({ ...row, evidence: { direction: row.direction } }) }
        : detailFor(row),
      // No tier word is painted in an anchored row: its tier is its setting's.
      tierWord: rank === 1 && !anchored ? TIER[row.tier] || null : null,
      urgent: pricedRanked && row.tier === firstPricedTier,
      members: null,
      raw: row,
    });
  }
  const byId = new Map(built.map((entry) => [entry.id, entry]));
  for (const { row, claimedBy } of filtered) {
    if (!claimedBy) continue;
    const parent = byId.get(claimedBy);
    // `claimedBy` is only set above when its id names a served row, and every
    // served row not itself claimed enters `built` unconditionally — so this
    // is unreached on any payload the backend can currently produce (a
    // Pattern is never itself claimed). It stays as a last-resort guard
    // against a future claim chain rather than a silent drop.
    if (!parent) continue;
    (parent.members ??= []).push({
      id: row.id,
      title: row.title,
      sentences: foldParts(row),
      raw: row,
    });
  }
  return built;
}

function detailFor(row) {
  if (row.kind === 'pattern') {
    if (row.pattern?.count_status) return { kind: 'pattern-status', text: 'counts under review' };
    const parts = sentenceParts(row);
    return parts.length ? { kind: 'sentences', parts } : null;
  }
  if (row.register === 'finding') {
    const parts = sentenceParts(row);
    return parts.length ? { kind: 'sentences', parts } : null;
  }
  if (row.register === 'assert') return assertDetail(row);
  // held / blind — WORDS, not a number spine (term 14). The reason is verbatim
  // backend copy; only the prefix is ours, and its node test pins it.
  return { kind: 'reason', text: `${HELD_PREFIX}${row.reason || ''}` };
}

/* --------------------------------------------------------------- the painter */

const add = (parent, cls, text) => {
  const span = document.createElement('span');
  span.className = cls;
  if (text != null) span.textContent = text;
  parent.append(span);
  return span;
};

function paintDetail(node, detail) {
  if (!detail) return;
  if (detail.kind === 'nums') {
    const den = add(node, 'den nums');
    den.append(detail.now);
    const bold = document.createElement('b');
    bold.textContent = detail.then;
    den.append(bold);
    return den;
  }
  if (detail.kind === 'reason') {
    return add(node, 'why', detail.text);
  }
  if (detail.kind === 'pattern-status') {
    const den = add(node, 'den pattern-status');
    den.textContent = detail.text;
    return den;
  }
  const den = add(node, 'den');
  if (detail.kind === 'support') {
    const [{ count, noun }, run] = detail.parts;
    add(den, 'v', count);
    den.append(` ${noun}`);
    if (run) { add(den, 'sep', '·'); den.append(run); }
    return den;
  }
  // 'sentences' — the served `n of d noun outcome`, one per appearance, never
  // merged (term 35), count and denominator emphasised together (#413).
  detail.parts.forEach((part, i) => {
    if (i) add(den, 'sep', '·');
    add(den, 'v', part.count);
    den.append(` ${part.noun} ${part.outcome}`);
  });
  return den;
}

/** A folded cause's own line: name, its share of the Pattern's count, then the
    drill — never its outcome word, which the parent Pattern's own line already
    carries (#413, "A Pattern owns its causes in the rail"). Its counts outside
    the Pattern's count sit beneath (#424), so the name and share keep the rail's
    one row. They lead with "not in this Pattern's count" only when the parent
    serves a count; under one that serves none there is no count to be outside
    of, so they print alone (#468). The parent's spine is the causes list's own
    rule, so a line carries no gutter mark of its own. */
function paintMember(list, member, onDrill, parentCounts) {
  const item = document.createElement('div');
  item.className = 'qitem member';
  item.setAttribute('role', 'listitem');
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'qmember';
  node.dataset.id = member.id;
  item.append(node);
  add(node, 'lab', member.title);
  add(node, 'go', '›').setAttribute('aria-hidden', 'true');
  const counts = (host, sentences) => sentences.forEach((sentence, i) => {
    if (i) add(host, 'sep', '·');
    add(host, 'v', sentence.count);
    host.append(` ${sentence.noun}`);
  });
  counts(add(node, 'den'), member.sentences.filter((sentence) => sentence.scope !== 'outside'));
  const outside = member.sentences.filter((sentence) => sentence.scope === 'outside');
  if (outside.length) {
    const out = add(node, 'out');
    if (parentCounts) {
      add(out, 'lead', 'not in this Pattern\'s count');
      add(out, 'sep', '·');
    }
    counts(out, outside);
  }
  node.addEventListener('click', () => onDrill(member.raw));
  list.append(item);
}

/**
 * Paint one projection into the inspector's level-1 host.
 *
 * `onDrill(row)` receives the SERVER row — every level below this one is keyed on
 * the projection's own ids, so no drill target is guessed from a title.
 */
export function renderFindingsQueue(host, projection, onDrill, view = null) {
  /* `view` is workstation-owned UX state:
     { selected: Set<string>|null, collapsedExpanded: boolean,
       onToggleCollapsed: () => void, openMembers: Map<string, boolean>|null,
       onToggleMembers: (id: string, wasOpen: boolean) => void }. Null selection
     means no sift. `openMembers` holds only EXPLICIT overrides the reader made;
     a Pattern absent from it falls back to its own default (open on the first
     ranked row, closed on every later one, #413). */
  const selected = view?.selected ?? null;
  const filtering = selected !== null;
  const rows = queueRows(projection, selected);
  if (!rows.length) {
    const line = document.createElement('p');
    line.className = 'quiet-line';
    line.textContent = EMPTY_LINE;
    host.append(line);
    return { rows, miniSlots: [] };
  }
  const shown = rows.filter((row) => !row.hidden && !row.collapsed);
  const collapsed = rows.filter((row) => row.collapsed);
  if (!shown.length) {
    const line = document.createElement('p');
    line.className = `quiet-line${filtering || collapsed.length ? ' sift-empty' : ''}`;
    line.textContent = filtering ? EMPTY_SIFT_LINE : EMPTY_LINE;
    host.append(line);
    if (!collapsed.length) return { rows, miniSlots: [] };
  }
  const list = document.createElement('div');
  list.className = 'q';
  list.setAttribute('role', 'list');
  host.append(list);

  const miniSlots = [];
  const paintRow = (row) => {
    if (row.seam) {
      const note = document.createElement('p');
      note.className = 'tailnote';
      note.textContent = TAIL_NOTE;
      list.append(note);
    }
    if (row.caption) {
      const caption = document.createElement('p');
      caption.className = 'qtier';
      caption.textContent = row.caption;
      list.append(caption);
    }
    /* The row IS a control, and ARIA roles are not additive: `listitem` on the
       button replaces its implicit `button` role, so the screen's primary drill
       stops being exposed as activatable at all (#363). The enclosing item
       carries the list position instead — which is what keeps the numeral below
       legitimately hidden — and the button keeps its own role. The item is also
       the flex child of `.q`, so the tail's spacing rules address it. */
    const item = document.createElement('div');
    item.className = `qitem${row.weight === 'tail' || row.weight === 'anchored' ? ` ${row.weight}` : ''}`;
    item.setAttribute('role', 'listitem');
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `qrow${row.rank !== null ? ' priced' : row.weight ? ` ${row.weight}` : ''}`;
    node.dataset.state = row.register;
    node.dataset.tier = row.tier;
    node.dataset.id = row.id;
    node.dataset.urgent = String(Boolean(row.urgent));
    item.append(node);
    // the numeral restates the position a screen reader already announces
    add(node, 'n', row.rank == null ? '' : String(row.rank))
      .setAttribute('aria-hidden', 'true');
    // The first served tier word is read before the first row's title; later tier
    // changes use the caption inserted immediately before their first row.
    if (row.tierWord) add(node, 'tier', row.tierWord);
    add(node, 'lab', row.title);
    /* The toggle and the causes it discloses belong to the Pattern's own list
       item, so a cause is announced inside its Pattern, never as a sibling of
       the ranked rows; the causes are their own nested list. */
    const appendFold = () => {
      if (!row.members || !row.members.length) return;
      const override = view?.openMembers;
      const open = override && override.has(row.id) ? override.get(row.id) : row.rank === 1;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'qfold';
      const causeWord = row.members.length === 1 ? 'cause' : 'causes';
      toggle.textContent = `${row.members.length} ${causeWord}`;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.addEventListener('click', () => view?.onToggleMembers?.(row.id, open));
      item.append(toggle);
      if (!open) return;
      const causes = document.createElement('div');
      causes.className = 'qcauses';
      causes.id = `causes-${row.id}`;
      causes.setAttribute('role', 'list');
      toggle.setAttribute('aria-controls', causes.id);
      const parentCounts = Boolean(row.raw.count_sentences?.length);
      for (const member of row.members) paintMember(causes, member, onDrill, parentCounts);
      item.append(causes);
    };
    if (row.weight === 'tail' || row.detail?.kind === 'pattern-status') {
      // An unpriced row holds no rank, but it still prints every served count
      // sentence it carries (#413: every count-bearing rail row); its other
      // details stay off the quiet tail, as before.
      if (['sentences', 'pattern-status', 'reason'].includes(row.detail?.kind)) paintDetail(node, row.detail);
      add(node, 'go', '›').setAttribute('aria-hidden', 'true');
      node.addEventListener('click', () => onDrill(row.raw));
      list.append(item);
      appendFold();
      return;
    }
    /* The tag is a SIBLING of the title, not a child of it: it owns the row's right
       spine, so it has to be a grid item of the row itself. Nested inside the title
       it trails the words and lands at a different x on every row (term 36). */
    const tag = add(node, `tag ${row.flavor}`);
    // the glyph is decoration on a word that already says it — never read aloud
    add(tag, 'gly', FLAVOR[row.flavor].glyph).setAttribute('aria-hidden', 'true');
    tag.append(FLAVOR[row.flavor].word);
    // every row drills, held and blind included (terms 22 / 38)
    add(node, 'go', '›').setAttribute('aria-hidden', 'true');
    // the evidence summary sits between the title and the denominator, clamped
    // to two lines by the stylesheet
    if (row.summary) add(node, 'sum', row.summary);
    const detail = paintDetail(node, row.detail);
    // The served rank note says where the rank does not come from the counts.
    const note = `${scopeNote(row.raw)}${row.raw.rank_note ? ` · ${row.raw.rank_note}` : ''}`;
    if (detail && note) add(detail, 'scope-note', note);
    /* Chart-backed Watching rows use the same evidence preview as ranked rows
       when the reader expands them. The workstation registry decides whether
       a descriptor actually exists; rows without one lose the empty host. */
    const mini = document.createElement('span');
    mini.className = 'mini';
    node.append(mini);
    miniSlots.push({ host: mini, row: row.raw });
    node.addEventListener('click', () => onDrill(row.raw));
    list.append(item);
    appendFold();
  };
  for (const row of shown) {
    paintRow(row);
  }
  if (collapsed.length) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'qcollapse';
    const readWord = collapsed.length === 1 ? 'read' : 'reads';
    toggle.textContent = `Watching · ${collapsed.length} ${readWord}`;
    toggle.setAttribute('aria-expanded', String(Boolean(view?.collapsedExpanded)));
    toggle.addEventListener('click', () => view?.onToggleCollapsed?.());
    list.append(toggle);
    if (view?.collapsedExpanded) {
      for (const row of collapsed) paintRow(row);
    }
  }
  return { rows, miniSlots };
}
