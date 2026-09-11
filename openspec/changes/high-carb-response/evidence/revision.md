# High-carb response revision evidence

The High-carb sequence finding uses observed glucose responses for the highest-carb fifth and other eligible sequences. The existing sequence evaluation owns the comparison population and period; the shared response renderer owns the chart and readout. The full aggregate comparison remains in supporting detail. Connor’s 2026-09-11 rendered-title correction is recorded in the design and spec delta.

## Synthetic capture provenance

All images in `rendered/` are unmodified browser captures of manufactured input from `scripts/gen_eating_sequence_fixtures.py`. The base is `e582355532af9c4e422bf5121af8aae6b66af434`; the capture checkout is `647feb2197efa53f4eccfd1f0aa3169ff135b469`, whose product, test and fixture source exactly matches reviewed ticket `d6192126f8f2aa9e80c21e94d25b21aac3b203b6`. Opening and inspector captures were subsequently refreshed on `c0b3c942223a67b14cfa0bb7601f5f4644716f10` for the compact correction described below. The refreshed v2 opening view includes its pointer readout. Both shells were built before revision capture. No live vendor fetch or personal data was used. PNG dimensions and the browser viewport agree for every listed image.

The before/after opening views use `high_carb_sequence_empty`, the same eligible population and the same viewport. Baseline S155 captures preserve the prior aggregate chart; revision captures show the response chart. The browser flow may leave a different scroll position after fullscreen return.

| Viewport | Before | Revised v1 | Revised v2 |
| --- | --- | --- | --- |
| 1280 × 720 | [Before](rendered/before-1280x720.png) | [After](rendered/after-v1-1280x720.png) | [After](rendered/after-v2-1280x720.png) |
| 1440 × 900 | [Before](rendered/before-1440x900.png) | [After](rendered/after-v1-1440x900.png) | [After](rendered/after-v2-1440x900.png) |
| 390 × 844 | [Before](rendered/before-390x844.png) | [After](rendered/after-v1-390x844.png) | [After](rendered/after-v2-390x844.png) |

Additional inspected views: [mobile readout](rendered/readout-mobile.png), [mobile singleton cohorts](rendered/singleton-mobile.png), [All charts](rendered/all-charts.png), [Findings miniature](rendered/findings-mini.png), [different eating durations and limited point support](rendered/during-eating-limited.png), and [mobile fullscreen](rendered/fullscreen-mobile.png).

## Focused verification

Before the compact-inspector correction, the reviewed product source passed 10 v1 and 11 v2 browser checks at each of 1280 × 720, 1440 × 900 and 390 × 844, with no failures or skips. They cover source-matched cohort and selected traces, clean/reference and second fired selections, clock scope, singleton and limited observations, gaps, typed errors and stale recovery, fullscreen return and keyboard readout. Commit `b0bf21ee7c631f12b81df94b9e5cefd503d5f3ff` adds direct pointer proof without changing product source: v1 S155 and the v2 scoped-selection/fullscreen test each passed independently at 1280 × 720. Real mouse movement to minute 330 changed both stage and fullscreen readouts to +5 h 30 min, 270 mg/dL (n=8) and 110 mg/dL (n=32). S153, S155, S157 and S158 retain their existing sequence semantics and Repeat eating branches.

The final commands use `PLAYWRIGHT_MODULE` from the repository browser-cache helper, `VIEWPORT` for each size, and a fresh `DIAGNOSE_EVIDENCE_DIR`. Browser commands run serially with host permissions:

```sh
PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test --test-name-pattern='eating-sequence composition S15[3578]|High-carb response|High-carb same Pattern' frontend/diagnose-canvas-composition.browser.test.mjs
node --test --test-name-pattern='High-carb' frontend-v2/desk.browser.test.mjs
```

A paired Pattern reference check at all three sizes and all three ranks preserved time-label geometry, chart dimensions and series. Its stage and All charts shared glucose range expands to contain the new High-carb cohort values; fullscreen is identical to the baseline. The pre-existing narrow Pattern anchor overlap remains.

