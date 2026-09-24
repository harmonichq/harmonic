# #413 desk design evidence

This folder is the rendered proof for #413: the raw replay logs, the
before-and-after captures at both supported desktop sizes, and the design
critique with each finding's disposition.

**Supersession.** This map supersedes the completion claim of #404's task 3.3
(`openspec/changes/archive/2026-09-24-v2-findings-ledger/tasks.md`) for three things:
parent-owned Pattern members, the basal legend and verdict paint, and skeleton
loading. That record is left as written. #413's audit and this change are the
correction.

## Terms

- **Base** is origin/main eec4652a8f1109aa62d126ce3a0b4f24973194b0. It was
  served from its own worktree with the branch's replay harness and case
  recipes laid over it.
- **Branch** is `413-finish-missed-404-design-c4`.
- **Replays** are the desk ledger's app-opener stories, run by the coordinator
  outside the sandbox. They used the AGENTS.md copy-then-serve route through
  the replay's own case server on the showcase or a named
  `scripts/qa_e2e_cases.py` case.
- **Captures** are synthetic only, named `<scene>-<before|after>-<size>.png`.
  - "Before" is the base.
  - "After" is the branch at 165b83fc, re-shot after the round-2 critique
    fixes; the two `loading-after-*` captures were re-shot again at 91e2efd2,
    after the skeleton containment fix. Every other after-capture re-shot at
    91e2efd2 came out byte-identical.
  - Every scene exists at 1280x720 and 1440x900 unless marked "after only".

## Raw logs

| Log | Checkout | Result |
|-----|----------|--------|
| `fail-first-base-1280x720.log` | base, with the 165b83fc harness | S113–S117 all FAIL at their feature assertions: 0 executed, 5 failed of 5 selected |
| `fail-first-base-1440x900.log` | base, with the 165b83fc harness | the same at 1440x900 |
| `pass-branch-1280x720.log` | branch 91e2efd2 | S113–S117 all PASS: 5 executed, 0 failed |
| `pass-branch-1440x900.log` | branch 91e2efd2 | the same at 1440x900 |

**S116's history.** The earlier c7fdad07 runs failed on base and branch alike
with "at least one ranked mini must be mounted".
- That was a defect in the story, not in the app. It looked for the ECharts
  instance on the canvas's parent div rather than on the `.mini` host, and it
  read texts off the graphic list rather than its one normalised group.
- 45e6aecc fixed the lookup. Its node test runs the story's own in-page
  function against that DOM shape, and fails on the old lookup with the
  browser's message.
- In the logs above, the base fails on "finding:over_treated_low's mini must
  draw from its served count sentence": the base mini draws
  `['EVENT · RESPONSE']`. The branch passes.

## Requirement map

Each #413 requirement comes from `openspec/changes/desk-design-completion/specs/`.

