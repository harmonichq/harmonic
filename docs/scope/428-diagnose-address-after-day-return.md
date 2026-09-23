# #428 — Diagnose keeps the Day hop's address (and a CSS selector) after the reader moves on

Scope ledger. Opened 2026-09-23 by delegated triage for the #422–#434 release;
route: nothing to scope beyond the settled operator decision, defaults assumed
and listed below. Decisions come from the release coordinator, never from a
direct operator interview in this session.

## Decisions

- D2 (settled, do not re-litigate): once the reader acts inside Diagnose, the
  address names the case the reader is on; the CSS-selector `focus` becomes an
  Occurrence id. Connor Griffin, 2026-09-23, via the coordinator. `→ ADR` (ADR 428)
- The address is replaced in place, never pushed. Why: a pushed entry makes Back a
  full Diagnose re-read per step and adds history steps Diagnose never had.
  Default taken. `→ ADR`
- The case address is subject, Occurrence and window, plus a `from` naming another
  destination; no Day-entry key. Why: exactly what the entry restoration reads,
  and the Changes return Diagnose renders reads `from=changes`. Spiked in
  `docs/scope/428-case-address.spike.mjs` (five table tests, passing). `→ ADR`
- The Diagnose-origin Day entry drops `focus`; its `occurrence` names the return
  control. Why: a second key holding the same id is one fact written twice. The
  Changes entry's dead `focus: '#crumb-trail'` goes with it. `→ ADR`
- The workstation publishes the case on screen; the address and the Day entry read
  that one publication. Why: `caseContext` is cleared by a window choice; two
  derivations of one fact would diverge (charter). `→ ADR`
- A return naming no case is retained; a Day return to the held case is retained
  and places the return focus. Why: ADR 414 re-reads only on a contextual entry
  naming a different case. `→ ADR`
- Restoration presses a Finding's preset window; a drawn window is an accepted
  limitation. Why: without it a case address in Morning, Afternoon or Evening
  reopens on Overnight; no public path draws a window. `→ ADR`
- Selector-shaped return targets in Changes and utility Day addresses, and the
  utility-origin Day return into Diagnose, stay out of #428. Why: the ticket's
  boundary is the Diagnose address and entry; those files carry other release
  tickets' work. `→ issue` (drafted for the coordinator, who files it)

- Review round 1: the address trigger is any change to the published case while
  no entry restoration is pending; the restoration ends on the reader's first
  trusted pointer or non-Tab key input. Why: Backspace, ↑/↓, Escape and chart-tile
  drills change the case without reaching the capture click listener. `→ ADR`
- Review round 1, coordinator ruling: a topbar return keeps the held case, not its
  `from`. Why: a direct entry invents neither a prior subject nor a return. `→ ADR`

### Risk contract

Copied unchanged into `openspec/changes/diagnose-address-after-day-return/design.md`
("Risk contract"), which is the admitted authority.

## Reproduction

In process on origin/main a4d374a7, a scratch node test outside the branch
(three assertions of today's behaviour, all passing, so the defect reproduces):
the Diagnose-origin Day entry's `focus` is `.occ-foot button:last-child`; the Day
return writes date, moment, lever, from, occurrence and that selector into the
Diagnose address, the router exports no in-place write, and a `navigate()` from
inside Diagnose is a new navigation; a direct Diagnose return after a held
Day-return entry issues a full guidance read. The browser halves (window choice,
crumb, reload) are traced in code and owed to the failing-first browser test.

## Review rounds

- Round 1 (coordinator-dispatched `/plan-review`, verified by the coordinator):
  BLOCKED, 1 blocking and 2 notes, all `authoring`, the blocker reproduced
  against the tree by this worker. (1) The address trigger was a closed list of
  clicks and missed shipped paths that never reach Diagnose's capture click
  listener: Backspace and ↑/↓ through a document keydown in
  `frontend/diagnose-workstation.js`, Escape clearing a drawn window, and a chart
  tile drilling a different Finding (`chartClickRoute`). Fixed: the trigger is
  any change to the published case while no entry restoration is pending, the
  restoration ends on the reader's first trusted pointer or non-Tab key input,
  the list became examples, and S136 plus task 2.2 carry unlisted paths (↓,
  Backspace, a Tab press). The drawn-window accepted failure was reworded to
  match. (2) Coordinator ruling: a topbar press keeps the held case but not its
  `from`, so "Return to Trial" does not reappear; recorded in ADR 428 point 7, the
  spec and task 2.5. (3) Task 1.1's round-trip and replace tests are labelled
  regression pins; the summary now says the address follows every case change in
  every session. Also applied the release brief's ledger-freeze rule: stories go
  in a dated `## #428 amendment — 2026-09-23` section, and the frozen header's
  count line and `ACCEPTANCE.md` are left to the integration branch.

## Open questions

- For the coordinator: widen #428 to the Changes and utility Day entries'
  selector-shaped `focus` and the utility-origin Day return, or file the drafted
  follow-up (recommended)?

## Spawned tasks

- Follow-up issue drafted in the triage result; not filed (workers never file).
