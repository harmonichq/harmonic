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
import { queueRows, queueMeta, FLAVOR, TAIL_NOTE } from '../../frontend/diagnose-findings-queue.js';
import {
  buildSlotLane, buildDayTrace, cellAtMinute, clockBuckets, hhmm,
} from '../../frontend/diagnose-workstation-chart.js';
import { KIND } from '../../frontend/watched-change-dock.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const FACTOR = 'over_treated_low';
const VIEW = 'lows';
const FINDING_ID = 'finding:over_treated_low';
const POPULATION_ID = 'population:lows';
/* ROUND 5, BLOCK 9 — THE FIXED FIVE IS GONE, so no cap is emitted at all. The
   occurrences table caps at rows that FIT, measured in the browser against the
   column's own remaining height (surface.js `fittingRows`), and the expander
   appears only on genuine overflow. `occurrences.cap`, `moreLabel` and
   `backLabel` no longer exist in data.json — a row budget is a geometry fact
   and cannot be decided here. */

/* ROUND 5, WORKSTREAM A — the queue root's canvas is the SHIPPED pooled glucose
   chart, so this build hands its fixture across raw and the surface runs the
   shipped builders on it in the browser, exactly as the app does. */
const PAYLOAD = 'mockups/diagnose-workstation.synthetic/payload.json';
/* ROUND 6, FORM 3 — the day traces the CLOCK projection lays over the pooled
   envelope when an event is drilled (amendment: "the day-trace overlay is KEPT
   as the clock projection's drill state"). This is the FOURTH committed
   synthetic fixture on this surface and it is disjoint from the other three
   again: three captured CGM days in 2020, against a lens capture of twenty lows
   in 2026. The join is stamped in `provenance.day_traces` and nothing pretends
   the day belongs to the event. */
const DAY_CAPTURE = 'mockups/diagnose-workstation.synthetic/explore-day.capture.json';
/** VERBATIM — diagnose-workstation.js `WINDOWS.all`, `winEdge`, and the
    `${LABEL.toUpperCase()} ${winText}` string it builds for a pressed preset. */
const ALL_DAY = { label: '24 h', range: [0, 1440] };
const winEdge = (m) => (m === 1440 ? '24:00' : hhmm(m));

const readJson = async (path) => JSON.parse(await readFile(join(ROOT, path), 'utf8'));

/* ---- ROUND 7, ITEM 1: THE INSTRUMENT ROW'S TWO SHIPPED GROUPS ----
   The window-like toolbar STAYS (the operator's call — Verify carries the same
   row), so the mock draws the shipped row rather than retiring it. Its two
   groups are EXTRACTED from the shipped source at build time, never
   transcribed: `View` is diagnose-event-comparison.js's own `VIEWS` list,
   capitalised the way its `createViewInstrumentMarkup` capitalises it, and
   `Window` is diagnose-workstation.js's own `WINDOWS` map. Fails closed — an
   upstream rename stops the build instead of freezing a stale row into the
   mock. The two group captions are those modules' own markup strings. */
