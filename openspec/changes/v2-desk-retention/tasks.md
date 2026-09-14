# #414 implementation checklist

## 1. Roster read cost and episode key (backend)

- [ ] 1.1 Bound the retained-record reading read to each record's own window
  (`changed_at` to `min(now, changed_at + mature window)`), once per record,
  through the store's existing bounded read; `_maturing` and `_data_gaps`
  receive the same in-window times they use today. Public-interface test: the
  roster read on a store with many retained records issues bounded reads and
  returns the same maturity and gap facts as before.
- [ ] 1.2 Serve `episode` on every trial roster row and an `episodes` summary
  (key, first and last change instants, member count, parameters) on the
  roster response, chaining records whose `changed_at` are within the existing
  one-day profile tolerance of the previous record in time order. Serve a
  reader word for `watch_disposition` values alongside the token. Fixture
  coverage for a chain that spans two days, two chains one day apart, and a
  single record.

## 2. Diagnose retention (desk)

- [ ] 2.1 Keep the Diagnose workstation alive across destination changes:
  detach its root on leave, re-seat it on return, resize its charts, and issue
  no served read on return. Retain the reader's window, drilled subject and
  reading scroll. Re-read only on Retry, on a contextual entry naming a
  different subject, or when `/api/status.last_written` differs from the value
  read at the last Diagnose read.
- [ ] 2.2 Failed reads keep their existing frames (S19, S20): a retained desk
  never presents a stale result as a new one after a failed re-read.

## 3. Changes roster and loading text (desk)

- [ ] 3.1 List one entry per served episode with its member rows beneath; the
  entry's Ended cell shows the shared ending when every member agrees and the
  counts otherwise; each member row keeps its exact record route.
- [ ] 3.2 Print the served reader word for watch disposition; never the token.
- [ ] 3.3 Name the loading frame's text for the roster read and for a
  reassessment through the existing loading frame seam.

## 4. Behavior ledger and replay

- [ ] 4.1 Add fail-first app-only stories S108–S112 to
  `mockups/harmonic-v2-desktop.behavior.md` and register them in the v2 replay:
  a tab round trip fires no served read and keeps the 24 h window; the drilled
  subject and reading scroll survive a round trip; the record roster shows one
  entry per episode with members beneath; the Still open cell carries a word;
  the roster and reassessment loading frames carry their named text.
- [ ] 4.2 Replay the touched stories at 1280×720 and 1440×900 while iterating;
  run the complete v2 ledger once per size on the commit to be pushed.
