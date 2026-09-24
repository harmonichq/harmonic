# #445 and #444 design record

## ADR 445 — Changes and carb-utility Day links carry identities, and each origin resolves its own return

### Decision

A Day link written by Changes or a carb utility names its return target by an
identity its origin owns, never by a page selector. The origin that owns the
identity resolves it to its own control on return, following ADR 428's
Occurrence-id pattern. A carb utility's Day return is a plain return to the
destination underneath, with the utility reopened over it.

1. **The identity each origin writes.**
   - *A Changes supporting date* — an active change's evidence
     (`frontend/follow-up.js`) or a change record's (`frontend/history.js`) — is
     named by the `date` the entry already carries. Nothing is added.
   - *A Log carbs entry* is named by its served id, as the entry's routing
     `subject`: `carb:<id>`.
   - *A Carb questions prompt* is named by its detector and anchor time, as the
     routing `subject`: `question:<detector>|<anchor time>`.

   A utility's `title` stays the printed "Log carbs · Jun 26 13:55" or "Carb
   questions · Jun 26 13:55", and its `date` and `from` are unchanged. The
   identity rides `subject` because ADR 426 split the printed `title` from the
   routing `subject`: Day reads the subject nowhere except in the context it
   hands back, and the utility's subject was its display text, one fact written
   twice. The `carb:` and `question:` prefixes follow the address's existing
   `pattern:`, `basal:` and `record:` prefixes, so a utility identity cannot pass
   for a Diagnose case. The grammar is spiked in
   `docs/scope/445-day-link-identities.spike.mjs` against the real address owner.
2. **The return-focus key leaves the address.** `frontend/tab-routing.js`
   drops `focus` from its context keys, and Day's return target stops carrying
   it. Once ADR 428 and this change have landed, nothing writes it. Kept, it would
   pass a CSS selector read from the address to the router's `querySelector`,
   and an address is external input. An older link that still carries `focus=`
   is read without it. Its return lands by the identity it also carries (a
   Diagnose Occurrence, a Changes date), or on the destination's default focus.
3. **Day's return, by origin.**
   - *Diagnose* is unchanged (ADR 428): Day hands back the whole entry and
     requests the reading heading, and Diagnose resolves the Occurrence.
   - *Changes* is unchanged in what Day hands back: the whole entry, which names
     the change or record (`occurrence`) and the date. Day requests the reading
     heading on the desktop and the sheet toggle on the narrow desk.
   - *A carb utility*: Day hands the utility its identity and moves to the
     destination the utility was opened over **with no context**, a plain return.
     Day makes no focus request of its own; the utility's request (point 4)
     governs. The entry names the utility's item, not the destination's case.
     Handing it to the destination is what made Diagnose compare a display text
     with its held case and re-read (reproduced below).
     - *Into a parked Diagnose*, this is ADR 428 point 7's retained return. Its
       one status read compares the store's revision with the one Diagnose last
       read. While the store has not moved, that is the only read. The drill,
       window and scroll are kept, and the address is replaced with the retained
       case.
     - *When the store has moved* since Diagnose last read, Diagnose re-reads and
       restores the case it held, as ADR 414 requires. Logging a carb or
       answering a question writes the store, so a return after either one
       re-reads. That re-read is a consequence of ADR 414, not a failure. Focus
       lands the same way on both paths (point 7).
     - *Into Changes*, it is a plain arrival.
     - *Into Day*, for a utility opened over Day, it is a direct entry. It keeps
       the day last looked at (ADR 427) and offers no second return. On the base,
       that same return re-adopted the utility's entry and offered its return
       again.
