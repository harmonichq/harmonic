## ADDED Requirements

### Requirement: Every settings evidence chart opens the parameter panel its queue row opens

A Diagnose settings evidence chart — basal, correction factor, or carb ratio —
SHALL open the same parameter panel that parameter's findings-queue row opens,
resolved from the chart's own published identity against the live findings rows.
The panel SHALL carry the same served facts on both entry paths, including the
backend verdict word, the support count and the staging control, and the surface
SHALL re-derive no floor, threshold, direction or safety verdict on either path.
A settings-chart click SHALL occupy exactly one inspector level: a click while
another parameter's panel stands replaces that level rather than deepening the
breadcrumb. The generic chart level SHALL no longer render a settings readout,
and SHALL remain available to the behavioral placeholder.

#### Scenario: A setting reached by its chart shows what its queue row shows

- **WHEN** the reader clicks a basal, correction factor or carb-ratio evidence chart
- **THEN** that parameter's panel opens, the same one its findings-queue row opens
- **AND** the panel prints the served verdict word and support count
- **AND** offers the staging control only where the backend `asserts_move` verdict is true

#### Scenario: A chart click does not deepen the breadcrumb

- **WHEN** the reader clicks one parameter's evidence chart while another parameter's panel stands
- **THEN** the standing level is replaced by the clicked parameter's panel
- **AND** the breadcrumb depth is unchanged
- **AND** clicking the chart the reader already stands on moves nothing

#### Scenario: The thin settings readout is unreachable

- **WHEN** any settings evidence chart is opened by any gesture
- **THEN** no generic counts-and-roster readout renders
- **AND** the generic chart level still renders the behavioral placeholder for a behavioral chart with no published lever

#### Scenario: Each parameter's chart route keeps its own clock-window behavior

- **GIVEN** the reader has drawn a clock window
- **WHEN** they open a basal or carb-ratio evidence chart
- **THEN** the drawn window is released and the panel's own span governs, exactly as on the queue-row route
- **AND** opening a correction factor evidence chart instead leaves the drawn window standing, exactly as on its queue-row route
