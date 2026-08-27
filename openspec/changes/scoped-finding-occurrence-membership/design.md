# Scoped Finding occurrence membership

## Existing decisions

ADR 202 already makes `evidence_population.py` the owner of each behavioral
lever's recurrence population, occurrence identity, comparison population, anchor,
and window. It also requires Meal bolus fell short to represent an eligible meal by
one worst episode everywhere. The behavioral-layer baseline requires a Finding case
file's clock membership to use the Finding-relative outcome time.

This change repairs conformance to those decisions; it does not replace or
supersede them.

## Repair shape

The authoritative consequence-anchor mapping already exists as `outcome_kind`.
The serialized Findings projection reaches it through
`window_membership.outcome_minute`, and the ordinary case-file association path
uses it when choosing its `outcome_t`. Only the custom recurrence path substitutes
the episode boundary.

Keep the repair local to `finding_case_file.py`: one small helper may choose the
Finding-relative outcome anchor for both the ordinary association and custom
recurrence paths, with each path retaining its existing fallback. This is the
second real caller that earns the helper. Do not move clock membership into
`evidence_population.py`; that module already owns recurrence identity and
population, while `outcome_kind` owns where the consequence landed.

The public HTTP preparation route remains the regression surface. Its synthetic
arrangement must put the representative High outcome and the surrounding episode
boundary on opposite sides of a scoped window edge, fail on the pre-fix code for
the observed consistency reason, and return one internally coherent preparation
after the repair.

The existing fail-closed contract remains load-bearing: a real count, population,
or trace contradiction still returns `500 inconsistent_projection`; the repair
must not turn that state into partial success.

## UI Craft revise contract

- Safe start: `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`
- Manufactured source: `mockups/revise-e2e.synthetic/harmonic.sqlite`, generated
  by `scripts/gen_revise_e2e_db.py`
- Frozen behavior ledger: `mockups/finding-evidence-routing.behavior.md`
- App-only replay: `frontend/diagnose-workstation-behavior.replay.mjs`

The surface keeps its existing genuine-failure story and visual treatment. This
ticket changes which backend populations are contradictory; it does not redesign
the unavailable state.