4. **The owner resolves its identity.**
   - *A carb utility* keeps the identity it was handed until it is next seated
     with its items loaded. It then matches the identity against the items it
     serves: a Carb log entry by id, a Carb-log prompt by detector and anchor
     time. A match requests focus on that item's own Open Day control, the
     control the reader pressed; no match requests the utility's heading. The
     request is made once. The identity is dropped when used, when the utility
     closes, or when another utility opens. This applies at every width, because a
     seated utility opens the narrow sheet itself. On the base, Log carbs came
     back to the entry's Remove button; the coordinator ruled for the Open Day
     control (Rulings, Q2).
   - *Changes* resolves an arrival whose context came back from its own Day link
     (`from=changes` with a `date`). On the first render of that arrival that
     shows the change's content — the active change's evidence or the reopened
     record, never a loading, failure or unavailable frame — it requests focus on
     that date's supporting-date control, else on the reading heading. The
     request is made once per arrival, and only on the desktop: on the narrow desk
     the supporting dates sit in the closed reading sheet, and Day's sheet-toggle
     focus stands. One resolver beside `readinessArm` in `frontend/follow-up.js`,
     which renders the control, serves both mounts. This also repairs the base,
     where an active change's supporting-date return never reached its control
     (reproduced below).
   - *Diagnose* is unchanged (ADR 428 point 5).
5. **Identities from the address never become raw selector text.** An identity
   arrives from the address, which is external input. It becomes selector text
   only as a well-formed ISO date (`YYYY-MM-DD`), or as the identity of an item
   the utility itself serves. Anything else resolves to the origin's heading.
   The spike's table covers a removed entry, an answered prompt, an old link's
   display-text subject and a crafted value.
6. **A held Changes return is not kept across a utility's Day visit.** A plain
   utility return drops a held `from=changes` ("Return to Trial"), exactly as ADR
   428 point 7 does for every plain return. On the base the same return also lost
   it, because the utility's context replaced the entry. The coordinator ruled
   for this (Rulings, Q1).
