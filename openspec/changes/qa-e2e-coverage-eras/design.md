# Design — QA E2E coverage eras

## Standing authority

The archived [ADR 190](../archive/2026-09-01-qa-e2e-database/design.md#adr-190--one-showcase-first-qa-database-with-isolated-coverage-cases)
remains authoritative for the one committed database, isolated temporary case
stores, fixed production clock, synthetic provenance, showcase ordering, and
strictly-greater-than-30-day era separation. The archived
[ADR 194](../archive/2026-09-01-qa-e2e-database/design.md#adr-194--dense-showcase-background-served-from-a-scratch-copy)
remains authoritative for the dense showcase and scratch-copy serve. This change
records no new ADR: the delivery rulings select work already allowed by those
decisions.

## Existing seam and required extension

`scripts/qa_e2e_cases.py` already owns three cases and the two materialization
primitives needed here: a dense 30-day showcase background and focused overlay
recipes. Settings snapshots are placed by each recipe through Store APIs; the
showcase now uses distinct instants for the behavioral snapshot and the earlier
and current I:C snapshots. `execute_case` runs the production `analyze`, exposure,
scenario, findings-projection, and I:C-history producers. `assert_expectation`
compares six observed collections as exact whole sets or counts, and the tests
prove that a perturbed expectation fails.

#192 extends that seam rather than creating a second fixture language. A coverage
case still materializes into its own temporary store. Its expectation additionally
names exact analyzer rows and absences; exact queue rows and absences for the
unscoped whole-day projection and any scoped clock query needed to expose `held`
or `blind`; the analyzer-stamped support counts; and `asserts_move`. Expectations
observe analyzer output only. Recipes never accept or write a verdict, status,
direction, held reason, register, queue row, or ranking.

## Era condition matrix

The table is the implementation map. “Produce” describes source data that must
drive the real analyzer to the stated condition; it is not permission to write
the condition into a fixture.

| Era | Analyzer-produced condition to prove | Queue contract |
| --- | --- | --- |
| Basal raise / lower | At least eight informative non-tie nights on the same side of programmed basal, surviving the family-corrected sign test; the median differs from current by at least the noise floor. The sign selects raise or lower (`safety.py:32-39,63-106,206-226`; `analyzers/basal.py:348-374,499-509`). | Exact `assert` row with matching direction and `asserts_move=true`. |
| Basal capped raise / lower | The supported condition above holds and the uncapped target lies beyond the ±20% step, yielding `capped (raise)` or `capped (lower)` (`safety.py:143-148,200-226`). | Exact `assert` row; the cap status and bounded recommendation remain exact analyzer fields. |
| Basal insufficient | A visible estimate differs from current, but the sign family returns no matching supported direction—especially a deliberately seven-night case below the eight-night floor—so `cap` returns `insufficient evidence` (`safety.py:63-71,192-222`; `analyzers/basal.py:503-509,562-564`). | Exact analyzer row with the support count and `asserts_move=false`; exact scoped `held` row and no global assert row. |
| Basal blind | No clean day yields an estimate, so `suggested is None` produces `no data` (`safety.py:197-204`; `analyzers/basal.py:499-509`). | Exact scoped `blind` row and no global row (`findings_projection.py:77-84,647-662`). |
| Basal no baseline | A clean estimate exists but no current programmed value exists, yielding `no baseline` and no stageable move (`safety.py:200-204`; `result.py:156-166`). | Exact scoped `held` row, exact missing current value, and no global assert row. |
| Basal no change | The bounded estimate is within 0.05 U/h of current, yielding `no change` (`safety.py:143-148,212-214`). | Exact analyzer row and absence from both scoped and global queue projections (`findings_projection.py:77-84,647-662`). |
| Basal recurring-low lower | Recurring basal-attributed lows nudge a slot whose clean median is below current, or which has no clean median, to `lower (recurring lows)`; this safe-direction harm verdict may override clean-window sufficiency (`safety.py:229-279`; `analyzers/basal.py:510-522`). | Exact lower `assert` row with `asserts_move=true`, including the zero-clean-day variant reading as an assert rather than blind (`findings_projection.py:647-655`). |
| Basal recurring-low gate | A low gates a would-be raise, or recurring lows meet a clean median at/above current, holding at current as `held (recurring-low gate)` (`safety.py:238-260,268-283`). | Exact scoped `held` row, `asserts_move=false`, and no global assert row. |
| ISF strengthen | Fully observed rescue history is silent, no correction-low or correction-rescue day exists, a non-wide night median is below programmed, the side-vote Wilson floor passes, and the same signal held at the prior decision point; the half-gap recommendation differs from current (`analyzers/isf.py:509-525,611-622`). | Exact `assert` row with `direction=strengthen`, a recommendation, priority eligibility, and `asserts_move=true`. |
| ISF weaken / direction-only | Correction-caused low days or correction-attributed rescue days clear the recurrence bar. The analyzer emits `direction=weaken` but deliberately no recommendation; its half-gap target is pricing-only (`analyzers/isf.py:528-591,818-827`). | Exact `assert` register row with `asserts_move=false`, no recommendation, and no queue rank; never stageable (`analyzers/isf.py:475-479,834-844`; `findings_projection.py:410-449`). |
| ISF held | An estimate is visible but no direction is owned: a single low gates strengthen, rescue observation is incomplete, evidence is wide, the band confirms current, or a one-window signal has not held twice (`analyzers/isf.py:593-628`). | Exact `held` row with `asserts_move=false` and the analyzer annotation as reason. |
| I:C raise / lower | A numeric block has at least eight effective closed meal runs, a non-wide band excluding programmed, a nonempty on-regime reading on the same side, and a half-gap recommendation different from current. A larger ratio raises I:C (less insulin); a smaller ratio lowers I:C (more insulin) (`analyzers/ic.py:120-163,1449-1472,2503-2523`). | Exact `assert` row with block direction, support count, and `asserts_move=true`. |
| I:C capped raise / lower | The same four eligibility conditions hold and the half-gap exceeds the ±20% bound, so the recommendation stops at that bound (`analyzers/ic.py:1449-1464`). | Exact `assert` row and exact bounded recommendation. |
| I:C held | A numeric, band-excluding block names a move but the regime bracket straddles programmed, a meal-owned low gates tightening, or a pre-empted low gates tightening; `held_reason` is analyzer-owned (`analyzers/ic.py:2448-2501,2524-2526,2633-2643`). | Exact `held` row, `asserts_move=false`, and no global assert row. |
| I:C quiet / collecting | A block is collecting, below the eight-run floor, unmeasured alone, agrees with programmed, or otherwise has neither `asserts_move` nor `held_reason` (`analyzers/ic.py:2430-2446,2638-2643`). Include a seven-run below-floor case and assert the eight-run threshold separately from the display minimum. | Exact analyzer block and explicit absence from scoped and global queue rows (`findings_projection.py:369-408`). |
| I:C history register | A snapshot-proven past block identity differs from the current identity, is ever publishable, and has enough in-window runs for an active measurement (`analyzers/ic.py:2198-2278`). | Exact active `history` row and exact nonempty projected history series; current identities and aged-out/unavailable histories are absent from the active queue. |

## Concatenation and isolation

The generator appends every #192 coverage era before the existing showcase era.
After all writes it queries the materialized rows and fails unless the showcase is
last in basal/CGM event time and settings-snapshot order, every earlier snapshot
precedes every showcase snapshot, and every earlier era's last basal/CGM event is
strictly more than 30 days before the showcase's first. Those are enforced facts,
not timestamp-offset comments. The same catalog case remains independently
runnable and contains only its own source rows and snapshots.

Production composition stays unchanged: `window_days=30`, `now` is derived from
the latest basal/CGM event in each store, I:C blocks retain their fixed 90-day
analysis span, and IOB remains bolus-only reconstruction. Every manufactured date
is earlier than 2025-07-01.

## Exactness and failure evidence

The expectation comparison is whole-set equality for analyzer rows, every queried
queue, and every explicit absence. Tests deliberately perturb one expected
analyzer row, one queue row or absence, one support count, and one `asserts_move`
value and require each perturbation to fail. Scenario and I:C-history outputs that
were previously only exercised become row-for-row expectations where task 1 uses
them. No subset or “contains” assertion can satisfy this contract.

Every committed artifact is generator-built and provenance-stamped. New literal
timestamp series in scripts or tests carry the contamination scan's
`# SYNTHETIC-FIXTURE: <reason>` marker; no real snapshot, `.env`, `tconnect-data/`,
live fetch, or normal serve enters this work.

## Budgets and stop rule

The inherited measured baseline and limits live in
`coverage-appendix.md`. After appending the eras, the implementer records the same
four measurements. If the database exceeds 25 MiB, logical `--check` exceeds 30
seconds, the focused suite exceeds 90 seconds, or any case exceeds 15 seconds, the
phase stops before committing a replacement database and returns the split
decision to the operator. Limits are not raised in this ticket. CI keeps the
existing three-minute drift-step timeout for runner variance.

## Change lifetime

This change remains active after task 1. Task 2 adds #193's behavioral and
verdict-band eras. Task 3 completes the remaining revise-e2e migration and
evidence-based retirement, then adds agent-facing guidance to `AGENTS.md` and
`CONTEXT.md` for maintaining eras and using the QA database for UI decisions.
Only task 3 archives the change.
