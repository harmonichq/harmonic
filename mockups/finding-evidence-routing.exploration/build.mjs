/* Build the exploration mockup's data and its extracted app chrome.
 *
 * ZERO HAND-TYPED DATA. Every number, label and sentence this emits is read
 * from one of the two authorized fixtures and passed through the SHIPPED
 * producer that owns it:
 *
 *   frontend/__fixtures__/findings-projection.json
 *     -> frontend/diagnose-findings-queue.js  (queueRows / queueMeta / FLAVOR)
 *          the queue level's rows, the clicked row's flavor tag and detail line
 *     -> frontend/diagnose-workstation-chart.js (buildSlotLane / cellAtMinute)
 *          the basal slot the finding's busiest hour band lands in
 *
 *   mockups/diagnose-event-comparison.synthetic/capture.json
 *     -> mockups/diagnose-event-comparison.synthetic/project.mjs
 *          (projectSyntheticCapture) — cohorts, per-point support, occurrence
 *          verdicts, routing, and each event's own observed trace, projected
 *          TWICE: filtered to the finding (3 cohorts) and unfiltered (4).
 *     -> frontend/diagnose-workstation-chart.js (clockBuckets)
 *          which two-hour band the fired anchors fall in, for the coincidence
 *          sentences. The histogram itself is GONE (round 2, item 4) — only the
 *          binning survives, as the sentence's own arithmetic.
 *
 * THE TWO FIXTURES HOLD DISJOINT SYNTHETIC POPULATIONS (issue #31 resolution,
 * term 5): the projection's Over-treated low row claims 1 episode over
 * 2026-07-18..08-17; the lens capture holds 20 lows over 2026-07-13..08-11, 7
 * of which the over_treated_low rule matched. They are NOT reconciled here.
 * The scope chip prints the projection's own count (the number the clicked
 * queue row promised); the canvas and the occurrences table render the lens's
 * event set; the cohort counts live in the lens legend. Each number is stamped
 * with the fixture it came from in `data.provenance` so the render cannot
 * quietly borrow one for the other.
 *
 * ROUND 3 — BROWSING KEEPS THE FACTOR COMPARISON. The population case file is no
 * longer one unfiltered four-cohort draw over a flat list. Its claim split (the
 * lines that say who claims these lows) IS the factor selector, and each claim
 * line carries a whole FRAME: the lens projected for THAT factor — the same
 * three-cohort coordinate set the finding drill uses — plus that factor's own
 * regrouping of the browse population. Nothing new is drawn: `canvasFor` and
 * `traceMap` are the round-1/2 functions, called with different coordinates.
 *
 * ROUND 4 — the round-3 `No finding claims these` line and its canvas-less frame
 * are GONE (item 4). project.mjs projects cohorts for a NAMED FACTOR and has no
 * unclaimed coordinate, so that line selected a frame that drew no comparison;
 * and its ten rows were the selected factor's own Near rule and Rule did not
 * match groups a second time, since a low no factor claims is still a low every
 * factor placed in a cohort. The count survives in the population summary
 * sentence, which is where it was already printed.
 *
 * ROUND 2, ITEM 5 — THE POPULATION ROWS ARE INVENTED BY THE RULING, NOT BY A
 * FIXTURE. `Lows · 20` / `Meals · 20` are the ruling's free-browse entry
 * (resolution point 3). No committed projection carries them: this build derives
 * each count from the LENS CAPTURE's own population denominator, which is a
 * different fixture, a different window and a different population from the
 * projection rows they sit under. Under the ruling they would be rows of the
 * server's findings projection; here they are stamped `derived: true` and their
 * detail line names the capture's window rather than the projection's 30 days,
 * so the seam between "the server said" and "this mock computed" stays visible.
 *
 * Run: node mockups/finding-evidence-routing.exploration/build.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { projectSyntheticCapture } from '../diagnose-event-comparison.synthetic/project.mjs';
import { queueRows, queueMeta, FLAVOR } from '../../frontend/diagnose-findings-queue.js';
import { buildSlotLane, cellAtMinute, clockBuckets, hhmm } from '../../frontend/diagnose-workstation-chart.js';
import { KIND, IDLE_TITLE, IDLE_DETAIL } from '../../frontend/watched-change-dock.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const FACTOR = 'over_treated_low';
const VIEW = 'lows';
const FINDING_ID = 'finding:over_treated_low';
const POPULATION_ID = 'population:lows';
/** diagnose-workstation.js's EVIDENCE_CAP — five rows, then the expander. */
const EVIDENCE_CAP = 5;

