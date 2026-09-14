# #414 v2 desk retention, record-open cost and roster edits

## Status

**Triage source for #414.** An ordinary ticket change. The inherited v2 revise
contract (`mockups/harmonic-v2-desktop.behavior.md` and its replay) stays frozen;
this change adds fail-first app-only stories beside it.

## Why

Returning to Diagnose from Changes or Day discards everything the reader had:
the desk re-issues every guidance read and every rail mini read, and the window
falls back to Overnight. Opening the change records is slow enough on the
self-hosted host to read as a hang: the roster read re-reads the whole CGM
table once per retained record, and the desk shows an empty block meanwhile.
The record list then prints one row per per-slot change, dozens from one
editing pass on the pump, with a raw token under "Still open".

## What changes

- Diagnose stays alive across destination changes: its mounted workstation is
  detached and re-seated rather than torn down and re-read, so a return makes
  one status read and no guidance or evidence read, and keeps the reader's
  window, drill and scroll. A read is
  re-issued only on Retry, on a contextual entry naming a different subject, or
  when the server's last write moved.
- The trials roster read reads only the readings inside each retained record's
  own window, once per record, instead of the whole table.
- The record roster serves one edit key per retained trial record, chaining
  records whose change instants fall within the detector's existing one-day
  profile tolerance; Changes lists one entry per multi-record edit with its
  member rows beneath and leaves single records as flat rows, and the raw watch-disposition token gets its entry in the desk's existing status word table.
- Reading the roster and computing a reassessment each show named loading text
  in the existing loading frame.

## Not in this change

The #413 design round (rail fold, lane key and paint, 24 h default, mini parity,
skeleton loading). Classifier, cap, floor and admission rules. Pump writes, real
data reads, vendor fetches.
