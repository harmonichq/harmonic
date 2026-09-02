# Proposal — QA E2E coverage eras

## Why

The QA database has a dense, servable showcase, but its three-case catalog does
not prove the analyzer states that may act, hold, remain quiet, or appear in
history. Thin fixtures can hide safety failures by writing verdicts directly or
checking only a subset of produced rows.

Coverage cases also need family-correct history depth. The analyzer derives I:C
observation age and ISF replay eligibility from the full store, so one fixed
30-day source span cannot reach the required states honestly.

## What changes

- Extend the catalog expectation contract to exact analyzer rows, queue rows and
  absences, support values, staging verdicts, all-row ISF rest windows, and one
  projected history series per active I:C identity.
- Give each case an imported-constant-derived source span and add analyzer-fed
  basal, ISF, and I:C cases, including explicit collecting and history cases.
- Add generator support for emitting any named case to an uncommitted,
  provenance-stamped store for no-fetch UI work.
- Keep the committed QA database showcase-only and byte-identical while recording
  fixed size and runtime budgets for the expanded isolated suite.

## What stays out

#193 owns behavioral and verdict-band eras. A follow-on ticket owns the remaining
migration, revise-e2e retirement, and agent guidance for maintaining eras and using
case stores during UI decisions.
