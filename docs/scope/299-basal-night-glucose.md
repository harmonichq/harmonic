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

## Review rounds

- Round 1 (cold Opus, BLOCKED, 9 blockers + 1 note, all `authoring`): missed
  second generated fixture (analysis.json); trace shape contradiction (order
  cited the event chart's relative bins, the shipped consumer eats
  detail.glucose absolute-t points); slot-0 −60 lead midnight trap; unnamed
  JSON keys; unspecified denominator/boundaries/density; steered into a third
  nearest-reading copy instead of CgmSeries.nearest; generator data cannot
  exercise the new facts; no frozen-verdict acceptance anchor; unstated
  payload growth; projection fail-closed unstated. All reproduced, fixed at
  55255e8.

- Round 2 (same reviewer, BLOCKED, 3 blockers, all `injected` by round-1
  fixes): trace parity claimed {t, bg} but detail.glucose is {t, minute, bg}
  and the validator requires all three; the ADR overclaimed that absolute t
  settles the midnight trap (the shipped match is date-blind — #291 owns
  full-timestamp matching); the gappy-night scenario contradicted roster
  formation (a roster night needs clean samples, so the construction is
  lead-only CGM with a null in-window mean). All reproduced, fixed at ff95ecf.

- Panel 2 (fresh cold Opus, BLOCKED, 3 blockers + 1 note; 1 & 2 `authoring`,
  3 `injected` by round-1's byte-identity anchor, note `authoring`): trace `t`
  format unpinned between the case file's space-separated FMT and the roster's
  ISO-T; slot 47's window end inexpressible by the clock-time replace idiom
  (silent null must-prevent); the byte-identity expectation unsatisfiable for
  the fixture whose synthetic input the generator task rewrites; naive window
  scan is a cold-path regression, bisect instead. All reproduced, fixed at
  1b01f9f.

- Panel 3, the cap (fresh cold Opus, BLOCKED, 2 blockers + 1 note; blocker 1
  `injected` by round-1's fail-closed wording, blocker 2 and the note
  `authoring`): required-key mandate would 500 the 15 empty-roster slots —
  restated as unconditional stamp, presence-only check, null a served fact;
  the slot-0 lead's prior-date stamping had no owed test (wrong date would
  freeze green into the fixture); growth figure understated ~2-3x (984 nights
  measured). All reviewer-specified mechanical fixes, applied at e0a54dd,
  re-verified same-round by the panel-3 reviewer per the mechanical-fix rule.

## Spawned tasks

(none yet)
