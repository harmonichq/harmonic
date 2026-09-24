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

## Initial aggregate attempt

Final verification on `f902c28f7917af332e475086c2d643c7007b5420` passed both builds, all 877 Node tests, OpenSpec strict validation, the three repository guards, and affected eating-sequence, Findings, showcase and event fixture drift checks. The QA suite passed 81 tests and 20 subtests in 58.25 seconds. However, its slowest generated case, `test_case_c4_profile`, took 16.62 seconds, exceeding the unchanged 15-second ceiling. An isolated rerun reproduced the breach at 16.11 seconds (one test passed in 16.18 seconds). The backend and QA case source are identical to the earlier passing measurement on `73212a8e`; no timing cause is established.

The owned final-run process chain was stopped under the repository's budget rule. Full pytest was interrupted and is not a pass. Browser suites and complete ledgers had not started. No showcase, performance limit or product code was changed to suppress the breach. At that point task 3.3 was incomplete and no PR had been opened.

Other measured budgets: showcase 1,417,216 bytes (limit25MiB), showcase drift0.31s (limit30s), focused QA58.25s (limit90s). Full pytest's400s ceiling remains unverified on this final revision. The previous full attempt on73212a8e finished in343.96s with2521passed,1failed,1skipped; its public-tree failure is fixed and independently verified in the compact correction, but that earlier run is not a successful full gate.


## Runtime budget correction

The user authorized resolving the runtime blocker and finishing the PR. Profiling localized it to the existing profile follow-up mean bootstrap, which performed 4,000 unused standard-deviation calculations. Commit `a06bbfbe` adds an opt-out to the shared metric function and uses it only for mean resampling. Default published panels and variability resampling remain complete; formulas, random seeds, sample counts, clinical decisions and the approved UI are unchanged.

Three unprofiled pre-fix case runs took 12.73, 13.66 and 15.03 seconds. Post-fix runs took 10.87, 10.96 and 10.96 seconds; the independent coordinator run took 11.16 seconds. Both new regressions failed before the fix, then 31 focused tests passed. A full comparison equals the forced original computation including confidence intervals. Complete QA output matches except for its wall-clock generation timestamp. Instrumented profile totals did not improve and are not used as budget evidence.

Both review axes converged without findings. The coordinator independently passed the two new regressions and the slow QA case. Final integrated verification resumes after this correction; the earlier budget breach and interrupted full run above remain historical failures rather than being relabeled as passes.

## Final browser readiness corrections

The integrated composition suite passed 28 cases and exposed two test timing failures: its first request barrier adopted an intermediate drag window, and Pattern capture scrolled a chart host during replacement. Commit `eb7c8b9c` distinguishes completed requests while explicitly asserting the final Morning window; all held-response and stale-adoption assertions remain. Pattern capture waits for a mounted supported series that survives a render frame and matches its host dimensions. Production code is unchanged.

Both corrected cases passed twice, and independently passed once more. Both review axes converged without findings. The full backend passed 2525 tests with one expected real-database skip in 366.24s, below 400s; the QA suite passed 81 tests and 20 subtests in 50.92s, slowest case 11.70s. Remaining browser gates and ledgers are resuming after this correction.

## Completed aggregate acceptance

All required affected gates now pass. Production source is unchanged after reviewed `93326f5`; subsequent changes only record completion. Backend and budget checks ran on `81603b9`, with the later delta confined to the browser test's readiness correction. The build and 877-test Node gate ran on `f902c28`; their frontend/configuration inputs are unchanged. No successful full backend or ledger was repeated for documentation-only changes.

| Verification | Result | Raw output |
| --- | --- | --- |
| Full backend |2525 passed, 1 expected skip (no real database) |[Output](verification/pytest.txt) |
| Full Node |877 passed, 0 skipped |[Output](verification/node.txt) |
| Composition browser suite |30 passed |[Output](verification/composition.txt) |
| Workstation browser suite |67 passed |[Output](verification/workstation.txt) |
| v2 desk browser suite |24 passed |[Output](verification/v2-desk.txt) |
| Workstation ledger |168/168 stories passed |[Output](verification/finding-ledger.txt) |
| Event ledger |14/14 stories passed |[Output](verification/event-ledger.txt) |
| Event support audit |Passed |[Output](verification/event-support.txt) |
| v2 ledger,1280×720 |130 selected, 0 failed, 0 deferred |Four shard outputs below |
| v2 ledger,1440×900 |130 selected, 0 failed, 0 deferred |Four shard outputs below |

