# Tasks — the carb-ratio block shows and explains its evidence (#464)

Positional numbering is the lock's authority. Chunk 1 owns 1–5, chunk 2 owns
6–7, chunk 3 owns 8–11, chunk 4 owns 12–15, chunk 5 owns 16–19. A ticked box means
implemented and verified, never attempted; the coordinator ticks.

- [ ] 1. **Serve why each run is or is not in the estimate.** The shared block
  stamper (`_analyze_ic_blocks_shared`, `ciq_autotune/analyzers/ic.py`) records
  on every run row of `evidence.runs` one `pool_reason` from the closed set
  `counted-whole`, `counted-by-share`, `directional-only`, `prior-action-not-separable`,
  `earlier-ratio-or-uncurrent-chain`, `no-outcome-read`, chosen by the fit that
  built the pool (`_regression_block_fits`, `ciq_autotune/analyzers/ic_regression.py`;
  the incumbent `_incumbent_block_fits` records the same set). `in_pool` stays
  and equals `pool_reason in {counted-whole, counted-by-share}`. Each run row also
  carries `side` (`+1` above programmed, `-1` below, `0` when no programmed value)
  and its ledger terms copied from `MealRun`: `meal_dose`, `post_correction_user`,
  `post_correction_ciq`, `post_correction_unknown`, `ciq_basal_delta_acted_u`,
  `bg_outcome_u`, `rescue_carbs`, `meal_carbs`. The block's `evidence.eligibility`
  already carries `whole_runs`, `fractional_run_ownership`, `effective_run_count`;
  the projection (task 5) copies them. Failing-first pytest in
  `tests/test_ic_regression.py`: N synthetic runs through `analyze_ic_blocks_fuzzy`
  with one lone meal whose outcome read falls in a CGM gap → that run's served
  `pool_reason` is `no-outcome-read` and `directional_only` is `False`; on main it
  fails because no reason is served. A second test: a chained run dosed across two
  blocks serves `counted-by-share` on both blocks with `ownership` summing to 1.
- [ ] 2. **Serve the block's balance sheet.** On `evidence.ledger`: over the pooled
  runs, ownership-weighted sums of `carbs_covered`, `meal_dose`,
  `post_correction_user`, `post_correction_ciq`, `post_correction_unknown`,
  `ciq_basal_delta_acted_u`, `bg_outcome_u`, `rescue_carbs`, plus
  `effective_insulin` and `pooled_ratio = carbs_covered / effective_insulin`. The
  fitted `estimate` stays the block's number; `pooled_ratio` is the plain-arithmetic
  check beside it and is labelled so downstream (design.md, ADR 464 — balance
  sheet). Pytest on analyzer output from N synthetic runs: each served run's
  `true_ic` equals its served `carbs / effective_insulin` to 1e-6, and the block's
  `pooled_ratio` equals the weighted quotient of the served per-run terms.
- [ ] 3. **Serve the outcome tally and the reconciling sentence — by the Pattern's own
  credited claims.** "Ran high" for "Highs after meals" is decided by
  `credited_claims(exposures, "meals", rate_levers)` over the `attributed_levers`
  that `build_exposures(store, window_days=…)` (`ciq_autotune/explore_exposures.py`)
  stamps on each meals-family occurrence — a store-level evaluation with the
  false-low drop, the low-prompt answers and the window bounds — not
  `attributed_occurrences`, which has no production caller and returns only the
  primary-driver map. The block stamper has no store, so the tally lives in the
  evidence preparation (`prepare_ic_block_evidence(store, analysis)`,
  `ciq_autotune/ic_block_evidence.py`), which does: it calls
  `build_exposures(store, window_days=BLOCK_WINDOW_DAYS)` once per preparation
  (its `now` is the latest basal/CGM instant, the same clock `analyze()` defaults
  to, so the span is the block's own 90 days) and, for each of the block's
  `points` meals, finds the `meals` occurrence whose `t` names the same instant as
  the meal's bolus (parse both: the exposure feed prints the engine's `_FMT`, the
  analyzer prints `isoformat()`), then stamps `outcome`: `ran-high` when
  `credited_claims(exposures, "meals", <highs_after_meals rate levers from
  outcome_patterns._ROSTER>)` credits it, `ran-low` when the `lows_after_meals`
  rate levers credit it, `in-range` when a meals occurrence exists and neither
  credits it, `unread` when no meals occurrence exists. On `evidence.outcomes`
  (a preparation-owned key, beside the analyzer's): `counts` (`ran_high`,
  `ran_low`, `in_range`, `unread`, `n`), `low_minutes_median` — the median of
  minutes from `dominant_bolus_t` to `t` over the block's served `harm.lows`,
  null when none — and `sentence`, one string from a closed set in
  `ic_block_evidence.py` keyed on the block's asserted direction (`raise` /
  `lower` / none), whether `ran_high > ran_low`, and the chain-end read
  (design.md, ADR 464 — sentence). The frontend prints `sentence` verbatim and
  composes none. Measure the preparation's wall time on the committed showcase
  store before and after (the endpoint answers from the result cache's fixed
  snapshot, so this is a warm-up cost, not a per-request one) and report both in
  the handback. Failing-first pytest: a manufactured store whose pooled chain
  spikes above range then prints a low attributed to its meal serves
  `counts.ran_high ≥ 1`, `counts.ran_low ≥ 1` and a sentence naming the chain-end
  read; a second test pins that a meal the Pattern credits to `late_bolus` is
  `ran-high` here too (one definition); on main `outcomes` is absent.
