# Surfaces

## Purpose

Harmonic is a single-page app with a built shell and no login — the HTML shell loads unauthenticated, and the browser renders three destinations, Diagnose, Changes and Day (ADR 397), to answer different questions about the data. Each surface renders read-only server-owned projections; surfaces never re-derive analysis verdicts that belong to the backend.

## Requirements

### Requirement: Diagnose surface asks "what tuning moves are available now?"

The system SHALL satisfy the following:

Diagnose reads the current analysis result and presents a server-ranked queue of tuning findings (Audit). Each finding carries the evidence and severity behind it. The queue register is server-owned and direction-derived, so a direction-only ISF finding may remain visible in the asserted register even though it cannot stage. A setting finding receives a queue rank only when the change it represents can stage: an unstageable direction-only ISF warning follows every priced finding through the existing unranked path, carries no rank numeral, and does not move into Watching. Its underlying analysis Priority remains available outside queue placement. Automatic chart seating follows the server's ranked `assert` and `finding` order. A star retains a live chart without changing that order; if a retained chart leaves rank, it follows every ranked chart and remains ahead of the Watching divider until the reader stops keeping it. Explicit focus may also bring a Watching chart into the field, independently of retention. A staging control and actionable Recommended number appear only when the exact backend `asserts_move` verdict is true; a false or missing verdict fails closed. Findings in the held or still-collecting registers sit collapsed beneath the ranked queue behind a `Watching · N reads` toggle, expandable on demand. Explore mode is retired. Sanction: ConnorGriffin · 2026-08-26 · "Diagnose does NOT need to host an explore mode. we're building a better version of it right now."

#### Scenario: Diagnose surface asks "what tuning moves are available now?"

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Diagnose presents retired I:C regimes as non-actionable Watching evidence

The system SHALL satisfy the following:

An active retired I:C regime appears after held and blind rows in the server's
Watching order. Its queue row identifies a past setting and never shows today's
programmed value. Its case file leads with the analyzer's finished historical
conclusion, then the past setting, measured value, interval, and meal-run support,
followed by exactly one quieter current-program line. `By clock` and `By event`
remain projections of that one selected identity; event selection emphasizes one
whole meal run without changing its published population. The event view keeps the
analysis generation out of rendered copy and lists each run's meal offsets as
rounded whole minutes beneath its date, with the unit printed once per run.

History has no recommendation row, stage control, Priority, chip, Plan entry, or
navigation path to Plan. The surface reads server-owned identity, membership,
lifecycle, selection disposition, annotation, and action fields and derives none of
them from ratios, nulls, support, or ID syntax.

When the server reports `out_of_scope`, the selected case stays open with the
server's message. `aged_out` and `unavailable` return the case atomically to the
queue only after findings confirms the matching disposition. Failed,
generation-mismatched, or superseded requests preserve the last coherent
inspector/canvas pair; after one automatic coordinated retry, the surface marks it
stale and offers one explicit Retry instead of clearing or mixing evidence.

#### Scenario: Diagnose presents retired I:C regimes as non-actionable Watching evidence

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Diagnose renders Finding case files without browser-owned policy.

The system SHALL satisfy the following:

Diagnose loads the server-owned case-file preparation and renders its exact rows.
Opening any visible behavioral Finding, changing its clock window or alignment,
or selecting an Occurrence sends the preparation identity and opaque coordinates to
the case-file endpoint. The Inspector renders the returned header, verdict account,
full roster, 12-bucket clock or three server-named event cohorts, comparison state,
selection, and selected trace without mapping titles to Exposure families, joining a
second population, recounting cohorts, or falling back from event to clock alignment.

An active failed request preserves the last internally consistent queue,
Inspector, and canvas while showing the structured error. On `stale_projection`,
the replacement preparation and replacement case are built in shadow state and
all three surfaces swap only after both succeed. Responses superseded by newer
coordinates are discarded by generation and projection/Finding identity. Initial
load failure, queue-level refresh failure, case failure after refresh, and a valid
unavailable selection remain distinct visible states.

For Missed / unannounced meal, the event view renders the server's attributed-
missed and all-completed-carb-bolus announced cohorts as separate populations.
It displays each cohort's served count under its served name, and the served count
of Highs outside the comparison whenever it is non-zero; it anchors missed rows at
detected rise onset and announced rows at completed carb-bolus time, and uses the
fixed `[-60, +300]` axis. A zero attributed-missed cohort is an explicit empty
state, not a fallback to High verdict membership; announced rows remain selectable
through their server-owned Occurrence identity. The five-way High verdict band and
its denominator remain a separate account.

#### Scenario: Diagnose renders Finding case files without browser-owned policy.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: Missed meal shows its Highs outside the comparison

- **GIVEN** the synthetic Missed / unannounced meal case file with 3 Highs outside
  the comparison
- **WHEN** Diagnose renders its event view
- **THEN** the caption shows the three served cohorts under their served names with
  their counts, and "3 highs outside the comparison"
- **AND** no caption count is labelled "not comparable"

### Requirement: Plan surface asks "what will I program into my pump?"

The system SHALL satisfy the following:

The Plan surface holds a unified ≤16-segment pump-ready schedule built from the user's currently-active profile plus any accepted Diagnose recommendations and hand-edits. It shows the active profile as a reference, lists the accepted changes with provenance, and renders the editable deliverable. Plan reconciliation compares the deliverable to the latest detected pump profile to confirm it matches or flag keying errors. Users cannot stage changes directly on Plan; they stage from Diagnose and edit the deliverable here.

#### Scenario: Plan surface asks "what will I program into my pump?"

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Day surface asks "what happened on this day?"

The system SHALL satisfy the following:

The Day surface is a one-day forensics view: a severity-encoded calendar navigator (ADR 0031) at the top, a sticky glucose chart on the left showing the day's CGM and insulin events, and a chronological Episode Log on the right where behavioral evidence (meals, corrections, lows, rescue carbs) folds in as tier-2 inline detail. Both components are self-contained; the app supplies the selected date. The Day surface is read-only and discovery-focused; it does not stage changes or execute commands.

#### Scenario: Day surface asks "what happened on this day?"

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Verify surface asks "are my changes working?"

The system SHALL satisfy the following:

Verify tracks active Trials (detected setting changes) and pinned Focuses (behavioral changes the user is watching). For each, it shows before/after metrics anchored to the change date, rendering the specific metric most relevant to that change (e.g., overnight lows for a basal raise, post-meal nadirs for an I:C adjustment). Verify also shows outcome trends — glycemic metrics and clean rates — across an observation window. All data on Verify is read-only and retrospective; no staging or configuration happens here.

#### Scenario: Verify surface asks "are my changes working?"

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Surfaces render server-owned projections; they do not re-derive analysis verdicts

The system SHALL satisfy the following:

Each surface renders data calculated by the backend and carried in `/api/analyze` or specialized endpoints (`/api/day-navigator`, `/api/verify/trials`, etc.). A surface never recalculates the engine's own verdicts — asserts_move, priority, recurrence, harm gates, silence reasons, localized outcome triage — even if tempted to re-check them for UI purposes. The backend is the single source of truth for all analysis. This boundary has been repeatedly load-bearing: frontend re-derivations of backend gates have diverged and silently invalidated the app's behavior.

#### Scenario: Surfaces render server-owned projections; they do not re-derive analysis verdicts

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Diagnose separates clock-window selection from basal verdict state and keeps chart evidence legible

The Diagnose glucose-by-time-of-day chart SHALL confine clock-window gate paint
and hit testing to the glucose plot. Its clock-aligned basal verdict strip SHALL
retain each backend verdict's paint independently of window selection. Held,
insufficient-evidence, and no-data states SHALL remain distinguishable through
theme-owned paint plus a non-color structural tell. The plotted glucose evidence
and chart furniture SHALL remain readable with and without an active clock
window after every overlay is composited.

#### Scenario: Moving a clock window preserves basal verdict rendering and chart legibility

- **GIVEN** a populated Diagnose glucose-by-time-of-day chart
- **AND** the basal strip contains held, insufficient-evidence, and no-data slots
- **WHEN** the wearer chooses, draws, resizes, slides, or wraps a clock window
- **THEN** the gate paint and hit zones remain inside the glucose plot
- **AND** each basal slot keeps the same verdict paint and opacity it had before
  the window moved
- **AND** the three passive basal states remain distinguishable by paint and
  structure
- **AND** the glucose bands, median, target treatment, axes, labels, endpoint
  values, and basal strip remain readable in their final composited state, with
  the chart root naming the band and median marks accessibly in place of a
  rendered legend

### Requirement: Diagnose clock-window gestures work with direct tablet touch

The Diagnose glucose-by-time-of-day chart SHALL let a wearer use primary touch to
move the whole selected clock window from its scrim interior and to resize either
individual gate. The touch path SHALL preserve the same hit precedence, snapping,
wrapping, edge travel, plot containment, live feedback, and committed scope as the
mouse path. Sliding the scrim SHALL preserve the window width; resizing a gate SHALL
keep the opposite edge fixed. Cancellation SHALL clear transient drag state without
committing an incoherent window. Vertical touch movement SHALL NOT alter the clock
window or obstruct an already-scrollable ancestor, while horizontal drags that
begin in the glucose plot or on a gate SHALL belong to the chart. The shell's
existing no-page-scroll contract SHALL remain unchanged.

#### Scenario: A tablet wearer moves and resizes the selected window

- **GIVEN** a populated Diagnose glucose chart with a non-default clock window at
  a tablet viewport
- **WHEN** the wearer drags inside the scrim with one finger
- **THEN** both gates move together and preserve the selected duration
- **WHEN** the wearer drags either individual gate with one finger
- **THEN** only that gate moves and the opposite edge stays fixed
- **AND** every gesture remains inside the glucose plot and commits the window it
  showed live
- **AND** cancellation clears live feedback without leaving a partial gesture
- **AND** vertical touch movement leaves the clock window unchanged, does not
  obstruct an already-scrollable ancestor, and preserves the shell's existing
  no-page-scroll contract

### Requirement: Dark Diagnose material hierarchy keeps advisory evidence distinct

The Diagnose workstation SHALL derive its desk, chart well, field, pane sheet,
rail, rule, edge, and ink roles from one ordered warm tonal ladder. Chart wells
SHALL sit below pane sheets; chart-vessel edges SHALL remain distinct from
interior gridlines; the spotlight SHALL differ from peer vessels by shadow rather
than a brighter plate; and the glucose chart, basal strip, Findings boundary, and
chart dock SHALL read as one coherent instrument without doubled seams.

The named Diagnose evidence charts and desktop Day chart SHALL render the 70 and
180 mg/dL target bounds as dashed rails rather than a filled target slab. The
carb-ratio evidence chart SHALL keep overlapping support and directional-only
runs individually readable. These presentation rules SHALL leave published chart
data, window and dock interactions, advisory verdicts, and staging behavior
unchanged.

#### Scenario: Dark renders the same evidence through distinct material roles

- **GIVEN** a populated synthetic Diagnose workstation
- **WHEN** the reader views the focal chart, basal strip, Findings pane, chart
  dock, fullscreen chart, explorer, and carb-ratio evidence
