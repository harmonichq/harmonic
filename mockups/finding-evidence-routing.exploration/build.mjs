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
 * ROUND 2, ITEM 5 — THE POPULATION ROWS ARE INVENTED BY THE RULING, NOT BY A
 * FIXTURE. `All lows · 20` / `All meals · 20` are the ruling's free-browse entry
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

/** VERBATIM — diagnose-event-comparison.js `summarySentence`. */
const summarySentence = (counts) =>
  `${counts.fired} events met this factor’s rule. ${counts.near_rule} sat narrowly outside it. `
  + `${counts.neutral} comparable events did not match any factor.`;

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

/** One canvas payload: the cohort medians, their support tiers and the legend. */
function canvasFor(lens, traces) {
  return {
    title: 'Low response comparison',
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
      legendDetail: c.support === 'withheld'
        ? `${c.routed_count} ${c.routed_count === 1 ? 'event' : 'events'} · aggregate not shown`
        : `${c.routed_count} events · ${pointStateSummary(c.points)} points`,
      points: c.points,
    }])),
    traces,
  };
}

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

  /* ---- ROUND 2 ITEM 6: who claims each low ----
     A low is CLAIMED by a finding when one of the view's factors routes it to
     `fired`; the tag is that factor's own label. An unclaimed low keeps the
     cohort label the filtered lens gave it. Both come off the capture's
     `routes`, the same signal the projector routes cohorts on. */
  const lowsView = capture.views[VIEW];
  const factorLabel = Object.fromEntries(
    lens.coordinates.factor_options.map((o) => [o.key, o.label]),
  );
  const claimOf = (id) => {
    const source = lowsView.occurrences.find((o) => o.id === id);
    const claimant = lowsView.factors.find((f) => source.routes[f]?.cohort === 'fired');
    if (claimant) {
      return {
        tag: factorLabel[claimant],
        finding: `finding:${claimant}`,
        /* The sideways route resolves only into a case file this exploration
           actually built. `correction_on_iob` has neither a projection row nor
           a scene, so its tag renders and routes nowhere — a named gap. */
        target: claimant === FACTOR ? FINDING_ID : null,
      };
    }
    return { tag: COHORT_LABEL[source.routes[FACTOR].cohort], finding: null, target: null };
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
  const wideCounts = wide.population.counts;
  const claims = {};
  for (const o of wide.occurrences) {
    const { tag, finding } = claimOf(o.identity.id);
    if (finding) claims[tag] = (claims[tag] || 0) + 1;
  }
  const claimed = Object.values(claims).reduce((sum, n) => sum + n, 0);
  const unclaimed = wide.occurrences.length - claimed;

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
      population_case_file: 'mockups/diagnose-event-comparison.synthetic/capture.json via project.mjs '
        + '(view lows, another=true) — cohort counts, plus per-occurrence claims read off the capture\'s `routes`',
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
      /* NOT IN ANY FIXTURE — see `provenance.population_rows`. */
      populationCap: 'Browse everything',
      populationRows: [
        {
          id: POPULATION_ID, derived: true, title: 'All lows', drills: true,
          count: wide.population.denominator, noun: 'lows', window: windowLabel,
        },
        {
          id: 'population:meals', derived: true, title: 'All meals', drills: false,
          count: meals.population.denominator, noun: 'meals', window: windowLabel,
        },
      ],
    },

    /* ---------- the dock floor, idle ---------- */
    dock: { kind: KIND.idle, title: IDLE_TITLE, detail: IDLE_DETAIL },

    /* ---------- the queue level's canvas: OUT OF SCOPE, and says so ---------- */
    rootCanvas: {
      title: 'Pooled glucose',
      context: 'queue level',
      note: 'The pooled glucose chart this level answers with is out of scope for this exploration. '
        + 'Pick a finding or a population row to route the canvas.',
    },

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
          summary: `${summarySentence(lens.population.counts)} `
            + `${lens.population.counts.another_factor} had another factor; `
            + `${lens.population.counts.excluded} of ${lens.population.denominator} lows were excluded as not safely comparable.`,
          counts: ['fired', 'near_rule', 'neutral'].map((key) => ({
            key,
            n: lens.population.counts[key],
            label: COHORT_LABEL[key],
            support: cohortByKey[key].support[0].toUpperCase() + cohortByKey[key].support.slice(1),
          })),
          boundaryNote: {
            lead: 'Near rule is disclosure only.',
            rest: ' It explains the boundary and never enters Priority, a suggestion, or Plan.',
          },
        },
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
          groupLead: raw.title,
          groupTier: firedOccurrences[0]?.verdict.evidence_tier?.replaceAll('_', ' ') || null,
          groupCount: `· ${firedOccurrences.length} episode${firedOccurrences.length === 1 ? '' : 's'}`,
          counterNote: null,
          moreLabel: firedOccurrences.length > EVIDENCE_CAP ? `${firedOccurrences.length - EVIDENCE_CAP} more` : null,
          backLabel: `Show first ${EVIDENCE_CAP}`,
          rows: firedOccurrences.map(occurrenceRow),
        },
        canvas: canvasFor(lens, traceMap(capture, fired.occurrence_ids, coords)),
      },

      [POPULATION_ID]: {
        kind: 'population',
        crumb: { root: 'Findings', here: 'All lows' },
        /* Item 6 spells this one as the bare count. */
        chip: { text: String(wide.population.denominator), title: 'Clear this filter and return to Findings' },
        subject: null,
        judgment: {
          summary: `${wide.population.denominator} lows in ${windowLabel}. `
            + `${claimed} are claimed by a finding; ${unclaimed} match none. `
            + `${wideCounts.excluded} were excluded as not safely comparable.`,
          /* The `em` slot carries a CLAIM state here, where a finding's case file
             carries a support tier. Same grammar, different fact — named. */
          counts: [
            ...Object.entries(claims).map(([label, n]) => ({ key: label, n, label, support: 'Claimed' })),
            { key: 'unclaimed', n: unclaimed, label: 'No finding claims these', support: 'Unclaimed' },
          ],
          boundaryNote: {
            lead: `${wideCounts.excluded} lows were excluded as not safely comparable.`,
            rest: ' They carry no comparable trace, so they are counted here and not listed below.',
          },
        },
        coincidence: null,
        occurrences: {
          cap: EVIDENCE_CAP,
          capMeta: `entry → worst · Δ &nbsp;·&nbsp; ${wide.occurrences.length} of ${wide.population.denominator} in ${windowLabel}`,
          groupLead: 'All lows',
          groupTier: null,
          groupCount: `· ${wide.occurrences.length} events`,
          counterNote: `${wideCounts.excluded} excluded — not safely comparable`,
          moreLabel: wide.occurrences.length > EVIDENCE_CAP ? `${wide.occurrences.length - EVIDENCE_CAP} more` : null,
          backLabel: `Show first ${EVIDENCE_CAP}`,
          rows: wide.occurrences.map((o) => ({ ...occurrenceRow(o), ...claimOf(o.identity.id) })),
        },
        canvas: canvasFor(wide, traceMap(capture, wide.occurrences.map((o) => o.identity.id),
          { ...coords, another: true })),
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
    + `  finding scene — chip "${finding.chip.text}" (projection), ${finding.occurrences.rows.length} fired events `
    + `(lens), busiest band ${band} ${clock.peak.n}/${clock.total}\n`
    + `  population scene — ${population.occurrences.rows.length} of ${wide.population.denominator} lows listed, `
    + `${claimed} claimed / ${unclaimed} unclaimed / ${wideCounts.excluded} excluded\n`
    + `app-base.extracted.css written — ${blocks.length} style block(s) from frontend/index.html\n`,
  );
}

await main();
