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
import { BIN_MINUTES, BIN_COUNT, hhmm } from './diagnose-workstation-chart.js';
import { blockKey } from './diagnose-workspaces.js';

/** The mock's `buildEnvelope()` return, rebuilt from the server's pooled feed.
 *
 *  The mock pools 30 days of raw CGM in the browser. The app pools server-side
 *  (`/explore/time-of-day` → `pooled`) and never ships the raw readings, so this
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

/** The mock's `buildMealMarkers()` return, from the server's half-hour buckets.
 *
 *  Term 25's height channel is meals per CAPTURED DAY, and `envelope.days` is
 *  the divisor the chart applies — so a bucket only has to carry its own count.
 *  `index` is the chart's category index, the one thing the server does not
 *  know about (it is a property of the 96-category clock axis). */
export function markersFromPooled(pooled) {
  return (pooled?.meals || []).map((bucket) => ({
    minute: bucket.minute,
    index: Math.round(bucket.minute / BIN_MINUTES) % BIN_COUNT,
    count: bucket.count,
    carbs: bucket.carbs,
    medianCarbs: bucket.median_carbs,
    insulin: bucket.insulin,
  })).sort((a, b) => a.minute - b.minute);
}

/* `basal:<slot>` and `blockKey(block)` are the keys the app's Plan staging
   already speaks. They are stamped onto each row here so the ported surface
   never learns the Plan's key format — and `blockKey` is imported rather than
   restated, so the two can't drift. */

/**
 * Build the mock's four captures from one API payload.
 *
 * `payload` is `{analyze, scenarios, evidence, exposures}` — the app's
 * `/analyze`, `/scenarios`, `/explore/time-of-day` and `/explore/exposures`.
 * `loadDay(date)` is optional; when supplied, the occurrence level's real CGM
 * trace is fetched on demand (see `dayMap`).
 */
export function toCaptures(payload = {}, { loadDay = null, onDayLoaded = null, state = null } = {}) {
  const analyze = payload.analyze || {};
  const evidence = payload.evidence || {};
  const feed = payload.exposures || {};
  // Keep the asserting replay on the payload's matching I:C evidence (#654).
  const blocks = ((state === 'icassert' && analyze.ic_blocks_asserting) || analyze.ic_blocks || []).map((block) =>
    ({ ...block, __planKey: blockKey(block) }));
  const basal = (analyze.basal || []).map((slot) =>
    ({ ...slot, __planKey: `basal:${slot.slot}` }));

  return {
    /* The mock's explore-day capture. `isf` and `programmed_ic` are the status
       line's identity figures; the mock reads nothing else off this object
       except `days`. */
    day: {
      isf: (analyze.isf || [])[0]?.current ?? null,
      programmed_ic: (blocks[0]?.current_values || [])[0] ?? null,
      days: dayMap(loadDay, onDayLoaded),
    },
    exposureCapture: {
      window: feed.window || evidence.window || { start: null, end: null },
      exposures: feed.exposures || {},
    },
    /* The mock's settings-audit capture carries several named states and binds
       `trial`; the API returns one analysis, so it fills that slot. */
    audit: {
      states: {
        trial: {
          as_of: (analyze.generated_at || '').slice(0, 10),
          analysis: { window_days: analyze.window_days, basal },
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
       findings projection (`GET /diagnose/findings`, ADR 730) and `watched` is the
       single active watched-change object the outcomes payload already resolves
       (`watched_change`, ADR 0029). Both are rendered verbatim (lock terms 40, 47),
       so nothing here reshapes either: renaming a field is the first step towards
       composing one. */
    findings: payload.findings || null,
    watched: payload.watched || null,
    envelope: envelopeFromPooled(evidence.pooled),
    markers: markersFromPooled(evidence.pooled),
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
 * `day.days` — a lazily-filled map of date → that day's timeline record.
 *
 * The mock has all 30 days in memory because its capture holds them. The app
 * does not ship raw CGM, so the one place a day is needed (the occurrence
 * level's real trace, lock term 19) fetches it. A Proxy is used so the ported
 * code keeps reading `day.days[date]` synchronously: a miss returns undefined,
 * which is exactly the branch term 19 already specifies ("No trace captured for
 * this day"), and the repaint that follows the fetch replaces it with the trace.
 * A fabricated trace is never substituted — that is the term's other half.
 */
function dayMap(loadDay, onDayLoaded) {
  const cache = {};
  const pending = new Set();
  if (!loadDay) return cache;
  return new Proxy(cache, {
    get(target, key) {
      if (typeof key !== 'string' || key in target) return target[key];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || pending.has(key)) return undefined;
      pending.add(key);
      Promise.resolve(loadDay(key)).then((record) => {
        pending.delete(key);
        if (!record) return;
        target[key] = record;
        onDayLoaded?.(key);
      }).catch(() => { pending.delete(key); });
      return undefined;
    },
  });
}
