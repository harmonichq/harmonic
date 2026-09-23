# Tasks — basal excluded-night reasons (#434)

## Analyzer, payload and generated artifacts

- [ ] Give each clean-window rule one implementation in `ciq_autotune/model.py`,
  used by both `clean_samples` and the reason pass, that can name the
  highest-ranked rule a minute fails (design, first ADR 434). `clean_samples`
  keeps its signature and returns identical samples for every caller
  (`ciq_autotune/analyzers/basal.py`, `ciq_autotune/report.py`,
  `ciq_autotune/backtest.py`, `ciq_autotune/trial_evidence.py`); no existing
  assertion in `tests/` is edited to make this pass.
- [ ] Stamp `excluded_night_reasons` in `analyze_basal` per parameter-analysis
  **The basal analyzer names one reason for every excluded night**. The reason
  pass runs after the estimate's nights are known, evaluates only excluded
  nights' minutes, and changes nothing else in the slot row. Write the
  analyzer-output tests first in `tests/test_basal_night_evidence.py` and see
  them fail on the base: the requirement's three analyzer scenarios, built from
  synthetic analyzer inputs over N nights (the spike's nights restated in the
  test, never imported), asserting literal counts and never hand-setting one.
- [ ] Copy `excluded_night_reasons` verbatim in
  `ciq_autotune/basal_night_evidence.py` and add it to the projection's required
  facts. Test through the endpoint and the projection that the served breakdown
  equals the analyzer row's, and that a payload without it raises
  `IncompleteBasalNightEvidence`.
- [ ] Regenerate exactly the artifacts the new field moves, each with its own
  generator: `frontend/__fixtures__/basal-night-evidence.json`
  (`scripts/gen_basal_night_evidence_fixtures.py`),
  `frontend/__fixtures__/analysis.json` (`scripts/gen_chart_builder_fixtures.py`),
  `frontend/__fixtures__/findings-projection.json`
  (`scripts/gen_findings_projection_fixtures.py`), and
  `mockups/harmonic-v2.exploration/setting.json`, `journey.json` and `focus.json`
  (`mockups/harmonic-v2.exploration/generate.py`; `focus.json` moves only through
  its embedded code-version hash). Leave every other drift check untouched and
  green. Before committing, compare each regenerated file with its base in a
  scratch script that sets the new field aside (and, in `focus.json`, the
  code-version and comparison-context id hashes), and show they are equal.
  Commit no comparison script.
- [ ] Define **Excluded night** in `CONTEXT.md`: a source night of a basal slot
  absent from that slot's final estimate, with its six reasons in rank order,
  each night counted once, and the synonyms to avoid.

## Desk surface and behavior ledger

- [ ] Export one reason table from `frontend/diagnose-evidence-charts.js`: served
  key to reader words, in rank order, omitting zero counts (design, second
  ADR 434). The basal evidence tile and the basal slot panel both read it; neither
  sums, derives nor reclassifies a count.
- [ ] Implement surfaces **The basal evidence names why its nights were
  excluded** on the tile: the full-size rail's total and reason rows, the
  middle-rank tally and the accessible description, and delete
  "excluded — not steady". In `frontend/diagnose-evidence-charts.test.js`, move
  the three rail assertions that expect "excluded — not steady" and the
  middle-rank tally assertion to the new rows and words, and add tests for the
  requirement's tile scenarios, including the crowded rail in the suite's
  950×307 canvas with every reason nonzero and a night with no programmed rate.
- [ ] Implement the panel's excluded-night line in `frontend/diagnose-workstation.js`
  `renderSlotLevel`, moving the `2 excluded nights` assertion in
  `frontend/diagnose-workstation.test.js` and covering the requirement's panel
  scenario.
- [ ] Add story S154 to `mockups/harmonic-v2-desktop.behavior.md` for the
  requirement's served-desk scenario, under a dated #434 section that quotes the
  sanction in design (second ADR 434). Add `C4_STORIES.S154` in
  `frontend/c4.replay.mjs`, register it once in
  `frontend/desk-behavior.replay.mjs` (it runs on the default showcase case), and
  cover it in `frontend/c4.replay.test.js`: registered once, served from the
  showcase, and a fake page that tells a feature failure from a setup failure.
  Pick a showcase slot whose served breakdown has at least two nonzero reasons,
  and pin its literal counts from the served payload read in-process through the
  API test client, never through a running server. Move the pinned ledger
  inventory to issued 148, active 129, retired 19 in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` `inventory()`, and the two
  147 counts in `mockups/sweep/harmonic-v2-desktop/acceptance.test.py` to 148.
