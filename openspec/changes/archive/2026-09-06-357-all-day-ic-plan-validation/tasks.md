# Tasks — admit the all-day I:C block's exclusive end into plan validation (#357)

- [x] Add a test to `IcBlockProvenancePlanStoreTest` in `tests/test_store.py` that saves, applies and reads back the analyzer's all-day block group — `block_start_min` 0, `block_end_min` 1440, members `[0, 420, 660, 1080]`, one row per member at one value — and observe it fail against the unchanged validator with `plan item 0 has an invalid I:C block bounds`.
- [x] Give the exclusive end its own domain in `_validate_ic_block_groups` (`ciq_autotune/store.py`): `block_end_min` on `(0, 1440]`, `block_start_min` and every member start still on `[0, 1440)`, naming `ic_history.HistoryIdentity` as the bound this matches.
- [x] Pin the rejections the loosened bound must keep in the same test class: `block_end_min` of 1441, of -1, of 0, of `True`, and of `1440.0` each still raise.
- [x] Correct the `_validate_ic_block_groups` docstring so it states the two bounds separately instead of "valid integer minute-of-day bounds".
- [x] Record the domain of a staged block's bounds in the `plan` capability spec delta.
- [x] Pass the repository verification gate.
