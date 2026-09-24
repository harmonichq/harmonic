# Design — the basal slot panel drills into its nights (#291)

## ADR 291 — The nights live in the drill rail, and the roster is the tally

The scoping sessions for #291 (ledger: `docs/scope/291-basal-drilldown-inspector.md`)
moved through three framings: a redesigned settings panel, then a converged
cross-family drill component, then — after #298 recorded that the settings and
behavioural families never duplicated each other — the one surviving scope the
composition parent #305 names as its step 6: the basal slot panel gains its
nights, and selecting one draws that night on the glucose chart.

**Decision (operator, 2026-09-03 triage round; Q2 = A, Q3 = A).**

1. The roster groups nights under four headers — ran above, ran below, ran as
   set, and, only when such nights exist, no programmed rate on file (the
   amendment below settles that fourth one and why it cannot fold into ran as
   set) — through the shared occurrence-roster mechanism's own groups, with the
   served counts in the headers. The tally that the 2026-09-01 session wanted to
   move off the chart into the panel becomes this: not a static count, but the
   entry to the nights themselves. Excluded nights are a count line only. They
   carry no per-night facts in the payload, and per-night exclusion reasons were
   refused in #290 and stay deferred.
2. A selected night shows a detail block in the Finding selection block's own
   shape: the date, delivered against programmed, the night's in-slot mean
   against the roster mean, entering to leaving glucose, `n of N`, Clear trace,
   Open in Day. The operator's worked example is the reason the roster mean is
   in the block: divergence from the slot's norm must be readable against that
   norm, or a big-meal night reads as a basal problem.

**Two amendments from the cold plan review (2026-09-03).** A lane click opens
any of the 48 slots and carries no chart id, while a basal tile exists only for
a slot with a published findings row; the analysis payload publishes every
slot, so the panel takes the tile's copy when there is one and otherwise makes
the tile's own request once per slot frame — one fetch function, two entries,
one roster. And the analyzer skips a sample with no programmed rate, so such a
night's sign is null exactly like a ran-as-set night's; the roster keeps them
apart under their own header, as the tile's verdict rail already does, because
"unmeasurable" must never read as "measured and equal" on this surface.

**Why the rail and not the chart.** The chart is the evidence; the stage card's
title is the headline's only home (#306); the tile's verdict rail keeps the
direction counts. The rail is the one place a per-night drill can live without
a new chart — and "no new charts" was the operator's restraint constraint on
2026-08-31. The Finding roster already proved the idiom: select in place, trace
on the always-present canvas, step with the arrows.

**Why the settings panel's numbers block is untouched.** The staging control
reads `asserts_move` / `safety_status` and nothing else; both recurring
dosing-safety regressions in this repository came from a frontend re-deriving a
verdict beside that block. The roster adds facts below it and changes nothing
above it, and the tests pin that.

**Why basal only.** The correction factor and carb ratio panels render through
the same component but their evidence payloads carry no per-item glucose facts
comparable to a night's, so a roster there would be a design with no data
behind it. When their payloads gain per-item facts the same roster is the third
and fourth caller; that is a later ticket.

## Safe-start declaration (UI Craft `revise`)

Declaration: `AGENTS.md`, "The data boundary". Command, quoted:

```sh
scratch="${TMPDIR:-/tmp}/harmonic-qa-e2e.sqlite"
rm -f "$scratch" "$scratch-wal" "$scratch-shm" "$scratch.derived.sqlite"
cp mockups/qa-e2e.synthetic/harmonic.sqlite "$scratch"
uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765
```

Data source: `mockups/qa-e2e.synthetic/harmonic.sqlite`, generated in full by
`scripts/gen_qa_e2e_db.py`; synthetic, drift-checked in CI. Route result:
`{"mode":"revise","reason":"safe synthetic data source declared"}`. The frozen
contract is `mockups/finding-evidence-routing.behavior.md` with its app-only
replay `frontend/diagnose-workstation-behavior.replay.mjs`.

## Risk contract

Inherited unchanged from #305 (and #306's copy of it).

- **Must prevent:** a frontend-derived staging verdict (floors, directions,
  thresholds stay backend-owned per AGENTS.md safety invariants); real data in
  fixtures, screenshots committed to the repo, or CI logs; silent incorrect
  success (a green replay that asserted nothing).
- **Must recover:** nothing automatically.
- **Accepted failure:** a composition change ships broken (chart fails to
  render, drill dead-ends) — fails visibly, operator repairs through normal
  ticket flow.
- **Unsupported:** light theme (retired, #304); per-night exclusion reasons
  (deferred); multi-user or non-operator audiences.
- **Evidence owed:** behavior-ledger replay amendments through the ui-craft
  revise lifecycle for every rail/chart behavior this composition changes;
  the existing `asserts_move`/`safety_status` read-only contract stays pinned
  by existing tests.
- **Why:** one operator, advisory surface, all dose-safety logic already
  contract-pinned backend-side.

Disposition: copied from #305 unchanged; unchanged in the locked work order.
