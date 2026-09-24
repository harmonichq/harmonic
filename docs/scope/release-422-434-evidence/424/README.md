# #424 revision evidence

Rendered proof for #424's case-file counts revision, from the coordinator's
replay runs on 2026-09-23. Everything here is synthetic: each capture is the desk
served by the replay's own case server through AGENTS.md's copy-then-serve route
(`--no-fetch --token ''`) on a manufactured `scripts/qa_e2e_cases.py` case store.

## Terms

- **Branch** is `424-highs-after-meals-counts` at 5b7a4bc6.
- **Base** is origin/main a4d374a7, served with the branch's replay harness
  (`frontend/c4.replay.mjs`, `frontend/desk-behavior.replay.mjs`,
  `frontend/replay-cases.mjs`) laid over it.
- **Captures** are the replay's story-endpoint captures (`CAPTURE_DIR` /
  `CAPTURE_ONLY=S124,S125,S126`), taken on the branch after each story passed.
  Each is named `app-<story>-<size>` and comes in four forms: `.png` (the render),
  `.html` (a one-image page), `.txt` (the page's visible text) and `.json` (the
  capture record: case store, checkpoint and rendered element facts).

## Captures

| Story | Case store | State shown | Files |
|-------|------------|-------------|-------|
| S124 | `behavioral-carb-undercount` | Highs after meals, event case file: the Response comparison caption "3 Matched (meets criteria) · 1 Nearly matched (borderline) · 2 Other meal opportunities" above its three cohort headings, with the band foot's "1 not comparable" | `app-S124-1280x720.*`, `app-S124-1440x900.*` |
| S125 | `behavioral-missed-meal` | Missed / unannounced meal, event case file: "2 Matched · 1 Nearly matched (borderline) · 2 Completed carb-bolus meals · 3 highs outside the comparison", with the band foot's "1 claimed by another factor · 1 not comparable" | `app-S125-1280x720.*`, `app-S125-1440x900.*` |
| S126 | `behavioral-correction-stacking` | The open Lows after correcting highs fold: Correction stacking's "2 of 2 lows" on the line's first row beside its name, and "outside the count · 2 of 8 correction clusters" muted on its second row | `app-S126-1280x720.*`, `app-S126-1440x900.*` |

The coordinator judged the fold's second-row layout from `app-S126-1280x720.png`
and accepted it: the name and the share keep the first row, and the counts
outside the Pattern's count sit muted beneath them.

## Replay results

| Run | Stories | Result, at 1280x720 and at 1440x900 |
|-----|---------|-------------------------------------|
| Branch 5b7a4bc6 | S115, S124, S125, S126 | all PASS: 4 executed, 0 failed |
| Base a4d374a7 with the branch harness | S115, S124, S125, S126 | all FAIL at their served-data checks: S115 and S126 "every folded cause must serve its fold sentences"; S124 and S125 "the case file must serve its count outside the comparison and each cohort's band state" |

Also coordinator-run on 5b7a4bc6: the whole desk browser suite (40 of 40) and
`mockups/sweep/harmonic-v2-desktop/acceptance.test.py` (OK). The complete ledger
replay at both sizes and the case-cache check run once, on the integration branch.
