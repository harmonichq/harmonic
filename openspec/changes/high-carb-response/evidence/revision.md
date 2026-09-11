# High-carb response revision evidence

The High-carb sequence finding uses observed glucose responses for the highest-carb fifth and other eligible sequences. The existing sequence evaluation owns the comparison population and period; the shared response renderer owns the chart and readout. The full aggregate comparison remains in supporting detail. Connor’s 2026-09-11 rendered-title correction is recorded in the design and spec delta.

## Synthetic capture provenance

All images in `rendered/` are unmodified browser captures of manufactured input from `scripts/gen_eating_sequence_fixtures.py`. The base is `e582355532af9c4e422bf5121af8aae6b66af434`; the revision is `096c5d20460e39f2964acdd01c9e2cb5692a01ab`. Both shells were built before revision capture. No live vendor fetch or personal data was used. PNG dimensions and the browser viewport agree for every listed image.

The before/after opening views use `high_carb_sequence_empty`, the same eligible population and the same viewport. Baseline S155 captures preserve the prior aggregate chart; revision captures show the response chart. The browser flow may leave a different scroll position after fullscreen return.

| Viewport | Before | Revised v1 | Revised v2 |
| --- | --- | --- | --- |
| 1280 × 720 | [Before](rendered/before-1280x720.png) | [After](rendered/after-v1-1280x720.png) | [After](rendered/after-v2-1280x720.png) |
| 1440 × 900 | [Before](rendered/before-1440x900.png) | [After](rendered/after-v1-1440x900.png) | [After](rendered/after-v2-1440x900.png) |
| 390 × 844 | [Before](rendered/before-390x844.png) | [After](rendered/after-v1-390x844.png) | [After](rendered/after-v2-390x844.png) |

Additional inspected views: [mobile readout](rendered/readout-mobile.png), [mobile singleton cohorts](rendered/singleton-mobile.png), [All charts](rendered/all-charts.png), [Findings miniature](rendered/findings-mini.png), [different eating durations and limited point support](rendered/during-eating-limited.png), and [mobile fullscreen](rendered/fullscreen-mobile.png).

## Focused verification

The final revision passed 10 v1 and 11 v2 browser checks at each of 1280 × 720, 1440 × 900 and 390 × 844, with no failures or skips. They cover source-matched cohort and selected traces, clean/reference and second fired selections, clock scope, singleton and limited observations, gaps, typed errors and stale recovery, fullscreen return and keyboard readout. Commit `b0bf21ee7c631f12b81df94b9e5cefd503d5f3ff` adds direct pointer proof without changing product source: v1 S155 and the v2 scoped-selection/fullscreen test each passed independently at 1280 × 720. Real mouse movement to minute 330 changed both stage and fullscreen readouts to +5 h 30 min, 270 mg/dL (n=8) and 110 mg/dL (n=32). S153, S155, S157 and S158 retain their existing sequence semantics and Repeat eating branches.

The final commands use `PLAYWRIGHT_MODULE` from the repository browser-cache helper, `VIEWPORT` for each size, and a fresh `DIAGNOSE_EVIDENCE_DIR`. Browser commands run serially with host permissions:

```sh
PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test --test-name-pattern='eating-sequence composition S15[3578]|High-carb response|High-carb same Pattern' frontend/diagnose-canvas-composition.browser.test.mjs
node --test --test-name-pattern='High-carb' frontend-v2/desk.browser.test.mjs
```

A paired Pattern reference check at all three sizes and all three ranks preserved time-label geometry, chart dimensions and series. Its stage and All charts shared glucose range expands to contain the new High-carb cohort values; fullscreen is identical to the baseline. The pre-existing narrow Pattern anchor overlap remains.

Independent coordinator checks on the committed revision passed 171 backend/fixture tests plus 25 subtests, and 106 frontend tests with no skips. Generator drift passed for both eating-sequence artifacts. The complete fixture retains all 514 roster selections across 23 sequence cases, including 371 clean/reference selections, and all 17 manufactured states. Python and browser expansion equal the public producer output; compaction changes no served values.

## Aggregate acceptance

Full repository gates and the complete affected ledgers remain pending. Their final results will be recorded here after the integrated branch is tested. Focused results above do not claim aggregate completion.
