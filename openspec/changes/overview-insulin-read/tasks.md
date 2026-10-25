## 1. The builder (`ciq_autotune/insulin_summary.py`, ADR 632)

- [x] 1.1 `build_insulin_windows(store, *, windows=DATA_DAYS)`: the window rule and the null window for a store with no readings, as `meal_size.build_meal_size_windows`
- [x] 1.2 `window.data_days` (the length) and `delivery_days`, basal and bolus units from `timeline.insulin_totals` (ADR 632 amended: basal clipped to the window, every bolus with delivered insulin), bolus count over the same boluses, carbs (bolus carbs plus `carb_entries` grams, unknown grams adding nothing) per window
- [x] 1.3 The type rows from `insulin_totals`' meal, correction and Control-IQ over the non-override boluses, Override the overridden user boluses whole; the method partition, and the manual / Control-IQ counts, each with its share as its own field
- [x] 1.4 The module docstring in the idiom of `meal_size.py`: what is read, the rules, "a report, never a Queue item"

## 2. The read (`ciq_autotune/api.py`)

- [x] 2.1 `/api/explore/insulin?days=N` through `fixed(("insulin",), "insulin-v1", build_insulin_windows)`, projecting the window; 400 off `TIME_OF_DAY_DAYS`
- [x] 2.2 `"insulin"` in `_RECORDED_DATA_RESULTS` and `_LIGHTEST`, and its roster entry after Meal size's; the roster docstring and AGENTS.md's roster paragraphs are #634's (ADR 632)

## 3. Tests

- [x] 3.1 `tests/test_insulin_summary.py`: a manufactured store of known events (a flat history, basal at known rates, manual and Control-IQ boluses, an override, an extended and a quick bolus, a bolus with no split, a bolus whose split is below its delivery, a bolus whose split sums to zero, a bolus with a negative correction part, a codeless bolus, a null-completion bolus, a bolus cut short (another completion, its delivered units counted), a basal row running into the window from before it, manual carbs with one entry of unknown grams, a delivery before the window opens, a window day with no delivery), each served figure a literal off the recipe per window, the null window on an empty store, and the 400
- [x] 3.2 `tests/test_api.py` `OverviewInstantTest`: the read in `_OVERVIEW`, in the restart test's counted builders, and in the worker-order test after Meal size
- [x] 3.3 `tests/test_guidance_api.py`: `("/api/explore/insulin", {"days": 14})` in the `recorded` tuple of `test_every_result_a_follow_up_write_keeps_reads_no_follow_up_state` (the transitive proof AGENTS.md requires for `_RECORDED_DATA_RESULTS`), and the follow-up-write test counts the new builder once beside Meal size's

## 4. The fixtures

- [x] 4.1 `scripts/ui_patient.py`: the Extended and Quick stamps on a fixed day rule (ADR 632), delivery unchanged
- [x] 4.2 `scripts/gen_ui_fixtures.py`: `_insulin(client)` for each window, trimmed to the shape ADR 632 serves, under `overview` for `wearer`, `wearer-first-days` and `wearer-unsynced`; `_require_insulin` fails unless the wearer serves every type and method row above zero at 90 days, the first days fewer `delivery_days` than the wearer's at 14 days, and the unsynced store a null window; the module docstring names the read
- [x] 4.3 Regenerate `frontend/ui/__fixtures__/ui-fixtures.json` and `ui-allowlist.json`; `uv run python scripts/gen_ui_fixtures.py --check` green; every existing `_require_*` guard green without change
- [x] 4.4 `uv run python scripts/gen_qa_e2e_db.py --check` green with no change under `mockups/` or `scripts/qa_e2e_cases.py`

## 5. Records

- [ ] 5.1 The pull request body in the app's terms: what the Overview will be able to show, why the showcase is untouched, what to check
- [x] 5.2 Lock 2 (2026-10-25): the module reads `timeline.insulin_totals` and keeps no second split or basal sum; the module docstring names ADR 492; the redundant zero-day check in a share is gone
- [ ] 5.3 Lock 3 (2026-10-25): basal read back by `_BASAL_GAP_CAP_MIN` before each window, as the Day screen's read; `delivery_days` counts every day a row's inside span touches; tests: a row longer than the cap reaching into the 14-day window, with the Overview's basal plus bolus units equal to `GET /api/timeline`'s total over the same days, and a midnight-crossing row inside the 30-day window that the 14-day window opens on, with that day counted in both
