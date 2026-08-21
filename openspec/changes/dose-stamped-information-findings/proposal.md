# Dose-stamped history items (#22)

## Why

ADR 20 preserves an I:C measurement after its programmed setting has been
retired, but only the currently programmed regime may assert a move. The shipped
Diagnose surface has no settled destination for that historical read. Without
one, a later build could make past evidence look like a recommendation or quietly
discard it.

## What changes

- Add `history` to the Register vocabulary for a tuning Audit item measured under
  a setting that is no longer programmed.
- Record the row, selection, case-file, history-event projection, decay, and
  retirement contract for that item in ADR 22.
- Reuse the shipped Diagnose inspector, Watching section, existing `noted` tier,
  and `By clock` / `By event` projections without creating a mock or lock manifest.
- Preserve every existing assertion, staging, Plan, and selection rule except the
  explicit history-retirement transition ADR 22 adds; ordinary clock exclusion
  continues to follow ADR 62.

This change settles the destination only. The separate option-C build will add
the analyzer, projection, fixtures, and running-app behavior against this
decision.

## Risk authority

ADR 22 is normative. The ticket work order carries an exact execution copy of its
risk contract; the scope ledger is the non-normative session record.

## Impact

Documentation only: `CONTEXT.md`, the issue-22 scope ledger, and this OpenSpec
change. No analyzer, projection, frontend, fixture, or behavior-ledger code changes
in this ticket.
