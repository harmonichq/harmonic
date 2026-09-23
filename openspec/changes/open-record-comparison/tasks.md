# #430 implementation checklist

The sanction for every copy change and ledger amendment below is the
operator's standing one for #430's checklist: Connor Griffin, 2026-09-23, "Q1 A,
Q2 A, defaults all fine, go". It approved "every change these 13 checklists
call for", with wording in CONTEXT.md terms.

## 1. An open record opens on its retained comparison (desk)

- [ ] 1.1 In `frontend/history.js`, make a newly opened record (roster press,
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
- [ ] 1.2 Loading text: while the record read is pending, the existing
  loading frame reads "Reading change records". Once the record read shows no
  saved ending and the retained read is pending, it reads "Computing
  reassessment". Render between the two reads so the second text actually
  shows.
- [ ] 1.3 Node tests through the record destination's public `mount` in
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

- [ ] 2.1 In `frontend/follow-up.js`, give `evidenceFigure` one
  `data-figure-state` attribute on the figure element, with these values:
  - `not-requested`: no comparison;
  - `unavailable`: the served `availability.state` is unavailable, or, for a
    saved ending assessment carrying no nested `availability`, its own
    top-level `state`/`reason`. It names the reason through task 2.2's table;
  - `saved`: the caller says the comparison is a saved ending snapshot. The
    record frame knows this as `shownComparison(...).source === 'ending'`. This
    is the only state that keeps "no clock envelope is retained for this
    record";
  - `no-readings`: a live, available comparison with no clock bins on either
    side;
  - `before-only`: keep "no Trial readings to compare yet", or the Focus
    wording;
  - `paired`: unchanged.

  Print the "half-hours read" count only for `before-only` and `paired`, and
  mount the chart in `mountComparisonChart` only for those two. No "Before ·
  unavailable" or "After · no readings yet" legend may appear where there is no
  curve. The active Trial and Focus arms in the same module pass live
  comparisons; their paired and Before-only renders are unchanged.
- [ ] 2.2 Add one closed word table in `frontend/follow-up.js` for comparison
  availability reasons. Each served code gets plain words with no underscore:
  - `missing_comparison_context`
  - `unsupported_retained_execution`
  - `missing_programmed_isf`
  - `no_source_evidence`
  - `change_predates_pin`
  - `missing_legacy_ending`
  - `data_not_yet_arrived`
  - `lever_unavailable`
  - `missing_continuous_setting_history`
  - `not_recorded`

  An unknown code prints verbatim. Use the table in the figure's unavailable
  state and in `readinessSection`'s two availability lines (`data-availability`
  and `data-readiness-state="unavailable"`). Leave `history.js`'s
  ending-assessment line and reassessment-result line as they are.
- [ ] 2.3 With no comparison (`null`):
  - `periodsSection` and `outcomesTable` say no comparison has been read for
    this record, in the words `readinessSection` already uses for that state;
  - the record stage's instrument meta in `history.js` does not say "recomputed
    now";
  - on a record with no saved ending, the Reassessment part's Original line
    says the saved read carries no comparison until the change ends, instead of
    pointing at "the saved ending above".

  A served-unavailable comparison keeps today's periods and outcomes notes.
