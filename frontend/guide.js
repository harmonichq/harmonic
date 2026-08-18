/* =========================================================================
   #157 GUIDE TAB — pure render logic, extracted from the locked mockups
   (the archived catalog-cards and worked-example mocks, #157); only
   wrapped in ES `export`s here.

   VUE-FREE and DOM-FREE at import time so `node --test` can import it with no
   importmap and no DOM. The Vue component (GuideTab) lives in index.html and
   imports these helpers. The catalog payload is /api/catalog (build_catalog in
   ciq_autotune/analyzers/scenario/guide.py) — this module never hand-codes the
   lever/silence/tier copy; it only reshapes the payload for render.
   ========================================================================= */

/* ---- catalog / reference (catalog-cards-r2) ---------------------------- */

/**
 * Group the catalog's levers under their exposure denominator, in catalog
 * order, dropping any exposure with no levers. Mirrors the r2 mockup's
 * `groups()` computed — the catalog is presented grouped by "how it's
 * measured" (Meals / Lows / …), with the denominator shown once per group.
 *
 * @param {{ exposures: Array, levers: Array }} catalog
 * @returns {Array<{ value, label, denominator, levers: Array }>}
 */
export function guideGroups(catalog) {
  if (!catalog) return [];
  return catalog.exposures
    .map((e) => ({ ...e, levers: catalog.levers.filter((l) => l.exposure === e.value) }))
    .filter((g) => g.levers.length);
}

/**
 * The label for an evidence tier `value`, looked up in the payload's `tiers`
 * (so the chip text never drifts from EvidenceTier). Falls back to the raw
 * value when the tier is unknown.
 *
 * @param {Array<{ value, label }>} tiers
 * @param {string} value
 */
export function guideTierLabel(tiers, value) {
  const hit = (tiers || []).find((x) => x.value === value);
  return (hit && hit.label) || value;
}

/**
 * value -> title map from the catalog's levers. The payload owns the lever
 * titles now (retires scenario-chart.js's SCN_LEVER_TITLE): the Patterns tab's
 * scnHumanizeLever reads this map so episode-only levers get their real title.
 *
 * @param {{ levers: Array }|null} catalog
 * @returns {Object<string,string>}
 */
export function guideLeverTitles(catalog) {
  if (!catalog || !catalog.levers) return {};
  return Object.fromEntries(catalog.levers.map((l) => [l.value, l.title]));
}

/* ---- worked example (worked-split-synced) ------------------------------ */

/**
 * Render `**bold**` spans as <b>. The only markup the authored copy uses.
 * @param {string} [text]
 */
export function guideMd(text) {
  return (text || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

/**
 * The stage definition (one_liner/body/color) for a pipeline stage, looked up
 * in the payload's pipeline chain. Falls back to a muted, empty def so the
 * worked layout never throws on an unknown stage.
 *
 * @param {Array<{ step, color, one_liner, body }>} chain
 * @param {string} stage
 */
export function guideDefFor(chain, stage) {
  return (chain || []).find((d) => d.step === stage)
    || { color: '--muted', one_liner: '', body: '' };
}

/**
 * Build the worked example's row model: each step is one row carrying its
 * stage; the verdict rides INTO the row whose stage it resolves (the Lever
 * row); the pattern is appended as its own terminal row. Mirrors the mockup's
 * `rows` computed.
 *
 * @param {{ steps: Array, verdict: object, pattern: object }} worked
 * @returns {Array<{ kind, stage, step?, verdict?, pattern? }>}
 */
export function guideWorkedRows(worked) {
  if (!worked) return [];
  const out = worked.steps.map((step) => ({
    kind: 'step',
    stage: step.stage,
    step,
    verdict: worked.verdict && worked.verdict.stage === step.stage ? worked.verdict : null,
  }));
  out.push({ kind: 'pattern', stage: worked.pattern.stage, pattern: worked.pattern });
  return out;
}

/**
 * The tie-band CSS class flags for a worked row at index `i` of `total`.
 * `first` opens the spine, `terminal` marks a verdict/pattern resolution,
 * `last-terminal` hides the trailing spine on the final row.
 *
 * @param {{ kind, verdict }} row
 * @param {number} i
 * @param {number} total
 */
export function guideRowClass(row, i, total) {
  return {
    first: i === 0,
    terminal: row.kind === 'pattern' || !!row.verdict,
    'last-terminal': i === total - 1,
  };
}

/**
 * Compute the episode sparkline geometry (polyline path, threshold band, end
 * dot) from a series of glucose points. Pure geometry, ported from the mockup's
 * IIFE so it is node-testable; the default series is the teaching curve.
 *
 * @param {number[]} [pts]
 * @param {{ w?: number, h?: number, pad?: number, band?: number }} [opts]
 */
export function guideSpark(pts = [8, 10, 12, 11, 14, 20, 30, 42, 56, 72, 86, 100, 116, 130], opts = {}) {
  const { w = 200, h = 46, pad = 4, band = 0.72 } = opts;
  const max = Math.max(...pts), min = Math.min(...pts);
  const span = max - min || 1;
  const xy = pts.map((v, i) => {
    const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y];
  });
  const path = xy.map((p) => p.join(',')).join(' ');
  const bandY = h - pad - (h - pad * 2) * band;
  const last = xy[xy.length - 1];
  return { w, h, path, band: `${pad},${bandY} ${w - pad},${bandY}`, dot: { x: last[0], y: last[1] } };
}
