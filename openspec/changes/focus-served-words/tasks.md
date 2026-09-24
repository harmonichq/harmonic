# #449 + #450 implementation checklist

Every test below runs on synthetic payloads or manufactured stores. "Fails
first" means the new assertion is run against the base renderer or read and
seen failing for the stated reason before the change makes it pass. ADR 449 and
ADR 450 in `design.md` carry the decisions, the words and the enumerated codes;
tasks 1.2 and 3.5 follow the Q3 default and task 2.3 the Q1 default.

## 1. Served names and refusal sentences (backend)

- [ ] 1.1 Serve `lever_title` on the selected Focus detail
  (`ciq_autotune/watched_change.py`, `review_trials`' Focus branch):
  `_focus_meta(record["lever"])[0]`, or null when the stored lever is neither a
  Lever nor the override. Roster rows are unchanged. Test in
  `tests/test_durable_follow_up.py` through `GET /api/verify/trials?kind=focus&selected=…`
  on synthetic Focus records pinned the way the QA recipes pin them: each lever
  in `pinnable_levers()` pinned alone serves its `levers.title`, or
  `OVERRIDE_TITLE` for the override; Pattern Focuses on `highs_after_meals`
  watching `high_carb_sequence` and `repeat_eating` serve "High-carb sequence"
  and "Repeat eating" while their `title` stays "Highs after meals"; a stored
  lever outside the set serves null and the read still answers; no served name
  contains an underscore; no roster row carries `lever_title`. Fails first on
  the base (the key is absent).
- [ ] 1.2 Serve a sentence beside the code on the durable lifecycle 409
  (`ciq_autotune/api.py`, the handler that builds
  `{"code": getattr(error, "reason", "lifecycle_conflict"), **current}`):
  `message` from a closed module-level table in `api.py` holding ADR 450's
  refusal sentences for all 22 codes, the code itself for an unknown code. The
  non-durable string detail is unchanged. Tests in
  `tests/test_durable_follow_up.py`: (a) a durable Focus resolve with a stale
  `input_revision` answers 409 with `detail.code` `stale_input_revision`, that
  code's sentence as `detail.message`, and `detail.admission` and
  `detail.input_revision` still served; (b) a completeness test that
  enumerates the codes from their producers, never from a list in the test or
  the ADR: it scans every module under `ciq_autotune/` with the scan committed
  in this change's `refusals.py` (every `FollowUpConflict(` call, a string
  literal code in either quote style, plus the handler's `getattr` default),
  asserts every raise site passes a literal, and asserts every code found has a
  non-empty table message with no underscore. On the base the scan finds 32
  literal raise sites and 22 codes. Both fail first on the base (no message is
  served; the table does not exist).

## 2. The desk names the watched behavior

- [ ] 2.1 The Observed behavior row prints the served name
  (`frontend/follow-up.js`): `adherenceTable` and `comparisonTables` take the
  name from their caller; the active Focus frame passes its detail's
  `lever_title`, and `frontend/history.js`'s record frame passes the record's.
  A null or absent name reads "Watched behavior". `LEVER_NAME` is deleted.
  Tests in `frontend/follow-up.test.js`: a `high_carb_sequence` arm given the
  served "High-carb sequence" names it and the table has no underscore token; a
  `correction_stacking` arm given "Correction stacking" names it and "Stacked
  corrections" is absent; an arm given no name reads "Watched behavior" and the
  key is absent. Fails first on the base.
- [ ] 2.2 "What this Focus watches" prints the served name when the retained
  context carries no explanation, keeping today's skip when the explanation
  equals the title; a null name omits the paragraph. Test through `mount` in
  `frontend/follow-up-lifecycle.test.js`: an active Focus whose served detail
  carries `lever: 'repeat_eating'`, `lever_title: 'Repeat eating'` and a
  retained comparison with Observed behavior rows prints "Repeat eating" in the
  intent section and the behavior row and no `repeat_eating` in visible text.
  Fails first on the base.
- [ ] 2.3 A Focus record's "What changed" (`frontend/history.js`,
  `changeSection`) names the intended behavior by the served `lever_title`; a
  null name reads "The behavior this Focus watched is no longer an offered
  lever." Tests in `frontend/history.test.js`: the existing Focus variant is
  reworded to a detail with a Pattern `title` and a `lever_title` and expects
  the `lever_title`, not the title; a null variant names neither the key nor
  "Focus" as the behavior. Fails first on the base.

