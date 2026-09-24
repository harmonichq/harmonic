# #430 implementation checklist

The sanction for every copy change and ledger amendment below is the
operator's standing one for #430's checklist: Connor Griffin, 2026-09-23, "Q1 A,
Q2 A, defaults all fine, go". It approved "every change these 13 checklists
call for", with wording in CONTEXT.md terms.

## 1. An open record opens on its retained comparison (desk)

- [x] 1.1 In `frontend/history.js`, make a newly opened record (roster press,
  address or reload) start on its default read, decided after the record read
  from the served `selected.original.ending`:
  - no `kind`: request `fetchVerifyTrials({ kind, selected, assessment:
    'retained' })` next and render the record with that reassessment, with
    Retained context pressed;
  - a `kind`: render the Original read and request nothing more.

  A reader's press of Original, Retained context or Current policy holds for
  that record until another record opens. Pressing the control that is already
  selected must keep working (the c4 replay's `retained()` helper does it).
  Keep one in-flight read keyed by record and effective mode, so a stale answer
  never overwrites a newer record. Do not consult the roster row for the
  default. Change no backend read, cache key or prewarm.
- [x] 1.2 Loading text: while the record read is pending, the existing
  loading frame reads "Reading change records". Once the record read shows no
  saved ending and the retained read is pending, it reads "Computing
  reassessment". Render between the two reads so the second text actually
  shows.
- [x] 1.3 Node tests through the record destination's public `mount` in
  `frontend/follow-up-lifecycle.test.js`. First make its fetch stub serve
  `reassessment` only when the request names an `assessment`, and
  `reassessment: null` otherwise, as the server does. Then cover four cases:
  (a) an open record (served original with no ending) issues the record read
  and one `assessment=retained` read with no control pressed, and renders
  `data-period="before"`, `data-period="after"`, the paired figure state,
  `data-assessment="retained" aria-pressed="true"`,
  `data-reassessment-context="retained"` and the ending part's still-open line;
  (b) an ended record issues no `assessment` read;
  (c) with the retained read unresolved, the host shows "Computing
  reassessment";
  (d) pressing Original on the open record renders the not-requested state of
  task 2.1.
  Show (a) and (c) failing on the base before they pass. Keep the file's
  existing history tests passing.

## 2. The figure says why it is empty (desk)

- [x] 2.1 In `frontend/follow-up.js`, give `evidenceFigure` one
  `data-figure-state` attribute on the figure element. Classify from the clock
  bins first, whatever the served availability. The backend serves
  `unavailable_adherence` and `no_readable_period_evidence` while keeping
  periods and clock views: the committed `c4-missing` case and the test file's
  `FOCUS_COMPARISON` are that shape, and their curves must stay drawn. In order:
  1. `not-requested`: no comparison (`null`).
  2. `paired`: both periods serve a bin at one clock time. Unchanged.
  3. `before-only`: Before bins and no pair. Keep "no Trial readings to compare
     yet", or the Focus wording.
  4. `saved`: the caller says the comparison is a saved ending snapshot, and
     that snapshot serves both periods. It kept its rows but not its curve,
     since the snapshot drops `views`. The record frame knows this as
     `shownComparison(...).source === 'ending'`. This is the only state that
     keeps "no clock envelope is retained for this record".
  5. `unavailable`: the served availability is unavailable and there is no
     clock envelope (`views` absent or empty). Read the availability from the
     nested `availability`, or, for a saved ending assessment carrying no nested
     `availability`, from its own top-level `state`/`reason`. Name the reason
     through task 2.2's words.
  6. `no-readings`: any other comparison, meaning one that serves views but no
     Before bins. Its words name which period has no readings, and never claim
     a period with bins is empty.

  Print the "half-hours read" count only for `before-only` and `paired`, and
  mount the chart in `mountComparisonChart` only for those two. No "Before ·
  unavailable" or "After · no readings yet" legend may appear where there is no
  curve. The active Trial and Focus arms in the same module pass live
  comparisons, and their paired and Before-only renders are unchanged.

  The printed premises (`premises.py` in this change) reach states 2 to 6 on
  committed cases:
  - c3-trial is paired;
  - c4-missing is before-only under `no_readable_period_evidence`;
  - c3-history's and c4-history's ended records are saved;
  - edit-chain is unavailable;
  - c4-history's open Trial is no-readings.
- [x] 2.2 Export one closed word table from `frontend/follow-up.js` for
  comparison availability reasons, as a function from a served code to plain
  words. Each code gets words with no underscore:
  - `missing_comparison_context`
  - `unsupported_retained_execution`
  - `missing_programmed_isf`
  - `no_source_evidence`
  - `change_predates_pin`
  - `missing_legacy_ending`
  - `data_not_yet_arrived`
  - `lever_unavailable`
  - `missing_continuous_setting_history`
  - `no_readable_period_evidence`
  - `unavailable_adherence`
  - `not_recorded`

  An unknown code prints verbatim. This table is the desk's single vocabulary
  for comparison reasons, and #426's `not_recorded` wording folds into it at
  integration.

  Route these three reason lines through it:
  - the figure's unavailable state;
  - `readinessSection`'s two availability lines (`data-availability` and
    `data-readiness-state="unavailable"`);
  - `history.js`'s Reassessment "Result" line (`data-reassessment-state`),
    which prints `Unavailable · <code>` today.

  Leave `history.js`'s saved-ending assessment line and the per-arm readiness
  reasons as they are.
