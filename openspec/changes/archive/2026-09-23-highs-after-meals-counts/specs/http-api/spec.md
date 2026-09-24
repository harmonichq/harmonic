## MODIFIED Requirements

### Requirement: Finding case files are bound to one snapshot preparation.

The system SHALL satisfy the following:

`GET /api/diagnose/finding-case-file-preparation` builds the active Findings queue and
its case-file population inside one SQLite read snapshot. It returns an opaque,
versioned preparation identity beside server-rendered rows. `GET
/api/diagnose/finding-case-file` requires that preparation identity, the published
lever-and-window Finding coordinate, an alignment, and an optional Occurrence
coordinate; it projects only from the retained preparation rather than recomputing
against a newer population.

The preparation registry is bounded, expiring, lock-coupled, and single-flight.
A data-version bump prevents an in-flight older preparation from becoming newly
addressable. An expired or unknown well-formed id returns `409 stale_projection`;
malformed coordinates return `400 invalid_request`; an unavailable Finding or
Occurrence returns the contract's explicit unavailable state. These routes do not
widen or replace `/api/diagnose/findings`, `/api/explore/exposures`, or the event-
comparison endpoint.

For the Missed / unannounced meal Finding's event projection, the server owns two
separate comparison cohorts: Highs attributed to Missed / unannounced meal and
all completed carb-bolus announced meals, regardless of outcome. It anchors the
first at detected rise onset and the second at completed carb-bolus time, using
the fixed `[-60, +300]` minute window, and publishes the missed and announced
counts and the count of Highs outside the comparison, including an explicit zero
state. This comparison account is independent of the Finding's five-way High
verdict denominator and does not replace the High roster or attribution account.

#### Scenario: Finding case files are bound to one snapshot preparation.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: Missed meal publishes the Highs outside its comparison

- **GIVEN** a synthetic store whose Missed / unannounced meal case file has six
  Highs, two attributed and one near miss
- **WHEN** its event case file is requested
- **THEN** the response serves missed 2, nearly matched 1, the announced count, and
  3 Highs outside the comparison
- **AND** it serves no not-comparable count