## 3. Served codes print in words

- [ ] 3.1 `COMPARISON_REASON` (`frontend/follow-up.js`) gains the thirteen
  codes and words in ADR 450's vocabulary table, including #442's
  `context_after_ending`, which no producer on this branch serves yet.
  `REASON_CODES` in `frontend/follow-up.test.js` gains them, and the existing
  vocabulary test keeps asserting words of their own with no underscore and an
  unknown code printed as served. A `frontend/history.test.js` case renders a
  saved ending unavailable with `context_after_ending` and expects its words and
  no underscore token. Fails first on the base for the new codes.
- [ ] 3.2 Route the enumerated lines through `comparisonReasonWords`: the saved
  ending assessment (`endingSection`); the Observed behavior and Attributed harm
  cells (`adherenceTable`); every arm's "Not met" line, the setting arm's
  unavailable-evidence line and the Pattern opportunity line's reason
  (`readinessArm`); the unreconciled admission line (`mount`). Tests:
  `frontend/history.test.js`'s ending expectation (today
  `Unavailable · unavailable_adherence`) expects the words and no underscore
  token in the ending section; `frontend/follow-up.test.js` covers the behavior
  cell for each of the five measurement codes with its "x of y measured" kept,
  the harm cell for `unreadable_harm_interval` and `zero_opportunities`, the
  "Not met" line for `collecting`, `zero_opportunities`, a measurement code and
  `unmatchable_captured_membership`, the unavailable-evidence line, and the
  Pattern line's reason; `frontend/follow-up-lifecycle.test.js` covers the
  admission line through `mount` with admission unavailable for
  `reconciliation_required`. The raw expectations in `frontend/follow-up.test.js`
  (`Not met — collecting.`, `Not met — unmatchable_captured_membership.`,
  `unavailable: unmatchable_captured_membership`,
  `insufficient_measurement · 0 of 1 measured`) are reworded; the harm test's
  `partial_tail`, which no producer serves, keeps printing as served. Each new
  expectation fails first on the base.
- [ ] 3.3 States, verdicts, modes and the denominator print as words:
  `frontend/follow-up.js` publishes its state words for `frontend/history.js`,
  which prints the saved ending's "Recorded · <state>" and the reassessment
  result through them; the reassessment heading names its mode by its segment
  label; the Pattern opportunity verdict prints Ready or Withheld;
  `correction_clusters` prints "correction clusters" in the behavior row, its
  cells and the readiness figure. Data attributes keep the served values. Tests
  in `frontend/history.test.js` ("Recorded · Concerning"; a current-policy
  result "Context only" under a "Current policy" heading, with
  `data-reassessment-state` and `data-reassessment-context` unchanged) and
  `frontend/follow-up.test.js` (both verdicts with `data-opportunity-verdict`
  unchanged; the denominator in the table and a readiness arm). Fails first on
  the base.
- [ ] 3.4 The Focus entry's withheld copy (`frontend/focus-entry.js`, `mount`)
  prints `admissionReason(reason).said` for a served `focus_pin.reason`; an
  absent reason keeps today's sentence. `frontend/guidance.js`'s `REASON_SAID`
  gains `pending_plan` with ADR 450's sentence. A reason `admissionReason` does
  not know reads as its existing generic sentence, the one stated exception in
  ADR 450. Test in `frontend/focus-entry.test.js` through `mount` for
  `pending_plan` and `reconciliation_required`: the copy states the reason and
  the code is absent. Trap: `frontend/data.js` builds its default client at
  import (`makeDeps()` at data.js:579) and captures `globalThis.fetch` then, so
  the module-level entry `mount` uses only sees a fetch stub installed before
  `focus-entry.js` is first imported; the test file installs its stub first and
  imports the module dynamically, as `frontend/follow-up-lifecycle.test.js`
  does. Fails first on the base.
