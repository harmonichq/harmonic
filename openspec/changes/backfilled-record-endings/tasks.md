# #442 implementation checklist

The sanction for the desk copy change and every ledger amendment below:
Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here");
coordinator ruling R442.

## 1. One ending rule for every open record (backend)

- [ ] 1.1 In `ciq_autotune/watched_change.py` `reconcile_follow_up`, replace
  the frontier-only ending branch (the `old` record) and the newest-only expiry
  branch with one pass over every retained Trial record whose ending has no
  `kind`. Order the pass by `(changed_at, id)`, oldest first. Run it after the
  record-creation loop, its `_reconcile_plan` calls and `_confirm_from_read`.
  Re-read each record from the store just before deciding it. For each record:
  1. `_reversal_at(store, record)` not `None`: end `reverted` at it.
  2. Otherwise take the earliest `changed_at` among this reconcile's detected
     candidates (the `trials` list the function already builds) that is strictly
     later than the record's `changed_at` and earlier than `changed_at +
     _WATCH_HORIZON`. If one exists, end `superseded` at it.
  3. Otherwise, when `now >= changed_at + _WATCH_HORIZON`, end
     `expired_unreviewed` at `changed_at + _WATCH_HORIZON`.
  4. Otherwise leave the record open.

  Each ending goes through `capture_ending` with `effective_at` set to that
  instant, `recorded_at` set to the reconcile's `recorded_at`, and `data_cutoff`
  set to the same instant as `effective_at`. Do not read other retained records
  as superseding changes.

  Keep these unchanged:
  - the `later` test, the frontier advance to the newest candidate and the final
    frontier advance;
  - Focus preemption, which still reads the frontier record after the pass;
  - `follow_up_admission`, `_reconcile_plan`, `_confirm_from_read`,
    `with_plan_verdicts`, and every Focus ending.

  `rule()` in this change's `premises.py` is the spike of this decision. The
  implementation must reproduce its "ADR 442:" lines on the same stores.
- [ ] 1.2 In `capture_ending`, before computing the comparison, check the
  record's retained `comparison_context`. When its `state` is `available` and its
  `source_snapshot` is missing or was captured later than `data_cutoff`, save the
  ending with an unavailable assessment and compute no comparison. The
  assessment carries:
  - `state: "unavailable"` and `reason: "context_after_ending"`;
  - `version`, `comparison_context` (the record's own), `input_revision` and
    `data_cutoff`, as every saved assessment does;
  - empty `periods` and `outcomes`, and the `limitations` list, the shape
    `compare_follow_up`'s own early unavailable return produces.

  It must pass Store's assessment validator and render as any other unavailable
  saved assessment. Change nothing in `ciq_autotune/follow_up_comparison.py`.
- [ ] 1.3 Backend tests through the public reconcile path, in
  `tests/test_watched_change.py`, on synthetic in-memory stores built the way
  `OneActiveInvariantTest.reconcile` builds them: dose-stamped boluses through
  `upsert_bolus`, and pump reads through `upsert_settings_snapshot` where a case
  needs a retained context. No hand-set endings or `asserts_move` flags. Assert
  on the records reconcile saved:
  - (a) the issue's failing-first case: four correction-factor changes, each
    more than 28 days after the previous, reconciled once. Every record ends
    `expired_unreviewed` at its change plus 28 days, and none is left without an
    ending kind;
  - (b) two carb-ratio changes nine days apart, recorded by one reconcile after
    both windows passed: the older ends `superseded` at the later change's time;
  - (c) a correction-factor change and a carb-ratio change ten days later,
    recorded by one reconcile: the correction-factor record ends `superseded` at
    the carb-ratio change's time;
  - (d) reversal before supersession: an open retained record whose change the
    detector reports reverted, with a later detected change after the reversal,
    ends `reverted`. Build it the way the frontier reaches it today: a first
    reconcile records the change, then the reversal and a later change arrive;
  - (e) a record inside its window with no later change stays open and is
    still served as the active Trial by `follow_up_admission`;
  - (f) a second reconcile over the same and newer inputs leaves every saved
    ending, effective time, recorded time and assessment byte-identical;
  - (g) the bounded cutoff: an `expired_unreviewed` ending recorded three days
    after its window ended saves `assessment.data_cutoff` equal to its
    `effective_at`;
  - (h) `context_after_ending`: a pump read captured after every change leaves
    each older ending's saved assessment unavailable with that reason and its
    data cutoff at the ending instant;
  - (i) a context from a pump read before the superseding change is used: the
    saved assessment's reason is not `context_after_ending`, and its
    `data_cutoff` is the superseding change's time;
  - (j) Plan receipt unchanged: a recorded Plan reconciled to an older record
    that the pass then ends keeps the byte-identical receipt on the Plan and on
    the record.

  Show (a), (c), (g) and (h) failing on base b03431d2 before they pass. Keep
  every existing test in `tests/test_watched_change.py`,
  `tests/test_durable_follow_up.py`, `tests/test_follow_up_store.py` and
  `tests/test_plan_verdict.py` passing unchanged.

## 2. The edit-chain case keeps four open records (QA recipe)

- [ ] 2.1 In `scripts/qa_e2e_cases.py` `_materialize_edit_chain`, move the four
  hand-saved records 14 days later: 05-15 (the week-earlier one), then 05-22,
  05-23 and 05-24. Keep their parameter, slot, values and spacing. Reword the
  docstring to say every record sits inside its watch window at the case's data
  tail (06-01 23:59), so the ending rule leaves all four open. No analyzer
  state or Finding moves, so the case's `QaExpectation` literals stay as they
  are. Run `test_case_edit_chain` in `tests/test_qa_e2e_cases.py` and confirm it
  passes unchanged.

## 3. The desk says it in words (frontend)

- [ ] 3.1 In `frontend/history.js`, set `ENDING_NOTE.superseded` to exactly
  "A later setting change was detected inside the watch window. This record
  keeps the period it actually observed."
- [ ] 3.2 In `frontend/follow-up.js` `COMPARISON_REASON`, add
  `context_after_ending: 'its retained context was read from the pump after this change ended'`.
  #450 routes the saved-ending line through this table; do not touch
  `endingSection`'s assessment line or any other reason line here.
- [ ] 3.3 Node tests:
  - `frontend/history.test.js`: `endingSection` for a `superseded` ending
    prints task 3.1's note and no "same setting". Show it failing on base first;
  - `frontend/follow-up.test.js`: add `context_after_ending` to `REASON_CODES`,
    and assert its exact words.

## 4. Behavior ledger and replay (desk contract)

Ledger rule: never rewrite, re-date or replace an existing `★ FROZEN` block,
the header's inventory line or any existing story entry. Record this change in
one new dated section, `## #442 amendment — 2026-09-23, issue #442`, appended
after the existing amendment sections, carrying the sanction line above. Name
an amended story in prose (`Amended S91 · 2026-09-23 · #442 / Q3 delegation:
…`). Never start a line with `S91 · `, because `inventory()` rejects duplicate
story IDs.

