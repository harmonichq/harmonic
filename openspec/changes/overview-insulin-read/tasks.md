## 1. The builder (`ciq_autotune/insulin_summary.py`, ADR 632)

- [ ] 1.1 `build_insulin_windows(store, *, windows=DATA_DAYS)`: the window rule and the null window for a store with no readings, as `meal_size.build_meal_size_windows`
- [ ] 1.2 `data_days`, basal units, bolus units and count, carbs (bolus carbs plus `carb_entries` grams) per window
- [ ] 1.3 The type partition and the method partition, and the manual / Control-IQ counts, each with its share as its own field
- [ ] 1.4 The module docstring in the idiom of `meal_size.py`: what is read, the rules, "a report, never a Queue item"

## 2. The read (`ciq_autotune/api.py`)

- [ ] 2.1 `/api/explore/insulin?days=N` through `fixed(("insulin",), "insulin-v1", build_insulin_windows)`, projecting the window; 400 off `TIME_OF_DAY_DAYS`
- [ ] 2.2 `"insulin"` in `_RECORDED_DATA_RESULTS` and `_LIGHTEST`, and its roster entry after Meal size's, the roster docstring updated

## 3. Tests

- [ ] 3.1 `tests/test_insulin_summary.py`: a manufactured store of known events (a flat history, basal at known rates, manual and Control-IQ boluses, an override, an extended and a quick bolus, a bolus with no split, a codeless bolus, manual carbs, a delivery before the window opens), each served figure a literal off the recipe per window, the null window on an empty store, and the 400
- [ ] 3.2 `tests/test_api.py` `OverviewInstantTest`: the read in `_OVERVIEW`, in the restart test's counted builders, and in the worker-order test after Meal size
- [ ] 3.3 `tests/test_guidance_api.py`'s follow-up-write test counts the new builder once beside Meal size's (a snooze keeps the cached insulin read)

## 4. The fixtures

- [ ] 4.1 `scripts/ui_patient.py`: the Extended and Quick stamps on a fixed day rule (ADR 632), delivery unchanged
- [ ] 4.2 `scripts/gen_ui_fixtures.py`: `_insulin(client)` for each window, trimmed to the shape ADR 632 serves, under `overview` for `wearer`, `wearer-first-days` and `wearer-unsynced`; `_require_insulin` fails unless the wearer serves every type and method row above zero at 90 days, the first days a window with fewer data days than the wearer's, and the unsynced store a null window; the module docstring names the read
- [ ] 4.3 Regenerate `frontend/ui/__fixtures__/ui-fixtures.json`; `uv run python scripts/gen_ui_fixtures.py --check` green; every existing `_require_*` guard green without change
- [ ] 4.4 `uv run python scripts/gen_qa_e2e_db.py --check` green with no change under `mockups/` or `scripts/qa_e2e_cases.py`

## 5. Records

- [ ] 5.1 `AGENTS.md`: the two warm-roster paragraphs that name Meal size name the insulin read beside it
- [ ] 5.2 The pull request body in the app's terms: what the Overview will be able to show, why the showcase is untouched, what to check
