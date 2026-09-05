## REMOVED Requirements

### Requirement: The charts drawer is a picker that opens minimized

**Reason:** Connor approved removing the docked strip and opening All charts directly fullscreen. The retired mode duplicated queue previews.
**Migration:** Use the All charts browser requirement below; preserve the shared finding drill route and selected-chart Expand.

### Requirement: The Diagnose findings rail is a tapered queue read off served order and tier

**Reason:** Connor selected consistent ranked-row geometry in arrangement A.
**Migration:** Use the consistent queue requirement below. Preserve served ordering, tiers, support, unpriced-tail and Watching semantics.

## MODIFIED Requirements

### Requirement: The Diagnose stage holds the active finding's chart

The Diagnose evidence stage SHALL hold the active finding's chart: the
rank-1 finding's chart while the findings queue shows, the drilled finding's
chart while a drill is open, and the rank-1 chart again when the reader leaves
the drill. A queue-row activation SHALL immediately open its existing finding
details; there SHALL be no preview-only intermediate step or additional Open
finding action. A chart picked from All charts SHALL open that chart's finding
through the existing shared chart-click route. All charts SHALL mark its current
stage chart when it is reopened. Existing parameter-specific clock-window
release rules SHALL remain unchanged on queue and chart entry paths.

#### Scenario: A row opens details immediately

- **GIVEN** a queue with a lower-ranked finding
- **WHEN** the reader clicks its row or presses Enter on it
- **THEN** the existing details occupy the inspector and that finding's chart occupies the stage
- **AND** the Findings breadcrumb returns focus and scroll to the originating row while restoring the root stage's normal rank-1 choice

#### Scenario: Leaving a drill returns the rank-1 chart to the stage

- **GIVEN** a populated synthetic Diagnose window whose rank-1 finding differs from a lower-ranked one
- **WHEN** the reader drills the lower-ranked finding and then returns to the findings queue
- **THEN** the stage holds the rank-1 finding's chart
- **AND** reopening All charts marks that current chart rather than the chart just left

#### Scenario: An explorer pick opens the finding

- **GIVEN** All charts is open, including its Watching reads
- **WHEN** the reader activates a chart
- **THEN** All charts closes and the chart's existing finding/details route opens in the inspector with the matching stage evidence
- **AND** settings entry retains its existing per-parameter drawn-window behavior

### Requirement: The stage card's title is the headline's only home

The Diagnose stage card's title SHALL render the active row's served headline
verbatim and SHALL be its only home on the surface: the chart SHALL NOT draw
it, queue and All charts cells SHALL keep the short nameplate, and no drill
level SHALL repeat it.

#### Scenario: The stage title is the headline's only home

- **GIVEN** a populated synthetic Diagnose window
- **WHEN** any family's chart holds the stage
- **THEN** the stage title uses that row's served headline
- **AND** queue minis and All charts previews contain no duplicate headline

### Requirement: A revision of the Diagnose findings rail ships with its ledger amendments and evidence

A revision of the shipped Diagnose findings rail and its surrounding evidence
layout SHALL amend the frozen behavior ledger and its app-only replay for every
added, changed, moved or retired behavior in the same change. Retirements SHALL
retain their dated operator sanction and executable absence witness. Before/after
renders SHALL cover the affected queue, detail, clock-selection and expanded-view
states from base and revision on matching synthetic inputs. The complete replay
and repository merge gates SHALL pass before the implementation PR opens.

#### Scenario: The replay proves the revision

- **WHEN** the amended replay and repository gates run against the built revision
- **THEN** every applicable story executes with zero failures and each retired behavior retains its attributed absence check
- **AND** inspected synthetic before/after renders demonstrate the required arrangement and reachable controls at desktop, short and narrow viewports
- **AND** the runnable exploratory wireframe has been removed before the implementation PR opens

## ADDED Requirements

### Requirement: Diagnose places selected evidence before the clock overview

At desktop widths, Diagnose SHALL place the spotlight at the top of the left
pane below the clock-window controls, the glucose-by-time-of-day overview and
its basal verdict lane beneath the spotlight, and the findings/details
inspector on the right. The active clock range SHALL remain visible beside the
window controls. The overview SHALL retain its existing plotting, readout, drag, resize,
slide, preset, touch and basal-lane behaviors. The right pane's persistent
watched-change floor SHALL remain available in both queue and detail states.

#### Scenario: Read evidence after choosing a window

- **WHEN** the reader chooses a clock-window preset on a desktop viewport
- **THEN** the spotlight precedes the glucose overview and the active range remains visible above both panes
- **AND** the queue and spotlight describe the same served window

#### Scenario: A narrow or short viewport retains the controls

- **WHEN** the viewport cannot fit the desktop columns or the usual spotlight height
- **THEN** phone widths present Spotlight, the overview, complete Findings rows and Watching in one shell-owned vertical reading flow without document-level horizontal overflow
- **AND** the overview's time selection, finding details, watched-change state and fullscreen exit remain reachable by keyboard and touch
- **AND** All charts and single-chart fullscreen remain temporary viewport-owned states whose dismissal preserves the prior reading position

