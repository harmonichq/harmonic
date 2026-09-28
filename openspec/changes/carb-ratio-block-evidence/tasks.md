# Tasks — the carb-ratio block shows and explains its evidence (#464)

Positional numbering is the lock's authority. Chunk 1 owns 1–5, chunk 2 owns
6–7, chunk 3 owns 8–11, chunk 4 owns 12–15, chunk 5 owns 16–19. A ticked box means
implemented and verified, never attempted; the coordinator ticks.

- [x] 1. **Serve why each run is or is not in the estimate.** The shared block
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
- [x] 2. **Serve the block's balance sheet.** On `evidence.ledger`: over the pooled
  runs, ownership-weighted sums of `carbs_covered`, `meal_dose`,
  `post_correction_user`, `post_correction_ciq`, `post_correction_unknown`,
  `ciq_basal_delta_acted_u`, `bg_outcome_u`, `rescue_carbs`, plus
  `effective_insulin` and `pooled_ratio = carbs_covered / effective_insulin`. The
  fitted `estimate` stays the block's number; `pooled_ratio` is the plain-arithmetic
  check beside it and is labelled so downstream (design.md, ADR 464 — balance
  sheet). Pytest on analyzer output from N synthetic runs: each served run's
  `true_ic` equals its served `carbs / effective_insulin` to 1e-6, and the block's
  `pooled_ratio` equals the weighted quotient of the served per-run terms.
- [x] 3. **Serve the outcome tally and the reconciling sentence — by the Pattern's own
  credited claims.** (as amended by ADR 464 — plain reading; served from the
  window, not credited claims) "Ran high" for "Highs after meals" is decided by
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
  `ran_low`, `in_range`, `unread`, `n`) and `sentence`, one string from a closed
  set in `ic_block_evidence.py` keyed on the block's asserted direction (`raise`
  / `lower` / none), whether `ran_high > ran_low`, and the chain-end read
  (design.md, ADR 464 — sentence). The frontend prints `sentence` verbatim and
  composes none. Measure the preparation's wall time on the committed showcase
  store before and after (the endpoint answers from the result cache's fixed
  snapshot, so this is a warm-up cost, not a per-request one) and report both in
  the handback. Failing-first pytest: a manufactured store whose pooled chain
  spikes above range then prints a low attributed to its meal serves
  `counts.ran_high ≥ 1`, `counts.ran_low ≥ 1` and a sentence naming the chain-end
  read; a second test pins that a meal the Pattern credits to `late_bolus` is
  `ran-high` here too (one definition); on main `outcomes` is absent.
  Superseded in execution: the tally shipped as each block-hours meal's plain
  reading against the band with no served `sentence`, and with the 90-day exposure
  pass gone there was no warm-up cost left to measure (design.md, ADR 464 — The
  outcome tally reads each meal plainly against the band).