7. **A Diagnose rebuild takes no focus from a seated utility.** While a utility
   is seated, Diagnose's entry restoration sets no `#crumb-trail` focus default of
   its own. The router then carries the focus the desk last placed, the utility's
   return target, across the rebuild.
   - **How Diagnose knows.** Diagnose reads whether a utility is seated from
     `frontend/utilities.js`, the owner of that fact, through one new read,
     `seatedUtility()`. `createDiagnoseDestination` takes that read as an option
     beside `api`, `createView` and `loadCase`, defaulting to it, as the factory
     already does for its other collaborators. `diagnose.js` already imports
     `openUtility` from that module, so no new module edge is added.
   - **Why the default is the only path that can take focus:**
     - `restoreEntry` sets `#crumb-trail` as the router's focus request
       whenever none is set. A moved-store return rebuilds after the utility's
       own request has already landed on the render that showed the loading
       frame, so the default is set.
     - The router focuses the first present candidate and records it as placed
       without checking that focus moved, and a request outranks carried focus
       (`view.focusAfterRender || carried`, `frontend/routes.js` `render`).
     - Every focus target of Diagnose's own lies in the inspector pane:
       `#crumb-trail`, the drill's `#level`, the held Occurrence's row and its
       Open in Day control (`frontend/diagnose-workstation.js`'s template). A
       seated utility makes that pane inert and hidden (`frontend/utilities.js`
       `seatUtility`). Under a seated utility, then, the default is a silent
       no-op that still displaces the carried focus, and focus falls to the page
       body.
     - The restoration's other focus moves are no-ops for the same reason. The
       one that runs synchronously, before the render re-seats the utility, is
       overtaken by the router's focus step in that same render.
   - **Scope.** This holds for any rebuild under a seated utility, not only a
     utility's Day return. Coordinator ruling r1-1(b).

### Authority

Coordinator ruling R445 under the operator's Q3 delegation — `Q3 delegation,
Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator
ruling R445`: "Day links from Changes and the carb utilities carry an identity (a
date, a carb entry id, a question key), never a page selector; the origin that
owns the identity resolves it to its control on return, following ADR 428's
Occurrence-id pattern. A carb-utility Day return into Diagnose is a retained
return: one status read, the drill kept, the utility reopened over it." Points 1
to 7 are the triage worker's calls that make R445 hold, reviewed with this
change, and point 7 and the store-moved clause of point 3 carry the rulings
below.

### Rulings

Coordinator rulings, 2026-09-23, under the Q3 delegation, at plan review round 1:

- **Q1.** A plain utility return drops a held "Return to Trial" (`from=changes`),
  as every plain return does under ADR 428 point 7 (point 6).
- **Q2.** Log carbs returns to the entry's own Open Day control, the control the
  reader pressed, not the base's Remove button (point 4).
- **r1-1(a).** The "exactly one status read, drill kept" guarantee holds while
  the store has not moved since Diagnose last read. A return after the store
  moved re-reads (ADR 414). That is recorded as a consequence, not an accepted
  failure (point 3).
- **r1-1(b).** The focus guarantee holds on both paths. After a carb-utility Day
  return into Diagnose, the utility is reopened over Diagnose and focus lands on
  the pressed Open Day control, even when Diagnose rebuilds (point 7).
- **r1-1(c).** S164 proves both paths for Log carbs.
- **r1-2.** Day's utility return into a utility opened over Day is pinned by a
  Node test.

Coordinator ruling, 2026-09-23, under the Q3 delegation, after start (a
coordinator-authorized widening of this change):

- **Point 8. Day returns only into a utility the desk has.** The `from` of a Day
  address is external input. `dayReturnTarget` reads `<destination>.<x>` as a
  utility return only when `<x>` is a utility the desk has (an own key of
  `UTILITY_TITLE`); any other `<x>` is a plain return to that destination, named
  for it. On the base, a crafted `from=diagnose.bogus` offered "Return to bogus",
  and pressing it reopened a utility with no pane, so the next render threw and
  the desk stopped drawing. Recorded as a finding at start and fixed here (task
  1.4), not filed.

  The destination half reads the same way (coordinator ruling, 2026-09-23, on
  code review round 1's finding F1). `<destination>` is taken only when it is an
  own key of `DESTINATION_LABEL`, and the return's label comes from the
  destination so resolved. A name every object inherits (`constructor`,
  `__proto__`) is therefore never a destination; the return is a plain one to
  Diagnose, named for it. On the base, `from=constructor` printed "Opened from
  function Object() { [native code] }" and a return named the same (task 1.5).

### Grounding

Reproduced in process on origin/main b03431d2 with scratch node tests (not
committed), driving the shipped modules through the desk's own router:

- The Log carbs Open Day writes
  `/day?date=2024-06-26&subject=Log+carbs+·+Jun+26+13:55&title=…&from=diagnose.carbs&focus=[data-utility-remove='41']`.
  Carb questions writes
  `focus=[data-question-card='low|2024-06-26 13:55:00'] [data-action='day']`.
  Both routing subjects equal their titles. `dayReturnContext` hands that whole
  entry back, `focus` included.
- The active change's (`frontend/follow-up.js`) and a change record's
  (`frontend/history.js`) supporting dates write
  `focus=[data-day-date="2024-06-11"]`. The entry already carries
  `date=2024-06-11`, with `occurrence` naming the change or `record:<kind>:<id>`.
- The questions utility's return context, mounted into a parked Diagnose holding
  a drilled case, issues status, analysis, scenarios, time_of_day, exposures,
  preparation and trend. It tears down and rebuilds (three `setData` calls, no
  refresh), and leaves
  `/diagnose?date=…&subject=Carb+questions+·+…&title=…&from=diagnose.questions&focus=…`
  in the address. A plain return in the same harness issues status alone and
  refreshes the retained root.
- Day's `[data-day-date="2024-06-11"]` request followed by `navigate('changes', …)`,
  through the real router and follow-up mount, focused the reading heading three
  times and never the date control, although the rendered content contained it.
  The loading frame's heading satisfied the request, and the router then carried
  that heading forward.
- `c3-trial` serves an active Trial whose retained comparison lists twelve
  before-period contributing dates (eight render as controls), on both the active
  change and its change record. `edit-chain`'s records serve none. Read in
  process through the API's test client over a generated case store, with no
  port and no fetch loop.
- Day reads the entry's `subject` only to hand it back. `seatUtility` runs inside
  the render, before the focus step, so a utility can place its own request on
  the render that seats it. On the base, a `from=day.<utility>` return navigates
  to Day with the whole entry, so Day re-adopts it and offers its return again.
- Every carb write advances the store's input revision (`ciq_autotune/store.py`
  `_advance_revision`, on a carb entry's insert and delete and on a prompt
  response), which is the revision Diagnose's return status read compares.
- A contributing date is the calendar day of each measured row in its period. A
  change made mid-day can therefore list its change day in both periods, and the
  base selector then lands on the first-listed control.

### Consequences

HV2-14 holds in substance: the "precise return-focus target" the lock and the
active `harmonic-v2` delta name is carried as an identity, as ADR 428 already
reads it for Diagnose. Neither text changes. The surfaces requirement "Day names
the subject it was opened from by its served name" is modified: it no longer
names a `focus` field, and a utility's routing subject is its identity. S76 holds
unchanged, because a utility's Open Day still keeps the utility open over Day and
its return still reopens it. S162–S165 are added.

A utility return into Diagnose after the reader logged a carb or answered a
question re-reads Diagnose. ADR 414 requires that re-read, because the store
moved. The restoration then reopens the held case, and focus still lands on the
utility's Open Day control. A Diagnose rebuild under any seated utility no
longer sets its crumb default.

A utility return into Changes is a plain arrival, so #446's plain-arrival rule
applies to it, as it would have applied to the base's context, which named no
Plan either.

## ADR 444 — The Log carbs header reads the reader's local clock

### Decision

`carbsBody()` in `frontend/utilities.js` builds its "at <date> · <HH:MM>" line
from one local wall-clock string, `formatWallClock(new Date())` from
`frontend/carb-log.js`, printed with the desk's `shortDate` and `clock` helpers.
Coordinator ruling R444 adopts #444's checklist as written. `formatWallClock` is
the existing formatter from a `Date` to the stored `YYYY-MM-DD HH:MM:SS`
wall-clock string, built from local getters, and #427 made Day's viewed stamp use
it. A second formatter would duplicate it.

### Grounding

Reproduced in process on b03431d2 under `TZ=America/Denver` with the clock at
2024-06-30T04:45:05Z (22:45 on Jun 29 locally). The seated Log carbs pane's
header read `at Jun 30 · 22:45`: the UTC date beside the local time.
`shortDate` reads the first ten characters of its argument, and the base passed
it `toISOString()`.

### Consequences

The logged carb's own timestamp already uses local getters (`whenToT`) and is
unchanged. No replay story pins this header, for the reason #427 gave: no replay
or browser context sets a `timezoneId`, so the replay browser runs in the
runner's zone, UTC on CI, where the defect cannot show. A Node test pins its own
zone and clock instead.

## Revise lifecycle record

- **Route.** UI Craft's router, run at triage on this worktree, returned
  `{"mode":"revise","reason":"safe manufactured data source declared"}` for a
  shipped, runnable surface with a complete declaration and a manufactured
  source.
- **Safe start.** `AGENTS.md`, "The data boundary": the one permitted offline
  serve, `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`,
  over a copy of `mockups/qa-e2e.synthetic/harmonic.sqlite`, or of a named case
  store emitted by `uv run python scripts/gen_qa_e2e_db.py --case <name> --out <scratch path>`.
  Both are generated entirely by `scripts/gen_qa_e2e_db.py` from manufactured
  recipes. This change's stories use the showcase and `c3-trial`.
- **Base.** origin/main `b03431d2b937b46bdabbb2de1e6ba0ba6c6b57b1`.
- **Contract.** The frozen desk behavior ledger
  `mockups/harmonic-v2-desktop.behavior.md` (header `★ FROZEN 2026-09-23`,
  inventory 171 issued, 152 active, 19 retired; `acceptance.py inventory`
  on b03431d2 read the same, with registry parity) and its replay
  `frontend/desk-behavior.replay.mjs`. The release brief treats it as the
  existing contract, and no sweep is re-run.
- **Behavior changes.** Added: S162–S165, in a dated
  `## #445 amendment — 2026-09-23, issue #445` section. Changed, with no story
  asserting the old fact:
  - the Changes and utility Day addresses;
  - the Changes supporting-date return focus;
  - the utility return's reads, drill, focus and address over Diagnose;
  - the utility-over-Day return;
  - the Log carbs return control (ruling Q2);
  - a Diagnose rebuild's crumb default under a seated utility.

  Retired: none. Moved: none.
- **Sanction line.** `Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out
  yourself from here"); coordinator ruling R445` (and R444 for the header; the
  round-1 rulings above for Q1, Q2 and r1-1 to r1-2).
- **Render matrix owed.** At 1280x720 and 1440x900, in the one shipped theme,
  base and branch renders of four states.
  - (a) Day opened from the active change's first supporting date on
    `c3-trial`, then the Changes return with focus visible on that date's
    control.
  - (b) The same for the Trial's change record.
  - (c) Log carbs over a drilled Diagnose case on the showcase, on both return
    paths. After logging an entry, the store has moved: the return re-reads and
    restores the case, with focus on the entry's Open Day control. After a
    reload, it has not: the return keeps the drill, again with focus on the
    entry's Open Day control.
  - (d) Carb questions over a drilled Diagnose case on the showcase: the return
    keeps the drill, with focus on the question's Open Day control.

  The Log carbs header needs no render; its evidence is the zoned Node test.

## Risk contract

- **Must prevent:**
  - A Day address written by Changes or a carb utility that carries a CSS
    selector or a return-focus key.
  - Selector text built from any address value other than a well-formed ISO date
    or the identity of an item the utility serves.
  - A carb-utility return that re-reads a retained Diagnose whose store has not
    moved since Diagnose last read, or that discards its drill.
  - A carb-utility return that leaves the utility's title, origin or a selector
    in the Diagnose address.
  - A Changes or utility return whose focus lands anywhere but the named control
    while that control is present, including when Diagnose rebuilds under the
    reopened utility.
  - A Log carbs header that names a date other than the reader's local date.
  - Any analyzer, projection, served-payload, cap, floor, admission or staging
    change.
  - Real data in a fixture, test or evidence file.
  - Secret exposure, irreversible loss of authoritative data, and silent
    incorrect success.
- **Must recover:** none beyond today. A return whose identity no longer matches
  lands on the origin's heading.
- **Accepted failure:**
  - An identity no longer served lands focus on the origin's heading: a removed
    Carb log entry, an answered prompt, or a date beyond the eight a period
    renders.
  - A date listed in both evidence periods lands on the first-listed control, as
    on the base.
  - A plain utility return drops a held "Return to Trial" (ruling Q1).
  - An older link's `focus=` is ignored.
- **Unsupported:**
  - A Changes return's precise focus on the narrow desk, where the sheet toggle
    takes it as today.
  - Back and Forward through Day visits.
  - Whether Plan stays open on a plain arrival to Changes (#446).
- **Evidence owed:**
  - The address drops a `focus=` it is handed, and round-trips the utility
    identities with their titles.
  - Day's utility return moves with no context and hands the utility its
    identity. A utility over Day comes back to Day with no second return. A
    Changes return still hands back its whole entry.
  - Each writer's Day address carries its identity and no selector.
  - The utility resolves a served identity to that item's Open Day control, and
    an unserved, display-text or crafted one to its heading, once.
  - A Diagnose rebuild under a seated utility sets no focus default, and one
    with no utility seated still does.
  - Changes requests the date's control on the first content render of a Day
    return only, once per arrival, desktop only, and the heading for a malformed
    date.
  - The Log carbs header under a pinned Denver clock.
  - The extended desk browser test and stories S162–S165 at both desktop sizes,
    each failing first on the base at its feature assertion. S164 covers the
    moved and the unmoved return. S7, S54b, S60, S61, S62, S72b, S76, S108,
    S133, S136, S137, S138 and S142 still pass.

Why: a Day link and its return are one round trip whose failure mode is a link
that leaks page internals or lets a crafted address reach the page as a
selector, or a return that silently rebuilds or loses the reader's place.
Disposition: copied into the #445 execution lock.