async function shippedInstruments() {
  const ec = await readFile(join(ROOT, 'frontend/diagnose-event-comparison.js'), 'utf8');
  const dw = await readFile(join(ROOT, 'frontend/diagnose-workstation.js'), 'utf8');
  const viewList = ec.match(/const VIEWS = \[([^\]]+)\]/);
  if (!viewList) throw new Error('diagnose-event-comparison.js no longer declares `const VIEWS = [...]`');
  const viewKeys = [...viewList[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  if (!viewKeys.length) throw new Error('diagnose-event-comparison.js `VIEWS` carries no view keys');
  if (!viewKeys.includes(VIEW)) throw new Error(`diagnose-event-comparison.js \`VIEWS\` has no "${VIEW}" view`);
  const winBlock = dw.match(/const WINDOWS = \{([\s\S]*?)\n\};/);
  if (!winBlock) throw new Error('diagnose-workstation.js no longer declares `const WINDOWS = {...}`');
  const winOptions = [...winBlock[1].matchAll(/(\w+): \{ label: '([^']+)'/g)]
    .map((m) => ({ key: m[1], label: m[2] }));
  if (!winOptions.length) throw new Error('diagnose-workstation.js `WINDOWS` carries no labelled presets');
  /* The mock stands on ONE window for as long as it stands — it has no drag and
     no preset behaviour to answer with — and that window is the 24 h preset the
     harness presses the app to before it compares the two pooled charts. Read
     out of the same map rather than named again here. */
  const standingWindow = winOptions.find((o) => o.label === ALL_DAY.label);
  if (!standingWindow) throw new Error(`diagnose-workstation.js \`WINDOWS\` has no "${ALL_DAY.label}" preset`);
  return {
    view: {
      label: 'View',
      options: viewKeys.map((key) => ({ key, label: `${key[0].toUpperCase()}${key.slice(1)}` })),
      standing: VIEW,
    },
    window: { label: 'Window', options: winOptions, standing: standingWindow.key },
  };
}

/* ---- ROUND 8, ITEM 1: THE OCCURRENCE TABLE IS THE PRODUCTION ONE ----
   The operator's ruling: "Production table everywhere. Steal that." Rounds 2-7
   painted their own — `rowMarkup` transcribed the shipped row's spine,
   `occurrenceTable` invented the grouping and the budget, `dedupeGroupTags`
   blanked the tier column, and `.fer-group` replaced the shipped group header
   with a hairline rule. All four are DELETED, not kept beside the real thing.

   What replaces them is `renderEvidence` itself, lifted out of
   frontend/diagnose-workstation.js at build time exactly the way the toolbar's
   two standing groups are — the function is module-private there, so there is
   no export to import, and a transcription is the one thing this ruling
   forbids. Extraction fails closed: an upstream rename stops the build rather
   than freezing a stale copy of the production table into the mock.

   It brings its own row budget (`EVIDENCE_CAP` and its two-way expander), its
   own group headers and its own `unclassified` tier word with it. That is the
   point — the mock now shows what the shipped table actually does over this
   fixture, quirks included, instead of a prettier thing only the mock has. */
async function shippedEvidenceTable() {
  const path = 'frontend/diagnose-workstation.js';
  const dw = await readFile(join(ROOT, path), 'utf8');
  const grab = (name, re) => {
    const m = dw.match(re);
    if (!m) throw new Error(`${path} no longer declares \`${name}\` in the shape this build extracts`);
    return m[0];
  };
  const cap = grab('EVIDENCE_CAP', /^const EVIDENCE_CAP = \d+;$/m);
  const fmt = grab('fmtDate', /^const fmtDate = [\s\S]*?;$/m);
  const tier = grab('tierOf', /^function tierOf\(occ\) \{[\s\S]*?\n\}$/m);
  const render = grab('renderEvidence', /^function renderEvidence\([\s\S]*?\n\}$/m);
  /* The three things the fidelity comparison hangs off. If the shipped painter
     ever stops emitting them the mock's table is no longer the app's, and the
     build says so here rather than in a screenshot nobody re-reads. */
  for (const needle of ["className = 'ev-row'", 'class="ev-group"', "className = 'more'"]) {
    if (!render.includes(needle)) {
      throw new Error(`extracted \`renderEvidence\` no longer emits ${needle} — extraction is corrupt`);
    }
  }
  return `/* EXTRACTED VERBATIM from ${path} by\n`
    + ' * mockups/finding-evidence-routing.exploration/build.mjs. Do not edit —\n'
    + ' * re-run the build script.\n'
    + ' *\n'
    + ' * This IS the production Diagnose evidence table: its group headers, its\n'
    + ' * seven-column rows, its five-row cap and two-way expander, its tier word.\n'
    + ' * The exploration draws no table of its own (round 8, item 1). The only\n'
    + ' * edits are the three `export` keywords, so the surface can import it and\n'
    + ' * split a group the same way it does (`tierOf` decides fits from counter).\n'
    + ' */\n'
    + `${cap.replace(/^const /, 'export const ')}\n\n`
    + `${fmt}\n\n${tier.replace(/^function /, 'export function ')}\n\n`
    + `${render.replace(/^function /, 'export function ')}\n`;
}

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

/* ================== ROUND 9, FINDING 1: THE VOICE PASS ==================
 *
 * The ONLY authored strings in this build, and they are authored because
 * DESIGN.md §"Voice and user-copy register" requires exactly these words. The
 * grounding invariant is about DATA — every number, population and denominator
 * still comes from a fixture through its shipped producer, and nothing below
 * invents or reshapes one. What these rules change is how an already-derived
 * fact is SPELLED.
 *
 * Each entry names the rule it satisfies. A rule with no violation left in the
 * fixtures fails the build rather than sitting here rotting, so a later fixture
 * that reintroduces the old spelling cannot slip past silently.
 *
 * WHAT THIS PASS DELIBERATELY DOES NOT TOUCH: the four nouns for the partition
 * (`factor` / `rule` / `classifier` / `finding`). Which one wins is with the
 * operator (App Snob finding 9) and unifying three of the four would be a
 * half-migration nobody asked for. They stay exactly as round 8 left them.
 *
 * IT ALSO CANNOT TOUCH THE SHIPPED EVIDENCE TABLE. `renderEvidence` is lifted
 * whole and prints its own `unclassified`, its own group hedge and its own date
 * format; rewriting any of that would be the fork the ruling forbids. Reported
 * instead.
 */

/** DESIGN.md rule 3 — "Do not say 'clean nights'… Say 'nights of steady data.'"
    The noun is the projection's own `support.noun`, respelled. */
const STEADY_NOUN = { 'clean nights': 'nights of steady data' };

/** DESIGN.md rule 8 — user copy uses `Correction factor` and `Carb ratio`, and
    shows basal model slots as bare time ranges (`Basal · 00:00–00:30`). The
    projection's row titles carry the engine spellings (`I:C`, `Basal 00:30 to
    01:30`), which rule 8 reserves for engine code and technical documentation.
    ONE format for a slot, both rows: parameter, `·`, en-dash range, `·`,
    direction. */
const RANGE = /^(Basal|I:C|ISF) (\d{2}:\d{2})(?: to (\d{2}:\d{2}))? · (.+)$/;
const PARAMETER_WORD = { Basal: 'Basal', 'I:C': 'Carb ratio', ISF: 'Correction factor' };

function voiceTitle(title) {
  const m = RANGE.exec(title);
  if (!m) return title;
  const [, parameter, from, to, direction] = m;
  const span = to ? `${from}–${to}` : from;
  return `${PARAMETER_WORD[parameter]} · ${span} · ${direction}`;
}

/** Rule 3 + rule 8 over the projection window the shipped queue painter reads.
 *
 * The projection is handed to `renderFindingsQueue` WHOLE, so the respelling has
 * to happen to the projection rather than to the painted DOM — the painter owns
 * how a title and a support noun are laid out, and reaching into its output to
 * retype them is the transcription this mock does not do. Fails closed both
 * ways: a window where nothing needed respelling means the fixture changed under
 * the rule, and that is worth stopping for. */
function voiceProjection(window) {
  let touched = 0;
  const rows = window.rows.map((row) => {
    const title = voiceTitle(row.title);
    const noun = row.support?.noun;
    const respelled = noun && STEADY_NOUN[noun];
    if (title !== row.title || respelled) touched += 1;
    return {
      ...row,
      title,
      support: row.support ? { ...row.support, noun: respelled || noun } : row.support,
    };
  });
  if (!touched) {
    throw new Error('the voice pass found nothing to respell in the projection window — '
      + 'either the fixture already speaks DESIGN.md\'s register (delete this pass) '
      + 'or its row shape changed under it');
  }
  return { ...window, rows };
}

/** DESIGN.md rule 8 again, on the app's own footer rail. The chrome is lifted
    from the running app's DOM, so surface.js applies this at injection rather
    than the build editing an extracted artifact. */
const FOOTER_VOICE = [
  ['ISF', 'Correction factor'],
  ['I:C', 'Carb ratio'],
];

/* ========== ROUND 9, FINDING 11: THE QUEUE'S RANKING TIERS ==========
 *
 * DESIGN.md rule 4: "Decide now, Next in line, Worth a look, and noted are the
 * complete ranking-tier vocabulary", and the 0–100 urgency number is never
 * shown. Round 8 rendered neither — six flat rows in server order, so the single
 * most decision-relevant fact on the screen (does row 1 outrank row 6?) was left
 * for the reader to infer from position alone.
 *
 * NO THRESHOLD IS INVENTED HERE, because there is no threshold in this
 * repository to read: `tuning_priority.py` emits the 0–100 score and nothing
 * bands it. What the tree DOES pin is the top of the ladder —
 * `ic_headline_block`'s docstring: "the server's headline and the client's
 * 'Decide now' are the same computation on the same field", i.e. Decide now is
 * the highest-priority ASSERTING row. The rest follow from the projection's own
 * register and the shipped painter's own priced/unpriced seam, so every boundary
 * below is a field the server already published:
 *
 *   DECIDE NOW    the top priced `assert` row — the one the machine speaks for
 *   NEXT IN LINE  the remaining priced `assert` rows — stageable, not the headline
 *   WORTH A LOOK  the priced `finding` rows — ranked, but no pump value to stage
 *   noted         the unpriced tail, which the shipped `queueRows` already
 *                 separates with its own seam (`tier: 'tail'`)
 *
 * The tail's section name is CONTEXT.md's, not invented either: "**Watching**:
 * the subordinate Audit section for held and still-collecting tuning reads that
 * are not available for a decision." So the tail gets a `WATCHING` ledger rule
 * carrying the shipped `TAIL_NOTE` as its right-hand meta — which is what
 * retires the orphan body-weight sentence the painter drops between two rows —
 * and its rows carry the fourth tier word.
 */
/* ---- WHY `DECIDE NOW` NEVER RENDERS (issue #26) ----
 *
 * Round 9 stamped `decide_now` on the first asserting row in server order. The
 * server does not name a headline across parameters, so that first row is
 * whatever sorted highest — and correction factor earns `register: "assert"`
 * from its own predicate (`findings_projection.py:357`), independently of the
 * staging classifier it sits outside. Issue #26 records the consequence on a
 * real 30-day run: a correction-factor finding ranked second while establishing
 * nothing the wearer can act on, its interval spanning the programmed value.
 * A row that reached second can reach first, and stamping `Decide now` on it
 * would have the machine speak for a row that recommends no number.
 *
 * `ic_headline_block` pins the top of the ladder for carb ratio only, and
 * `result.py:508-510` records that basal and correction factor have no
 * per-segment headline at all. Until a cross-parameter headline exists, every
 * priced asserting row takes `Next in line`: it is DESIGN.md rule 4's own word,
 * it is true of every stageable row, and it claims nothing the engine cannot
 * defend. `decide_now` stays in the vocabulary below, unreachable, so the day
 * the headline lands it is one predicate, in one place.
 */
const TIER_WORD = {
  decide_now: 'Decide now',
  next_in_line: 'Next in line',
  worth_a_look: 'Worth a look',
  noted: 'noted',
};

function rankingTiers(rows) {
  const tierOfRow = (row) => {
    if (row.tier === 'tail') return 'noted';
    if (row.register !== 'assert') return 'worth_a_look';
    /* EVERY asserting row is `next_in_line`. `decide_now` is deliberately
       unreachable — see the DECIDE NOW note above. */
    return 'next_in_line';
  };
  /* One eyebrow per RUN, not per row: the eyebrow is a section head, and
     printing it again over the second row of the same tier would make it a row
     decoration. Keyed by the id of the row that OPENS the run, so surface.js
     inserts it in front of the painted node without counting anything. */
  const opens = {};
  let previous = null;
  for (const row of rows) {
    const tier = tierOfRow(row);
    if (tier !== previous) opens[row.id] = { tier, word: TIER_WORD[tier] };
    previous = tier;
  }
  return opens;
}

/* ========== ROUND 9, FINDING 19: WHAT A HABIT ROW'S SUBLINE SAYS ==========
 *
 * A setting row's subline is `now 0.8 U/hr → 0.96 U/hr` — what it does, then the
 * numbers. A habit row's was `1 of 3 highs · 1 of 4 lows`: two bare fractions
 * with no clause naming what they are fractions OF, leading with a "highs"
 * figure on a finding called Over-treated LOW.
 *
 * The clause is CONTEXT.md's own reading of those numbers. An Appearance is a
 * "'k of n' recurrence rate" over an Exposure population, so the verb is
 * `Recurs in` and the denominators are named by the nouns the projection already
 * publishes. Nothing numeric is added, moved or recomputed — one clause is set
 * in front of the counts the shipped painter already lays out. */
const HABIT_LEAD = 'Recurs in ';

/* ============ ROUND 9, FINDING 9: ONE NOUN PER CONCEPT ============
 *
 * Round 8 spent FOUR vocabularies on one partition in a single column: the
 * dropdown's cap said `FACTOR · 3 IN LOWS`, the band said `Near rule`, the
 * table's group rule said `Attributed here, but no classifier fired on the
 * pattern`, and the row cells said `unclassified`. A reader managing their
 * diabetes has no way to know that a classifier, a rule and a finding are the
 * same thing here — because they are.
 *
 * THE OPERATOR'S WORDS, settled this round, used IDENTICALLY on the band, the
 * group rule, the row verdict cell and the canvas legend. They are deliberately
 * clinical rather than lows-flavoured: the same three labels have to carry meals
 * and carb-ratio findings, which `Over-treated` / `Close call` / `Treated fine`
 * cannot.
 *
 * CHECKED AGAINST CONTEXT.md, AS INSTRUCTED, AND IT DEFINES NO COMPETING TERM.
 * The glossary has no `Verdict`, `Cohort` or partition entry at all. Its nearest
 * neighbour is **Silence reason**, whose `under-threshold` case is glossed "it
 * happened but fell short of the bar — the near-miss" — but that is a closed set
 * of six REASONS the engine stayed silent, one axis down from a three-way
 * partition of a population, and it names a cause rather than a verdict. Nothing
 * in CONTEXT.md wins over the three below. **Evidence tier** is a genuinely
 * different axis (`Observed` / `Inferred` / `Not-in-data`) which the glossary
 * warns must never be shown as one badge with the outcome — and the shipped
 * table prints the outcome in the slot its field calls `evidence_tier`, which is
 * that very collision. Named in the report; not this round's to fix.
 *
 * `another_factor` keeps a distinct word: it is not a verdict on this finding's
 * rule, it is the statement that a different lever owns the episode.
 */
const COHORT_LABEL = {
  fired: 'Meets criteria', near_rule: 'Borderline',
  neutral: 'Does not meet', another_factor: 'Another lever applies',
};

/** FINDING 9 — the same three words, as the value the SHIPPED table prints in a
    row's verdict cell and in its group rule. It reads `evidence_tier` off the
    matched verdict, so the partition word travels as data and the mock never
    touches the painter. */
const PARTITION_TIER = COHORT_LABEL;

/** FINDING 9 — the Unclaimed frame's one word, on its band key, its group rule
    and its dots' readout. Round 8 had this frame's rows fall through to the
    shipped `unclassified` and its group rule to the generic
    `Attributed here, but no classifier fired on the pattern`, which is one
    string doing two jobs — it rendered identically under a `Near rule` band with
    `· 4`. Deleted: with every occurrence carrying a partition word, the shipped
    painter's counter branch never runs and neither string can render. */
const UNCLAIMED_TIER = 'Not claimed by any finding';

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

/** VERBATIM — diagnose-event-comparison.js `fmtDate`. */
const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/* ROUND 8, ITEM 1 — `evidenceCells` is DELETED. It was a transcription of the
   shipped `renderEvidence`'s numeric-cell rule, made when the mock painted its
   own rows; the mock now runs that function itself, so the transcription is the
   next reader's wrong map.

   ROUND 8, ITEM 2 — `minuteOfDay` goes with it. It existed to re-anchor the
   lens's alignment window on a drilled event's wall-clock minute, which is the
   viewport move this round retires: selecting an occurrence never sets a
   window. See `terms.selection_never_moves_the_window` in data.json. */

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
    /* ROUND 9, FINDING 6 — WHAT THE SELECTED KEY IS CALLED. `That day` is a
       pronoun; the row the reader clicked says `Aug 3`, so the chart says
       `Aug 3`. Both halves are the occurrence's own anchor, through the shipped
       `fmtDate` the table's rows are dated by, so the key and the row can never
       spell the same day two ways. */
    dateOf: Object.fromEntries(lens.occurrences.map((o) => [o.identity.id, {
      label: fmtDate(o.anchor.date),
      detail: o.anchor.t.slice(11, 16),
    }])),
    context: 'excursion nadir · −5 h to +2 h',
    alignmentWindow: lens.coordinates.alignment_window_min,
    axisAnchor: 'low',
    /* ROUND 5, BLOCK 6 — THE HEDGE LEAVES THE INSPECTOR COLUMN. It was a
       `.ec-boundary-note` line in the case-file body, a whole line of prose
       about a cohort the reader may not even be looking at. It now hangs off
       the canvas legend's own Near-rule key as a sub-line, and only where that
       cohort actually routed events — which is the one place the word "Near
       rule" is already on screen and the only place the hedge is about
       something visible. Null elsewhere, and the legend prints nothing. */
    nearRuleNote: (lens.cohorts.find((c) => c.key === 'near_rule')?.routed_count || 0) > 0
      ? 'Disclosure only. Never enters Priority, a suggestion, or Plan.'
      : null,
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
      /* ROUND 9, FINDING 3 — A CHIP IS ONE LINE: mark, name, count, support word.
         Round 8's detail carried the per-point support tally as well
         (`7 events · 76 supported · 7 limited · 2 withheld points`), which is
         three engine facts about how the aggregate was assembled, printed at
         data weight under the data. DESIGN.md rule 2 keeps that vocabulary out
         of user copy, and rule 5 keeps the legend to a chip. `pointStateSummary`
         is still transcribed above and still unused by nothing else — it is the
         shipped producer, and the day the chip earns the tally back it is here.
         What survives is the number the reader is counting: how many events. */
      legendDetail: `${c.routed_count} ${c.routed_count === 1 ? 'event' : 'events'}`
        .replace(/(\d+) (\S+)/g, '$1\u00a0$2'),
      points: c.points,
    }])),
    traces: null,
  };
}

