# #414 implementation checklist

## 1. Roster read cost and edit key (backend)

- [x] 1.1 Bound the retained-record reading read to each record's own window,
  once per record, through the store's existing bounded read. The store's read
  is half-open `[start, end)` while the maturity and gap filters are
  `(changed_at, end]`, so request `[changed_at, end + 1 s)` with
  `end = min(now, changed_at + mature window)`; `_maturing` and `_data_gaps`
  receive the same in-window times they use today, including a reading at
  exactly `end`. The single whole-table read in `_reviewable_trials` (candidate
  detection) stays. Public-interface test: on a store with several retained
  records and one fixture reading placed exactly at a record's `end`, the
  per-record reads carry bounded start/end, one per retained record, and the
  roster returns the same maturity and gap facts as before.
- [x] 1.2 Serve `edit` on every retained trial roster row and an `edits`
  summary (key, first and last change instants, member count, parameters) on
  the roster response, chaining retained records whose `changed_at` are within
  the existing one-day profile tolerance of the previous retained record in
  time order. Detected-but-unretained trials and Focus records carry no key and
  do not chain. `parameters` is an ordered list of `{parameter, count}`.
  Fixture coverage for a chain that spans two days, two chains one day apart,
  and a single record.
- [x] 1.3 Serve `input_revision` on `/api/status` (the store's input data
  revision, the scalar the result cache validates fixed results against), with
  its API test.
- [x] 1.4 Add an **Edit** entry to `CONTEXT.md`: a run of retained setting
  changes within a day of each other, grouped for reading in Changes; not a
  Plan, not a Trial identity. Avoid: episode, session, batch.

## 2. Diagnose retention (desk)

- [ ] 2.1 Keep the Diagnose workstation alive across destination changes:
  on leaving to another destination detach its root and disconnect the
  entry-restoration observer only (no surface reset, no case-context reset);
  the pagehide arm keeps today's full teardown; a read completing while the
  root is detached is recorded but not applied, and the next return applies it
  with its restoration; on return show the loading frame until one status read answers, then
  re-seat the root, resize its charts, run only the focus-action repaint, and
  issue no other served read. Retain the
  reader's window, drilled subject and reading scroll. Re-read (and then run the
  entry restoration as today) only on Retry, on a contextual entry whose
  subject, occurrence or window differs from the retained entry, or when one
  status read on return shows `/api/status.input_revision` differing from the
  revision the read recorded: the read issues one status read before its
  payload reads and keeps that `input_revision` (no payload field carries it;
  `input_data_age` is attached only to a labelled stale predecessor). The
  re-read path renders immediately after leaving so the loading frame, never a
  blank desk, stands until the guidance read answers.
- [ ] 2.2 Failed reads keep their existing frames (S19, S20): a retained desk
  never presents a stale result as a new one after a failed re-read. Unit
  coverage through the destination's mount and held cleanup: the pagehide arm
  runs the full teardown; an off-screen read completion does not restore and reaches the desk with
  restoration on the next return; a cold first read and a Retry after a
  failed first read still reach the desk; a render during a pending re-read
  shows the loading frame, never the retained desk.

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
  `mockups/harmonic-v2-desktop.behavior.md`, move the sweep's inventory
  literals (137 / 119 / 18 → 142 / 124 / 18), and register them in the v2 replay:
  during a tab round trip the only request Diagnose issues is one status read,
  the loading frame stands until it answers, and the 24 h window then stays; the drilled subject (reading-pane stack) and
  reading scroll survive a round trip; the record roster shows one titled entry for the two-day chain
  with members beneath and one flat row for the lone record; the Still open
  cell carries a word;
  the roster and reassessment loading frames carry their named text.
- [ ] 4.2 Replay the touched stories at 1280×720 and 1440×900 while iterating;
  run the complete v2 ledger once per size on the commit to be pushed, and
  the Verify behaviour ledger leg once, since its stub payload is regenerated.