const readJson = async (path) => JSON.parse(await readFile(join(ROOT, path), 'utf8'));

/* ---------------------------------------------------------------- verbatim
   Copied from the shipped modules that do not export them. Each is a byte
   transcription with its source named, held honest by the option-level and
   computed-style diffs in harness.mjs — never a second source of truth. */

/** VERBATIM — diagnose-workstation.js `VERDICT_KEY`. */
const VERDICT_KEY = {
  up: 'suggests a raise', down: 'suggests a lower', hold: 'holds at current',
  insufficient: 'insufficient evidence', nodata: 'no clean data',
};

/** VERBATIM — diagnose-workstation.js `buildIcLane` (module-private there). */
function buildIcLane(blocks) {
  const cells = blocks.map((b) => {
    const wraps = b.end_min <= b.start_min;
    const current = b.current_values[0];
    let verdict;
    if (b.asserts_move) {
      if (b.direction === 'raise' || b.direction === 'lower') {
        verdict = b.direction === 'raise' ? 'up' : 'down';
      } else verdict = b.recommended > current ? 'up' : 'down';
    } else verdict = b.state === 'numeric' ? 'hold' : 'insufficient';
    return {
      id: b.block_id, label: b.label, verdict, wraps,
      startMin: b.start_min, endMin: b.end_min,
      span: `${hhmm(b.start_min)}–${hhmm(b.end_min)}`,
      spans: wraps ? [[b.start_min, 1440], [0, b.end_min]] : [[b.start_min, b.end_min]],
    };
  });
  return { cells };
}

/** VERBATIM — diagnose-workstation.js `icBlockAtMinute`. */
const icBlockAtMinute = (icLane, minute) =>
  icLane.cells.find((c) => c.spans.some(([a, b]) => minute >= a && minute < b)) || icLane.cells[0];

/** VERBATIM — diagnose-event-comparison.js `COHORTS` labels. */
const COHORT_LABEL = {
  fired: 'Rule matched', near_rule: 'Near rule',
  neutral: 'Rule did not match', another_factor: 'Another factor applies',
};

/** VERBATIM — diagnose-event-comparison.js `pointStateSummary`. */
function pointStateSummary(rows) {
  const counts = { supported: 0, limited: 0, withheld: 0 };
  for (const row of rows) counts[row.support] += 1;
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([support, count]) => `${count} ${support}`)
    .join(' · ');
}

/* ROUND 4 ITEM 5 — the transcription of diagnose-event-comparison.js's
   `summarySentence` is DELETED, not left unused. Its three numbers are the
   `.ec-count` tally's three cells, and the tally is what the scene prints; a
   transcription nobody calls is the next reader's wrong map. */

/** VERBATIM — diagnose-event-comparison.js `fmtDate` / `fmtTime`. */
const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtTime = (stamp) => stamp.slice(11, 16);

/** VERBATIM — diagnose-workstation.js `renderEvidence`'s numeric-cell rule. */
function evidenceCells(anchor) {
  const worst = anchor.worst_bg != null ? Math.round(anchor.worst_bg) : null;
  const entry = anchor.bg != null ? Math.round(anchor.bg) : null;
  const both = entry != null && worst != null && entry !== worst;
  if (!both) return { both: false, only: worst ?? entry ?? '—' };
  return {
    both: true, entry, worst,
    delta: `${worst - entry > 0 ? '+' : '−'}${Math.abs(worst - entry)}`,
  };
}

/* -------------------------------------------------------------------- build */

/** One canvas payload: the cohort medians, their support tiers and the legend.
 *
 * ROUND 3 — unchanged from round 1 except that the trace map moved up to the
 * SCENE (a scene's frames share one set of observed traces, and duplicating them
 * per frame would triple data.json for no new fact). surface.js hands
 * `scene.traces` to this payload at load; `chart.js` reads `canvas.traces`
 * exactly as before. */
