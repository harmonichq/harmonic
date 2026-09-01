# Design — QA E2E database

## ADR 190 — One showcase-first QA database with isolated coverage cases

**Decision.** The QA fixture is one deterministic, committed `qa-e2e` SQLite
database for supervised no-fetch UI work plus one temporary SQLite store per
coverage case. The committed database initially contains one final showcase era.
Its app-facing findings projection is showcase-era-only; every coverage-era
claim belongs to that era's isolated case store.

The production composition remains a fixed 30-day window. No API, analyzer,
exposure, scenario, or projection receives a test-only clock seam. A temporary
case store ends at its own latest basal/CGM event, so the existing production
composition supplies its cutoff.

The generator owns synthetic provenance and calibration. It uses only
manufactured, deterministic, pre-2025-07-01 values. Optional calibration may
open the operator's local snapshot read-only and emit only rounded aggregates to
the terminal or a private temporary location; no snapshot path, record,
timestamp, quantile, output, or derived value is committed.

When later coverage eras are concatenated with the showcase era, the generator
enforces all of the following from materialized rows before writing the
artifact:

- the showcase era is last in basal/CGM event time and settings-snapshot order;
- every prior-era settings snapshot precedes every showcase-era settings
  snapshot; and
- the interval from each prior era's latest basal/CGM event to the showcase
  era's earliest basal/CGM event is strictly greater than 30 days.

These conditions make the committed database's current 30-day projection a
showcase contract, not an assertion that earlier eras remain app-visible or
that their settings remain selected. Per-case stores contain only their case's
30-day source window and settings snapshots, preventing cross-era settings
ownership from entering coverage assertions.

The 2026-08-29 operator ruling changes delivery order only: #190 records this
decision and inventory; #191 builds the generator; then the showcase-only cut
of #194 commits the database, wires its drift check, and migrates the stage-1
harness and launch configuration. #192 and #193 add coverage eras afterward,
and the rest of #194 completes the migration and retirement. The #189 plan and
risk contract are otherwise unchanged.

The future `QaCase` / `QaExpectation` catalog is a shared interface, not a
speculative extraction. It has two immediate consumers: the generator composes
the committed database from its named eras, and the coverage test materializes
and executes each isolated case. Keeping recipes, era boundaries, settings
ordering, and expected observations together prevents those consumers from
duplicating the same contract.

**Risk contract.** #189 remains the authority. This decision preserves its
must-prevent outcomes: no real record-level data in the repository, no silently
under-asserted coverage run, and no injected staging verdict. It preserves the
required recovery: generator/committed-DB drift fails closed. Its accepted
baseline-budget stop, unsupported live-fetch and multi-writer paths, and owed
case-level evidence remain unchanged.

## Existing revise-e2e surface — corrected premise

The current committed database has four populated source tables:

| Table | Row count |
| --- | ---: |
| `cgm_readings` | 28,800 |
| `basal_events` | 28,800 |
| `bolus_events` | 600 |
| `profile_settings` | 2 |

`tests/test_gen_revise_e2e_db.py` exercises the generator through its public
CLI, then runs the production `analyze`, `build_exposures`, `build_scenarios`,
`prepare_findings_projection`, and `prepare_ic_history_events` interfaces.
The successor must retain this production-interface regression surface rather
than replace it with lower-level fixture checks.

The migration inventory that phase 5 executes is in
[migration-checklist.md](migration-checklist.md).

## ADR 194 — Dense showcase background, served from a scratch copy

**Decision.** The showcase era carries a dense, manufactured 30-day
background — 5-minute CGM and delivered-basal rows every day, daily
carb-entered meal boluses, an overnight fasting stretch, and one earlier
carb-ratio setting snapshot inside the window — composed with the coverage
recipes it already stacks. The offline entrypoints that serve the committed
store (`.claude/launch.json` `harmonic-nofetch` and the AGENTS.md permitted
command) copy it to a scratch path first and serve the copy.

**Why.** Measured on the #191 showcase-only artifact: 356 CGM readings across
17 sparse days publish four queue rows but zero ISF rest windows, no
carb-ratio history and gaps across the day chart, so three of the six harness
stories and the clock strip render empty — the gap that has forced real data
into chart reviews. The background is a catalog primitive, so the coverage
cases stay isolated and their expectations unchanged; the showcase expectation
is regenerated from analyzer output under the #189 risk contract (no injected
verdicts). Serving a committed SQLite file through the app flips it to WAL and
writes `-wal`, `-shm` and a derived store beside it; a scratch copy removes the
restore-before-commit ritual instead of documenting it.

**Consequences.** The CI browser-gates server, the case-file route test and
the allowlist pin stay on revise-e2e until #192/#193 land, per the 2026-08-29
ruling; the migration checklist marks which rows this cut moves.
