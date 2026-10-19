## 1. Fail first

- [ ] 1.1 Add `tests/test_programmed_isf_conversion.py`: two synthetic stores with the same programmed ISF and the same meals (with readable outcomes and non-zero glucose travel), differing only in their fasting nights; assert their ISF analyzer estimates differ (so the test is not vacuous), then that `analyze()` serves identical carb-ratio segment rows and blocks (`asserts_move` included) and the scenario engine serves identical carb-undercount attribution. Build the stores from analyzer inputs (a committed generator or the QA case materializers), never from hand-set verdicts. Run it on the base commit and record that it fails for the right reason: the carb-ratio rows differ.

## 2. One programmed-ISF read

- [ ] 2.1 Replace `settings.effective_isf(isf_rows, snaps)` with `settings.programmed_isf(snaps)`: the median of the latest snapshot's active ISF schedule, `None` without one; drop the stale "ADR 0001" citation
- [ ] 2.2 `analyze.py`: both carb-ratio calls (segment rows and blocks) pass `settings.programmed_isf(snaps)`; leave the ISF analyzer run and its settling gate as they are
- [ ] 2.3 Delete `scenario/engine._effective_isf` and its ISF analyzer run; the engine, `event_comparison.py`, `finding_case_file.py`, `scenario/model_view.py` (both reads) and `explore_exposures.py` call `settings.programmed_isf` with the snapshots they already hold
- [ ] 2.4 Delete `outcomes._effective_isf`, its ISF analyzer run and its exception guard; `outcomes.py` calls `settings.programmed_isf`
- [ ] 2.5 `outcomes_trend._profile_settings` reads `settings.programmed_isf` instead of its own median (no served value changes; the follow-up comparison reads it through this)
- [ ] 2.6 Update the tests that pinned the old read: `tests/test_settings.py` (the measured-first cases become programmed-median and none-without-schedule cases on the new signature), and the patches of the deleted wrappers in `tests/test_outcomes.py` and `tests/test_explore_exposures.py`

## 3. Re-baseline and record

- [ ] 3.1 Regenerate `frontend/__fixtures__/analysis.json` (`scripts/gen_chart_builder_fixtures.py`) and `frontend/ui/__fixtures__/ui-fixtures.json` (`scripts/gen_ui_fixtures.py`); confirm the other three drift checks stay current and no `asserts_move` moves in either fixture
- [ ] 3.2 Keep the Day findings stories at full strength: in `scripts/gen_ui_fixtures.py`, pick the `with_carbs` Day state by rule among days with logged carbs, preferring the day whose served findings name the most distinct habits (then most logged carbs, then latest), so `Screens/Day / Findings Phone|Desktop` and `DayChart / With Logged Carbs` pass without weakening any assertion; change a story's literal only if the rule-picked day names a different set of habits, and never lower a count
- [ ] 3.3 Record the staging movement in ADR 563: run `analyze()` before and after the change on a read-only local snapshot of the operator's own store (`Store.open_readonly`, never a live pull, never committed), and add only the count of carb-ratio blocks and segments whose `asserts_move` or direction changed, by direction, with no values
- [ ] 3.4 Spec delta: the parameter-analysis measured-ISF requirement is removed and replaced by the programmed-ISF requirement
