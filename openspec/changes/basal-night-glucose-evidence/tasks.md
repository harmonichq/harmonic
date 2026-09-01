# Tasks — per-night glucose evidence for a basal slot

- [ ] Stamp the per-night facts in `analyze_basal` where `night_roster` is
  built, under these keys: `glucose_mean` (mean of every CGM reading in the
  half-open window [slot start, slot end)); `glucose_entry` and `glucose_exit`
  (the reading nearest each boundary via `model.CgmSeries.nearest` with the
  existing `bg_max_stale_min` cap — reuse it, do not write a third
  nearest-reading lookup — null when none qualifies); and `glucose_trace` (the
  night's CGM readings from 60 minutes before slot start through slot end, a
  sparse list of `{t, bg}` with absolute wall-clock timestamps; lead points
  before midnight carry the prior date in `t`).
- [ ] Stamp the slot's `roster_glucose_mean` once per slot — the mean of the
  per-night `glucose_mean` values, each roster night counting once, null-mean
  nights excluded from the average.
- [ ] Copy `roster_glucose_mean` through the night-evidence projection
  verbatim (the per-night facts ride the existing roster pass-through), adding
  it to the projection's `required` evidence keys so an incomplete payload
  fails closed rather than serving a silent null.
- [ ] Cover the new facts with analyzer-output tests built from N nights of
  synthetic events — never hand-set flags — including a night with no usable
  in-window CGM serving nulls, and a projection pass-through test.
- [ ] Extend `scripts/gen_basal_night_evidence_fixtures.py` so the new facts
  are exercised — CGM covering the 60-minute lead, per-night glucose variation,
  and one roster night with no usable in-window CGM — while preserving the
  eight-night, one-bolus-exclusion shape its tests' hard-coded counts depend
  on; regenerate both committed fixtures the analyzer change moves
  (`frontend/__fixtures__/basal-night-evidence.json`,
  `frontend/__fixtures__/analysis.json`) and leave both `--check` drift gates
  green in the same change.
- [ ] Prove the frozen verdicts did not move: the regenerated fixtures are
  identical to their predecessors except for the added glucose keys — every
  rate, sign, count, `asserts_move` and `safety_status` byte-unchanged.
- [ ] Fast gate and drift checks green.
