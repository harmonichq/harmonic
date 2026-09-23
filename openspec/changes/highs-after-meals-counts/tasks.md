# #424 implementation checklist

A checked item means implemented and verified. Fixtures come only from their
committed generators; never hand-edit one. No classifier, cap, floor, admission,
attribution, staging, tier, rank or Pattern rate value changes anywhere below.

## 1. Case-file comparison counts

- [ ] 1.1 Implement behavioral-layer **One canonical opportunity population owns
  every Finding case file.** in `finding_case_file._event`: serve
  `outside_comparison` (roster Occurrences in none of the three cohorts; zero for a
  same-population comparison) and retire the `not_comparable` count key. Fail
  first in `tests/test_finding_case_file.py`: a Pattern case file over one claimed,
  one calm and one no-data meal asserts matched + nearly matched + comparison equals
  the denominator and that
  `counts.get("outside_comparison", counts.get("not_comparable")) == 0`; on the
  base it fails because the served leftover repeats the comparison cohort (2, not
  0). Move every existing assertion on the retired key in
  `tests/test_finding_case_file.py` and `tests/test_finding_case_file_api.py` to
  the new count, and add the Missed / unannounced meal case (its Highs outside the
  comparison equal roster − matched − nearly matched) per http-api **Finding case
  files are bound to one snapshot preparation.**
- [ ] 1.2 Implement behavioral-layer **Each event cohort names the verdict-band
  state it holds**: serve `band_verdict` on every cohort. Tests for a
  same-population case file (`fired`, `near_miss`, none) and for Missed /
  unannounced meal (none on its attributed Matched cohort).
- [ ] 1.3 Update `frontend/finding-case-file-validation.js` to the new totals
  (same population: matched + nearly matched + comparison + outside equals the
  denominator and outside is zero; cross population: matched + nearly matched +
  outside equals the denominator), to check each served `band_verdict` against its
  members' verdicts and the verdict count, and to reject a case file that still
  serves the retired leftover key. Node tests in
  `frontend/finding-case-file-validation.test.js`, including a case file whose
  outside count repeats its comparison cohort, which is rejected.
- [ ] 1.4 Carry the new counts and `band_verdict` into the fixture-only Pattern
  case-file projector `mockups/diagnose-event-comparison.synthetic/project.mjs`,
  and regenerate every drift-checked artifact that serializes case files through
  its own generator (`scripts/gen_missed_meal_comparison_fixtures.py`,
  `.claude/qa/gen_synthetic_fixtures.py` via `scripts/check_demo_fixtures.py`,
  `mockups/harmonic-v2.exploration/generate.py`); leave every `--check`,
  `node mockups/diagnose-event-comparison.synthetic/generate.mjs --check` and the
  fast gate green.

## 2. A folded cause's count on its Pattern

- [ ] 2.1 Implement the Pattern-owned credit rule of behavioral-layer **A folded
  cause serves its count on its Pattern's population** as one function in
  `ciq_autotune/analyzers/scenario/outcome_patterns.py`; `_rate` counts its result
  and `finding_case_file._pattern_case` names each claimed meal's member from it.
  The roster `build_outcome_patterns` returns stays byte-identical, so every QA
  case expectation, `scripts/gen_qa_e2e_db.py --check` and the catalog-generated
  case tests stay green without edits.
