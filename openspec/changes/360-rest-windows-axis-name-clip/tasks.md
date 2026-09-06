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
  it meets the same measurement. Do not change `FULL_GRID`, `MINI_GRID`,
  `GRID.left`, the legend's seat, or any axis-name string. Do not move the basal
  chart's `nameLocation: 'middle'` name, which measures seated today.

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
  the seating the fix installs, and each name string is unchanged. Assert in the
  same test that the mini rank still carries no axis name and that the basal
  entry's `nameLocation` and `nameGap` are untouched, so the fix cannot silently
  widen. Do not hand-set a fixture flag that encodes the expected answer; build
  the assertions from what the builder returns.

- [ ] 4. Re-run the committed measurement driver at
  `openspec/changes/360-rest-windows-axis-name-clip/evidence/axis-name-seat.mjs`
  against the declared no-fetch server and save its output beside the fail-first
  capture as `evidence/axis-name-seat.after.txt`. It must report zero clipped
  names across every finding row, and must still report the previously seated
  names (`basal rate, U/h`, and each `mg/dL`) as seated, so the fix is shown not
  to have moved what already worked. This leg needs Chromium and does not run
  under a seatbelt sandbox; run it with escalated permissions rather than
  reporting it failed.