- [ ] 4. **Serve the harm evidence.** On `evidence.harm_evidence`: the block's
  `harm` dict (`arm`, `gated`, `nudged`, `arm_days`, `row_days`, `lows` — each low
  with `t`, `bg`, `dominant_bolus_t`, `attribution_reason`) and the guidance
  `seriousness` the analyzer stamps on the block, copied verbatim. Pytest: a block
  with two attributed lows on separate days serves both rows and `row_days == 2`.
- [ ] 5. **Project it, bump the schema, regenerate the fixture.**
  `prepare_ic_block_evidence` / `project` (`ciq_autotune/ic_block_evidence.py`)
  copy through: `block.current`, `block.estimate` (`value`, `lo`, `hi`, `wide`),
  `block.side` (`side_k`, `side_n` from `recurrence_channels`), `block.support_detail`
  (`whole_runs`, `fractional_run_ownership`, `effective_run_count`), `ledger`,
  `outcomes` (task 3), `harm_evidence`, each run row's new fields, and
  `meal_comparison`: one comparison **projection** for the block's `points`
  meals in exactly the shape the Finding case file publishes for a meals-family
  comparison — `alignment: "event"`, `anchor` (the meals catalog's own anchor
  label), `window_min`, and `cohorts` keyed `ran-high` / `ran-low` / `in-range`
  (an `unread` meal is counted, not drawn) each with its pooled `points`
  (`minute`, `bg`, `support`) and `support`, under schema
  `diagnose-carb-ratio-meal-comparison-v1` — built by the cohort and pooling
  functions `ciq_autotune/event_comparison.py` already uses for the meals family,
  promoted to one named module-level seam if they are private (this is their
  second caller), never re-implemented. `SCHEMA` becomes
  `diagnose-carb-ratio-block-evidence-v2`; the projection raises
  `InconsistentIcBlockEvidence` when any new analyzer fact is absent. Extend
  `scripts/gen_ic_block_evidence_fixtures.py` with one case carrying chained
  runs shared across two blocks, a run with no outcome read, a run dosed under
  an earlier ratio, a pooled chain that spikes then prints a low, and two
  attributed harm lows on separate days; **keep every existing case key**
  (`frontend/desk.browser.test.mjs:154` reads `cases.cross_midnight` and serves it
  as the endpoint); regenerate
  `mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json`; `--check`
  green; `tests/test_synthetic_fixture_shapes.py` and `tests/test_ic_block_evidence.py`
  cover the v2 shape through `TestClient` on the endpoint.
- [ ] 6. **A manufactured QA case for the browser.** Add `QaCase("ic-block-evidence")`
  to `scripts/qa_e2e_cases.py` (recipe first, per AGENTS.md "Maintaining QA coverage
  eras"): two programmed carb-ratio blocks; chained runs shared across them;
  excluded runs of every served reason; one pooled chain that spikes then prints
  a low; at least two attributed lows on separate days; the block asserts a
  raise. Materialize, `execute_case`, and copy the complete serialized dumps into
  literal `QaExpectation` values — never derived at assertion time. The
  catalog-generated `test_case_ic_block_evidence` passes.
- [ ] 7. **Budgets and drift.** `uv run python scripts/gen_qa_e2e_db.py --check` green;
  the committed showcase is unchanged (`git diff --stat -- mockups/qa-e2e.synthetic`
  empty); all five budgets re-measured without raising a limit and recorded in this
  change's `coverage-appendix.md`; a breach stops the work.
- [ ] 8. **By meal is the tile's default view.** In
  `frontend/diagnose-evidence-charts.js` the carb-ratio entry's `modes` become
  `['meal', 'runs', 'clock']` (`diagnose-canvas-layout.js` reads `modes[0]` as the
  default). The `meal` option draws the served `meal_comparison` projection
  through a new named export of `frontend/diagnose-event-comparison.js`,
  `comparisonProjectionOption(projection, range, surface, mini, selected = null)`,
  extracted from the module's private `option()` (which reads only
  `caseFile.projection`); `eventComparisonChartOption` keeps `assertEventCaseFile`
  and delegates to it, so the case-file path and its tests are unchanged and the
  guard's fate is: untouched. The tile mounts the ECharts option in its own
  element as every other kind does; `renderEventSurface`'s `ec-*` ids are not
  involved. The key carries the served cohort counts and the served `unread`
  count. Failing-first node test through the registry: `option('meal')` on the v2
  fixture yields the served cohorts as named series with point counts equal to
  the served cohort sizes, and `eventComparisonChartOption` still throws on a
  non-case-file input; on main the mode does not exist.
