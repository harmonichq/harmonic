# #423 implementation checklist

Base: the release integration trunk after #426 lands. On that base the model
view serves each episode's cause title and Day keeps no cause-name table. Read
the field #426 serves from the trunk; this checklist names it only as "the
served episode cause title".

## 1. Served names, words, hue, count and explanation

- [ ] 1.1 Serve a `title` beside `classifier` on every retained verdict of every
  anchor in `_build_episode_view` (`ciq_autotune/analyzers/scenario/model_view.py`),
  from `levers.title()`. Tests in `tests/test_scenario_model_view.py`, through
  `assemble_model_view` on the manufactured events recorded in design.md
  generated fact 4, never a hand-set state:
  - the level-2 low is `outranked` in a `meal_over_delivery` episode, and its
    matched `correction_on_iob` verdict serves `levers.title(Lever.CORRECTION_ON_IOB)`;
  - every retained verdict on every anchor serves a title.
  The title is `levers.title(Lever(classifier))` with no fallback name, so a
  classifier outside `Lever` fails the read loudly instead of serving an
  unnamed verdict.
  Prove the other consumers unchanged: every drift check AGENTS.md and
  `.github/workflows/ci.yml` list passes `--check` with no regeneration, and
  `tests/test_explore_exposures.py` and `tests/test_finding_case_file.py` pass
  unedited.
- [ ] 1.2 Implement surfaces **The Episode Log words an outranked anchor as
  claimed, and Diagnose shares the word**:
  - move `STATE_WORD` out of `frontend/day.js` into `frontend/day-chart.js` as
    the export `ANCHOR_STATE_WORD`, with `outranked: 'claimed'` and the other
    four words unchanged;
  - Day's tier word reads it;
  - `VERDICT_RESIDUE_KEY.outranked` in `frontend/diagnose-workstation.js` is
    built from `ANCHOR_STATE_WORD.outranked` as `claimed by another finding`.
- [ ] 1.3 Implement surfaces **A claimed row names the Finding that claimed it
  and what it matched** in the Episode Log row markup (`frontend/day.js`):
  - the served episode cause title names the claiming Finding;
  - each of the anchor's own matched verdicts is named by its served `title`,
    skipping a title equal to the claiming Finding's;
  - `buildRows` (`frontend/day-chart.js`) carries what the row needs from the
    served episode and verdicts, and derives no verdict;
  - no Lever-key-to-name table appears in `frontend/`.
  Fired, also-checked and quiet rows keep today's content.
- [ ] 1.4 Implement surfaces **A claimed anchor keeps its Finding's hue and
  size**:
  - `anchorStateColor` maps `outranked` to the fired hue;
  - `buildAnchorOverlay` sizes an outranked resting marker as a fired one;
  - `.gf .gf-log-row .tier[data-state="outranked"]` in `frontend/desk.css` takes
    the fired tier's colour;
  - remove `warn` and its comment from `deskColors()` in `frontend/colors.js`
    once a whole-tree search (including `frontend/index.html`) finds no other
    reader.
- [ ] 1.5 Implement surfaces **The Findings band counts Findings, not rows**:
  - `buildEpisodeLedger` returns the number of distinct served episode ids among
    the Findings band's rows, and the number of its claimed rows, and drops the
    unused `fired` count;
  - the caption prints `Findings · <findings>`, followed by ` · <k> claimed`
    when k > 0.
  Rows keep chronological order.
- [ ] 1.6 Implement surfaces **The Episode Log bands are explained where a reader
  looks**:
  - an Episode Log group in `frontend/glossary.js` (Finding, Claimed, Also
    checked, Quiet naming clean, explained and no data), in CONTEXT.md terms
    with no listed synonym;
  - `Episode Log` and `Claimed` entries under CONTEXT.md's "Day surface";
  - `docs/kb/reading-day.md`'s "The Episode Log" section rewritten to describe
    rows, the three bands and the claimed word, keeping the line
    `> **Open your [Day surface](app:day)** to replay a specific date.`
    byte-identical (S73c reads it);
  - a keyboard-operable Glossary control on each band caption (stable selector,
    accessible name naming the band) that opens the Glossary with the Episode
    Log group in view, where Close returns focus to it (`openUtility` in
    `frontend/utilities.js` may take the in-view target);
  - the Glossary's `v1 definitions` meta and the `glossary.js` header comment
    no longer describe every definition as v1's;
  - regenerate `mockups/harmonic-v2.exploration/` with
    `uv run python mockups/harmonic-v2.exploration/generate.py`, so that only
    its `glossary.js` and `utilities.json` change, and keep its `--check` green.