### Requirement: Ranked findings share one aligned row structure

Every shown priced ranked row SHALL use the same rank, short title, served
annotation where already applicable, support/action detail, type label and
drill-affordance columns, with a matching full-width mini preview below the text.
The first row SHALL use that same
structure without a hero card, unique shadow, enlarged title, or special height.
Wrapped content MAY increase row height when needed; rank alone SHALL NOT.
The root stage's current row SHALL have a restrained non-geometric selected
state, separately recognizable from its rank number. The queue SHALL retain
server order and existing filtering semantics and SHALL derive no clinical
rank, tier, eligibility or verdict. Tier captions SHALL appear at the beginning
of each contiguous served priced-tier group using the existing tier-word map.
Unpriced tail rows SHALL retain their title-only seam. Watching reads SHALL
retain their disclosure and drill paths, with available chart previews when expanded.

A mini SHALL use the descriptor's already fetched evidence in a purpose-built
queue preview. It SHALL preserve served observations, support and gaps without
inventing values. Preview rendering SHALL cause no additional analysis request
and SHALL leave full-size chart options unchanged. All priced rows, including
the first, SHALL reflow their preview below readable text at narrow widths.
The existing minimum readable mini-width policy remains the fallback if a host
cannot meet that floor; text and drill affordances SHALL remain available.
Pending, empty, failed
or stale evidence SHALL use the existing state presentation, never fabricated
curves or fabricated counts.

#### Scenario: Ranked rows align regardless of rank or type

- **GIVEN** synthetic ranked settings and habit findings with mixed-length titles
- **WHEN** the queue is rendered at a width that admits minis
- **THEN** rank, type and drill columns align across every priced row, with equally sized full-width preview wells below the text
- **AND** the top row has the same structure and a mini governed by the same rules

#### Scenario: Filtering changes order visibility, not geometry

- **WHEN** the reader filters the queue so a different priced row becomes first
- **THEN** the existing served-order projection determines the shown order and the root stage selection
- **AND** no promoted row becomes a hero card or loses its mini solely because it is first

#### Scenario: Minis remain honest at narrow widths and during failures

- **WHEN** the queue is rendered at phone or tablet width
- **THEN** available previews reflow to retain readable chart wells and can scroll fully into view
- **AND** a host below the existing readable-width floor is omitted, while an unready descriptor uses the normal evidence-state presentation
- **AND** every affected row still opens its existing finding details

### Requirement: All charts opens fullscreen without an intermediate dock

The Charts control SHALL directly open the full-screen All charts browser over
the Diagnose workspace, including both panes and the overview. There SHALL be
no bottom-docked or raised chart strip, dock resize floor, bring-up toggle, or
intermediate dock state. The browser SHALL reuse the existing live chart
catalog, chart renderers, identities, selection and drill routes, including
Watching and non-ranked chart access. It SHALL offer every chart currently
available through the existing explorer, not only rows visible in the ranked
queue. A visible Close control and Escape SHALL dismiss it without changing the
selected finding, clock window, inspector level or underlying scroll position,
and restore focus to Charts. Browser scrolling SHALL keep the exit reachable;
underlying workspace controls SHALL not receive interaction while it is open.
The spotlight SHALL retain its separate single-chart Expand view and its existing
chart controls and return behavior. No browser/OS fullscreen API is required.

#### Scenario: One action opens All charts

- **GIVEN** the normal Diagnose workspace, whether at the queue or a finding detail
- **WHEN** the reader activates Charts by click or keyboard
- **THEN** the full-screen browser opens directly with the current chart marked and all eligible catalog entries reachable
- **AND** no docked-strip state is entered or rendered

#### Scenario: Dismissal preserves the working context

- **GIVEN** a lower-ranked finding is open under a drawn window with a scrolled inspector
- **WHEN** the reader opens All charts and dismisses it through Close or Escape without choosing
- **THEN** the previous finding, clock window, inspector level and scroll remain unchanged and Charts regains focus

#### Scenario: Watching remains reachable independently of the ranked queue

- **GIVEN** Watching or unranked charts exist outside the visible ranked rows
- **WHEN** the reader opens All charts and chooses one of those charts
- **THEN** it uses the same existing chart/finding route and served evidence as before the dock's removal

#### Scenario: Single-chart expansion is independent of browsing

- **WHEN** the reader expands the spotlight chart and then closes it
- **THEN** the one chart occupies its full-screen view and returns to its prior context without opening All charts or a dock

#### Scenario: Resize cannot resurrect the retired strip

- **WHEN** the viewport crosses former dock breakpoints while the workspace, browser or single-chart view is active
- **THEN** no docked or raised strip, dock toggle or dock-dependent transition becomes available
