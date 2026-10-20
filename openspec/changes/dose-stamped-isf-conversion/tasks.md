## Slice 1 — the carb-ratio ledger

### 1. Fail first

- [x] 1.1 Add `tests/test_dose_stamped_isf_conversion.py`: two synthetic stores with the same meals, bolus stamps, printed lows and meal-window basal (so nothing but the fasting estimate can differ), differing only in their fasting nights, one flat enough that its ISF estimate is zero. Assert the two estimates differ (so the test is not vacuous), then that `analyze()` serves identical carb-ratio segment rows and blocks (`asserts_move` included), and that every meal run with a readable outcome carries its glucose travel in units. Build the stores from analyzer inputs (a committed generator or the QA case materializers), never from hand-set verdicts. Run it on the base commit and record that it fails for the right reason.

### 2. One ISF source

- [x] 2.1 Add `settings.IsfSource` per ADR 563 rules 1–4: `from_snapshots(snaps)`, `fixed(value)`, `at(bolus)`. Test it in `tests/test_settings.py`: a stamp wins; a non-positive stamp reads as none; an unstamped bolus takes the segment in force at its time of day in the latest snapshot captured at or before it, ignoring a later snapshot, at both sides of a segment boundary; no as-of snapshot gives none; `fixed` returns its value
- [x] 2.2 `analyzers/ic.py`: `meal_burdens`, the meal-run builder, `analyze_ic`, the block estimators (`ic_estimator` and the fuzzy variant) take `isf: Optional[IsfSource] = None` instead of `isf_effective`, where none means no conversion as `isf_effective=None` does today, so callers that pass neither CGM nor an ISF keep working unchanged. Each meal or run converts with `isf.at(first member)`. Build the CGM view whenever readings are given (today `ic.py` builds it only when an ISF exists, at the `meal_burdens` and meal-run sites), so start glucose, the near-target check and the rescue re-admission read as they do today; a meal whose source gives none gets only `bg_outcome_u = None`
- [x] 2.3 `analyzers/ic_regression.py`, the `IcBlockEstimator` interface in `admission.py` and `scripts/gen_estimator_truth.py` follow the new parameter; the truth sets convert through `IsfSource.from_snapshots` of their own snapshots
- [x] 2.4 `analyze.py`: both carb-ratio calls pass `IsfSource.from_snapshots(snaps)`; the ISF analyzer run and its settling gate stay
- [x] 2.5 `trial_evidence.py`'s carb-ratio path takes an `IsfSource`; `follow_up_comparison.py` passes `IsfSource.fixed` of the retained `programmed_isf` value, so no Trial comparison moves in this slice
- [x] 2.6 Update the tests that pass `isf_effective`: `tests/test_admission.py`, `tests/test_analyzer_ic.py`, `tests/test_ic_block_published_facts.py`, `tests/test_ic_blocks.py`, `tests/test_ic_meal_runs.py`, `tests/test_ic_regression.py`, `tests/test_trial_evidence.py`

### 3. QA coverage era

