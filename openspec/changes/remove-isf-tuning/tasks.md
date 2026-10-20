## Slice A — the app stops drawing the estimate

### 1. Lock revision (operator approval before any build)

- [ ] 1.1 Record the operator's Overview estimates-grid decision (ADR 564 rule 8) and the queued-ISF removal in `docs/design/recommendations-redesign.md`:
  - a §2.5 entry;
  - the header's Overview and Queue lines;
  - §1.1's Overview row;
  - §1.3's Queue setting-detail and Overview rows;
  - component 22 (IsfCard) retired;
  - components 25 (BasalCard) and 27 (MealSizeCard) re-sized against the new grid;
  - the EvidenceChart and QueueRow entries' ISF cases;
  - §1.5's "Fasting" entry, dropped if no surface prints it, and its "ISF" entry kept for the pump-profile column.

  The Overview and Queue screen lines end in the operator's `locked <date>`.

### 2. Frontend

- [ ] 2.1 Delete `frontend/ui/components/IsfCard/` after moving its shared classes (`ui-isf`, `__title`, `__none`, `__skeleton`) to a module BasalCard and MealSizeCard both import, renamed for what they are
- [ ] 2.2 `overview-model.ts`, `queue-model.ts`, `QueueScreen.tsx`, `OverviewScreen.tsx` and `OverviewScreen.css`: remove the ISF estimate and the `setting:isf` card. The Overview grid follows the locked layout. A `setting:isf` candidate, if one is still served before B1, is the Queue's existing undrawable case
- [ ] 2.3 `ui/app/live.js` and `live.test.js`: drop the `isf` reads (the shared analyze fetch stays for basal; rename its served key for what it now carries)
- [ ] 2.4 Stories: delete the IsfCard stories and the Queue's ISF stories. Rewrite the Overview's `oneHeight`, `inProportion` and `noData` plays for the locked grid. Fix the comments that size cards against the ISF card (BasalCard, MealSizeCard, SettingCard, EvidenceChart, QueueRow)
- [ ] 2.5 `scripts/gen_ui_fixtures.py`: drop the `isf-supported` stores, `states.isf`, `_isf` and the Queue's `isf`, then regenerate `ui-fixtures.json` and `ui-allowlist.json` through it
- [ ] 2.6 `frontend/ui/app/live.contract.test.mjs`: drop the `isf` expectations and the `overview.isfEstimate` and `queue.isfSetting` assertions. The `isf-strengthen` case's `queue` and `done` expectations stay until B1
- [ ] 2.7 Revise in the running app under the safe start (the QA no-fetch serve) and attach rendered evidence of the Overview at 1440×900 and 390×844 and of the Queue

### 3. Specs

- [ ] 3.1 Edit the ISF out of `recommendations-redesign`'s ADDED Overview and Queue surfaces requirements (ADR 564 rule 9)

## Slice B1 — the engine stops serving ISF advice

### 4. Fail first

- [ ] 4.1 Through `build_guidance` on the `isf-strengthen` case: no candidate has subject `setting:isf`, and the findings serve no row with parameter `isf`. A stored `setting:isf` preference is served as an absent row titled "Correction factor", and a recorded ISF Plan's history still names "Correction factor". Run it on the base and record that it fails for the right reason

### 5. Advice out

- [ ] 5.1 `guidance.py`: drop the `setting:isf` candidate, its support fields, its asserted-only rule and its whole-day member case. Keep `_SETTING_TITLES`, `_SETTING_UNITS`, `_MEMBER_TITLES` and `_PLAN_FAMILY` for retained subjects (rule 6)
- [ ] 5.2 `findings_projection.py`: drop `_isf_rows`, `_isf_headline` and the ISF chips and `whole_day` scope; `analyzers/tuning_priority.py`: drop `isf_lever`, `_isf_recurrence` and the ISF argument; `scenario_config.py`: drop `priority_isf_*`
- [ ] 5.3 `analyze.py`: drop the ISF settling gate, the ISF epoch entry and the rescue-coverage quality notes
- [ ] 5.4 Record in ADR 564 the count of basal and carb-ratio Priority ranks that move across the QA catalog, with no values
- [ ] 5.5 QA catalog: the `isf-*` cases' `queue_rows` become `queue_absences`, and their finding titles drop. `live.contract.test.mjs` drops its `isf-strengthen` case, and `.github/workflows/ci.yml` and `AGENTS.md` drop its `--case` run
- [ ] 5.6 Update the tests that assert ISF advice (`test_guidance.py`, `test_guidance_api.py`, `test_guidance_preferences.py`, `test_findings_projection.py`, `test_tuning_priority.py`, `test_engine_cuts.py`, `test_setting_done.py`, `test_settling.py`, `test_annotation_register.py`), keeping the tests that read retained ISF records. Regenerate `findings-projection.json` through its generator after the generator drops the ISF rows

