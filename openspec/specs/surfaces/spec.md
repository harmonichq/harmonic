# Surfaces

## Purpose

Harmonic is a single-page app with a built shell and no login — the HTML shell loads unauthenticated, and the browser renders four distinct surfaces to answer different questions about the data. Each surface renders read-only server-owned projections; surfaces never re-derive analysis verdicts that belong to the backend.

## Requirements

### Requirement: The app is single-page, no-build, no-login HTML and Vue

The system SHALL satisfy the following:

The frontend is a single `frontend/index.html` file containing inlined Vue 3 and ECharts, loaded without a build step or login screen. The SPA shell loads on every origin, then makes bearer-token-gated API calls to load data. The three CDN dependencies (Vue esm-browser, ECharts) are vendored in browser tests; live requests use the unpkg / jsdelivr CDN.

Canonical browser addressing is `/<page>?<existing-page-state>`. The route query
carries only the selected page and the already-shareable Day `date`, Guide
`article`, and Diagnose `view`, `factor`, `start_min`, `end_min`, `another`, and
`occ` coordinates. A fragment carries no route: the retired `#/<page>?...`
grammar is unsupported, so a saved hash link opens the default page rather than
the page it names. Programmatic interfaces live below `/api` and local assets
below `/assets`.

#### Scenario: The app is single-page, no-build, no-login HTML and Vue

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

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
It displays their independent missed, announced, and not-comparable counts,
anchors missed rows at detected rise onset and announced rows at completed
carb-bolus time, and uses the fixed `[-60, +300]` axis. A zero attributed-missed
cohort is an explicit empty state, not a fallback to High verdict membership;
announced rows remain selectable through their server-owned Occurrence identity.
The five-way High verdict band and its denominator remain a separate account.

#### Scenario: Diagnose renders Finding case files without browser-owned policy.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

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

### Requirement: All four surfaces are available from the cockpit shell tab bar

The system SHALL satisfy the following:

The app shell presents a workflow sequence — Diagnose → Plan → Verify — as numbered steps in the header, plus a separate Day button anchored to the right. The drawer offers the same four buttons plus Settings. All surfaces update a single `tab` state; only the active tab is visible (others are `v-show="false"` and remain mounted).

#### Scenario: All four surfaces are available from the cockpit shell tab bar

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

### Requirement: Diagnose hosts a non-advisory aggregate-evidence section outside Audit and Watching

Diagnose SHALL host a distinct non-advisory aggregate-evidence section outside Audit
and Watching, fed by the fixed-window eating-sequence report. Nothing in it SHALL
stage a Plan change, rank in Audit, or enter Watching. Its adapter SHALL reshape
served aggregates without deriving a verdict, median, difference, or status. An
insufficient cell SHALL remain visible as insufficient rather than numeric. #278's
visual lock SHALL settle rendered name, placement, wording, and charts.

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

#### Scenario: The section consumes the server-owned fixed window

- **GIVEN** Diagnose requests eating-sequence evidence
- **WHEN** its data helper loads the report
- **THEN** it requests `/api/diagnose/eating-sequences` without a window parameter
- **AND** the server-owned fixed Diagnose source window determines the report

#### Scenario: A fresh report response does not invent an input-data age

- **GIVEN** a fresh eating-sequence report response without `input_data_age`
- **WHEN** Diagnose records its response age
- **THEN** the report passes through unchanged
- **AND** only that report shape's recorded age is cleared

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
