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

## Open questions

### Q1 — What is the delivery boundary? Resolved

The complete Verify feature is the delivery boundary, as recorded in the
feature-wide delivery ADR below. The lunch example does not narrow the feature.

### Q2 — What is a fair before/after comparison?

For the lunch example, the fixed continuous previous-setting baseline capped at
90 elapsed days, median with descriptive spread, and meal-bolus alignment from
-1 to +5 hours are settled by the ADRs above. Do not re-interview those choices.
Resolve event eligibility (including overlapping eating), repeated events within
a day, pointwise weighting, missing coverage, and changing starting conditions.
Define the corresponding reference and alignment rules for the other change types;
do not silently generalize lunch-specific policy to nights, corrections, or Focuses.
Specify which observations appear early and whether the feature describes response
or supports an interpretation of benefit. Unequal periods do not require equalized
counts. No support floor or After cap has been agreed.

### Q3 — How do the comparison periods fit the existing Trial lifecycle?

The attended ADR 340 rulings below govern this question. Preserve detection,
reverts and active-watch semantics. Ground the minimal change to the read-only
Verify evidence periods and visibility needed for the accepted comparison duration;
do not reopen the whole lifecycle. Maturity and an outcome assessment remain
different facts. The existing serving path currently couples the periods to
maturity, so the implementation boundary must name how those reads separate
without altering the active watch.

### Q4 — Which existing outcomes earn space for each change?

The attended ADR 340 rulings below settle automatic selection, separate outcome
assessments, concerns without causal attribution, and explicit uncertainty.
Use the existing target metrics and evidence producers as the starting point.
Resolve only gaps in their scope, denominator, unavailable states and assessment
support. No goal-picker or new generic metric framework is requested.

### Q5 — Which existing decisions and interactions should survive?

ADR 24 (ic-trial-acceptance) proposed meal-based I:C readiness and a separate
30-data-day foregrounding horizon. ADR 136 (verify-attribution-uncertainty)
proposed per-block views and day-clustered uncertainty on the difference, including
withholding bare differences when evidence is thin. Neither is implemented here.
Issues #182 and #183 were closed NOT_PLANNED in the operator's backlog reset, with
no closing implementation PR. Their closure did not mean the behavior shipped.

The operator explicitly does not want those decisions revived by default. Reassess
which parts still fit today's Diagnose and this request; record any sanctioned
amendment in the repository's ADR home before implementation. In particular, the
old withholding rule and the requested early group comparison and event drill-down need an explicit
resolution. Do not treat this epic as silently amending either historical record.

The visual work should revise the running shipped surface through ui-craft, with
its existing behaviors inventoried and any sanctioned changes recorded. No fresh
mockup may substitute for the current app.

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
The next design work is a capability inventory of existing evidence and chart
interfaces, with only the actual missing capabilities brought back for decision.

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
inventory. The two identified response-chart extensions remain proposed.

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
that existing Revert boundary. Whether the session-only Keep action earns space
in the revised surface is an attended presentation decision, still open.

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

These scenarios are partial admission criteria, not a claim that the feature is
ready to implement. The exact supported-assessment policy, period reconciliation,
and full rendered behavior coverage remain outstanding.

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


## Remaining scope after existing-code grounding

### Reuse choices that need no new product policy

Start outcome selection from the existing automatic target mapping. Preserve the
meaning of each producer's measure: TIR/TBR use observed glucose readings; peak
and nadir have separate qualifying-meal counts; Focus behavior rates use their
published eligible-opportunity counts. Rescue entries are observation context,
not a proxy for low episodes. Do not add a lows-per-meal algorithm to literalize
Connor's illustrative wording.

Use `project_cohort` for the descriptive response aggregation rather than writing
another median/spread implementation. The serving path must form the correct
period-owned occurrence traces first. Its existing point-support labels describe
whether the curve can be displayed, not whether a change helped.

The existing complete response mount accepts a Finding case-file envelope and
styles its named cohort roles. A Before/After rendering must adapt that existing
input contract honestly; it must not invent a diagnosed Finding or change a
population merely to satisfy a renderer. The final shared interface and evidence
of preserved interactions remain part of UI Craft's reuse proof.

### Concrete serving work to bound

- Select comparison bounds once for a detected Trial and feed them to all its
  evidence reads. The current scalar summary and curve use different inclusivity
  at the change instant. Resolve that serving inconsistency explicitly, with
  exact-boundary synthetic tests, while preserving detection.
- Expose extended comparison history separately from the existing active-watch
  decision. A selected Trial that still expires from the roster after 28 days
  cannot deliver the requested continuing comparison. Do not extend the active
  Trial/Focus exclusion period as an accidental consequence.
- Keep the response chart's full event window distinguishable from the scalar
  peak/nadir's truncated window. The existing Trial scalar path passes all boluses
  as truncation context, while the general trend passes meals. Do not silently
  change or conflate either during the redesign; the desired scalar source must
  be explicit in the final serving contract.
- Obtain Focus Before/After data at its actual pin boundary using existing
  behavior tally and outcome computations. Averaging existing tiled percentages
  is not that comparison, and calling the trend's active-watch resolution inside
  a read-only review endpoint can drop a Focus. Keep that write path out.
- Use the existing rescue observation state and preprocessing deliberately.
  The trend filters marked false lows and the current Trial evidence does not;
  matching metric names alone cannot establish matching input semantics.

### Assessment is the remaining substantive scope decision

The existing selected Trial response has no uncertainty-aware judgment that the
change helped. `day_rate_clears` and `newcombe_diff_interval` already assess a
specific binary day-rate comparison; they are not generic assessments of median
meal response, repeated meal outcomes, or Focus opportunities. Reusing them for
those different quantities would invent confidence rather than reuse behavior.

The smallest approach is to reuse existing supported assessment where its exact
question and population fit, and show other outcomes as observed differences with
an explicit “effect unclear” assessment. It would keep useful evidence visible
but would not eventually produce a supported benefit verdict for every change
type. Meeting that broader expectation requires a narrowly scoped new assessment
calculation, beyond merely reshaping data for the frontend. This choice remains
open; neither approach is admitted by this grounding note.
