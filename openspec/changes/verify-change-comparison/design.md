# Verify comparison: grounded design questions

## Attended continuation, 2026-09-04

Connor rejected a latest-meal-first opening: “n=1 is an anecdote.” The comparison
will lead with groups; individual observations belong in drill-down. A disposable local wireframe explored paired plots with an overlay using
manufactured data and shipped chart options. Connor accepted that visual direction;
paired remains the provisional default. The wireframe is not part of this plan
and its custom wrappers do not satisfy component reuse.
No visual lock, statistical policy, or child-ticket admission follows from it.
Historical decisions remain open for reconsideration.

## ADR 336 — Fixed previous-setting baseline, capped at 90 days

Connor accepted unequal periods and a fixed previous-setting reference:
“I don't need equal length periods. The point here is we're comparing averages.
So collecting more data is better than collecting less.” He capped the look-back:
“We shouldn't go back too far, maybe max 90 days.”

For the selected lunch carb-ratio change, Before ends at the actual change and
begins at the later of the previous continuous lunch-ratio period's start or
90 days before the change. Keep those boundaries fixed as After accumulates.
Do not truncate or downsample either period merely to equalize their durations
or observation counts. This does not admit older periods separated by a different
setting, even if their ratio matches.

The displayed meal and day counts remain separate. More observations do not
by themselves establish comparability, independence, or benefit. Response
eligibility, feed-gap handling, and subsequent changes remain unsettled.
The cap limits elapsed look-back; it is not 90 observed days gathered
by reaching further into the past.

## ADR 336 — Median response with descriptive spread

Connor chose median over arithmetic mean: “counting is so inconsistent and
there's so many other variables that mean becomes problematic”.

The main before/after response lines use the median at each aligned point.
Keep the middle half of responses visible as descriptive spread. That spread
is not a confidence interval on the effect of the setting change. Median reduces
sensitivity to extreme responses; it does not correct inconsistent carb entries,
make the groups comparable, or isolate the setting's effect.

The local wireframe used this presentation. Meal-bolus alignment is settled
below; observation weighting, eligibility, and inference remain open; this decision chooses the
summary statistic, not those policies.

## ADR 336 — Reuse chart components across Verify

Connor clarified the epic-wide boundary: “I want to reuse the chart components,
but simply re-scope the timeframe or the data that feeds them.” He added:
“if one doesn't exist and we have to make it, then that becomes a different
conversation.”

Every Verify chart must reuse an existing chart component, including its
interactions. Similar appearance, copied chart configuration, and reusing only
an option builder while recreating interaction behavior do not satisfy this rule.
Change data and exposed time bounds. Bring missing component capabilities back
to Connor before creating or extending a chart. Do not compose a new chart from
fragments of different renderers to evade this boundary.

For the lunch comparison, align to the meal bolus, show one hour before through
five hours after, and clearly mark the bolus at zero. The axis expresses elapsed
time relative to each meal, not wall-clock alignment. No secondary clock view was
requested.

The current wireframe reuses `eventComparisonChartOption` but creates its own
ECharts mounts and hover handlers. It is an accepted visual direction, not an
accepted component implementation. Do not lift those wrappers into production.

Inspection found the full shared `renderEventSurface` component in
`frontend/diagnose-event-comparison.js`. It accepts group data and
`projection.window_min`, owns median/spread rendering, legend, pointer and keyboard
readouts, and cleanup. It computes its glucose scale from its own supplied groups;
it exposes no injected common-scale argument and currently draws no dedicated
bolus-zero line. The existing Verify `heroOption` draws that line but hardcodes
the meal endpoint at four hours and does not render descriptive spread.
These are component gaps to discuss, not authorization to combine or replace them.

## Current baseline, inspected 2026-09-04

Source: origin/main at e9a69c88f9bd21782ce22a763c309bad4012a0eb.
The ordinary checkout was left untouched. Its local work and newer/private design
artifacts are not silently included in this baseline.

The offline server ran the shipped app with --no-fetch and a database produced by
scripts/gen_revise_e2e_db.py from the ordinary checkout. That generator is absent
from origin/main; its output stayed untracked in the isolated checkout. The database
contains synthetic data only. Its only setting change has aged out of Verify.
Populated Verify views were therefore inspected by passing the committed
mockups/verify-660-story.synthetic/payload.json through the shipped adapter and
component in the browser. These are fixture-driven UI observations, not evidence
that the live API has the future comparison behavior.

### What the screen showed

- Diagnose combines a clock overview, individual meal-run evidence, a Findings
  queue, and a watched-change area. The event/clock controls, evidence charts,
  expandable chart collection, and docked readout establish reusable interactions.
- Verify dedicates the left canvas to one pair of median curves. Its switcher
  changes between a clock comparison and a meal-aligned comparison; the fixture's
  carb-ratio detail labels its captured 12:00–15:00 block.
