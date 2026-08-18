/* Build the exploration mockup's data and its extracted app chrome.
 *
 * ZERO HAND-TYPED DATA. Every number, label and sentence this emits is read
 * from one of the two authorized fixtures and passed through the SHIPPED
 * producer that owns it:
 *
 *   frontend/__fixtures__/findings-projection.json
 *     -> frontend/diagnose-findings-queue.js  (queueRows / queueMeta / FLAVOR)
 *          the clicked queue row, its flavor tag and its detail line
 *     -> frontend/diagnose-workstation-chart.js (buildSlotLane / cellAtMinute)
 *          the basal slot the finding's peak hour lands in
 *
 *   mockups/diagnose-event-comparison.synthetic/capture.json
 *     -> mockups/diagnose-event-comparison.synthetic/project.mjs
 *          (projectSyntheticCapture) — cohorts, per-point support, occurrence
 *          verdicts, and each fired event's own observed trace
 *     -> frontend/diagnose-workstation-chart.js (clockBuckets)
 *          the WHEN IT LANDS histogram over the lens's fired anchors
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
/** diagnose-workstation.js's EVIDENCE_CAP — five rows, then the expander. */
const EVIDENCE_CAP = 5;

const readJson = async (path) => JSON.parse(await readFile(join(ROOT, path), 'utf8'));

/* ---------------------------------------------------------------- verbatim
   Copied from the shipped modules that do not export them. Each is a byte
   transcription with its source named, held honest by the option-level and
   computed-style diffs in audit.mjs — never a second source of truth. */

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

