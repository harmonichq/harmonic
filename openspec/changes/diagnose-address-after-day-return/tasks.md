# #428 implementation checklist

Every task implements surfaces **Diagnose's address names the case the reader is
on** under ADR 428 in `design.md`. A checked item means implemented and verified.
Tests go through each module's public interface. Each new behavior test fails
first on the base for the reason it names; a regression pin that already passes
on the base is labelled as one.

## 1. The address (routing owner)

- [ ] 1.1 In `frontend/tab-routing.js`, add the case-address rule (ADR 428 point 1;
  behaviour as `docs/scope/428-case-address.spike.mjs` pins it): given the case on
  screen and the entry's `from`, it yields exactly `subject`, `occurrence`,
  `window` when present, plus `from` only when it names a destination other than
  Diagnose. In `frontend/tab-routing.test.js`: every Day-entry key is dropped
  (`date`, `moment`, `lever`, `focus`, a Diagnose `from`); `from=changes` is kept;
  no case yields `/diagnose` (these fail first, the rule being new). Two
  regression pins beside them hold behaviour that already passes on the base: a
  case address round-trips through `serializeRoute`/`parseRoute`, and
  `writeRoute` with `replace` calls `replaceState`, never `pushState`.
- [ ] 1.2 In `frontend/routes.js`, add one in-place address write (ADR 428 point
  3): it replaces the router's held context and the current history entry's
  address through `writeRoute(..., { replace: true })`, and changes no
  destination, navigation count, render or focus. A later `render()` hands the
  destination the replaced context. Cover it through the Diagnose destination's
  tests (task 2.2), since `routes.js` has no test file of its own.

## 2. Diagnose

- [ ] 2.1 The workstation publishes the case it has on screen (ADR 428 point 4):
  `frontend/diagnose-workstation.js` exposes it from its drill stack (the rail row
  a drill came from, or the basal slot as `basal:<start>`; the selected
  Occurrence's id; the open case file's served window or the slot's span, written
  as the Day entry writes it) and notifies when it changes, and
  `frontend/diagnose-event-comparison.js` forwards that seam unchanged. The
  Findings root publishes no case. The workstation's node tests reach only its
  exported render helpers, so this seam's evidence is the desk test (3.1) and
  S136–S138; add a node case in `frontend/diagnose-workstation.test.js` only
  where an existing export already reaches the drill stack, and extract nothing
  for testability alone.
- [ ] 2.2 `frontend/diagnose.js` replaces the address with the case address on
  every change to the published case while no entry restoration is pending, and
  tracks the restoration exactly as ADR 428 point 2 defines it: pending from the
  read that applies a contextual entry until the named case and Occurrence are on
  screen, or until the first trusted pointer press or key press other than Tab
  or a bare modifier anywhere on the page while Diagnose is current, which ends
  it; the restoration's own untrusted presses never end it and its settling
  writes nothing. It keeps the entry it holds equal to what it wrote. The trigger
  is the published case, so no per-control hook is added. Unit tests in
  `frontend/diagnose.test.js` (stub the browser location and history as the
  scratch reproduction did): a published case with no restoration pending
  replaces the address with no push and no new navigation; a published case
  during a pending restoration writes nothing; a trusted key press ends a pending
  restoration and the next published case is written; a Tab press does not end
  it; a published Findings root writes `/diagnose`; `from=changes` survives.
- [ ] 2.3 The Day entry (ADR 428 points 4 and 5): `evidenceDayContext` in
  `frontend/diagnose-context.js` takes `subject`, `occurrence` and `window` from
  the published case and no longer accepts or writes `focus`; `date`, `moment`
  and `lever` still come from the Occurrence. Update
  `frontend/diagnose-context.test.js`, which pins the selector today, so it
  asserts no `focus` key and the published case's subject, Occurrence and window.
- [ ] 2.4 The return target (ADR 428 point 5): `restoreEntry` stops reading
  `entry.focus` and, once the named Occurrence is held, focuses its Open in Day
  control, else the Occurrence row, else the crumb. A retained return to the held
  case places the same focus when the root re-seats. In `frontend/follow-up.js`,
  `retainedEvidenceContext` drops `focus: '#crumb-trail'`; update
  `frontend/follow-up-lifecycle.test.js`, which pins it.
