# Tasks — per-night glucose evidence for a basal slot

- [x] Stamp the per-night facts in `analyze_basal` where `night_roster` is
  built, under these keys: `glucose_mean` (mean of every CGM reading in the
  half-open window [slot start, slot end)); `glucose_entry` and `glucose_exit`
  (the reading nearest each boundary via `model.CgmSeries.nearest` with the
  existing `bg_max_stale_min` cap — reuse it, do not write a third
  nearest-reading lookup — null when none qualifies); and `glucose_trace` (the
  night's CGM readings from 60 minutes before slot start through slot end, a
  sparse list of `{t, minute, bg}` — `t` formatted with
  `finding_case_file.FMT` (`%Y-%m-%d %H:%M:%S`, the case file's own trace
  format, not the roster's ISO-`T`), `minute` `round(..., 1)` relative to slot
  start and negative across the lead; lead points before midnight carry the
  prior date in `t`). `glucose_mean`, `glucose_entry` and `glucose_exit` are
  rounded to one decimal. The window end is
  `slot start + timedelta(minutes=cfg.slot_minutes)` — never a same-day
  clock-time replace, which cannot express slot 47's next-day midnight end.
  Window slices bisect the sorted CGM series once per boundary; never rescan
  the full reading list per slot-night.
- [x] Stamp the slot's `roster_glucose_mean` on every slot unconditionally —
  the mean of the per-night `glucose_mean` values, each roster night counting
  once, null-mean nights excluded, and null when no night has a mean (an empty
  roster included). The projection's required-key check stays presence-only; a
  null value is a served fact, not an error.
- [x] Copy `roster_glucose_mean` through the night-evidence projection
  verbatim (the per-night facts ride the existing roster pass-through), adding
  it to the projection's `required` evidence keys so an incomplete payload
  fails closed rather than serving a silent null.
- [x] Cover the new facts with analyzer-output tests built from N nights of
  synthetic events — never hand-set flags — including a night whose readings sit
  only in the lead (null `glucose_mean`, excluded from `roster_glucose_mean`,
  entry/exit and trace per their own rules); a 23:30-slot test where
  `glucose_exit` resolves to the next day's 00:00 reading and `glucose_mean`
  covers only [23:30, 24:00); a 00:00-slot test asserting the lead points carry
  the prior calendar date in `t` and negative `minute` down to −60; a test that
  a slot with an empty roster still projects a 200 payload with a null
  `roster_glucose_mean`; and a projection pass-through test.
- [x] Extend `scripts/gen_basal_night_evidence_fixtures.py` so the new facts
  are exercised — CGM covering the 60-minute lead, per-night glucose variation,
  and one roster night whose CGM is confined to the staleness-capped lead so it
  keeps its clean samples while the window itself holds no reading — while preserving the
  eight-night, one-bolus-exclusion shape its tests' hard-coded counts depend
  on; regenerate both committed fixtures the analyzer change moves
  (`frontend/__fixtures__/basal-night-evidence.json`,
  `frontend/__fixtures__/analysis.json`) and leave both `--check` drift gates
  green in the same change.
- [x] Prove the frozen verdicts did not move. `analysis.json` (whose generator
  is untouched) is identical to its predecessor except for the added glucose
  keys. `basal-night-evidence.json` is regenerated from edited synthetic input,
  so its served verdict facts are what must not move: roster dates and count,
  `delivered_rate`, `programmed_rate`, `sign`, `directional_support_count`,
  `excluded_night_count`, `asserts_move`, `safety_status`, `current`,
  `recommended` and `estimate` unchanged against the predecessor.
- [x] Keep the cache adapter's byte-parity test idempotent at the now-served
  glucose layer: `tests/test_api.py`
  `CachePreWarmTest.test_worker_and_direct_fixed_endpoint_keep_identical_payload_bytes`
  overwrites the seeded `2026-06-01 00:00:00` reading from 120 to 110, which
  before this change was invisible to basal evidence and now correctly moves
  `glucose_mean`, `glucose_entry`, `glucose_exit` and the trace. Re-upsert the
  seeded row verbatim (120, `Description` `EGV`) instead; `Store._upsert`
  advances the input revision on every write regardless of value, so the
  worker still recomputes and the test keeps proving the adapter, not the
  analysis. The comment above that upsert may be updated to say the write is
  deliberately value-identical and exists solely to advance the input revision.
  No other assertion in that test changes.
- [x] Fast gate and drift checks green.
