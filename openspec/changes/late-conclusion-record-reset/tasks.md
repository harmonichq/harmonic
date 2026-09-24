# #452 implementation checklist

Sanction for the shipped-surface revision, the added story and the ledger
amendment below: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out
yourself from here"); coordinator ruling R452, with its triage rulings Q1 (add
S180) and Q2 (reopening the same record from the roster starts empty).

Comments in shipping files (`frontend/history.js`, `frontend/c4.replay.mjs`,
`frontend/c4.replay.test.js`, `frontend/follow-up-lifecycle.test.js`,
`frontend/desk-behavior.replay.mjs`, `frontend/replay-cases.mjs`) cite ADRs by
number only. They name no `docs/scope/`, `mockups/` or `openspec/changes/` path:
the public-links check fails on a comment that points at a file the public tree
excludes.

## 1. One place clears everything held for the open record (desk)

- [x] 1.1 In `frontend/history.js`, make one function the only writer of
  `memory.open`. Given the next identity (`{ kind, id }` or none), it:
  - sets `memory.open`;
  - clears `mode`, `record` and `error`;
  - sets `loading` to null and bumps `readGeneration`, so a read made for the
    record being left cannot land on the next one;
  - clears the later-conclusion `conclusion`, `conclusionFailure` and
    `conclusionAttempt`.

  `openRecord` calls it on every open, and still drops `memory.roster` so the
  roster re-reads. `closeRecord` calls it with none. `mount` calls it only when
  the address names a different record than `memory.open` (the existing
  comparison). Call it before `navigate`, which renders synchronously. Delete
  the separate resets now in `openRecord`, `closeRecord` and `mount`'s
  different-record branch, so no second assignment of any of those fields on an
  identity change remains in the file.

  Keep unchanged:
  - the successful-save clear in `submitLateConclusion`;
  - ADR 430's `memory.failed = null` in `loadRecord`;
  - the retry re-read in `submitLateConclusion`;
  - the `#late-conclusion-conclusion` input binding;
  - the Day door (`[data-day-date]`);
  - the assessment and reassessment-retry bindings.

  Delete the `selectedRecord` export and its line in the module's
  published-interface header comment: nothing in the tree imports it.

  No other file changes behavior.
- [x] 1.2 Rewrite the page-memory comment above `memory`, and the doc comments on
  `openRecord` and `closeRecord`, to state the identity rule once. Name ADR 452
  beside ADR 430's existing note. Every other comment that describes when these
  fields clear must match the code.
- [x] 1.3 Coordinator-authorized widening, 2026-09-23 (Q3 delegation; #452 code
  review round 1, finding F1). This lifts 1.1's "keep unchanged" for exactly
  the later-conclusion save's writes after its awaits (ADR 452, decision 7).
  - `submitLateConclusion` captures `memory.open`, the object `setOpenRecord`
    installed, when the save starts.
  - After the retry re-read and after the conclude request, success or failure
    alike, it writes nothing if `memory.open` is no longer that object: no
    re-read result, no request id, no failure, no focus target, no success
    clear and no render.
  - `setOpenRecord`'s doc comment and the page-memory comment say so.
  - Otherwise the successful-save clear, the retry re-read and the request-id
    rule are unchanged.

## 2. Node tests through the roster press (desk)

- [x] 2.1 In `frontend/follow-up-lifecycle.test.js`, add tests on the #430 host
  fake (`host()`, `seat.records`, `seat.recordClose`, `openHistoryRecord`). Give
  the router a window fake, as the existing "a failed retained read stays with
  its record" test does, so Back to records and a roster press write the
  address. Set `expired = true` so every selected read serves an
  `expired_unreviewed` ending with `late_conclusion: { state: 'unavailable' }`.
  - (a) Different record. Open expired Trial A and type in its Later conclusion.
    With `fail = true`, record it. A re-mount shows "Recording the later
    conclusion failed" (premise). Press Back to records, mount the roster, and
    press B's roster row. Once B renders its form, assert that:
    - B's HTML contains neither A's words nor "Recording the later conclusion
      failed";
    - B's submit is disabled.

    Then set `fail = false`, type on B and record. Assert that:
    - the last `/conclusion` POST targets `/trials/<B>/conclusion`;
    - its `request_id` differs from A's failed POST's `request_id`;
    - no `selected=<B>` GET is made between the typing on B and that POST (a
      first save, not a retry).
  - (b) Same record. Type on expired Trial A without recording. Press Back to
    records and press A's roster row again. Assert that A's form no longer
    contains the typed words.
  - Each test restores `expired`, `fail`, `lateConclusion` and
    `globalThis.window` in its `finally`. Before restoring the window, it resets
    the router with `navigate('diagnose')` imported from `./routes.js`.
  - Run (a) and (b) against the unmodified `history.js` first and see both fail
    at their feature assertions. Then implement task 1.1.
  - Keep every existing test in the file passing, in particular:
    - "an exact expired Trial records a later conclusion…": the same record's
      failed save and Retry send one request id and keep the words;
    - #430's "a failed retained read stays with its record…".