- **THEN** wells remain darker than sheets and every chart vessel has one visible
  edge distinct from its gridlines
- **AND** spotlight emphasis is shadow-only, the glucose/basal vessel shares one
  boundary, and the Findings divider is a single seam
- **AND** glucose targets appear as dashed 70 and 180 rails without a filled slab
- **AND** overlapping meal runs remain distinguishable by their existing
  membership line style and the re-settled opacity
- **AND** the same interactions, evidence values, and advisory states replay
  unchanged

### Requirement: The basal evidence tile states its finding and draws each night as an independent delta

The Diagnose basal evidence tile SHALL render one treatment: one cell per
steady night anchored on that night's own served programmed rate and extending
only its deviation (the drawn rule is the current programmed rate; direction
comes from the served per-night sign), the analyzer's interval and estimate
drawn on the same rate axis, and a verdict rail carrying the backend verdict
word with the direction counts and the excluded-night count. The finding's
headline is the row's served sentence in the stage card's title, not a mark on
the tile. No mark may span more than one night, no mode toggle is offered, and
every fact prints in exactly one place on the tile. The tile SHALL adapt by
measured width: full furniture, a compressed middle rank, and a silhouette-only
miniature.

#### Scenario: A slot with a held verdict renders without re-deriving it

- **WHEN** the basal night-evidence payload carries `asserts_move: false` with a held safety status
- **THEN** the tile prints the backend verdict word and the served counts
- **AND** draws each night's delta from the served programmed rate
- **AND** derives no direction, floor, or threshold of its own

#### Scenario: A payload without an estimate still renders

- **WHEN** the payload's estimate is absent or incomplete
- **THEN** the tile renders the nights and the programmed rule without interval or estimate marks
- **AND** the verdict rail says the estimate is unavailable rather than inventing one

#### Scenario: A night without a programmed rate on file stays distinct

- **WHEN** a night's `programmed_rate` is null
- **THEN** the tile counts it in its own rail row rather than as exactly-as-set
- **AND** marks it at its delivered rate in excluded ink at the foot of the stack

#### Scenario: A night beyond the axis ceiling stays disclosed

- **WHEN** a night's delivered rate exceeds the computed axis ceiling
- **THEN** its cell caps at the ceiling with an overflow mark
- **AND** the tile prints the true value

#### Scenario: The tile draws no headline

- **WHEN** the basal tile renders at full furniture
- **THEN** no headline sentence is drawn on the chart
- **AND** the stage card's title carries the row's served headline

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

### Requirement: Finding occurrence lists share one roster presentation

Both occurrence lists a Finding case file renders — the verdict-band roster and
the response-comparison cohort roster — SHALL present occurrences through one
shared roster mechanism: grouped headers carrying their counts, one button row
per occurrence exposing its pressed state, at most one selected occurrence at a
time, and an over-cap show-more control whose gating count is the caller's
served figure — never a recount of rendered rows. Each list SHALL keep its own
grouping — verdict bands for one, server-named cohorts for the other — its own
header and empty-state wording, its own row text and row data attributes, and
selection SHALL remain keyed to server-owned Occurrence identity in both. The
mechanism SHALL preserve each list's rendered behavior exactly as shipped,
including the response-comparison list's single expansion state across its
cohorts.

#### Scenario: Selection behaves identically in both lists

- **WHEN** the reader selects an occurrence in either the verdict-band roster or
  the response-comparison roster
- **THEN** that row alone reports pressed state
- **AND** the previously selected row, in either list, releases it

#### Scenario: The show-more cap is one mechanism with caller-owned counts

- **GIVEN** a group holding more occurrences than the roster cap
- **WHEN** the reader toggles that group's show-more control
- **THEN** the list expands past the cap and collapses back to it
- **AND** the control's count is the caller's served figure — the published
  verdict count for the verdict-band list, each cohort's routed count for the
  response-comparison list — never a recount of rendered rows
- **AND** the response-comparison list keeps one expansion state across all its
  cohorts, exactly as shipped

### Requirement: The app ships one dark theme

The app SHALL render every surface in its one dark theme with no theme
selection: no boot-time class gate, no stored theme preference, no Theme control,
and no rule scoped to a theme class. Every rendered colour SHALL resolve from
the single `:root` token block, and a token value SHALL change only through a
ruling recorded with its dated operator sanction in the change's design record.

#### Scenario: A fresh visit renders dark with nothing stored

- **GIVEN** a browser with no stored preference for the app's origin
- **WHEN** the reader opens any surface
- **THEN** the surface renders in the dark theme
- **AND** the footer offers no Theme control
- **AND** no `theme` value is written to storage

#### Scenario: A palette revision moves only colour

- **GIVEN** the ticket base and the revision served from the same synthetic database
- **WHEN** every gated state's computed style is diffed between them
- **THEN** every difference is a colour-valued property or a moved token
- **AND** no element is added or removed and no layout or typographic property differs

### Requirement: Clinical attention and tappable affordance do not share a hue

High-glucose marks SHALL render in a hue that is not the action colour used by
controls, links, focus rings and the chrome bar's signal, and SHALL remain
tellable from low, in-range and the non-clinical ambers. Every consumer of the
high-glucose mark SHALL read the one `--high` token.

#### Scenario: A high reading beside a control on the Day surface

- **GIVEN** a Day surface whose hero chart, navigator and highs count show at least one high reading
- **WHEN** the reader views them beside the Log carbs control and the active workflow step
- **THEN** the high marks and the controls render in different hues
- **AND** the high marks share one hue across the hero chart, navigator, legend and count

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

### Requirement: Every findings row carries one served headline

Every row the findings projection publishes, in every register, SHALL carry a
`headline`: a factual sentence composed only from the row's own fields or from
the analyzer payload the projection already holds: the basal night roster
and the ISF rest-window evidence through the same pure functions their
endpoints call, and the I:C blocks' own published counts; neither a Finding
case file nor the I:C block CGM series is a source, since each needs a store
read the projection does not have.
A headline never states a count, direction or verdict the analyzer did not
publish, and is identical across reruns of the same window.

#### Scenario: A held slot's headline names the withheld move

- **WHEN** the projection publishes a basal row in the `held` register
- **THEN** its headline states that no change is recommended for the slot and why, from the served hold reason

#### Scenario: Every register carries a headline

- **WHEN** the projection publishes rows in the `assert`, `finding`, `held`, `blind` and `history` registers
- **THEN** every row carries a non-empty headline drawn from served facts only

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

### Requirement: Headlines are authored with the operator from the engine's facts

Before a headline template is served, the operator SHALL author example
sentences against a generated facts sheet covering every findings row the QA
showcase publishes, and each family's template for each register SHALL be
recorded as a dated operator sanction in the change's design record. A served
template without its sanction is a defect.

#### Scenario: Every served template has its sanction

- **WHEN** the projection serves a headline for a family and register
- **THEN** the change's design record carries a dated sanction naming that family, register and template

### Requirement: A revision of the Diagnose left column ships with its ledger amendments and evidence

A revision of the shipped Diagnose left column SHALL amend the frozen behavior
ledger and its app-only replay for every added, changed, moved or retired
behavior in the same change, with each retirement carrying its dated operator
sanction, and SHALL store before/after renders of every affected state from
the base and the revision served on the same synthetic database.

#### Scenario: The replay proves the revision

- **WHEN** the amended replay runs against the built revision on the declared no-fetch server
- **THEN** it reports its applicable story count, zero failures and no skipped story
- **AND** every retired story prints its sanction

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

### Requirement: A rendered Finding row states one denominator

The Finding case-file preparation SHALL publish every rendered finding row with
a `headline` composed from that row's own published `appearances` and `tier`
through the findings projection's headline composer, so the row's queue detail
line, its `case_header` summary and its served headline name the same count,
denominator and population noun. A rendered row SHALL NOT carry the sentence
the projection composed from the appearances the preparation replaced.

The rendered row SHALL retain every family appearance the findings projection
published for that finding. It SHALL substitute the case file's own claimed
count, denominator and population noun for the case file's own family, and
SHALL publish that family as the row's first appearance so the composed
sentence names it. Every other family's appearance SHALL keep the count and
denominator the projection published for it.

The preparation's own `findings` payload SHALL be published unchanged, and no
frontend module SHALL compose, recompose or re-derive the sentence.

#### Scenario: The case file's denominator differs from the projection's

- **GIVEN** a prepared window whose case-file population for a finding counts a
  different denominator than the findings projection published for that finding
- **WHEN** the preparation renders that finding's row
- **THEN** the row's first appearance, its `case_header` summary and its
  `headline` state the same count, denominator and noun
- **AND** the preparation's `findings` payload keeps the appearances and the
  headline the projection composed

#### Scenario: The finding appears in more than one family

- **GIVEN** a projection row whose appearances name two families in family-name
  order, and whose first appearance is not the case file's recurrence family
- **WHEN** the preparation renders that row
- **THEN** the rendered row's `appearances` still name both families
- **AND** the case file's own family is the first appearance, carrying the case
  file's claimed count, denominator and noun
- **AND** the other family's appearance keeps the count and denominator the
  projection published
- **AND** the rendered `headline` states the case file's own family noun and
  its counts

### Requirement: A carb-ratio block names its interval the way the server labels it

A Diagnose carb-ratio block SHALL name its interval with the day's far edge
spelled `24:00`, matching the span label the server publishes for that same
block, wherever the surface prints that interval — the parameter panel head, the
watch dock's staged title, the peak-hour block link, the selected-window chip and
the through-midnight sentence. A block covering the whole day SHALL NOT print a
zero-length interval.

The surface SHALL derive this name from one formatter, not a second copy of the
rule. A block's geometry — whether it runs through midnight, and the minute
ranges the canvas brackets — SHALL be unchanged by how its interval is named.

#### Scenario: The all-day block reads as a whole day

- **GIVEN** the server publishes a carb-ratio block starting at minute 0 and ending at its exclusive minute 1440
- **WHEN** the reader opens that block's panel from its findings-queue row
- **THEN** the panel head names the interval `00:00–24:00`
- **AND** the queue row's own served label for the same block still reads `00:00 to 24:00`
- **AND** staging the block prints that same interval in the watch dock

#### Scenario: A block that runs through midnight is unaffected

- **GIVEN** the server publishes a carb-ratio block whose end minute falls strictly between minute 0 and its start minute
- **WHEN** the reader opens that block's panel
- **THEN** the interval is named from its own start and end, as it is today
- **AND** the block is still marked as running through midnight
- **AND** the minute ranges the canvas brackets for it are unchanged

### Requirement: Diagnose evidence charts seat their axis names inside the chart

Every axis name a Diagnose evidence chart draws at full rank SHALL render
entirely inside that chart's own box, on every mode the chart publishes. No part
of a name SHALL be painted outside the chart's bounds, whichever grid inset the
axis sits against.

The names themselves SHALL be unchanged: this is a rule about where a name is
seated, not about what it says. The evidence canvas's grid geometry — the
canvas-wide spine inset a tile shares with the glucose strip, and the right inset
reserved for the last axis label — SHALL NOT be widened to seat a name, and the
on-chart legend SHALL keep the seat its own configuration gives it. A chart whose
axis name already renders inside its box SHALL keep the seating it has. The mini
rank SHALL continue to carry no axis name at all.

