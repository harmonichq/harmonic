/* Fixture-only MIRROR of the server-owned findings projection (#730/#735).
 *
 * It lives beside the synthetic sets rather than inside one: the demo fixture
 * directories are byte-checked against their generator (`scripts/check_demo_fixtures.py`),
 * so an extra file in one is a drift failure.
 *
 * `ciq_autotune/findings_projection.py` is the source of truth and the only thing
 * production ever answers `GET /diagnose/findings` from. This file exists because
 * the browser gates have no Python: they serve the app from route stubs over a
 * committed synthetic payload, and a queue that re-scopes to an arbitrary drawn
 * brace cannot be served from a fixed list of frozen windows.
 *
 * Fixture-only, exactly like `diagnose-event-comparison.synthetic/project.mjs`:
 * frontend production code never imports it, and it decides nothing on its own —
 * every rule below is transcribed from the Python, not re-invented.
 *
 * IT IS DRIFT-CHECKED. `scripts/gen_findings_projection_fixtures.py` freezes the
 * three published payloads it projected from alongside its answers, and
 * `frontend/findings-projection-mirror.test.js` runs this mirror over those exact
 * inputs and deep-compares every window against the server's own output. A
 * classification, merge, anchoring or ordering change that lands in Python and not
 * here fails the fast gate — which is the whole point: a stub that quietly disagrees
 * with the server would let the browser legs certify a queue the app never renders.
 */

const SCHEMA = 'diagnose-findings-v1';
const DAY_MINUTES = 1440;
const SLOT_MINUTES = 30;

// The basal verdicts that WITHHOLD a move. `no change` is deliberately absent —
// a slot inside its programmed rate's noise floor is quiet, and quiet is quiet.
const HELD_STATUSES = new Set(['insufficient evidence', 'held (recurring-low gate)', 'no baseline']);
const BLIND_STATUS = 'no data';

