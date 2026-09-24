# #452 design record

## ADR 452 — The open record's identity clears everything held for it, in one place

### Context

The record destination (`frontend/history.js`) keeps one page-memory object for
the change record that is open. The later-conclusion form reads three of its
fields:

- `conclusion`: the text typed so far;
- `conclusionFailure`: a failed save's headline and message;
- `conclusionAttempt`: the save's request id.

Before this change they were cleared in two places only: after a successful
save, and in `mount`'s different-record branch. That branch runs when the
address names a record other than `memory.open`. The two roster doors write
`memory.open` themselves before they navigate: `openRecord` for a roster press
(and for the finished-change handoff from `follow-up.js`), and `closeRecord` for
Back to records. `navigate` renders synchronously, so `mount` always finds the
address and the held record already agreeing, and the branch never runs.

Reproduced on `b03431d2`, at node level, through the #430 host fake with a
window fake so the router can write the address. A scratch copy of
`frontend/follow-up-lifecycle.test.js` was used and is not committed:

| Sequence | Base result |
|---|---|
| Type on expired Trial A, fail its save, Back to records, open expired Trial B from the roster | B's form shows A's words; B shows "Recording the later conclusion failed"; B's save re-reads B first (a retry) and sends A's request id |
| Type on expired Trial A, Back to records, open A again from the roster | A's form still shows the typed words |
| Choose Current policy on A, Back to records, open B | B opens on its own record read then one retained read (does not carry) |

A spike of the decision below, on a scratch copy of `frontend/`, turned the
first two rows empty. The third row's reads were unchanged, and the 84 tests in
`follow-up-lifecycle.test.js`, `history.test.js`, `follow-up.test.js` and
`changes.test.js` passed.

**Field audit.** The ticket's coordinator asked for every per-record field in
the module's memory to be checked for the same carry-over shape:

| Field | Carries on a roster press? | Evidence |
|---|---|---|
| `conclusion`, `conclusionFailure`, `conclusionAttempt` | Yes | Reproduction above |
| `mode` (the reader's assessment choice) | No | `openRecord` reset it; third row above |
| `failed` (a failed reassessment read) | No | Cleared where a record read lands (ADR 430), and every opening makes a record read; #430's roster test |
| `record` | No | `openRecord` and `closeRecord` both null it |
| `error`, `loading` and the read generation | No path reaches it | A failed destination read renders the error frame, and a pending read renders the loading frame. Neither frame carries Back to records or a roster row, so no roster press happens while either is held |

`roster` is destination state, not per-record: `openRecord` drops it on purpose
so the next arrival re-reads the roster.

### Decision

1. **One function is the only writer of `memory.open`.** It sets the open
   record's identity (a `{ kind, id }` or none) and drops everything held for
   the record being left. That covers the chosen assessment, the record read,
   the destination error and the in-flight read. It bumps the read generation,
   so a read made for the record being left cannot land on the next one. It
   also clears the later-conclusion text, failure and request id.
2. **Every door goes through it.** `openRecord` calls it on every open. That
   includes the finished-change handoff, which may name the record already
   held; a fresh open re-reads the record, as `openRecord` always did.
   `closeRecord` calls it with none. `mount` calls it only when the address
   names a different record than the one held. The resets that `openRecord`,
   `closeRecord` and `mount`'s branch each did separately are deleted, so no
   second copy of the rule remains. It runs before `navigate`, because
   `navigate` renders synchronously.
3. **The roster is not an open record.** Back to records changes the identity to
   none. Reopening the same record from the roster therefore starts with an
   empty form, as opening it by its address already did (the address door
   passes through the roster's empty identity too).
4. **A re-render of the same record keeps the form.** A failed save followed by
   a re-render keeps the words, the failure and the request id, so Retry
   resends the same request id: the server's idempotency contract depends on
   it. A Day round trip from the record returns through the record's own
   address, so it is the same identity and keeps them too.
5. **What does not move.** The successful-save clear stays where it is. It is a
   different rule (a saved conclusion empties its own form) and it applies to
   the same record. ADR 430's `failed` clear stays where the record read lands,
   because `failed` does not carry. The Day door, the retry re-read in the save,
   the text binding, the conclude endpoint, request-identity rules, eligibility
   and every saved ending are unchanged.

### Alternatives considered

- **Clear the three fields where the record read lands, as ADR 430 did for
  `failed`.** Rejected. A roster press always makes a record read, so this would
  have fixed the reproduction. But it ties the form's lifetime to a network read
  rather than to the record's identity. Any future re-read of the same held
  record (a refresh, a retry of the record read) would then silently discard a
  draft with no change of record. R452 names the identity change as the rule.
- **Add the three clears to `openRecord` and `closeRecord`.** Rejected: that is
  the second copy of the rule the issue forbids, beside `mount`'s branch.
- **Keep a draft per record identity, so leaving and reopening A restores A's
  words.** Rejected: that is a new behavior no door has today. The address door
  already starts empty, and R452 asks for a clear.

### Ledger

No replay story reads the later-conclusion form, and none reads anything this
change moves. The stories that open or leave a record keep their reads (S52's
finished-change handoff; S105's and S110's roster press and reload; S112's
loading frames; S142's and S143's roster press). They are replayed unchanged as
regression.

A story for the carry-over itself is not reachable. It needs two expired
Trials, and no committed case store serves more than one: an in-process roster
read of every registry case store and the reconciled showcase found exactly one
`expired_unreviewed` Trial each on c4-isf and c4-profile, and none elsewhere.
Story ids S180–S181, reserved for this ticket, stay unused.

The ledger still records the change, because a revision that changes shipped
behavior amends the frozen ledger. A dated `## #452 amendment — 2026-09-23`
section states the changed behavior, names the node test as its proof, and lists
the later-conclusion handlers as node-test-only in a handler inventory table.
This follows the #430 amendment's `none — node test only` row. The form arrived
in #411 with no ledger row, and this section closes that gap. The inventory
stays at 171 issued · 152 active · 19 retired.

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
from here"); coordinator ruling R452.

### Consequences

- The finished-change handoff (`follow-up.js` → `openRecord`) can no longer
  bring an earlier record's later-conclusion state into the finished record or
  the next one opened after it.
- Opening or leaving a record abandons any read still in flight for the record
  left. No control reaches that state today, because the loading frames carry
  no Back to records. An abandoned read still cannot land on the next record.