#### Scenario: The correction-factor rest-windows chart states both its units

- **GIVEN** the Diagnose evidence canvas showing the correction factor's rest
  windows at full rank
- **WHEN** the reader looks at the chart's axis names in each alignment the tile
  publishes
- **THEN** the y-axis name reads `glucose change (mg/dL)` in full, with no part of
  it painted outside the chart, under both event and clock alignment
- **AND** the x-axis name reads `insulin acted (U)` in full, with no part of it
  painted outside the chart

#### Scenario: The carb-ratio meal-runs chart states its elapsed-time unit

- **GIVEN** a carb ratio finding's meal runs drawn at full rank
- **WHEN** the reader looks at the chart's axis names in each alignment the tile
  publishes
- **THEN** the name reads `minutes from first meal` in full, with no part of it
  painted outside the chart
- **AND** the clock alignment's `meal start` and `Carb ratio (g/U)` are seated by
  the same rule, from the same shared helper, rather than by a second one

#### Scenario: Seating a name moves nothing that already rendered

- **WHEN** every finding row in the queue is opened in turn, in every alignment
  its tiles publish, and each drawn axis name is measured against its own chart's
  bounds
- **THEN** no axis name overhangs any edge of its chart
- **AND** the basal chart's axis name keeps the seat it had, unmoved
- **AND** each chart's grid insets and legend seat are the ones it had before
- **AND** a chart rendered at mini rank carries no axis name

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

### Requirement: A merged parameter finding stages every member the server published

A Diagnose findings row that names a span of several parameter slots SHALL stage
every member the projection published for that row, and only those members whose
own backend staging verdict is true. Membership SHALL be read from the row's
served member list; the surface SHALL derive it from no row id, title, or clock
arithmetic, and SHALL re-derive no floor, threshold, direction or safety verdict
for any member. Un-staging SHALL remove exactly the set staging added, and the
surface's staged tally, its staging control's state, the parameter lane's staged
marks, the watch dock's line and the Plan badge SHALL all describe that one set.
A finding whose published membership is a single slot SHALL stage exactly that
slot, unchanged.

A detail panel that shows one member of such a finding SHALL name the finding's
span and say that staging acts on the whole run, and SHALL keep printing that
member's own Current, Estimate and Recommended rather than a span figure. The
watch dock SHALL name the staged span in every case, and SHALL print a
current-to-recommended number pair only where every staged member carries the
same pair.

#### Scenario: A merged basal finding stages both its half hours

- **GIVEN** the findings queue publishes one basal row whose served members are
  two contiguous half-hour slots, each carrying a true staging verdict with its
  own current and recommended rate
- **WHEN** the reader opens that row and uses its staging control
- **THEN** the Plan draft holds one item per published member, each with that
  member's own current and recommended value
- **AND** the watch dock names the row's whole span
- **AND** the Plan badge counts every staged member

#### Scenario: Un-staging removes exactly what staging added

- **GIVEN** a merged basal finding is staged from its own panel
- **WHEN** the reader undoes it from that panel
- **THEN** every item that staging added leaves the Plan draft
- **AND** no member of the run remains staged in the surface's own tally, lane
  marks or dock line

#### Scenario: A member panel says which run it belongs to

- **WHEN** the reader opens a panel for one member of a multi-member finding
- **THEN** the panel names the finding's span and states that staging acts on the
  whole run
- **AND** the panel's Current, Estimate and Recommended remain that member's own
  served numbers

#### Scenario: A single-slot finding is unchanged

- **WHEN** the reader opens and stages a finding whose published membership is one
  slot
- **THEN** the Plan draft holds exactly that one item
- **AND** the panel carries no span statement beyond the slot's own clock span

### Requirement: Eating-sequence charts reuse the shipped tile and served cohort values

The eating-sequence registry kind SHALL precede the generic behavioral comparison
match for its two lever values and serve their tile, thumbnail, compact mini and
fullscreen drawing through one chart implementation. It SHALL show the selected
comparison and the three served intervals with explicit cohort names, units,
counts and null/insufficient states. No frontend-derived price, verdict, median
or difference SHALL be introduced. Different units SHALL not share an unlabeled
axis. Cohort comparisons SHALL not appear as predicted individual glucose traces.

#### Scenario: Both chart stories exercise the real composition
- **WHEN** the manufactured harness opens either new lever's supported or insufficient story
- **THEN** the story establishes its declared clock window and the shipped registry, chart and tile render the requested served state
- **AND** long labels, null cells and selected periods retain their meaning across chart sizes

#### Scenario: Existing stage and drawer behavior survive
- **WHEN** a reader selects a new finding, opens its chart fullscreen and returns
- **THEN** the existing stage, drawer, focus and selection behavior remains intact
- **AND** the frozen Diagnose behavior replay passes against the built app

### Requirement: Sequence drill reuses the shared clear control and frozen behavior

Sequence detail and the occurrence footer SHALL use the same Clear trace control
and callback. Canonical drill, All charts, fullscreen and return SHALL preserve
selection, focus and window. Sequence detail SHALL NOT add a Day handoff. The
revision SHALL satisfy S151–S158 in the existing ledger, preserve every inherited
active story and retain S117's retirement.

#### Scenario: Clear trace is shared across evidence kinds
- **WHEN** a reader drills into either sequence cause from its row or All charts
- **THEN** the existing Clear trace control is mounted with its inherited behavior
- **AND** fullscreen and return preserve the canonical cause, selection, focus and window

### Requirement: The desk is the only shell, built ahead of time and served at root

Harmonic SHALL have exactly one browser shell, the desk. It is built ahead of
time, loads with no login screen, and then makes bearer-token-gated API calls to
load data. The packaged runtime SHALL require no Node runtime and no CDN at run
time.

The server SHALL serve the desk at `/` and at exactly the page paths
`/diagnose`, `/changes` and `/day`, and its fingerprinted built assets beneath
`/assets/`. Programmatic interfaces live below `/api`. The non-API route set
SHALL be closed: every served page path is named explicitly, and every other
path SHALL answer 404 rather than the shell. No retired address is served or
redirected: a `/v2/...` path, a retired v1 page path such as `/plan`, `/verify`,
`/settings` or `/guide`, and any older retired page id all answer 404. A fragment
carries no route.

The browser router, the browser-side disk-serving mirror used by the browser
gates, and the Python route policy SHALL agree on that page set and asset prefix,
because a mirror that serves a path the server does not is structurally blind to
a missing route.

#### Scenario: The desk answers at root and its page paths

- **WHEN** the built app is started against a synthetic database
- **THEN** `/`, `/diagnose`, `/changes` and `/day` each answer the desk shell
- **AND** every asset the shell names is served beneath `/assets/`
- **AND** the built output references no CDN host

#### Scenario: A retired address is not served and is not redirected

- **GIVEN** an address the app no longer has, such as `/v2/`, `/v2/day`, `/plan`, `/verify`, `/settings` or `/guide`
- **WHEN** that address is requested
- **THEN** the server answers 404, not the shell and not a redirect

#### Scenario: A missing build fails loudly

- **WHEN** the desk's build output is absent
- **THEN** each page path reports that the frontend build is missing and names the build command, rather than serving a blank or partial shell
- **AND** the API remains reachable

#### Scenario: The route set cannot grow silently

- **WHEN** the closed-set route assertion runs
- **THEN** it names the complete non-API route set, so a route cannot be added or kept without updating it

### Requirement: Diagnose draws eating-sequence evidence from the finding case file

Diagnose SHALL nest supported eating-sequence lever findings as habit causes under
Highs after meals in its existing queue. They SHALL have their own sequence counts
and no rank numeral or extra Findings/Sift count. The eating-sequence descriptor
SHALL bring the registry to six entries; the parent SHALL retain pattern-case-file. It SHALL NOT
create a separate aggregate section or new stage, drawer or dock behavior. Neither
finding SHALL stage a Plan change. Its adapter SHALL reshape
served aggregates without deriving a verdict, median, difference, or status. An
insufficient cell SHALL remain visible as insufficient rather than numeric. The
report reaches Diagnose inside the finding case file it opens, as that case's
`projection.report`; it has no route of its own (ADR 417).

#### Scenario: An insufficient served aggregate remains insufficient in the adapter

- **GIVEN** an eating-sequence report cell with insufficient status and null metric
- **WHEN** Diagnose adapts it for aggregate evidence
- **THEN** the chart-ready cell retains that status and null value
- **AND** it is neither dropped nor zero-filled

#### Scenario: The adapter does not re-derive an eating-sequence judgment

- **GIVEN** served aggregates, comparisons, statuses, findings, and exclusions
- **WHEN** Diagnose adapts the report
- **THEN** its outputs use those values field-for-field
- **AND** no frontend threshold, median, difference, or verdict is calculated

#### Scenario: The section reads the report from the case file

- **GIVEN** Diagnose opens an eating-sequence finding's case file
- **WHEN** it draws that finding's aggregate evidence
- **THEN** the report is the case file's own `projection.report`, prepared for the server-owned fixed Diagnose source window
- **AND** Diagnose makes no separate report request

### Requirement: The Episode Log words an outranked anchor as claimed, and Diagnose shares the word

The Day Episode Log SHALL print the word `claimed` as the tier word of an anchor
whose served state is `outranked`, never the engine state name. `Claimed` SHALL
mean only the fact the two surfaces share: the anchor or occurrence belongs to
an episode another Finding owns. It SHALL NOT be defined as "matched" or "did not
match". On Day the row names separately what the anchor matched. On Diagnose a
claimed occurrence is the row-relative verdict: this Finding's own criterion was
not met and another Lever drove the episode. The behavioral-layer requirement
that model-view outranked state and findings' row-relative fired criterion
retain their distinct meanings stands.

