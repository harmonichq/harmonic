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

- [x] 1.1 In `frontend/tab-routing.js`, drop `focus` from `CONTEXT_KEYS` and
  rewrite the comment above it to say a return target is named by identity
  (ADR 428, ADR 445 point 2). In `frontend/tab-routing.test.js`: an address
  carrying `focus=` parses with no `focus` key and serializes without it (fails
  first: the base keeps it); the HV2-14 round-trip case drops its `focus` and
  carries a utility identity subject (`question:low|2024-06-26 13:55:00`) with a
  title. In `frontend/diagnose-context.test.js`, the Day-return fixture that
  round-trips through the address drops its `focus` key. The case-address tests
  stay unchanged.
- [x] 1.2 In `frontend/routes.js`, the `navigate()` comment names the contextual
  entry without `focus`. Comment only.
- [x] 1.3 In `frontend/day.js` (ADR 445 point 3), `dayReturnTarget` no longer
  returns `focus`. The return control, for a utility origin, hands the utility
  its identity through `reopenUtility(kind, subject)`, makes no focus request of
  its own, and navigates to the destination with no context. Every other origin
  is unchanged: it hands back the
  whole entry minus its memo key, and requests the reading heading, or the sheet
  toggle on the narrow desk. Rewrite the module comments that promise a return to
  "the exact target it left" by its focus. In `frontend/day.test.js`, through
  the Day destination (`installDay`, `startDesk`, a seat that exposes the return
  control):
  - a utility entry's Return leaves the address `/diagnose`, with no Day key,
    title or `from` (fails first: the base writes the utility entry into the
    Diagnose address);
  - a `from=day.carbs` entry's Return leaves Day on the date the entry opened,
    with no "Opened from" section and no return control, and Log carbs seated
    (`seatedUtility()` reads `carbs`). This fails first: the base re-adopts the
    entry and offers the return again;
  - a Changes entry's Return still hands back its date, occurrence and `from`;
  - `dayReturnTarget`'s expected object loses `focus`, and every fixture drops
    its `focus` and uses a utility identity subject.
- [x] 1.4 Coordinator-authorized widening, 2026-09-23 (Q3 delegation; ADR 445
  point 8). `dayReturnTarget` in `frontend/day.js` reads `from=<destination>.<x>`
  as a utility return only when `UTILITY_TITLE` has `<x>` as its own key; any
  other `<x>` is a plain return to that destination, so no unknown utility is
  reopened for the seat layer to draw. In `frontend/day.test.js`, a crafted
  `from=diagnose.bogus` entry offers "Return to Diagnose", not "Return to
  bogus"; pressing it seats no utility, and the next seat step draws no pane and
  does not throw. This fails first: the base offers "Return to bogus", and its
  next render throws `BODIES[kind] is not a function`.
- [x] 1.5 Coordinator-authorized widening, 2026-09-23 (Q3 delegation; review
  round 1 finding F1; ADR 445 point 8). `dayReturnTarget` takes the destination
  only when `DESTINATION_LABEL` has it as its own key, and labels the return from
  that resolved destination, so a name every object inherits (`constructor`,
  `__proto__`) is never a destination: the return is a plain one to Diagnose
  with no label the address made up. In `frontend/day.test.js`, `from=constructor`
  and `from=__proto__` print "Opened from" Diagnose and "Return to Diagnose",
  with no "function …" and no "[object Object]". This fails first: the base
  printed "Opened from function Object() { [native code] }".

## 2. The carb utilities and the desk they return to

- [x] 2.1 In `frontend/utilities.js`, each Open Day control declares its item's
  identity as the routing subject (`carb:<id>`, `question:<detector>|<anchor_t>`),
  and keeps its date, its printed title (`Log carbs · …`, `Carb questions · …`),
  `data-utility-from` and `data-utility-label`. It carries no `data-return-focus`,
  and its handler writes date, subject, title and `from`, with no `focus`.
- [x] 2.2 `reopenUtility(kind, identity)` (ADR 445 points 4 and 5) holds the
  identity until the first seat at which the utility's items have loaded. It then
  matches the identity against the served items (a Carb log entry by id, a
  Carb-log prompt by detector and anchor time). A match requests focus on that
  item's own Open Day control, and no match requests the utility's heading. The
  request is made once. Selector text comes only from the matched item's own
  identity. The held identity is dropped when used, on Close, and when another
  utility opens. The request applies at every width.
- [x] 2.3 #444 (ADR 444): `carbsBody()` builds its header from
  `formatWallClock(new Date())` (from `frontend/carb-log.js`), printed with
  `shortDate` and `clock`.
