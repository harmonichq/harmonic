## Slice A — the app stops drawing the estimate

### 1. Lock revision (operator approval before any build)

- [x] 1.1 Draft the lock-doc revision in `docs/design/recommendations-redesign.md`, proposed and not locked: the header line, §1.1, §1.3, §2.5's 2026-10-20 #564 amendment with its must-survive list, and §4.2 QueueRow, SettingCard, EvidenceChart, IsfCard (retired), BasalCard and MealSizeCard (done at triage)
- [x] 1.2 The operator says "locked" on that amendment; the header line becomes "**No ISF estimate, locked 2026-10-20**" in the operator's words, before any build step below (locked 2026-10-20: "Go for it. Locked")

### 2. Frontend

- [x] 2.1 Move IsfCard.css's shared rules into `frontend/ui/components/SettingCard/SettingCard.css`, which BasalCard and MealSizeCard already import: `.ui-isf__title` becomes `.ui-scard__heading`, `.ui-isf__none` becomes `.ui-scard__none`, `.ui-isf__skeleton` becomes `.ui-scard__skeleton`. The bare `ui-isf` class carries no rule and leaves `BasalCard.tsx` and `MealSizeCard.tsx`. Drop their `../IsfCard/IsfCard.css` imports (BasalCard.tsx:18, MealSizeCard.tsx:31) and update `OverviewScreen.stories.tsx`'s `.ui-isf__none` query. Then delete `frontend/ui/components/IsfCard/`
- [x] 2.2 `overview-model.ts`, `queue-model.ts`, `QueueScreen.tsx`, `OverviewScreen.tsx` and `OverviewScreen.css`: remove the ISF estimate and the `setting:isf` card. The Overview grid follows the locked layout: the basal estimate and Meal size each span a row, every row one height. A `setting:isf` candidate, if one is still served before B1, is the Queue's existing undrawable case
- [x] 2.2a The Snoozed footer counts the rows the Snoozed list draws, so a correction factor set aside before #564 is neither listed nor counted. `snoozedCount` (queue-model.ts:390) keeps a served formula for precheck (e): `queue.<store>.guidance.candidates[set_aside=true].length − queue.<store>.guidance.candidates[set_aside=true][subject=setting:isf].length` (chained filters and " − " per provenance.js). A Queue story pins it with a fixture store holding a set-aside `setting:isf` subject; `scripts/gen_ui_fixtures.py` writes that preference straight into the store with `Store.save_guidance_preference` (as a record from before #564 would be), never through `PUT /api/guidance/preferences/{subject}`, so the same store serves a set-aside candidate before B1 and a set-aside absent row after it, and B1's regeneration (5.7) still builds it
- [x] 2.3 `ui/app/live.js` and `live.test.js`: drop the `isf` reads (the shared analyze fetch stays for basal; rename its served key for what it now carries)
- [x] 2.3a §1.5 drops "Fasting" (the lock's amendment), and `ui-fixtures.json`'s glossary is regenerated with it
- [x] 2.4 Stories: delete the IsfCard stories and the Queue's ISF stories. Rewrite the Overview's `oneHeight`, `inProportion` and `noData` plays for the locked grid. Fix the comments that size cards against the ISF card (BasalCard, MealSizeCard, SettingCard, EvidenceChart, QueueRow)
- [x] 2.5 `scripts/gen_ui_fixtures.py`: drop the `isf-supported` stores, `states.isf`, `_isf` and the Queue's `isf`, then regenerate `ui-fixtures.json` and `ui-allowlist.json` through it
- [x] 2.6 `frontend/ui/app/live.contract.test.mjs`: drop the `isf` expectations and the `overview.isfEstimate` and `queue.isfSetting` assertions. The `isf-strengthen` case stays, with `queue: []` and `done: null`: the engine still serves `setting:isf` until B1, but no Queue component draws it, so `ranking()` (queue-model.ts:381-386) leaves it out. B1 deletes the case, its `ci.yml` run and its `AGENTS.md` lines
- [x] 2.7 Revise in the running app under the safe start (the QA no-fetch serve) per `/ui-craft revise`: before and after renders from the same store of the Overview at 1440×900 and 390×844 and of the Queue, each must-survive line of the amendment shown, and `precheck.py` output

### 3. Specs

- [x] 3.1 Edit the ISF out of `recommendations-redesign`'s ADDED Overview and Queue surfaces requirements (ADR 564 rule 9)

## Slice B1 — the engine stops serving ISF advice

### 4. Fail first

- [x] 4.1 Through `build_guidance` on the `isf-strengthen` case: no candidate has subject `setting:isf`, and the findings serve no row with parameter `isf`. A stored `setting:isf` preference is served as an absent row titled "Correction factor", and a recorded ISF Plan's history still names "Correction factor". Run it on the base and record that it fails for the right reason

### 5. Advice out

- [x] 5.1 `guidance.py`: drop the `setting:isf` candidate, its support fields, its asserted-only rule and its whole-day member case. Keep `_SETTING_TITLES`, `_SETTING_UNITS`, `_MEMBER_TITLES` and `_PLAN_FAMILY` for retained subjects (rule 6)
- [x] 5.2 `findings_projection.py`: drop `_isf_rows`, `_isf_headline` and the ISF chips and `whole_day` scope; `analyzers/tuning_priority.py`: drop `isf_lever`, `_isf_recurrence` and the ISF argument; `scenario_config.py`: drop `priority_isf_*`
- [x] 5.3 `analyze.py`: drop the ISF settling gate, the ISF epoch entry and the rescue-coverage quality notes
- [x] 5.4 Record in ADR 564 the count of basal and carb-ratio Priority ranks that move across the QA catalog, with no values
- [x] 5.5 QA catalog: the `isf-*` cases' `queue_rows` become `queue_absences`, and their finding titles drop. `live.contract.test.mjs` drops its `isf-strengthen` case, and `.github/workflows/ci.yml` and `AGENTS.md` drop its `--case` run
- [x] 5.6 Update the tests that assert ISF advice, keeping the tests that read retained ISF records:
  - `test_guidance.py`, `test_guidance_api.py`, `test_guidance_preferences.py`, `test_findings_projection.py`, `test_tuning_priority.py`, `test_engine_cuts.py`, `test_setting_done.py`, `test_settling.py`, `test_annotation_register.py`;
  - `test_analyzer_isf.py`: drop the `isf_lever` tests (:496, :542); the file goes in B2;
  - `test_rescue_evidence.py`: drop the rescue-coverage note assertions (:389-412) that 5.3 removes;
  - `test_analyzer_coverage.py`: drop `SettlingIsfTest` (:557) and the `_settling(... isf_rows=...)` calls;
  - `test_durable_follow_up.py`'s `test_plan_history_names_each_recorded_subject_at_read_time` (:675-692): seed a recorded `setting:isf` Plan straight into the store instead of applying one (now refused). It stays the proof that a recorded ISF Plan reads and is named "Correction factor".
- [x] 5.7 Regenerate `findings-projection.json` through its generator once the generator drops the ISF rows, and `ui-fixtures.json` and `ui-allowlist.json` through `scripts/gen_ui_fixtures.py`, whose `/api/guidance` reads no longer serve `setting:isf`

### 6. Specs and docs

- [x] 6.1 Edit the ISF out of `recommendations-redesign`'s ADDED Plan requirement ("A Plan holds one tuning variable at a time") (rule 9). This change's plan, safety, behavioral-layer, surfaces and outcomes deltas already state B1's behavior
- [x] 6.2 `AGENTS.md`'s correction-factor staging paragraph, `CONTEXT.md`'s ISF recommendation and direction-only weaken terms, and `README.md`'s and `PRODUCT.md`'s tuning lines

## Slice B2 — the engine stops computing the estimate

### 7. Fail first

- [ ] 7.1 Through `analyze()` on every QA case: no `isf` key, and basal and carb-ratio rows and blocks identical to the base commit. On a store holding a retained `isf-all-*` Trial record, the Trial roster, `/api/verify/trials` and `/api/outcomes/trend` read without error with `ciq_autotune/analyzers/isf.py` deleted

### 8. Estimate out

- [ ] 8.1 Delete `analyzers/isf.py`, `tests/test_analyzer_isf.py` and `uncertainty.estimate_slope_clustered`. From `analyze.py`, drop the ISF window, the prior decision window, the rescue observation and `isf_fasting_evidence_sink`. Drop `AnalysisResult.isf` and bump `SCHEMA_VERSION`. Drop `report.py`'s and `render.py`'s ISF section and `cli.py`'s ISF help
- [ ] 8.2 `trial_evidence.py` and `follow_up_comparison.py`: drop the fasting-step population and the ISF readiness branch. An ISF Trial reads through the generic branch (rule 4): In range target, 30 coverage-qualified informative dates, per-outcome assessment states, and no correction-factor advice. Test it through the comparison read on a `c4-isf` store, and that guidance serves no correction-factor candidate after it matures. The basal rest-window evidence is unchanged
- [ ] 8.3 Move `IsfConfig` constants that other code borrows to their readers (the QA lane in `scripts/qa_e2e_cases.py`, `carbs.py`'s flat lookback). Fix the comments that point at the analyzer (`safety.py`, `model.py`, `timeline.py`, `rescue_evidence.py`, `pending_prompts.py`, `scenario/payload.py`'s `isf` count, which stays as attribution per rule 5)
- [ ] 8.4 QA catalog, per AGENTS.md "Maintaining QA coverage eras":
  - delete the four `isf-*` cases, `_materialize_isf_coverage` and the ISF expectation scaffolding;
  - rebuild `behavioral-carb-log-fasting-exclusion` and `pattern-near-tie` without the ISF recipe, or delete the former if it proves nothing else;
  - re-source `rest_windows` from the rest-window detector (rule 7), with no literal changed;
  - re-measure the five budgets without raising a limit.
- [ ] 8.5 Regenerate `frontend/__fixtures__/analysis.json` (chart-builder) and every other drift-checked fixture that goes stale through its generator
- [ ] 8.6 Update the remaining tests that read the estimate (`test_analyze_facade.py`, `test_analyzer_coverage.py`, `test_rescue_evidence.py`, `test_false_low.py`, `test_api.py`, `test_result.py`, `test_ic_blocks.py`, `test_trial_evidence.py`, `test_qa_e2e_cases.py`, `test_render.py`, `test_report.py`, `test_uncertainty.py`)

### 9. Specs and docs

- [ ] 9.1 Delete `recommendations-redesign`'s two MODIFIED ISF staging-predicate blocks (parameter-analysis, safety) and edit the ISF out of its ADDED QA requirement (rule 9). Prove the order-independence in a scratch copy: archive this change, then `recommendations-redesign`, and the reverse. Neither may fail on a requirement this change removes, and `validate --all --strict` passes. At triage the redesign's archive already aborted on clean main for an unrelated reason ("Validation errors in rebuilt spec for eating-sequences"); if it still does, show that its abort names no requirement this change touches
- [ ] 9.2 `AGENTS.md`'s analyzers line and ISF range clause, `CONTEXT.md`'s ISF and fasting-window entries (the term stays for the pump value), `README.md`'s ISF bullet and aggressiveness example, `DESIGN.md`, and `docs/kb/`