- [ ] 2.5 Retention (ADR 428 points 6 and 7): in `mount`, a return into a parked
  Diagnose whose context names no case is a retained return whatever entry was
  held, keeps the held case (not the held `from`) as its entry and replaces the
  address with it, so "Return to Trial" does not reappear after a topbar press; a
  contextual entry naming a different case still re-reads; a repeated press
  while on Diagnose still re-reads. Unit tests in `frontend/diagnose.test.js`,
  the first failing first on the base exactly as the scratch reproduction did: a
  held Day-return entry, a park, then an empty entry issues only one status read;
  a held `from=changes` entry, a park, then an empty entry leaves no `from` in the
  entry or the address;
  a Day return naming the held case issues only one status read and places the
  return focus; an entry naming a different Occurrence still re-reads (the
  existing test stays green).
- [ ] 2.6 Preset restoration (ADR 428 point 8): `restoreEntry` presses the Window
  preset whose range equals a Finding's named window before opening its row; no
  window keeps the 24 h press; Patterns and basal slots are unchanged. Unit test in
  `frontend/diagnose.test.js` beside the existing #413 window tests.
- [ ] 2.7 Supersede the C2 comment on S37b in `frontend/c2.replay.mjs` ("only a
  destination handoff publishes subject in the URL") with ADR 428's rule. No story
  assertion changes.

## 3. Browser evidence and the behavior ledger

- [ ] 3.1 In `frontend/desk.browser.test.mjs`, beside "a canonical Day address
  reloads through the built shell and returns through its canonical Diagnose
  door", add a test that fails first on the base: from a Day address naming a
  Finding case and an Occurrence the manufactured reads serve at 24 h and at
  Overnight, return to Diagnose, choose Overnight, and assert the address names
  the Finding and the Overnight window with no `date`, `moment`, `lever` or
  `focus` and no added history entry; step back along the crumb to Findings and
  assert the address is `/diagnose` with no `occurrence` or `focus`; reload and
  assert no case file is open. The canonical-door test stays unchanged and green.
- [ ] 3.2 Add three app-only stories to `mockups/harmonic-v2-desktop.behavior.md`
  in this ticket's block, recorded in a new dated `## #428 amendment — 2026-09-23`
  section following the #413/#414 pattern, each with its `C4_STORIES` body in
  `frontend/c4.replay.mjs`, its `appOnly` export and REGISTRY row in
  `frontend/desk-behavior.replay.mjs`, and a status line the coordinator fills
  from base-fails and branch-passes runs at 1280x720 and 1440x900:
  S136 — after a Day return on a Finding case with an Occurrence held, ↓ steps
  to the next Occurrence and the address names it with no `focus`; choosing
  Overnight re-addresses to the Finding and the Overnight window with no Day-entry
  key; Backspace back to Findings leaves `/diagnose`; and a reload lands on
  Findings;
  S137 — Day return, then Changes, then Diagnose issues exactly one
  `GET /api/status` and nothing else, keeps the pressed window and the crumb, and
  the address names the case (S108's held-return helper);
  S138 — a Finding case with an Occurrence held in a preset window other than
  Overnight: the address names subject, Occurrence and window with no `focus`, a
  reload re-opens it in that window with that Occurrence held, Open in Day writes
  a Day address with no CSS selector, and the return makes one status read and
  focuses that Occurrence's Open in Day control.
  The amendment section quotes the Q2 sanction, names ADR 428 and states the
  shipped behavior that changes: an in-place drill now writes the address, and a
  reload after one re-opens the case. Never rewrite, re-date or replace an
  existing `★ FROZEN` block, and leave the header's inventory line alone: the
  release freeze block and that count are written once on the integration branch.
- [ ] 3.3 Move the pinned inventory literals so this branch's own tests pass:
  `inventory()` in `mockups/sweep/harmonic-v2-desktop/acceptance.py` to
  `{"issued": 150, "active": 131, "retired": 19}`; in
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py` the plan count and the
  registry length to 150, the stated-inventory case to S1–S131 with R1–R19, and
  the same-total case to 132 active and 18 retired. `ACCEPTANCE.md`'s count
  sentence is not edited here; it is written once on the integration branch.
- [ ] 3.4 Browser legs, each run once and serially by whoever can bind a port:
  the new desk test by its name pattern, then the whole desk suite;
  `ONLY=S136,S137,S138,S24,S26,S33,S35,S37,S61,S62,S108,S109` on the bare replay at
  both sizes, first on a base worktree with the new stories laid over it (S136–S138
  fail at their feature assertions) and then on the branch (all pass); then the
  complete ledger through `acceptance.py replay` at both sizes on the commit to
  be pushed.