async function main() {
  const projection = await readJson('frontend/__fixtures__/findings-projection.json');
  const capture = await readJson('mockups/diagnose-event-comparison.synthetic/capture.json');

  /* ---- the clicked queue row, through the shipped queue producer ---- */
  const globalWindow = projection.windows.global;
  const row = queueRows(globalWindow).find((r) => r.id === FINDING_ID);
  if (!row) throw new Error(`${FINDING_ID} is not in the projection's global window`);
  if (row.detail.kind !== 'appearances') throw new Error(`unexpected detail kind ${row.detail.kind}`);
  const raw = row.raw;

  /* Term 9 — the chip carries the CLICKED FILTER's own count, which is the
     projection row's episode count, and nothing from the lens. */
  const chipCount = raw.episodes;
  if (!Number.isInteger(chipCount)) throw new Error('projection row carries no episode count');

  /* ---- the lens, through the shipped synthetic producer ---- */
  const lens = projectSyntheticCapture(capture, { view: VIEW, factor: FACTOR, block: 'all' });
  const cohortByKey = Object.fromEntries(lens.cohorts.map((c) => [c.key, c]));
  const fired = cohortByKey.fired;
  const firedOccurrences = lens.occurrences.filter((o) => fired.occurrence_ids.includes(o.identity.id));
  if (firedOccurrences.length !== fired.routed_count) throw new Error('fired cohort membership drift');

  /* Each fired event's own observed trace, produced one selection at a time by
     the same projector the app's endpoint stub calls. */
  const traces = {};
  for (const id of fired.occurrence_ids) {
    const one = projectSyntheticCapture(capture, { view: VIEW, factor: FACTOR, block: 'all', occurrenceId: id });
    if (one.selection.state !== 'selected') throw new Error(`projector would not select ${id}`);
    traces[id] = one.selection.detail.glucose.map((p) => [p.minute, p.bg]);
  }

  /* ---- WHEN IT LANDS, through the shipped histogram builder ---- */
  const clock = clockBuckets(firedOccurrences.map((o) => ({ t: o.anchor.t })));

  /* ---- the coincidence lines, off the projection's own analysis inputs ---- */
  const lane = buildSlotLane(projection.inputs.analysis.basal);
  const icLane = buildIcLane(projection.inputs.analysis.ic_blocks);
  const cell = cellAtMinute(lane, clock.peak.startMin);
  const block = icBlockAtMinute(icLane, clock.peak.startMin);

  const data = {
    _generated_by: 'mockups/finding-evidence-routing.exploration/build.mjs',
    _note: 'SYNTHETIC. Derived from two committed synthetic fixtures through their shipped '
      + 'producers; nothing here is hand-written. Regenerate with `node '
      + 'mockups/finding-evidence-routing.exploration/build.mjs`.',

    provenance: {
      chip_and_header: 'frontend/__fixtures__/findings-projection.json (windows.global, row finding:over_treated_low)',
      coincidence: 'frontend/__fixtures__/findings-projection.json (inputs.analysis.basal, inputs.analysis.ic_blocks)',
      canvas_and_table: 'mockups/diagnose-event-comparison.synthetic/capture.json via project.mjs (view lows, factor over_treated_low)',
      disjoint: 'The two populations are disjoint by construction and are never reconciled.',
    },

    /* ---------- inspector: breadcrumb + scope chip ---------- */
    crumb: {
      root: 'Findings',
      here: raw.title,
      /* A DRILL level's meta names its own run (term 16). `queueMeta`'s
         `N findings · 30 days` is level-1 copy and belongs only there (term 45),
         so it is carried for reference and the crumb prints the window. */
      meta: `${globalWindow.findings_window.days} days`,
      level1Meta: queueMeta(globalWindow),
    },
    chip: {
      label: raw.title,
      count: `${chipCount} ${chipCount === 1 ? 'event' : 'events'}`,
      title: `Clear this filter and return to Findings`,
    },

    /* ---------- inspector: the finding header, verbatim from the projection ---------- */
    header: {
      title: raw.title,
      flavor: row.flavor,
      flavorWord: FLAVOR[row.flavor].word,
      flavorGlyph: FLAVOR[row.flavor].glyph,
      appearances: row.detail.parts,
      windowDays: globalWindow.findings_window.days,
      windowRange: `${fmtDate(globalWindow.findings_window.start)}–${fmtDate(globalWindow.findings_window.end)}`,
    },

    /* ---------- inspector: judgment block, absorbed from the retired lens pane ---------- */
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
      sourceWindow: `${fmtDate(lens.coordinates.source_window.start)}–${fmtDate(lens.coordinates.source_window.end)}`,
    },

    /* ---------- inspector: WHEN IT LANDS + coincidence ---------- */
    clock: {
      capMeta: `peak ${hhmm(clock.peak.startMin)}–${hhmm(clock.peak.endMin)} · ${clock.peak.n} of ${clock.total}`,
      total: clock.total,
      max: Math.max(...clock.buckets.map((b) => b.n), 1),
      buckets: clock.buckets.map((b) => ({
        n: b.n,
        peak: b === clock.peak && b.n > 0,
        title: `${hhmm(b.startMin)}–${hhmm(b.endMin)} — ${b.n} of ${clock.total}`,
        axis: hhmm(b.startMin).slice(0, 2),
      })),
      coincidence: {
        slotText: `Peak hour falls in the ${cell.label} basal slot (${VERDICT_KEY[cell.verdict]})`,
        blockText: `and in the ${block.label} I:C block, ${block.span} (${VERDICT_KEY[block.verdict]})`,
      },
    },

    /* ---------- inspector: the occurrences table ---------- */
    occurrences: {
      cap: EVIDENCE_CAP,
      capMeta: `entry → worst · Δ &nbsp;·&nbsp; ${firedOccurrences.length} of ${lens.population.denominator} in ${fmtDate(lens.coordinates.source_window.start)}–${fmtDate(lens.coordinates.source_window.end)}`,
      groupLead: raw.title,
      groupTier: firedOccurrences[0]?.verdict.evidence_tier?.replaceAll('_', ' ') || null,
      groupCount: `· ${firedOccurrences.length} episode${firedOccurrences.length === 1 ? '' : 's'}`,
      moreLabel: firedOccurrences.length > EVIDENCE_CAP ? `${firedOccurrences.length - EVIDENCE_CAP} more` : null,
      backLabel: `Show first ${EVIDENCE_CAP}`,
      rows: firedOccurrences.map((o) => ({
        id: o.identity.id,
        when: `${fmtDate(o.anchor.date)} · ${fmtTime(o.anchor.t)}`,
        tier: o.verdict.evidence_tier?.replaceAll('_', ' ') || 'unclassified',
        title: o.verdict.detail || '',
        ...evidenceCells(o.anchor),
      })),
    },

    /* ---------- the dock floor, idle ---------- */
    dock: { kind: KIND.idle, title: IDLE_TITLE, detail: IDLE_DETAIL },

    /* ---------- the canvas ---------- */
    canvas: {
      title: 'Low response comparison',
      context: 'excursion nadir · −5 h to +2 h',
      factorLabel: lens.coordinates.factor_options.find((o) => o.key === FACTOR).label,
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
      firedIds: fired.occurrence_ids,
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

  process.stdout.write(
    `data.json written — chip ${data.chip.count} (projection), `
    + `${data.occurrences.rows.length} fired events + ${lens.population.denominator} lows (lens), `
    + `peak ${data.clock.capMeta}\n`
    + `app-base.extracted.css written — ${blocks.length} style block(s) from frontend/index.html\n`,
  );
}

await main();
