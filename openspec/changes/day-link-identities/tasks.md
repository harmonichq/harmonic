# #445 and #444 implementation checklist

Every task implements the surfaces requirements in this change's delta under
ADR 445 and ADR 444 in `design.md`. A checked item means implemented and
verified. Tests go through each module's public interface. Each new behavior
test fails first on the base (b03431d2) for the reason it names; a regression
pin that already passes on the base is labelled as one. Any node test that
navigates resets the router's module state with `navigate('diagnose')` in its
`finally`. The identity grammar and the two resolution rules are spiked in
`docs/scope/445-day-link-identities.spike.mjs`; the implementation places them
in the modules that render the controls and extracts nothing for testability
alone.

## 1. The address and Day's return

- [ ] 1.1 In `frontend/tab-routing.js`, drop `focus` from `CONTEXT_KEYS` and
  rewrite the comment above it to say a return target is named by identity
  (ADR 428, ADR 445 point 2). In `frontend/tab-routing.test.js`: an address
  carrying `focus=` parses with no `focus` key and serializes without it (fails
  first: the base keeps it); the HV2-14 round-trip case drops its `focus` and
  carries a utility identity subject (`question:low|2024-06-26 13:55:00`) with a
  title. In `frontend/diagnose-context.test.js`, the Day-return fixture that
  round-trips through the address drops its `focus` key. The case-address tests
  stay unchanged.
- [ ] 1.2 In `frontend/routes.js`, the `navigate()` comment names the contextual
  entry without `focus`. Comment only.
- [ ] 1.3 In `frontend/day.js` (ADR 445 point 3), `dayReturnTarget` no longer
  returns `focus`. The return control, for a utility origin, hands the utility
  its identity through `reopenUtility(kind, subject)` and navigates to the
  destination with no context. Every other origin is unchanged: it hands back the
  whole entry minus its memo key, and requests the reading heading, or the sheet
  toggle on the narrow desk. Rewrite the module comments that promise a return to
  "the exact target it left" by its focus. In `frontend/day.test.js`, through
  the Day destination (`installDay`, `startDesk`, a seat that exposes the return
  control):
  - a utility entry's Return leaves the address `/diagnose`, with no Day key,
    title or `from` (fails first: the base writes the utility entry into the
    Diagnose address);
  - a Changes entry's Return still hands back its date, occurrence and `from`;
  - `dayReturnTarget`'s expected object loses `focus`, and every fixture drops
    its `focus` and uses a utility identity subject.

## 2. The carb utilities

- [ ] 2.1 In `frontend/utilities.js`, each Open Day control declares its item's
  identity as the routing subject (`carb:<id>`, `question:<detector>|<anchor_t>`),
  and keeps its date, its printed title (`Log carbs · …`, `Carb questions · …`),
  `data-utility-from` and `data-utility-label`. It carries no `data-return-focus`,
  and its handler writes date, subject, title and `from`, with no `focus`.
- [ ] 2.2 `reopenUtility(kind, identity)` (ADR 445 points 4 and 5) holds the
  identity until the first seat at which the utility's items have loaded. It then
  matches the identity against the served items (a Carb log entry by id, a
  Carb-log prompt by detector and anchor time). A match requests focus on that
  item's own Open Day control, and no match requests the utility's heading. The
  request is made once. Selector text comes only from the matched item's own
  identity. The held identity is dropped when used, on Close, and when another
  utility opens. The request applies at every width.
- [ ] 2.3 #444 (ADR 444): `carbsBody()` builds its header from
  `formatWallClock(new Date())` (from `frontend/carb-log.js`), printed with
  `shortDate` and `clock`.
- [ ] 2.4 Tests in a new `frontend/utility-day-links.test.js`, which has its own
  desktop seat, stubbed carbs and prompts reads, and the desk's own router.
  `frontend/utilities.test.js` keeps its narrow desk.
  - Under `process.env.TZ = 'America/Denver'` with `mock.timers` at
    2024-06-30T04:45:05Z, the seated Log carbs header reads `at Jun 29 · 22:45`
    (fails first: the base reads `at Jun 30 · 22:45`). Restore TZ and the timers
    in `finally`.
  - Each utility's Open Day writes a Day address whose subject is the identity,
    whose title is the printed label and which has no `focus` (fails first).
  - After `reopenUtility` with a served identity, the render that seats the
    loaded utility requests that item's Open Day control first and the utility
    heading second (fails first: the base takes no identity).
  - An unserved identity, an old link's display-text subject and a crafted value
    request only the heading, and a later render makes no second request.

  In `frontend/utilities.test.js`, the source-reading pin "a utility Open Day
  names no precise return target" becomes one asserting each Open Day declares
  an identity subject and no `data-return-focus`.

## 3. Changes

- [ ] 3.1 The Day links in `frontend/follow-up.js` and `frontend/history.js` drop
  `focus`. Their date, subject, title, lever, occurrence, window and `from` are
  unchanged.
- [ ] 3.2 One resolver beside `readinessArm` in `frontend/follow-up.js` (ADR 445
  points 4 and 5). It treats an arrival whose context came back from a Changes
  Day link (`from=changes` with a `date`) as a return. A well-formed ISO date
  resolves to that date's supporting-date control then the reading heading; any
  other date resolves to the reading heading alone. `mount` in `follow-up.js` and
  `mount` in `history.js` call it on the first render of such an arrival that
  shows the change's content (not a loading, failure or unavailable frame), once
  per arrival (by `deps.navigation`), and only when the desk is not narrow. They
  set the desk's focus request from its answer.
