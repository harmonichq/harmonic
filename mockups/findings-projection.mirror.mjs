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

const SCHEMA = 'diagnose-findings-v2';
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
const REGISTER_RANK = { assert: 0, finding: 0, held: 1, blind: 2, history: 3 };
// ADR 0019 §2's closed five-state anchor taxonomy (ADR 41's verdict band vocabulary).
const VERDICT_CATEGORIES = ['fired', 'outranked', 'near_miss', 'no_data', 'clean'];
// levers._OUTCOME_KIND — the anchor kind each lever's CONSEQUENCE lands on
const OUTCOME_KIND = {
  carb_undercount: 'high', late_bolus: 'high', meal_over_delivery: 'low',
  over_treated_low: 'high', correction_stacking: 'low', correction_on_iob: 'low',
  missed_meal: 'high', meal_bolus_short: 'high',
};
// evidence_population.policy_for — Meal bolus fell short recurs over eligible
// meal groups even though each member episode lands in the Highs family.
const RECURRENCE_GROUP_POLICY = {
  meal_bolus_short: { noun: 'meals' },
};
// Carb ratio is grams per unit, so raising it removes insulin and answers lows.
const SETTINGS_CHIPS = {
  basal_rate: { raise: ['highs'], lower: ['lows'] },
  carb_ratio: { raise: ['lows'], lower: ['highs'] },
  isf: { strengthen: ['highs'], weaken: ['lows'] },
};
// findings_projection.UNCAUSED_HIGHS_COPY — the operator-confirmed sentence, with
// the noun's number as its only variation (a surface printing '1 highs' is a defect).
const uncausedHighsCopy = (n) => `${n} ${n === 1 ? 'high' : 'highs'} had no cause `
  + 'detected by the app';
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
    headline: null,
    parameter: null, label: null, span: null, direction: null,
    asserts_move: null,
    lean: null, current: null, recommended: null, estimate: null,
    support: null, reason: null, annotation: null, members: null,
    lever: null, appearances: null, episodes: null,
    evidence: null, verdict_counts: null, verdict_counts_by_family: null,
    chips: null, window_scope: null,
    past_setting: null, programmed_now: null, regime_end: null, run_ids: null,
    event_chart: null,
    ...fields,
  };
}

function chipsFor(row) {
  if (row.register === 'held' || row.register === 'blind' || row.register === 'history') return [];
  if (row.register === 'assert') return [...SETTINGS_CHIPS[row.parameter][row.direction]];

  const chips = [];
  const kind = OUTCOME_KIND[row.lever] ?? null;
  if (kind === 'high') chips.push('highs');
  else if (kind === 'low') chips.push('lows');
  const families = new Set(row.appearances.map((appearance) => appearance.family));
  if (families.has('meals')) chips.push('meals');
  if (families.has('correction_clusters')) chips.push('corrections');
  return chips;
}

