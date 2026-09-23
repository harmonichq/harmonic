# #430 An open change record loads its Before/Trial comparison

## Status

**Triage source for #430.** An ordinary ticket change. The inherited desk
revise contract (`mockups/harmonic-v2-desktop.behavior.md` and its replay)
stays frozen. This change amends S112 and adds S142–S143 beside it.

## Why

Opening a setting change that is still open from Changes → View change record
shows an empty stage: "Before · unavailable", "After · no readings yet", "no
clock envelope is retained for this record", "0 → 0 half-hours read", "No glucose
outcome is served for these periods" and "No period is served for this
comparison". Glucose data exists on both sides of the change. The record exists
to answer "did my change work?", and it gives no answer.

The record opens in its saved (Original) read. For a change with no saved
ending, that read carries no comparison by contract. The comparison needs a second
request, for the retained-context reassessment, and the desk sends it only
when the reader presses Retained context or Current policy. The backend already
serves it. On the committed synthetic stores, an open record's retained read
returns both evidence periods, clock bins on both sides and its outcome rows.

The empty figure also misreports why it is empty. A comparison that was never
requested, one the backend served as unavailable, and a saved ending that kept
its rows but not its curve all print the same "no clock envelope is retained"
line and draw an empty chart. "First seen" prints when Harmonic first
recorded the change. That can be one shared time for every change found in a
single reconcile pass, and it reads like the pump's own date.

## What changes

- A record with no saved ending opens on its retained-context reassessment
  without another action. It is read after the record itself, and each read
  gets its existing named loading text. The reassessment stays labelled as a
  reassessment beside the original and never replaces it. An ended record
  still opens on its saved ending.
- The record figure names which empty state it is in: not requested,
  unavailable (with the served reason in words), a saved ending that kept no
  curve, or no readings yet. It draws a chart only when there is a clock
  envelope to draw. The periods note, the outcomes note and the stage meta
  follow the same distinction.
- "First seen" becomes "Recorded by Harmonic", so it cannot be read as the
  pump's detected time.

## Not in this change

- Backfilled records that never end. Reconciliation records an ending only for
  the frontier record and the newest one. This split out to its own issue under
  the operator's D4 ruling (2026-09-23).
- The raw reason tokens on the original-context line and the Focus "What
  changed" line. #426 owns both.
- The comparison engine, evidence periods, readiness criteria, caps, floors,
  admission, the result cache and every backend read or write.
- Pump writes, real-data reads and vendor fetches.