- [x] 3.1 Per AGENTS.md "Maintaining QA coverage eras", add `QaCase` recipes to `scripts/qa_e2e_cases.py` that hold: a two-segment ISF schedule with stamped meals in each segment; an ISF changed mid-window (a new snapshot, and stamps that change with it); unstamped meals after a snapshot (segment fallback) and before the first snapshot (unconfirmed). Compose them into as few cases as hold every state. Copy each case's complete `execute_case` dump into literal `QaExpectation` values, and run the catalog's generated `test_case_*` tests
- [x] 3.2 Re-run the existing catalog. Re-copy literal `QaExpectation` values from `execute_case` only for the cases that move under rules 1–3 (`behavioral-carb-undercount`'s stamp of 32 against a programmed 40 is expected to), and record their count in ADR 563
- [x] 3.3 Re-measure the five budgets without raising a limit: showcase size ≤25 MiB, showcase drift ≤30 s, focused QA suite ≤150 s, slowest case ≤30 s, full pytest ≤2.5× the recorded chunk-1 baseline. A breach stops the work without changing the committed showcase

### 4. Re-baseline and record

- [x] 4.1 Regenerate every drift-checked fixture that goes stale (`frontend/__fixtures__/analysis.json` is expected; check all five, the QA database included) through its generator; confirm no `asserts_move` moves on any synthetic store
- [x] 4.2 Record the staging movement in ADR 563: run `analyze()` before and after this slice on the operator's local snapshot (its path is handed to the build session, never written into the repo), opened only with `Store.open_readonly`, and add only the count of carb-ratio blocks and segments whose `asserts_move` or direction changed, by direction, with no values
- [x] 4.3 Spec delta: the parameter-analysis measured-ISF requirement is replaced by the dose-stamped one

## Slice 2 — the scenario engine

### 5. Fail first

- [ ] 5.1 Extend `tests/test_dose_stamped_isf_conversion.py`: over slice 1's pair of stores, the scenario engine serves identical carb-undercount attribution, asserted on the served exposures' per-meal carb-undercount verdicts (evidence tier, silence reason, match). On the base those verdicts differ (the zero estimate reads as no ISF, so every meal is unjudged) while the scenarios payload, the findings and the outcome patterns are already identical, so only the exposures can fail first. Run it before this slice's change and record that it fails for the right reason

### 6. One source through the engine

- [ ] 6.1 `analyzers/classifiers/carb_undercount.py` takes an `IsfSource` and converts each meal with `isf.at(meal's first bolus)`; none leaves the meal unjudged
- [ ] 6.2 The scenario modules that pass `isf` through (`evaluation.py`, `attribute.py`, `engine.py`, `model_view.py`) pass the source. Their callers build `IsfSource.from_snapshots` from the snapshots they hold: the engine's scenario build, `outcomes.py`, `event_comparison.py`, `finding_case_file.py`, `scenario/model_view.py`, `explore_exposures.py`, `outcomes_trend.py`'s behaviour observations
- [ ] 6.3 Delete `settings.effective_isf`, `scenario/engine._effective_isf`, `outcomes._effective_isf` with its ISF analyzer run and its exception guard, and the engine wrapper's ISF analyzer run
- [ ] 6.4 `scenario/model_view.py`: drop the second ISF read inside the source window and the `settings_window_days` parameter with the window it built (no caller passes it), and the payload's top-level `isf` header if an unfiltered whole-tree grep (including `frontend/index.html`) finds no reader
- [ ] 6.5 `outcomes_trend._profile_settings` drops its ISF median once nothing converts with it; its CLI line names the dose-stamped ISF instead of a number
- [ ] 6.6 Retained comparisons per ADR 563 rule 5: `follow_up_comparison.py` captures `isf_source: "dose_stamped"` in place of `programmed_isf`; a context that retains `programmed_isf` executes its Trial and Focus paths with `IsfSource.fixed` of its value. Keep the follow-up envelope version `386:1` (`store._follow_up_availability` refuses any other) and the comparison's `_VERSION` and policy strings (matched in the comparison's retained-execution check), so no retained context reads `unsupported_retained_execution`; `store.py`'s comparison-context check and the comparison's own `missing_programmed_isf` refusal accept either ISF field. Test: a `386:1` Trial and Focus serve the same comparison before and after, and a new capture is accepted
- [ ] 6.7 Update the tests that pass a scalar `isf=` to the scenario engine, its classifiers and its readers

### 7. QA and fixtures

- [ ] 7.1 Add a `QaCase` whose carb-undercount verdict depends on its segment's stamped ISF (two-segment schedule), with literal expectations; re-measure the five budgets as in 3.3
- [ ] 7.2 Regenerate `frontend/ui/__fixtures__/ui-fixtures.json` and any other stale fixture through its generator. In `scripts/gen_ui_fixtures.py`, pick the `with_carbs` Day state by rule among days with logged carbs, preferring the day whose served findings name the most distinct habits (then most logged carbs, then latest), so `Screens/Day / Findings Phone|Desktop` and `DayChart / With Logged Carbs` pass with no assertion weakened. Change a story literal only if the picked day names a different set of habits, and never lower a count
- [x] 7.3 At slice 2's triage, its order's Expected diff is a closed list of paths (no "their tests"), and its Expectation allows re-copying existing `test_case_*` expectations that move, with their count recorded in ADR 563. Measured at triage with a stand-in: none moves. `behavioral-carb-undercount`'s six meal verdicts hold at its stamp of 32 as at the fasting estimate its base classifier read
- [ ] 7.4 Spec deltas: the behavioral-layer carb-undercount requirement and the durable-follow-up retained-comparison requirement