- The Verify inspector shows the setting diff, day pips, TIR/TBR, manual carb
  counts, limitations, and a decision area. The meal view does not offer the latest
  three meals as selectable events against the baseline. Coincident medians can
  obscure one another. At 1280×720, the decision content extends below the visible
  inspector area.
- The fixture displays raw manual-carb counts from unequal periods, with a
  favorable/unfavorable arrow. Comparison denominators and interpretation need to
  be settled before reusing this presentation for care outcomes.
- The visible progress remains day 7/14 or day 14/14. Keep is session feedback;
  Revert routes to Plan. The component currently displays Trials, not Focus detail.

These observations ground this epic; they are not separate bug tickets.

## Candidate information hierarchy

1. What changed: setting/behavior, before and after where applicable, affected
   window, actual start, and the intended outcome.
2. How it is going: before/after groups with individual events available in drill-down;
   event selection exposes the same kind of evidence detail as Diagnose.
3. What can be concluded: a backend-owned interpretation, its evidence support,
   and what is still missing. Early observations remain distinct from conclusions.
4. Other care outcomes: a restrained set of supporting before/after values or
   compact trends, with units, period labels, and relevant denominators.

This hierarchy remains a proposal except for the settled group-first opening; it is not a visual lock. Sparkline rows are an option to
try in the shipped surface; their usefulness must justify a new component.

## Candidate comparison content

| Change | Primary evidence to explore | Supporting measures to evaluate |
| --- | --- | --- |
| Carb ratio | Meal runs dosed in the captured changed block; recent runs versus comparable pre-change runs | Post-meal glucose response, low/high exposure, rescue context, delivered insulin and Control-IQ contribution where the existing producers support it |
| Basal | Relevant nights/rest evidence for the changed hours | Glucose during the relevant rest period, low/high exposure, delivered versus programmed basal |
| Correction factor | Relevant correction/rest-window evidence for the changed hours | Response to correction, subsequent lows, additional insulin and starting conditions |
| Behavior Focus | The detector's eligible opportunities before and after pinning, with observable adherence separate | Behavior-specific response and clean rate; missing adherence remains unknown |
| Whole-profile or several-setting edit | One real change with the relevant evidence views inside it | Whole-period care context without assigning an effect to a single constituent setting |

These are candidate measures, not validated endpoints or clinical targets. Mean
glucose, standard deviation or coefficient of variation, TIR, TBR, and TAR belong
in the compact-care discussion. Lower mean glucose or less delivered insulin is
not automatically improvement. Denominators, observation quality, and the intended
outcome govern interpretation. Total insulin, algorithm-delivered insulin, and
delivered-minus-programmed basal must not share an ambiguous “Control-IQ delta.”

## Existing implementation worth reusing

- ciq_autotune/watched_change.py: detected changes, captured I:C block identity,
  Trial periods, Focus lifecycle, and the current shared active-change constraint.
- ciq_autotune/trial_evidence.py: per-period envelopes, meal arcs, and day rows.
- ciq_autotune/outcomes.py and outcomes_trend.py: existing care-metric producers.
- frontend/diagnose-evidence-charts.js: shipped basal, correction-factor,
  carb-ratio, and event-comparison chart definitions.
- frontend/diagnose-event-comparison.js and diagnose-workstation-chart.js:
  existing response comparison and chart interactions.
- frontend/verify-workstation-data.js, verify-workstation.js, and
  verify-workstation-chart.js: current Verify adapter, composition, and median ribbon.

Reuse must preserve semantics. A Diagnose event-comparison cohort is not by itself
an intervention baseline, and an analyzer recommendation floor is not by itself a
before/after outcome-confidence rule. An API shaped for a currently selected
Diagnose window cannot silently move the tracked change's evidence boundary.

## Scope disposition

The delivery boundary remains the complete feature. The attended ADR 336 and
ADR 340 rulings below are authoritative. The final ADR 340, “Resolve remaining
scope under delegated design authority”, settles the evidence, assessment,
historical-decision and composition choices previously listed as Q2–Q5.
The safe running-app behavior and visual evidence are still required before
implementation admission; no source-only design is called a visual lock.

## Evidence required before implementation admission

The feature needs a bounded risk contract and public-interface acceptance
criteria. Cover correct change/window identity, no pre-change observations counted
as post-change evidence, no misleading success from thin or incomparable data,
backend-owned conclusions, missing-data states, and honest before/after labels.
Use synthetic generators and the existing public-interface/browser checks for the
chosen behavior. A planning map is not a claim that those checks have been run.

## Local screenshot record

The synthetic screenshots remain outside the repository under the task's local
`verify-baseline` visualization folder. Captures cover Diagnose overview and meal
inspector, Verify empty state, maturing profile, switcher, completed meal comparison,
and hover readout, all at 1280×720 in the rendered dark theme. These are visual
exploration records, not a full browser-gate pass or an approved new design.

## ADR 336 — Deliver the Verify feature as a whole

Connor corrected a proposed single-lunch release on 2026-09-04: “I'm trying to
ship a feature, not one component of the feature.” The delivery target remains
Verify across setting Trials and behavioral Focuses, including the primary
comparison, supporting outcomes, and watch/decision behavior. The lunch example
helps settle shared behavior; it is not an independently admitted release.

