# Generated facts

Read-only command run from the ticket worktree:

```sh
python3 openspec/changes/high-carb-response/evidence/probe.py
```

Verbatim stdout:

```text
Source and verification paths
exists ciq_autotune/explore_exposures.py
exists ciq_autotune/finding_case_file.py
exists ciq_autotune/findings_projection.py
exists ciq_autotune/event_comparison.py
exists ciq_autotune/analyzers/eating_sequences.py
exists ciq_autotune/false_low.py
exists tests/test_finding_case_file.py
exists tests/test_findings_projection.py
exists tests/test_eating_sequence_fixture.py
exists tests/test_eating_sequence_findings.py
exists tests/test_explore_exposures.py
exists tests/test_event_comparison.py
exists tests/eating_sequence_streams.py
exists frontend/diagnose-eating-sequences.js
exists frontend/diagnose-eating-sequences.test.js
exists frontend/diagnose-evidence-charts.js
exists frontend/diagnose-evidence-charts.test.js
exists frontend/diagnose-event-comparison.js
exists frontend/diagnose-event-comparison.test.js
exists frontend/diagnose-workstation.js
exists frontend/diagnose-workstation.css
exists frontend/finding-case-file-validation.js
exists frontend/finding-case-file-validation.test.js
exists frontend/diagnose-workstation-behavior.replay.mjs
exists frontend/diagnose-canvas-composition.browser.test.mjs
exists frontend/diagnose-event-comparison-behavior.replay.mjs
exists frontend/diagnose-behavior-ledger-parity.test.js
exists frontend-v2/desk.browser.test.mjs
exists scripts/gen_eating_sequence_fixtures.py
exists frontend/__fixtures__/eating-sequence-report.json
exists mockups/eating-sequence-findings.synthetic/payload.json
exists mockups/finding-evidence-routing.behavior.md
exists mockups/INDEX.md
exists mockups/sweep/harmonic-v2-desktop/acceptance.py
exists DESIGN.md
exists AGENTS.md
exists .github/workflows/ci.yml

Existing definitions
{"cgm_coverage_floor": 0.7, "evening_end_hour": 24, "evening_start_hour": 18, "in_sequence_tail_minutes": 5.0, "minimum_bucket_n": 8, "post_horizons_hours": [4, 6], "quintile_count": 5, "sequence_gap_hours": 3.0, "tir_high_mgdl": 180, "tir_low_mgdl": 70, "window_count_bands": ["1", "2", "3+"], "window_merge_minutes": 30.0}

Synthetic first-hour spike
population_fields=candidate,carbs,end,id,member_event_ids,period,quintile,sequence_end,sequence_start,start,window_count
periods=post_4h
{"cohort": "matched", "finite_medians": 48, "last_bin": {"median": 110.0, "minute": 235, "n": 8, "p25": 110.0, "p75": 110.0, "support": "supported"}, "points": 48, "routed": 8, "usable": 8}
{"cohort": "comparison", "finite_medians": 48, "last_bin": {"median": 110.0, "minute": 235, "n": 32, "p25": 110.0, "p75": 110.0, "support": "supported"}, "points": 48, "routed": 32, "usable": 32}

Document references to the current chart
DESIGN.md:307: ### Eating-sequence evidence (#342)
DESIGN.md:309: High-carb sequence and Repeat eating are habit causes nested under Highs after
DESIGN.md:314: The sixth registry family, eating-sequence, reuses the shared tile, mini mount,
DESIGN.md:321: The dedicated fixture retains producer preparations (including findings.rows), rendered rows and cases for global and 0–360 windows, interns repeated JSON values as $ref entries, and expands them unchanged through frontend/eating-sequence-fixture.js.
CONTEXT.md:401: High-carb sequence or Repeat eating, nested as a habit cause within Highs after
openspec/specs/surfaces/spec.md:527: Diagnose SHALL nest supported eating-sequence lever findings as habit causes under
openspec/specs/surfaces/spec.md:529: and no rank numeral or extra Findings/Sift count. The eating-sequence descriptor
openspec/specs/surfaces/spec.md:539: - **GIVEN** an eating-sequence report cell with insufficient status and null metric
openspec/specs/surfaces/spec.md:544: #### Scenario: The adapter does not re-derive an eating-sequence judgment
openspec/specs/surfaces/spec.md:553: - **GIVEN** Diagnose requests eating-sequence evidence
openspec/specs/surfaces/spec.md:555: - **THEN** it requests `/api/diagnose/eating-sequences` without a window parameter
openspec/specs/surfaces/spec.md:560: - **GIVEN** a fresh eating-sequence report response without `input_data_age`
openspec/specs/surfaces/spec.md:890: ### Requirement: Eating-sequence charts reuse the shipped tile and served cohort values
openspec/specs/surfaces/spec.md:892: The eating-sequence registry kind SHALL precede the generic behavioral comparison
openspec/specs/eating-sequences/spec.md:1: # eating-sequences Specification
openspec/specs/eating-sequences/spec.md:5: relatively high-carb eating, or eating repeatedly within one stretch, runs
openspec/specs/eating-sequences/spec.md:19: The eating-sequence detector contract SHALL define a carb-bearing bolus as a
openspec/specs/eating-sequences/spec.md:94: ### Requirement: Carb quintiles are deterministic and user-relative
openspec/specs/eating-sequences/spec.md:96: The contract SHALL assign balanced empirical quintiles once over every
openspec/specs/eating-sequences/spec.md:99: `n`, the internal quintile index SHALL be `min(4, i * 5 // n)`; served quintile
openspec/specs/eating-sequences/spec.md:104: verbatim; it SHALL never re-rank evening sequences. A quintile row's
openspec/specs/eating-sequences/spec.md:105: `sequence_n` SHALL count every sequence assigned to that quintile within the
openspec/specs/eating-sequences/spec.md:113: - **WHEN** quintiles and boundaries are assigned
openspec/specs/eating-sequences/spec.md:115: - **AND** every sequence receives exactly one balanced empirical quintile
openspec/specs/eating-sequences/spec.md:117: #### Scenario: Evening rows reuse the pooled quintile assignment
openspec/specs/eating-sequences/spec.md:121: - **WHEN** quintile rows are prepared for pooled and evening scopes
openspec/specs/eating-sequences/spec.md:122: - **THEN** evening filters the quintiles and boundaries assigned to the pooled
openspec/specs/eating-sequences/spec.md:147: The report module SHALL expose `REPORT_SCHEMA = "eating-sequence-report-v1"` and
openspec/specs/eating-sequences/spec.md:148: frozen report rows for interval aggregates, quintiles, matrix rows, and comparisons.
openspec/specs/eating-sequences/spec.md:150: the fixed source-window bounds, ordered five-row scopes, six high-carb comparisons,
openspec/specs/eating-sequences/spec.md:152: and aggregate-only data boundary. Each high-carb comparison row SHALL additionally
openspec/specs/eating-sequences/spec.md:164: {"carb_quintile":1,"period":"in_sequence","reference_band":"1","repeat_band":"3+","status":"insufficient","reference_n":0,"repeat_n":0,"reference":{"status":"insufficient","n":0,"tir_pct":null,"mean_mgdl":null,"sd_mgdl":null,"peak_mgdl":null},"repeat":{"status":"insufficient","n":0,"tir_pct":null,"mean_mgdl":null,"sd_mgdl":null,"peak_mgdl":null},"tir_difference_pct_points":null,"mean_difference_mgdl":null,"sd_difference_mgdl":null}
openspec/specs/eating-sequences/spec.md:177: - **WHEN** a supported high-carb or repeat comparison is serialised
openspec/specs/eating-sequences/spec.md:181: ### Requirement: Eating-sequence reporting is outside the tuning and safety paths
openspec/specs/eating-sequences/spec.md:183: The eating-sequence report SHALL be a separate report contract, not an extension
openspec/specs/eating-sequences/spec.md:194: - **WHEN** an eating-sequence report has supported adverse aggregates
openspec/specs/eating-sequences/spec.md:201: The eating-sequences module SHALL expose
openspec/specs/eating-sequences/spec.md:234: ### Requirement: High-carb findings are supported aggregate associations only
openspec/specs/eating-sequences/spec.md:260: #### Scenario: A better high-carb cohort does not produce a finding
openspec/specs/eating-sequences/spec.md:273: ### Requirement: Served eating-sequence evidence is generated and parity-checked
openspec/specs/eating-sequences/spec.md:275: The repository SHALL commit `frontend/__fixtures__/eating-sequence-report.json` only
openspec/specs/eating-sequences/spec.md:287:   fields, and retains a populated high-carb finding
openspec/specs/eating-sequences/spec.md:293: by `(carb quintile, band)` into all fifteen `matrix` rows in that order. For every
openspec/specs/eating-sequences/spec.md:294: carb quintile and period it SHALL compare the `3+` band with the `1` band into all
openspec/specs/eating-sequences/spec.md:295: fifteen `comparisons` rows in `(carb_quintile, period)` order. A comparison SHALL
openspec/specs/eating-sequences/spec.md:305: break ties by `post_4h`, `post_6h`, `in_sequence`, then lower quintile number. Its
openspec/specs/eating-sequences/spec.md:306: TIR summary SHALL be `In carb quintile <q> sequences, those with three or more
openspec/specs/eating-sequences/spec.md:309: Its SD summary SHALL be `In carb quintile <q> sequences, those with three or more
openspec/specs/eating-sequences/spec.md:318: - **GIVEN** supported `3+` and `1` cohorts in one carb quintile where `3+` has
openspec/specs/eating-sequences/spec.md:342:   quintile with equal TIR drops
openspec/specs/eating-sequences/spec.md:348: The repeat-eating amplifier SHALL use the same pre-eligibility pooled quintile
openspec/specs/eating-sequences/spec.md:349: assignment and same `_metrics` eligibility output as the high-carb sequence detector.
openspec/specs/eating-sequences/spec.md:350: It SHALL NOT re-derive quintiles or make a second eligibility pass. Its exclusions
openspec/specs/eating-sequences/spec.md:364: from one evaluation of the pinned source window, sequence construction, quintiles,
openspec/specs/eating-sequences/spec.md:369: High-carb recurrence opportunities SHALL be qualifying sequences in the chosen
openspec/specs/eating-sequences/spec.md:372: the chosen comparison quintile and period; two-window sequences SHALL remain
mockups/INDEX.md:156: Issue #342 chart baseline: `openspec/changes/eating-sequence-findings/evidence/`;
mockups/INDEX.md:160: - **Eating-sequence findings (#342):** `eating-sequence-findings.synthetic/payload.json`
mockups/INDEX.md:162:   Python producers. The real chart lives in `frontend/diagnose-eating-sequences.js`;
```
