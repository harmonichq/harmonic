# Tasks — A selected occurrence's trace is drawn inside its own axis

- [ ] 1. Add a regression test to `frontend/diagnose-evidence-charts.test.js`
  that drives the exported `eventComparisonChartOption` with a selected case
  file whose trace peaks above the injected range, and asserts every drawn
  `selected:trace` point lies within `[yAxis.min, yAxis.max]`. Build the case
  file by cloning `mockups/diagnose-workstation.synthetic/finding-case-files.json`
  and raising one selected glucose point, the way the neighbouring field-range
  test already perturbs a clone. Run it against the unchanged module and record
  that it fails on the containment assertion — not on a missing export, a
  thrown range error, or an absent series.
- [ ] 2. In `frontend/diagnose-event-comparison.js`, make the non-mini branch of
  `option()` draw against a range that covers the selected trace it is about to
  push: widen the injected range to the selected glucose extent, rounded outward
  to `GLUCOSE_STEP`. The widened range may never be narrower than the injected
  range on either side, and the mini branch keeps the injected range exactly.
  `docs/scope/367-selected-trace-axis.spike.mjs` pins the arithmetic and its
  literals; run it and keep its Part B table true.
- [ ] 3. Leave `eventComparisonGlucoseValues`, `glucoseRange`, `GLUCOSE_ENVELOPE`,
  `GLUCOSE_STEP` and `fieldRange` unchanged, so a selection still cannot rescale
  the shared tile field. Keep the existing comment's rationale accurate by
  saying, where the widening happens, why the stage may widen when the field may
  not.
- [ ] 4. Confirm the already-locked neighbours stay green without being edited:
  `a selected occurrence trace never changes the field range`, `the shipped
  event-comparison mount derives its axis from rendered cohort glucose`, and
  `the event-comparison entry carries the dock mini rank through the registry`.
- [ ] 5. Provision the worktree once with `uv sync --frozen --extra api --extra
  sync` — the pytest leg cannot collect without the `api` extra — then run this
  repository's whole fast gate: `uv run python -m pytest`, `node --test
  'frontend/**/*.test.js'`, `npx --yes @fission-ai/openspec@1 validate --all
  --strict`, `python3 scripts/check_adr_numbers.py`, `python3
  scripts/check_owned_identifiers.py` and `python3
  scripts/check_public_allowlist.py`. The narrow pair `node --test
  frontend/diagnose-evidence-charts.test.js
  frontend/diagnose-event-comparison.test.js` is the fast inner loop for task 1,
  not the gate: the openspec leg is the only one that reads this `tasks.md`, and
  the allowlist leg the only one that dispositions the `mockups/INDEX.md`
  paragraph task 6 writes, so the narrow pair can pass over a diff that breaks
  them. Also run `node
  mockups/finding-evidence-routing.exploration/build.mjs --check`, because this
  change edits a file that generator extracts from.
- [ ] 6. Add one paragraph to `mockups/INDEX.md` below the surface table, in the
  shape the `#232`, `#226`, `#255` and `#294` paragraphs already use: name issue
  #367, say that the chart drawing a selected occurrence's trace now contains it
  in its own axis while the shared tile field is unchanged, cite ADR 367 in
  `openspec/changes/diagnose-selected-trace-axis/design.md`, and state that the
  frozen behaviour ledger and its replay are unchanged.
