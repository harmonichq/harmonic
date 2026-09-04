# Surfaces

## Purpose

Harmonic is a single-page app with no build step and no login — the HTML shell loads unauthenticated, and the browser's embedded Vue interpreter renders four distinct surfaces to answer different questions about the data. Each surface renders read-only server-owned projections; surfaces never re-derive analysis verdicts that belong to the backend.

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
the drill. A chart picked from the explorer SHALL open that chart's finding
through the one chart-click route. The stage chart SHALL keep its drawer cell
as the marked current frame.

#### Scenario: Leaving a drill returns the rank-1 chart to the stage

- **GIVEN** a populated synthetic Diagnose window whose rank-1 finding differs from a lower-ranked one
- **WHEN** the reader drills the lower-ranked finding and then returns to the findings queue
- **THEN** the stage holds the rank-1 finding's chart
- **AND** the drilled chart's drawer cell is no longer the current frame

#### Scenario: An explorer pick opens the finding

- **WHEN** the reader picks a chart from the explorer
- **THEN** the explorer closes, that chart holds the stage, and its finding's drill is open

### Requirement: The charts drawer is a picker that opens minimized

The charts drawer SHALL open hidden and SHALL never return on its own; a field
shrinking past the dock floor SHALL hide it, and a field growing back SHALL NOT
re-dock it. Picking a chart from the drawer — by cell click, by Enter on a
cell, from a Watching tail cell, or from the explorer — SHALL seat and drill
that chart and put the drawer away. The bring-up control, the show-every-chart
control and chart fullscreen SHALL remain.

#### Scenario: The drawer opens hidden and stays hidden across a resize

- **GIVEN** a fresh visit to a populated synthetic Diagnose window
- **THEN** the drawer is hidden and the stage holds the rank-1 chart
- **WHEN** the field shrinks below the dock floor and grows back above it
- **THEN** the drawer is still hidden

#### Scenario: A pick puts the drawer away

- **GIVEN** the reader has brought the drawer up
- **WHEN** the reader picks a chart from it
- **THEN** that chart holds the stage with its finding's drill open
- **AND** the drawer is hidden

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
it, drawer and explorer cells SHALL keep the short nameplate, and no drill
level SHALL repeat it.

#### Scenario: The stage title is the headline's only home

- **GIVEN** a populated synthetic Diagnose window
- **WHEN** any family's chart holds the stage
- **THEN** the stage card's title equals that row's served headline
- **AND** the headline text appears nowhere else on the surface

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

### Requirement: The Diagnose findings rail is a tapered queue read off served order and tier

The un-drilled Diagnose findings rail SHALL render the findings projection's
rows in the server's order at three weights chosen from served facts only. The first shown priced ranked row SHALL render as the hero: its served title,
its detail line, and its flavor and tier words, with no headline of its own
(the stage card remains the headline's only home) and no chart of its own. Every further
shown priced ranked row SHALL render as a compact row carrying a mini chart
drawn by the same registry option the charts drawer's cell draws for that row,
from data already fetched for that descriptor. Every shown unpriced ranked row
SHALL render title-only under the existing seam sentence. Held, blind and
history reads SHALL stay collapsed behind the Watching control unchanged. Tier
captions SHALL print once where the served tier of consecutive shown priced
rows changes, each caption's text drawn from one pinned map whose domain is exactly the two
priced tier slugs and whose range is the design system's words for them;
unpriced rows carry no caption. The rail SHALL introduce no rank, tier, floor,
direction, threshold or ranking word of its own, and SHALL show no 0–100
number. When a compact row's mini host measures narrower than the rail's named
minimum the row SHALL omit its mini, mark it omitted, and keep its facts.

#### Scenario: The hero is the first priced row and carries no chart

- **GIVEN** a populated synthetic Diagnose window with at least two priced ranked rows
- **WHEN** the findings queue shows
- **THEN** the first priced row in served order renders as the hero with its served title and its detail line
- **AND** the hero contains no chart element and does not repeat the served headline
- **AND** the stage holds that row's chart

#### Scenario: A compact row's mini is the drawer's own chart

- **WHEN** a compact row's descriptor has fetched data
- **THEN** the row's mini renders the same series the drawer's cell for that chart renders
- **AND** no additional request was made for it

#### Scenario: Tier captions come from the pinned map only

- **WHEN** consecutive shown priced rows change served tier
- **THEN** exactly one caption prints between them, and its text is the pinned map's word for the new tier
- **AND** no tier word outside that map's range, and no word for an unpriced tier, appears in the rail

#### Scenario: A sift promotes the next priced row

- **WHEN** a sift hides the first priced row
- **THEN** the next shown priced row renders as the hero

#### Scenario: A narrow row keeps its facts

- **WHEN** a compact row's mini host measures narrower than the rail's named minimum
- **THEN** the row omits its mini and marks it omitted
- **AND** the row's title and detail line still render

### Requirement: A revision of the Diagnose findings rail ships with its ledger amendments and evidence

A revision of the shipped Diagnose findings rail SHALL amend the frozen
behavior ledger and its app-only replay for every added, changed, moved or
retired rail behavior in the same change and SHALL store before/after renders
of every affected state from the base and the revision served on the same
synthetic database at 1440×900, 1280×800, 1024×768, 768×1024 and 390×844.

#### Scenario: The replay proves the revision

- **WHEN** the amended replay runs against the built revision on the declared no-fetch server
- **THEN** it reports its applicable story count, zero failures and no skipped story

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
