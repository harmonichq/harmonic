# Reader text says what the engine means — triage and review ledger

Ticket: #468. Change: `openspec/changes/qa-round-2` (ADR 468; tasks 93–103;
surfaces requirements 4, 8, 14 and 15, behavioral-layer requirement 9). Triage ran
unattended (AFK run, 2026-09-25) at d22fac7a.
Item 5 (the Glossary's correction-factor unit) is left out (Connor, 2026-09-24).

## Reproduction

`node docs/scope/468-reader-text.repro.mjs`, at d22fac7a:

```text
1. Pattern fold
  pattern:highs_after_meals serves count ["1 of 3 meals ran high"]
    finding:carb_undercount: den "1 of 3 meals" out "outside the count · 2 of 4 highs"
  pattern:lows_after_correcting_highs serves count none
    finding:correction_on_iob: den "" out "outside the count · 1 of 5 lows"
    finding:correction_stacking: den "" out "outside the count · 1 of 1 correction clusters"
2. Day Quiet line
  one quiet anchor (18:00), Finding 13:55: ledger.quiet {"start":"2024-06-26 18:00:00","end":"2024-06-26 18:00:00"} line "18:00–18:00 · 1 clean · 0 explained · 0 no data"
  quiet anchors 08:00 and 20:00, Finding 13:55: ledger.quiet {"start":"2024-06-26 08:00:00","end":"2024-06-26 20:00:00"} line "08:00–20:00 · 2 clean · 0 explained · 0 no data"
3. Retained reassessment Context row
  saved context: "Stored context recorded Jun 1, 2024 · 00:00"
  legacy record: "No stored context was recorded"
  missing context: "No stored context was recorded"
```

`uv run python docs/scope/468-reader-text.repro.py`, at d22fac7a:

```text
meals ('claimed', 'calm', 'no_data')
  verdict band {'fired': 1, 'outranked': 0, 'near_miss': 0, 'no_data': 1, 'clean': 1}
  cohort 'Matched': routed 1, band_verdict 'fired', member verdicts ['fired'], served keys ['band_verdict']
  cohort 'Nearly matched': routed 0, band_verdict 'near_miss', member verdicts [], served keys ['band_verdict']
  cohort 'Other meal opportunities': routed 2, band_verdict None, member verdicts ['clean', 'no_data'], served keys ['band_verdict']
meals ('claimed', 'claimed', 'claimed', 'near_miss', 'no_data', 'calm')
  verdict band {'fired': 3, 'outranked': 0, 'near_miss': 1, 'no_data': 1, 'clean': 1}
  cohort 'Matched': routed 3, band_verdict 'fired', member verdicts ['fired'], served keys ['band_verdict']
  cohort 'Nearly matched': routed 1, band_verdict 'near_miss', member verdicts ['near_miss'], served keys ['band_verdict']
  cohort 'Other meal opportunities': routed 2, band_verdict None, member verdicts ['clean', 'no_data'], served keys ['band_verdict']
```

The showcase probe runs the shipped Episode Log over every committed showcase day
(`uv run python docs/scope/468-reader-text.probe.py "$TMPDIR/468-days.json"`, then
`node docs/scope/468-reader-text.probe.mjs "$TMPDIR/468-days.json"`):

```text
42 days, 2024-05-20 to 2024-06-30
2024-06-26: Quiet 2, span 08:00–14:35, covers Findings at 13:55
2024-06-30: Quiet 3, span 19:00–08:00, covers Findings at 22:00
days with Quiet rows and exactly one quiet anchor: 26
```

The last day adds a case the issue missed: a span that runs backwards.

## Grounding notes

- Item 3 is mostly done. #462's task 23 (ADR 462 decision 4) replaced the hash
  with "Stored context recorded ‹time›" and "No stored context was recorded", and
  `frontend/history.test.js` already pins "no run of eight or more hex". What
  remains is the words: the line does not say the read reuses the settings and
  rules saved with the record, and a missing context does not print the word
  table's words. A missing context is served as `{state: unavailable, reason}`
  with the reason `legacy_not_recorded` (`Store.follow_up_record`, no retained
  record) or `not_recorded`, and no `captured_at`.
- #462 added the Retained line's requirement to this same change's surfaces delta
  (ADDED, position 4). A MODIFIED delta cannot target it, so #468 amends its words
  in place and keeps its position.
- The fold's scope is served per sentence (`findings_projection._fold_sentences`),
  and a parent Pattern serves `count_sentences: null` exactly when it serves no
  count, so the desk can choose the words from served facts. S115 and S126 already
  hold the parent row where they call the fold check.
- `quiet.start` and `quiet.end` have one shipped reader, `frontend/day.js:276`.
  The historical prototype `mockups/harmonic-v2-glucose-day.js:175` also reads
  them. Nothing loads that prototype in a gate, and its header keeps its bytes as
  they were.
- A same-population comparison cohort is the roster less its `fired` and
  `near_miss` Occurrences (`finding_case_file._event`), so its members are exactly
  the Occurrences of their verdicts. A cross-population comparison holds no roster
  Occurrence.
- The caption replay splits the caption on " · " (`assertComparisonCaption424`),
  so the states inside one term are comma-joined. It counts `\d+ not comparable`,
  and the caption's uncounted "not comparable" does not match that.
- `tests/test_finding_case_file_api.py:785` pins each cohort's exact key set. The
  validator's `validCohort` does not.
- Every committed set that serializes an event case file carries `band_verdict`
  and has a generator with a drift check: `frontend/__fixtures__/findings-projection.json`,
  `frontend/__fixtures__/missed-meal-comparison.json`,
  `mockups/diagnose-event-comparison.synthetic/capture.json`,
  `mockups/diagnose-workstation.synthetic/finding-case-files.json`,
  `mockups/eating-sequence-findings.synthetic/payload.json` (959,269 bytes, one
  cohort set, under its 1,000,000-byte limit), and the exploration's
  `focus.json`, `journey.json` and `workstation.json`.
- No story reads Day's Quiet line text. S188 reads the Retained line but pins only
  the absence of id characters. S124 and S125 read the caption; S115 and S126
  read the fold.
- UI Craft's router (`route.mjs --embodiment shipped --runnability runnable
  --declaration complete --data-source manufactured`) returns `revise`. The
  behavior sweep is deferred to start (task 93): port 8765 was reserved for the
  concurrent slice during this triage.
- Would have checked live: nothing; this ticket depends on no deployed state.

## Closed document inventory

`git grep` over the tree, excluding archived changes and release evidence:

- "outside the count": `CONTEXT.md:903`, `DESIGN.md:362`,
  `frontend/diagnose-findings-queue.js:426,449`,
  `frontend/diagnose-findings-queue.test.js:480,484,497,498`,
  `frontend/diagnose-workstation.css:1882`, `frontend/c4.replay.mjs:1349,1359,1360,1363,3140`,
  `frontend/c4.replay.test.js:2451–2461`, `openspec/specs/surfaces/spec.md:1113,1121`
  (MODIFIED by this change). Left as they are: the engine-side docstrings that
  describe the served `outside` scope (`ciq_autotune/findings_projection.py:1189`,
  `mockups/findings-projection.mirror.mjs:207`), a replay registry title
  (`frontend/desk-behavior.replay.mjs:3218`), the frozen S115 amendment
  (`mockups/harmonic-v2-desktop.behavior.md:3858`) and release evidence under
  `docs/scope/release-422-434-evidence/`.
- "one stretch" and the Quiet span: `frontend/day.js:276`,
  `frontend/day-chart.js:62,125–126`, `frontend/glossary.js:35`,
  `docs/kb/reading-day.md:29`, `CONTEXT.md:852–853`, and the generated extracts
  `mockups/harmonic-v2.exploration/glossary.js:27` and `utilities.json`.
  `mockups/harmonic-v2-glucose-day.js:175` is left unchanged (ADR 468 decision 2).
- "Stored context": `frontend/history.js:406`, `frontend/history.test.js:343,346`,
  `openspec/changes/qa-round-2/specs/surfaces/spec.md` (amended in place), and
  S188's section in `mockups/harmonic-v2-desktop.behavior.md:5551`, which is
  amended by a new line rather than edited.
- The caption's band words: `frontend/diagnose-workstation.js:690–702`,
  `frontend/diagnose-workstation.test.js:1057,1064,1072,1075`,
  `frontend/c4.replay.mjs:1297–1320`, `frontend/c4.replay.test.js:2383–2441`,
  `openspec/specs/surfaces/spec.md:1125–1145` and
  `openspec/specs/behavioral-layer/spec.md:437–459` (both MODIFIED here).

## Decisions

- Connor, 2026-09-24: leave item 5 (the Glossary unit) out.
- Decided autonomously during the AFK run (ADR 468): the fold's words "not in
  this Pattern's count", and no words under a Pattern with no count; the Quiet span
  dropped, with the fields, the Glossary, the Guide and CONTEXT.md reworded and the
  historical prototype left as it is; the Retained line's words and the word
  table's words for a missing context, amending ADR 462 decision 4 in place;
  `band_states` on every event cohort, in band order; the caption's comma-joined,
  uncounted states; four stories amended and one Day story added on the showcase.
- Surface lifecycle `revise`; the behavior sweep is deferred to start (port 8765
  was reserved during this triage). Every browser run is a coordinator-run leg the
  start session hands back through `.afk/out/browser-legs.md` (review round 1).
- Flat order, one start session, per the coordinator's slice plan. Three rubric
  traits fire (lockstep copies of the band states across the server, the fixture
  projector, the validator and the captures; a live replay inside the ticket; a
  lifecycle-gated surface revision), and the reviewer-memory anchors disagree with
  flat.
- Review depth Targeted: reader words and one additive served description field;
  no analyzer, `safety.py`, staging predicate, deliverable or Plan change.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
| 1 | — | Initial flat draft pinned cf06ffb3 | Blocker (`authoring`): tasks 93, 102 and 103 need Chromium, yet the fence named no handback and `Done when` required every task ticked, inviting status lines about runs the worker never made. Notes (`authoring`): `frontend/diagnose-workstation.test.js:1064` bans "not comparable" from the whole caption, which decision 5's caption now carries; the showcase probe reads `quiet.start`/`quiet.end`, so after task 97 it prints no day rather than failing; the drafting-conventions path did not resolve in the checkout. Refuted: none; each reproduced against the tree. Fixed: the fence names three browser-leg handbacks through `.afk/out/browser-legs.md` and `Done when` names the coordinator-evidenced ticks (93, 102's status lines, 103); task 96 narrows `:1064` to a count-labelled "not comparable"; task 102 runs the probes on task 95's commit, before task 97; the path is absolute. Slice s6 was dropped from the run, so the renumbering note is removed. | BLOCKED (1 block, 3 notes); fixed, no further panel by operator instruction |

## Behavior sweep at the base (task 93)

Coordinator-run browser legs on d5649a82 (the lock's pin, #468's base), through
`frontend/desk-behavior.replay.mjs` with `CASE_STORE_DIR` and `CAPTURE_DIR`, and
the QA copy-then-serve of the showcase driven by a headless driver:

- Replay `ONLY=S115,S124,S125,S126,S188`: `executed 5 · failed 0 · deferred 0 ·
  selected 5` at 1280x720 and at 1440x900.
- Fold, showcase (S115): under Highs after meals, "Meal bolus fell short" reads
  "outside the count·1 of 32 meals" on its second row, with no first row: that
  Pattern serves no count on the showcase.
- Fold, `behavioral-correction-stacking` (S126): the Lows after correcting highs
  Pattern serves a count ("2 of 2 lows followed a correction"); Correction
  stacking reads "2 of 2 lows" over "outside the count·2 of 8 correction clusters".
- Caption, `behavioral-carb-undercount` (S124): the band's residue reads "1 not
  comparable"; the caption reads "3 Matched (meets criteria) · 1 Nearly matched
  (borderline) · 2 Other meal opportunities". The comparison group's 2 holds
  Occurrences the band splits between Does not meet and not comparable.
- Caption, `behavioral-missed-meal` (S125): the caption reads "2 Matched · 1 Nearly
  matched (borderline) · 2 Completed carb-bolus meals · 3 highs outside the
  comparison"; its comparison is drawn from another population.
- Retained line, `c4-isf-late-read` (S188): the Context row reads "Stored context
  recorded Jul 1, 2024 · 23:55".
- Day, showcase 2024-06-26: "Findings · 1" lists 13:55 (Over-treated low); "Quiet ·
  2" reads "08:00–14:35 · 0 clean · 1 explained · 1 no data", a span covering the
  Finding.
- Day, showcase 2024-06-30: "Findings · 1" lists 22:00 (Correction on active
  insulin); "Quiet · 3" reads "19:00–08:00 · 1 clean · 0 explained · 2 no data", a
  span that runs backwards. No console errors on either day.

Observed behavior with no story: the Day Episode Log's Quiet caption and line
(the band lists no rows, only its caption and counts). Task 102's new story covers
it. Nothing else observed lacks a story.
