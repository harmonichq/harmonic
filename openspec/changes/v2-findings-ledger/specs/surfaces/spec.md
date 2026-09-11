## ADDED Requirements

### Requirement: The desk renders served Pattern evidence and preserves selection

The v2 desk SHALL render Pattern members as parent-owned expandable content with
their served event labels, mini evidence and useful selected occurrence
detail. A short event noun, if needed, SHALL be supplied by the backend. When
selected occurrence glucose is served, the chart SHALL draw its distinct selected
trace at the correct event-relative times and units. Selecting a roster row alone
SHALL NOT count as rendering that trace. It SHALL render served selected markers where the selected evidence
family supplies them, and it SHALL keep missing values visibly unavailable rather
than synthesizing detail. It SHALL use the existing case-file route and reject a
stale case-file, selection or window response so it cannot overwrite the newer
reader selection. Each affected evidence family SHALL retain a public-interface
proof of its selected handoff.

#### Scenario: A later selection wins an in-flight response

- **GIVEN** a selected Pattern request is in flight while the reader changes
  occurrence or clock window
- **WHEN** the earlier response arrives after the later request
- **THEN** the desk retains the later selected served case file
- **AND** it does not render stale trace, marker, count or membership detail

### Requirement: The v2 desk preserves readable cross-destination evidence chrome

The v2 desk SHALL keep the Diagnose reference rail width in Changes and Day,
including loading and settings-table states. At both supported desktop widths,
expanded rosters and full labels SHALL not collide. All charts and Close SHALL put their labels to the left of their icons. Those
icons and chart expansion controls SHALL stay top-right, including in tall
headers; a taller title SHALL NOT vertically center the control. Clock and
chart controls SHALL use the existing compact density tokens while retaining
accessible interaction. The desk SHALL retain the carried basal legend, verdict
paint and stage-change accent; a thin basal slot SHALL open its own graph. A
count-free skeleton SHALL appear while a destination loads, and a retained
reassessment SHALL name its on-demand loading work.

#### Scenario: Desk geometry survives dense evidence

- **GIVEN** synthetic long-label expanded Pattern members, a tall chart header,
  thin basal evidence and loading Changes/Day/settings-table states
- **WHEN** the desk is rendered at each supported desktop width
- **THEN** labels do not collide, the rail remains at the Diagnose reference,
  header label precedes a top-right action icon, and compact controls remain
  operable
- **AND** basal legend/verdict/accent and named loading remain visible


#### Scenario: Selected detail reaches the chart

- **GIVEN** an ordinary event-comparison, eating-sequence or Pattern case file
  with served selected glucose and evidence markers
- **WHEN** the reader selects its occurrence through the roster
- **THEN** that chart displays the selected trace and supported served markers
- **AND** changing occurrence replaces the selected evidence rather than leaving
  the old trace or only changing the row highlight
- **AND** a missing anchor glucose does not suppress other available detail or
  imply that served CGM is missing

### Requirement: Diagnose and Day keep the reader's navigation context

A custom Window chip SHALL show its time span without repeating the enclosing
Window noun. Selecting a basal slot SHALL open that slot's own graph, including
thin-evidence states, from any preceding Pattern or other chart. Returning from
the slot SHALL restore the reader's preceding whole-day, named or drawn window.
Choosing another Day SHALL retain the mounted stage, reading pane and navigator;
loading SHALL be confined to the content that changes, and completed content
SHALL correspond to the selected day without stale-response replacement.

#### Scenario: A thin slot returns to the same window

- **GIVEN** a Pattern chart and a whole-day, named or drawn window
- **WHEN** the reader selects a thin basal slot and then returns
- **THEN** the slot's own graph was shown and the preceding window is restored
- **AND** a drawn-window chip carries the span without a duplicated Window noun

#### Scenario: Day changes without rebuilding its frame

- **GIVEN** a mounted Day stage, reading pane and navigator
- **WHEN** a different recorded day is chosen and its response is pending
- **THEN** those same nodes remain mounted while the changing content shows loading
- **AND** the accepted response updates the selected day's content without
  allowing an older request to overwrite a later selection

### Requirement: Changes keeps completed and expired Trial records reachable

A confirmed-on-pump Plan with no active watch SHALL expose View change record
through the existing exact-record route. Changes SHALL make an expired Trial
record prominent and reachable, preserve its original ending in the record, and
offer the separately dated late conclusion defined by the durable-follow-up
contract. Reloading a selected record address SHALL retain its exact kind and
identity. Neither record access nor a late conclusion SHALL resume a watch.

#### Scenario: A Plan opens its exact completed record

- **GIVEN** a confirmed-on-pump Plan, its completed Trial and no active watch
- **WHEN** the reader opens View change record and reloads that address
- **THEN** the same Trial record and original ending remain visible

#### Scenario: Expiry remains visible when concluding later

- **GIVEN** an expired Trial that has not been concluded by the reader
- **WHEN** the reader opens its surfaced Changes record and records a late conclusion
- **THEN** the record displays the original expiry and the separately dated conclusion
- **AND** it remains expired with the existing watch-admission behavior