const FAMILY_NOUN = {
  lows: 'lows', highs: 'highs', meals: 'meals',
  correction_clusters: 'correction clusters',
};
const KIND_FOR_FAMILY = {
  lows: 'low', meals: 'meal', highs: 'high', correction_clusters: 'correction',
};
const REGISTER_RANK = { assert: 0, finding: 0, held: 1, blind: 2 };
// levers._OUTCOME_KIND — the anchor kind each lever's CONSEQUENCE lands on
const OUTCOME_KIND = {
  carb_undercount: 'high', late_bolus: 'high', meal_over_delivery: 'low',
  over_treated_low: 'high', correction_stacking: 'low', correction_on_iob: 'low',
  missed_meal: 'high',
};
// analyzers.ic.BLOCK_WINDOW_DAYS
const BLOCK_WINDOW_DAYS = 90;

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (m) => (m === DAY_MINUTES ? '24:00' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`);

const spanLabel = (startMin, endMin) => (
  (startMin + SLOT_MINUTES) % DAY_MINUTES === endMin % DAY_MINUTES
    ? hhmm(startMin) : `${hhmm(startMin)} to ${hhmm(endMin)}`);

/** Linear pieces of a clock interval on the circular day; `end <= start` wraps. */
const segments = (startMin, endMin) => (endMin > startMin
  ? [[startMin, endMin]] : [[startMin, DAY_MINUTES], [0, endMin]]);

const overlaps = (pieces, window) => pieces.some(([a, b]) =>
  window.some(([c, d]) => Math.max(a, c) < Math.min(b, d)));
const contains = (minute, window) => window.some(([a, b]) => a <= minute && minute < b);
const minuteOf = (stamp) => Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16));

/** The clock window a projection answers for — the whole day, or one interval. */
export function windowQuery(bounds) {
  const scoped = Boolean(bounds);
  const startMin = scoped ? bounds.start_min : null;
  const endMin = scoped ? bounds.end_min : null;
  return {
    scoped,
    pieces: scoped ? segments(((startMin % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES, endMin)
      : [[0, DAY_MINUTES]],
    dict: {
      scoped,
      start_min: startMin,
      end_min: endMin,
      label: scoped
        ? `${hhmm(((startMin % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES)}–${hhmm(endMin)}`
        : null,
    },
  };
}

/** Every key present on every row, absent reading as null (`_row`). */
function row(fields) {
  return {
    id: null, register: null, kind: null, title: null, priority: null, tier: null,
    parameter: null, label: null, span: null, direction: null,
    lean: null, current: null, recommended: null, estimate: null,
    support: null, reason: null, annotation: null, members: null,
    lever: null, appearances: null, episodes: null,
    ...fields,
  };
}

const lean = (current, value) => {
  if (current == null || value == null || value === current) return null;
  return value > current ? 'raise' : 'lower';
};

const title = (name, register, direction) => {
  if (direction == null) return name;
  return register === 'held' ? `${name} · leaning ${direction}` : `${name} · ${direction}`;
};

/** A slot's `(register, direction)` — the pair contiguous slots merge on — or null
    for a quiet slot, which is no row at all. Asserting is read first. */
function basalKey(slot) {
  if (slot.asserts_move) return ['assert', slot.direction ?? null];
  const status = slot.safety_status;
  if (status === BLIND_STATUS) return ['blind', null];
  if (HELD_STATUSES.has(status)) return ['held', lean(slot.current, (slot.estimate || {}).value)];
  return null;
}

function leverPriority(analysis, parameter) {
  for (const lever of analysis.tuning_levers || []) {
    if (lever.parameter === parameter) return lever.priority ?? null;
  }
  return null;
}

function basalRows(analysis, window) {
  const slots = [...(analysis.basal || [])].sort((a, b) => a.slot - b.slot);
  const spans = [];
  for (const slot of slots) {
    const key = basalKey(slot);
    if (key === null) { spans.push([null, [slot]]); continue; }
    const last = spans[spans.length - 1];
    if (last && last[0] !== null && last[0][0] === key[0] && last[0][1] === key[1]
        && last[1][last[1].length - 1].slot + 1 === slot.slot) {
      last[1].push(slot);
    } else spans.push([key, [slot]]);
  }

  const rows = [];
  for (const [key, span] of spans) {
    if (key === null) continue;
    const startMin = span[0].slot * SLOT_MINUTES;
    const endMin = (span[span.length - 1].slot + 1) * SLOT_MINUTES;
    if (!overlaps([[startMin, endMin]], window)) continue;
    const [register, direction] = key;
    const head = span[0];
    const single = span.length === 1;
    const label = spanLabel(startMin, endMin);
    rows.push(row({
      id: `basal:${startMin}-${endMin}`,
      register,
      kind: 'setting',
      parameter: 'basal_rate',
      title: title(`Basal ${label}`, register, direction),
      label,
      priority: register === 'assert' ? leverPriority(analysis, 'basal_rate') : null,
      span: { start_min: startMin, end_min: endMin, label },
      direction: register === 'assert' ? direction : null,
      lean: register === 'held' ? direction : null,
      // a merged run names no single programmed rate, so its numbers stay on its
      // members rather than becoming an invented span average
      current: single ? head.current ?? null : null,
      recommended: single ? head.recommended ?? null : null,
      estimate: single ? head.estimate ?? null : null,
      members: span.map((s) => ({
        start_min: s.slot * SLOT_MINUTES,
        current: s.current ?? null,
        recommended: s.recommended ?? null,
        estimate: s.estimate ?? null,
        days: s.days ?? null,
      })),
      // the weakest slot governs how well-supported the whole run is
      support: {
        n: Math.min(...span.map((s) => s.days || 0)),
        noun: 'clean nights',
        run_days: analysis.window_days ?? null,
      },
      reason: register !== 'assert' ? head.safety_status ?? null : null,
      annotation: head.annotation ?? null,
    }));
  }
  return rows;
}

function icRows(analysis, window) {
  const rows = [];
  for (const block of analysis.ic_blocks || []) {
    const startMin = block.start_min;
    const endMin = block.end_min;
    if (!overlaps(segments(startMin, endMin), window)) continue;
    const asserts = Boolean(block.asserts_move);
    const estimate = block.estimate || {};
    // `held_reason` IS the I:C hold predicate (#523) — never re-derived from the band
    if (!asserts && !block.held_reason) continue;
    const register = asserts ? 'assert' : 'held';
    const label = spanLabel(startMin, endMin);
    const direction = asserts ? block.direction ?? null : lean(block.current, estimate.value);
    rows.push(row({
      id: `ic:${block.block_id}`,
      register,
      kind: 'setting',
      parameter: 'carb_ratio',
      title: title(`I:C ${label}`, register, direction),
      label: block.label ?? null,
      priority: asserts ? leverPriority(analysis, 'carb_ratio') : null,
      span: { start_min: startMin, end_min: endMin, label },
      direction: asserts ? direction : null,
      lean: asserts ? null : direction,
      current: (block.current_values || []).length ? block.current_values[0] : null,
      recommended: block.recommended ?? null,
      estimate,
      support: { n: block.n_runs ?? null, noun: 'meal runs', run_days: BLOCK_WINDOW_DAYS },
      reason: asserts ? null : (block.held_reason || block.annotation) ?? null,
      annotation: block.annotation ?? null,
    }));
  }
  return rows;
}

/** ISF is one value for the whole day, so it meets every window. A no-direction ISF
    with a number is HELD rather than quiet: its analyzer always says in words why it
    is not moving, where a quiet basal slot has 47 silent neighbours. */
function isfRows(analysis) {
  const rows = [];
  for (const entry of analysis.isf || []) {
    const evidence = entry.evidence || {};
    const direction = evidence.direction ?? null;
    const estimate = entry.estimate || {};
    if (direction == null && estimate.value == null) continue;
    const register = direction != null ? 'assert' : 'held';
    rows.push(row({
      id: 'isf',
      register,
      kind: 'setting',
      parameter: 'isf',
      title: title('ISF', register, direction),
      label: entry.label ?? null,
      priority: direction != null ? leverPriority(analysis, 'isf') : null,
      span: null,
      direction,
      lean: null,
      current: entry.current ?? null,
      recommended: entry.recommended ?? null,
      estimate,
      support: {
        n: (evidence.night_fits || []).length,
        noun: 'fasting nights',
        run_days: analysis.window_days ?? null,
      },
      reason: direction == null ? entry.annotation ?? null : null,
      annotation: entry.annotation ?? null,
    }));
  }
  return rows;
}

/** `ep_id -> [[minute, anchor kind]]` across every family. */
function episodeAnchors(families) {
  const anchors = new Map();
  for (const [family, payload] of Object.entries(families)) {
    const kind = KIND_FOR_FAMILY[family] ?? family;
    for (const occurrence of payload.occurrences || []) {
      const list = anchors.get(occurrence.ep_id) || [];
      list.push([minuteOf(occurrence.t), 'kind' in occurrence ? occurrence.kind : kind]);
      anchors.set(occurrence.ep_id, list);
    }
  }
  return anchors;
}

/** The clock minute this occurrence is a member of a window BY (term 39): its
    episode's LATEST anchor of the lever's declared outcome kind, else where it
    happened. */
function outcomeMinute(occurrence, anchors) {
  const kind = OUTCOME_KIND[occurrence.cause_lever] ?? null;
  if (kind != null) {
    const landings = (anchors.get(occurrence.ep_id) || [])
      .filter(([, anchorKind]) => anchorKind === kind).map(([minute]) => minute);
    if (landings.length) return Math.max(...landings);
  }
  return minuteOf(occurrence.t);
}

function patternPriorities(scenarios) {
  const priced = new Map();
  for (const pattern of [...(scenarios.patterns || []), ...(scenarios.low_confidence || [])]) {
    if (!priced.has(pattern.lever)) priced.set(pattern.lever, pattern.priority ?? null);
  }
  return priced;
}

function findingRows(exposures, scenarios, window) {
  const families = exposures.exposures || {};
  const anchors = episodeAnchors(families);
  const byLever = new Map();
  for (const [family, payload] of Object.entries(families)) {
    // numerator and denominator are anchored the SAME way, which is what keeps n<=m
    const kept = (payload.occurrences || [])
      .filter((occurrence) => contains(outcomeMinute(occurrence, anchors), window));
    const denominator = kept.length;
    const counted = new Map();
    for (const occurrence of kept) {
      const lever = occurrence.cause_lever;
      if (lever == null) continue;
      counted.set(lever, [...(counted.get(lever) || []), occurrence]);
    }
    for (const [lever, hits] of counted) {
      const entry = byLever.get(lever)
        || { title: hits[0].cause_title, appearances: [], episodes: new Set() };
      entry.appearances.push({
        family, noun: FAMILY_NOUN[family] ?? family, n: hits.length, m: denominator,
      });
      for (const hit of hits) entry.episodes.add(hit.ep_id);
      byLever.set(lever, entry);
    }
  }

  const priced = patternPriorities(scenarios);
  const rows = [];
  for (const [lever, entry] of byLever) {
    entry.appearances.sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0));
    rows.push(row({
      id: `finding:${lever}`,
      register: 'finding',
      kind: 'habit',
      lever,
      title: entry.title,
      priority: priced.has(lever) ? priced.get(lever) : null,
      appearances: entry.appearances,
      // episodes, not occurrences: one episode in two families is one thing that
      // happened, and the count that orders the unpriced tail must say so
      episodes: entry.episodes.size,
    }));
  }
  return rows;
}

/** The queue's one order: priced rows by priority desc, then unpriced rows by count
    desc, then the demoted held and blind registers in clock order. */
function sortKey(r) {
  const span = r.span || {};
  return [
    REGISTER_RANK[r.register],
    r.priority != null ? 0 : 1,
    -(r.priority || 0),
    -(r.episodes || 0),
    span.start_min ?? DAY_MINUTES,
    r.title || '',
  ];
}
const compare = (a, b) => {
  const left = sortKey(a);
  const right = sortKey(b);
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return 0;
};

/**
 * One window's rows — `FindingsProjection.project`, transcribed.
 *
 * @param {{analysis: object, exposures: object, scenarios: object}} inputs
 * @param {{start_min: number, end_min: number}|null} bounds
 */
export function projectFindings(inputs, bounds = null) {
  const analysis = inputs.analysis || {};
  const exposures = inputs.exposures || {};
  const scenarios = inputs.scenarios || {};
  const query = windowQuery(bounds);
  let rows = [...basalRows(analysis, query.pieces), ...icRows(analysis, query.pieces),
    ...isfRows(analysis)];
  // the GLOBAL queue is asserting-only: a quiet parameter is never listed and never
  // named (term 38)
  if (!query.scoped) rows = rows.filter((r) => r.register === 'assert');
  rows = [...rows, ...findingRows(exposures, scenarios, query.pieces)];
  rows.sort(compare);
  for (const row of rows) {
    if (row.priority == null) row.tier = 'noted';
    else if (row.register === 'assert') row.tier = 'next_in_line';
    else row.tier = 'worth_a_look';
  }
  const counts = { assert: 0, held: 0, blind: 0, finding: 0 };
  for (const r of rows) counts[r.register] += 1;
  return {
    schema: SCHEMA,
    window: query.dict,
    findings_window: { days: analysis.window_days ?? null, ...(exposures.window || {}) },
    rows,
    counts,
  };
}