function canvasFor(lens) {
  return {
    title: 'Low response comparison',
    /* ROUND 4 ITEM 2 — the hue an overlaid occurrence trace draws in. */
    cohortOf: cohortMap(lens.occurrences),
    context: 'excursion nadir · −5 h to +2 h',
    alignmentWindow: lens.coordinates.alignment_window_min,
    axisAnchor: 'low',
    cohortOrder: lens.cohorts.map((c) => c.key),
    cohorts: Object.fromEntries(lens.cohorts.map((c) => [c.key, {
      key: c.key,
      label: COHORT_LABEL[c.key],
      support: c.support,
      supportWord: c.support[0].toUpperCase() + c.support.slice(1),
      routed_count: c.routed_count,
      /* ROUND 4 ITEM 7 — the clauses are bound with non-breaking spaces. The
         line is a list of "N word" facts separated by `·`, and at 1440 it broke
         between a number and its word ("· 2 / withheld points"), which reads as
         two facts where there is one. Binding inside each clause leaves the line
         free to wrap at the separators, which is where it actually divides. */
      legendDetail: (c.support === 'withheld'
        ? `${c.routed_count} ${c.routed_count === 1 ? 'event' : 'events'} · aggregate not shown`
        : `${c.routed_count} events · ${pointStateSummary(c.points)} points`)
        .replace(/(\d+) (\S+)/g, '$1\u00a0$2')
        .replace(/(withheld|limited|supported) (points)/g, '$1\u00a0$2'),
      points: c.points,
    }])),
    traces: null,
  };
}

/** The cohorts a factor's frame regroups its table into — the lens's own three
    visible cohorts, in the lens's own order, so the table's groups and the
    canvas's medians are the same three things. */
const GROUP_ORDER = ['fired', 'near_rule', 'neutral'];

/** The causal phrase a group header carries beside the shipped cohort label.
    `fired` and `near_rule` are the two the FACTOR's rule defines, so they name
    it; `neutral` is defined by its absence and says so in the lens's own words
    (`summarySentence`: "did not match any factor"). */
const GROUP_PHRASE = {
  fired: (label) => label,
  near_rule: (label) => `${label}, disclosure only`,
  neutral: () => 'matched no factor’s rule',
};

const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** ROUND 4 ITEM 9 — a row does not repeat what its group header already said.
 *
 * On both fixtures every group is uniform in its right-hand tag ("observed" ×7
 * under a header that reads "observed, not confirmed"; "Rule matched" ×7 under a
 * header that reads "Rule matched"), so the column was printing the group's own
 * sentence once per row. This blanks the cell for exactly that case — the tag is
 * identical across the group AND the header already carries the word — and
 * leaves it alone anywhere a row differs from its group, which is the only case
 * the column was ever for. The shipped `.ev-row` grid column stays, so the
 * numeric spine does not move.
 */
function dedupeGroupTags(groups) {
  return groups.map((group) => {
    const values = new Set(group.rows.map((r) => r.tag ?? r.tier ?? ''));
    if (values.size !== 1) return group;
    const [only] = values;
    const header = `${group.lead} ${group.phrase || ''}`.toLowerCase();
    if (!only || !header.includes(only.toLowerCase())) return group;
    return { ...group, rows: group.rows.map((r) => ({ ...r, tag: '', tier: '' })) };
  });
}

/** ROUND 4 ITEM 2 — which cohort each listed occurrence belongs to under the
    frame's own factor. The trace overlay draws in ITS COHORT'S hue rather than
    in one universal focus ink, so the anecdote can never outrank the aggregate
    it sits inside. Read off the projector's own per-occurrence verdict. */
const cohortMap = (occurrences) => Object.fromEntries(
  occurrences.map((o) => [o.identity.id, o.verdict.cohort]),
);

/** Every listed occurrence's own observed trace, one projection per selection. */
function traceMap(capture, ids, coords) {
  const traces = {};
  for (const id of ids) {
    const one = projectSyntheticCapture(capture, { ...coords, occurrenceId: id });
    if (one.selection.state !== 'selected') throw new Error(`projector would not select ${id}`);
    traces[id] = one.selection.detail.glucose.map((p) => [p.minute, p.bg]);
  }
  return traces;
}