Independent coordinator checks on the committed revision passed 171 backend/fixture tests plus 25 subtests, and 106 frontend tests with no skips. Generator drift passed for both eating-sequence artifacts. The complete fixture retains all 514 roster selections across 23 sequence cases, including 371 clean/reference selections, and all 17 manufactured states. Python and browser expansion equal the public producer output; compaction changes no served values.

## Whole-branch corrections

Review of the integrated branch found a selected singleton with no painted marker and a prohibited internal scope label in the new legend. Revision `70045d7` adds the selected observation marker in the shared renderer and plain-language scope labels. The full screenshot matrix was refreshed on unchanged reviewed source. All 105 captured PNGs match their actual viewport dimensions. The retained selected-singleton visual proof uses the [1280 × 720 stage](rendered/selected-singleton-stage.png) and [390 × 844 fullscreen](rendered/selected-singleton-fullscreen.png); the mobile stage marker is covered by its painted-mark assertion, since that stage screenshot framed the scrolled inspector.

The Findings fixture generator is a second caller of the shared compactor. Its capture was regenerated and its existing JavaScript mirror updated for the backend-owned short headlines. All 18 sequence QA cases across seven windows compare against the producer output. Independent focused frontend verification passed 166 tests with no skips; the Findings generator drift check passed. Commit `647feb21` corrects the reproduced test-readiness race by waiting for the mounted chart and required options. Both focused v2 tests then passed independently, preserving the selected singleton’s painted-mark assertion.

Both whole-branch review axes converged with zero remaining implementation findings.

## Compact inspector correction

Connor rejected the verbose supporting paragraph and requested Opus 5 high-effort critique. The correction shows two selected-period cohort rows with rounded time in range and actual counts. “All three periods” starts collapsed, preserves its state during selection, and retains every period's TIR, glucose SD, units, counts, unavailable values and complete server summary. Fully unavailable periods say “Not enough data” once; independently available metrics remain readable. The chart still labels its distinct source population.

Expanded rows fit on one line in the 405px desktop inspector (the longest ordinary row measures about 288px); the 365px mobile content wraps. Literal browser expectations pin synthetic values independently of the formatter. Nine private capture tests moved byte-for-byte into a separately excluded module, retaining both public fixture tests and fixing the public-tree reference failure.

Both review axes converged without actionable findings on `c0b3c942`. Opus's initial critique used repo screenshots; its follow-up could inspect code but could not access scratch screenshots. The coordinator and final Astra reviewers inspected those renders directly.

The correction passed 22 Node tests, 13 Python checks and 10 browser checks at 390 × 844 and 1440 × 900. Its follow-up passed 22 Node and 10 browser checks. Independent coordinator checks passed 22 Node and 12 Python tests, then two v1 stories and three v2 cases at 1280 × 720. No failures or skips occurred in these completed checks. All three required sizes cover the amended inspector, alongside retained selection, scope, singleton, fullscreen and unavailable assertions.

| Viewport | Default v1 | Expanded v1 | Default v2 | Expanded v2 |
| --- | --- | --- | --- | --- |
| 1280x720 | [Default](rendered/inspector-v1-closed-1280x720.png) | [Expanded](rendered/inspector-v1-open-1280x720.png) | [Default](rendered/inspector-v2-closed-1280x720.png) | [Expanded](rendered/inspector-v2-open-1280x720.png) |
| 1440x900 | [Default](rendered/inspector-v1-closed-1440x900.png) | [Expanded](rendered/inspector-v1-open-1440x900.png) | [Default](rendered/inspector-v2-closed-1440x900.png) | [Expanded](rendered/inspector-v2-open-1440x900.png) |
| 390x844 | [Default](rendered/inspector-v1-closed-390x844.png) | [Expanded](rendered/inspector-v1-open-390x844.png) | [Default](rendered/inspector-v2-closed-390x844.png) | [Expanded](rendered/inspector-v2-open-390x844.png) |

