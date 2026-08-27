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

Deepen the existing evidence-population policy so the representative occurrence
and its Finding-relative outcome coordinate are selected once. The serialized
Findings projection and the retained case-file builder consume that shared policy
result instead of independently choosing a clock time.

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