| # | Requirement | Story | Base log (fails at) | Branch log | Captures, before → after, both sizes |
|---|-------------|-------|---------------------|------------|--------------------------------------|
| B1 | **Behavioral layer: the findings projection serves each count-bearing row's count sentences** | backend tests, no browser story | n/a | `tests/test_findings_projection.py`: `test_every_pattern_key_has_exactly_one_outcome_entry`, `test_the_two_meals_patterns_serve_different_outcomes`, `test_the_outcome_table_covers_the_code_derived_cross_product_exactly`, `test_headline_is_computed_independently_of_count_sentences`. 113 tests OK locally (15 skipped); `gen_findings_projection_fixtures.py --check`, `gen_eating_sequence_fixtures.py --check` and the exploration `generate.py --check` all report current. The fixture-only mirror's comparison is `frontend/findings-projection-mirror.test.js`, inside the node fast gate | the rows' printed sentences in `rail-arrival`, `urgency-one-tier`, `mini-*` |
| S1 | **A Pattern owns its causes in the rail** | S115 | "finding:meal_bolus_short must never be a sibling rail row" | PASS | `rail-fold-opened-{before,after}-*` (before: the cause as a sibling row; after: the fold opened, one line on the spine); `rail-fold-opened-item-after-*` (crop, after only); `rail-first-pattern-open-after-*` (first ranked Pattern open on arrival, after only; the base shows the cause as a sibling row in `urgency-one-tier-before-*`); `rail-arrival-{before,after}-*` (later Patterns closed) |
| S2 | **The rail shows served urgency** | S115 (urgency block) | the same S115 run; the story's first assertion fails before it | PASS | `urgency-one-tier-{before,after}-*` (case `behavioral-correction-on-iob`: two ranked rows, both tier `worth_a_look`, stripe and primary caption after); `rail-arrival-{before,after}-*` |
| S3 | **Every ranked rail row draws one mini instrument** | S116 | "finding:over_treated_low's mini must draw from its served count sentence" (the base draws `EVENT · RESPONSE`) | PASS | `mini-pattern-{before,after}-*` (case `behavioral-correction-on-iob`, `pattern:lows_after_correcting_highs`); `mini-cause-event-{before,after}-*` (showcase, `finding:over_treated_low`). The High-carb-sequence Cause mini cannot be captured (see "High-carb mini" below). |
| S4 | **Rail rows print the served count sentence** | S115 (member and Pattern sentence blocks) | the same S115 run | PASS | `rail-arrival-*`, `urgency-one-tier-*` and `rail-fold-opened-item-after-*`, with counts at weight 600 |
| S5 | **The basal lane names and paints every verdict** | S113 | "the key must render as the lane's head row, above the cells" | PASS | `lane-{before,after}-*` and `lane-detail-{before,after}-*` (case `basal-verdict-gallery`: raise staged, lower selected, hold, insufficient, no data) |
| S6 | **Diagnose opens on the 24 h window** | S117 | pressed window "Overnight", not "24 h" | PASS | `rail-arrival-{before,after}-*` (before: Overnight; after: 24 h, unscoped, "6 findings · 30 days") |
| S7 | **A cold destination shows a count-free skeleton** | S114 | "the cold loading frame must carry one stage skeleton block": 0 | PASS | `loading-{before,after}-*` (`/api/analyze` held) |

**Inherited stories.** At c7fdad07, before the round-2 fixes, at 1280x720, these 18 executed
with 0 failures: S19, S20, S20b, S31–S35, S36, S37b, S102–S104, S106–S109 and
S112. The full `frontend/desk.browser.test.mjs` passed 40 of 40.

**Whole verification.** The complete ledger at both sizes and the three browser
suites run once, on the commit to be pushed (task 4.5). They are not recorded
here yet.

## Rulings recorded here

These are coordinator rulings, grounded in the pinned spec, 2026-09-22.

- **Cause mini palette (critique 5): the rail cohort palette wins.**
  - The requirement says every ranked row's mini is "the same instrument" in
    "the rail's cohort palette". Stage parity is not a requirement.
  - Cost: a Cause mini no longer uses the By-event stage's `--ec-*` cohort
    colours (matched in-range green, comparison accent).
- **Selected lane outline (critique 7): primary.** The requirement reads "A
  selected cell SHALL keep the primary outline". S113 proves the selection, the
  stage and the lower fill stay three marks: an outline, a 2 px underline and a
  fill.
- **Setting-row mini (critique 11): unchanged.**
  - The requirement's "mini instrument" is the cohort-response mini that
    Pattern and Cause rows draw.
  - Its furniture has no meaning for a Setting row's departures from the
    programmed rate: a cohort label and count, TYPICAL and a denominator, a
    named anchor, a dashed band.
  - The spec is not edited.
- **Heading focus ring (critique 14): unchanged.** The base carries it, and
  this change does not own heading focus.