async function main() {
  const projection = await readJson('frontend/__fixtures__/findings-projection.json');
  const capture = await readJson('mockups/diagnose-event-comparison.synthetic/capture.json');

  /* ---- level 1: the ranked queue, handed to the SHIPPED renderer whole ---- */
  const globalWindow = projection.windows.global;
  const rows = queueRows(globalWindow);
  const row = rows.find((r) => r.id === FINDING_ID);
  if (!row) throw new Error(`${FINDING_ID} is not in the projection's global window`);
  if (row.detail.kind !== 'appearances') throw new Error(`unexpected detail kind ${row.detail.kind}`);
  const raw = row.raw;

  /* Term 9 — the chip carries the CLICKED FILTER's own count, which is the
     projection row's episode count, and nothing from the lens. */
  const chipCount = raw.episodes;
  if (!Number.isInteger(chipCount)) throw new Error('projection row carries no episode count');

  /* ---- the lens, twice: filtered to the finding, and unfiltered ---- */
  const coords = { view: VIEW, factor: FACTOR, block: 'all' };
  const lens = projectSyntheticCapture(capture, coords);
  const wide = projectSyntheticCapture(capture, { ...coords, another: true });
  const cohortByKey = Object.fromEntries(lens.cohorts.map((c) => [c.key, c]));
  const fired = cohortByKey.fired;
  const firedOccurrences = lens.occurrences.filter((o) => fired.occurrence_ids.includes(o.identity.id));
  if (firedOccurrences.length !== fired.routed_count) throw new Error('fired cohort membership drift');

  /* ---- the coincidence sentences, off the projection's own analysis inputs ---- */
  const clock = clockBuckets(firedOccurrences.map((o) => ({ t: o.anchor.t })));
  const lane = buildSlotLane(projection.inputs.analysis.basal);
  const icLane = buildIcLane(projection.inputs.analysis.ic_blocks);
  const cell = cellAtMinute(lane, clock.peak.startMin);
  const block = icBlockAtMinute(icLane, clock.peak.startMin);
  const band = `${hhmm(clock.peak.startMin)}–${hhmm(clock.peak.endMin)}`;

  /* ---- who claims each low ----
     A low is CLAIMED by a finding when one of the view's factors routes it to
     `fired`. That is read off the capture's `routes`, the same signal the
     projector routes cohorts on. In round 2 this stamped a per-row tag; in
     round 3 it does two things instead — it tallies the CLAIM SPLIT (which is
     now the factor selector), and it decides which lows the unclaimed frame
     lists. Row tags come from the selected factor's own cohort membership. */
  const lowsView = capture.views[VIEW];
  const factorLabel = Object.fromEntries(
    lens.coordinates.factor_options.map((o) => [o.key, o.label]),
  );
  const claimantOf = (id) => {
    const source = lowsView.occurrences.find((o) => o.id === id);
    return lowsView.factors.find((f) => source.routes[f]?.cohort === 'fired') || null;
  };
  const occurrenceRow = (o) => ({
    id: o.identity.id,
    when: `${fmtDate(o.anchor.date)} · ${fmtTime(o.anchor.t)}`,
    tier: o.verdict.evidence_tier?.replaceAll('_', ' ') || 'unclassified',
    title: o.verdict.detail || '',
    ...evidenceCells(o.anchor),
  });

  const windowLabel = `${fmtDate(lens.coordinates.source_window.start)}–${fmtDate(lens.coordinates.source_window.end)}`;

  /* ---- the population summary, off the unfiltered projection's counts ---- */
  const claims = {};
  for (const o of wide.occurrences) {
    const claimant = claimantOf(o.identity.id);
    if (claimant) claims[claimant] = (claims[claimant] || 0) + 1;
  }
  const claimed = Object.values(claims).reduce((sum, n) => sum + n, 0);
  const unclaimedIds = wide.occurrences
    .map((o) => o.identity.id).filter((id) => !claimantOf(id));

  /* ---- ROUND 3: one FRAME per claim line ----
     A claiming factor's frame is the lens at that factor's own coordinates —
     the same three-cohort projection the finding drill draws — plus the browse
     population regrouped into that factor's cohorts. Every listed low in the
     view appears in every factor's frame; what changes is which cohort claims
     it and which lows the factor cannot compare at all. */
  const frameFor = (factorKey) => {
    const coordsFor = { view: VIEW, factor: factorKey, block: 'all' };
    /* ONE projection per frame, at the factor's own coordinates — the same three
       visible cohorts the finding drill draws. The table is grouped from THIS
       projection, not from a wider one: a table group the canvas has no cohort
       for would be a fourth frame the comparison cannot answer. Lows the factor
       cannot place — another factor's, and the not-comparable — are counted in
       the frame's counter-note instead, exactly as the finding case file counts
       everything outside its own fired cohort. */
    const narrow = projectSyntheticCapture(capture, coordsFor);
    const label = factorLabel[factorKey];
    const rows = narrow.occurrences.map((o) => ({
      ...occurrenceRow(o), tag: COHORT_LABEL[o.verdict.cohort],
    }));
    const groups = GROUP_ORDER
      .map((key) => ({
        key,
        lead: COHORT_LABEL[key],
        phrase: GROUP_PHRASE[key](label),
        rows: narrow.occurrences
          .filter((o) => o.verdict.cohort === key)
          .map((o) => rows.find((r) => r.id === o.identity.id)),
      }))
      .filter((g) => g.rows.length)
      .map((g) => ({ ...g, count: `· ${plural(g.rows.length, 'event')}` }));
    return {
      key: factorKey,
      canvas: canvasFor(narrow),
      /* ROUND 4 ITEM 5 — the near-rule hedge is no longer a per-frame paragraph.
         It is one low-ink line, printed ONCE at the scene, below the tally that
         is the actual data. */
      /* The sideways route into the finding's own case file. It resolves only
         into a case file this exploration actually built: `correction_on_iob`
         has neither a projection row nor a scene, so its line SAYS the route is
         missing rather than offering a button nothing answers. */
      route: factorKey === FACTOR
        ? { text: `${label} is a finding in the queue.`, label: 'Open case file', target: FINDING_ID }
        : { text: `${label} has no case file in this exploration.`, label: null, target: null },
      occurrences: {
        cap: EVIDENCE_CAP,
        capMeta: `entry → worst · Δ &nbsp;·&nbsp; ${rows.length} of ${narrow.population.denominator} in ${windowLabel}`,
        counterNote: `${narrow.population.counts.another_factor} claimed by another factor `
          + `· ${narrow.population.counts.excluded} not comparable under this rule`,
        moreLabel: rows.length > EVIDENCE_CAP ? `${rows.length - EVIDENCE_CAP} more` : null,
        backLabel: `Show first ${EVIDENCE_CAP}`,
        groups: dedupeGroupTags(groups),
      },
    };
  };

  /* ROUND 4 ITEM 4 — THE UNCLAIMED TIER LEAVES THE SELECTOR. Round 3 gave it a
     claim line and a canvas-less frame; the operator's ruling is that a
     selectable tier drawing no comparison does not belong in a selector, and a
     second look at the fixture says the frame was also redundant. Under
     `over_treated_low` the unclaimed ten ARE that frame's Near rule (4) and Rule
     did not match (6) groups, row for row — every low a factor cannot claim is
     still a low that factor placed in a cohort. So a disclosure revealing "the
     unclaimed rows" below the factor groups would re-list rows already on
     screen under a second name. The count stays in the summary sentence, and
     `unclaimedIds` is retained only to compute it. */
  const claimOrder = Object.entries(claims).sort(([, a], [, b]) => b - a).map(([key]) => key);
  const frames = Object.fromEntries(claimOrder.map((key) => [key, frameFor(key)]));
  const claimLines = claimOrder.map((key) => ({
    key, label: factorLabel[key], count: claims[key],
  }));

  /* ---- the second population row's count, same producer, meals view ---- */
  const mealsView = capture.views.meals;
  const meals = projectSyntheticCapture(capture, {
    view: 'meals', factor: mealsView.default_factor, block: 'all', another: true,
  });

  const data = {
    _generated_by: 'mockups/finding-evidence-routing.exploration/build.mjs',
    _note: 'SYNTHETIC. Derived from two committed synthetic fixtures through their shipped '
      + 'producers; nothing here is hand-written. Regenerate with `node '
      + 'mockups/finding-evidence-routing.exploration/build.mjs`.',

    provenance: {
      queue_rows: 'frontend/__fixtures__/findings-projection.json (windows.global) — handed WHOLE to the '
        + 'shipped renderFindingsQueue, which paints it',
      chip_and_subject: 'frontend/__fixtures__/findings-projection.json (windows.global, row finding:over_treated_low)',
      coincidence: 'frontend/__fixtures__/findings-projection.json (inputs.analysis.basal, inputs.analysis.ic_blocks)',
      canvas_and_table: 'mockups/diagnose-event-comparison.synthetic/capture.json via project.mjs (view lows, factor over_treated_low)',
      population_rows: 'DERIVED BY THIS BUILD, not read from any fixture. The ruling (resolution point 3) '
        + 'invents standing population rows as a NEW SERVER PROJECTION; no committed projection carries them '
        + 'yet. Their counts are the lens capture\'s own population denominators (lows via project.mjs, meals '
        + 'via the same producer on the meals view), so they name the CAPTURE\'s window, not the projection\'s '
        + '30 days.',
      population_case_file: 'mockups/diagnose-event-comparison.synthetic/capture.json via project.mjs — ONE '
        + 'PROJECTION PER CLAIMED FACTOR (view lows, factor <k>, block all) for that frame\'s canvas, and the '
        + 'same coordinates with another=true for its regrouped table. The claim split itself is a tally of '
        + 'the capture\'s `routes`: a low is claimed when some factor routes it to `fired`.',
      unclaimed: 'NOT A FRAME AND NOT A SELECTOR LINE (round 4, item 4). project.mjs projects cohorts for a '
        + 'NAMED FACTOR and has no unclaimed coordinate, so the round-3 `No finding claims these` line selected '
        + 'a frame that drew no comparison. It is also redundant: under `over_treated_low` the ten unclaimed '
        + 'lows ARE that frame\'s Near rule (4) and Rule did not match (6) groups, row for row, because a low no '
        + 'factor claims is still a low every factor placed in a cohort. The count survives only inside the '
        + 'population summary sentence.',
      unreachable_factor: 'correction_stacking is a factor of the lows view and fires on NOTHING in this '
        + 'capture, so it claims no low and the claim split — which is the selector — never offers it. No '
        + 'frame exists for it.',
      disjoint: 'The two populations are disjoint by construction and are never reconciled.',
    },

    /* ---------- level 1: the ranked queue ---------- */
    queue: {
      /* The projection window itself, verbatim: surface.js hands this straight
         to the shipped `renderFindingsQueue`, so the queue level is the app's
         own painter over the app's own fixture, not a transcription of it. */
      projection: globalWindow,
      /* The crumb root, and at level 1 the whole path (old term 4). */
      root: 'Findings',
      meta: queueMeta(globalWindow),
      /* NOT IN ANY FIXTURE — see `provenance.population_rows`.
         ROUND 4 ITEM 13 — named in CONTEXT.md's own words. "Browse everything /
         All lows / All meals" named an ACTIVITY and then restated "all" on every
         row. CONTEXT.md already has the noun for what these rows are: an
         **Exposure population** is "a lever's entire Exposure denominator,
         occurrence by occurrence — all the lows behind an over-treated-low
         lever, not just the ones it attributed", and it is "the n in every
         'k of n' recurrence rate". The rows directly above print exactly those
         k-of-n fractions ("1 of 4 lows"), so this section is literally the n
         they were counted against. Rows take the bare population noun and the
         count becomes the accessory, which is also what removes the doubled
         "All … / N lows". */
      populationCap: 'Exposure populations',
      populationRows: [
        {
          id: POPULATION_ID, derived: true, title: 'Lows', drills: true,
          count: wide.population.denominator, window: windowLabel,
        },
        {
          id: 'population:meals', derived: true, title: 'Meals', drills: false,
          count: meals.population.denominator, window: windowLabel,
        },
      ],
    },

    /* ---------- the dock floor, idle ---------- */
    dock: { kind: KIND.idle, title: IDLE_TITLE, detail: IDLE_DETAIL },

    /* ROUND 4 ITEM 1 — THE QUEUE LEVEL HAS NO CANVAS PAYLOAD AT ALL. Round 3
       gave it a title, a context string and an apology paragraph, which the
       surface then painted as a POOLED GLUCOSE header over 1010px of empty
       ground. The queue IS the app at that level, so the canvas pane is not
       rendered and there is nothing here for it to render. */

    /* ================= the two drilled scenes ================= */
    scenes: {
      [FINDING_ID]: {
        kind: 'finding',
        crumb: { root: 'Findings', here: raw.title },
        /* ROUND 2 ITEM 3 — count only. The name prints in the crumb, once. */
        chip: {
          text: `${chipCount} ${chipCount === 1 ? 'event' : 'events'}`,
          title: 'Clear this filter and return to Findings',
        },
        /* The subject strip: the flavor tag and the appearance denominators,
           WITHOUT the title — the crumb directly above owns the name. */
        subject: {
          flavor: row.flavor,
          flavorWord: FLAVOR[row.flavor].word,
          flavorGlyph: FLAVOR[row.flavor].glyph,
          appearances: row.detail.parts,
        },
        judgment: {
          /* ROUND 4 ITEM 5 — THE TALLY IS THE DATA; THE PROSE IS THE REMAINDER.
             Round 3 printed the lens's `summarySentence` ("7 events met this
             factor's rule. 4 sat narrowly outside it. 6 comparable events did
             not match any factor.") as a three-line paragraph and then printed
             the SAME three numbers again, tabular and support-stamped, in the
             `.ec-count` tally directly beneath it. The tally wins: it carries
             the support word the sentence cannot. What survives here is only
             the residue — the two counts the tally has no cell for. The shipped
             `summarySentence` is therefore no longer called; the numbers it
             composed are the tally's, from the same `lens.population.counts`. */
          summary: `${lens.population.counts.another_factor} had another factor; `
            + `${lens.population.counts.excluded} of ${lens.population.denominator} lows were excluded as not safely comparable.`,
          counts: ['fired', 'near_rule', 'neutral'].map((key) => ({
            key,
            n: lens.population.counts[key],
            label: COHORT_LABEL[key],
            support: cohortByKey[key].support[0].toUpperCase() + cohortByKey[key].support.slice(1),
          })),
        },
        /* ROUND 4 ITEM 5 — one low-ink line, at the scene, printed once. The
           `<b>` lead is gone with the paragraph: bolding the first clause is
           what gave a footnote body weight. */
        boundaryNote: 'Near rule is disclosure only — it never enters Priority, a suggestion, or Plan.',
        /* ROUND 2 ITEM 4 — the histogram is gone. These sentences stand on their
           own arithmetic: the busiest two-hour band, and what covers it. The
           band's own share is printed against the total, because on this fixture
           the busiest band holds 1 of 7 and calling that a concentration would
           be a claim the data does not make. */
        coincidence: {
          share: `Busiest two-hour band: ${band}, ${clock.peak.n} of ${clock.total} events.`,
          slotText: `That band sits in the ${cell.label} basal slot (${VERDICT_KEY[cell.verdict]})`,
          blockText: `and in the ${block.label} I:C block, ${block.span} (${VERDICT_KEY[block.verdict]})`,
        },
        occurrences: {
          cap: EVIDENCE_CAP,
          capMeta: `entry → worst · Δ &nbsp;·&nbsp; ${firedOccurrences.length} of ${lens.population.denominator} in ${windowLabel}`,
          counterNote: null,
          moreLabel: firedOccurrences.length > EVIDENCE_CAP ? `${firedOccurrences.length - EVIDENCE_CAP} more` : null,
          backLabel: `Show first ${EVIDENCE_CAP}`,
          /* One group, unchanged from round 2 — the finding's own title, its
             evidence tier and its episode count. Round 3 only generalised the
             SHAPE to a list so the population's regrouped frames go through the
             same renderer. */
          groups: dedupeGroupTags([{
            key: 'fired',
            lead: raw.title,
            phrase: firedOccurrences[0]?.verdict.evidence_tier
              ? `${firedOccurrences[0].verdict.evidence_tier.replaceAll('_', ' ')}, not confirmed` : null,
            count: `· ${plural(firedOccurrences.length, 'episode')}`,
            rows: firedOccurrences.map(occurrenceRow),
          }]),
        },
        canvasHead: { title: 'Low response comparison', context: 'excursion nadir · −5 h to +2 h' },
        canvas: canvasFor(lens),
        traces: traceMap(capture, fired.occurrence_ids, coords),
      },

      [POPULATION_ID]: {
        kind: 'population',
        /* ROUND 4 ITEM 13 — the leaf is the population noun the queue row now
           carries, so the crumb and the row that opened it read the same. */
        crumb: { root: 'Findings', here: 'Lows' },
        /* Item 6 spells this one as the bare count. */
        chip: { text: String(wide.population.denominator), title: 'Clear this filter and return to Findings' },
        subject: null,
        judgment: {
          /* The population statement, and only what is true of the WHOLE
             population: how many, how many a finding claims, how many none
             does. The exclusion count moved OUT of it — exclusion is decided per
             rule (2 lows under Over-treated low, 6 under Correction on active
             insulin), so a single population-level exclusion sentence would be
             one factor's number wearing the population's clothes. Each frame's
             own counter-note carries it instead. */
          summary: `${wide.population.denominator} lows in ${windowLabel}. `
            + `${claimed} are claimed by a finding; ${unclaimedIds.length} match none.`,
          counts: null,
          /* ROUND 3 ITEM 1 — the claim split IS the factor selector. These lines
             were `.ec-count` cells in round 2; they are queue rows now, and
             selecting one reframes the canvas and the table below.
             ROUND 4 ITEM 4 — and the unclaimed residue is no longer one of them:
             its count is the second half of the summary sentence above, which is
             the only place it now prints. */
          claims: claimLines,
        },
        /* ROUND 4 ITEM 5 — the same one line, at the scene, printed once,
           instead of once per frame. */
        boundaryNote: 'Near rule is disclosure only — it never enters Priority, a suggestion, or Plan.',
        coincidence: null,
        defaultFactor: claimOrder[0],
        frames,
        canvasHead: { title: 'Low response comparison', context: 'excursion nadir · −5 h to +2 h' },
        /* One trace map for the whole scene: every low any frame lists, projected
           at the coordinates that make all of them selectable. */
        traces: traceMap(capture, wide.occurrences.map((o) => o.identity.id),
          { ...coords, another: true }),
      },
    },
  };

  await writeFile(join(HERE, 'data.json'), `${JSON.stringify(data, null, 1)}\n`);

  /* ---- extract the app's own base sheet, never transcribe it (lock.md 0.2) ---- */
  const indexHtml = await readFile(join(ROOT, 'frontend/index.html'), 'utf8');
  /* HTML comments come out FIRST. index.html carries the comment
     "…(extracted from this file's <style> in #100)", and matching `<style>`
     across the raw file starts the first capture inside that comment: the block
     then opens with stray markup, the CSS parser cannot recover until the second
     rule, and the whole light `:root` token block is silently dropped. That
     shipped as a mock whose dark theme was pixel-identical to the app and whose
     light theme had no tokens at all — caught only by rendering light. */
  const html = indexHtml.replace(/<!--[\s\S]*?-->/g, '');
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  if (!blocks.length) throw new Error('no <style> block found in frontend/index.html');
  /* Fail closed on the exact corruption above: the token block must be intact. */
  const joined = blocks.join('\n');
  for (const needle of [':root {', 'html.dark {', '--wk-canvas:', 'color-scheme: light']) {
    if (!joined.includes(needle)) throw new Error(`extracted app base is missing "${needle}" — extraction is corrupt`);
  }
  if (/<\/?(link|script|style|meta)\b/.test(joined)) {
    throw new Error('extracted app base contains markup — extraction is corrupt');
  }
  await writeFile(join(HERE, 'app-base.extracted.css'),
    '/* EXTRACTED VERBATIM from frontend/index.html\'s <style> blocks by\n'
    + ' * mockups/finding-evidence-routing.exploration/build.mjs. Do not edit —\n'
    + ' * re-run the build script. This carries the app\'s :root / html.dark token\n'
    + ' * block, its body ground and every base rule the shipped chrome inherits\n'
    + ' * from (including `label { margin: 0 0 5px }`, which the event-comparison\n'
    + ' * stylesheet adapts against).\n'
    + ` * Blocks extracted: ${blocks.length}\n */\n${blocks.join('\n')}\n`);

  const finding = data.scenes[FINDING_ID];
  const population = data.scenes[POPULATION_ID];
  process.stdout.write(
    `data.json written — queue: ${rows.length} projection rows + ${data.queue.populationRows.length} derived `
    + `population row(s) (${data.queue.populationRows.map((r) => `${r.title} ${r.count}`).join(', ')})\n`
    + `  finding scene — chip "${finding.chip.text}" (projection), ${finding.occurrences.groups[0].rows.length} `
    + `fired events (lens), busiest band ${band} ${clock.peak.n}/${clock.total}\n`
    + `  population scene — ${wide.population.denominator} lows, ${claimed} claimed / ${unclaimedIds.length} `
    + `unclaimed; ${Object.keys(population.frames).length} frames, default "${population.defaultFactor}"\n`
    + Object.values(population.frames).map((f) => `    frame ${f.key} — `
      + `${f.canvas ? `${f.canvas.cohortOrder.length} cohorts` : 'no canvas (empty state)'}, `
      + `${f.occurrences.groups.length} group(s), `
      + `${f.occurrences.groups.reduce((n, g) => n + g.rows.length, 0)} rows\n`).join('')
    + `app-base.extracted.css written — ${blocks.length} style block(s) from frontend/index.html\n`,
  );
}

await main();