- [x] 2.3 With no comparison (`null`):
  - `periodsSection` and `outcomesTable` say no comparison has been read for
    this record, in the words `readinessSection` already uses for that state;
  - the record stage's instrument meta in `history.js` does not say "recomputed
    now";
  - on a record with no saved ending, the Reassessment part's Original line
    says the saved read carries no comparison until the change ends, instead of
    pointing at "the saved ending above".

  A served-unavailable comparison keeps today's periods and outcomes notes.
- [x] 2.4 Node tests in `frontend/follow-up.test.js`, one `evidenceFigure` case
  per state:
  - a `null` comparison (fail-first: today it reads "no clock envelope is
    retained");
  - `FOCUS_COMPARISON`, served `unavailable_adherence`, renders `paired` with
    its marks;
  - an early Trial served `no_readable_period_evidence` with Before bins only
    renders `before-only`;
  - a served-unavailable comparison with empty `views` renders `unavailable`
    and its reason words;
  - a live comparison with views but no bins renders `no-readings`;
  - a saved ending with periods renders `saved`.

  Keep the existing "no envelope at all" test as the saved case, calling it the
  way the record frame does.

  Also cover:
  - every word-table entry carries no underscore, and
    `missing_continuous_setting_history` names continuous setting history;
  - the null-comparison periods and outcomes notes;
  - in `frontend/history.test.js`, the Original line for an open and an ended
    record, and the Reassessment Result line printing words for a served code.
    The current-policy case that expects `Unavailable · data_not_yet_arrived`
    moves to the words.

## 3. "First seen" names when Harmonic recorded the change (desk)

- [x] 3.1 In `frontend/history.js` `originalSection`, relabel the "First seen"
  row "Recorded by Harmonic". Its value, `context.captured_at`, is when Harmonic
  first recorded the change, and every change found in one reconcile pass
  shares it. The stage's "Detected" stays the pump transition. Do not touch the
  unavailable-reason line or the Focus "What changed" line; #426 owns both.
- [x] 3.2 A `frontend/history.test.js` case: a first-observed context prints
  "Recorded by Harmonic" with its capture stamp and no "First seen".

## 4. Behavior ledger and replay (desk contract)

Ledger rule for every task below: never rewrite, re-date or replace an existing
`★ FROZEN` block, the header's inventory line or any existing story entry.
Record this change's amendments and new stories in one new dated section,
`## #430 amendment — 2026-09-23`, appended after the existing amendment
sections on the #413/#414 pattern, and carrying the sanction line above. In
that section, name an amended story in prose ("S112 now …"). Never start a
second line with `S112 · ` or `S49 · `, because `inventory()` rejects duplicate
story IDs.

Replay rule: no replay module (`frontend/c3.replay.mjs`,
`frontend/c4.replay.mjs`, `frontend/desk-behavior.replay.mjs`,
`frontend/replay-cases.mjs`) statically imports task 2.2's new export. Task 5.2
lays this branch's harness over base a4d374a7, whose `follow-up.js` lacks it,
and a missing named import fails the whole replay at module link, before any
feature assertion. Each story asserts its reason words through the rendered
page instead.

- [x] 4.1 In the #430 amendment section, record that S112's retained read now
  follows the record read with no Retained-context press. Its data stays
  edit-chain, whose open records serve an unavailable retained comparison. In
  `frontend/c4.replay.mjs` `C4_STORIES.S112`:
  1. hold the record read and read "Reading change records";
  2. install the reassessment hold before releasing the record hold;
  3. read "Computing reassessment" with no control pressed;
  4. release it, then wait for `[data-reassessment-context="retained"]`.

  Update S112's fake-page test in `frontend/c4.replay.test.js` so releasing
  the record read fires the retained read.
- [x] 4.2 Add S142 on c3-trial: from the Changes roster, open the still-open
  record. With no assessment control pressed, a request carries
  `assessment=retained`, and the stage shows:
  - `[data-period="before"]` and `[data-period="after"]`;
  - `[data-figure-state="paired"]` with a mounted chart;
  - Retained context pressed;
  - `[data-unavailable="ending"]`.

  Add S143 on edit-chain: open a still-open record, and read its served reason
  code from the API. Assert that:
  - the figure shows `[data-figure-state="unavailable"]`;
  - the figure's reason text is non-empty, does not contain the served code,
    and equals the reason text after "Unavailable · " on the Reassessment
    Result line;
  - no chart is mounted;
  - none of "no clock envelope is retained", "no readings yet" or "0 → 0
    half-hours read" appears on the stage.

  For both stories:
  - write their `S142 · ` and `S143 · ` entries, as app-opener-only and lock
    HV2-28, plus handler-inventory rows, inside the #430 amendment section;
  - add `appOnly` registrations and `REGISTRY` entries in
    `frontend/desk-behavior.replay.mjs`;
  - add `STORY_CASES` entries in `frontend/replay-cases.mjs`;
  - add `C4_STORIES` bodies in `frontend/c4.replay.mjs`;
  - add node regression tests in `frontend/c4.replay.test.js`: the
    registration and case, a passing fake page, and one fake page failing each
    story's feature assertion.
- [x] 4.3 Move the pinned inventory literals to 149 issued · 130 active · 19
  retired on this branch, so this change's own tests pass:
  - `mockups/sweep/harmonic-v2-desktop/acceptance.py` `inventory()`;
  - `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`: the replay-plan
    count, the stated-inventory case and the same-total case.

  Leave these alone; the coordinator writes them once on the integration
  branch:
  - the ledger header's inventory line;
  - `ACCEPTANCE.md`'s count sentence;
  - `mockups/INDEX.md`'s row, which quotes the #413 re-freeze figures;
  - the single release freeze block.
- [x] 4.4 Re-read for intent every other desk replay and test that opens a
  record or reads the figure. Record in the #430 amendment section that each
  one keeps its subject, or how it was amended:
  - S96 and S105, which open ended records;
  - S110, which opens an open edit-chain record and waits for the original
    part;
  - the c4 `retained()` helper used by S91 and the readiness stories;
  - S49: its c4 part opens c4-missing's open Trial through `retained()` and
    asserts the served reason code appears in `.gf-reading`. Amend that
    assertion. The served code (read from the API, as today) must not appear
    in `.gf-reading`. The reason text after "Unavailable · " on the
    Reassessment Result line must be non-empty and must also appear in the
    readiness availability line. The story's text is unchanged, and it
    imports nothing new;
  - S50, both the c3 body and the desk replay's own: it pins the active Trial
    legend, "Trial above Before" or "no Trial readings to compare yet", which
    task 2.1 keeps for `paired` and `before-only`;
  - R18: it opens c4-history's first Trial and first Focus by address and
    waits up to 30 s for the original part. The Trial is open, so it now also
    makes the retained read, which is unavailable with views and no bins, so
    no-readings. The Focus is ended;
  - the desk browser suite's expired-record test, whose saved ending is a bare
    unavailable assessment, so unavailable.

## 5. Verification and evidence

- [x] 5.1 Tick this task on exactly these commands, each exiting 0:
  - `npm ci && npm run build`;
  - `uv run python -m pytest`;
  - `node --test 'frontend/**/*.test.js'`;
  - `npx --yes @fission-ai/openspec@1 validate --all --strict`;
  - `python3 scripts/check_adr_numbers.py`,
    `python3 scripts/check_owned_identifiers.py` and
    `python3 scripts/check_public_allowlist.py`;
  - `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py ReplayPlanTest InventoryProofTest SmokeSelectionTest`.

  No generator, committed fixture or extracted source is in this change's diff,
  so the AGENTS.md drift checks are left to the coordinator's integration run.
- [x] 5.2 The coordinator owns every port-bound leg and ticks this task with
  its evidence; the implementer runs none.
  1. On base a4d374a7, served from a second worktree with this branch's replay
     harness laid over it, S112 (amended), S142 and S143 each fail at their
     feature assertion, and the amended S49 fails at its words assertion. On
     the branch, each passes. Both runs at 1280x720 and 1440x900:
     `PLAYWRIGHT_MODULE=<playwright> TARGET=app VIEWPORT=<size> ONLY=S49,S112,S142,S143 CASE_STORE_DIR=<scratch> node frontend/desk-behavior.replay.mjs`.
  2. Then, at one size, `ONLY=S50,S91,S96,S105,S110,R18`.
  3. Then the desk and follow-up browser suites once, the full
     `acceptance.test.py` once (its `ServerLifecycleTest` binds a port), and
     the complete ledger once on the pushed commit.
- [x] 5.3 The coordinator owns the synthetic before and after renders, and
  ticks this task with them. Render both sizes of:
  - the open c3-trial record;
  - the unavailable edit-chain record;
  - the ended c3-history record.

  Keep them with the release evidence.