- [ ] 1.7 Node tests through each module's public interface, each observed
  failing on the base first:
  - `frontend/day.test.js`: the claimed tier word is not the state name and
    equals `ANCHOR_STATE_WORD.outranked`; the claimed row names both served
    titles with no underscore token, for a meal over-delivery day with a level-2
    claimed low; the caption for one Finding plus one claimed anchor, and for a
    high-carb-sequence episode with two claimed anchors and no fired one; each
    caption's Glossary control and its selector; the claimed tier rule in
    `frontend/desk.css` does not use `--mk-warn`; the Glossary groups include
    the Episode Log terms.
  - `frontend/day-chart.test.js`: `anchorStateColor('outranked')` equals the
    fired hue and not `colors.warn`; the outranked resting marker size equals
    the fired one; the ledger's two counts.
  - `frontend/diagnose-workstation.test.js`: the outranked label is built from
    `ANCHOR_STATE_WORD` and the phrase `claimed by another factor` is gone.
  The Glossary's in-view target and focus return are DOM behavior. S122 (task
  2.1) proves them in the built app.

## 2. Ledger stories, design records and evidence

- [ ] 2.1 Add S121 and S122 (ticket block S121–S123) to
  `mockups/harmonic-v2-desktop.behavior.md` under a dated "#423 amendment"
  heading carrying the design.md sanction line, each with element, source, lock
  (S121: HV2-13, HV2-19, HV2-32; S122: HV2-13, HV2-32, HV2-33), data, evidence
  and status. Add the amendment's handler inventory table.
  - S121, on `pattern-near-tie` Day 2024-05-25: the claimed low's row reads
    `claimed`, names the served carb undercount and correction on IOB titles,
    and paints its tier word in the fired row's computed colour, not the warning
    ink. The Findings caption states one Finding and one claimed anchor. The
    ring and hairline hue are asserted from the chart's own option readback by
    series id, never by display name.
  - S122, on the same store and day: the Findings caption's Glossary control
    opens the Glossary with the Episode Log group in view, and Close returns
    focus to that control.
  - Write both as `C4_STORIES` in `frontend/c4.replay.mjs`, exported through
    `appOnly(...)` in `frontend/desk-behavior.replay.mjs` and its `REGISTRY`,
    mapped to `pattern-near-tie` in `frontend/replay-cases.mjs` `STORY_CASES`.
  - In `frontend/c4.replay.test.js`, add fake-page tests that tell each feature
    assertion from a setup error. S121 fails on a warning-hued tier, a bare
    state word, a missing served title, or a caption counting rows.
  - Move `inventory()`'s pinned counts in
    `mockups/sweep/harmonic-v2-desktop/acceptance.py` (issued 149, active 130,
    retired 19) and the matching counts in
    `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`.
  - Re-read S67 and S82 for intent: they read `.tier[data-state]` and label
    redundancy, which still hold. Amend neither unless the branch replay shows
    otherwise, and then only under the frozen-header amendment rule.
- [ ] 2.2 Record the revision:
  - add a #423 paragraph to `DESIGN.md`'s "#404 desk revise amendment" section
    (claimed hue equals the Finding's, the warning hue leaves the Episode Log,
    band captions link the Glossary);
  - add S121–S122 and the new counts to the ledger inventory in
    `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md`;
  - move the frozen ledger's re-freeze header counts to equal `inventory()`'s.
- [ ] 2.3 Hand every port-bound leg to the release coordinator, serially, with
  exact commands, and fold what those runs expose back into this branch:
  - S121 and S122 fail on the ticket's base for their feature reason and pass on
    the branch at 1280x720 and 1440x900;
  - S67, S73c, S82 and S68 replay green at both sizes;
  - before and after synthetic renders at both sizes of: Day 2024-05-25 on
    `pattern-near-tie` (claimed row at rest and focused, ring and hairline); the
    Glossary opened from a caption; and a Diagnose case file whose footer serves
    an outranked count (`behavioral-meal-over-delivery`'s Meal over-delivery
    case file serves `outranked=1`).
  Keep the raw logs and captures in `docs/scope/423-episode-log-evidence/`, with
  a README mapping each requirement to its story, log and captures.
- [ ] 2.4 On the commit that will be integrated, run once: the AGENTS.md
  pull-request gate, every drift check, and OpenSpec strict validation. The
  release coordinator runs the complete desk ledger and the browser suites once
  on the integration branch.
