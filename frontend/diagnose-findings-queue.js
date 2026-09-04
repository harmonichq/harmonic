/* The Diagnose inspector's level 1 — ONE ranked findings queue (lock terms 34–45).
 *
 * Pump settings and behavioural findings interleave in a single list ordered by the
 * backend's unified 0–100 priority. There is no settings tier, no patterns tier and
 * no "Factors" heading: the crumb root is `Findings` and position is the whole
 * ranking statement (no bars, no score numerals, no tint).
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

/** Term 41 — the empty findings window is a result, not a void. */
export const EMPTY_LINE = 'No pattern or setting asserts a direction in this window.';
/** A sift can exclude assertions without making the window itself empty. */
export const EMPTY_SIFT_LINE = 'No findings match the current filters.';
/** Term 42 — the sentence that lives inside the doubled gap, naming the tail. */
export const TAIL_NOTE = 'Not recurring often enough to rank yet.';
/** Term 14 — a held row's reason line; the suffix is the backend's own words. */
export const HELD_PREFIX = 'no direction asserted — ';

/* Term 36 — glyph + word, at caps-label rank. The GLYPH differentiates; the hue
   only has to stay out of the way (it is `--secondary`, never a clinical token and
   never a hue a chart mark spends). */
export const FLAVOR = {
  setting: { word: 'Setting', glyph: '⚙' },
  habit: { word: 'Habit', glyph: '◈' },
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
   numbers and the parameter id, and a unit is how a number is spelled. */
const UNIT = { basal_rate: 'U/hr', carb_ratio: 'g/U', isf: 'mg/dL/U' };

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

/** The `n of m <family noun>` phrases a finding carries, one per family appearance
    (term 35). A finding in two families keeps BOTH; never a merged total. */
function appearanceParts(row) {
  return (row.appearances || []).map((a) => ({ count: `${a.n} of ${a.m}`, noun: a.noun }));
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
  const unit = UNIT[row.parameter];
  if (row.current != null && row.recommended != null && unit) {
    return { kind: 'nums', now: `now ${num(row.current)} ${unit} → `, then: `${num(row.recommended)} ${unit}` };
  }
  const support = supportPart(row);
  return support ? { kind: 'support', parts: support } : null;
}

/**
 * The queue's display rows, in the server's order, with the server's ranking tier
 * and each row's single detail line chosen.
 *
 * The seam (term 42) opens before the first unpriced row of the ranked head —
 * `assert` and `finding`, the two registers priority can reach — and only where a
 * priced row precedes it. With nothing priced, the sentence would caption the
 * whole list instead of the tail. The demoted `held` and `blind` registers follow
 * the seam and are not its subject: each owns its own reason line. It uses the
 * server's row facts to place existing markup; it does not classify or infer the
 * row's published tier.
 */
export function queueRows(projection, selected = null) {
  const rows = projection?.rows || [];
  const sifting = selected !== null;
  const filtered = rows.map((row) => {
    const chips = row.chips || [];
    const watching = row.register === 'held' || row.register === 'blind'
      || row.register === 'history';
    // Watching reads remain reachable through their disclosure rather than
    // competing with actionable findings.
    const siftedOut = chips.length > 0 && sifting && !chips.some((chip) => selected.has(chip));
    const hidden = siftedOut;
    const collapsed = watching;
    return { row, hidden, collapsed };
  });
  let pricedSeen = false;
  let seamOpened = false;
  let rankCounter = 0;
  let previousPricedTier = null;
  return filtered.map(({ row, hidden, collapsed }) => {
    // The divider belongs to rows the reader can currently see, not to an
    // excluded row or to a read represented by the collapsed count.
    const shown = !hidden && !collapsed;
    const ranked = row.register === 'assert' || row.register === 'finding';
    const unpriced = ranked && row.priority == null;
    const pricedRanked = shown && ranked && !unpriced;
    const seam = shown && unpriced && pricedSeen && !seamOpened;
    if (seam) seamOpened = true;
    const weight = collapsed ? 'collapsed'
      : !shown ? null
        : unpriced ? 'tail'
          : pricedSeen ? 'compact' : 'hero';
    const caption = pricedRanked && pricedSeen && row.tier !== previousPricedTier
      ? TIER[row.tier] || null : null;
    if (pricedRanked) {
      pricedSeen = true;
      previousPricedTier = row.tier;
    }
    /* The rank NUMERAL prints the row's visible position among priced ranked
       rows — position was already the whole ranking statement (slice-2 ruling:
       no scores), the numeral just spells it. Nothing is re-ranked here: the
       counter walks the server's own order over the rows a reader can see, so a
       sift renumbers exactly as it re-positions. Unpriced tail and Watching
       rows carry no numeral — they hold no rank to state. */
    const rank = shown && ranked && !unpriced ? ++rankCounter : null;
    return {
      rank,
      /* Slice 4 — the two-line evidence summary is the projection's own
         `annotation` sentence, revealed rather than composed. Only an
         asserting row carries one the queue was not already printing
         (history's annotation restates its past/support detail line). */
      summary: row.register === 'assert' && typeof row.annotation === 'string'
        && row.annotation ? row.annotation : null,
      id: row.id,
      register: row.register,
      title: row.title,
      flavor: row.register === 'history' ? 'watching'
        : row.kind === 'setting' ? 'setting' : 'habit',
      tier: row.tier,
      weight,
      caption,
      seam,
      hidden,
      collapsed,
      /* ISF carries an independent backend staging verdict. Its
         direction-derived register and rank remain untouched when that verdict
         holds the row; exact true alone exposes the stage affordance. */
      stageable: row.register === 'assert'
        && (row.parameter !== 'isf' || row.asserts_move === true),
      detail: detailFor(row),
      raw: row,
    };
  });
}

function detailFor(row) {
  if (row.register === 'finding') return { kind: 'appearances', parts: appearanceParts(row) };
  if (row.register === 'assert') return assertDetail(row);
  if (row.register === 'history') {
    const runs = row.support === 1 ? '1 meal run' : `${row.support} meal runs`;
    return { kind: 'history', past: `past ${num(row.past_setting)} g/U`, support: runs };
  }
  // held / blind — WORDS, not a number spine (term 14). The reason is verbatim
  // backend copy; only the prefix is ours, and the lock pins it byte for byte.
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
  if (detail.kind === 'history') {
    const den = add(node, 'den history-detail');
    add(den, 'v', detail.past);
    add(den, 'sep', '·');
    den.append(detail.support);
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
  detail.parts.forEach((part, i) => {
    if (i) add(den, 'sep', '·');
    add(den, 'v', part.count);
    den.append(` ${part.noun}`);
  });
  return den;
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
       onToggleCollapsed: () => void }. Null selection means no sift. */
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
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `qrow${row.weight ? ` ${row.weight}` : ''}`;
    node.setAttribute('role', 'listitem');
    node.dataset.state = row.register;
    node.dataset.tier = row.tier;
    node.dataset.id = row.id;
    // the numeral restates the position a screen reader already announces
    add(node, 'n', row.rank == null ? '' : String(row.rank))
      .setAttribute('aria-hidden', 'true');
    // the hero's tier word is its EYEBROW, above the title rather than beside the
    // flavor tag, so it is painted where it is read — before the title, not after
    // the tag (the stylesheet places it; this is the announcement order)
    if (row.weight === 'hero' && TIER[row.tier]) add(node, 'tier', TIER[row.tier]);
    add(node, 'lab', row.title);
    if (row.weight === 'tail') {
      add(node, 'go', '›').setAttribute('aria-hidden', 'true');
      node.addEventListener('click', () => onDrill(row.raw));
      list.append(node);
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
    if (detail && row.raw.window_scope === 'whole_day') {
      add(detail, 'scope-note', ' · Whole day');
    }
    if (row.rank !== null) {
      const mini = document.createElement('span');
      mini.className = 'mini';
      node.append(mini);
      miniSlots.push({ host: mini, row: row.raw });
    }
    node.addEventListener('click', () => onDrill(row.raw));
    list.append(node);
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
