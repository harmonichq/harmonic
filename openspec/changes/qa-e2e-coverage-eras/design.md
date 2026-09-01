# Design — QA E2E coverage eras

## Standing authority

The archived [ADR 190](../archive/2026-09-01-qa-e2e-database/design.md#adr-190--one-showcase-first-qa-database-with-isolated-coverage-cases)
remains authoritative for the one committed database, isolated temporary case
stores, fixed production clock, synthetic provenance, and showcase ordering. The archived
[ADR 194](../archive/2026-09-01-qa-e2e-database/design.md#adr-194--dense-showcase-background-served-from-a-scratch-copy)
remains authoritative for the dense showcase and scratch-copy serve. ADR 192
below closes the newly demonstrated cross-era history and storage-key hazards.

## Existing seam and required extension

`scripts/qa_e2e_cases.py` already owns three cases and the two materialization
primitives needed here: a dense 30-day showcase background and focused overlay
recipes. Settings snapshots are placed by each recipe through Store APIs; the
showcase now uses distinct instants for the behavioral snapshot and the earlier
and current I:C snapshots. `execute_case` runs the production `analyze`, exposure,
scenario, findings-projection, and I:C-history producers. Today
`assert_expectation` compares four collections exactly but reads only ISF row zero
and compares its rest windows and the I:C history series by integer count
(`scripts/qa_e2e_cases.py:187-210`).

#192 keeps this fixture language and splits implementation at the analyzer family.
Task 1 owns the shared expectation and generator contracts plus every basal era;
task 2 consumes those contracts for every ISF and I:C era. A coverage case still
materializes into its own temporary store. `QaExpectation` gains exact analyzer
rows and absences; scoped and unscoped queue rows and absences; support values;
`asserts_move`; ISF rest-window rows keyed by ISF row identity plus
`(date, start, end)` across every ISF row, including an expressible empty ISF
list; I:C history-series rows keyed by `run_id`; and the complete
`analysis["ic_history"]` catalog keyed by identity across every lifecycle. Each
key maps to the complete expected row payload. Recipes never accept or write a
verdict, status, direction, held reason, lifecycle, register, queue row, or rank.

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
| I:C history register | A snapshot-proven past block identity differs from the current identity, is ever publishable, and has enough in-window runs for an active measurement (`analyzers/ic.py:2198-2278`). | Exact active `history` row and exact keyed projected history series; current identities and aged-out/unavailable histories are absent from the active queue. |

Task 1 owns every basal row above and re-keys the three existing cases
(`showcase`, `setting-recommendation`, and `behavioral-precedence`) onto the
per-era allocation scheme below without changing their expectations. Task 2 owns
the ISF and I:C rows above, including the history-register era.

## ADR 192 — Contain cross-era history and storage identities

**Decision.** Cross-era containment is checked at the analyzer boundary, not the
projection boundary. `findings_projection._history_rows` omits every non-active
history row (`findings_projection.py:234-239`), while I:C history establishes
publishability from all runs and only its measurement from in-window runs
(`analyzers/ic.py:2240-2262`). Therefore `QaExpectation` carries both projected
`history_row_ids` and a full-catalog identity set for `analysis["ic_history"]`.
After concatenation, the generator compares the complete catalog identity set
across active, aged-out, and unavailable lifecycles with the isolated showcase's
expected full-catalog set and fails on any additional or missing identity.

Storage identity is allocated in two dimensions from the era index. Every
seq-keyed table gets a disjoint `era index × stride` block whose stride exceeds
one dense background. Every timestamp-keyed table gets a descending,
non-overlapping date slot computed from the same era index, with showcase fixed as
the newest slot. Recipes allocate only inside both assigned ranges. Generator
tests compare each concatenated table's stored row count with the sum written by
its recipes. The seq block catches silent `ON CONFLICT (seq_num) DO UPDATE`
merges, for which Store returns the submitted count (`store.py:601-608`); the date
slot prevents equivalent merges in timestamp-keyed `cgm_readings` and
`profile_settings`.

The executable spike and complete output in `generated-facts.md` exercise the
history hazard with 32 shifted carb-bearing boluses and a distinct carb-ratio
snapshot. The active projection remains unchanged while the full catalog gains an
aged-out identity, proving that projected `history_row_ids` cannot enforce the
boundary. Its timings are diagnostic: the rebuild measurement includes two full
`execute_case` compositions, and the two-case measurement runs in-process rather
than through pytest. Only its database size and isolated-case measurement are
comparable to the appendix baselines.

## Concatenation and isolation

The generator appends every #192 coverage era before the existing showcase era.
The catalog derives each earlier era's descending date slot and disjoint seq block
from its index. After all writes the generator queries materialized rows and fails
unless those ranges do not overlap; showcase is last in basal, CGM, bolus, and
settings time; every earlier snapshot precedes every showcase snapshot; and every
earlier era's latest basal, CGM, or bolus event is strictly more than
`ic.BLOCK_WINDOW_DAYS` plus `analyze._BOLUS_LEADIN` before showcase's earliest
event. It imports `ciq_autotune.analyzers.ic.BLOCK_WINDOW_DAYS` and compares with
`timedelta(days=BLOCK_WINDOW_DAYS) + _BOLUS_LEADIN`; it never repeats 90 as a
fixture literal. It also enforces additive row counts and full-catalog history
identity equality. These are queried facts, not timestamp-offset comments. Each
catalog case remains independently runnable with only its own rows and snapshots.

Production composition stays unchanged: `window_days=30`, `now` is derived from
the latest basal/CGM event in each store, and IOB remains bolus-only
reconstruction. The I:C block lane independently reads the trailing
`BLOCK_WINDOW_DAYS` plus one `_BOLUS_LEADIN` day (`analyze.py:89,413-422`), which
is why era separation exceeds that combined span rather than the 30-day
projection window. Every manufactured date is earlier than 2025-07-01.

## Exactness and failure evidence

The expectation comparison is whole-set equality for analyzer rows, every queried
queue, and every explicit absence. Tests deliberately perturb one expected
analyzer row, one queue row or absence, one support count, and one `asserts_move`
value and require each perturbation to fail. Scenario and I:C-history outputs that
were previously only exercised become row-for-row expectations in the task that
owns each era. No subset or “contains” assertion can satisfy this contract.

Every committed artifact is generator-built and provenance-stamped. New literal
timestamp series in scripts or tests carry the contamination scan's
`# SYNTHETIC-FIXTURE: <reason>` marker; no real snapshot, `.env`, `tconnect-data/`,
live fetch, or normal serve enters this work.

## Budgets and stop rule

The inherited measured baseline and limits live in
`coverage-appendix.md`. Each chunk records five measurements after its eras are
appended: database size, logical drift, focused QA suite, slowest isolated case,
and whole-pytest wall time. The first four retain limits of 25 MiB, 30 seconds, 90
seconds, and 15 seconds; whole pytest is limited to 8 minutes against the backend
job's 10-minute timeout (`.github/workflows/ci.yml:19`). Limits are not raised.

On any budget breach, or whenever a worker session ends before its sub-order's
Done-when, the worker commits its source and tests on the chunk branch, does not
regenerate or commit the database, opens no pull request, posts the five
measurements or stopping point on #192, and stops. Once generator behavior has
changed, the unchanged database intentionally leaves `--check` and its committed-
database test red on that stopped branch. That red state is evidence of an
incomplete chunk, not permission to replace the artifact; only a newer lock on
#192 resumes it.

## Change lifetime

This change remains active after tasks 1 and 2. Task 3 adds #193's behavioral and
verdict-band eras. Task 4 completes the remaining revise-e2e migration and
evidence-based retirement, then adds agent-facing guidance to `AGENTS.md` and
`CONTEXT.md` for maintaining eras and using the QA database for UI decisions.
Only task 4 archives the change.