The desk SHALL hold one definition of the anchor-state words, and Diagnose's
label for an outranked occurrence (the verdict band's footer and the selected
occurrence's tag) SHALL be built from that same definition's claimed word,
reading `claimed by another finding`. The engine state SHALL stay available as
the tier element's data attribute. No other anchor state's word SHALL change.

#### Scenario: A claimed low reads claimed on Day

- **GIVEN** a served model-view day whose meal over-delivery episode holds a
  fired meal anchor and an outranked low anchor
- **WHEN** the Day desk renders its Episode Log
- **THEN** the low's tier word is `claimed` and its tier element still carries
  `data-state="outranked"`
- **AND** no Episode Log row prints the word `outranked`

#### Scenario: Diagnose and Day read one definition

- **WHEN** the desk's source is read
- **THEN** Diagnose's outranked label is built from the same exported claimed
  word Day prints
- **AND** the phrase `claimed by another factor` appears nowhere in the desk

### Requirement: A claimed row names what the anchor matched and ends with the Finding that claimed it

A claimed row SHALL name each Lever its own matched verdicts matched, by that
verdict's served title, and SHALL end with the episode's served `lever_title`,
the claiming Finding named last, as #426's surfaces requirement has every row
whose episode carries a Lever end. A matched title equal to the episode's
`lever_title` SHALL not be repeated before it. The model-view read SHALL serve a
Lever title on every retained verdict, from the one Lever name source
`lever_title` also reads. The Day desk (`frontend/day.js`,
`frontend/day-chart.js`) SHALL keep no Lever-key-to-name table, and this change
SHALL add none. No claimed row SHALL print a raw Lever key. The verdicts other
consumers copy out of the shared episode view SHALL be unchanged.

#### Scenario: The model view serves the verdict title for a claimed low

- **GIVEN** manufactured events in which a meal over-delivery episode's meal
  drives it and its level-2 low matches correction on IOB on its own
- **WHEN** the model-view read assembles the day on which that episode ends,
  the day after its anchors
- **THEN** the low's state is `outranked` and its matched verdict carries the
  served title for correction on IOB
- **AND** every retained verdict on every anchor carries a served title

#### Scenario: The claimed row states the relationship

- **GIVEN** that served day, whose episode serves meal over-delivery's
  `lever_title`
- **WHEN** the Day desk renders the low's row
- **THEN** the row names correction on IOB as what the low matched and ends with
  meal over-delivery's `lever_title`
- **AND** the row text contains no underscore token

### Requirement: A claimed anchor keeps its Finding's hue and size

A claimed anchor's tier word, its Evidence-strip ring, the narrow hero ring and
the cross-track focus hairline SHALL use the same hue as a fired anchor's, and
its resting marker SHALL be the same size as a fired anchor's. The Episode Log
and its chart overlay SHALL not use the warning hue. The claimed word SHALL
remain the non-colour signal that tells a claimed anchor from the anchor that
drove its episode.

#### Scenario: A claimed level-2 low is not demoted

- **GIVEN** the served day with a fired meal anchor and a claimed low
- **WHEN** the anchor overlay, the focus hairline and the Episode Log styles
  resolve
- **THEN** the low's ring, hairline and tier word take the fired anchor's hue,
  not the warning hue
- **AND** the low's resting marker is as large as the fired meal's

### Requirement: The Findings band counts Findings, not rows

The Findings band lists the fired and claimed anchors, each belonging to an
episode attributed to a Lever; which anchors it holds SHALL be unchanged. The
Findings caption SHALL state the number of distinct Findings those anchors'
episodes belong to: one per distinct served Lever among the band's rows,
whether or not that Lever's episode has a fired row. Two episodes attributed to
the same Lever SHALL count once, as one Finding, in CONTEXT.md's terms and as
Diagnose counts it. When the band holds claimed rows, the caption SHALL name
their count separately and SHALL never add it into the Finding number. Rows
SHALL keep their chronological order.

#### Scenario: One Finding and one claimed anchor

- **GIVEN** a served day with one attributed episode holding one fired anchor
  and one claimed anchor
- **WHEN** the Episode Log renders
- **THEN** the caption reads `Findings · 1` and names 1 claimed anchor

#### Scenario: Two episodes of one Lever are one Finding

- **GIVEN** a served day with two episodes attributed to the same Lever, each
  holding one fired anchor
- **WHEN** the Episode Log renders
- **THEN** the caption reads `Findings · 1`

#### Scenario: A sequence Finding with no fired row

- **GIVEN** a served day whose only attributed episode is a high-carb sequence
  episode holding two claimed anchors and no fired anchor
- **WHEN** the Episode Log renders
- **THEN** the caption reads `Findings · 1` and names 2 claimed anchors

### Requirement: The Episode Log bands are explained where a reader looks

The Glossary SHALL carry an Episode Log group, in CONTEXT.md's terms, with four
entries:

- *Finding*: the Findings band lists the fired and claimed anchors of episodes
  the engine attributed to a Lever, and the caption counts the distinct Findings
  those episodes belong to;
- *Claimed*: only the shared fact that the anchor belongs to an episode another
  Finding owns;
- *Also checked*;
- *Quiet*, naming its clean, explained and no-data counts.

CONTEXT.md SHALL define the Episode Log and Claimed to the same effect. The
Guide's "Reading a Day" article SHALL describe the three bands and the claimed
word and SHALL keep its Day handoff. Each band caption SHALL carry a
keyboard-operable control, named for its band, that opens the Glossary with the
Episode Log group in view. Closing the Glossary SHALL return focus to that
control. The Glossary SHALL not describe its definitions as v1's.

#### Scenario: A band caption opens its explanation

- **GIVEN** a Day whose Episode Log shows a Findings caption
- **WHEN** the reader activates the caption's Glossary control
- **THEN** the Glossary takes the reading seat with its Episode Log group in view
- **AND** closing it returns focus to the same caption control

#### Scenario: The Glossary carries the band terms

- **WHEN** the desk's Glossary groups are read
- **THEN** an Episode Log group defines Finding, Claimed, Also checked and Quiet

### Requirement: The Episode Log revision ships with its ledger stories and evidence

The revision SHALL add desk behavior stories S121 and S122 to the frozen desk
ledger, in the change's own dated `## #423 amendment — 2026-09-23` section
carrying the operator's sanction. S121 covers the claimed row's word, its
relationship, its hue and size, and the Findings count. S122 covers a band
caption opening the Glossary and returning focus. The stories SHALL come with
replay functions, node regression tests that tell each story's feature
assertion from a setup error, and the inventory literals in the ledger
inventory check moved to match. They SHALL NOT change an existing frozen block
or its header count line. Each story SHALL fail on the ticket's base for its
feature reason and pass on the branch at 1280x720 and 1440x900. Before and after
renders SHALL record the affected rendered states at both sizes: the claimed
row, its tier word, the Findings caption, the Glossary opened from a caption,
and Diagnose's claimed label.

Where the claimed anchors sit before the Day chart's time axis, the ring hue,
hairline hue and resting marker size SHALL be proven by node tests and by the
story's readback of the anchor overlay option by series id, not by captures.
That readback SHALL read each unfocused marker's `itemStyle.borderColor` and
`symbolSize` before any row is pressed. An
episode is served on the day it ends, so an evening episode's anchors are
stamped the day before and are clipped from the axis.

#### Scenario: The stories prove the revision in the built app

- **GIVEN** the synthetic `pattern-near-tie` case store, whose Day 2024-05-25
  Episode Log shows a claimed low inside a carb undercount episode whose
  anchors are stamped 2024-05-24
- **WHEN** S121 and S122 replay against the base and then the branch at both
  sizes
- **THEN** each fails on the base naming its feature assertion and passes on the
  branch
- **AND** S121 reads the claimed and fired markers' unfocused
  `itemStyle.borderColor` and `symbolSize` from the `day-anchor-markers` series
  option before pressing any row

### Requirement: A folded cause's count reads on its Pattern's population

Each line the rail's Pattern fold gives a claimed cause SHALL print the count,
denominator and noun of each of that cause's served fold sentences, in served
order, never merged, and no outcome word. For the fold, a cause's served count
sentences are its fold sentences. Under a Pattern that serves a count, a
rate-lever cause's first fold sentence is its count on the Pattern's own
population. Every fold sentence the projection marks as outside the Pattern's count
SHALL be set apart from any Pattern's-scope sentence behind the words "outside the
count", so under a Pattern that serves no count a cause's line leads with those
words. The desk SHALL compute no share and decide no scope. The fold's toggle, its
open and closed states on arrival, its keyboard operation, the cause and Pattern
drills, and the absence of cause minis and of sibling cause rows SHALL be
unchanged.

#### Scenario: A folded cause shows its share of the Pattern first

- **GIVEN** the synthetic case where Lows after correcting highs counts 2 of 2 lows
  and Correction stacking is folded beneath it
- **WHEN** the fold is open
- **THEN** Correction stacking's line reads 2 of 2 lows first, then, set apart
  behind "outside the count", its correction-cluster count
- **AND** the line prints no outcome word

#### Scenario: A cause under a Pattern that serves no count is all outside it

- **GIVEN** the synthetic showcase, where Highs after meals serves no count
  sentence and folds Meal bolus fell short
- **WHEN** that Pattern's fold is opened
- **THEN** Meal bolus fell short's line leads with "outside the count", followed by
  its served meals count

### Requirement: The Response comparison caption reconciles with its cohorts and the band

An event-aligned case file's Response comparison caption SHALL name every served
cohort by its served name with its served count, in served order, so each caption
term matches a cohort section heading and its count. When a cohort serves the
verdict-band state it holds, the caption SHALL follow that cohort's name once with
the band's own words for that state. The caption SHALL print the served count
outside the comparison, after the case file's population noun and in the words
"outside the comparison", only when that count is non-zero. No caption count SHALL
be labelled "not comparable"; the verdict band's residue line keeps that word for
no data. The desk SHALL compute no caption count and derive no band link.

#### Scenario: A same-population Pattern caption adds up

- **GIVEN** the synthetic Highs after meals case file of 3 of 6 meals with one
  Borderline, one no-data and one calm meal
- **WHEN** Diagnose renders its event view
- **THEN** the caption reads the Matched, Nearly matched and Other meal
  opportunities counts under those served names, linked once to Meets criteria and
  Borderline, and they add up to six
- **AND** nothing outside the comparison is printed, and the only visible count
  labelled "not comparable" is the band's one no-data meal

### Requirement: The case-file counts revision ships with its ledger amendments

The revision of the case-file caption and the Pattern fold SHALL amend the desk's
frozen behavior ledger and its app-only replay in the same change: new stories for
the same-population caption, the cross-population caption and a folded cause's
share of its Pattern, each on a named manufactured case store, and an amendment of
every inherited story whose assertion reads a folded cause's sentences. They SHALL
be recorded in a dated amendment section of the ledger without rewriting any
existing freeze block, and the replay driver's pinned story counts SHALL equal the
ledger's story entries. Each new story SHALL fail on the base at its feature
assertion and pass on the revision, at both desktop sizes.

#### Scenario: The replay proves the counts revision

- **WHEN** the amended desk replay runs against the built revision at both desktop
  sizes
- **THEN** the new and amended stories execute with zero failures
- **AND** the replay driver's pinned counts equal the ledger's story entries

### Requirement: Day counts each recorded day once

The Day rail's "N recorded days · <first day> to <last day>" SHALL print the
served `data_day_count` from the same status read as its first and last day,
never a count of the month reads the desk has loaded, so paging the Month
calendar SHALL NOT change it. The desk SHALL merge its loaded month reads to one
row per day before the week ribbon, the month grid, the month head or
recorded-day stepping reads them; when two reads carry the same day, the read of
the month that day belongs to SHALL supply it, and a neighbouring read's padding
row SHALL stand for that day only while its own month is not loaded. A month's
head SHALL count only that month's days with data, each once.

#### Scenario: Paging the month leaves the rail count alone

- **GIVEN** a store whose status read serves 52 days with data, with the held
  day's month read loaded
- **WHEN** the reader pages the Month calendar forward and back again
- **THEN** the rail reads "52 recorded days" before, between and after the pages

#### Scenario: A month counts its own days once with its neighbour loaded

- **GIVEN** two adjacent month reads loaded, each padded with a week of the
  other, June holding 29 days with data and July 23
- **WHEN** either month is shown
- **THEN** June's head reads "29 recorded days" and July's reads "23 recorded
  days"
- **AND** each shown month's cells come from that month's own read

### Requirement: The server serves a name beside every identifier the desk prints

The per-day model read SHALL serve `lever_title` on every episode: the
attributed Lever's title from the one lever name source, or null when the
episode carries no Lever. The guidance read SHALL serve, on every Pattern
candidate, a `title` on each member, an `action_title` on each member whose
action is non-null, and a `title` on the Pattern's action when that action is an
identified action rather than span rows. A habit member's names SHALL be its
Lever's title from the one lever name source, and a setting member's names
SHALL be the setting's user-facing label from guidance's closed setting-label
table: Basal, Correction factor or Carb ratio. The Pattern action's title SHALL
be the title of the member it came from. Names SHALL travel beside identifiers and SHALL NOT
replace, rename or be parsed from any identifier. Names SHALL NOT enter the
set-aside comparison state.

#### Scenario: Every episode is served with its Lever's name

- **GIVEN** a synthetic day with one attributed episode and one unattributed episode
- **WHEN** the per-day model read serves that day
- **THEN** the attributed episode's `lever_title` equals its Lever's title
- **AND** the unattributed episode's `lever_title` is null
- **AND** every Lever in the closed set has a non-empty title with no underscore

#### Scenario: Pattern members and their action are served with names

- **GIVEN** synthetic analyzer output whose Pattern roster carries habit and setting members
- **WHEN** the guidance read serves its Pattern candidates
- **THEN** every member carries a non-empty `title` with no `habit:`, `setting:` or underscore token
- **AND** a correction-factor setting member is named "Correction factor", never "ISF"
- **AND** every member with an action carries its `action_title`
- **AND** a Pattern whose action is identified carries that action's `title`
- **AND** each Pattern's set-aside baseline equals the baseline of the same candidate with its names removed

### Requirement: Day names the subject it was opened from by its served name

Every contextual Day entry SHALL carry a display `title` beside its routing
subject: the served finding title for a Diagnose occurrence, the setting name
and half-hour range for a basal slot (such as `Basal · 03:00–03:30`), the title
the record's own nameplate
shows for a Changes record or the active change, and the utility's existing
label for a utility moment. The title SHALL ride the address with the other
entry fields, so a reload or Back keeps it. Day's "Opened from" SHALL print the
title and SHALL NOT print the routing subject. An entry whose address carries no
title SHALL name the destination it returns to instead. The subject, occurrence,
window, lever, focus and return SHALL be unchanged.

#### Scenario: A Diagnose occurrence names its finding

- **GIVEN** a Diagnose case whose served case file names its finding
- **WHEN** the reader opens Day from one of its occurrences
- **THEN** "Opened from" shows that served finding title
- **AND** no `pattern:`, `finding:` or `basal:` text appears in the Day desk
- **AND** the return restores the same occurrence and focus target as before

#### Scenario: A basal slot names its setting and time

- **GIVEN** a basal slot selected in Diagnose with no case drilled
- **WHEN** the reader opens Day from it
- **THEN** "Opened from" names the basal setting and the slot's half-hour range, such as `Basal · 03:00–03:30`

#### Scenario: The name survives the address

- **GIVEN** a contextual Day entry that carries a title
- **WHEN** the address is serialized and parsed again
- **THEN** the parsed entry carries the same title and the same subject

#### Scenario: An address without a name names the way back

- **GIVEN** a contextual Day address that carries a subject but no title
- **WHEN** Day renders it
- **THEN** "Opened from" names the destination the entry returns to
- **AND** the subject is not printed

### Requirement: Episode Log rows name the attributed Lever by its served name

An Episode Log row whose episode carries a Lever SHALL end with that episode's
served `lever_title`, for every Lever in the closed set. A row whose episode
carries no Lever SHALL name none. The Day desk SHALL keep no Lever name table of
its own. Which Lever an episode carries SHALL be unchanged.

#### Scenario: Every attributed row reads as words

- **GIVEN** a served day with episodes attributed to a missed meal, a meal bolus that fell short, a high-carb sequence and repeat eating
- **WHEN** the Episode Log renders
- **THEN** each of those rows ends with its episode's served `lever_title`
- **AND** no row contains an underscore token

#### Scenario: An unattributed row names no Lever

- **GIVEN** a served day with an episode that carries no Lever
- **WHEN** the Episode Log renders
- **THEN** that episode's rows end without a Lever name

### Requirement: Change records word their served facts

A Focus record's "What changed" SHALL name the intended behavior by the record's
served title. A record whose original context is unavailable SHALL state its
served reason in words through the desk's word table for that reason, the way
the watch disposition is worded; a served reason with no entry SHALL be printed
verbatim rather than swallowed.

#### Scenario: A Focus record names its behavior

- **GIVEN** a Focus record whose served detail carries a title
- **WHEN** its "What changed" section renders
- **THEN** the section names the intended behavior by that title
- **AND** it contains no underscore token

#### Scenario: A missing original context is stated in words

- **GIVEN** a record whose served original context is unavailable with reason `not_recorded`
- **WHEN** the record renders
- **THEN** the unavailable line reads "not recorded" in words
- **AND** the raw reason token does not appear

### Requirement: A Pattern concern in Changes names its members and action

A Pattern concern in Changes SHALL print each member by its served `title`, each
member's action by its served `action_title` or "No action" when the member has
none, and the Pattern's identified action by its served `title` as the Action
figure. Identifiers SHALL remain in data attributes and routing and SHALL NOT
appear in reader-facing text.

#### Scenario: A Pattern concern built from served candidates reads as words

- **GIVEN** a Pattern candidate from the committed fixture's served guidance Patterns
- **WHEN** Changes renders it as the selected concern
- **THEN** every member's served title appears in the member table
- **AND** the markup contains no `habit:` or `setting:` text

### Requirement: The topbar's Day reopens the day last looked at until the page reloads

A direct Day entry SHALL open the day the reader last looked at on the current
page: the date a contextual entry carried, or the day last chosen with Day's own
controls. It SHALL name no prior subject and offer no return. A page on which no
day has been looked at yet, including a reloaded page, SHALL open the latest
recorded day. The plain `/day` address SHALL NOT carry the day shown. Reached
through the topbar, it shows the day last looked at; reloaded, it shows the
latest recorded day. This difference is accepted, and the desk SHALL NOT
reconcile it.

#### Scenario: A direct entry after a contextual one keeps that day

- **GIVEN** the reader opened Day from a Diagnose occurrence on a recorded day
  earlier than the latest recorded day
- **WHEN** the reader visits Diagnose, then Changes, then presses the topbar's Day
- **THEN** Day shows that earlier day
- **AND** Day names no Opened-from subject and offers no return

#### Scenario: A reload opens the latest recorded day

- **GIVEN** Day is showing a day earlier than the latest recorded day
- **WHEN** the page reloads at the plain `/day` address
- **THEN** Day shows the latest recorded day

#### Scenario: The plain address does not carry the day shown

- **WHEN** the topbar's Day shows the day last looked at
- **THEN** the address is `/day` with no query
- **AND** that is the accepted consequence of this requirement, not a defect

### Requirement: The Day desk's viewed stamp is the reader's local clock

The Day desk's viewed stamp SHALL name the reader's local wall-clock date and
time at render. It SHALL use the same `YYYY-MM-DD HH:MM:SS` wall-clock form as
the served read stamp it is compared with. When the served read stamp and the
reader's local clock fall in the same minute, the Day header SHALL show the
read stamp alone.

#### Scenario: A local evening keeps its own date

- **GIVEN** the reader's local time is 21:30 on a day whose UTC date has
  already moved on
- **WHEN** the Day desk renders with no served read stamp
- **THEN** the viewed stamp names the local date and 21:30
- **AND** it names neither the UTC date nor the UTC time

#### Scenario: A read in the reader's current minute shows alone

- **GIVEN** the served read stamp falls in the reader's current local minute
- **WHEN** the Day desk renders
- **THEN** the Day header shows the read stamp and no viewed stamp

#### Scenario: A later view shows both stamps

- **GIVEN** the served read stamp falls in an earlier minute
- **WHEN** the Day desk renders
- **THEN** the Day header shows the read stamp, then the viewed stamp in the
  reader's local date and time

### Requirement: Diagnose's address names the case the reader is on

Diagnose SHALL keep its address naming the case on screen. Whenever the case on
screen changes and the desk is neither restoring an entry nor tearing down or
rebuilding its workstation, the desk SHALL replace
the current address in place, with no new history entry, so that it names that
case: its subject (the Finding or Pattern row, or the basal slot), its
Occurrence while one is selected, and its window, plus a `from` from the entry
that names a destination other than Diagnose. The trigger SHALL be the change to
the case on screen, whichever control, key or chart caused it. The address SHALL
carry no date, moment, lever or return-focus key, and at the Findings index it
SHALL carry no case. A restoration of an entry SHALL begin when the desk decides
to apply a contextual entry, before any teardown or rebuild that entry causes,
and SHALL last until it has opened the named subject and held the named
Occurrence, or until the reader's first own pointer press or key press other
than Tab or a bare modifier, which SHALL end it before that input's own handlers
run, so a case that input changes is written. A restoration SHALL NOT rewrite the
address itself, and SHALL leave a Day return's own address as it is until the
case next changes.

The Day entry Diagnose writes SHALL take its subject, Occurrence and window from
the same case the address names, SHALL name its return target by the
Occurrence's served id, and SHALL carry no CSS selector. Returning SHALL put
focus on that Occurrence's own Open in Day control, whether the return re-reads
or is retained.

A return into a retained Diagnose whose context names no case SHALL be a
retained return whatever entry the desk last held; the desk SHALL keep the held
case, not its `from`, and the address SHALL then name the retained case.
Reloading a case address SHALL re-open that subject and, when named, that
Occurrence, applying the named window first when it is one of the Window
control's presets.

#### Scenario: Acting after a Day return re-addresses to the case on screen

- **GIVEN** the reader returned to Diagnose from Day on a Finding's case file with
  an Occurrence held
- **WHEN** the reader chooses the Overnight window, which keeps that case file
  open re-scoped
- **THEN** the address names that Finding and the Overnight window and carries no
  date, moment, lever or return-focus key
- **AND** the browser history holds no more entries than before the choice

#### Scenario: A keyboard step re-addresses like any other change

- **GIVEN** the reader returned to Diagnose from Day on a Finding's case file with
  an Occurrence held
- **WHEN** the reader presses ↓ to step to the next Occurrence, and later presses
  Backspace back to Findings
- **THEN** after ↓ the address names the stepped Occurrence and carries no
  return-focus key
- **AND** after Backspace the address is `/diagnose`

#### Scenario: Stepping back to Findings leaves no case in the address

- **GIVEN** the reader changed the case inside Diagnose after a Day return
- **WHEN** the reader steps back along the crumb to Findings
- **THEN** the address is `/diagnose` with no subject, Occurrence or return-focus key
- **AND** reloading it lands on Findings with no case file open

#### Scenario: A case address re-opens its case

- **GIVEN** the reader selected an Occurrence in a Finding's case file in a clock
  window other than Overnight
- **WHEN** the address is reloaded
- **THEN** the same Finding opens in that window with the same Occurrence held

#### Scenario: The Day return lands on the same Occurrence without a selector

- **WHEN** the reader opens a held Occurrence in Day from its case file
- **THEN** the Day address names the Occurrence and carries no CSS selector
- **AND** returning holds that Occurrence and puts focus on its Open in Day control
- **AND** a return to the case Diagnose already held makes one status read and no
  guidance read

#### Scenario: A plain return after a Day visit keeps the retained drill

- **GIVEN** the reader returned to Diagnose from Day and then opened Changes
- **WHEN** the reader presses Diagnose
- **THEN** exactly one status read is issued and no guidance or evidence read
- **AND** the window and the drilled case are as the reader left them, and the
  address names that case with no `from`

### Requirement: The watch dock names Changes for a watched Trial or Focus

When the watch dock at the foot of the Diagnose inspector reports a watched Trial
or a watched Focus, its link SHALL read "Open Changes ›", and no part of the dock
in any state SHALL name Verify. A watched Focus's detail line SHALL read
"Pinned ‹MM-DD› · adherence and outcome are read in Changes", where ‹MM-DD› is
the Focus's served pin date.

#### Scenario: A watched Trial names Changes

- **GIVEN** a synthetic store whose server serves an active Trial
- **WHEN** Diagnose is seated at 1280×720 and at 1440×900
- **THEN** the dock reports the Trial and its link reads "Open Changes ›"
- **AND** no text in the dock names Verify

#### Scenario: A watched Focus names Changes

- **GIVEN** a synthetic store whose server serves an active Focus pinned on a
  served date
- **WHEN** Diagnose is seated at 1280×720 and at 1440×900
- **THEN** the dock's detail line reads "Pinned ‹MM-DD› · adherence and outcome
  are read in Changes" for that date and its link reads "Open Changes ›"
- **AND** no text in the dock names Verify

### Requirement: The watch dock opens Changes on the watched Trial or Focus

Activating the watch dock's link for a watched Trial or Focus SHALL open Changes
with an arrival that names the watch, and the address SHALL read
`/changes?subject=watch`. While the server serves an active change, that arrival
SHALL open the watched Trial's or Focus's own view in Changes. A Plan the reader
opened earlier in the same page session SHALL NOT take that seat, even when a
staged or saved Plan draft exists. When the server no longer serves an active
change, the arrival SHALL render what any other arrival to Changes renders.
Every other arrival to Changes SHALL keep its existing precedence.

#### Scenario: The link lands on the watched Trial

- **GIVEN** a synthetic store whose server serves an active Trial, with Diagnose
  seated
- **WHEN** the reader activates the dock's link
- **THEN** the desk is on Changes with the address `/changes?subject=watch`
- **AND** Changes shows that Trial's own view, titled for the served Trial

#### Scenario: The link lands on the watched Focus

- **GIVEN** a synthetic store whose server serves an active Focus, with Diagnose
  seated
- **WHEN** the reader activates the dock's link
- **THEN** the desk is on Changes with the address `/changes?subject=watch`
- **AND** Changes shows that Focus's own view

#### Scenario: A Plan opened earlier does not take the watched record's seat

- **GIVEN** earlier in the same page session the reader staged a concern and
  pressed Open Plan in Changes, and a staged Plan draft still exists
- **AND** the server now serves an active change
- **WHEN** Changes receives the dock's arrival
- **THEN** Changes opens the watched record's own view, not the Plan
- **AND** an explicit arrival to the Plan still opens the Plan

#### Scenario: A watch that has ended opens Changes as any arrival would

- **GIVEN** the reader pressed Open Plan earlier in the page session and a staged
  Plan draft exists
- **AND** the server serves no active change
- **WHEN** Changes receives the dock's arrival
- **THEN** Changes renders exactly what an arrival with no context renders

### Requirement: An open change record opens on its retained-context reassessment

When the desk opens a change record — by a roster press, by the record's address
or on reload — it SHALL make the record read first. When the served record's
saved ending carries no kind, the desk SHALL then request the retained-context
reassessment for that record without any further reader action. It SHALL render
that reassessment's comparison on the stage and in the reading pane, with
Retained context shown as the selected assessment. The decision SHALL read the
served selected record's ending, not the roster row.

The reassessment SHALL stay labelled as a reassessment, with its mode, computed
time and context. It SHALL NOT replace the original context or the saved-ending
part. The saved-ending part SHALL still say the change is still open. Original and
Current policy SHALL remain choosable, and a reader's choice SHALL hold until
another record is opened.

A record whose saved ending carries a kind SHALL open on that saved ending and
request no reassessment. The loading frame SHALL read "Reading change records"
while the record read is pending and "Computing reassessment" while the
retained read is pending. No other read SHALL prewarm the reassessment.

#### Scenario: An open record shows its comparison without a press

- **GIVEN** a synthetic store with a retained setting change that has no saved
  ending and whose retained comparison is available
- **WHEN** the reader opens that record from the Changes roster
- **THEN** the record read and then one retained-context read are made, with no
  assessment control pressed
- **AND** the stage shows both evidence periods and a paired Before/Trial figure
- **AND** Retained context reads as selected, and the saved-ending part still
  says the change is still open

#### Scenario: An ended record keeps its saved ending as its read

- **GIVEN** a record whose saved ending carries a kind
- **WHEN** the reader opens it
- **THEN** no reassessment is requested, and the stage shows the saved ending's
  comparison

#### Scenario: Each read names itself while it is pending

- **GIVEN** a record with no saved ending
- **WHEN** the record read is held, and then the retained read is held
- **THEN** the loading frame reads "Reading change records" and then
  "Computing reassessment"

### Requirement: An empty record figure says why it is empty

The Before/Trial or Before/After figure SHALL classify from its clock bins
before its served availability. It SHALL draw paired readings, and Before-only
readings, whenever the comparison serves them, including a comparison the
backend marks unavailable while keeping its clock views.

When no curve can be drawn, the figure SHALL distinguish these states:

- no comparison read (not requested);
- a saved ending snapshot that kept its rows but not its curve;
- a comparison served as unavailable with no clock envelope, naming the served
  reason in plain words rather than its code;
- a comparison whose periods have no Before readings, naming which period has
  none.

The figure SHALL draw a chart and print the half-hours-read count only when it
draws a curve. It SHALL NOT label a missing comparison or a saved snapshot as
"no readings yet", "Before · unavailable" or "0 → 0 half-hours read". It SHALL
NOT say "no clock envelope is retained" for anything but a saved ending
snapshot.

With no comparison read, the periods note and the outcomes note SHALL say that
no comparison has been read for this record. The stage meta SHALL NOT say the
observations were recomputed. A record with no saved ending SHALL NOT be told
that a saved ending above is what it was decided on.

The desk SHALL keep one vocabulary for comparison availability reasons. The
figure, the readiness availability lines and the reassessment result line SHALL
name an unavailable comparison's reason in its words. A code the vocabulary does
not know SHALL print as served.

#### Scenario: A served-unavailable comparison names its reason

- **GIVEN** a record with no saved ending whose retained comparison the backend
  serves as unavailable with no clock envelope
- **WHEN** the reader opens it
- **THEN** the figure says the comparison is unavailable and names the reason in
  words, and the reassessment result line uses the same words
- **AND** no chart is drawn, and neither "no clock envelope is retained" nor
  "no readings yet" nor "0 → 0 half-hours read" appears

#### Scenario: An unavailable comparison that keeps its curve still draws it

- **GIVEN** a comparison the backend serves as unavailable, whether for
  unmeasured adherence or for a period with no readable evidence, that still
  serves Before clock bins, or paired ones
- **WHEN** its figure renders
- **THEN** the Before-only or paired curve is drawn with its existing legend

#### Scenario: Choosing Original on an open record reads as not requested

- **GIVEN** an open record showing its retained comparison
- **WHEN** the reader chooses Original
- **THEN** the figure, the periods note and the outcomes note say no comparison
  has been read, and the stage does not say its observations were recomputed

#### Scenario: A saved ending keeps its rows and says it kept no curve

- **GIVEN** an ended record whose saved assessment serves its periods and rows
- **WHEN** the reader opens it
- **THEN** the outcome rows show, the figure says the snapshot retains no clock
  envelope, and no empty chart is drawn

### Requirement: A change record names when Harmonic recorded it

The original-context part SHALL label the capture time of the original or
first-observed context as the time Harmonic recorded the change ("Recorded by
Harmonic"). It SHALL NOT use a label that can be read as the pump's own change
time, which the stage names as Detected.

#### Scenario: A first-observed record distinguishes recorded from detected

- **GIVEN** a record whose original context was first observed by reconciliation
- **WHEN** the reader opens it
- **THEN** the original-context part shows "Recorded by Harmonic" with that
  capture time, and no "First seen" label

### Requirement: Changes states a Plan's phase from its served verdict

Changes SHALL name a recorded Plan's phase, status and Decision block from that
Plan's served verdict, and SHALL NOT decide from its own pump comparison whether
a Plan is on the pump. The phase SHALL read Pending for `pending`, Mismatch for
`mismatch`, On pump for `confirmed` while `on_pump` is true, and Confirmed for
`confirmed` once `on_pump` is false. The confirmed status SHALL name the served
`confirmed_at`, so a later pump read does not move it: "✓ On pump since
<confirmed_at> — the pump matches your plan." while the pump holds the Plan, and
"✓ Confirmed on the pump <confirmed_at>. The latest pump read no longer matches
this Plan." after it stops. The mismatch status wording, and the pending status
wording for a Plan served with `on_pump` false, SHALL stay as shipped. A pending
Plan served with `on_pump` true SHALL read "Pending — on the pump, awaiting
confirmation. The latest pump read holds this Plan; it is confirmed automatically
once that read is reconciled." The browser's pump comparison SHALL only draw the
planned-versus-pump rows, and only under a served `mismatch`. The recorded Plan
Changes reads SHALL be the newest served record that is neither withdrawn nor
superseded. A pending Plan served with `on_pump` false and a mismatched Plan
SHALL offer Withdraw and "View change record". A pending Plan served with
`on_pump` true SHALL offer "View change record" and no Withdraw, because the
server refuses Withdraw on it (409 `nonpending_plan`). A Withdraw the server
refuses as `nonpending_plan` SHALL re-read the served verdict and SHALL NOT be
shown as a failed write. A confirmed Plan with no newer draft SHALL keep "View
change record" and SHALL offer no Withdraw.

#### Scenario: A server-pending Plan with a matching pump read reads Pending

- **GIVEN** a recorded Plan whose served verdict is `pending` and a detected
  pump profile that holds its schedule
- **WHEN** Changes renders the Plan
- **THEN** the phase reads Pending and no status claims the pump matches

#### Scenario: A pending Plan the latest read already holds offers no Withdraw

- **GIVEN** a recorded Plan whose served verdict is `pending` with `on_pump` true
- **WHEN** Changes renders the Plan
- **THEN** the phase reads Pending, the status says it is on the pump awaiting
  confirmation, and no Withdraw is offered

#### Scenario: A Withdraw refused as no longer pending re-reads the verdict

- **GIVEN** a pending Plan and a Withdraw the server refuses with
  `nonpending_plan`
- **WHEN** the refusal arrives
- **THEN** Changes re-reads and renders the served verdict, with no failed-write
  status

#### Scenario: The On pump time stays on the confirming read

- **GIVEN** a Plan served as `confirmed` with its `confirmed_at`
- **WHEN** a later pump read arrives and Changes renders again
- **THEN** the status still names the served `confirmed_at`, not the later read

#### Scenario: A confirmed Plan keeps its change-record door

- **GIVEN** a Plan served as `confirmed` and no newer draft
- **WHEN** Changes renders the Plan
- **THEN** it offers "View change record" and no Withdraw

#### Scenario: A confirmed Plan the pump no longer holds reads Confirmed

- **GIVEN** a Plan served as `confirmed` with `on_pump` false
- **WHEN** Changes renders the Plan
- **THEN** the phase reads Confirmed and the status says the latest read no
  longer matches

### Requirement: Changes keeps a recorded Plan apart from a newer draft

The Decision block SHALL describe only the recorded Plan: when it was recorded,
its pump confirmation and any re-key request. The pump confirmation SHALL read
the served confirmed time, "Awaiting pump evidence", "Awaiting confirmation" (a
pending Plan served with `on_pump` true), or "The latest pump read doesn't
match". A draft saved while
a Plan is pending SHALL show as a separate line, "Next change: draft saved
<time>. It can be recorded once this Plan is confirmed or withdrawn.", never as
a field of the recorded Plan. With no Plan pending, a staged or saved draft SHALL
be the frame's subject: its phase SHALL read Staged or Draft saved, it SHALL NOT
be compared as a committed Plan, it SHALL offer Save draft and Record decision,
and the newest confirmed Plan SHALL show as a separate line, "Previous Plan:
recorded <time>, confirmed on the pump <confirmed_at>."

#### Scenario: A draft saved during a pending Plan stays out of its fields

- **GIVEN** a pending Plan and a draft saved after its decision
- **WHEN** Changes renders the Plan
- **THEN** the Decision block's fields carry the Plan's decision time and no
  draft time
- **AND** a next-change line names the draft's saved time

#### Scenario: A different draft after a confirmed Plan reads Draft saved

- **GIVEN** a Plan served as `confirmed` and a newer saved draft that differs
  from the detected pump profile
- **WHEN** Changes renders
- **THEN** the phase reads Draft saved and no status says the pump does not
  match the plan
- **AND** Save draft and Record decision are offered
- **AND** a previous-Plan line names the confirmed Plan

### Requirement: The watch panel carries a recorded Plan awaiting the pump

The Diagnose watch panel SHALL show a recorded Plan whose served verdict is
`pending` or `mismatch`, read from the guidance read's served pending Plan,
whenever no Trial or Focus is watched. Its kind SHALL read "Plan · awaiting
pump"; its title SHALL name the Plan's setting in the wearer's words (Basal,
Correction factor, Carb ratio, Target) and the month and day it was recorded, as
"Basal · recorded 09-20"; its detail SHALL read "Recorded — waiting for a pump
read that matches" under `pending`, "On the pump — awaiting confirmation" under
`pending` with `on_pump` true, and "The latest pump read doesn't match this
Plan" under `mismatch`; its route SHALL read "Open Changes ›" and open Changes on
the Plan (`subject=plan`), never the watched-change address. A watched Trial or
Focus SHALL keep precedence over the Plan, and the Plan SHALL take precedence
over a draft staged on this surface. The staged-draft state SHALL route with
"Open Changes ›" to the same Plan address. A confirmed Plan SHALL hold no
watch-panel state.

#### Scenario: A pending Plan with nothing watched does not read idle

- **GIVEN** a served pending Plan, no watched Trial or Focus and no staged draft
- **WHEN** the watch panel renders
- **THEN** it reads "Plan · awaiting pump" with the Plan's setting and recorded
  day, and offers "Open Changes ›"

#### Scenario: A watched Trial outranks a pending Plan

- **GIVEN** a served pending Plan and a watched Trial
- **WHEN** the watch panel renders
- **THEN** it shows the Trial

#### Scenario: Open Changes lands on the Plan

- **GIVEN** the watch panel showing a pending Plan
- **WHEN** the reader activates "Open Changes ›"
- **THEN** Changes opens on the Plan at `subject=plan`

### Requirement: The case-file header carries no pending-Plan note

While a Plan is pending, the Diagnose case-file header SHALL carry no
pending-Plan note and no Plan route, for every selected case. Start Focus SHALL
stay withheld exactly as the served admission says. The same pending Plan SHALL
read the same in every window and case, carried by the watch panel alone.

#### Scenario: A Pattern case shows no pending-Plan note

- **GIVEN** a pending Plan and a selected case that links to a Pattern
- **WHEN** Diagnose renders the case file at each supported desktop size
- **THEN** the header shows no pending-Plan note, no Plan route and no Start
  Focus
- **AND** the watch panel shows the pending Plan

#### Scenario: Two windows read the same pending Plan the same way

- **GIVEN** a pending Plan
- **WHEN** the reader moves Diagnose between two windows
- **THEN** the watch panel reads the same in both and neither case-file header
  carries a pending-Plan note

### Requirement: Case-file Occurrence rows name what the Occurrence is

Both case-file rosters, the verdict-band roster and the response-comparison
roster, SHALL describe each Occurrence from its served facts through one
description rule. A row whose anchor serves carbs SHALL read its carbs, its dose
and, when one is served, its outcome reading with the word peak or nadir, and
SHALL omit the constant anchor label that its heading already names. A row whose
anchor serves a dose and no carbs SHALL read that dose followed by its anchor
label. Every other row SHALL keep today's anchor glucose and label. The rule SHALL
choose its form from the served fields, never from a family or lever name, and no
row SHALL lead with a dash for a fact its family never has. Each description SHALL
stay fully readable in the rail at both desktop sizes, beside the case roster's
tier column.

#### Scenario: Meal rows differ from one another

- **GIVEN** the QA showcase served through the safe start
- **WHEN** the reader opens the Meal bolus short case file
- **THEN** every row in both rosters reads the served carbs, dose and outcome for
  its own meal, and no row description begins with a dash

#### Scenario: A correction cluster reads its dose

- **GIVEN** a served correction-cluster case file
- **WHEN** its roster renders
- **THEN** each row reads its second correction's dose and the Second correction
  label

### Requirement: A selected Occurrence reads as its facts and served reason

The selected Occurrence block SHALL print the anchor's served facts: carbs and
dose for a meal, dose for a correction, or the anchor glucose as today, at the
anchor label. Its facts list SHALL print the served outcome as a Peak or Nadir
reading with its minutes after the bolus, the served cause's title and its text
when not empty, each served habit's title with its verdict's existing band label
and the classifier's sentence, and each source correction as today. It SHALL NOT
print a line that only counts glucose readings or event markers, and SHALL NOT
print the fixed sentence about what the canvas shows. The browser SHALL derive no
outcome, reason or verdict of its own. The case-file validator SHALL require the
dose and carbs keys on every anchor it checks, the outcome on every roster row and
the reason on every selected detail, and a case file whose new fields are missing
or malformed SHALL be refused as an inconsistent projection.

#### Scenario: A selected meal shows its meal

- **GIVEN** the QA showcase served through the safe start
- **WHEN** the reader selects the matched Occurrence in the Meal bolus short case
  file
- **THEN** the block shows that meal's carbs and dose, a Peak line whose value and
  minutes equal the served outcome, and the served cause
- **AND** no line is only a count and no sentence describes the canvas

#### Scenario: A Pattern Occurrence shows its habits

- **GIVEN** the `pattern-near-tie` case store served through the safe start
- **WHEN** the reader selects an Occurrence in the Highs after meals case file
- **THEN** its rows read their served carbs, dose and peak, and the block lists
  each served habit with its band label and sentence

### Requirement: The basal lane stays reachable on short desktop windows

At every viewport where Diagnose forms its two-pane split, every entry of the
basal lane's head row (its key) and every one of its cells SHALL be fully
visible inside the canvas pane. Horizontally they SHALL lie inside the pane at
rest. Vertically they SHALL lie inside it at rest, or be reachable by scrolling
the canvas pane alone. When the pane is too narrow for the key on one line, the
key SHALL wrap between whole entries; an entry SHALL never be split or cut
off. The lane SHALL never be clipped out of reach. Reaching it SHALL never
scroll the document, and the pane SHALL never scroll sideways. At the two
supported desktop sizes, 1280×720 and 1440×900, the key SHALL stand on one
line, the lane SHALL stand wholly inside the canvas pane at rest, and the
canvas pane SHALL have no scroll range. At each split viewport, every slot the
key counts as raise or lower SHALL be selectable with the pointer without
resizing the window, and selecting it SHALL open its panel with its Stage
change control. The Spotlight, the glucose overview and its clock-window
gestures, All charts and fullscreen SHALL keep their behavior. No staging,
verdict or ranking decision moves.

#### Scenario: A short desktop window keeps the lane within reach

- **GIVEN** a synthetic store whose lane serves raise, lower, hold,
  insufficient and no-data slots
- **WHEN** Diagnose renders at 1200×736, 1200×560 and 832×560
- **THEN** every key entry and every cell lie horizontally inside the canvas
  pane's visible box at rest, and vertically inside it either at rest or after
  the reader scrolls the canvas pane
- **AND** the glucose chart above the lane lies horizontally inside the pane,
  in register with the cells
- **AND** the document does not scroll, the pane does not scroll sideways, and
  no other container moves
- **AND** at each of those sizes, each raise and lower cell, pointed at where
  the reader sees it, opens its panel with a Recommended value and a Stage
  change control

#### Scenario: The supported desktop sizes show the whole lane at rest

- **GIVEN** the same synthetic store
- **WHEN** Diagnose renders at 1280×720 and at 1440×900
- **THEN** the key stands on one line, and every key entry and every cell lie
  wholly inside the canvas pane without any scrolling
- **AND** the canvas pane has no scroll range

### Requirement: The basal lane key names a recurring-lows lower apart from a measured lower

A slot the backend serves as "lower (recurring lows)" SHALL count in the lane
key under its own entry, "lower · recurring lows", and not under "lower". That
entry SHALL keep the lower paint and glyph that its cells share, and each such
cell's name SHALL say that the lower comes from recurring lows. The entry SHALL
be read from the served status alone: the frontend SHALL count no nights, apply
no floor and decide no direction for it, and whether the slot stages SHALL stay
the backend's verdict. A lane with no such slot SHALL show its key unchanged.

#### Scenario: A thin recurring-lows lower has its own key word

- **GIVEN** a synthetic store whose only asserting slot is served as
  "lower (recurring lows)" with no steady nights
- **WHEN** the lane renders
- **THEN** the key reads "lower · recurring lows 1" and has no "lower" entry
- **AND** that cell paints the lower fill and downward glyph, and its name says
  the lower comes from recurring lows
- **AND** its panel reads "lower (recurring lows)" with a Recommended value and
  a Stage change control

#### Scenario: A measured lower keeps the plain word

- **GIVEN** a synthetic store whose lower slot is a measured lower
- **WHEN** the lane renders
- **THEN** the key reads "lower 1" and has no "lower · recurring lows" entry

### Requirement: Each basal key verdict agrees with its slot's panel

Every slot the key counts as raise or lower SHALL open a panel with a
Recommended value and a Stage change control. Every slot the key counts as
hold, insufficient or no data SHALL open a panel that says no direction is
asserted and offers no Stage change control. The key, the cell and the panel
SHALL read the same served staging verdict.

#### Scenario: Opening each counted slot

- **GIVEN** a synthetic store whose lane serves raise, lower, hold,
  insufficient and no-data slots
- **WHEN** the reader opens each slot at a supported desktop size
- **THEN** each raise and lower slot shows a Recommended value and a Stage
  change control
- **AND** each hold, insufficient and no-data slot says no direction is asserted
  and shows no Stage change control

### Requirement: The basal evidence names why its nights were excluded

The Diagnose basal evidence tile and the basal slot panel SHALL name each nonzero
served excluded-night reason with its served count, beside the served
excluded-night total, in rank order and in these reader words: "before the
current rate" (`before_current_setting`), "low or suspended"
(`below_range_or_suspended`), "high" (`above_range`), "insulin on board"
(`insulin_acting`), "logged carbs" (`carb_log`) and "other reasons" (`other`),
which SHALL read "other reason" when its count is 1. A reason whose count is zero
SHALL NOT print.

At full furniture the verdict rail SHALL carry the total on its own row, labelled
"excluded", followed by one row per nonzero reason, and no rail text SHALL overlap
another or cross the footer rule. At the middle rank the tally line SHALL end with
the total and, when its count is nonzero, the "low or suspended" count. The tile's
accessible description and the panel's one excluded-night line SHALL name the
total and every nonzero reason; the panel line SHALL still print only when the
total is nonzero. "excluded — not steady" SHALL NOT print. The tile and the panel
SHALL read the served counts only, and SHALL derive, sum or reclassify nothing.
The miniature SHALL be unchanged.

#### Scenario: The full rail names each reason

- **WHEN** a payload serves an excluded-night count of 5 with 3
  `before_current_setting`, 1 `below_range_or_suspended` and 1 `insulin_acting`
- **THEN** the full rail's rows after the direction counts read 5 "excluded",
  3 "before the current rate", 1 "low or suspended" and 1 "insulin on board"
- **AND** no rail row reads "excluded — not steady"
- **AND** the accessible description carries the clause "5 nights excluded: 3
  before the current rate, 1 low or suspended, 1 insulin on board"

#### Scenario: The low count survives the middle rank

- **WHEN** the same payload renders below the middle-rank width
- **THEN** the tally line ends "· 5 excluded (1 low or suspended)"

#### Scenario: A crowded tally fits the narrowest middle rank

- **GIVEN** a payload whose middle-rank tally reads "16 steady nights · 10 more ·
  3 less · 1 as set · 2 unpaired · 14 excluded (12 low or suspended)"
- **WHEN** the tile renders in a 480px seat
- **THEN** every tally line fits inside the seat's side margins by the chart's own
  estimate of 0.52 of the type size per character
- **AND** the tally still carries "12 low or suspended"

#### Scenario: The panel names each reason

- **WHEN** the basal slot panel renders the same payload
- **THEN** its one excluded-night line reads "5 excluded nights: 3 before the
  current rate, 1 low or suspended, 1 insulin on board"

#### Scenario: A crowded rail stays legible

- **GIVEN** a payload in which every reason is nonzero and one night has no
  programmed rate
- **WHEN** the tile renders at full furniture in a 950px-wide canvas as tall as the
  smallest full-size basal tile canvas measured on the served desk at either
  supported desktop size
- **THEN** every rail row prints, no two rail texts overlap, and none crosses the
  footer rule

#### Scenario: The served desk names the reasons

- **GIVEN** the synthetic showcase
- **WHEN** the reader opens a basal slot with excluded nights in Diagnose at each
  supported desktop size
- **THEN** the panel's excluded-night line and the tile's accessible description
  name the served total and each nonzero served reason with its served count

#### Scenario: One night left out for another reason reads in the singular

- **WHEN** a payload serves an excluded-night count of 1 with 1 `other`
- **THEN** the full rail's rows after the total read 1 "other reason"
- **AND** the accessible description carries the clause "1 night excluded: 1 other
  reason" and the panel's line reads "1 excluded night: 1 other reason"
- **AND** a payload serving 2 `other` reads "2 other reasons" in all three

### Requirement: A render keeps focus inside a seated Diagnose case file

The desk SHALL NOT detach the Diagnose case file when it renders while that
case file is already seated and not parked. A render the reader did not ask
for SHALL leave the seated case file attached, so keyboard focus held inside
it, its selection and its reading scroll stay where they are. Examples of such
a render are a background Focus options read, guidance read or Plan state read
landing. A cold seat, a return that re-seats a parked desk, the loading frame
shown during Diagnose's own read, and the failed-read frames SHALL behave as
before.

#### Scenario: A late background read leaves the stepped Occurrence focused

- **GIVEN** a Diagnose case file whose selected Occurrence row holds keyboard
  focus after ↓ and ↑ steps
- **WHEN** a background guidance or Focus options read lands and the desk
  renders
- **THEN** the case file is not removed and re-inserted
- **AND** the selected Occurrence row still holds keyboard focus

#### Scenario: A return still re-seats the parked desk

- **GIVEN** the reader left Diagnose for Changes, so its case file is parked
- **WHEN** the reader returns and the status read answers unchanged
- **THEN** the parked case file is seated back in the desk as before

### Requirement: A Pattern owns its causes in the rail

In the rail, a Pattern row SHALL hold its claimed causes beneath it on
the Pattern's own spine, one line per cause carrying the cause's name, the
count, denominator and noun of each of its served count sentences in served
order, never merged, and a drill chevron. A
toggle on the Pattern row SHALL name the number of causes, SHALL be open on the
first ranked row and closed on every later one on arrival, and SHALL be operable
by pointer and keyboard with its state exposed to assistive technology. Cause
lines SHALL carry no mini. A cause's chevron SHALL open that cause's case file
and the Pattern's chevron the Pattern's, exactly as before; Focus entry and
occurrence selection SHALL be unchanged. Claimed causes SHALL no longer appear
as sibling rail rows.

#### Scenario: Causes fold under their Pattern

- **GIVEN** a synthetic window whose first ranked row is a Pattern with claimed
  causes and a later Pattern with one
- **WHEN** Diagnose loads at each supported desktop size
- **THEN** the first Pattern shows its causes beneath it and the later one shows
  only its toggle, each toggle naming its served cause count
- **AND** no claimed cause is a sibling row and no cause line holds a chart
- **AND** opening a cause's chevron lands on that cause's case file

### Requirement: The rail shows served urgency

The first tier caption in the rail SHALL paint in the primary hue and
the rows of that tier SHALL carry a rank stripe and a primary rank numeral.
Later tiers SHALL stay quiet. The caption word, the tier membership and the rank
SHALL be the served values; the desk SHALL derive none of them.

#### Scenario: One tier still reads as ranked

- **GIVEN** a synthetic window in which every ranked row shares one served tier
- **WHEN** the rail renders
- **THEN** that tier's caption is primary and each of its rows carries the stripe
- **AND** the caption and ranks equal the served projection's

### Requirement: Every ranked rail row draws one mini instrument

Every ranked row's mini in the rail SHALL be the same instrument: the
matched cohort's label with its count at the left, `TYPICAL` with the
denominator at the right, the event named on the anchor line, the target band
dashed, and the rail's cohort palette. No mini SHALL draw in the comparison blue.
A row whose evidence cannot supply a cohort response SHALL keep its existing
honest unavailable state rather than a second instrument.

#### Scenario: A Cause mini matches a Pattern mini

- **GIVEN** a synthetic window holding a ranked Pattern, a ranked event-comparison
  Cause and a ranked high-carb-sequence Cause
- **WHEN** their minis render
- **THEN** each carries the cohort label and count, the typical denominator, the
  named anchor and the dashed target band
- **AND** every series colour resolves to a rail cohort token

### Requirement: Rail rows print the served count sentence

Every count-bearing rail row in the rail SHALL print each of the projection's
served count sentences for that row, in served order and never merged, with each
count and denominator emphasised. The desk SHALL hold no
noun or outcome word list of its own.

#### Scenario: One grammar

- **GIVEN** a synthetic window holding a Pattern row and a Cause row
- **WHEN** the rail renders
- **THEN** both rows read `n of d noun outcome` with the served words
- **AND** a Cause appearing in two families prints both served sentences

### Requirement: The basal lane names and paints every verdict

The basal lane SHALL show a head row above its cells carrying the
lane's name and a key of the served verdict short forms with their counts, fully
visible inside the lane at both supported desktop sizes. Every cell SHALL paint
its served verdict: hold a filled neutral, raise the high gold with an upward
glyph, lower the accent with a downward glyph, insufficient hatched, no data
dotted; each key mark SHALL match its cells' paint. A selected cell SHALL keep
the primary outline and a staged cell the underline. The lane SHALL stay compact.
Slot selection, keyboard traversal, the slot graph opening and every staging and
verdict decision SHALL be unchanged; the lane paints what is served.

#### Scenario: The key is visible and matches the cells

- **GIVEN** a synthetic store whose lane holds supported raise and lower slots,
  hold, insufficient and no-data slots, one selected and one staged
- **WHEN** the lane renders at each supported desktop size
- **THEN** the key's box lies wholly inside the visible lane above the cells
- **AND** each verdict's cells and its key mark share one computed paint, and
  hold cells are not the bare ground
- **AND** the key's words and counts equal the served lane counts

### Requirement: Diagnose opens on the 24 h window

On a cold arrival with no contextual entry and no retained window, the desk
SHALL open Diagnose on the 24 h window. A contextual entry's window and a
retained window SHALL still win.

#### Scenario: Cold arrival

- **GIVEN** the built app on the synthetic showcase
- **WHEN** the reader opens Diagnose with no entry context
- **THEN** the 24 h window is selected and the findings read is unscoped

### Requirement: A cold destination shows a count-free skeleton

While a desk destination loads cold, the desk SHALL show a skeleton of rail rows
and stage instruments in place of the empty block. The skeleton SHALL state no
count, title or value, SHALL shimmer slowly, SHALL hold still under reduced
motion, SHALL keep the loading status and its named text for assistive
technology, and SHALL keep the rail at the Diagnose reference width. The
retained-Day reload and the named roster and reassessment loading text SHALL be
unchanged.

#### Scenario: Cold Diagnose

- **GIVEN** the desk's Diagnose reads held open
- **WHEN** the loading frame stands at each supported desktop size
- **THEN** skeleton rail rows and stage instruments are visible, none holds text
  content, and the status element is still announced
- **AND** under reduced motion no skeleton element animates
