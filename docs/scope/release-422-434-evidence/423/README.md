# #423 synthetic evidence

Every capture and log here comes from committed manufactured QA recipes served by
the offline no-fetch app. No personal database, operator screenshot or real-data
payload is included. The release coordinator runs every browser leg serially; the
ticket worker binds no port.

Stores: `pattern-near-tie` (Day 2024-05-25, whose Episode Log shows episode
`2024-05-25-ep13`: a fired 19:00 meal, a clean correction and the 22:00 low at
54.25 mg/dL, outranked with correction on active insulin matched) and
`behavioral-meal-over-delivery` (its Meal over-delivery case file serves
`outranked=1`). Every anchor of `2024-05-25-ep13` is stamped 2024-05-24, before
that Day's axis, so no ring or hairline capture is taken, and pressed-row
captures are cropped to the reading pane.

## Requirement map

| Requirement (surfaces spec, ADDED) | Story | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| The Episode Log words an outranked anchor as claimed, and Diagnose shares the word | S121 | `frontend/day.test.js` "#423 · a claimed low reads claimed…"; `frontend/day-chart.test.js` "#423 · the anchor-state words…"; `frontend/diagnose-workstation.test.js` "#423 · Diagnose words an outranked occurrence…" | results below (raw log owed) | `*-claimed-row-*.png`, `*-diagnose-claimed-*.png` (owed) |
| A claimed row names what the anchor matched and ends with the Finding that claimed it | S121 | `tests/test_scenario_model_view.py` `VerdictTitleTest`; `frontend/day.test.js` "#423 · a claimed low…", "#423 · a claimed row does not repeat…"; `frontend/day-chart.test.js` "#423 · buildRows carries…" | results below (raw log owed) | `*-claimed-row-*.png` (owed) |
| A claimed anchor keeps its Finding's hue and size | S121 (tier colour; marker option readback) | `frontend/day-chart.test.js` "#423 · a claimed anchor takes the fired hue…", "…resting marker…", "…hairline…"; `frontend/day.test.js` "#423 · a claimed tier word paints…" | results below (raw log owed) | `*-claimed-row-*.png`, rest and pressed (owed); no ring or hairline capture |
| The Findings band counts Findings, not rows | S121 | `frontend/day-chart.test.js` "#423 · the ledger counts…", "…two episodes of one Lever…", "…a sequence Finding…"; `frontend/day.test.js` "#423 · the Findings caption counts Findings…" | results below (raw log owed) | `*-claimed-row-*.png` (owed) |
| The Episode Log bands are explained where a reader looks | S122 | `frontend/day.test.js` "#423 · each band caption carries a Glossary control…", "#423 · the Glossary explains the Episode Log bands"; `frontend/utilities.test.js` "#423 · the Glossary keys each group section…" | results below (raw log owed) | `*-glossary-*.png` (owed) |
| The Episode Log revision ships with its ledger stories and evidence | S121, S122 | `frontend/c4.replay.test.js` S121/S122 fake-page tests | results below (raw log owed) | this folder |

## Recorded results

Coordinator-run, 2026-09-23, each with the branch harness:

- **S121 and S122 on branch `0cd74cd5`:** pass at 1280x720 and 1440x900.
- **S121 on the ticket's base `e229bef3`** (the release trunk after #426): fails
  at its feature assertion at both sizes, naming six items:
  - its tier reads "outranked", not "claimed";
  - the model read serves no title on the low's matched correction_on_iob
    verdict;
  - its tier word paints rgb(201, 138, 78), not the fired tier's
    rgb(134, 173, 120) (the warning ink);
  - the Findings caption reads "Findings · 2", not "Findings · 1 · 1 claimed";
  - its resting marker is 8, not the fired marker's 10;
  - its resting ring is #c98a4e, not the fired ring's #e07f3f.
- **S122 on base `a4d374a7`:** fails at both sizes at its feature assertion, "the
  Findings caption must carry a Glossary button named for its band" (actual
  null). No such button exists before #423, so the base commit does not change
  this check.
- **The full `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`:** OK on
  `0cd74cd5`.
- **S67, S68, S73c and S82 on `f0c529c5`:** 4 of 4 at both sizes; the desk
  browser suite 41 of 41.

## Still owed

- Before and after synthetic renders at both sizes, taken in the release-wide
  render pass at integration: the `pattern-near-tie` Day 2024-05-25 Episode Log
  (the claimed row at rest and pressed, cropped to the reading pane; its tier
  word; the Findings caption), the Glossary opened from a caption, and the
  `behavioral-meal-over-delivery` Meal over-delivery case file footer.
- The raw replay logs, if the coordinator commits them here.

When they land, they are committed here and the map's owed entries name the
files.