- [x] 4. **Serve the harm evidence.** On `evidence.harm_evidence`: the block's
  `harm` dict (`arm`, `gated`, `nudged`, `arm_days`, `row_days`, `lows` — each low
  with `t`, `bg`, `dominant_bolus_t`, `attribution_reason`) and the guidance
  `seriousness` the analyzer stamps on the block, copied verbatim, plus
  `minutes_after_bolus_median`: the median of minutes from each served low's
  `dominant_bolus_t` to its `t`, over exactly these `lows`, null when none — the
  one population that number is ever read against (task 13 prints it in the lows
  rows' header, never beside the outcome counts). Pytest: a block with two
  attributed lows on separate days serves both rows, `row_days == 2` and the
  median of their two offsets.
- [x] 5. **Project it, bump the schema, regenerate the fixture.**
  `prepare_ic_block_evidence` / `project` (`ciq_autotune/ic_block_evidence.py`)
  copy through: `block.current`, `block.estimate` (`value`, `lo`, `hi`, `wide`),
  `block.side` (`side_k`, `side_n` from `recurrence_channels`), `block.support_detail`
  (`whole_runs`, `fractional_run_ownership`, `effective_run_count`), `ledger`,
  `outcomes` (task 3), `harm_evidence` (task 4), each run row's new fields, and
  `meal_comparison`: one comparison **projection** for the block's `points`
  meals, assembled exactly as `ciq_autotune/finding_case_file.py:1021-1062`
  assembles a meals-family comparison — one trace per block-hours meal,
  `{"id": <meal bolus isoformat>, "trace": {"cgm": [{"minute", "bg"}, …]}}`, its
  CGM read from ten minutes before the bolus to the end of the post-meal window
  (−10 to +315 min) over the same store call the run series use (the case file's
  `_comparison_trace` is that producer; reuse it if it takes a bare anchor
  instant, else the same read); then, per outcome,
  `event_comparison.project_cohort(key, traces, (-10, 315))` with `key` in
  `ran-high` / `ran-low` / `in-range` (an `unread` meal is counted in
  `outcomes.counts`, not traced), each cohort then given `name` (`Ran high` /
  `Ran low` / `In range`) and `anchor` `{"kind": "completed_carb_bolus", "label":
  "Completed carb bolus"}`; the projection is `{"schema":
  "diagnose-carb-ratio-meal-comparison-v1", "alignment": "event", "anchor": <the
  same anchor>, "window_min": [-10, 315], "cohorts": [ran-high, ran-low,
  in-range]}`. Points therefore carry `project_cohort`'s own fields — `minute`,
  `n`, `support`, `median`, `p25`, `p75` — and cohorts carry `key`, `name`,
  `anchor`, `routed_count`, `usable_count`, `support`, `occurrence_ids`, `points`.
  Nothing is re-implemented. `SCHEMA` becomes
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
  Superseded in execution: no `meal_comparison` projection shipped; the v2
  payload carries each meal's plain reading and the tally instead, because the
  pooled meal comparison left with the credited claims (design.md, ADR 464 — The
  outcome tally reads each meal plainly against the band).
- [x] 6. **A manufactured QA case for the browser.** Add `QaCase("ic-block-evidence")`
  to `scripts/qa_e2e_cases.py` (recipe first, per AGENTS.md "Maintaining QA coverage
  eras"): two programmed carb-ratio blocks; chained runs shared across them;
  excluded runs of every served reason; one pooled chain that spikes then prints
  a low; at least two attributed lows on separate days; the block asserts a
  raise. Materialize, `execute_case`, and copy the complete serialized dumps into
  literal `QaExpectation` values — never derived at assertion time. The
  catalog-generated `test_case_ic_block_evidence` passes.
- [x] 7. **Budgets and drift.** `uv run python scripts/gen_qa_e2e_db.py --check` green;
  the committed showcase is unchanged (`git diff --stat -- mockups/qa-e2e.synthetic`
  empty); all five budgets re-measured without raising a limit and recorded in this
  change's `coverage-appendix.md`; a breach stops the work.
- [x] 8. Replaced by the settled design (design.md, ADR 464 — The block's one view:
  the ratio strip over the run timeline): the tile opens on its one view with no
  toggle, and the ratio strip draws each counted run at its measured ratio, sized
  by its fit weight, whole runs filled and shared runs ringed.
- [x] 9. Replaced by the settled design (design.md, ADR 464 — The block's one view:
  the ratio strip over the run timeline): the run timeline draws each counted run
  from the glucose at its bolus to where it ended, with the listed lows as
  triangles; a run's hover reads out its ledger terms and how it ended; click and
  arrow keys select a run, ringed on both lanes.
- [x] 10. Replaced by the settled design (design.md, ADR 464 — The block's one view:
  the ratio strip over the run timeline): the programmed, recommended and
  estimated ratios are labelled rules on the ratio strip, with the estimate's
  range as a faint band.
- [x] 11. Replaced by the settled design (design.md, ADR 464 — The block's one view:
  the ratio strip over the run timeline): each lane's key names only its marks,
  filled or hollow as drawn; the read-aloud text ends with the block's served
  state; the thumbnail and the queue row's mini draw the ratio strip alone.
- [x] 12. Replaced by the settled design (design.md, ADR 464 — Why this move is four
  sentences, then the case against, then the lows): "Why this move" prints the
  served side, the fixed mechanism sentence, where the counted runs ended, and
  the served recommendation reason.
- [x] 13. Replaced by the settled design (design.md, ADR 464 — Why this move is four
  sentences, then the case against, then the lows): "The case against" prints the
  served peaks before the next bolus, the lows print as one served population in
  three groups, and the loading and unavailable lines stand beneath an intact
  numbers block.
- [x] 14. Replaced by the settled design (design.md, ADR 464 — Why this move is four
  sentences, then the case against, then the lows): each low opens Day at its own
  moment, ringed, from a queue row and from View segment alike; hovering a low
  selects its run on the tile; no run roster is on the panel.
- [x] 15. **Define meal run for the reader, and keep the two guards that read
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
- [x] 16. **Amend the frozen behavior ledger.** In
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
  Found at verification: the fixed PR smoke slice must reach every replay case
  and did not reach `ic-block-evidence`, so S201 (the panel story) joins
  `SMOKE_STORIES`, with its pinned count and digest, in the same change.
  Superseded in execution: the stories shipped as S197–S207 for the settled one
  view and panel — no By meal, run roster or ledger-row story — with S207 the
  CHANGED record (design.md, ADR 464 — The block's one view: the ratio strip over
  the run timeline, and ADR 464 — Why this move is four sentences, then the case
  against, then the lows).
- [x] 17. **Replay on the built app, and run the hand-listed browser suites.**
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
- [x] 18. **Before/after renders.** Synthetic renders of the block panel and each
  of the three views at both viewports from the base worktree and the revision,
  after console, request, accessibility and overflow checks pass, retained under
  `evidence/`. No real data; no snapshot-derived value.
  Superseded in execution: the revision has one view, so the renders are the
  desk, the opened block, its one-view tile and its panel at both viewports
  (design.md, ADR 464 — The block's one view: the ratio strip over the run
  timeline; evidence/README.md, Renders).
- [x] 19. **Design record.** `DESIGN.md` gains a `### #464 carb-ratio block evidence
  amendment` appended after the `### #404 desk revise amendment` section (past
  the scan's pinned acknowledgements at `DESIGN.md:163`, `:181`, `:183`, which
  therefore do not move; if the public-tree scan still reports a shifted
  acknowledgement, regenerate the baseline as task 15 does);
  `mockups/INDEX.md`'s Finding → evidence routing row gains a "revised in #464"
  note; the coverage appendix and evidence are committed; tasks ticked by the
  coordinator.