function stampedRow(fields) {
  const result = row(fields);
  result.chips = chipsFor(result);
  result.window_scope = result.parameter === 'isf' ? 'whole_day' : 'window';
  return result;
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
    rows.push(stampedRow({
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
        noun: 'nights of steady data',
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
    rows.push(stampedRow({
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
    rows.push(stampedRow({
      id: 'isf',
      register,
      kind: 'setting',
      parameter: 'isf',
      title: title('ISF', register, direction),
      label: entry.label ?? null,
      priority: entry.asserts_move === true ? leverPriority(analysis, 'isf') : null,
      span: null,
      direction,
      asserts_move: entry.asserts_move ?? null,
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

// Silence reasons that keep an occurrence "calm" for a lever whose classifier
// looked and had nothing to flag (mirrors `_CALM_SILENCE_REASONS`).
const CALM_SILENCE_REASONS = new Set([null, undefined, 'no_trigger']);
const NO_DATA_SILENCE_REASON = 'insufficient_data';

/** This finding's own, ROW-RELATIVE verdict on one occurrence (ADR 41, item 2).
    Read off the occurrence's own lever's classifier verdict in `verdicts[]` —
    never the anchor's overall `state`, which collapses every classifier that
    looked at the anchor and says nothing about THIS lever. A lever whose own
    classifier matched is `fired` whether or not it also drove the episode;
    `outranked` is reserved for a calm lever when another lever drove. NO
    verdict entry at all for this lever (never evaluated) is not the same
    fact as evaluated-and-calm, so it reads `no_data` rather than `clean` —
    unless another lever demonstrably drove, which still reads `outranked`. */
function occurrenceVerdict(occurrence, lever) {
  const own = (occurrence.verdicts || []).find((v) => v.classifier === lever);
  if (!own) return occurrence.cause_lever ? 'outranked' : 'no_data';
  if (own.matched) return 'fired';
  const reason = own.silence_reason;
  if (reason === NO_DATA_SILENCE_REASON) return 'no_data';
  if (!CALM_SILENCE_REASONS.has(reason)) return 'near_miss';
  return occurrence.cause_lever ? 'outranked' : 'clean';
}

/** The evidence rows and verdict-band counts one finding row publishes, drawn
    over every in-window occurrence of every family this lever claims a hit in —
    not just its hits — so the band's counts have something to count. Returns
    the total counts AND the same counts broken out per family (finding 1),
    since a multi-family lever's band sits on one family's frame at a time. */
function leverEvidence(lever, families, inWindow) {
  const counts = Object.fromEntries(VERDICT_CATEGORIES.map((c) => [c, 0]));
  const countsByFamily = {};
  const evidence = [];
  for (const family of [...new Set(families)].sort()) {
    const familyCounts = Object.fromEntries(VERDICT_CATEGORIES.map((c) => [c, 0]));
    for (const occurrence of inWindow.get(family) || []) {
      const category = occurrenceVerdict(occurrence, lever);
      counts[category] += 1;
      familyCounts[category] += 1;
      evidence.push({
        ep_id: occurrence.ep_id ?? null,
        t: occurrence.t ?? null,
        date: occurrence.date ?? null,
        family,
        kind: occurrence.kind ?? null,
        verdict: category,
      });
    }
    countsByFamily[family] = familyCounts;
  }
  return { evidence, counts, countsByFamily };
}

function patternPriorities(scenarios) {
  const priced = new Map();
  for (const pattern of [...(scenarios.patterns || []), ...(scenarios.low_confidence || [])]) {
    if (!priced.has(pattern.lever)) priced.set(pattern.lever, pattern.priority ?? null);
  }
  return priced;
}

const EVENT_CHART_FAMILIES = {
  carb_undercount: 'meals', late_bolus: 'meals', meal_over_delivery: 'meals',
  missed_meal: 'highs',
  over_treated_low: 'lows', correction_on_iob: 'lows',
  // Counted in correction clusters, never in lows — the same note sits beside
  // `_EVENT_CHART_FAMILIES` in ciq_autotune/findings_projection.py, which this
  // mirror transcribes and never re-decides.
  correction_stacking: 'correction_clusters',
};

function eventChartCoordinate(lever, query, families) {
  return EVENT_CHART_FAMILIES[lever] && families.includes(EVENT_CHART_FAMILIES[lever])
    ? { lever, window: { ...query.dict } } : null;
}

function findingRows(exposures, scenarios, query) {
  const window = query.pieces;
  const families = exposures.exposures || {};
  const anchors = episodeAnchors(families);
  const patterns = Object.fromEntries(
    [...(scenarios.patterns || []), ...(scenarios.low_confidence || [])]
      .map((pattern) => [pattern.lever, pattern]),
  );
  const inWindow = new Map();
  const byLever = new Map();
  for (const [family, payload] of Object.entries(families)) {
    // numerator and denominator are anchored the SAME way, which is what keeps n<=m
    const kept = (payload.occurrences || [])
      .filter((occurrence) => contains(outcomeMinute(occurrence, anchors), window));
    inWindow.set(family, kept);
    const denominator = kept.length;
    const counted = new Map();
    for (const occurrence of kept) {
      const lever = occurrence.cause_lever;
      if (lever == null) continue;
      counted.set(lever, [...(counted.get(lever) || []), occurrence]);
    }
    for (const [lever, hits] of counted) {
      const entry = byLever.get(lever)
        || { title: hits[0].cause_title, appearances: [], episodes: new Set(), families: [] };
      entry.appearances.push({
        family, noun: FAMILY_NOUN[family] ?? family, n: hits.length, m: denominator,
      });
      for (const hit of hits) entry.episodes.add(hit.ep_id);
      entry.families.push(family);
      byLever.set(lever, entry);
    }
  }

  const priced = patternPriorities(scenarios);
  const rows = [];
  for (const [lever, entry] of byLever) {
    const recurrence = RECURRENCE_GROUP_POLICY[lever];
    if (recurrence) {
      const groupIds = new Set(
        (inWindow.get('highs') || [])
          .filter((hit) => hit.cause_lever === lever)
          .map((hit) => hit.cause_occurrence_id),
      );
      const groups = new Map(
        ((patterns[lever] || {}).occurrence_groups || []).map((group) => [group.id, group]),
      );
      for (const groupId of groupIds) if (!groups.has(groupId)) groupIds.delete(groupId);
      entry.appearances = [{
        family: recurrence.noun,
        noun: recurrence.noun,
        n: groupIds.size,
        m: ((patterns[lever] || {}).confidence || {}).n || 0,
      }];
      entry.episodes = groupIds;
    }
    entry.appearances.sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0));
    const { evidence, counts, countsByFamily } = leverEvidence(lever, entry.families, inWindow);
    rows.push(stampedRow({
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
      // ADR 41: every in-window occurrence this finding's band counts, carrying
      // the event id(s) and clock key the canvas joins on, plus its five-state
      // verdict relative to this lever.
      evidence,
      verdict_counts: counts,
      verdict_counts_by_family: countsByFamily,
      event_chart: eventChartCoordinate(lever, query, entry.families),
    }));
  }
  return rows;
}

function historyRows(analysis, query) {
  const rows = [];
  for (const history of analysis.ic_history || []) {
    if (history.lifecycle !== 'active') continue;
    if (query.scoped
        && !overlaps(segments(history.block_start_min, history.block_end_min), query.pieces)) continue;
    rows.push(stampedRow({
      id: history.id, register: 'history', kind: 'setting', parameter: 'carb_ratio',
      title: `Carb ratio ${history.label}. Past setting.`, label: history.label,
      span: { start_min: history.block_start_min, end_min: history.block_end_min,
        label: spanLabel(history.block_start_min, history.block_end_min) },
      past_setting: history.past_setting, programmed_now: history.programmed_now,
      estimate: history.estimate, support: history.support,
      regime_end: history.regime_end ?? null,
      run_ids: (history.runs || []).map((run) => run.run_id),
      annotation: history.annotation ?? null,
    }));
  }
  return rows;
}

// --- headlines: one served sentence per row (#306 ADR "Every findings row
// carries one served headline"), transcribed from
// ciq_autotune/findings_projection.py's own headline templates — never
// re-invented here. A slot names only a served row field — every family's,
// correction factor included: the ISF rest-window evidence is never a
// source.

const BASAL_BLIND_HEADLINE = 'No steady nights delivered against the '
  + 'programmed rate here, so nothing to say either way.';
const HELD_AT_CURRENT_SUFFIX = '; held at current';
const RANKING_TIERS = new Set(['next_in_line', 'worth_a_look']);

/** Python's `f"{value:.{digits}f}"` rounds half to even at the printed
    digit; `Number.prototype.toFixed` rounds half away from zero, so a
    naive transcription would silently disagree with the app on exact
    midpoints (0.25 at one decimal: app "0.2", `toFixed` "0.3"). This
    rounds in the same round-half-even mode before formatting. */
function roundHalfEven(value, digits) {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const EPSILON = 1e-9;
  let rounded;
  if (Math.abs(diff - 0.5) < EPSILON) {
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(scaled);
  }
  return rounded / factor;
}
const fmtUh = (value) => (value == null ? null : roundHalfEven(value, 2).toFixed(2));
const fmtPrecision = (value) => {
  if (value == null) return null;
  return Number.isInteger(value) ? String(value) : roundHalfEven(value, 1).toFixed(1);
};
const belowAbove = (word) => (word == null ? null : (word === 'raise' ? 'above' : 'below'));
const sentenceCase = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);

function basalHeadline(r) {
  if (r.register === 'blind') return BASAL_BLIND_HEADLINE;
  const supportN = (r.support || {}).n;
  const annotation = sentenceCase(r.annotation || '');
  const current = r.current;
  const estimateValue = (r.estimate || {}).value;
  if (current != null && estimateValue != null) {
    return `Delivered ${fmtUh(estimateValue)} U/h across ${supportN} steady `
      + `nights against ${fmtUh(current)} programmed. ${annotation}.`;
  }
  // A merged run names no single programmed rate, and a slot with no
  // delivered estimate (a harm-forced move on zero clean nights) has nothing
  // to set against the programmed rate either — both read only the row's own
  // served direction or lean and the steady-night count.
  if (r.register === 'assert') {
    const word = belowAbove(r.direction);
    return `Delivered ${word} the programmed rate across ${supportN} steady `
      + `nights. ${annotation}.`;
  }
  const lean = r.lean;
  if (lean == null) {
    return `${supportN} steady nights delivered so far. ${annotation}.`;
  }
  const word = belowAbove(lean);
  return `Delivered ${word} the programmed rate across ${supportN} steady `
    + `nights. ${annotation}.`;
}

function isfHeadline(r) {
  // Every slot is a row field (`support.n`, `current`, `estimate.value`,
  // `annotation`, `reason`) — the ISF rest-window evidence is never a
  // source, so this reads only the row, like every other family.
  const supportN = (r.support || {}).n;
  const current = fmtPrecision(r.current);
  if (r.register === 'assert') {
    const estimateValue = fmtPrecision((r.estimate || {}).value);
    const annotation = sentenceCase(r.annotation || '');
    return `Measured 1 U : ${estimateValue} mg/dL across ${supportN} fasting `
      + `nights against 1 U : ${current} mg/dL programmed. ${annotation}.`;
  }
  const reason = r.reason || '';
  return `${supportN} fasting nights measured against 1 U : ${current} `
    + `mg/dL programmed, but ${reason}. No direction is called.`;
}

function icHeadline(r) {
  const supportN = (r.support || {}).n;
  const current = fmtPrecision(r.current);
  const estimateValue = fmtPrecision((r.estimate || {}).value);
  if (r.register === 'assert') {
    const annotation = sentenceCase(r.annotation || '');
    return `Measured ${estimateValue} g/U across ${supportN} meal runs `
      + `against ${current} programmed. ${annotation}.`;
  }
  const rawReason = r.reason || '';
  const reason = rawReason.endsWith(HELD_AT_CURRENT_SUFFIX)
    ? rawReason.slice(0, -HELD_AT_CURRENT_SUFFIX.length) : rawReason;
  return `Measured ${estimateValue} g/U across ${supportN} meal runs `
    + `against ${current} programmed. Held at current: ${reason}.`;
}

function findingHeadline(r) {
  // findRows in this mirror never publishes a row without an appearance
  // (transcribed from `_finding_rows`'s `by_lever` construction), so this
  // is never null.
  const appearance = r.appearances[0];
  const rankClause = RANKING_TIERS.has(r.tier)
    ? ', and ranks' : ', not often enough to rank yet';
  return `Showed up in ${appearance.n} of ${appearance.m} ${appearance.noun} `
    + `in this window${rankClause}.`;
}

function historyHeadline(r) {
  const estimateValue = fmtPrecision((r.estimate || {}).value);
  const support = r.support;
  const pastSetting = fmtPrecision(r.past_setting);
  const programmedNow = fmtPrecision(r.programmed_now);
  const regimeEnd = r.regime_end;
  const regimeEndDate = regimeEnd ? regimeEnd.split('T')[0] : regimeEnd;
  return `Measured ${estimateValue} g/U across ${support} meal runs while `
    + `${pastSetting} was programmed, until ${regimeEndDate}. Programmed `
    + `now: ${programmedNow}.`;
}

function headlineFor(r) {
  if (r.kind === 'habit') return findingHeadline(r);
  if (r.register === 'history') return historyHeadline(r);
  if (r.parameter === 'basal_rate') return basalHeadline(r);
  if (r.parameter === 'isf') return isfHeadline(r);
  if (r.parameter === 'carb_ratio') return icHeadline(r);
  throw new Error(`no headline template for parameter ${r.parameter}`);
}

function selection(analysis, query, selectedId) {
  if (selectedId == null) return null;
  const history = (analysis.ic_history || []).find((row) => row.id === selectedId);
  if (!history) throw new Error('unknown history identity in fixture mirror');
  let disposition;
  let message = null;
  if (history.lifecycle === 'active') {
    const inScope = !query.scoped
      || overlaps(segments(history.block_start_min, history.block_end_min), query.pieces);
    disposition = inScope ? 'present' : 'out_of_scope';
    if (!inScope) message = 'Past-setting evidence is outside the selected window.';
  } else if (history.lifecycle === 'aged_out') {
    disposition = 'aged_out';
    message = 'Past-setting evidence aged out of the 90-day window.';
  } else {
    disposition = 'unavailable';
    message = 'Past-setting evidence no longer maps to one current program block.';
  }
  return { id: selectedId, disposition, message };
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
    r.register === 'history' && r.regime_end ? -Date.parse(r.regime_end) : 0,
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
export function projectFindings(inputs, bounds = null, selectedId = null) {
  const analysis = inputs.analysis || {};
  const exposures = inputs.exposures || {};
  const scenarios = inputs.scenarios || {};
  const query = windowQuery(bounds);
  let rows = [...basalRows(analysis, query.pieces), ...icRows(analysis, query.pieces),
    ...isfRows(analysis)];
  // the GLOBAL queue is asserting-only: a quiet parameter is never listed and never
  // named (term 38)
  if (!query.scoped) rows = rows.filter((r) => r.register === 'assert');
  rows = [...rows, ...findingRows(exposures, scenarios, query),
    ...historyRows(analysis, query)];
  rows.sort(compare);
  for (const row of rows) {
    if (row.priority == null) row.tier = 'noted';
    else if (row.register === 'assert') row.tier = 'next_in_line';
    else row.tier = 'worth_a_look';
  }
  for (const row of rows) {
    row.headline = headlineFor(row);
  }
  const counts = { assert: 0, held: 0, blind: 0, finding: 0, history: 0 };
  const chip_counts = { highs: 0, lows: 0, meals: 0, corrections: 0 };
  for (const r of rows) {
    counts[r.register] += 1;
    for (const chip of r.chips) chip_counts[chip] += 1;
  }
  /* findings_projection._uncaused_highs — WHOLE-WINDOW, never scoped by the query.
     A clock scope narrows which rows show; it does not change how many highs the
     engine explained nothing about, and re-counting it per window would let an empty
     scope read as "0 highs had no cause". Read off the exposures rollup, which counts
     it episode-wise; nothing is re-derived here. */
  const uncaused = exposures.exposures?.highs?.uncaused || 0;
  return {
    schema: SCHEMA,
    analysis_generation: inputs.analysis_generation || 'standalone:0',
    window: query.dict,
    findings_window: { days: analysis.window_days ?? null, ...(exposures.window || {}) },
    rows,
    selection: selection(analysis, query, selectedId),
    counts,
    chip_counts,
    uncaused_highs: { count: uncaused, text: uncaused ? uncausedHighsCopy(uncaused) : null },
  };
}

/** Fixture-only mirror of IcHistoryEventProjection over frozen synthetic inputs. */
export function projectIcHistoryEvents(inputs, historyId, selectedRunId = null) {
  const history = (inputs.catalog || []).find((row) => row.id === historyId);
  if (!history || history.lifecycle !== 'active') {
    throw new Error('history event fixture identity is not active');
  }
  const runIds = (history.runs || []).map((run) => run.run_id);
  if (selectedRunId != null && !runIds.includes(selectedRunId)) {
    throw new Error('history event fixture run is not a member');
  }
  const readings = (inputs.readings || []).map((row) => ({ ...row, at: new Date(row.t) }));
  const series = (history.runs || []).map((run) => {
    const mealAt = new Date(run.first_member_at);
    const lower = new Date(mealAt.getTime() + run.cgm_start_min * 60000);
    const upper = new Date(mealAt.getTime() + run.cgm_end_min * 60000);
    const points = readings.filter((row) => lower <= row.at && row.at <= upper)
      .map((row) => ({ minute: (row.at - mealAt) / 60000, bg: row.bg }));
    return { ...run, meal_at: run.first_member_at, points };
  });
  return {
    schema: 'diagnose-carb-ratio-history-events-v1',
    analysis_generation: inputs.analysis_generation,
    history_id: historyId,
    window_days: 90,
    run_ids: runIds,
    selected_run_id: selectedRunId,
    series,
  };
}
