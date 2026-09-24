## ADDED Requirements

### Requirement: A later conclusion stays with the change record it was typed on

The Later conclusion form's typed text, a failed save's message and the save's
request identity SHALL belong to the one change record that is open. Whenever
the open record changes, the desk SHALL drop all three before the next record
renders. That covers a roster press, Back to records, finishing a change that
opens its saved record, and an address that names a different record. The drop
SHALL happen in one place that every one of those doors goes through. The next
record SHALL start with an empty form and no failure, and its first save SHALL
send a request identity of its own as a first save, not as a retry.

Leaving a record for the roster ends its hold, so reopening the same record from
the roster SHALL also start with an empty form, as opening it by its address
does. A re-render of the same open record SHALL keep the typed text, the failure
and the request identity, so that Retry resends the same request identity. That
includes a return from Day to that record.

The conclude endpoint, the request-identity rules, what makes a Trial eligible
for a later conclusion, and every saved ending SHALL be unchanged.

#### Scenario: A different record opened from the roster starts empty

- **GIVEN** a synthetic store serving two expired Trial records, A and B, each
  offering a Later conclusion
- **WHEN** the reader types on A, records it and the save fails, presses Back
  to records, and opens B from the roster
- **THEN** B's Later conclusion form is empty and shows no failure
- **AND** recording on B sends B's conclusion with a request identity different
  from the one A's failed save sent, with no re-read of B before it

#### Scenario: Reopening the same record from the roster starts empty

- **GIVEN** an expired Trial record whose Later conclusion the reader typed and
  whose save failed
- **WHEN** the reader presses Back to records and opens the same record from the
  roster
- **THEN** its Later conclusion form is empty and shows no failure
- **AND** its next save sends a request identity different from the failed one

#### Scenario: A failed save keeps its words and request identity on its record

- **GIVEN** an expired Trial record whose later-conclusion save failed
- **WHEN** the same record re-renders and the reader presses Retry
- **THEN** the typed words and the failure are still shown before the retry
- **AND** the retry sends the same request identity as the failed save