- [ ] 9. **Runs replaces the chain overlay.** New module `frontend/diagnose-run-strips.js`
  (+ `.test.js`, + `frontend/diagnose-run-strips.css` imported where the
  comparison chart's stylesheet is) renders the `runs` option: one row per served
  run, sorted by served `true_ic`, pooled runs first, excluded runs after and
  dimmed, each carrying its served `pool_reason` in reader words (one fixed map in
  the module, the same shape ADR 434 used for excluded nights). Each strip: the
  run's CGM series from the block-hours meal onward in hours; the block-hours meal
  a filled marker and later chain meals open markers; served lows (`harm_evidence.lows`
  whose `dominant_bolus_t` is a member) and points above 180 marked; correction
  ticks from the run's `post_correction_*` terms at their member offsets; at the
  row's edge the balance sheet (bolus · corrections · basal Δ · glucose travel →
  ratio) against the programmed value. The x-axis `min`/`max` are the served
  bounds. Hover and keyboard (Up/Down between strips, Left/Right along one) show a
  readout naming the run's start, meals, ratio and reason. Selection: the option
  takes `selectedRunId` and calls `onSelectRun(run_id)`; this is the
  **strip-selection contract** the panel consumes (chunk 4). Failing-first node
  tests: strip order equals served-ratio order with pooled first; a run with
  `pool_reason: no-outcome-read` is dimmed and never in a series named
  "Directional-only run"; `xAxis.min` equals the lowest served `cgm_start_min`.
- [ ] 10. **By clock shows the claim against the programmed ratio.** The `clock`
  option draws the served `current` as a rule, the served estimate band as a
  shaded span, each run's ratio at its meal start with its served `side`, and
  shared runs (`counted-by-share`) with a distinct marker sized by `ownership`. The
  key names each. Change `frontend/diagnose-evidence-charts.test.js` at the
  "feed-only forms do not invent unavailable … values" test so it asserts the
  served values are drawn as served instead of asserting their absence.
- [ ] 11. **Every key, description and thumbnail names what is drawn.** No series
  is named "Directional-only run" unless every member run is `directional-only`;
  the aria description names the served counts per population (pooled, shared,
  excluded, meals in hours); the thumbnail reads the served counts;
  `frontend/diagnose-canvas-layout.test.js` pins the three modes. Node tests.
- [ ] 12. **The panel says what the verdict is measured over.** In
  `renderIcBlockLevel` (`frontend/diagnose-workstation.js`) a scope line in the
  correction factor panel's measured-in idiom: the ledger closes at the end of
  each meal chain, not five hours after the meal; `whole_runs` whole runs and
  `fractional_run_ownership` from runs shared with the neighbouring block make the
  `effective_run_count`; the support line links the glossary's Meal run entry.
  Served facts only; the panel composes no count.
- [ ] 13. **The panel shows the ledger, the tally, the sentence and the lows.**
  Beneath the numbers-and-staging block, which stays byte-identical: the served
  balance sheet as one labelled row of terms with `pooled_ratio` beside the
  fitted estimate; the served outcome `counts` as a count sentence in the queue's
  `n of d noun outcome` form and `low_minutes_median` when present; the served
  `sentence` verbatim; the attributed lows as rows through the shared
  occurrence-roster mechanism (`frontend/occurrence-roster.js`), one per served
  low printing its date and time and minutes after its bolus, each opening Day at
  that moment with it ringed, headed by the served `seriousness` word and whether
  the harm arm gated or nudged this block. Loading and failure states use the
  inspector's shipped `.empty` line ("Loading run evidence…", "Run evidence
  unavailable."); nothing renders from a payload not received.
