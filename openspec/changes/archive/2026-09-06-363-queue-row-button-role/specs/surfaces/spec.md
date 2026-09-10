## ADDED Requirements

### Requirement: A findings-queue row is exposed as the control it is

Every Diagnose findings-queue row that drills into a finding SHALL be exposed to
assistive technology as an activatable control, and SHALL keep its position within
the queue's list. The row's list membership SHALL NOT be bought by overriding the
control role: the row element SHALL carry no `role` that replaces its implicit
`button` role, and list semantics SHALL be carried by an enclosing element
instead.

This requirement governs exposure only. The queue's rendered geometry, its
keyboard behaviour — Tab order, Enter and Space activation, and the focus ring —
and the row identity and state hooks that the shipped browser suites and frozen
behaviour replays locate SHALL be unchanged by satisfying it.

#### Scenario: A reader navigating by control reaches every finding

- **WHEN** the findings queue has painted its rows
- **THEN** each row that drills into a finding is exposed with the `button` role
- **AND** a query for a control by that row's own title matches exactly that row
- **AND** the row is still exposed as an item of the queue's list

#### Scenario: The queue's ranked and unranked rows are exposed alike

- **WHEN** the queue paints ranked rows, tier captions, the unranked-tail note and
  unranked tail rows together
- **THEN** every drilling row, ranked or unranked, is exposed with the `button`
  role
- **AND** the rank numeral remains hidden from assistive technology, because the
  row's list position is still announced

#### Scenario: Restoring the role moves nothing a reader can see

- **WHEN** the queue is painted with ranked rows, a tier caption, the
  unranked-tail note and two consecutive unranked tail rows
- **THEN** the vertical gap between each painted piece's rendered box and the next
  one's is the gap it was before the row's control role was restored, including
  the tightened gap the tail note and the consecutive tail rows share
- **AND** Tab reaches every row in visual order, and Enter and Space each drill
