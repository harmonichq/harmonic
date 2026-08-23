/* Verify workstation adapter — the seam between /api/verify/trials and the ported
 * surface (#660).
 *
 * The locked mock read one capture file whose per-Trial breakdowns hung off
 * top-level maps (`_changes`, `_envelopes`, `_mealarcs`, `_rescue`, `_daydata`)
 * keyed by Trial id. The API answers per Trial instead, carrying those same
 * blocks inside each `selected` detail. This module is the only place that
 * knows about the difference, so the ported render code indexes exactly what it
 * always did — the mock-to-app process allows an adapter here and nothing else.
 *
 * Vue-free and DOM-free on purpose: node --test imports it directly.
 */

/**
 * Reshape the roster plus one detail response per Trial into the capture-shaped
 * object `createVerifyWorkstation` reads.
 *
 * `details` maps a Trial id to its `/api/verify/trials?selected=<id>` response (the
 * whole envelope or just its `selected` half — both are accepted, because the
 * caller that already unwrapped one should not have to re-wrap it). A Trial the
 * roster lists but whose detail failed to load is simply absent from the maps:
 * the surface can still name it in the popover without pretending to have its
 * evidence.
 */
export function toCaptures(roster = {}, details = {}) {
  const cap = {
    roster: { trials: roster.trials || [] },
    details: {},
    _changes: {},
    _envelopes: {},
    _mealarcs: {},
    _rescue: {},
    _daydata: {},
  };
  for (const [id, response] of Object.entries(details)) {
    const selected = response && (response.selected || (response.id ? response : null));
    if (!selected) continue;
    cap.details[id] = { selected };
    cap._changes[id] = selected.changes || [];
    cap._envelopes[id] = selected.envelopes || {};
    cap._rescue[id] = selected.rescue || {};
    cap._daydata[id] = selected.day_rows || {};
    // Only arc-target Trials carry a meal-anchored read; the hero picks its
    // family off the presence of this entry, exactly as the mock did.
    if (selected.meal_arcs) cap._mealarcs[id] = selected.meal_arcs;
  }
  return cap;
}

/**
 * The Trial the surface opens on: the state the URL asked for when that state is
 * present, else the maturing one (the live Trial), else the most recent.
 *
 * Exported for the openers, which assert that the rendered state equals the
 * requested one — the addressability drift the Diagnose port had to fix late.
 */
export function initialTrial(trials = [], wanted = null) {
  return trials.find(t => t.state === wanted)
    || trials.find(t => t.state === 'maturing')
    || trials[0]
    || null;
}