/** The cohorts a factor's frame regroups its table into — the lens's own three
    visible cohorts, in the lens's own order, so the table's groups and the
    canvas's medians are the same three things. */
const GROUP_ORDER = ['fired', 'near_rule', 'neutral'];

/** The Unclaimed frame's single group rule, and the state its clock dots report
    on hover — one string, because they are one statement. */
const UNCLAIMED_LEAD = UNCLAIMED_TIER;

/* ROUND 9, FINDING 9 — `GROUP_PHRASE` IS DELETED. It set the causal phrase the
   shipped group header prints in front of its tier word, and all three of its
   entries were the old vocabulary: the finding's own title for `fired`, a
   `, disclosure only` tail for `near_rule`, and `matched no factor’s rule` for
   `neutral` — which also spent the noun CONTEXT.md lists under Avoid for Lever.
   With the partition word carried as the occurrence's own tier, the shipped
   header leads with that word and nothing precedes it, which is what makes the
   group rule and the band read as one statement. `factor.cause` is handed the
   painter as empty, which is the branch it already has for a factor with no
   title. */

/* ROUND 8, ITEM 1 — `dedupeGroupTags` is DELETED. Round 4 blanked a row's tier
   cell wherever the group header already carried the same word; that was a rule
   the mock's own painter enforced, and the mock no longer has a painter. The
   production table prints `tierOf(o) || 'unclassified'` in every row, and what
   it prints over this fixture is now visible rather than tidied. */

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
  /* ROUND 5, WORKSTREAM A — the third authorized fixture, and the only one the
     pooled queue-root chart reads. It is the SAME payload the browser gates
     boot the app from (harness.mjs's `PAYLOAD`), so the mock's pooled chart and
     the running app's are fed byte-identical input and the option diff means
     something. Fail closed: a payload without a pooled feed or basal rows would
     otherwise render an empty chart that looks deliberate. */
  const payload = await readJson(PAYLOAD);
  if (!payload.evidence?.pooled?.bins?.length) throw new Error(`${PAYLOAD} carries no pooled CGM bins`);
  if (!payload.analyze?.basal?.length) throw new Error(`${PAYLOAD} carries no basal slot estimates`);

  /* ROUND 6, FORM 3 — the captured days the clock projection's drill overlays.
     Run through the SHIPPED `buildDayTrace`, which is the same function
     diagnose-workstation.js hands `renderCanvas` its `trace` from, so the
     overlaid line is binned the app's way and never resampled here. Fails
     closed: a capture with no day, or a day the shipped builder finds no
     reading in, would otherwise draw a flat nothing that looks deliberate. */
  const dayCapture = await readJson(DAY_CAPTURE);
  const dayKeys = Object.keys(dayCapture.days || {}).sort();
  if (!dayKeys.length) throw new Error(`${DAY_CAPTURE} carries no captured days`);
  const dayTraces = Object.fromEntries(dayKeys.map((key) => {
    const trace = buildDayTrace(dayCapture.days[key]);
    if (!trace.some((v) => v != null)) throw new Error(`${DAY_CAPTURE} day ${key} has no CGM readings`);
    return [key, trace];
  }));

  /* ---- level 1: the ranked queue, handed to the SHIPPED renderer whole ---- */
  /* ROUND 9, FINDING 1 — respelled ONCE, here, so the crumb leaf, the subject
     strip and the painted row can never disagree about how a slot is written. */
  const globalWindow = voiceProjection(projection.windows.global);
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
  /* ROUND 8, ITEM 1 — ONE OCCURRENCE, IN THE SHAPE THE PRODUCTION TABLE READS.
     The build no longer formats a row; it hands the shipped `renderEvidence`
     the same object the app hands it, so the date, the time, the rounding, the
     Δ sign and the tier word are all the shipped function's work.

     The lens projector reports a per-occurrence `verdict`; the workstation
     evidence shape carries a LIST of classifier reads and derives the tier from
     whichever one matched (`tierOf`). This is that projection, not an
     invention: the classifier is the projector's own factor, `matched` is
     whether it routed the occurrence to `fired`, and both the tier and the
     sentence are the projector's own strings. */
  /* ROUND 9, FINDING 9 — AND THE PARTITION WORD TRAVELS AS `evidence_tier`.
     The shipped painter reads exactly one field for a row's verdict cell AND for
     its group rule: `tierOf`, which is the `evidence_tier` of whichever verdict
     carries `matched`. Round 8 set `matched` only on the fired cohort, so every
     other row fell through the painter's `counter` branch and printed the
     literal `unclassified` under the generic
     `Attributed here, but no classifier fired on the pattern` header — the two
     strings the operator's ruling deletes, and the reason four vocabularies were
     on screen at once.
     Every occurrence is a judged one here: a low in the `Borderline` set was
     judged and fell short, which is a verdict, not an absence of one. So each
     carries its cohort's partition word as its tier, the counter branch never
     runs, and one noun reaches the band, the group rule and the row cell. This
     is DATA the painter reads — the extraction is untouched and still fails
     closed. */
  /* CALL IT WITH ONE ARGUMENT. `.map(evidenceOccurrence)` hands
     `Array.prototype.map`'s INDEX to `tier`, so every row after the first took
     its own position as its verdict word — the identical trap round 8 found and
     documented one function down, on `clockDot`. Caught here by finding 12: with
     five distinct "tiers" no group was homogeneous, so nothing was suppressed
     and the column printed `Meets criteria`, `1`, `2`, `3`, `4`. */
  const evidenceOccurrence = (o, tier) => ({
    id: o.identity.id,
    date: o.anchor.date,
    t: o.anchor.t,
    bg: o.anchor.bg,
    worst_bg: o.anchor.worst_bg,
    text: o.verdict.detail,
    verdicts: [{
      classifier: o.verdict.factor,
      matched: true,
      evidence_tier: tier || PARTITION_TIER[o.verdict.cohort],
      detail: o.verdict.detail,
    }],
  });

  const windowLabel = `${fmtDate(lens.coordinates.source_window.start)}–${fmtDate(lens.coordinates.source_window.end)}`;

  /* ---- ROUND 6, FORM 3: THE CLOCK PROJECTION ----
     `By clock` re-projects the SAME selected events onto the pooled day's
     00:00–24:00 axis (amendment, the projection toggle). Nothing new is drawn
     and nothing is recomputed: the events become the shipped pooled renderer's
     own `occurrences` scatter, at their own recorded clock time and glucose,
     and drilling one hands that renderer a `trace` (a captured day) and a
     `window` (the lens's own alignment window, carried onto the clock axis),
     which are the two inputs its day-overlay and window brace already take.

     THE DAY BEHIND A DRILLED EVENT IS A JOIN THIS BUILD MAKES, not a fact any
     fixture carries: the lens capture holds no CGM, and the day capture holds
     three days from a different synthetic population entirely. The assignment is
     positional and stamped (`provenance.day_traces`), the same way the
     population rows are stamped — the alternative is drawing no day at all,
     which would delete the projection's whole drill state. */
  /* ROUND 9, FINDING 2 — A DOT'S HEIGHT IS ITS GLUCOSE, AND `bg` IS THE WRONG
     ONE. The shipped scatter reads `o.bg` first and falls back to `o.worst_bg`
     (diagnose-workstation-chart.js: "each one now sits at its own recorded
     glucose value"). `anchor.bg` is the ENTRY value — the reading at which the
     excursion crossed the threshold — so on this capture it is 68-70 on every
     single low, and seventeen dots landed in a dead straight line on top of the
     70 rule. `anchor.worst_bg` is the nadir, 58-61, which is the number the
     table's own `entry → worst · Δ` key is built around and the only one that
     orders the rows by severity. So `bg` is not passed at all and the shipped
     fallback plots the worst — the renderer's own rule, not an override. */
  const clockDot = (o, label, cohort) => ({
    id: o.identity.id,
    t: o.anchor.t,
    date: o.anchor.date,
    worst_bg: o.anchor.worst_bg,
    /* The shipped scatter reports this string through the docked readout on
       hover. It is the one channel that can still say WHICH state a dot is in,
       because the shipped series draws every occurrence in one style. */
    cause_title: label ?? COHORT_LABEL[o.verdict.cohort],
    /* ROUND 8, ITEM 1 — which verdict this dot belongs to, so that drilling the
       band can EMPHASISE that verdict's dots without removing any. All three
       verdicts stay drawn at every band position: the canvas keeps one stable
       denominator, and "how many lows did I have" reads the same wherever the
       reader is standing. */
    cohort: cohort ?? o.verdict.cohort,
  });
  /* ROUND 8, ITEM 2 — a drill carries a DAY and nothing else.
     It used to carry a window too — the lens's alignment window re-anchored on
     the event's wall-clock minute — and handing that to the pooled renderer is
     what moved the reader's viewport every time they picked a row. The clock
     window belongs to the WINDOW instrument, not to a selection, so there is no
     window here for a selection to apply. */
  const dayOfIndex = (index) => dayKeys[index % dayKeys.length];
  const clockDrills = Object.fromEntries(
    lowsView.occurrences.map((source, index) => [source.id, { day: dayOfIndex(index) }]),
  );

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
    /* ROUND 8, ITEM 1 — a group is now a VERDICT'S OCCURRENCES, in the shipped
       evidence shape, plus the causal phrase the production table's own header
       prints (`factor.cause`). Nothing here formats a row: `renderEvidence`
       does. `lead` is the verdict's name, which the band above the table reads
       out; the group's own count is a length, not a stored figure. */
    const groups = GROUP_ORDER
      .map((key) => ({
        key,
        lead: COHORT_LABEL[key],
        /* FINDING 9 — nothing precedes the partition word in the group rule. */
        cause: null,
        occurrences: narrow.occurrences
          .filter((o) => o.verdict.cohort === key)
          .map((o) => evidenceOccurrence(o)),
      }))
      .filter((g) => g.occurrences.length)
      .map((g) => ({ ...g, count: g.occurrences.length }));
    /* ROUND 6, SEND-BACK 1 — THE META COUNTS WHAT THE TABLE DRAWS. Block 4 set
       this numerator to the frame's own claim (`claims[factorKey]`, the fired
       count), which is one cohort out of the three the table lists — so a table
       of seventeen rows was capped "7 of 20". The amendment's ruling is
       explicit: "The OCCURRENCES meta counts what the table draws, not one
       cohort." The cohort counts live on the group rules, which is where a
       per-cohort number belongs. */
    const drawn = groups.reduce((n, g) => n + g.occurrences.length, 0);
    return {
      key: factorKey,
      label,
      /* ROUND 5, BLOCK 2 — the segment's count is the FRAME's own claim: how
         many lows this factor's rule matched. */
      count: claims[factorKey],
      canvas: canvasFor(narrow),
      /* ROUND 6, FORM 3 — the same events, ready for the clock projection. */
      /* ROUND 8 — `.map(clockDot)` here handed `Array.prototype.map`'s INDEX to
         the second parameter, so since round 6 every population dot's readout
         string has been the number 0 rather than its verdict's name. Called
         with one argument now. */
      clock: { occurrences: narrow.occurrences.map((o) => clockDot(o)) },
      /* ROUND 5, BLOCK 6 — THE ROUTE IS ONE ACTION, NOT A SENTENCE, and it is
         ABSENT rather than apologised for where the factor has no case file.
         Round 4 spent a full line saying `Correction on active insulin has no
         case file in this exploration.` beside a button that was not there. */
      route: factorKey === FACTOR ? { label: 'Open case file ›', target: FINDING_ID } : null,
      occurrences: {
        /* ROUND 6, SEND-BACKS 1 + 2 — what the table draws, over the frame's own
           denominator, BEHIND the column key. Block 4 dropped the
           `entry → worst · Δ` key on the grounds that the columns are
           self-evident; they are not, on a row that prints three bare numbers
           in a mono face, and the finding scene has carried the key since round
           2. One cap form, both scenes. */
        /* ROUND 8, ITEM 1 — THE CAP'S NUMERATOR IS A RUNTIME FACT NOW, so the
           build emits the cap's PARTS and the surface composes the line. Under
           wireframe H3 the table draws one verdict at a time, and which verdict
           that is cannot be decided here — the same reason round 5 stopped
           emitting a row budget. The denominator, the window and the column key
           are still the frame's own, and the settled rule is unchanged: the
           meta counts what the table draws. */
        cap: { key: 'entry → worst · Δ', denominator: narrow.population.denominator, window: windowLabel },
        /* ROUND 9, FINDING 8 — THE INSTRUCTION MANUAL IS DELETED. Round 8 put
           two sentences under the band: what it counts, and that it scopes the
           list rather than the comparison. Both are gone. The second was a
           control explaining its own scope, which is a control not drawn clearly
           enough — and the canvas already says it in pixels, because the
           unselected verdicts stay plotted. Worse, it OUTLIVED the band: opening
           the factor dropdown overlays the band and the sentence sat on alone,
           captioning a control the reader could no longer see.
           What survives is the one FACT the first sentence carried, moved onto
           the band's own line as its right-hand meta, where it cannot outlive
           the thing it counts. */
        bandMeta: `${drawn} of ${narrow.population.denominator} lows in ${windowLabel}`,
        /* ROUND 9, FINDING 13 — THE RESIDUE IS PARTS NOW, NOT A LINE. Round 8
           emitted a finished sentence naming the FRAME's two leftovers, and
           printed it under a table that draws ONE VERDICT — so in the `Near rule`
           frame the reader's last impression of the table was `1 + 2` against a
           cap of `4 of 20` and a band of `4`, arithmetic that closes against
           nothing on screen. The counts have to be scoped to what the table is
           actually drawing, and which verdict that is is a runtime fact (the
           same reason the cap's numerator became one in round 8). So the build
           emits the frame's own figures and surface.js closes the denominator
           with them. */
        residueParts: {
          another_factor: narrow.population.counts.another_factor,
          excluded: narrow.population.counts.excluded,
        },
        groups,
      },
    };
  };

  /* ROUND 5, BLOCK 2 — THE UNCLAIMED FRAME IS RESTORED AS A THIRD SEGMENT.
   *
   * Round 4 deleted it on the reasoning that its ten rows re-list the selected
   * factor's own Near rule and Rule-did-not-match groups. That reasoning holds
   * only while a factor frame is selected, and it is the wrong test: the
   * segmented control is a statement of what the population divides into, and a
   * division that silently drops its largest part is a lie about the twenty.
   * Ten of these lows match nothing, that is the single most interesting fact
   * on the surface, and the operator accepted the prescription wholesale.
   *
   * WHAT IT DRAWS is the honest empty state, not a comparison: project.mjs has
   * no unclaimed coordinate because there IS no rule to compare against, so the
   * canvas prints its own furniture — greyed axes, the alignment range still on
   * them — and one short line. The head is swapped to a truthful label rather
   * than left reading `Low response comparison` over an empty plot. */
  /* ROUND 8, ITEM 1 — and its rows are the production table's rows like every
     other frame's. Rounds 5 and 6 argued over which of the mock's two tag cells
     an unclaimed low should print; the production table settles it by having
     one, and printing its own `unclassified` in it — which is exactly what a
     low no rule reached is. */
  const unclaimedOccurrences = wide.occurrences
    .filter((o) => unclaimedIds.includes(o.identity.id));
  const unclaimedRows = unclaimedOccurrences.map((o) => evidenceOccurrence(o, UNCLAIMED_TIER));
  const unclaimedFrame = {
    key: 'unclaimed',
    label: 'Unclaimed',
    count: unclaimedIds.length,
    canvas: null,
    /* The empty canvas's own two strings. `head` swaps the canvas title; `line`
       is the ONE short line the prescription allows in place of a paragraph. */
    empty: {
      head: 'No comparison drawn',
      context: `${unclaimedIds.length} lows · no rule to compare against`,
      line: 'No finding claims these, so there is no rule to compare them with.',
    },
    route: null,
    /* FORM 3 — an unclaimed low is still a low that happened at a time, so the
       clock projection has everything it needs even where no rule does. Its
       dots carry the frame's own group lead rather than a cohort label, because
       the cohort a wider projection put them in is not what this frame is
       about. */
    clock: { occurrences: unclaimedOccurrences.map((o) => clockDot(o, UNCLAIMED_LEAD, 'unclaimed')) },
    occurrences: {
        /* ROUND 8, ITEM 1 — THE CAP'S NUMERATOR IS A RUNTIME FACT NOW, so the
         build emits the cap's PARTS and the surface composes the line. Under
         wireframe H3 the table draws one verdict at a time, and which verdict
         that is cannot be decided here — the same reason round 5 stopped
         emitting a row budget. The denominator, the window and the column key
         are still the frame's own, and the settled rule is unchanged: the
         meta counts what the table draws. */
      cap: { key: 'entry → worst · Δ', denominator: wide.population.denominator, window: windowLabel },
      /* ROUND 9, FINDING 8 — the fact, on the band's own line. See the factor
         frame above for why the two instruction sentences are gone. */
      bandMeta: `${unclaimedRows.length} of ${wide.population.denominator} lows in ${windowLabel}`,
      /* The mirror of a factor frame's residue: what is NOT in this table. One
         part, because this frame has one group and nothing else to account for. */
      residueParts: { claimed },
      groups: [{
        key: 'unclaimed',
        lead: UNCLAIMED_LEAD,
        /* No causal phrase: no rule reached these, so the production table's
           header degrades to its own bare hedge, which is the truth here. */
        cause: null,
        count: unclaimedRows.length,
        occurrences: unclaimedRows,
      }],
    },
  };

  const claimOrder = Object.entries(claims).sort(([, a], [, b]) => b - a).map(([key]) => key);
  const frames = Object.fromEntries([
    ...claimOrder.map((key) => [key, frameFor(key)]),
    ['unclaimed', unclaimedFrame],
  ]);
  /* The segmented control's three segments, in the order the prescription
     names them: the claiming factors by size, then Unclaimed. */
  const segments = Object.values(frames).map((f) => ({ key: f.key, label: f.label, count: f.count }));

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
      queue_canvas: 'mockups/diagnose-workstation.synthetic/payload.json (evidence.pooled, analyze.basal, '
        + 'evidence.target_range) — handed across RAW. The surface runs the shipped envelopeFromPooled / '
        + 'markersFromPooled / windowStats / buildSlotLane / renderCanvas over it in the browser, which is the '
        + 'app\'s own path from its API response. This is a THIRD synthetic fixture, disjoint from the other '
        + 'two again: its 3 captured CGM days and 48 basal slots are not the lens capture\'s 20 lows and not '
        + 'the projection\'s 30-day window. Nothing on the queue root reconciles them, and nothing tries to.',
      unclaimed: 'RESTORED AS A THIRD SEGMENT (round 5, block 2). project.mjs projects cohorts for a NAMED '
        + 'FACTOR and has no unclaimed coordinate, so this frame draws NO comparison — its canvas is the '
        + 'honest empty state (axis furniture with the alignment range still on it, one short line, a '
        + 'truthful head), never a facsimile of a comparison. Its rows are the wide projection\'s occurrences '
        + 'filtered to the lows no factor routes to `fired`; its residue names the ten that are claimed. '
        + 'Round 4\'s deletion argument — that these ten re-list the selected factor\'s Near rule and Rule-'
        + 'did-not-match groups — holds only while a factor frame is selected, and the segmented control is a '
        + 'statement about the population, not about the selected frame.',
      unreachable_factor: 'correction_stacking is a factor of the lows view and fires on NOTHING in this '
        + 'capture, so it claims no low and the claim split — which is the selector — never offers it. No '
        + 'frame exists for it.',
      day_traces: 'mockups/diagnose-workstation.synthetic/explore-day.capture.json through the SHIPPED '
        + 'buildDayTrace — the real captured CGM days the clock projection lays over the pooled envelope '
        + 'when an event is drilled. WHICH day belongs to which event is a JOIN THIS BUILD MAKES and no '
        + 'fixture carries: the capture holds three days of a fourth synthetic population (2020), the lens '
        + 'capture holds twenty lows of another (2026), and neither references the other. The assignment is '
        + 'positional (the view\'s occurrence order, cycled over the sorted day keys) and deterministic. '
        + 'ROUND 8, ITEM 2 — a drill carries the DAY and nothing else. It used to carry a window too (the '
        + 'lens\'s alignment window re-anchored on the event\'s wall-clock minute), and handing that to the '
        + 'pooled renderer re-aimed the reader\'s viewport on every pick; see '
        + 'terms.selection_never_moves_the_window. Under ruling 5 the server would carry both; the fixture '
        + 'generators owe it (consequence-ledger item 2).',
      disjoint: 'The two populations are disjoint by construction and are never reconciled.',
    },

    /* ---------- THE EXPLORATION'S OWN TERMS ----------
       Rules this surface is built to, written where the build emits them so
       anything reading data.json inherits them with the data. Provenance above
       says where a number came from; a term says what the surface is not
       allowed to do with it. */
    terms: {
      selection_never_moves_the_window: 'SELECTING AN OCCURRENCE IS EVIDENCE-ONLY. It never mutates the '
        + 'clock window. The window is the READER\'S control — it is what the toolbar\'s WINDOW group '
        + 'sets, and it decides which events are in play. Picking one of those events shows that event\'s '
        + 'evidence: it draws that day\'s trace and marks the event on the canvas. It does NOT re-anchor '
        + 'the viewport, change the x-extent or move the brace, and after a selection the window is '
        + 'byte-identical to what it was before. Rounds 1-7 re-aimed the window on every pick (the brace '
        + 'read `Aug 12 · 02:00 00:00-04:00`), which made the reader\'s own filter a thing the data kept '
        + 'resetting. Operator ruling, round 8: "we would only see those events. We don\'t need to then '
        + 'have the filter reset our viewport." Written here rather than in a screenshot because the risk '
        + 'it guards is this logic riding into production by inheritance. harness.mjs proves it: it reads '
        + 'the pooled chart\'s window and x-extent before a row click and after, and fails if they differ.',
      band_scopes_the_roster_only: 'THE VERDICT BAND SCOPES THE ROSTER, NEVER THE CANVAS. Drilling the '
        + 'band to `Near rule` changes which occurrences the table lists and nothing else: all three '
        + 'verdicts stay plotted, so the canvas keeps one stable denominator and "how many lows did I '
        + 'have" reads the same wherever the reader is standing. The drilled verdict\'s dots are '
        + 'EMPHASISED against the rest (operator, round 8: "the four that you\'re reading stand out"), '
        + 'which is emphasis, not filtering — the others stay visible as the context around them.',
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
      /* ROUND 5, THE PERSONA'S NAMING RULING (mid-run). `Exposure populations`
         was CONTEXT.md's noun for the denominator, which is what these rows
         ARE, but it named the concept rather than the destination and it left
         the capture's window restated on every row. The cap is now a SECTION
         SPINE at the Occurrences register carrying the window ONCE, and the
         rows are the bare destinations — and the row label is byte-identical to
         the crumb leaf it opens (`Findings › Lows`), so the routing cannot
         change vocabulary mid-hop. */
      /* ROUND 9, FINDING 11 — WHICH ROW OPENS WHICH RANKING TIER, keyed by row
         id so surface.js sets the eyebrow in front of the painted node without
         counting anything. Derived above from the projection's own register and
         priority; no threshold is invented. */
      tiers: rankingTiers(rows),
      /* ROUND 9, FINDING 11 — THE TAIL'S SECTION CAP. The shipped painter drops
         `TAIL_NOTE` between two rows as a bare line of body-weight prose with no
         eyebrow and no rule, so it reads as a caption for whichever row the
         reader's eye lands on. CONTEXT.md already names that section — Watching,
         "the subordinate Audit section for held and still-collecting tuning
         reads that are not available for a decision" — so it becomes a ledger
         rule at the section register, and the shipped sentence becomes its
         right-hand meta, which is the slot on that rule where an explanatory
         clause belongs. The sentence is the shipped export, not a rewrite. */
      watching: { cap: 'Watching', meta: TAIL_NOTE },
      /* ROUND 9, FINDING 19 — the clause set in front of a habit row's counts. */
      habitLead: HABIT_LEAD,
      populationCap: 'All events',
      populationCapMeta: windowLabel,
      populationRows: [
        {
          id: POPULATION_ID, derived: true, title: 'Lows', drills: true,
          count: wide.population.denominator,
        },
        {
          id: 'population:meals', derived: true, title: 'Meals', drills: false,
          count: meals.population.denominator,
        },
      ],
      /* ---------- ROUND 5, WORKSTREAM A: the queue root's canvas ----------
         THE POOLED GLUCOSE CHART, from the workstation payload fixture. Nothing
         is derived here: the surface runs `envelopeFromPooled`,
         `markersFromPooled`, `windowStats`, `buildSlotLane` and `renderCanvas`
         — all shipped — over exactly these two raw sub-objects, which is the
         same path frontend/diagnose-workstation.js takes from its API response.

         Round 4 collapsed this pane on the grounds that the queue level had
         nothing to answer with. That was true of round 3's MOCK, which put a
         title over empty ground; it was never true of the ruling, whose
         queue-root canvas IS this chart, and the app has had it all along. */
      canvas: {
        head: { title: 'Glucose by time of day' },
        pooled: payload.evidence.pooled,
        basal: payload.analyze.basal,
        /* NO `target`. The shipped workstation does not pass one either — it
           lets `renderCanvas` fall through to its own `[70, 180]` default — and
           the payload's `evidence.target_range` is an object, not the pair the
           renderer indexes, so handing it over produced a markArea with an
           undefined bound and killed the boot. Matching the app is both the
           faithful move and the working one. */
        window: ALL_DAY.range,
        /* diagnose-workstation.js's own preset-label form, for the one preset
           that means "no window has been chosen": the whole day. */
        windowLabel: `${ALL_DAY.label.toUpperCase()} `
          + `${hhmm(ALL_DAY.range[0])}–${winEdge(ALL_DAY.range[1])}`,
      },
    },

    /* ---------- the dock floor, per level (ROUND 5, BLOCK 8) ----------
       The shipped `IDLE_TITLE` / `IDLE_DETAIL` pair is two ranks of type saying
       one thing, and the prescription cuts the idle dock to a single line. The
       population and queue levels get the bare state; the FINDING scene — the
       one level where a change can actually be staged — gets the onboarding
       sentence, reworded to stand alone now that it no longer has a title line
       above it to lean on. DEVIATION from watched-change-dock.js's exported
       strings, named here and in the report. */
    /* ROUND 9, FINDING 15 — ONE STRING, BECAUSE THERE IS ONE STATE. Round 8
       said `Nothing staged` at the queue and `No trial or focus active — stage a
       change from a finding to start one.` at a case file, and nothing about the
       world differs between those two screens: the dock reports what is staged,
       and at both levels the answer is nothing. The finding scene's version also
       carried a prose em dash, which DESIGN.md rule 1 forbids outright. One line
       for the one state, with the invitation as its second clause. */
    dock: {
      kind: KIND.idle,
      idle: 'Nothing staged · stage a change from a finding to start a trial',
    },

    /* ---------- ROUND 9, FINDING 1: THE FOOTER RAIL'S TWO WORDS ----------
       DESIGN.md rule 8 — user copy uses `Correction factor` and `Carb ratio`;
       `ISF` and `I:C` are reserved for engine code and technical documentation.
       The rail is lifted from the running app's DOM (chrome.extracted.html, which
       harness.mjs rewrites on every run), so the respelling is applied by
       surface.js at injection rather than by editing an extracted artifact that
       the next harness run would overwrite. Reported as an app-side voice defect
       the mock is standing in front of, not as something the mock fixed. */
    footerVoice: FOOTER_VOICE,

    /* ---------- ROUND 7, ITEM 1: THE INSTRUMENT ROW ----------
       The shipped `View` and `Window` groups, extracted above. The mock does not
       drive either one — its data is the Lows view over the 24 h window and
       nothing on this surface re-scopes it — so each group prints its standing
       coordinate pressed. The row is here because it is the surface's toolbar in
       Diagnose and in Verify alike, and because ALIGN belongs in it. */
    toolbar: await shippedInstruments(),

    /* ---------- ROUND 6, FORM 3: THE PROJECTION TOGGLE ----------
       The amendment's projection toggle: a switch over the already-selected
       data, never a data selector, and present only where the canvas is showing
       a factor's events. The two option words are the amendment's own.
       ROUND 7, ITEM 1 — it is the toolbar's THIRD GROUP now, in the same
       `cap` + `seg` form as View and Window. Round 6 put it in the canvas head,
       where it forced a third track into a two-track head and rendered poorly.
       Its visibility rule is unchanged: never at the queue root. */
    projection: {
      label: 'Align',
      options: [
        { key: 'clock', label: 'By clock' },
        { key: 'event', label: 'By event' },
      ],
    },

    /* ---------- ROUND 6, FORM 3: what a drilled event puts on the clock ------
       One entry per low in the capture: the captured day whose real trace is
       laid over the pooled envelope, and the lens's own alignment window
       carried onto the clock axis as the shipped renderer's window brace. Both
       are handed straight to `renderCanvas`'s `trace` and `window` inputs. */
    dayTraces,
    clockDrills,

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
        /* ROUND 5, BLOCK 1 — THE CHIP IS GONE, IN BOTH SCENES. It was a bordered
           token with its own dismiss `×`, sitting on the crumb baseline beside a
           crumb root that already walks back — two dismissals for one filter.
           The count becomes a crumb ACCESSORY: a tabular number right-aligned to
           the gutter, no border, no button.
           The number itself does not move. It is still the PROJECTION's episode
           count standing beside a lens table of seven, and that disagreement
           between the two fixtures stays deliberately unreconciled. */
        /* ROUND 6, SEND-BACK 4 — THE CRUMB'S BARE `1`. Beside a leaf reading
           `Over-treated low`, a lone right-aligned `1` reads as a rank or an
           index, not as a count, and it is the one figure on the surface with
           no noun anywhere near it. THE NUMBER DOES NOT MOVE: resolution ruling
           9 fixes what this accessory carries — "the clicked filter's own
           count, the number the queue row promised" — and its example form is
           `Over-treated low · 8 events`, count AND noun. So it takes the noun
           the projection's own field name gives it (CONTEXT.md's `Episode`) and
           stays the projection's 1, standing beside a lens table of seven. That
           disagreement is deliberate and stays (`provenance.disjoint`). */
        crumbCount: `${chipCount} ${chipCount === 1 ? 'episode' : 'episodes'}`,
        /* The subject strip: the flavor tag and the appearance denominators,
           WITHOUT the title — the crumb directly above owns the name. */
        subject: {
          flavor: row.flavor,
          flavorWord: FLAVOR[row.flavor].word,
          flavorGlyph: FLAVOR[row.flavor].glyph,
          appearances: row.detail.parts,
        },
        judgment: {
          /* SETTLED CONTENT — the round-4 tally stands, untouched this round by
             instruction. It carries the support word a sentence cannot, and it
             is the data this scene is about.
             ROUND 5, BLOCK 3 (TRANSFERRED): its trailing `.slot-say` sentence is
             DELETED and nothing replaces it. Its two counts were residue and
             have gone to `occurrences.residue`, where residue now lives. */
          counts: ['fired', 'near_rule', 'neutral'].map((key) => ({
            key,
            n: lens.population.counts[key],
            label: COHORT_LABEL[key],
            support: cohortByKey[key].support[0].toUpperCase() + cohortByKey[key].support.slice(1),
          })),
        },
        /* ROUND 5, BLOCK 6 — the near-rule hedge no longer prints in this
           column. It hangs off the canvas legend's Near-rule key instead (see
           `canvasFor`'s `nearRuleNote`), which is where the phrase is already
           on screen and attached to something drawn. */
        /* ROUND 2 ITEM 4 — the histogram is gone. These sentences stand on their
           own arithmetic: the busiest two-hour band, and what covers it. The
           band's own share is printed against the total, because on this fixture
           the busiest band holds 1 of 7 and calling that a concentration would
           be a claim the data does not make. */
        /* ROUND 6, SEND-BACK 6 — THE COINCIDENCE PROSE TAKES THE RESOLVED-ROUTE
           TREATMENT. It was two sentences and two inline `View …` links: a
           `.slot-say` line, then a `.slotlink` sentence broken around two
           buttons — the last prose in the column, sitting directly above a
           table the amendment puts at dense register with no prose row over it.
           Block 6 already settled what a route looks like here: ONE right-
           aligned action, no sentence, no apology. These are routes, so they
           take that form, and the fact the sentences carried — which band, how
           many of how many — stays as the section's own figure line at the
           residue rank rather than as a paragraph. Every string below is the
           same derivation round 2 built; only the shape changes. */
        coincidence: {
          band: `Busiest two-hour band ${band} · ${clock.peak.n} of ${clock.total}`,
          /* ROUND 9, FINDING 1 — THE TWO ROUTES SPEAK THE SAME REGISTER AS THE
             QUEUE. They were `00:00 basal slot · …` and `Morning I:C block
             00:00–12:00 · …`: a second spelling of a basal slot two levels below
             the queue's, and the engine's `I:C`, which DESIGN.md rule 8 reserves
             for engine code and technical documentation while user copy says
             carb ratio. One slot format on this surface (`Basal · 00:00`), and
             the parameter named the way the queue row that opens it names it.
             Every value is still the shipped lane's own — only the wording. */
          routes: [
            { label: `Basal · ${cell.label} · ${VERDICT_KEY[cell.verdict]} ›` },
            { label: `${block.label} carb-ratio block ${block.span} · ${VERDICT_KEY[block.verdict]} ›` },
          ],
        },
        occurrences: {
          /* The finding scene keeps its round-4 cap meta — block 4's
             frame-denominator rewrite is a POPULATION move (the frame is what
             changes the denominator there), and this scene has one frame. */
        /* ROUND 8, ITEM 1 — THE CAP'S NUMERATOR IS A RUNTIME FACT NOW, so the
               build emits the cap's PARTS and the surface composes the line. Under
               wireframe H3 the table draws one verdict at a time, and which verdict
               that is cannot be decided here — the same reason round 5 stopped
               emitting a row budget. The denominator, the window and the column key
               are still the frame's own, and the settled rule is unchanged: the
               meta counts what the table draws. */
          cap: { key: 'entry → worst · Δ', denominator: lens.population.denominator, window: windowLabel },
          /* ROUND 9, FINDING 8 — the fact, on the band's own line. */
          bandMeta: `${lens.occurrences.length} of ${lens.population.denominator} lows in ${windowLabel}`,
          /* ROUND 5, BLOCK 3 + 7, TRANSFERRED. The judgment block's trailing
             sentence carried two counts the tally has no cell for; they are
             residue, and residue now has one form — an unfilled line after the
             last row. The sentence is deleted, not moved twice. */
          /* ROUND 9, FINDING 13 — parts, closed against the denominator at paint
             time. See the factor frame above. */
          residueParts: {
            another_factor: lens.population.counts.another_factor,
            excluded: lens.population.counts.excluded,
          },
          /* One group, unchanged from round 2 — the finding's own title and its
             evidence tier. ROUND 5, BLOCK 5 transfers only the count's FORM: a
             bare number, printed by the renderer only where a frame draws more
             than one group, which this scene never does. */
          groups: [{
            key: 'fired',
            /* ROUND 6, SEND-BACK 5 — THE GROUP RULE READS `Rule matched`. The
               finding scene led its one group with the finding's own title,
               which the crumb one level above already prints — so the column
               said `Over-treated low` twice and, worse, said it in the slot
               where every other frame on this surface names a COHORT. The group
               rule is the cohort's shipped label (`COHORT_LABEL.fired`) in both
               scenes; which finding is being read is the crumb's job. */
            lead: COHORT_LABEL.fired,
            /* ROUND 8, ITEM 1 — the causal phrase the production table's own
               header prints. Its `, <tier>, not confirmed` tail is the shipped
               painter's, derived there from the occurrences themselves; this
               build no longer assembles the header string. */
            /* FINDING 9 — nothing precedes the partition word. */
            cause: null,
            count: firedOccurrences.length,
            occurrences: firedOccurrences.map((o) => evidenceOccurrence(o)),
          }],
        },
        canvasHead: { title: 'Low response comparison', context: 'excursion nadir · −5 h to +2 h' },
        canvas: canvasFor(lens),
        /* ROUND 9, FINDING 4 — THE CASE FILE DRAWS ALL THREE VERDICTS, exactly
           as the population frame does. Round 8 plotted the finding's SEVEN
           fired events and nothing else, one line under a judgment block reading
           `7 Rule matched · 4 Near rule · 6 Rule did not match` — so the reader
           was told seventeen lows were in play and shown seven, at the one level
           where the near-misses are the whole argument.
           The amendment settles it in its own words: "there is no cohort filter
           anywhere — the evidence canvas always draws all three states (event
           fired / near miss / not owned)." It is the lens's full occurrence set
           now, each dot carrying its own verdict, and `markCanvas` accents the
           finding's matched set against the other two. The case file differs
           from the population frame by EMPHASIS, never by population. */
        clock: { occurrences: lens.occurrences.map((o) => clockDot(o)) },
        traces: traceMap(capture, fired.occurrence_ids, coords),
      },

      [POPULATION_ID]: {
        kind: 'population',
        /* ROUND 4 ITEM 13 — the leaf is the population noun the queue row now
           carries, so the crumb and the row that opened it read the same. */
        crumb: { root: 'Findings', here: 'Lows' },
        /* ROUND 5, BLOCK 1 — the count, as a crumb accessory; ROUND 6,
           SEND-BACK 4 — with the noun its own crumb leaf gives it, so the two
           scenes' accessories read as the same kind of statement. */
        crumbCount: `${wide.population.denominator} lows`,
        subject: null,
        /* ROUND 5, BLOCK 3 — THE SUMMARY SENTENCE IS DELETED, AND NOTHING
           REPLACES IT. Every number it carried is now read off the segmented
           control directly above where it stood: 20 is the crumb accessory, 7
           and 1 and 10 are the three segment counts, and "claimed by a finding"
           is what having a factor's name on a segment MEANS. A sentence whose
           every clause is a caption for the control beside it is not a summary,
           it is a second rendering of the same three numbers in prose.

           The judgment block therefore has no body at this level at all: no
           tally (the segments are the tally) and no sentence. */
        judgment: null,
        /* ROUND 6, FORM 1 — THE SAME THREE OPTIONS, NOW A COLLAPSING DROPDOWN.
           Round 5's segmented control is retired: the amendment settles the
           control as "a collapsing dropdown at the top of the inspector column
           … at rest one compact line — current factor + tabular count + chevron
           … expanded in place to the full factor list, overlay-not-push,
           auto-collapse on choice", because a one-row segmented control cannot
           hold 6–10 factors and the list is open-ended. The DATA is unchanged —
           the same options, in the same order, from the same claim tally. */
        segments,
        /* The expanded list's own header (wireframe G): what is being chosen,
           how many there are, and where. */
        /* ROUND 9, FINDING 9 — `FACTOR · 3 IN LOWS` is retired. CONTEXT.md's **Lever**
       entry lists "factor" under _Avoid_ outright, so the surface's own control
       label was contradicting the glossary while the column below it spent three
       more nouns on the same idea. Read as English rather than as a field name,
       which is also what drops the `·` the old form needed to hold two halves
       together. */
    factorListHead: `${segments.length} levers in Lows`,
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

  /* ---- ROUND 8, ITEM 1: the production evidence table, lifted not copied ---- */
  const evidenceTable = await shippedEvidenceTable();
  await writeFile(join(HERE, 'evidence-table.extracted.js'), evidenceTable);

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
    + `  queue canvas — pooled glucose: ${data.queue.canvas.pooled.bins.length} bins, `
    + `${data.queue.canvas.pooled.captured_days} captured days, ${data.queue.canvas.basal.length} basal slots `
    + `(${PAYLOAD})\n`
    + `  finding scene — crumb count "${finding.crumbCount}" (projection), `
    + `${finding.occurrences.groups[0].occurrences.length} `
    + `fired events (lens), busiest band ${band} ${clock.peak.n}/${clock.total}\n`
    + `  population scene — ${wide.population.denominator} lows, ${claimed} claimed / ${unclaimedIds.length} `
    + `unclaimed; ${Object.keys(population.frames).length} frames, default "${population.defaultFactor}"\n`
    + Object.values(population.frames).map((f) => `    frame ${f.key} — `
      + `${f.canvas ? `${f.canvas.cohortOrder.length} cohorts` : 'HONEST EMPTY CANVAS'}, `
      + `${f.occurrences.groups.length} group(s), `
      + `${f.occurrences.groups.reduce((n, g) => n + g.occurrences.length, 0)} rows\n`).join('')
    + `app-base.extracted.css written — ${blocks.length} style block(s) from frontend/index.html\n`
    + `evidence-table.extracted.js written — the production renderEvidence, ${evidenceTable.split('\n').length} lines `
    + 'from frontend/diagnose-workstation.js\n',
  );
}

await main();
