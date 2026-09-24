# Diagnose Finding case files (#79)

## Why

Diagnose currently renders a Finding's counts from `GET /diagnose/findings`,
then reconstructs its case file by joining those keys to a separately prepared
`GET /explore/exposures` response. The browser also maps Finding titles onto a
Meals or Lows event view. A valid Finding can therefore show a nonzero summary
and verdict band while its header and Occurrence roster read `0 of 0`, its row
does nothing, or event alignment silently returns to clock alignment.

The defect is systemic. It has been observed on correction, meal, and high
Findings; Highs are one missing projection, not the root cause.

## What changes

- Add one server-owned Finding preparation, materialized inside one SQLite read
  snapshot. A new, separately named preparation schema returns a case-file-ready
  ranked queue plus an opaque `projection_id` that binds its rows to case files;
  the authoritative Findings projection stays nested and unchanged. Canonical
  recurrence opportunities and a private attribution association supply the
  denominator, attributed count, verdict counts, complete Occurrence roster,
  selection, and chart. Noncanonical attribution is withheld, not invented.
- Read the case-file family from the Lever's declared Exposure. Retire the
  browser's title-keyed Meals/Lows map and every browser-side membership join.
- Add case-file event projections for correction-cluster and Highs populations
  without changing the legacy comparison endpoint, classifier verdicts, or
  comparison-support floors.
- Revise the shipped Diagnose workstation and its frozen behavior ledger. The
  browser regression serves independently shaped preparation and case-file endpoint
  responses so a shared injected fixture cannot mask the production seam again.

## Risk contract

- **Must prevent:** a visible Finding reporting counts from one population while
  its roster or chart shows another; a visible Finding row swallowing a click;
  silent fallback from event to clock alignment; frontend re-derivation of
  Exposure family, membership, verdict, support, or inspectability; real pump or
  patient data entering fixtures, screenshots, Git history, or public CI output;
  any change to analyzer verdicts, Priority, staging, Plan, or pump-setting
  advice.
- **Must recover:** an active failed or stale case-file request preserves the last
  internally consistent queue/inspector/canvas generation and reports the failure; a browser
  response superseded by newer coordinates is discarded without changing state or
  raising a false error. Neither path mixes populations or silently changes
  alignment.
- **Accepted failure:** if the server cannot construct an inspectable case file,
  it fails that projection clearly and the browser preserves the prior state; it
  does not publish a successful Finding with invented or empty supporting
  Occurrences. Recovery is a later successful projection after the underlying
  data/cache version changes.
- **Unsupported:** live vendor fetches; real-data browser evidence; changing
  classifier thresholds, comparison-support floors, event-alignment support
  semantics, or the planned historical Carb-ratio contract from ADR 22.
- **Evidence owed:** public endpoint tests proving one case-file population owns
  every displayed count and Occurrence; analyzer-built synthetic cases for Meals,
  Lows, correction clusters, and Highs; browser replay using independently served
  production-shaped responses (not one shared injected object); visible-row open,
  roster selection, event persistence, high case-file, failure-preservation, and
  no-silent-no-op stories; full fast, drift, and browser gates through the declared
  no-fetch synthetic server.

Why: Diagnose evidence can influence advisory insulin-dosing decisions; a
plausible count paired with empty or unrelated Occurrences is silent incorrect
success.

## Impact

The HTTP and shipped Diagnose evidence interfaces change. Analysis, scenario
classification, Priority, tuning assertions, staging, Plan, and pump-profile
delivery do not. Existing Findings, Explore, and event-comparison endpoints retain
their contracts for other callers; the shipped browser moves to the new
preparation/case-file pair and no longer composes independent populations.
