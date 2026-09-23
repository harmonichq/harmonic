# #423 implementation checklist

Base: the release integration trunk after #426 lands. On that base:

- the model view serves each episode's `lever_title`;
- #426's surfaces requirement ends every Episode Log row whose episode carries a
  Lever with that `lever_title`;
- the Day desk keeps no cause-name table.

Read #426's field and row markup from the trunk.

## 1. Served names, words, hue, count and explanation

- [ ] 1.1 Serve a `title` beside `classifier` on every retained verdict of every
  anchor in `_build_episode_view` (`ciq_autotune/analyzers/scenario/model_view.py`),
  as `levers.title(Lever(classifier))` with no fallback name. Tests go in
  `tests/test_scenario_model_view.py`, through `assemble_model_view` on the
  manufactured events of design.md generated fact 4, never a hand-set state.
  They assemble the day that episode ends: the day after its anchors, whose
  evening is stamped the day before.
  - The level-2 low is `outranked` in a `meal_over_delivery` episode, and its
    matched `correction_on_iob` verdict serves
    `levers.title(Lever.CORRECTION_ON_IOB)`.
  - Every retained verdict on every anchor serves a title.

  Prove the other consumers unchanged:
  - every drift check AGENTS.md and `.github/workflows/ci.yml` list passes
    `--check` with no regeneration;
  - `tests/test_explore_exposures.py` and `tests/test_finding_case_file.py` pass
    unedited.
- [ ] 1.2 Implement surfaces **The Episode Log words an outranked anchor as
  claimed, and Diagnose shares the word**:
  - move `STATE_WORD` out of `frontend/day.js` into `frontend/day-chart.js` as
    the export `ANCHOR_STATE_WORD`, with `outranked: 'claimed'` and the other
    four words unchanged;
  - Day's tier word reads it;
  - `VERDICT_RESIDUE_KEY.outranked` in `frontend/diagnose-workstation.js` is
    built from `ANCHOR_STATE_WORD.outranked` as `claimed by another finding`.
  No comment or copy defines `claimed` as "matched" or "did not match"; it means
  only that the anchor or occurrence belongs to an episode another Finding owns.
- [ ] 1.3 Implement surfaces **A claimed row names what the anchor matched and
  ends with the Finding that claimed it**, in the Episode Log row markup
  (`frontend/day.js`):
  - a claimed row first names each of the anchor's own matched verdicts by its
    served `title`, skipping a title equal to the episode's `lever_title`;
  - it then ends with the episode's served `lever_title`, exactly as #426's row
    markup ends every row whose episode carries a Lever;
  - `buildRows` (`frontend/day-chart.js`) carries what the row needs from the
    served episode and verdicts, and derives no verdict.
  The Day desk (`frontend/day.js`, `frontend/day-chart.js`) keeps no
  Lever-key-to-name table, and this change adds none. Fired, also-checked and
  quiet rows keep the content #426 gives them.
- [ ] 1.4 Implement surfaces **A claimed anchor keeps its Finding's hue and
  size**:
  - `anchorStateColor` maps `outranked` to the fired hue;
  - `buildAnchorOverlay` sizes an outranked resting marker as a fired one;
  - `.gf .gf-log-row .tier[data-state="outranked"]` in `frontend/desk.css` takes
    the fired tier's colour;
  - remove `warn` and its comment from `deskColors()` in `frontend/colors.js`
    once a whole-tree search, `frontend/index.html` included, finds no other
    reader.
- [ ] 1.5 Implement surfaces **The Findings band counts attributed episodes, not
  rows**:
  - `buildEpisodeLedger` returns the number of distinct served episode ids among
    the Findings band's rows (attributed episodes, each one Occurrence of its
    Lever's Finding) and the number of its claimed rows, and drops the unused
    `fired` count;
  - the caption prints `Findings · <episodes>`, followed by ` · <k> claimed`
    when k > 0.
  Rows keep chronological order.
- [ ] 1.6 Implement surfaces **The Episode Log bands are explained where a reader
  looks**. Add an Episode Log group to `frontend/glossary.js`, in CONTEXT.md
  terms with no listed synonym:
  - *Finding*: a Findings-band group is one episode the engine attributed to a
    Lever, one Occurrence of that Lever's Finding (CONTEXT.md *Finding* and
    *Occurrence*), and the band's count is the number of those episodes, never
    rows and never distinct Levers;
  - *Claimed*: only that the anchor belongs to an episode another Finding owns.
    The Day row separately names what the anchor matched. A claimed occurrence
    on Diagnose is one whose own Finding's criterion was not met while another
    Lever drove the episode (`findings_projection._occurrence_verdict`), and the
    behavioral-layer requirement keeps those two meanings distinct;
  - *Also checked*;
  - *Quiet*, naming its clean, explained and no-data counts.

  Also:
  - add `Episode Log` and `Claimed` entries to the same effect under
    CONTEXT.md's "Day surface";
  - rewrite `docs/kb/reading-day.md`'s "The Episode Log" section to describe
    rows, the three bands and the claimed word, keeping the line
    `> **Open your [Day surface](app:day)** to replay a specific date.`
    byte-identical (S73c reads it);
  - put a keyboard-operable Glossary control on each band caption, with a stable
    selector and an accessible name naming the band. It opens the Glossary with
    the Episode Log group in view, and Close returns focus to it. `openUtility`
    in `frontend/utilities.js` may take the in-view target;
  - reword the Glossary's `v1 definitions` meta and the `glossary.js` header
    comment so neither describes every definition as v1's;
  - regenerate `mockups/harmonic-v2.exploration/` with
    `uv run python mockups/harmonic-v2.exploration/generate.py`, so that only
    its `glossary.js` and `utilities.json` change, and keep its `--check` green.
