# ADR 25 — The correction-factor detail states the analyzer's direction, not its recommendation

## Context

`analyzers/isf` can assert a direction without producing a number: a weaken owned
by recurring correction-caused lows is direction-only (adr-468), so
`evidence.direction` is `"weaken"` while `recommended` stays `None`. The findings
projection reads `evidence.direction` — the one ISF predicate — and lists the row
as asserting.

The Diagnose workstation's ISF detail level did not. Ported verbatim from the
archived cockpit mock, it derived its verdict from `recommended != null`, and so
printed "no direction asserted" in the heading, the recommendation qualifier and
the foot note, directly above the analyzer's own sentence saying the correction
factor eases weaker — and directly contradicting the queue row the reader clicked
to get there.

The workstation's browser suite carried a note calling that verdict state
"#636-invented UI, correctly absent from the verbatim port". That note reasoned
from `mockups/diagnose-workstation.synthetic`, whose ISF evidence carries only
`rest_windows` — no `direction`, no `night_fits`. Neither the mock nor the fixture
could reach the state. Real data reaches it routinely.

## Decision

The detail level's verdict comes from `evidence.direction`; stageability stays
`recommended != null`. The two are answered separately by `isfVerdict`
(`frontend/diagnose-workstation-data.js`), and the direction-only refusal line is
DESIGN.md's voice rule 7 verbatim.

Where the two records collide, **DESIGN.md's voice register governs the copy and
the port ledger's note is corrected**, not the other way round: the ledger note
generalized from a fixture that under-specifies the analyzer's output, and a
surface that prints a refusal over its own weaken sentence fails the register it
is held to either way.

Support is counted as the nights the estimate is clustered on (`night_fits`,
#177), not the rest windows detected. A detected window that produced no fit
supports nothing, and counting windows made the detail claim 27 where the queue
row claimed 24 for the same reading.

## Consequences

- One predicate per surface for the correction factor's direction, matching the
  shape the basal and carb-ratio invariants already have. No frontend gate
  re-derives it.
- The demo fixture's generator now supplies both lists (24 fits across 27
  windows), so a capture can no longer hide the distinction.
- Coverage for the direction-with-no-number state lives in the fast gate, because
  the demo fixture's row is still held.
- Whether such a finding should be ranked where it is, and whether the correction
  factor gets a surface of its own, are open: issue 26.
