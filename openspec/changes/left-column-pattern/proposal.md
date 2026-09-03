# The left-column pattern: active chart, served headlines, a drawer that picks (#306)

## Why

#305 settled one cohesive Diagnose composition in the 2026-09-01 direction
session; this ticket is its fourth step, the left column. Today the shipped
canvas already seats the drilled finding's chart on the stage and boots with
the rank-1 chart there, but three clauses of the composition still read the
other way on the running app:

- backing out of a drill leaves the last drilled chart on the stage instead of
  returning the rank-1 finding's chart, and an explorer pick moves the stage
  without opening its finding;
- the basal card's headline sentence is drawn inside the chart as a 21px
  graphic while the card's own title is a 10px micro-caps nameplate, and no
  other family has a sentence at all;
- the charts drawer boots docked, re-docks itself whenever the window grows
  back past its floor, and stays up after a chart is picked from it.

The composition also needs one sentence per finding that #302's chartless hero
row and the stage card can both read. The findings projection is the one place
the frontend already renders verbatim and composes nothing (ADR 730), so the
sentence becomes a served field there, authored by the operator per family and
register rather than templated by an agent.

## What changes

- The stage holds the active finding's chart: rank-1 while the findings queue
  shows, the drilled finding while drilled, and back to rank-1 when the reader
  leaves the drill. An explorer pick opens that finding's drill; no reader
  override of the rule survives. The stage chart keeps its drawer cell as the
  marked current frame (ADR 215 stands).
- The charts drawer is a picker: it opens minimized, it never comes back up on
  its own (the grow-back re-dock is retired), and picking a chart from it —
  cell click or Enter, a Watching cell, or an explorer pick — stages and drills
  that chart and puts the drawer away. "Bring the charts up", "show every
  chart" and fullscreen stay.
- Every findings-projection row carries one served `headline`: an honest,
  factual sentence in the operator's voice, authored with the operator from a
  generated facts sheet over the QA showcase and recorded per family and
  register as dated sanctions. The stage card's title is its only home: the
  chart deck loses its drawn headline, drawer cells keep the short nameplate,
  and no drill level repeats it.
- The stage nameplate's editorial treatment (the bar it lives in, its type,
  wrapping under the 1.5rem no-hero cap) is settled with the operator at the
  running app in a UI Craft revise round, and the frozen behavior ledger and
  replay are amended for every changed behavior with before/after evidence.

## Risk contract

Inherited unchanged from #305, with one addition for the served sentence.

- **Must prevent:** a frontend-derived staging verdict (floors, directions,
  thresholds stay backend-owned per AGENTS.md safety invariants); real data in
  fixtures, screenshots committed to the repo, or CI logs; silent incorrect
  success (a green replay that asserted nothing); a served headline that
  states a count, direction or verdict the analyzer did not publish.
- **Must recover:** nothing automatically.
- **Accepted failure:** a composition change ships broken (chart fails to
  render, drill dead-ends) — fails visibly, operator repairs through normal
  ticket flow.
- **Unsupported:** light theme (retired, #304); per-night exclusion reasons
  (deferred); multi-user or non-operator audiences.
- **Evidence owed:** behavior-ledger replay amendments through the ui-craft
  revise lifecycle for every rail/chart behavior this composition changes;
  the existing `asserts_move`/`safety_status` read-only contract stays pinned
  by existing tests; the per-family literal headline in the QA catalog's
  `QaExpectation` dumps.
- **Why:** one operator, advisory surface, all dose-safety logic already
  contract-pinned backend-side.

Disposition: copied from #305 and the triage ledger unchanged; unchanged in
the locked work order.

## Impact

- `ciq_autotune/findings_projection.py` (the `headline` field); its tests,
  the frozen projection fixture and its generator, the fixture-only JS mirror
  and its parity test, the QA case catalog's queue-row expectations, and the
  synthetic Diagnose payload set the browser gates answer from.
- `frontend/diagnose-workstation.js`, `frontend/diagnose-workstation.css`,
  `frontend/diagnose-canvas-state.js`, `frontend/diagnose-evidence-charts.js`
  and their node tests.
- `mockups/finding-evidence-routing.behavior.md`,
  `frontend/diagnose-workstation-behavior.replay.mjs`, the two Diagnose
  browser suites, the ledger-parity test, `mockups/INDEX.md`, and
  `openspec/changes/left-column-pattern/evidence/`.
- `docs/scope/306-left-column-pattern.md`: the triage scope ledger.