- **Unpriced rows print their count sentence (critique 4).**
  - This overrides the earlier rail ruling that tail rows are "title-only"
    (`frontend/diagnose-workstation.css`'s tail note).
  - It is grounded in **Rail rows print the served count sentence**: "Every
    count-bearing rail row in the rail SHALL print each of the projection's
    served count sentences".
  - The served synthetic projection carries unpriced rows with sentences. One
    is `finding:correction_stacking` in the afternoon window: "1 of 1
    correction clusters went low".
  - In the showcase, the unranked Causes serve sentences and print them. The
    unranked Patterns serve none (`admission_route` `none`, `count_sentences`
    `[]`), so they print none. See critique 4.
  - The node test "#413 · an unpriced row prints its served count sentence
    under its title" proves the render through `renderFindingsQueue`.
  - A tail row still carries no tag, summary or mini.
- **The anchor word (critique 6) is a served value.** Every event-aligned case
  file already serves `projection.anchor.label`, for example "Completed carb
  bolus", "Low excursion" or "End of eating sequence". The mini prints it in
  capitals, the desk's MEAL/LOW table is gone, and no backend change was
  needed.

## High-carb mini

The High-carb-sequence Cause mini cannot be captured from any synthetic store
this repository serves.
- In every one of them (the QA showcase, the `scripts/qa_e2e_cases.py` cases
  and every eating-sequence fixture state), `finding:high_carb_sequence` is
  claimed by `pattern:highs_after_meals`.
- A claimed cause carries no mini, by the ruling "No member minis in the rail;
  the parent's mini stands for the group."
- The coordinator traced the only unclaimed route: a store with no carb-ratio
  blocks. A real pump profile always has carb-ratio blocks.
- The builder-level proof is the node test "#413 · the High-carb-sequence mini
  draws the same instrument, never the comparison token" in
  `frontend/diagnose-evidence-charts.test.js`. It drives the registry entry
  against the generated case file with a served count sentence.

## Critique

**Round 1.** Opus, high effort, working cold, on the round-1 after-captures.
- It worked against Connor's mockup: claude.ai artifact
  `4cfa1bf6-c45f-4b51-8862-fd43b58560f1`. The artifact service returned its
  live version, `1789377229-45b9`. The read did not show a version number, so
  this record does not claim "version 2".
- It also worked against the surfaces spec and `DESIGN.md`.
- It could not zoom into the captures, so where a capture was too small it read
  the rendering source and said so.

**Round 2.** Opus verified the c7fdad07 captures item by item and reported the
regressions its fixes introduced. The round-2 fixes are in 92ca1414.

**Task 4.3 closes here.** The coordinator re-shot every after-scene on 165b83fc
at both sizes. I read the re-shot captures myself, and each round-2 fix below is
visible in them.

The re-shoot also showed one new flaw, now **fixed** (coordinator ruling,
2026-09-22):
- At 1280x720 the stage skeleton's strip well ran below the loading card's own
  ground (`loading-after-1280x720.png` at 165b83fc: the card's field ended near
  y≈470, the strip near y≈625).
- Theory: the loading stage inherited the stage's five-row grid, whose fixed
  204 px figure row sized the card's track below its content.
- The fix gives the loading stage its own block-flow variant
  (`gf-stage-loading`), so the card grows to hold every mark and a short pane
  scrolls rather than spills. No count, text or status changed.
- S114 now also asserts that the loading card contains every stage mark. Its
  node test fails when a mark runs past the card.
- **Proofs:** the coordinator's re-shoot of `loading-after` and rerun of S114,
  both at 1280x720 and 1440x900, on the fix commit.

| # | Sev | Finding | Disposition | Evidence |
|---|-----|---------|-------------|----------|
| 1 | blocker | Lane cells were clipped: an 11 px track inside a 36 px shell button floor hid the outline and underline. | **Fixed** (c7fdad07). The cell sets `min-height: 0`. Round 2: resolved. Its caveat (paint can't be read at capture scale) is what S113's computed paint and track checks cover. | `lane-detail-after-*`; S113 |
| 2 | blocker | The cold skeleton had no rail rows. | **Fixed** (c7fdad07). One skeleton per pane: the stage's instruments, and the rail's rows with the first holding a mini well. Round 2: resolved. | `loading-after-*`; S114 |
| 3 | blocker | Each cause took two lines. | **Fixed** (c7fdad07). Name, counts and drill sit on one row. Round 2: resolved. | `rail-fold-opened-item-after-*`, `urgency-one-tier-after-*`; S115 |
| 4 | blocker | Unranked rows dropped their served sentence. | **Fixed** (c7fdad07); see the ruling above. Round 2 could not settle it from the captures, because the captured unranked Patterns print no sentence. The coordinator's probe of the branch showcase's `rendered_rows` settles it: `pattern:highs_after_meals`, `pattern:lows_after_correcting_highs` and `pattern:lows_after_meals` all have `pattern.admission_route` `none` and serve `count_sentences` `[]`. The server serves them no sentence, so printing none is correct. Unranked Causes do serve one, for example `finding:meal_bolus_short` ("1 of 32 meals needed a correction after") and `finding:correction_on_iob` ("1 of 5 lows followed a correction on active insulin"). | node test; coordinator probe |
| 5 | blocker | The Cause mini used colours opposite to the Pattern mini's. | **Fixed** (c7fdad07, ruling). One rail inking in the shared builder. Round 2: partly. Its claimed cohort (one case, all points withheld) draws no line, so the label keyed nothing. **Fixed** (92ca1414): a label whose line is not drawn steps down to the muted ink. Re-shot: the Cause mini's "REBOUNDED HIGH · 1" reads muted beside its grey TYPICAL line, and the Pattern mini keeps its orange claimed line and label. | `mini-cause-event-after-*`, `mini-pattern-after-*`; node tests |
| 6 | blocker | The anchor word came from a MEAL/LOW table. | **Fixed** (c7fdad07), from the served anchor label. Round 2: resolved ("LOW EXCURSION" matches the stage axis). New in round 2: the label collided with the dashed target line. **Fixed** (92ca1414): the label is knocked out on the mini's own ground. Re-shot: the dashed target line breaks behind "LOW EXCURSION" on the Cause mini, and the label stands clear of the band on the Pattern mini. | `mini-*-after-*`; node tests |
| 7 | blocker | The selected outline was text-coloured. | **Fixed** (c7fdad07, ruling): `--primary`. Round 2: resolved. It stays 1 px against the mockup's 2 px because the app's value wins. | `lane-detail-after-*`; S113 |
| 8 | major | The toggle stood in its own 36 px band, and its caret was unreadable. | **Fixed** (c7fdad07): the toggle sits inside the item with a CSS caret. Round 2: resolved. Its minor hover band is **fixed** in 92ca1414: hover keeps to the toggle's words. Re-shot: the opened toggle carries no band. | `rail-arrival-after-*`, `urgency-one-tier-after-*`, `rail-fold-opened-item-after-*` |
| 9 | major | There was no continuous spine, and the per-cause accent read as urgency. | **Fixed** (c7fdad07): one rule in the rule ink. Round 2: partly, on two points. First, the urgency stripe stopped at the row, above the toggle; **fixed** (92ca1414), the stripe runs down the whole list item. Second, the spine starts below the toggle rather than at the Pattern. **Objection**: the mockup draws it exactly so, with the toggle and then the `.owned` block carrying its `border-left`, so this matches the reference. Re-shot: the primary stripe runs from the urgent Pattern's row down past its toggle and cause line. | `rail-first-pattern-open-after-*`, `urgency-one-tier-after-*` |
| 10 | major | Assistive technology read causes as siblings, and the toggle had no `aria-controls`. | **Fixed** (c7fdad07): a nested `role=list` inside the Pattern's item, named through `aria-controls` while open. It is not visible in captures. | node tests; S115 locates causes inside the item |
| 11 | major | The Setting row's mini is a night strip. | **Unchanged** (ruling above). | — |
| 12 | minor | Count emphasis was a colour step only. | **Fixed** (c7fdad07): weight 600. Round 2: resolved. | `rail-arrival-after-*` |
| 13 | minor | The rank stripe curved at its ends. | **Fixed** (c7fdad07): square left edge. Round 2: resolved. The stripe now runs down the item (92ca1414). | `urgency-one-tier-after-*` |
| 14 | minor | A focus ring shows on the Findings heading. | **Unchanged** (ruling above). | — |
| 15 | minor | There was no window-bar placeholder, and the skeleton was faint. | **Fixed** (c7fdad07): a bar mark, one surface step above the field. Round 2: partly, on two points. First, the stage skeleton ended at mid-height; **fixed** (92ca1414), adding a strip well for the glucose panel. Second, the bar sits inside the loading card rather than where Diagnose's window bar sits. **Objection**: the loading frame is the desk's one frame for every destination (Diagnose, Changes, Day, Focus), and only Diagnose has a window bar. The status element that carries the named loading text is that card. Seating a mark at one destination's bar position would couple the shared frame to Diagnose's layout. Re-shot: the strip well stands below the chart well. Its overrun of the card at 1280x720 is fixed, as recorded above. | `loading-after-*` (re-shoot on the fix commit); S114 |

## Captures in this folder

- **Both sizes, before and after:** `rail-arrival`, `rail-fold-opened`,
  `urgency-one-tier`, `mini-pattern`, `mini-cause-event`, `lane`,
  `lane-detail`, `loading`.
- **After only:** `rail-fold-opened-item` and `rail-first-pattern-open`. For
  the latter's before state, see `urgency-one-tier-before-*`.
- The coordinator's rail-pane-only crops matched nothing, so the full-page
  captures stand for the rail.