- [ ] 1.7 Node tests through each module's public interface, each observed
  failing on the base first.
  - `frontend/day.test.js`, for a meal over-delivery day with a level-2 claimed
    low:
    - the claimed tier word is not the state name and equals
      `ANCHOR_STATE_WORD.outranked`;
    - the claimed row names correction on IOB's served title, ends with the
      episode's served `lever_title`, and contains no underscore token;
    - the caption for one attributed episode plus one claimed anchor, and for a
      high-carb-sequence episode with two claimed anchors and no fired one;
    - each caption's Glossary control and its selector;
    - the claimed tier rule in `frontend/desk.css` does not use `--mk-warn`;
    - the Glossary groups include the Episode Log terms.
  - `frontend/day-chart.test.js`:
    - `anchorStateColor('outranked')` equals the fired hue and not
      `colors.warn`;
    - the outranked resting marker size equals the fired one;
    - `focusUpdate`'s hairline for a focused claimed row takes the fired hue;
    - the ledger's two counts.
  - `frontend/diagnose-workstation.test.js`: the outranked label is built from
    `ANCHOR_STATE_WORD` and the phrase `claimed by another factor` is gone.

  The Glossary's in-view target and focus return are DOM behavior, which S122
  (task 2.1) proves in the built app.

## 2. Ledger stories, design records and evidence

- [ ] 2.1 Add S121 and S122 (ticket block S121–S123) to
  `mockups/harmonic-v2-desktop.behavior.md` in a new section headed
  `## #423 amendment — 2026-09-23`, following the #413 and #414 amendment
  pattern. The section carries:
  - the design.md sanction line;
  - each story's element, source, lock (S121: HV2-13, HV2-19, HV2-32; S122:
    HV2-13, HV2-32, HV2-33), data, evidence and status;
  - the amendment's handler inventory table.

  Never rewrite, re-date or replace an existing `★ FROZEN` block or the header's
  inventory line.

  - **S121**, on `pattern-near-tie` Day 2024-05-25, whose claimed anchors
    (stamped 2024-05-24) sit before the Day axis:
    - the claimed low's Episode Log row reads `claimed`;
    - the row names correction on IOB's served title and ends with carb
      undercount's served `lever_title`;
    - the row paints its tier word in the fired row's computed colour, not the
      warning ink;
    - the Findings caption states one attributed episode and one claimed
      anchor;
    - the claimed and fired markers' colour and size are read back from the
      chart's `day-anchor-markers` series option by series id, never by display
      name, and the claimed marker's colour and size equal the fired marker's.

    S121 asserts nothing about a visible ring or hairline, because the axis
    clips both.
  - **S122**, on the same store and day: the Findings caption's Glossary
    control opens the Glossary with the Episode Log group in view, and Close
    returns focus to that control.

  Wiring and counts:
  - write both as `C4_STORIES` in `frontend/c4.replay.mjs`, exported through
    `appOnly(...)` in `frontend/desk-behavior.replay.mjs` and its `REGISTRY`, and
    mapped to `pattern-near-tie` in `frontend/replay-cases.mjs` `STORY_CASES`;
  - add fake-page tests in `frontend/c4.replay.test.js` that tell each feature
    assertion from a setup error. S121 fails on a warning-hued tier, a bare
    state word, a missing served title, a row not ending with the `lever_title`,
    a caption counting rows, or a claimed marker smaller than or hued unlike the
    fired one;
  - move the numeric inventory literals in `inventory()`
    (`mockups/sweep/harmonic-v2-desktop/acceptance.py`: issued 149, active 130,
    retired 19) and the matching counts in
    `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`, so this branch's own
    tests pass.

  Re-read S67 and S82 for intent: they read `.tier[data-state]` and label
  redundancy, which still hold. Amend neither unless the branch replay shows
  otherwise, and then only inside the #423 amendment section.
- [ ] 2.2 Add a #423 paragraph to `DESIGN.md`'s "#404 desk revise amendment"
  section: the claimed hue equals the Finding's, the warning hue leaves the
  Episode Log, and band captions link the Glossary. The ledger header's
  inventory line, `ACCEPTANCE.md`'s count sentence and the release freeze block
  belong to the release coordinator. This change edits none of them.
- [ ] 2.3 Hand every port-bound leg to the release coordinator, serially, with
  exact commands, and fold what those runs expose back into this branch:
  - S121 and S122 fail on the ticket's base for their feature reason and pass on
    the branch at 1280x720 and 1440x900;
  - S67, S68, S73c and S82 replay green at both sizes;
  - before and after synthetic renders at both sizes of:
    - the Episode Log on `pattern-near-tie` Day 2024-05-25 (the claimed row at
      rest and pressed, its tier word, and the Findings caption);
    - the Glossary opened from a caption;
    - a Diagnose case file whose footer serves an outranked count
      (`behavioral-meal-over-delivery`'s Meal over-delivery case file serves
      `outranked=1`).
  No ring or hairline capture is taken: those marks sit before this store's Day
  axis and are proven by task 1.7 and S121's option readback. Keep the raw logs
  and captures in `docs/scope/423-episode-log-evidence/`, with a README that
  maps each requirement to its story, test, log and captures.
- [ ] 2.4 On the commit that will be integrated, run once: the AGENTS.md
  pull-request gate, every drift check,
  `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py`, and
  OpenSpec strict validation. The release coordinator runs the complete desk
  ledger and the browser suites once on the integration branch.
