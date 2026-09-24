# #452 A later conclusion stays with the record it was typed on

## Status

**Triage source for #452.** An ordinary ticket change in the #442–#457 follow-up
release. The inherited desk revise contract
(`mockups/harmonic-v2-desktop.behavior.md` and its replay) stays frozen. A dated
`#452 amendment` section records the changed behavior and adds one story, S180,
with its replay. No story is amended or retired, and the ledger inventory moves
to 172 issued · 153 active · 19 retired on this branch. The header's inventory
line and the release freeze block are the coordinator's.

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
from here"); coordinator ruling R452: "As the issue's checklist: the
later-conclusion text, failure and request id clear in one place whenever the
open record's identity changes." Coordinator rulings on this triage, same
delegation: add the story S180 (Q1), and reopening the same record from the
roster starts empty (Q2).

## Why

An expired Trial's change record offers a Later conclusion form. The desk keeps
three things for that form in page memory: the text typed so far, a failed
save's message, and the save's request id. Opening another record from the
Changes roster carries all three into it.

Reproduced at node level on `b03431d2` through the #430 host fake and the
router's address writer (a scratch copy of `frontend/follow-up-lifecycle.test.js`,
not committed). The reader types on expired Trial A, the save fails, the reader
presses Back to records and opens expired Trial B from the roster. Then:

- B's form is pre-filled with A's words;
- B shows "Recording the later conclusion failed" with a Retry, although
  nothing was tried on B;
- B's save goes out as a retry, re-reading B first, and it carries A's request
  id.

The server refuses a request id already held by a different record
(`request_identity_mismatch`). Theory: if A's save committed and its response
was lost, every save on B would fail until the page reloads.

The three fields are cleared only after a successful save and in `mount`'s
different-record branch. A roster press never reaches that branch.
`openRecord` sets the open record before it navigates, and `closeRecord` (Back
to records) clears it before it navigates, so by the time `mount` compares the
address with the held record they already agree. The same shape also keeps the
typed text when the reader goes back to the roster and reopens the same record.
Opening either record by its address already starts empty.

## What changes

- One place in the record destination sets which record is open. Every door
  that opens or leaves a record goes through it: a roster press, Back to
  records, finishing a change (which opens its saved record), and an address
  naming a different record. It drops everything held for the record being
  left: the chosen assessment, the record read, a destination read failure,
  the in-flight read, and the later-conclusion text, failure and request id. The
  separate resets now in `openRecord`, `closeRecord` and `mount` go, so there is
  no second copy of the rule.
- A re-render of the same open record keeps the typed words, the failure and the
  request id, so Retry still resends the same request id. That includes a
  return from Day to the same record.
- Node tests through the roster press, on the #430 host fake, cover opening a
  different expired Trial and reopening the same one.
- A new replay story, S180, proves the same rule in the built app on the one
  expired Trial the c4-isf case store serves. The reader types on it, a routed
  save fails, the reader goes back to the roster and reopens it. The form is
  empty, no failure is carried, and the next save sends a request id of its
  own. Two different records stay proved at node level, because no committed
  case store serves two expired Trials.
- The ledger gains a dated #452 amendment carrying S180, the changed behavior
  and a handler inventory for the later-conclusion form, which arrived in #411
  with no ledger row.

## Not in this change

- The conclude endpoint, the request-identity rules, what makes a Trial
  eligible for a later conclusion, and every saved ending.
- ADR 430's failed-reassessment clear, which already stays with its record.
- `history.js`'s Day links (#445) and ending section (#449/#450).
- Any backend module, generator, fixture or case-store change. The only Python
  edits are the acceptance harness's inventory literals.
