# #414 implementation checklist

## 1. Roster read cost and edit key (backend)

- [ ] 1.1 Bound the retained-record reading read to each record's own window
  (`changed_at` to `min(now, changed_at + mature window)`), once per record,
  through the store's existing bounded read; `_maturing` and `_data_gaps`
  receive the same in-window times they use today. The single whole-table read
  in `_reviewable_trials` (candidate detection) stays. Public-interface test:
  on a store with several retained records the per-record reads carry bounded
  start/end, one per retained record, and the roster returns the same maturity
  and gap facts as before.
- [ ] 1.2 Serve `edit` on every retained trial roster row and an `edits`
  summary (key, first and last change instants, member count, parameters) on
  the roster response, chaining retained records whose `changed_at` are within
  the existing one-day profile tolerance of the previous retained record in
  time order. Detected-but-unretained trials and Focus records carry no key and
  do not chain. `parameters` is an ordered list of `{parameter, count}`.
  Fixture coverage for a chain that spans two days, two chains one day apart,
  and a single record.
- [ ] 1.3 Serve `input_revision` on `/api/status` (the store's input data
  revision, the same scalar the fixed Diagnose payloads carry as
  `input_data_age.revision`), with its API test.
- [ ] 1.4 Add an **Edit** entry to `CONTEXT.md`: a run of retained setting
  changes within a day of each other, grouped for reading in Changes; not a
  Plan, not a Trial identity. Avoid: episode, session, batch.

## 2. Diagnose retention (desk)

- [ ] 2.1 Keep the Diagnose workstation alive across destination changes:
  detach its root on leave, re-seat it on return, resize its charts, run only
  the focus-action repaint, and issue no served read on return. Retain the
  reader's window, drilled subject and reading scroll. Re-read (and then run the
  entry restoration as today) only on Retry, on a contextual entry whose
  subject, occurrence or window differs from the retained entry, or when one
  status read on return shows `/api/status.input_revision` differing from the
  `input_data_age.revision` the retained analysis payload carried.
- [ ] 2.2 Failed reads keep their existing frames (S19, S20): a retained desk
  never presents a stale result as a new one after a failed re-read.

## 3. Changes roster and loading text (desk)

- [ ] 3.1 List one entry per served edit with two or more members, its member
  rows beneath. The entry's title is "<count> setting changes", its detail line
  the served parameters rendered through the setting names with counts
  ("Basal ×11 · Carb ratio"), its stamp the first-to-last change span; its Ended
  cell shows the shared ending when every member agrees and "<n> ended ·
  <m> open" otherwise; each member row keeps its exact record route. A
  one-member edit and every row with no served key (unretained detected
  trials, Focus records) keep today's flat row form in the same time order.
- [ ] 3.2 Add `not_selected_for_watch: 'Not watched'` to the desk's existing
  status word table; the token never prints.
- [ ] 3.3 Name the loading frame's text for the roster read and for a
  reassessment through the existing loading frame seam.

## 4. Behavior ledger and replay

- [ ] 4.1 Add fail-first app-only stories S108–S112 to
  `mockups/harmonic-v2-desktop.behavior.md` and register them in the v2 replay:
  during a tab round trip the only request Diagnose issues is one status read,
  and the 24 h window stays; the drilled subject and reading scroll survive a
  round trip; the record roster shows one titled entry for the two-day chain
  with members beneath and one flat row for the lone record; the Still open
  cell carries a word;
  the roster and reassessment loading frames carry their named text.
- [ ] 4.2 Replay the touched stories at 1280×720 and 1440×900 while iterating;
  run the complete v2 ledger once per size on the commit to be pushed.