- [ ] 2.4 Node tests:
  - in `frontend/follow-up.test.js`, one `evidenceFigure` case per state,
    including a `null` comparison (fail-first: today it reads "no clock
    envelope is retained") and a served-unavailable comparison;
  - a test that every word-table entry carries no underscore, and that
    `missing_continuous_setting_history` names continuous setting history;
  - the null-comparison periods and outcomes notes;
  - in `frontend/history.test.js`, the Original line for an open record and for
    an ended record.

  Keep the existing "no envelope at all" test as the saved-state case, calling
  it the way the record frame does.

## 3. "First seen" names when Harmonic recorded the change (desk)

- [ ] 3.1 In `frontend/history.js` `originalSection`, relabel the "First seen"
  row "Recorded by Harmonic". Its value, `context.captured_at`, is when Harmonic
  first recorded the change, and every change found in one reconcile pass
  shares it. The stage's "Detected" stays the pump transition. Do not touch the
  unavailable-reason line or the Focus "What changed" line; #426 owns both.
- [ ] 3.2 A `frontend/history.test.js` case: a first-observed context prints
  "Recorded by Harmonic" with its capture stamp and no "First seen".

## 4. Behavior ledger and replay (desk contract)

- [ ] 4.1 Amend S112 in `mockups/harmonic-v2-desktop.behavior.md`, under the
  frozen header, with the sanction line above. The retained read now follows
  the record read with no Retained-context press. Its data stays edit-chain,
  whose open records serve an unavailable retained comparison. In
  `frontend/c4.replay.mjs` `C4_STORIES.S112`:
  1. hold the record read and read "Reading change records";
  2. install the reassessment hold before releasing the record hold;
  3. read "Computing reassessment" with no control pressed;
  4. release it, then wait for `[data-reassessment-context="retained"]`.

  Update S112's fake-page test in `frontend/c4.replay.test.js` so releasing
  the record read fires the retained read.
- [ ] 4.2 Add S142 on c3-trial: from the Changes roster, open the still-open
  record. With no assessment control pressed, a request carries
  `assessment=retained`, and the stage shows:
  - `[data-period="before"]` and `[data-period="after"]`;
  - `[data-figure-state="paired"]` with a mounted chart;
  - Retained context pressed;
  - `[data-unavailable="ending"]`.

  Add S143 on edit-chain: open a still-open record. It shows
  `[data-figure-state="unavailable"]` naming the served reason in words, no
  mounted chart, and none of "no clock envelope is retained", "no readings yet"
  or "0 → 0 half-hours read" on the stage.

  For both stories:
  - write the ledger entries, as app-opener-only and lock HV2-28, plus
    handler-inventory rows;
  - add `appOnly` registrations and `REGISTRY` entries in
    `frontend/desk-behavior.replay.mjs`;
  - add `STORY_CASES` entries in `frontend/replay-cases.mjs`;
  - add `C4_STORIES` bodies in `frontend/c4.replay.mjs`;
  - add node regression tests in `frontend/c4.replay.test.js`: the
    registration and case, a passing fake page, and one fake page failing each
    story's feature assertion.
- [ ] 4.3 Move the ledger inventory to 149 issued · 130 active · 19 retired in
  every place it is stated. The coordinator reconciles totals across tickets on
  integration.
  - `mockups/sweep/harmonic-v2-desktop/acceptance.py` `inventory()`;
  - `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`: the replay-plan
    count, the stated-inventory case and the same-total case;
  - the ledger's re-freeze header;
  - `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md`;
  - `mockups/INDEX.md`'s Harmonic v2 desktop row.
- [ ] 4.4 Re-read for intent every other desk replay and test that opens a
  record, and record in the ledger amendment that each keeps its subject:
  - S96 and S105, which open ended records;
  - S110, which opens an open edit-chain record and waits for the original
    part;
  - the c4 `retained()` helper used by S91 and the readiness stories;
  - the desk browser suite's expired-record test.

## 5. Verification and evidence

- [ ] 5.1 Run the fast gate and guards:
  - `node --test 'frontend/**/*.test.js'`;
  - `npm ci && npm run build`, then `uv run python -m pytest`;
  - `npx --yes @fission-ai/openspec@1 validate --all --strict`;
  - `python3 scripts/check_adr_numbers.py`,
    `python3 scripts/check_owned_identifiers.py` and
    `python3 scripts/check_public_allowlist.py`;
  - every drift check `AGENTS.md` lists.

  This change moves no generator or fixture.
- [ ] 5.2 The coordinator owns every port-bound leg; the implementer runs none.
  1. On base a4d374a7, served from a second worktree with this branch's replay
     harness laid over it, S112 (amended), S142 and S143 each fail at their
     feature assertion. On the branch, each passes. Both runs at 1280x720 and
     1440x900:
     `PLAYWRIGHT_MODULE=<playwright> TARGET=app VIEWPORT=<size> ONLY=S112,S142,S143 CASE_STORE_DIR=<scratch> node frontend/desk-behavior.replay.mjs`.
  2. Then S96, S105, S110 and S91 at one size, the desk and follow-up browser
     suites once, and the complete ledger once on the pushed commit.
- [ ] 5.3 The coordinator owns the synthetic before and after renders, at both
  sizes, of:
  - the open c3-trial record;
  - the unavailable edit-chain record;
  - the ended c3-history record.

  Keep them with the release evidence.