- [ ] 2.2 Serve `fold_sentences` on every row the findings projection folds under
  a Pattern, reading the credit rule over the same window population the Pattern
  producer used. Fail first in `tests/test_findings_projection.py` on the
  manufactured QA cases: `behavioral-correction-stacking` (Correction stacking
  leads with 2 of 2 lows in the Pattern's scope and follows with its
  correction-cluster count outside it) and `behavioral-carb-undercount` (two
  causes' credited counts on 6 meals add up to 3); on the base both fail because
  no folded row serves a count on its Pattern's population. Add built-payload
  tests for a meal two rate levers claim (credited once, to the first, and the case
  file's member names the same lever) and for a folded Sequence habit (every fold
  sentence outside), and a test on the frozen projection fixture's whole-day inputs
  (`frontend/__fixtures__/findings-projection.json`), where Lows after correcting
  highs serves no count sentence (no admission route, 1 of 5 lows): every fold
  sentence of Correction on active insulin and Correction stacking is outside and
  none is in the Pattern's scope. Assert that the rows' `count_sentences` and
  `appearances` and the published roster are unchanged.
- [ ] 2.3 Implement behavioral-layer **A Pattern case file's outranked meals stay
  outside its claimed count** as a test on the Pattern case file's verdict counts
  in `tests/test_finding_case_file.py`, built with a claimed meal, a meal where
  Late bolus matched although it did not drive its episode, and a meal Meal
  over-delivery drove. No production change: the check found the header right.
- [ ] 2.4 Transcribe `fold_sentences` into the fixture-only findings mirror
  `mockups/findings-projection.mirror.mjs` over its own outcome-window filter, and
  regenerate `scripts/gen_findings_projection_fixtures.py`,
  `scripts/gen_eating_sequence_fixtures.py` and
  `mockups/harmonic-v2.exploration/generate.py`; leave
  `frontend/findings-projection-mirror.test.js`, every `--check` and the fast gate
  green.

## 3. The caption and the fold in the desk

- [ ] 3.1 Implement surfaces **The Response comparison caption reconciles with
  its cohorts and the band** and the Missed-meal display of surfaces **Diagnose
  renders Finding case files without browser-owned policy.** in
  `renderEventComparisonRoster` (`frontend/diagnose-workstation.js`): served
  cohort names and counts in served order, the band link from `band_verdict` in
  the band's own words (`VERDICT_BAND_KEY`), and "outside the comparison" after
  the served population noun only when the served count is non-zero. The verdict
  band and its residue line are untouched (#423 owns the claimed word).
- [ ] 3.2 Implement surfaces **A folded cause's count reads on its Pattern's
  population**: `queueRows` gives each folded member its served `fold_sentences` and
  scope (`frontend/diagnose-findings-queue.js`), and the member line prints the
  Pattern's-scope sentence first and sets the outside ones apart behind "outside
  the count", printing no outcome word. Node tests in
  `frontend/diagnose-findings-queue.test.js`.
- [ ] 3.3 Amend `DESIGN.md`'s Pattern fold bullet to the share-first line, and
  add `CONTEXT.md` terms for "outside the comparison" (avoid: not comparable,
  leftover) and a folded cause's share of its Pattern ("outside the count" for the
  rest), in the ubiquitous language's existing format.

## 4. Ledger amendments and replay stories

- [ ] 4.1 Implement surfaces **The case-file counts revision ships with its ledger
  amendments**: add S124 (`behavioral-carb-undercount`: the Highs after meals
  caption names Matched, Nearly matched and Other meal opportunities with their
  served counts, each matching its section heading, links Meets criteria and
  Borderline once, adds up to the header denominator, prints nothing outside the
  comparison, and no visible count other than the band's no-data count is
  labelled "not comparable"), S125 (`behavioral-missed-meal`: the caption prints
  the served Highs outside the comparison in those words and no "not comparable",
  Matched carries no band link, and the band's no-data count keeps "not
  comparable") and S126 (`behavioral-correction-stacking`: the open fold prints
  Correction stacking's 2 of 2 lows first and its correction-cluster count behind
  "outside the count", and the cause lines' Pattern's-scope counts add up to the
  Pattern's served count) in a new dated
  `## #424 amendment — 2026-09-23, issue #424` section of
  `mockups/harmonic-v2-desktop.behavior.md`, with
  replay functions in `frontend/c4.replay.mjs`, registry entries in
  `frontend/desk-behavior.replay.mjs`, case mappings in
  `frontend/replay-cases.mjs`, and node regression tests in
  `frontend/c4.replay.test.js` that tell a feature assertion from a setup error.
  No story asserts the claimed-state words (#423).
- [ ] 4.2 Amend S115 with a line written `Amended S115 · 2026-09-23 · #424 / Q2
  sanction: …` in that same section, never a line beginning `S115 ·`, quoting the
  sanction in `proposal.md`: a folded member line is read from the served
  `fold_sentences`, the outside ones set apart. S115's original text stays as
  frozen.
- [ ] 4.3 Move the pinned counts in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` (`inventory()`) and
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py` from 147 issued / 128
  active to 150 issued / 131 active, retired unchanged at 19, so the driver's own
  tests pass on this branch, and state the counts that
  `python3 mockups/sweep/harmonic-v2-desktop/acceptance.py inventory --out <scratch dir>`
  prints. Leave every `★ FROZEN` block, the ledger header's
  inventory line, `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md`'s count
  sentence and `mockups/INDEX.md`'s counts untouched: the release coordinator
  writes those once, across every ticket.
- [ ] 4.4 Record in each new story's status line the base fail-first and branch
  pass at 1280x720 and 1440x900, from runs the coordinator makes serially.
