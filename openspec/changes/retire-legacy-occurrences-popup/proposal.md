# Retire the legacy occurrences popup (#52)

## Why

ADR 31 makes the Diagnose Inspector the sole route to a finding's occurrence
evidence and explicitly retires the app-wide `occurrenceModal` hash machinery.
The rendered popup is already gone, but `frontend/index.html` still carries its
inert state, helpers, URL writer/restorer, watcher, keyboard branch, and setup
exposure.

Leaving that parallel route in production source makes a settled retirement
look unfinished and gives future URL work a stale path to revive. The cleanup
must distinguish deleting dead source from current stale-link behavior: the
base parser already drops the obsolete modal parameter.

## What changes

- The legacy occurrences state and its complete production-only wiring are
  removed from `frontend/index.html`; shared hash routing, the Day handoff, and
  unrelated branches remain unchanged.
- The frozen Cockpit shell ledger gains permanent retirement R1 with Connor's
  exact sanction, settlement date, a source-adjacent retirement tag, and a
  fail-closed public replay.
- A source-inventory assertion proves the dead source was removed. The public
  stale-link replay separately proves `#diagnose?modal=occurrences&detector=…`
  normalizes to exact `#diagnose`, opens no second route, and leaves the current
  Inspector's generated finding evidence usable.
- Base and revision renders are compared at both existing desktop viewports in
  Light and Dark. The fast gate and the Diagnose workstation and Cockpit shell
  browser legs remain green.

## Risk contract

- **Must prevent:** removing or changing the current finding inspector or Day
  handoff, changing any advisory/safety/Plan behavior, or letting a browser gate
  pass with zero applicable stories; publishing real health data is prohibited.
- **Must recover:** nothing automatically.
- **Accepted failure:** a bookmark carrying the retired occurrence-list
  parameter lands on the current Diagnose surface with the obsolete parameter
  discarded; the old popup/list state is not recovered.
- **Unsupported:** preserving legacy `modal=occurrences` bookmarks; repairing
  or standardizing the currently untested direct-link restoration for Data
  quality or Day; redesigning URL state; and verification with real pump data
  or a fetch-enabled server.
- **Evidence owed:** a current-base shell inventory; the permanent, loud
  retirement story with its named/date/quoted sanction; a public stale-link
  assertion that reaches canonical `#diagnose`; deliberate red mutations
  restored before commit; a source-inventory assertion that fails naturally
  before the dead source is removed; the closed production-source inventory;
  the existing public gates for the inspector, Day handoff, and shell remaining
  green; green fast, Diagnose workstation, and Cockpit browser gates.

Why: this is a recoverable stale-link cleanup, but it sits beside the evidence
a wearer uses to judge advisory dosing guidance.

Disposition: inline in this proposal and unchanged in the locked work order.

## Impact

Production impact is limited to deleting an inert frontend route from
`frontend/index.html`. Contract and test changes are limited to the existing
Cockpit shell ledger/browser adapter and OpenSpec evidence. No API, stored-data,
