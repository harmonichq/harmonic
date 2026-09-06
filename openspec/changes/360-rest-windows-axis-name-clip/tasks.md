# Tasks — Evidence-chart axis names are seated inside their own chart (#360)

- [ ] 1. Seat every full-rank axis name inside its chart in
  `frontend/diagnose-evidence-charts.js`, through the shared `axis()` helper the
  correction-factor and carb-ratio builders already spread, so the rule is
  written once rather than per builder. A vertical axis's name is anchored to the
  axis it labels instead of being centred on the axis end; a horizontal axis's
  name is anchored to its own axis end and seated with its tick labels rather
  than hung past the grid. The measured shape that satisfies this is
  `nameTextStyle.align` per orientation, plus `axisLine.onZero: false` on the
  horizontal axis so its name joins its labels at the plot bottom instead of
  floating on the zero rule mid-plot; a different mechanism is acceptable only if
  it meets the same measurement.

  `axis()` is `(colors, mini = false)` today and carries no orientation, so it
  cannot express a per-orientation seat as it stands: give it an explicit
  orientation parameter and pass it at every one of the ten call sites in the
  module, rather than letting it default. A defaulted third parameter silently
  hands every un-updated call site the wrong alignment, and the basal builder's
  call is one a both-modes assertion over the correction-factor and carb-ratio
  entries would not catch. That basal call re-sets `nameTextStyle`, `axisLabel`,
  `axisTick` and `splitLine` after the spread, and its paired y-axis is
  `min: 0`, so neither the new alignment nor `onZero` reaches its geometry —
  pass the orientation there for consistency, and expect the basal chart to
  measure exactly where it measures today.

  Do not change `FULL_GRID`, `MINI_GRID`, `GRID.left`, the legend's seat, or any
  axis-name string. Do not move the basal chart's `nameLocation: 'middle'` name,
  which measures seated today.

- [ ] 2. Extend the module's own comment record with the full-rank case. The two
  earlier seatings of this same failure are recorded in the comments above
  `axis()` (the mini rank dropping the name, and the name's type rank coming
  down off the grid top); add the full rank's seat to that record in the same
  voice, so the next reader finds three fixes to one rule rather than two fixes
  and a silent third.

- [ ] 3. Add a regression test to `frontend/diagnose-evidence-charts.test.js`
  that fails first against the pre-change builder. Drive it through the module's
  public interface — the `DIAGNOSE_EVIDENCE_CHARTS` registry entry's
  `option(mode, ctx)` — over the committed synthetic captures, and assert the
  seating contract for every full-rank axis that carries a name, in **both**
  modes of the correction-factor and carb-ratio entries: each named axis carries
  the seating the fix installs, and each name string is unchanged. This test is
  what carries the carb-ratio guarantee: no finding row on the QA database
  renders that chart, so the browser capture in task 4 cannot reach it and the
  builder is where it is checked.

  Assert in the same test that the mini rank still carries no axis name, that the
  basal entry's `nameLocation` and `nameGap` are untouched, and that each
  affected entry's returned `grid` insets and `legend` seat are the ones it
  returned before — the spec's "nothing that already rendered moves" clauses, and
  the two of them the browser driver cannot see, because it measures a name
  against the container box and not against the legend. Do not hand-set a fixture
  flag that encodes the expected answer; build the assertions from what the
  builder returns.

- [ ] 4. Re-run the committed measurement driver at
  `openspec/changes/360-rest-windows-axis-name-clip/evidence/axis-name-seat.mjs`
  against the declared no-fetch QA server and save its output beside the
  fail-first capture as `evidence/axis-name-seat.after.txt`. It must report zero
  clipped names across every finding row and every alignment the tiles publish,
  and must still report the previously seated names (`basal rate, U/h`, and each
  `mg/dL`) as seated, so the fix is shown not to have moved what already worked.
  This leg needs Chromium and does not run under a seatbelt sandbox; run it with
  escalated permissions rather than reporting it failed.