Focused commands use the declared VIEWPORT, cached PLAYWRIGHT_MODULE and synthetic fixtures:

```sh
node --test frontend/diagnose-eating-sequences.test.js frontend/diagnose-behavior-ledger-parity.test.js
uv run python -m pytest -q tests/test_check_public_links.py::TestRealPublicTree::test_the_materialised_public_tree_has_no_dead_references tests/test_eating_sequence_fixture.py tests/test_eating_sequence_finding_fixture.py
PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test --test-name-pattern='eating-sequence composition S15[58]' frontend/diagnose-canvas-composition.browser.test.mjs
node --test --test-name-pattern='v2 Diagnose renders the generated High-carb|v2 High-carb scoped population|v2 High-carb rendered null_period' frontend-v2/desk.browser.test.mjs
```

## Aggregate acceptance

Final verification on `f902c28f7917af332e475086c2d643c7007b5420` passed both builds, all 877 Node tests, OpenSpec strict validation, the three repository guards, and affected eating-sequence, Findings, showcase and event fixture drift checks. The QA suite passed 81 tests and 20 subtests in 58.25 seconds. However, its slowest generated case, `test_case_c4_profile`, took 16.62 seconds, exceeding the unchanged 15-second ceiling. An isolated rerun reproduced the breach at 16.11 seconds (one test passed in 16.18 seconds). The backend and QA case source are identical to the earlier passing measurement on `73212a8e`; no timing cause is established.

The owned final-run process chain was stopped under the repository's budget rule. Full pytest was interrupted and is not a pass. Browser suites and complete ledgers had not started. No showcase, performance limit or product code was changed to suppress the breach. Task 3.3 remains incomplete; no PR was opened.

Other measured budgets: showcase 1,417,216 bytes (limit25MiB), showcase drift0.31s (limit30s), focused QA58.25s (limit90s). Full pytest's400s ceiling remains unverified on this final revision. The previous full attempt on73212a8e finished in343.96s with2521passed,1failed,1skipped; its public-tree failure is fixed and independently verified in the compact correction, but that earlier run is not a successful full gate.


## Runtime budget correction

The user authorized resolving the runtime blocker and finishing the PR. Profiling localized it to the existing profile follow-up mean bootstrap, which performed 4,000 unused standard-deviation calculations. Commit `a06bbfbe` adds an opt-out to the shared metric function and uses it only for mean resampling. Default published panels and variability resampling remain complete; formulas, random seeds, sample counts, clinical decisions and the approved UI are unchanged.

Three unprofiled pre-fix case runs took 12.73, 13.66 and 15.03 seconds. Post-fix runs took 10.87, 10.96 and 10.96 seconds; the independent coordinator run took 11.16 seconds. Both new regressions failed before the fix, then 31 focused tests passed. A full comparison equals the forced original computation including confidence intervals. Complete QA output matches except for its wall-clock generation timestamp. Instrumented profile totals did not improve and are not used as budget evidence.

Both review axes converged without findings. The coordinator independently passed the two new regressions and the slow QA case. Final integrated verification resumes after this correction; the earlier budget breach and interrupted full run above remain historical failures rather than being relabeled as passes.

## Final browser readiness corrections

The integrated composition suite passed28cases and exposed two test timing failures: its first request barrier adopted an intermediate drag window, and Pattern capture scrolled a chart host during replacement. Commit `eb7c8b9c` distinguishes completed requests while explicitly asserting the final Morning window; all held-response and stale-adoption assertions remain. Pattern capture waits for a mounted supported series that survives a render frame and matches its host dimensions. Production code is unchanged.

Both corrected cases passed twice, and independently passed once more. Both review axes converged without findings. The full backend passed2525tests with one expected real-database skip in366.24s, below400s; the QA suite passed81tests and20subtests in50.92s, slowestcase11.70s. Remaining browser gates and ledgers are resuming after this correction.