### 6. Specs and docs

- [ ] 6.1 Edit the ISF out of `recommendations-redesign`'s ADDED Plan requirement ("A Plan holds one tuning variable at a time") (rule 9). This change's plan, safety, behavioral-layer, surfaces and outcomes deltas already state B1's behavior
- [ ] 6.2 `AGENTS.md`'s correction-factor staging paragraph, `CONTEXT.md`'s ISF recommendation and direction-only weaken terms, and `README.md`'s and `PRODUCT.md`'s tuning lines

## Slice B2 — the engine stops computing the estimate

### 7. Fail first

- [ ] 7.1 Through `analyze()` on every QA case: no `isf` key, and basal and carb-ratio rows and blocks identical to the base commit. On a store holding a retained `isf-all-*` Trial record, the Trial roster, `/api/verify/trials` and `/api/outcomes/trend` read without error with `ciq_autotune/analyzers/isf.py` deleted

### 8. Estimate out

- [ ] 8.1 Delete `analyzers/isf.py`, `tests/test_analyzer_isf.py` and `uncertainty.estimate_slope_clustered`. From `analyze.py`, drop the ISF window, the prior decision window, the rescue observation and `isf_fasting_evidence_sink`. Drop `AnalysisResult.isf` and bump `SCHEMA_VERSION`. Drop `report.py`'s and `render.py`'s ISF section and `cli.py`'s ISF help
- [ ] 8.2 `trial_evidence.py` and `follow_up_comparison.py`: drop the fasting-step population and the ISF readiness branch. An ISF Trial reads through the generic branch (rule 4). The basal rest-window evidence is unchanged
- [ ] 8.3 Move `IsfConfig` constants that other code borrows to their readers (the QA lane in `scripts/qa_e2e_cases.py`, `carbs.py`'s flat lookback). Fix the comments that point at the analyzer (`safety.py`, `model.py`, `timeline.py`, `rescue_evidence.py`, `pending_prompts.py`, `scenario/payload.py`'s `isf` count, which stays as attribution per rule 5)
- [ ] 8.4 QA catalog, per AGENTS.md "Maintaining QA coverage eras":
  - delete the four `isf-*` cases, `_materialize_isf_coverage` and the ISF expectation scaffolding;
  - rebuild `behavioral-carb-log-fasting-exclusion` and `pattern-near-tie` without the ISF recipe, or delete the former if it proves nothing else;
  - re-source `rest_windows` from the rest-window detector (rule 7), with no literal changed;
  - re-measure the five budgets without raising a limit.
- [ ] 8.5 Regenerate `frontend/__fixtures__/analysis.json` (chart-builder) and every other drift-checked fixture that goes stale through its generator
- [ ] 8.6 Update the remaining tests that read the estimate (`test_analyze_facade.py`, `test_analyzer_coverage.py`, `test_rescue_evidence.py`, `test_false_low.py`, `test_api.py`, `test_result.py`, `test_ic_blocks.py`, `test_trial_evidence.py`, `test_qa_e2e_cases.py`, `test_render.py`, `test_report.py`, `test_uncertainty.py`)

### 9. Specs and docs

- [ ] 9.1 Delete `recommendations-redesign`'s two MODIFIED ISF staging-predicate blocks (parameter-analysis, safety) and edit the ISF out of its ADDED QA requirement (rule 9). Prove the order-independence: in a scratch copy, archive this change, then `recommendations-redesign`, and the reverse; both succeed and `validate --all --strict` passes
- [ ] 9.2 `AGENTS.md`'s analyzers line and ISF range clause, `CONTEXT.md`'s ISF and fasting-window entries (the term stays for the pump value), `README.md`'s ISF bullet and aggressiveness example, `DESIGN.md`, and `docs/kb/`