The frozen v2 inventory has 112 active and 18 retired stories at each size. All 130 registry entries were selected, preserving their retirement declarations. Each shard used fresh synthetic case stores. The final 1440×900 shard initially had four timeouts (S95, R2, R11 and R17). Its complete 33-case rerun passed on port 18410 using a temporary loopback-port override, preserved in [this patch](verification/local-port-override.patch). The override changed only the test transport and was reverted after the run; product source and story assertions stayed identical. The [original failed run](verification/v2-1440x900-4-of-4-original-failure.txt) remains available. Another task occupied the default port during investigation; contention was plausible but not established as the cause. All data and committed captures remain synthetic; no private preview data entered these artifacts.

1280x720: [Shard 1](verification/v2-1280x720-1-of-4-stories.txt), [Shard 2](verification/v2-1280x720-2-of-4-stories.txt), [Shard 3](verification/v2-1280x720-3-of-4-stories.txt), [Shard 4](verification/v2-1280x720-4-of-4-stories.txt).

1440x900: [Shard 1](verification/v2-1440x900-1-of-4-stories.txt), [Shard 2](verification/v2-1440x900-2-of-4-stories.txt), [Shard 3](verification/v2-1440x900-3-of-4-stories.txt), [Shard 4](verification/v2-1440x900-4-of-4-stories.txt).

All five fixed budgets pass: showcase 1,417,216 bytes ≤25MiB; showcase drift 0.22s ≤30s; focused QA 50.92s ≤90s; slowest generated case 11.7s ≤15s; full backend 366.24s ≤400s. No limit or QA expectation was raised.

OpenSpec strict validation, ADR numbering, owned identifiers, public allowlist, and affected generated fixture drift checks passed. [Command, commit and timing records](verification/results.json) identify each exact run. Both review axes converged for the feature, compact UI, performance correction and browser readiness corrections; no implementation findings remain. Earlier failures above remain historical evidence with explicit corrective dispositions.

## CI correction and integration with main (2026-09-12)

CI run 34678453729 exposed four issues missed by the earlier local selection: the public contamination scan counted two extra literal synthetic dates; the v2 exploration retained old code fingerprints after the performance change; the failure scenario armed before the roster's miniature read settled; and a v2 check accessed a miniature before ECharts mounted it. The date test now reads the generated fixture's source window, the exploration is regenerated, and the browser assertions wait for observable chart readiness without relaxing error types, retry counts or chart behavior.

The operator then requested integration with current main, `eb917737` (#411). Conflict resolutions preserve both filtered Pattern populations and High-carb sequence observations, both selected event markers and singleton marks, both compact occurrence rows and the shorter High-carb header, and both browser coverage additions. Generated files were rebuilt from the combined producers rather than resolving their contents by hand.

The combined tests exposed three integration corrections: the drawn-window label now omits the retired “Window” prefix; the scoped story uses its canonical finding id after main removed its former source-row variable; and changing scope now preserves the open inspector's chart when that chart remains available. Before that last correction the Overnight inspector showed High-carb sequence while the focal chart showed its parent Pattern. The unchanged scoped browser case failed before the fix and passed after it.

Final local checks: 907 frontend tests; 246 affected backend tests plus 46 subtests; 30 composition browser tests; 40 v2 desk browser tests; five affected navigation cases; all fourteen Python generator drift checks; event-comparison drift; public tree/link/contamination guards; and strict OpenSpec validation. Raw results are in [ci-merge](verification/ci-merge/). The previous full backend and ledger outputs remain historical; these combined-branch checks do not relabel those earlier commits as the merged head. GitHub CI will rerun against the pushed merge.