Replay rule: no replay module statically imports a new export. The coordinator
lays this branch's harness over base b03431d2, and a missing named import fails
the whole replay at module link.

- [ ] 4.1 Add S157 on `c4-ic`, app-opener-only, lock HV2-28. The story:
  1. reads `/api/verify/trials`;
  2. as a premise, finds two or more Trial rows and an active Trial;
  3. picks the Trial row that is not the admission's active id;
  4. opens Changes' records roster.

  Feature assertions (base fails at the first):
  - the served row carries ending kind `superseded`;
  - its roster row reads "Superseded by a later change" and has no
    `[data-record-open="true"]` cell;
  - opening the record shows `[data-ending-kind="superseded"]`;
  - the saved-ending note does not contain "same setting";
  - the periods note's "data was read to" time equals the saved ending's
    "Finished" time on the same page.

  Deliver it the way #430 delivered S142 and S143:
  - its `S157 · ` entry and handler-inventory row in the #442 section;
  - an `appOnly` registration and `REGISTRY` entry in
    `frontend/desk-behavior.replay.mjs`;
  - `S157: 'c4-ic'` in `frontend/replay-cases.mjs` `STORY_CASES`;
  - a `C4_STORIES.S157` body in `frontend/c4.replay.mjs`;
  - node tests in `frontend/c4.replay.test.js`: the registration and case, a
    passing fake page, and one fake page failing each feature assertion above.

  `c4-ic` already lies inside S91's smoke closure, so `SMOKE_STORIES` and its
  digest do not move.
