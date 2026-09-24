# Tasks — ISF staging predicate (#13)

## 1. Publish the backend verdict

- [x] Add the ISF staging predicate beside the analyzer recommendation logic.
- [x] Require a current value, a named direction, and a recommendation different from current.
- [x] Stamp every analyzer-produced ISF row with a boolean verdict after the harm gate.
- [x] Keep the no-programmed measurement in `estimate` and ISF evidence, emit `recommended = null`, and mark the row non-stageable.
- [x] Cover direction-only weaken, strengthen, confirm/hold, no-programmed, rounded no-op, and unstamped legacy shapes through analyzer output and the predicate interface.
- [x] Route every committed ISF fixture producer through the predicate or through real analyzer output, regenerate its artifacts, and pass each drift check.

## 2. Make Diagnose and Plan consume the verdict

- [x] Carry ISF stageability through the findings projection and fixture-only mirror without changing the direction-derived register.
- [x] Replace every queue, detail, and Plan ISF staging/action-number check with an exact `asserts_move === true` read.
- [x] Keep direction and queue register sourced from ISF evidence; do not gate either on stageability.
- [x] Keep Estimate, interval, support, annotation, and the direction-only refusal visible on held rows.
- [x] With no programmed value, keep the shared Recommended row with no numeric value and render no stage control.
- [x] Give a rounded strengthen no-op truthful held copy that preserves its direction and annotation without weaken/recent-low language.
- [x] Add a browser case whose row has a recommendation but an explicit false verdict, and prove the old gate fails it.
- [x] Add a generated synthetic pump profile and browser-drive a true verdict through staging, asserting the unchanged capped value on every programmed ISF segment.
- [x] Replay and re-inventory the frozen shipped-surface behavior contract, amend it for the backend-verdict cases, and collect distinct base/revision rendered evidence from the declared no-fetch app at both locked viewports and themes.

## 3. Record and verify the boundary

- [x] Update the safety, Plan, Surfaces, and parameter-analysis baseline specifications so stageability, direction, and queue register have one non-contradictory owner each.
- [x] Update `AGENTS.md` so the shared staging invariant includes ISF without claiming that it uses basal caps, floors, status, or the consolidated profile.
- [x] Run the full fast gate, every affected generator drift check, the public-tree checks, the Diagnose workstation browser suite, the frozen behavior replay, and the cockpit-shell browser suite.
- [x] Attach before/after Diagnose detail renders and raw replay output to the pull request.