Use one feature-wide scoping/design spike to reconcile the existing decisions,
check actual component reuse, settle remaining behavior, and lock the running
Verify surface. Aim for one integrated build after that work. Do not assume that
an individual chart, shell, or adapter earns a ticket. Any necessary split must
name a real dependency or independently useful capability and be discussed with
Connor. Ticket session sizing may use internal sub-orders without redefining the
feature or automatically generating a component backlog.

The user permits deliberately scoped child tickets. All children use native
parent links and protocol labels; real prerequisites use native dependencies.
Normal ticket triage, start, revise, finalize, and human merges remain mandatory.
This decision authorizes planning and child admission, not unreviewed implementation.

### Planning spike remit

Resolve Q2–Q5 across the whole feature in the attended spike
[#340](https://github.com/harmonichq/harmonic/issues/340). These questions remain
unresolved until its verified result supplies the decisions. Treat their existing
answers and the component-reuse ADR as constraints. Ground component capabilities
against the child's pinned source before asking for product decisions. Missing
capabilities require the separately requested discussion with Connor; routine
composition and data scoping are not reasons to file a new component ticket.
Return the decisions, risk contract, visual lock, acceptance scenarios, and a
justified integrated implementation shape. Do not claim this map is build-ready.

## ADR 340 — Judge the outcome and keep the comparison visible

Connor settled the first attended question on 2026-09-04: Verify should judge
whether a change helped while also presenting the before/after evidence. When
the result is not clear, that uncertainty must be explicit.

The feature therefore owes an outcome assessment alongside the underlying
comparison. A descriptive-only comparison does not fulfill the request. An
unclear result must remain visibly unclear rather than imply benefit or no effect.
The previously settled median and middle-half spread remain descriptive evidence;
this ruling does not make that spread confidence in the effect of a change.

The assessment method, evidence requirements, outcome priorities, and exact
wording remain open for the attended spike. This ruling chooses the product's
responsibility; it does not authorize a clinical threshold or a causal claim,
and does not by itself revive the unimplemented policies in ADR 24 or ADR 136.

## ADR 340 — Assess relevant outcomes separately without causal attribution

Connor clarified that Verify should rate the outcomes relevant to the selected
change and also surface concerning differences that might be associated with it.
A favorable result on one outcome must not conceal a concerning result on another.
The presentation must not claim that the changed setting caused an observed low
or other outcome.

Show the observed Before and After values with their units and denominators,
then describe whether the observed measure is higher or lower. Connor's example
was the average number of lows per meal in each set, rather than saying that a
carb-ratio change caused lows. This is a presentation and interpretation ruling,
not yet a definition of a low event, its meal association window, eligibility,
or a statistical threshold. Those definitions remain to be grounded and settled.

Keep uncertainty explicit for each assessment. A numerical difference alone does
not settle whether the change helped. The relevant outcome set, concerning-outcome
rules, and any combined summary remain open; no single overall score is adopted.

## ADR 340 — Select relevant outcomes automatically

Connor confirmed that Verify should automatically choose the outcomes relevant
to each change, without requiring the user to select a goal. This applies across
the feature's setting Trials and behavioral Focuses. The specific outcome sets
and their denominators remain to be grounded and settled in this spike.

## ADR 340 — Accumulate After without a fixed expiry

Connor confirmed that After keeps accumulating for as long as the relevant
setting or behavior stays unchanged, with no fixed expiry. Elapsed duration alone
does not end the After evidence period.

This is the desired comparison duration, subject to the frontend-first scope
boundary below. The current implementation caps evidence at 14 days and roster
visibility at 28 days. Ground a minimal serving change before admitting extended
comparison periods; this preference does not authorize replacement of Trial
detection, reversion handling, or the active-watch lifecycle. The previously
settled Before baseline is unchanged.


## ADR 340 — Anchor the frontend redesign in existing Trial logic

Connor clarified the scope on 2026-09-04: this is primarily a frontend redesign.
Reuse the existing automatically detected Trials and current lifecycle logic.
Backend changes may serve the frontend's concrete evidence and presentation needs;
a broad refactor or reinvention of Trial detection and lifecycle is not admitted.
Ground each required addition against existing behavior before proposing it.

The earlier discussion of successive setting periods is not authorization to
replace current change/revert rules or create a persistent Trial archive. Desired
comparison periods must be reconciled with the existing serving path, with any
necessary logic change made explicit and kept narrowly scoped. Preserve existing
behavior by default rather than interviewing the operator to redesign it.

### Grounded existing behavior

- `detect_trial` derives the active Trial from dose/basal value histories and
  settings-snapshot profile switches. It already distinguishes a third value
  from an in-window return to baseline and coalesces related parameter changes.
- `review_trials` independently serves the read-only Verify roster and selected
  evidence. Its candidate builder reuses regime and switch detection, suppresses
  closed revert loops, and admits block-scoped carb-ratio changes through captured
  Plan provenance. It returns at most three recent Trials within 28 days.
- Target outcomes are already inferred: basal uses TBR; correction factor and
  glucose target use TIR; carb ratio uses the meal response; whole-profile changes
  use TIR and meal response. Start with those existing choices when selecting
  the redesigned surface's outcomes.
- Selected detail currently sets Before to the previous 14 days and After to at
  most 14 days. `trial_breakdown` accepts those period bounds and serves settings
  differences, glucose envelopes, meal responses where applicable, rescue counts,
  and per-day data. This is the existing path to extend for concrete display needs.
- The separate active-watch path gives a Trial precedence over a Focus and can
  persistently drop the Focus. Reading the Verify Trial roster does not do that.
  Extending comparison evidence must not silently change these watch semantics.

The source and existing tests ground these facts; no production code was changed.
The capability inventory below grounds the final delegated-design decisions.

### Frontend reuse inventory, #340 attended grounding

UI Craft setup routes this shipped surface to `revise` with the checkout's
complete synthetic QA copy-then-serve declaration. No app was started during
this triage setup, and source inspection is not a visual lock.

| Requested read | Existing implementation | Concrete remaining gap |
| --- | --- | --- |
| Before/After meal groups with spread and inspection | `renderEventSurface` in `frontend/diagnose-event-comparison.js` renders served cohorts, descriptive spread, selected traces, legend, keyboard and pointer readouts; its projection supplies elapsed-time bounds | The full mount computes its own glucose range and exposes no common-range argument; the chart has no dedicated zero line. Discuss these extensions before adopting them. |
| Trial meal evidence | `trial_breakdown` already scopes meals to the captured block and supplied periods | Its envelope currently serves median/count bins through +4 hours, not the requested +5-hour cohort/spread and occurrence payload. Reuse existing evidence producers where semantics match; do not change detection to fill this payload. |
| Basal and correction-factor evidence | The shipped evidence registry has basal night and correction-factor rest-window charts | Registry option builders alone are not complete component reuse. Confirm the existing mount and interaction ownership before choosing their Verify composition. |
| Focus adherence and outcome | `FocusView` supplies lever identity and target metric; existing `BehaviorTrend` carries the lever's series | Verify's current Trial adapter has no Focus detail. Compose the existing Focus/trend data without replacing Focus pinning or preemption. |
| Supporting Trial outcomes | Selected Trial detail already serves target/guardrail evidence, rescue counts and day rows | Preserve units, meaning and denominator; raw rescue-log counts are not automatically lows per meal. |

No new component, lifecycle change, or complete reuse proof is claimed by this
inventory. The following ADR records approval of the two response-chart extensions.

## ADR 340 — Extend the shared response chart for paired comparison

Connor approved two extensions to the existing shared response-chart component:
an injected common glucose scale for paired Before/After plots, and a dedicated
meal-zero marker. Preserve the component's existing legend, pointer and keyboard
inspection, selected-trace behavior, and cleanup. The marker and scale are display
capabilities, not changes to Trial detection or evidence eligibility.

This is specific approval for these two extensions. It does not authorize a
replacement wrapper or additional chart capabilities not yet discussed.

### Additional reuse and behavior grounding

The basal, correction-factor and carb-ratio chart descriptors are already mounted
by Diagnose's `mountDescriptorChart`, with resize and disposal owned by the
workstation. These chart mounts are currently internal to the workstation;
sharing their existing mounting behavior is a frontend reuse task, not a reason
to copy options or invent alternate chart interactions. Fullscreen behavioral
response comparison already calls the public `renderEventSurface` mount.

The current Verify selected detail supplies evidence and maturity, but no
uncertainty-aware per-outcome assessment. Its frontend colors raw differences
as favorable or unfavorable. Existing outcome-trend day-rate comparison routines
answer a particular day-count question, not every Trial outcome. The requested
assessment needs an explicitly scoped serving design using existing computation
where applicable; no universal significance rule is inferred from these routines.

`createVerifyWorkstation` documents Keep as session-only acknowledgement with no
persisted verdict. Revert forwards the selected detail's Plan route through
`planRevertIntent`; the browser does not derive a replacement setting. Preserve
that existing Revert boundary. The later Keep-removal ADR governs the revised surface.

## ADR 340 — Remove session-only Keep and preserve Revert to Plan

Connor approved removing the current “Keep change” button on 2026-09-04. The
proposal stated that it saves nothing and recommended retaining “Revert → Plan”;
Connor answered “Sure.” Remove the session-only acknowledgement action from the
revised Verify surface. Do not add a persisted keep decision or change the Trial
lifecycle in its place.

Retain Revert's existing backend-supplied route into Plan, including its current
prior-setting availability and manual-review behavior. No direct pump action or
new frontend setting derivation is introduced. The implementation must amend the
Verify behavior contract and replay to record this sanctioned removal and verify
that the existing Revert behavior is preserved.


## Admission contract for the narrowed feature

### Risk contract

- **Must prevent:** exposure of credentials or personal data; irreversible loss
  of authoritative data; silent incorrect success; evidence assigned to the wrong
  change, period or affected window; causal claims or favorable certainty that the
  supplied evidence cannot support; an outcome comparison changing dosing advice
  or the active-watch lifecycle.
- **Must recover:** no new automatic recovery machinery is required.
- **Accepted failure:** missing or insufficient evidence remains explicitly
  unavailable or uncertain. A failed evidence request shows failure rather than
  a successful empty comparison. Existing request recovery behavior is retained.
- **Unsupported:** causal attribution to a particular setting, new dosing
  recommendations, and a replacement Trial or Focus lifecycle.
- **Evidence owed:** public-interface tests of period and change identity,
  evidence membership and denominators, missing-data states, assessment wording,
  preservation of detection/Focus behavior, and browser evidence for reused chart
  interactions and the sanctioned Keep removal.
- Why: the redesigned display interprets advisory health data; a misleading
  assessment is consequential even when it writes no setting.
- Disposition: this parent design is the downstream authority. The contract is
  bounded by the frontend-first scope ruling; it creates no new reliability tier.

### Acceptance scenarios already determined by attended decisions

1. Open a detected Trial: show its existing identity, actual start, setting diff
   and affected window alongside the comparison. Selecting another Trial swaps
   all evidence to that Trial; no mixed details or retained previous assessment.
2. Read a supported comparison: show Before and After values with their units,
   periods and denominators, the relevant outcome assessments, and any concerns.
   Describe observed differences without claiming the setting caused them.
3. Read an unclear comparison: preserve the available evidence and explicitly
   identify uncertainty. Descriptive middle-half spread is never presented as
   confidence in the effect; maturity alone never implies benefit.
4. Inspect a meal comparison: retain the group-first opening, the settled
   -1-to-+5-hour alignment, paired comparison with an overlay toggle, and the
   approved shared glucose scale and zero marker. Preserve the reused component's
   pointer and keyboard readouts, legend, selected trace and cleanup.
5. Open a Focus: show the existing lever's adherence separately from its outcome.
   Do not treat an unavailable adherence denominator as successful adherence.
6. Use the decision area: omit Keep; retain the existing Revert-to-Plan route,
   availability and safeguards. No persistent keep record or direct pump action.

The final delegated-design ADR supplies the assessment and period rules. These
scenarios do not claim rendered fidelity; the full running-app behavior coverage
and visual evidence remain outstanding.

### Verification completed during source grounding

`python3 -m unittest tests.test_watched_change tests.test_trial_evidence` passed.
`node --test frontend/verify-trial.test.js frontend/verify-workstation-data.test.js`
passed. These verify the current baseline, not the proposed redesign.

A manufactured `project_cohort` probe exercised empty, single-occurrence,
limited-support and supported populations over the requested elapsed-time bounds.
It also confirmed that multiple readings from one occurrence contribute only one
sample to a five-minute bin. The existing projector supplies median, middle-half
spread, per-point support and occurrence identity. Reuse its display-support
contract; it is not an outcome-effect confidence calculation.

### Document and behavior update ownership

The build must reconcile the current outcomes and surfaces specifications,
`CONTEXT.md`, Verify's public API documentation/comments, and the shipped Verify
component and replay contract where the admitted behavior changes them. Historical
ADRs and archived design evidence remain history; amendments belong here rather
than rewriting earlier records. The old complete-state replay expects two action
buttons and must change with the approved Keep removal. No source inspection is
claimed as a completed behavior sweep or a visual lock.


## ADR 340 — Resolve remaining scope under delegated design authority

Connor delegated the remaining logical design choices on 2026-09-04: “I actually
really trust you to get this right, so please just make the decisions you think
are logical.” The decisions below are agent-selected under that delegation, not
claims that Connor selected individual statistical constants or layouts.

### Evidence periods and lifecycle separation

Keep the existing Trial candidate derivation, identity, profile grouping, revert
suppression and Focus precedence unchanged. Extend only the read-only Verify
roster's historical reach; remove its elapsed-age exclusion and presentation cap,
and render older entries in the existing change picker, giving its list a
bounded scroll region for the longer history. Load only
lightweight summaries for that picker; fetch and cache detail only for the
selected subject, never eagerly for the entire roster. This is
history derived from existing data, not a persisted Trial archive. A change the
existing revert rules suppress remains suppressed.

For a setting Trial, derive Before from the immediately preceding continuous
relevant setting period, capped at 90 elapsed days. Missing history shortens the
baseline and is disclosed; never fill it from disconnected matching values.
After ends at the next change to the same parameter in the affected clock span,
or at the latest available data while that setting remains in force. For a
whole-profile Trial the relevant state is the whole programmed profile. Different
parameters or disjoint clock spans do not cut the period; name those overlapping
changes as context. These bounds affect comparison serving only. Existing
active-watch timing, Focus preemption and Revert availability remain unchanged.

Use half-open evidence periods consistently. Event ownership follows its anchor;
clip its plotted and measured evidence to the owned period, leaving missing
segments empty. A full -1-to-+5-hour axis does not imply complete observations.
Every scalar and plotted outcome receives the same period bounds and uses the
existing false-low preprocessing before grouping. Preserve captured I:C block
provenance instead of reconstructing it from today's profile.

For an active Focus, Before is the available 90 elapsed days before pinning and
After begins at pinning and ends at the latest available data. Present only the
existing active Focus; historical Focus archiving is outside this redesign.
Read its stored identity and existing behavior tally without calling the
side-effecting active-watch resolver from Verify. Existing pin/resolve/preempt
behavior remains the authority over which Focus is active.

### One selected-detail interface

Extend the existing `/api/verify/trials` read interface, rather than creating a
parallel review service. A roster request returns lightweight `trials` summaries,
`focuses` containing at most the existing eligible active Focus, and `selected:
null`. Every summary carries server-owned `kind` (`trial` or `focus`), `id`, title,
start and affected-window context. Existing Trial IDs stay unchanged; Focus IDs
come from the stored Focus row. The client treats `(kind, id)` as opaque selection
coordinates. Add an optional `kind` query argument defaulting to `trial`; pair it
with the existing `selected` argument for a detail request.

A selected response uses one common envelope, preserving Trial identity/diff and
`plan_route` when `kind` is `trial`, or Focus lever/pin metadata when it is `focus`:

- `kind`, `id`, `title`, `started_at`, and affected-window context identify the subject.
- `periods.before` and `periods.after` each carry start/end and boundary reasons.
  They are the single source fed to all displayed values and chart producers.
- `views` contains named shared-chart projections and their occurrence identities;
  no view independently chooses its population in the browser.
- `outcomes` contains keyed rows with label/unit, Before/After values, denominators,
  observed difference, and `assessment` (state, interval when available, confidence,
  method and human-readable reasons). States are `favorable`, `concerning`,
  `unclear`, or `context`; observed direction is separate from assessment state.
- `denominators` names eligible/readable counts, informative dates and coverage
  shared by the selected comparison. Each outcome also names its own denominator;
  shared counts never substitute for a different measure's population.
- `availability` carries `state` (`available` or `unavailable`) and a reason;
  no-data is an explicit successful unavailable result, not a request failure.

Use the existing read-only Trial-active check when deciding whether an active
Focus can be reviewed under the current precedence rule. Do not resolve/drop the
stored Focus here. An existing but currently ineligible Focus returns unavailable
with the precedence reason; an unknown subject returns the existing not-found
HTTP behavior. Invalid kind follows ordinary API validation. Computation or
transport failure remains an error, not an empty successful comparison.

The browser fetches one selected detail at a time and discards responses whose
request token or `(kind, id)` no longer matches the pending selection. Cache detail
for the current roster refresh, with the server retaining its existing ResultCache
invalidation behavior; include kind in the server cache key. A subject switch
replaces the subject, plots and assessments atomically. While a replacement loads
or fails, an already displayed subject may remain visible under its own label,
with an explicit pending/failed-target message. Never label old evidence as the
new subject. Initial failure shows an error and Retry. No new automatic retry or
background recovery mechanism is required.

### Response membership and outcome populations

Meal response groups contain existing qualifying meal anchors in the captured
changed block, with one supplied trace per anchor. Keep overlapping eating in
this descriptive view; do not claim an isolated meal response. Reuse the shared
cohort projector's one-sample-per-occurrence binning and support states, without
adding a new chart floor or equalizing Before and After counts. Individual meals
are drill-down, never the opening comparison when the group is too thin.

Keep existing peak/nadir measurements as separately named supporting measures.
Use the documented meal-context truncation of the existing outcome producer;
pass qualifying meals, not correction-only boluses, as that context. Label its
shorter observation window and separate peak/nadir counts. Do not present those
measurements as summaries of the full untruncated response curve.

For glycemic outcomes, reuse `compute_metrics` on the selected period and scope.
For meal-window measures, combine the eligible windows as a union before reading
CGM, so overlapping meals never double-count a reading. Retain both the number
of contributing meals and the observed-reading denominator. Basal reads use
existing detected Rest windows intersecting the affected hours. ISF keeps the
existing fasting/rest evidence semantics; do not relabel it a per-correction
response experiment. Whole-profile outcomes use whole-period readings and show
constituent setting changes without attribution.

Focus adherence remains the existing detector's behavior rate over its existing
eligible opportunities. Recompute counts in each exact period, rather than
averaging tiled percentages. Zero opportunities means unknown. Rescue context
uses the existing observation-aware producer in both periods; unobserved silence
is not zero rescues. Do not create a new lows-per-meal measure.

### Curated outcomes

| Change | Lead evidence and outcomes | Supporting/context reads |
| --- | --- | --- |
| Carb ratio | Meal response; time above range and time below range in the union of relevant meal windows | Existing peak/nadir and their separate support counts; starting glucose; observation-aware rescue context |
| Basal | Existing relevant-night evidence; time below range in the affected rest hours | Time above/in range; delivered versus programmed basal where already supplied |
| Correction factor | Existing rest-window evidence; time in range in those windows | Time below/above range, starting conditions, current evidence counts |
| Whole profile | Whole-period clock response; time in range and time below range | Constituent changes; time above range; mean/CV as neutral care context |
| Focus | Existing behavioral adherence and its existing mapped outcome, shown separately | Relevant low/high exposure and observation-aware rescue context |

Keep general care context subordinate. Lower mean glucose, lower nadir and lower
insulin delivery are not automatically favorable. Render their measured direction
without assigning benefit. No overall numeric score or causal effect label.

### Narrow outcome assessment

Add one read-only comparison calculation behind selected Verify detail. It returns
observed Before/After values, their difference, an uncertainty interval where
estimable, named denominators and an assessment with reasons. Keep this logic
beside existing evidence/uncertainty computation; no model registry, persistence,
background job, new dependency or dosing-engine change is needed.

Use the same statistic for the displayed difference and its interval. Resample
whole contributing pump-local dates independently within each period; all
observations from a date travel together. Preserve unequal period sizes and
within-day counts. The response curve's middle-half spread remains descriptive.
Use a deterministic 95% percentile interval, with 2,000 resamples, in the style
of the existing stdlib uncertainty implementation. This is an observational
uncertainty estimate, not an adjustment for confounding or proof of causation.
Do not reuse `Estimate.wide` on a difference around zero.

For a supported directional assessment require at least 14 informative dates in
each period. For glucose rates, an informative date has at least the existing
70% coverage threshold within that date's eligible clock/meal/rest duration;
partial dates use their eligible duration, not 24 hours. For meal summaries, informative dates contain eligible meals with the
required readable measurement; for Focus rates they contain eligible opportunities,
whether or not the unwanted behavior occurred. Binary night/day rates count all
eligible coverage-qualified nights/dates, including those with zero events. Events
supply their numerator only. Thus zero events over a positive eligible denominator
is an observed zero rate, while zero opportunities is unknown. These are comparison safeguards, independent of analyzer
recommendation floors and active-watch maturity. Show values and progress before
they are met, with the explicit unclear state. A fixed short Before may never
clear this floor; the comparison stays useful but its conclusion remains unclear.

Absent data, a denominator of zero, a non-estimable or degenerate interval, or an
interval including zero yields an unclear assessment, never “no effect”. For
binary nights-with-low comparisons, reuse the existing binary day-rate interval
and clearance rule instead of a degenerate zero-event bootstrap. Mark intervals
as approximate and per-outcome; there is no simultaneous or causal guarantee.

Phrase supported directions as observed changes: less high exposure, more low
exposure, or more time in range. When a favorable outcome and a concerning outcome
coexist, show a mixed result. An observed worsening of a low-exposure guardrail is
visible even when uncertain and prevents an unqualified favorable summary. Keep
its uncertainty attached. Display sample counts and missing coverage beside the
assessment; do not hide the Before/After values behind it.

### Historical decisions

For this redesign, the rulings above replace ADR 24's unimplemented proposal to
borrow I:C analyzer support for Trial readiness and its proposed 30-data-day
foreground horizon. The existing active-watch lifecycle stays in place.

They retain ADR 136's non-causal reading and day-grouped uncertainty principle,
but replace its complete withholding of an observed difference: show observed
values and explicitly uncertain differences while withholding a supported
benefit claim. Its ban on spread on individual period curves does not apply to
the already-approved descriptive middle-half response spread. No implementation
from the closed #182/#183 tickets is assumed to exist.

### Frontend composition and existing interactions

Keep the existing Verify shell, detected-change picker and What changed context.
The selected subject and affected window remain visible above the evidence.
Use the same shared response mount for Before/After groups, paired by default
with a common scale; the overlay toggle changes presentation only. It preserves
subject, populations and selected occurrence. Reuse the existing legend and
pointer/keyboard readout. Adapt the mount's data boundary for this real second
caller rather than manufacturing a diagnostic Finding or copying chart options.

Keep the inspector for automatically chosen outcomes, coverage and concerns.
Use one selected evidence view at a time for a combined change; reuse the shipped
chart-selection interaction rather than laying out a chart dashboard. Narrow
viewports stack the same content without losing period labels or actions.
Retain Revert's current backend-controlled availability and Plan route; remove
Keep as sanctioned above. Do not change Focus controls or the active-watch rule.

The frozen predecessor behavior and running-app revision remain the visual
contract. This document settles design direction, not rendered fidelity. No
visual lock or completed UI revision is claimed until the safe synthetic app's
behavior sweep and before/after evidence have been reviewed.

### Statistical grounding and limits

The percentile-interval mechanics follow the existing uncertainty module and the
[NIST bootstrap description](https://www.itl.nist.gov/div898/handbook/eda/section3/bootplot.htm).
The choice of daily resampling follows this repository's existing treatment of
within-day dependence. The 14-date floor is a conservative product choice aligned
with existing data-day expectations, not a clinically validated threshold.
Synthetic preflight covers degenerate, thin, unchanged and clearly shifted cases;
that checks behavior but is not a calibration study or a guarantee of coverage.

### Scoped-design review evidence

Independent review on 2026-09-04 countersigned this scoped design after three
corrections: eligible zero-event dates remain in rate denominators, historical
rosters load selected detail lazily, and Trial/Focus share an explicit selected
response and failure contract. The reviewer rechecked those corrections and the
new acceptance scenarios and reported no remaining blockers.

Grounding verification passed 48 focused backend tests (watched change, Trial
evidence, event comparison), six frontend Verify tests, and strict validation of
this OpenSpec change. A manufactured assessment probe exercised empty support,
one date with many events, unchanged distributions, unequal arm sizes, opposite
observed directions, and degenerate distributions. These checks ground the scope;
they do not verify an implementation of the proposed assessment.

This is a reviewed scope checkpoint. Running-app presentation, interaction replay,
and the complete visual/behavior lock remain pending; no implementation admission
or completed visual validation is claimed.

## ADR 340 — Design investigation delivery boundary

On 2026-09-04 Connor directed completion of triage through a posted work order
and delegated routine design decisions. This resolves the sequencing conflict
between a design-only spike and the issue body's request for a fully revised
running-app visual lock before production implementation is authorized.

#340 completes a bounded investigation: run the existing synthetic app, freeze
its current behavior, and produce the proposed presentation/interaction contract
and integrated build handoff. The shipped-surface route remains `revise`. Actual
revision, revised screenshots, and the final before/after behavior proof belong
to execution of the integrated build. This explicitly amends the issue body's
visual-lock timing, not its complete-feature delivery boundary. No production
implementation is authorized by the investigation order. The investigation must
not label a proposed contract as a visually verified revision.

The investigator owns checklist task 7 and requirement 7 in this change. Tasks
8–9 and product implementation requirements 1–6 are downstream ownership; read
those requirements as design constraints, not permission to implement them.

The investigation must:

- Replay every existing Verify story in
  `frontend/verify-660-story-behavior.replay.mjs` against the built app with
  `mockups/verify-660-story.synthetic/payload.json`. Use the dependency paths
  produced by `scripts/ensure_browser_gate_env.py`; its `PLAYWRIGHT_MODULE` and
  `VENDOR_DIR` feed the existing replay command in AGENTS.md. Do not use `ONLY`.
  Record the exact executed command, complete output, source revision and fixture
  provenance under this change's `evidence/triage-340/` directory.
- Use UI Craft behavior-sweep to inventory current source and live behavior,
  including behavior absent from that eight-story replay. Record a frozen
  baseline ledger in this change's `verify.behavior.md`, identifying existing
  replay coverage and any uncovered stories individually. Do not claim that the
  existing replay covers an invented new state. New regression automation for
  uncovered stories is a named build obligation rather than spike implementation.
- Inspect shipped charts and interactions for I:C, basal, ISF, profile and active
  Focus using committed synthetic fixtures. Record available baseline screenshots
  at 1440×900 and 390×844 in light and dark themes. Name any case absent from the
  fixtures as unavailable baseline evidence, with an explicit generator-owned
  build verification case; never manufacture screenshots of nonexistent behavior.
- Append the proposed screen/state contract to design.md: subject/affected-window
  context, Before/After labels and support, outcomes/concerns/uncertainty,
  paired/overlay interaction, group-to-occurrence drilldown, loading, unavailable,
  error/Retry, historical selection, Focus and Revert. Map every product
  requirement 1–6 to its visible state, interaction and future replay obligation.
  Record Keep as the authorized retirement. Preserve existing chart interactions
  and identify the exact approved shared scale, zero marker and data-boundary
  extension seams using current source citations.
- Return a proposed single integrated feature build, with a closed file inventory,
  dependency order, sizing traits, required generators/drift gates and browser
  matrix. Do not create build tickets or admit implementation. Task 8 owns that
  transition. Resolve routine presentation details using the delegated design
  authority and the current design system; don't reopen settled scope.

Use only the exact QA copy-then-serve declaration and synthetic source in this
checkout's AGENTS.md for an API server. Existing browser replays can use their
own declared synthetic static app runner. No live data or vendor fetch is allowed.
Browser launch requires escalation on this host. If the baseline fails, record
and reproduce the failure; do not fix production code inside this investigation
or claim the baseline passed. A failure prevents the handoff being called ready.

The only committed outputs are this parent change's documents and synthetic
baseline evidence. The app source, replay scripts, fixtures, global design system
and surface index remain inputs. Store proposed ledger amendments in the parent
change; the integrated revision will apply them to canonical surface artifacts.
The findings comment links the exact committed artifacts and reports the proposed
contract and remaining implementation proof separately. No planning-only PR.