- [ ] 4.2 Amend S91's c4 part in `frontend/c4.replay.mjs`. `readiness()` compares
  the page's `[data-readiness]` lines with the comparison the page shows: the
  served saved-ending assessment when the selected record's
  `original.ending.kind` is set, else the retained reassessment. S91's own
  assertions stay on the retained read: the unit, the required count, more than
  14 elapsed days, criterion met and `unclear`. Leave `retained()`'s return
  value, and so S49, unchanged. Record the amendment in prose in the #442
  section. Cover it in `frontend/c4.replay.test.js` with:
  - a fake page for an ended record whose saved and retained readiness differ;
    it passes;
  - one whose page lines match the retained read instead; it fails.
- [ ] 4.3 In the #442 section, record that every other story reading these cases
  keeps its subject:
  - S110, S111, S112 and S143 on `edit-chain`, whose four records stay open
    after task 2.1;
  - S96 and S105 on `c3-history` and `c3-trial`, S49 on `c4-missing`, and R18
    on `c4-history`, none of which gains or changes an ending (this change's
    premises);
  - the desk browser suite's hand-built expired record.
- [ ] 4.4 Move the pinned inventory literals to 172 issued · 153 active · 19
  retired on this branch:
  - `mockups/sweep/harmonic-v2-desktop/acceptance.py` `inventory()`;
  - `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`: the replay-plan
    count, the stated-inventory case and the same-total case.

  Leave these to the coordinator:
  - the ledger header's inventory line;
  - `ACCEPTANCE.md`'s count sentence;
  - `mockups/INDEX.md`;
  - the release freeze block.

## 5. Generated artifacts and verification

- [ ] 5.1 Regenerate what the Python and frontend edits move:
  - run `uv run python mockups/harmonic-v2.exploration/generate.py`;
  - run every drift check AGENTS.md and `.github/workflows/ci.yml` list,
    including `uv run python scripts/gen_qa_e2e_db.py --check` and
    `uv run python scripts/check_demo_fixtures.py`, and the Node synthetic
    capture check.

  Commit only files a generator rewrote. The committed showcase holds no Trial
  record, so `gen_qa_e2e_db.py --check` is expected to pass unchanged.
- [ ] 5.2 Tick this task on exactly these commands, each exiting 0:
  - `npm ci && npm run build`;
  - `uv run python -m pytest` (run once, at the end; state its wall time);
  - `node --test 'frontend/**/*.test.js'`;
  - `npx --yes @fission-ai/openspec@1 validate --all --strict`;
  - `python3 scripts/check_adr_numbers.py`,
    `python3 scripts/check_owned_identifiers.py` and
    `python3 scripts/check_public_allowlist.py`;
  - `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py ReplayPlanTest InventoryProofTest SmokeSelectionTest`;
  - `PYTHONPATH=. uv run python openspec/changes/backfilled-record-endings/premises.py`.
    Every record it listed as "OPEN today -> ADR 442: <kind>" now reports as
    ended with that kind and instant. `c4-isf` and `c4-profile` report a saved
    cutoff of 2024-06-29 00:00:00.
- [ ] 5.3 The coordinator owns every port-bound leg and ticks this task with its
  evidence; the implementer runs none.
  1. On base b03431d2, served from a second worktree with this branch's replay
     harness laid over it, S157 fails at its first feature assertion. On the
     branch it passes. Both runs at 1280x720 and 1440x900:
     `PLAYWRIGHT_MODULE=<playwright> TARGET=app VIEWPORT=<size> ONLY=S157 CASE_STORE_DIR=<scratch> node frontend/desk-behavior.replay.mjs`.
  2. On the branch at one size, `ONLY=S49,S91,S96,S105,S110,S111,S112,S143,R18`
     passes. Unamended S91 would fail there on `c4-isf`.
  3. Then the desk and follow-up browser suites once, the full
     `acceptance.test.py` once (its `ServerLifecycleTest` binds a port), and the
     complete ledger once on the pushed commit.
- [ ] 5.4 The coordinator owns the synthetic before and after renders of the
  `c4-ic` records roster and its 06-01 record, at both sizes, and ticks this
  task with them.