- [x] 2.2 Coordinator-authorized widening, 2026-09-23 (Q3 delegation; coordinator
  ruling on a finding from this ticket's start): #430's "a failed retained read
  stays with its record…" test in `frontend/follow-up-lifecycle.test.js` now
  resets the router with `navigate('diagnose')` in its `finally`, before it
  restores `globalThis.window`. Before this, its roster presses left the
  router's module state on Changes for every later test in the file.
  `navigate` is imported once, beside the file's other dynamic imports, and
  every test in the file that navigates shares that import.
- [x] 2.3 Coordinator-authorized widening, 2026-09-23 (with 1.3). The fetch stub
  in `frontend/follow-up-lifecycle.test.js` gains a one-shot hold
  (`holdNext`). Three tests, each seen failing first on `560098de` at its
  feature assertion, cover the variants the review reproduced:
  - (1) Retry in flight, then Back to records, then open B. B's form is empty
    with no failure, the abandoned retry sends nothing, and B's first save is a
    first save with a request id of its own.
  - (2) A's first save fails after the switch. B shows no failure, and B's first
    save is a first save with a fresh id.
  - (3) A's first save succeeds after the switch. B's typed draft survives.

  Each test resets the router with `navigate('diagnose')` in its `finally`,
  through `onExpiredRoster`.

## 3. Replay story S180 (desk)

The spike `docs/scope/452-late-conclusion-s180.spike.mjs`, committed with this
change, holds the story body, its fake page and its four node tests. It runs
with `node --test docs/scope/452-late-conclusion-s180.spike.mjs`.

- [x] 3.1 Add `async S180(page)` to `C4_STORIES` in `frontend/c4.replay.mjs`,
  ported from the spike's `S180`. Use the module's own `read` helper, and keep
  the spike's steps, selectors, routed refusal and failure messages. Prefix it
  with a `// #452` comment in the style of the #430 stories. The body names no
  case store: it runs on its mapped store.
- [x] 3.2 Register it in `frontend/desk-behavior.replay.mjs`:
  - a `// STORY:harmonic-v2-desktop:S180` tag;
  - `export const S180 = appOnly('HV2-28', '#452 a reopened record starts its later conclusion empty with a request id of its own', C4_STORIES.S180);`
  - `['S180', S180, J()]` in `REGISTRY`, after the last C4 record entry.

  In `frontend/replay-cases.mjs`, map `S180: 'c4-isf'` in `STORY_CASES`.
- [x] 3.3 In `frontend/c4.replay.test.js`:
  - port the spike's fake page and its four tests. One passes against a
    record that clears on reopen. Three fail at the feature assertions on the
    typed words, the carried failure and the reused request id.
  - add a uniqueness test in the form of "S142 and S143 are unique app-only C4
    record stories…": S180 is registered once, its `deferred.term` is `HV2-28`,
    and `storyCase('S180')` is `c4-isf`.
- [x] 3.4 Move the inventory literals from 171 issued · 152 active to 172 issued ·
  153 active, with 19 retired unchanged:
  - `mockups/sweep/harmonic-v2-desktop/acceptance.py`: `inventory()`'s required
    counts;
  - `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`: the replay-plan
    count; `test_stated_active_and_retired_inventory`'s range, to S1–S153; and
    `test_same_total_cannot_hide_changed_active_retired_counts`, whose ids
    become S1–S154 plus R1–R18, with the length assertion at 172.

  `SMOKE_STORIES` and its digest do not move. S91 already covers c4-isf, which
  a smoke selection on base confirmed. `SmokeSelectionTest` must stay green
  with S180 in the registry.

## 4. The ledger records the change (desk)

- [x] 4.1 Append a section headed `## #452 amendment — 2026-09-23, issue #452` to
  the end of `mockups/harmonic-v2-desktop.behavior.md`. It carries:
  - the sanction line above, quoted;
  - base `b03431d2b937b46bdabbb2de1e6ba0ba6c6b57b1`;
  - the changed behavior, in prose. A record's Later conclusion text, failed
    save and request id belong to that record. Opening another record or
    leaving for the roster starts the next one empty, including a reopen of the
    same record from the roster. A re-render of the same record, including a
    Day return, keeps them for Retry.
  - the added story as a fenced entry in S142's form, beginning `S180 · `.
    - Its statement: reopening an expired Trial from the Changes roster, after
      its later conclusion was typed and its save failed, starts with an empty
      Later conclusion form and no failure, and the next save sends a request
      id of its own.
    - `element`: the roster row, `#late-conclusion-conclusion`,
      `[data-form="late-conclusion"]`, `[data-save-error="conclude"]`,
      `[data-record-close]` and `[data-late-conclusion="available"]`.
    - `source`: `frontend/history.js`.
    - `lock`: HV2-28; ADR 452.
    - `data`: c4-isf.
    - `evidence`: `C4_STORIES.S180`. It must say that the carry-over into a
      different record is proved at node level in
      `frontend/follow-up-lifecycle.test.js`, because no committed case store
      serves two expired Trials.
    - `status`: the coordinator's run, pending.
  - the regression stories replayed unchanged: S52, S53, S54b, S57, S92, S94,
    R17, S105, S110, S112, S142 and S143. S181 is unused.
  - a handler inventory table in the #430 amendment's form. Its rows are the
    Later conclusion text input, Record later conclusion and its Retry, and the
    later-conclusion clear on opening or leaving a record. Each row reads
    `frontend/history.js` and `S180`, with the two-record path noted as node
    test only (`frontend/follow-up-lifecycle.test.js`).

  Only the S180 entry's first line begins with a story id followed by ` ·`. Do
  not edit any ★ FROZEN block, the header's inventory line or a story body
  above the section. Run `python3 mockups/sweep/harmonic-v2-desktop/acceptance.py
  inventory --out <scratch dir>`. It must report 172 issued · 153 active · 19
  retired, with the registry and the ledger agreeing.

## 5. Verification

- [x] 5.1 Worker-run, in the ticket worktree, each exiting 0:
  `npm ci && npm run build`, `uv run python -m pytest` (once, at the end, with
  its wall time), `node --test 'frontend/**/*.test.js'`,
  `npx --yes @fission-ai/openspec@1 validate --all --strict`,
  `python3 scripts/check_adr_numbers.py`,
  `python3 scripts/check_owned_identifiers.py`,
  `python3 scripts/check_public_allowlist.py`,
  `python3 mockups/sweep/harmonic-v2-desktop/acceptance.py inventory --out <scratch dir>`, and
  `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py ReplayPlanTest InventoryProofTest SmokeSelectionTest`.
  The fast gate includes task 2.1's two new tests and task 3.3's five. The
  worker runs no server, browser suite or replay.
- [ ] 5.2 Coordinator-run, port-bound, one leg at a time. Each replay runs on the
  built app at 1280x720 and then 1440x900:
  `PLAYWRIGHT_MODULE=<module> TARGET=app VIEWPORT=<size> BASE_URL=http://127.0.0.1:8765 ONLY=<stories> CASE_STORE_DIR=<scratch> node frontend/desk-behavior.replay.mjs`.
  - S180 on base `b03431d2`, with the branch harness laid over it, must fail at
    "S180 reopening the record from the roster must start its later conclusion
    empty".
  - `ONLY=S180` on the branch: executed 1 · failed 0 · deferred 0 · selected 1.
  - `ONLY=S52,S53,S54b,S57,S92,S94,R17,S105,S110,S112,S142,S143` on the
    branch: executed 12 · failed 0 · deferred 0 · selected 12, the same as on
    base.
  - The desk browser suite's `--test-name-pattern='an expired Trial
    distinguishes its Later conclusion input'` (2 tests) passes unchanged.
  - The complete ledger runs once at integration.

  The coordinator records S180's results in its `status` line.
- [ ] 5.3 Coordinator-run revision evidence, into the release's private
  design-evidence record (not part of the public tree). On c4-isf, open the
  expired Trial from the roster, type a later conclusion, press Back to records
  and reopen it. Render the result at 1280x720 and 1440x900 on base and on the
  branch. Base shows the typed words; the branch shows an empty form.