- [ ] 3.5 The Trial finish, Focus resolve and later-conclusion failure lines
  (`frontend/follow-up.js`, `frontend/history.js`) print the served refusal
  message (`error.message`) and never `<code> (<status>)`; the two modules share
  one failure-message helper rather than two copies. The Plan and Focus-pin
  failure lines already print `error.message`, which `ApiTransportError` takes
  from a served `message` (pinned by the existing `frontend/data.test.js` case
  that asserts `error.message` equals `detail.message`), so task 1.2 alone
  ends their "[object Object]" and neither module changes. The Focus pin failure
  line (`frontend/focus-entry.js` `mount`, "Starting the Focus failed:
  <message>. No successful pin was confirmed.") strips one trailing full stop
  from the message before appending its own. Tests: the
  `frontend/follow-up.test.js` save-error case (today expecting
  `stale_input_revision (409)`) expects a served message and neither the code
  nor "(409)"; a finish refused through `mount` in
  `frontend/follow-up-lifecycle.test.js` with a 409 detail carrying `code` and
  `message` prints the message only; the later-conclusion test in
  `frontend/follow-up-lifecycle.test.js` ("an exact expired Trial records a
  later conclusion…") has its refused conclusion POST answered 409 with a detail
  carrying `code` `stale_input_revision` and that code's message, and asserts
  the message prints and neither `stale_input_revision` nor "(409)" appears,
  through history.js's failure-message path; and a `frontend/focus-entry.test.js`
  case through `mount` whose pin is refused 409 with a message ending in a full
  stop prints the message once, one full stop before "No successful pin was
  confirmed.", and neither the code nor "(409)". Each fails first on the base.
  Keep the history.js and follow-up-lifecycle.test.js edits to the
  failure-message lines and that test's refusal: #452 rewrites the record's page
  memory in the same files.

## 4. Behavior ledger and replay

- [ ] 4.1 The c3 and c4 `readiness()` helpers (`frontend/c3.replay.mjs`,
  `frontend/c4.replay.mjs`) stop asserting that the raw served `arm.reason`
  appears: each arm's `[data-criterion]` line must be non-empty and must not
  read `Not met — <served reason>.`, and a Pattern arm's
  `[data-opportunity-verdict]` text must not be the bare served verdict. No
  replay module imports a follow-up renderer. This amends S46, S91, S92 and S93
  in replay only.
- [ ] 4.2 Add S173–S176 to `C4_STORIES` as `design.md` specifies, map them in
  `frontend/replay-cases.mjs` (S173 c3-focus, S174 c3-preempted, S175
  c4-history, S176 c3-preempted) and register them in
  `frontend/desk-behavior.replay.mjs`. Each reads the served name or code from
  the API and checks the rendered page. `frontend/c4.replay.test.js` gains
  fake-page tests, in the existing style, that show each new story failing at
  its feature assertion when the page prints the served code, the lever key or
  the Pattern title in place of the behavior.
- [ ] 4.3 Add the dated `## #449 amendment — 2026-09-23` section to
  `mockups/harmonic-v2-desktop.behavior.md`: the sanction line, safe start and
  base; the S173–S176 entries (element, source, lock, data, evidence, status
  owed to the coordinator's runs); `Amended S46 · 2026-09-23 · #449 / Q3
  delegation: …` lines for S46, S91, S92 and S93, never a second `S46 ·` line;
  and the handler inventory rows. No `★ FROZEN` block, header inventory line or
  ACCEPTANCE.md count changes. `acceptance.py` and `acceptance.test.py`
  inventory literals move to 175 issued · 156 active · 19 retired. The
  port-free `acceptance.py inventory --out <scratch>` and
  `acceptance.test.py ReplayPlanTest InventoryProofTest SmokeSelectionTest`
  pass.

## 5. Verification

- [ ] 5.1 The worker's gate: the lock's Verification command exits 0, and
  `uv run python mockups/harmonic-v2.exploration/generate.py --check` is green
  (regenerated on this branch and said so if the backend edit moved it).
- [ ] 5.2 Coordinator, port-bound: `ONLY=S46,S91,S92,S93,S173,S174,S175,S176`
  through `frontend/desk-behavior.replay.mjs` at 1280x720 and 1440x900 passes 8
  on the branch and fails each story at its feature assertion with the branch
  harness laid over the base; the follow-up and desk browser suites; the full
  ledger and the full `acceptance.test.py` once before the push.
- [ ] 5.3 Coordinator: before/after renders of c3-focus's active Focus,
  c3-preempted's manual-ended and `overnight_drift` records and c4-history's
  Focus record at both sizes, kept in a private design-evidence record that is
  not part of the public tree.
