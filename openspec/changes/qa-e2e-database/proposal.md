# Proposal — QA E2E database

## Why

The current `revise-e2e` synthetic database supplies the permitted no-fetch app
server, a browser-gate server, and a public-interface regression test. The QA
database work needs one committed dataset for supervised UI work without turning
that dataset into a simultaneous proof of every coverage case.

## What changes

- Record the QA database contract and the ordered delivery cut: a committed
  showcase era lands before additive coverage eras.
- Record every executable consumer of `revise-e2e` that the eventual migration
  must move or retire together.
- Correct the old-fixture description from the checked source and its
  public-interface test.

## Boundaries

Phase 1 (#190) changed documentation only. Phase 2 (#191) added the generator
and case catalog; the showcase cut of #194 adds the database binary, its CI
drift command and the offline-entrypoint migration. No phase adds a clock seam.
The risk contract in #189 remains authoritative.