- [x] 2.4 Tests in a new `frontend/utility-day-links.test.js`, which has its own
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
- [x] 2.5 A Diagnose rebuild takes no focus from a seated utility (ADR 445 point
  7, ruling r1-1(b)).
  - `frontend/utilities.js` exports `seatedUtility()`, the seated utility's kind
    or `null`, which task 1.3's Day test also reads.
  - `createDiagnoseDestination` in `frontend/diagnose.js` takes a seated-utility
    read as an option beside `api`, `createView` and `loadCase`, defaulting to
    `seatedUtility`.
  - `restoreEntry` sets its `#crumb-trail` focus default only while no utility is
    seated. Nothing else in Diagnose's focus handling changes: its other focus
    targets lie in the inspector, which a seated utility makes inert (ADR 445
    point 7).

  Tests in `frontend/diagnose.test.js`, through the public mount and return
  path, using the ADR 428 harness (`desk428`, `park`):
  - A drilled case with an Occurrence held is parked, the store's revision moves,
    a plain return re-reads, and the rebuild applies the payload. With a utility
    seated, the router's focus request is still unset after the rebuild. This
    fails first: the base sets `#crumb-trail`.
  - A regression pin, passing on the base: with no utility seated, the same path
    still sets `#crumb-trail`.
  - Each test clears the router's focus request in `finally`.

## 3. Changes

- [x] 3.1 The Day links in `frontend/follow-up.js` and `frontend/history.js` drop
  `focus`. Their date, subject, title, lever, occurrence, window and `from` are
  unchanged.
- [x] 3.2 One resolver beside `readinessArm` in `frontend/follow-up.js` (ADR 445
  points 4 and 5). It treats an arrival whose context came back from a Changes
  Day link (`from=changes` with a `date`) as a return. A well-formed ISO date
  resolves to that date's supporting-date control then the reading heading; any
  other date resolves to the reading heading alone. `mount` in `follow-up.js` and
  `mount` in `history.js` call it on the first render of such an arrival that
  shows the change's content (not a loading, failure or unavailable frame), once
  per arrival (by `deps.navigation`), and only when the desk is not narrow. They
  set the desk's focus request from its answer.
- [x] 3.3 Tests in `frontend/follow-up-lifecycle.test.js`, through both mounts
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

- [x] 4.1 In `frontend/desk.browser.test.mjs`, extend "a utility's own Day entry
  keeps the utility open and returns into it":
  - the Day address has a `subject` beginning `question:` and no `focus`;
  - after Return to Carb questions, no `/api/analyze` request is made;
  - the utility is open, and `document.activeElement` is that prompt's Open Day
    control;
  - the Diagnose address carries no `title`, `from` or `focus`.

  On the base it fails at the Day-address assertion. The canonical-door test,
  which still opens a legacy address carrying `focus=`, stays unchanged and green.
- [x] 4.2 Add four app-only stories to `mockups/harmonic-v2-desktop.behavior.md`
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
  - **S164**, on the showcase, with both return paths (ruling r1-1(c)):
    - **Setup.** Drill a Finding's case with an Occurrence held (as S138 does).
      Open Log carbs and log an entry at a time inside the showcase's recorded
      range, so its Day is a recorded day. Logging moves the store.
    - **Its Day address.** The entry's Open Day writes a Day address whose
      subject names the entry by id, with the printed title and no selector.
    - **The moved return.** Close the utility and press Return to Log carbs.
      Diagnose re-reads: at least one guidance read is issued. It restores the
      same Finding with the same Occurrence held. Log carbs is open over it, and
      once the restoration settles, focus is on that entry's Open Day control.
    - **The unmoved return.** Reload the case address, so Diagnose has read the
      moved store. Open Log carbs, open the same entry in Day, Close, then Return
      to Log carbs. Exactly one `GET /api/status` is issued and nothing else. The
      case is unchanged, focus is on that entry's Open Day control, and the
      address names the case with no `title`, `from` or `focus`.
  - **S165**, on the showcase: over a drilled Finding case with a window pressed
    (S137's path), Carb questions' Open Day, Close, then Return to Carb
    questions. Exactly one `GET /api/status` and nothing else is issued. The case
    and window are unchanged, Carb questions is open with focus on that prompt's
    Open Day control, and the address names the retained case with no `title`,
    `from` or `focus`.

  Never rewrite, re-date or replace an existing `★ FROZEN` block, and leave the
  header's inventory line and `ACCEPTANCE.md` alone.
- [x] 4.3 Replay:
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
- [x] 4.4 Move the pinned inventory literals so this branch's own tests pass:
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
- [x] 4.6 Coordinator-authorized, 2026-09-23 (Q3 delegation; the first branch
  replay and code review round 2). Story-only changes to S164 and S165 in
  `frontend/c4.replay.mjs`, each pinned on the `qa445Page` fake page in
  `frontend/c4.replay.test.js`:
  - S164's return after logging watches for the re-read's GET /api/analyze from
    the press. The re-read makes its own status read first, so its guidance read
    lands after the window `heldStatusReturn` records.
  - S165 expects the address a plain return names, `{subject, occurrence}`, as
    S137 does. The address it read right after the Diagnose Day return still
    carried that entry's keys (ADR 428).
  - The unmoved returns (S164 after the reload, and S165) count their requests
    from the Return press until the desk settles (`wholeReturn445`), so a
    re-read decided after the status answer fails "no request besides the held
    status check". The fake proves it: a return that re-reads once its status
    read is answered fails both stories there. The stories at 5d1319f7 let it
    through.