- [ ] 14. **The run roster, and the Day hop from both entry paths.** Through the
  same roster mechanism: groups `Counted whole`, `Counted by share`, then one group
  per served exclusion reason in reader words, each header with its served count;
  one button row per run printing start day and time, meals in the run, carbs,
  effective insulin, measured ratio and (shared runs) ownership; the five-row cap
  and show-more honoured with expand state on the block frame; selecting a row
  sets `selectedRunId` on the strips option and selecting a strip presses the row
  (the strip-selection contract, chunk 3); the selected run's detail block
  carries "Clear" and "Open in Day", landing on Day at the run's first meal with
  it ringed. The block frame publishes a subject derived from the block itself so
  the Day callback also navigates when the block was opened from the case head's
  "View segment" (`frontend/diagnose.js` navigates only on a published subject).
  Node tests on `renderIcBlockLevel` and on the frame's subject.
- [ ] 15. **Define meal run for the reader, and keep the two guards that read
  these files green.** `frontend/glossary.js` I:C group gains Meal run (what it
  is, why several meals form one), Support (whole runs plus carb-share credit
  toward the eight-run floor), Directional-only, and Chain-end read; `CONTEXT.md`
  "Other tunable parameters" gains a **Meal run** entry with its `_Avoid_` line.
  The design exploration's generator lifts the glossary literal verbatim
  (`mockups/harmonic-v2.exploration/generate.py`, `DESK_GLOSSARY`) into
  `mockups/harmonic-v2.exploration/glossary.js` and records its `start_line` in
  `utilities.json`, and CI runs its `--check`: regenerate both with
  `uv run python mockups/harmonic-v2.exploration/generate.py` and confirm
  `--check` prints no drift. The contamination scan pins dose-ratio
  acknowledgements by line (`scripts/public_scan_config.txt`, `CONTEXT.md:515`,
  `:77`, `:99`), and a digest refuses a hand edit: after the CONTEXT.md insertion,
  run the public-tree scan, read the printed delta (line moves only — no new
  entry), and regenerate the block with
  `python3 scripts/scan_public_tree.py "$t" --accept-dose-ratio-baseline`. Node
  test that the glossary names each term.
- [ ] 16. **Amend the frozen behavior ledger.** In
  `mockups/harmonic-v2-desktop.behavior.md`, under a dated `## #464 amendment`
  header: one STORY per added or changed behavior — By meal default on block
  open; Runs view order, dimming and readout; By clock rule and band; scope line;
  ledger row; tally and sentence; lows rows and Day hop; run roster groups and
  selection shared with strips; Day hop from the queue row and from View segment;
  loading and unavailable states; keyboard readouts — each with a replay function
  in `frontend/desk-behavior.replay.mjs` bound in `frontend/replay-cases.mjs` to
  `ic-block-evidence`; S98 amended if its selected-case assertions read the chain
  view; the retirement of the chain overlay is recorded as a CHANGED story (the
  behavior — the block's run evidence on the tile — still ships, rebuilt), not a
  retirement; `mockups/sweep/harmonic-v2-desktop/acceptance.py`'s pinned
  `issued/active/retired` counts move to the new totals in the same commit.
- [ ] 17. **Replay on the built app, and run the hand-listed browser suites.**
  `npm ci && npm run build`; the QA copy-then-serve command with `--no-fetch
  --token ''` on the `ic-block-evidence` case store emitted by
  `scripts/gen_qa_e2e_db.py --case`; the new stories and every story the
  amendment touched replayed at 1280×720 and 1440×900 with raw output (story
  counts, pass/fail per story) retained under this change's `evidence/`. Then the
  two hand-listed suites AGENTS.md names, exactly as CI runs them —
  `PLAYWRIGHT_MODULE=… node --test frontend/browser-runner.browser.test.mjs` and
  `PLAYWRIGHT_MODULE=… node --test frontend/desk.browser.test.mjs` (the desk
  suite serves the regenerated capture's `cross_midnight` case as the
  block-evidence endpoint and renders the revised tile and panel) — green. A
  failure in a chart or panel is reported to the coordinator with the story or
  test name, the served projection and the rendered DOM; the owning sub-order's
  worker fixes it. The complete ledger runs exactly once, on the commit to be
  pushed.
- [ ] 18. **Before/after renders.** Synthetic renders of the block panel and each
  of the three views at both viewports from the base worktree and the revision,
  after console, request, accessibility and overflow checks pass, retained under
  `evidence/`. No real data; no snapshot-derived value.
- [ ] 19. **Design record.** `DESIGN.md` gains a `### #464 carb-ratio block evidence
  amendment` appended after the `### #404 desk revise amendment` section (past
  the scan's pinned acknowledgements at `DESIGN.md:163`, `:181`, `:183`, which
  therefore do not move; if the public-tree scan still reports a shifted
  acknowledgement, regenerate the baseline as task 15 does);
  `mockups/INDEX.md`'s Finding → evidence routing row gains a "revised in #464"
  note; the coverage appendix and evidence are committed; tasks ticked by the
  coordinator.
