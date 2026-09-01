# Scope — per-night glucose evidence for a basal slot (#299)

Route: interview mode. A concrete design exists in the issue; its window,
population and aggregate semantics are untested.

## Decisions

- Population: roster nights only — the per-night facts ride `night_roster`, and
  which nights are informative does not change (ticket boundary). `inline`
- Slot norm: every night counts once — mean of each night's own in-window mean,
  same units as the per-night numbers beside it (operator, Q2=A). `inline`
- Trace ships in this ticket, shaped like the case file's served trace
  (`{minute, bg}` five-minute bins): the consumer is the shipped
  trace-over-envelope path on Glucose by time of day, painted when a night is
  selected; #291 wires only the click (operator, Q3=A). `inline`
- Missing CGM on a roster night: null glucose fields, never a dropped night —
  forced by the membership boundary. `inline`
- Edge defaults (operator delegated): entry/leaving = reading nearest each
  window boundary within the analyzer's existing staleness cap, null when none;
  trace spans slot start −60 minutes through slot end, minutes relative to slot
  start (event chart's −60 lead precedent). `inline`

### Risk contract

- Must prevent: any change to `asserts_move`, `safety_status`, roster
  membership, the eight-night floor, or any other safety verdict; glucose facts
  derived anywhere downstream of the analyzer (projection copies only); real
  data in fixtures or logs; silent incorrect success.
- Must recover: none — read-path evidence only, no state written.
- Accepted failure: a roster night without usable in-window CGM serves nulls
  and the surface shows a gap; manual investigation if it surprises.
- Unsupported: per-night exclusion reasons (stays deferred per #290's close);
  non-roster nights.
- Evidence owed: analyzer-output tests built from N nights (never hand-set
  flags); a projection pass-through test; the regenerated fixture with its
  `--check` drift gate green.

Why: backend evidence for an advisory-dosing surface; the analyzer must stay
the sole owner of judgment. Disposition: inline (copied into the work order).

## Open questions

- none.

## Spawned tasks

(none yet)