- [ ] 3.3 Tests in `frontend/follow-up-lifecycle.test.js`, through both mounts
  over the file's stubbed reads, with a comparison that lists contributing dates:
  - On a Day-return arrival naming a listed date, the content render requests
    that date's control first and the reading heading second (fails first: the
    base requests nothing).
  - The loading render requests nothing, and a second render of the same arrival
    requests nothing.
  - An arrival that is not a Day return requests nothing, and a malformed date
    requests only the heading.
  - Pressing a supporting date in each mount writes a Day address with the date
    and no `focus` (fails first).
  - Each test clears the desk's focus request and resets the router in `finally`.

## 4. Browser evidence and the behavior ledger

- [ ] 4.1 In `frontend/desk.browser.test.mjs`, extend "a utility's own Day entry
  keeps the utility open and returns into it":
  - the Day address has a `subject` beginning `question:` and no `focus`;
  - after Return to Carb questions, no `/api/analyze` request is made;
  - the utility is open, and `document.activeElement` is that prompt's Open Day
    control;
  - the Diagnose address carries no `title`, `from` or `focus`.

  On the base it fails at the Day-address assertion. The canonical-door test,
  which still opens a legacy address carrying `focus=`, stays unchanged and green.
- [ ] 4.2 Add four app-only stories to `mockups/harmonic-v2-desktop.behavior.md`
  in a new dated `## #445 amendment — 2026-09-23, issue #445` section, following
  the #428 amendment's shape. The section quotes the sanction line, names ADR 445
  and ADR 444, and lists the shipped behavior that changes with no story
  asserting the old fact (design.md, Revise lifecycle record). It says why the
  #444 header has no story. Each story carries a status line the coordinator fills
  from base-fails and branch-passes runs at 1280x720 and 1440x900.
  - **S162**, on `c3-trial`: a contributing date of the active Trial opens Day
    with an address that names the date and carries no CSS selector. Return to
    Changes lands focus on that date's control once the evidence has rendered.
  - **S163**, on `c3-trial`: the same from the Trial's change record, reached as
    S142 reaches it. The return reopens that record and lands focus on the date's
    control.
  - **S164**, on the showcase: a Log carbs entry's Open Day writes a Day address
    whose subject names the entry by id, with the printed title and no selector;
    the story logs an entry first when none is served. Closing the utility and
    pressing Return to Log carbs reopens Log carbs over Diagnose, with focus on
    that entry's Open Day control.
  - **S165**, on the showcase: over a drilled Finding case with a window pressed
    (S137's path), Carb questions' Open Day, Close, then Return to Carb
    questions. Exactly one `GET /api/status` and nothing else is issued. The case
    and window are unchanged, Carb questions is open with focus on that prompt's
    Open Day control, and the address names the retained case with no `title`,
    `from` or `focus`.

  Never rewrite, re-date or replace an existing `★ FROZEN` block, and leave the
  header's inventory line and `ACCEPTANCE.md` alone.
- [ ] 4.3 Replay:
  - `C4_STORIES.S162`–`S165` go in `frontend/c4.replay.mjs`, reusing
    `openStillOpenRecord430`, `heldCaseThroughDay428`, `heldReturnToDiagnose414`
    and `heldStatusReturn` where they fit;
  - `appOnly` exports and REGISTRY rows go in `frontend/desk-behavior.replay.mjs`;
  - `S162` and `S163` map to `c3-trial` in `STORY_CASES` in
    `frontend/replay-cases.mjs`, and S164 and S165 take the default showcase;
  - a uniqueness-and-case test for S162–S165 goes in
    `frontend/c4.replay.test.js`, beside the other releases' tests.

  `SMOKE_STORIES` does not change, because S7 already covers `c3-trial` and many
  smoke stories cover the showcase.
- [ ] 4.4 Move the pinned inventory literals so this branch's own tests pass:
  - `inventory()` in `mockups/sweep/harmonic-v2-desktop/acceptance.py` becomes
    `{"issued": 175, "active": 156, "retired": 19}`;
  - in `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`, the plan count
    becomes 175, the stated-inventory case S1–S156 with R1–R19, and the
    same-total case S1–S157 with R1–R18.

  Run the port-free `acceptance.py inventory` and the port-free test classes
  (`ReplayPlanTest InventoryProofTest SmokeSelectionTest`).
- [ ] 4.5 Browser legs, each run once and serially by whoever can bind a port:
  - the extended desk test by its name pattern (branch: tests 1, pass 1; base:
    tests 1, fail 1), then the whole desk suite (branch: every test passes);
  - `ONLY=S162,S163,S164,S165,S7,S54b,S60,S61,S62,S72b,S76,S108,S133,S136,S137,S138,S142`
    on the bare replay at both sizes, first on a base worktree with the new
    stories laid over it (17 selected: 13 pass, 4 fail — S162, S163, S164 and
    S165, each at its feature assertion), then on the branch (17 selected, 17
    pass, 0 fail);
  - the complete ledger through `acceptance.py replay` at both sizes, on the
    commit to be integrated (0 failed, S162–S165 among those executed).
