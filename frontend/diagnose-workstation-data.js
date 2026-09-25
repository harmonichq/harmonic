/* Diagnose workstation — API payload → the shapes the ported mock consumes.
 *
 * This file is the ONLY new logic the port is allowed (mock→app process, R1:
 * "new code is limited to adapters"). The locked mock loads four capture files
 * off disk; the app has an HTTP API. Nothing here re-derives a number, applies a
 * threshold, or decides a verdict — it renames and regroups, and every value it
 * emits came off the wire.
 *
 * Vue-free and DOM-free on purpose, so it is node-testable with no importmap
 * (repo convention; see frontend/scenario-chart.js).
 */
import { hhmm } from './diagnose-workstation-chart.js';
import { blockKey } from './diagnose-workspaces.js';

/** The mock's `buildEnvelope()` return, rebuilt from the server's pooled feed.
 *
 *  The mock pools 30 days of raw CGM in the browser. The app pools server-side
 *  (`/api/explore/time-of-day` → `pooled`) and never ships the raw readings, so this
 *  renames the server's bins onto the arrays the chart module already indexes.
 *  Field-for-field, no arithmetic: median→p50, n→counts, raw_n→raw. */
export function envelopeFromPooled(pooled) {
  const bins = pooled?.bins || [];
  const col = (key) => bins.map((bin) => (bin[key] == null ? null : bin[key]));
  return {
    labels: bins.map((bin) => hhmm(bin.minute)),
    p10: col('p10'),
    p25: col('p25'),
    p50: col('median'),
    p75: col('p75'),
    p90: col('p90'),
    counts: bins.map((bin) => bin.n || 0),
    raw: bins.map((bin) => bin.raw_n || 0),
    readings: pooled?.reading_count || 0,
    days: pooled?.captured_days || 0,
    pool: pooled?.pool_minutes ?? 45,
  };
}

/* `basal:<slot>` and `blockKey(block)` are the keys the app's Plan staging
   already speaks. They are stamped onto each row here so the ported surface
   never learns the Plan's key format — and `blockKey` is imported rather than
   restated, so the two can't drift. */

/**
 * Build the mock's audit and params captures from one API payload.
 *
 * `payload` is `{analyze, scenarios, evidence, exposures}` — the app's
 * `/api/analyze`, `/api/scenarios`, `/api/explore/time-of-day` and `/api/explore/exposures`.
 */
export function toCaptures(payload = {}, { state = null } = {}) {
  const analyze = payload.analyze || {};
  const evidence = payload.evidence || {};
  // Keep the asserting replay on the payload's matching I:C evidence (#654).
  const blocks = ((state === 'icassert' && analyze.ic_blocks_asserting) || analyze.ic_blocks || []).map((block) =>
    ({ ...block, __planKey: blockKey(block) }));
  const basal = (analyze.basal || []).map((slot) =>
    ({ ...slot, __planKey: `basal:${slot.slot}` }));

  return {
    /* The mock's settings-audit capture carries several named states and binds
       `trial`; the API returns one analysis, so it fills that slot. */
    audit: {
      states: {
        trial: {
          as_of: (analyze.generated_at || '').slice(0, 10),
          analysis: {
            window_days: analyze.window_days,
            basal_support_floor: analyze.basal_support_floor,
            basal,
          },
        },
      },
    },
    params: {
      ic_blocks: blocks,
      isf: analyze.isf || [],
      synthetic: payload.synthetic || null,
    },
    icMissing: '',
    /* #735 — carried through UNTOUCHED, not adapted. `findings` is the server-owned
       findings projection (`GET /api/diagnose/findings`, ADR 730) and `watched` is the
       single active watched-change object the outcomes payload already resolves
       (`watched_change`, ADR 0029). Both are rendered verbatim (lock terms 40, 47),
       so nothing here reshapes either: renaming a field is the first step towards
       composing one. */
    findings: payload.findings || null,
    casePreparation: payload.casePreparation || null,
    watched: payload.watched || null,
    envelope: envelopeFromPooled(evidence.pooled),
  };
}

/**
 * The two facts the ISF level reads off the analyzer, together because reading
 * one off the other is the bug they replace.
 *
 * `direction` remains the analyzer's classification and the server queue's register
 * source. `asserts_move` is the independent actionability verdict; exact true is
 * the only permission, so false, null, missing, and malformed inputs fail closed
 * without erasing direction. `nights` is the count the
 * estimate is clustered on (#177) — a detected rest window that produced no fit
 * supports nothing, so it is not counted.
 */
export function isfVerdict(row) {
  const evidence = row.evidence || {};
  return {
    direction: evidence.direction || null,
    canStage: row.asserts_move === true,
    nights: (evidence.night_fits || []).length,
  };
}

/**
 * Why a correction-factor row cannot stage, in the panel's own words, or null when
 * it can. The correction-factor panel's foot note and the findings queue's detail
 * line both read this one choice (ADR 469), so the two never word it differently.
 */
export function isfStageNote(row) {
  const { direction, canStage } = isfVerdict(row);
  if (canStage) return null;
  if (direction === 'strengthen' && row.current != null && row.recommended === row.current) {
    return 'The conservative step rounds to the current Correction factor, so there is no settings change to stage.';
  }
  if (direction === 'weaken') return 'No new number is available, so there is nothing to stage.';
  if (direction === 'strengthen') {
    return 'This result is held, so there is no settings change to stage; the estimate and interval remain visible.';
  }
  return `${row.estimate?.wide ? 'The interval is wide and no' : 'No'} direction is asserted here, so `
    + 'there is nothing to stage; the number and its interval are shown as measured.';
}
