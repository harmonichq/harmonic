# The Queue offers Focus only where the engine admits one

## Why

The Queue drew a Focus button on every Pattern card and every pinnable cause
while a Focus could start at all, and the engine then refused a Focus on any
Pattern that was not ready (#666). The app and the engine each held a rule for
when a Focus is allowed, and they disagreed. The refusal then held "Not saved"
for the rest of the session, since Retry could never save it, and it hid the
Undo bar of every later write.

## What changes

- The Focus list serves, for each Pattern a Focus is admitted on, the causes a
  Focus from it may watch, from the pin's own admission.
- Every Pattern card's and cause card's Focus button is drawn from that verdict.
- A write the engine refused outright (a refusal that is not a conflict) is
  held only until a later write is made or Retry is refused again.
- A follow-up write over a frontier this build reconciled reads no history,
  and every start reconciles a recorded frontier before it serves (ADR 667).
- A reload during a Trial's End waits for the End's write, not its history
  read (ADR 665).

## Impact

A Pattern that is not ready, or that has no habit to watch, offers no Focus on
its card or its drill-down. No analyzer, cap, floor or staging predicate
changes.
