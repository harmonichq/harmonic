# #427 Day: the topbar's Day keeps the day last looked at, and the viewed stamp is local

## Status

**Triage source for #427.** An ordinary ticket change. The desk's frozen
behavior ledger (`mockups/harmonic-v2-desktop.behavior.md`) and its replay stay
the contract; this change adds one story beside S60 and amends none.

## Why

A reader who opens a past day from a Diagnose occurrence, then visits Diagnose
and Changes, finds that the topbar's Day reopens that past day rather than the
latest recorded day. That is how the desk already behaves, and Connor has
decided to keep it, but no requirement, decision record, test or ledger story
says so. The next change to Day could silently undo it.

The Day header's "viewed" stamp reads as the reader's local time but is UTC.
In a local evening west of Greenwich it names tomorrow's date. Because the
"read" stamp beside it is local, the rule that folds the two into one stamp
when they share a minute never fires outside UTC.

## What changes

- A decision record (ADR 427) and a surfaces requirement state that the
  topbar's Day reopens the day last looked at for the life of the page. A
  reload opens the latest recorded day, and the plain `/day` address not
  carrying the day shown is accepted.
- A Node test and a new ledger story (S133) pin that behavior.
- The viewed stamp is built from the reader's local clock, so it names the
  date and time the reader viewed at. A read in the same local minute then
  shows as the read stamp alone.
- CONTEXT.md's Day navigator entry says where Day lands on a fresh page and
  where it lands within one.

## Not in this change

Which day a direct Day entry opens does not change. The served read stamp's
zone does not change, and neither does any served payload, analyzer,
classifier, cap or floor. The Log carbs utility's own "at" stamp is not
touched. The Day header's recorded-days count belongs to #425. The Diagnose
address after a Day return belongs to #428.
