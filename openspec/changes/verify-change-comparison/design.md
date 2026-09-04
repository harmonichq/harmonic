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

### Q3 — How long does a change stay visible, and when is it ready?

Separate observation progress, confidence in the outcome, and the period a change
occupies the active watch. The user wants weeks to a month or longer when needed.
Reconsider the old fixed expiration and single-active-change constraints together;
an indefinitely maturing change must not silently lock the workflow. Decide what
happens on a further setting change, revert, feed gap, or return to an old setting.
Do not inherit counts from recommendation support without checking the question.

### Q4 — Which outcomes earn space for each change?

Choose the intended outcome, guardrails, relevant supporting measures, and whole-day
care context. Define units, direction, scope, denominator, and unavailable states.
Decide whether users choose an objective or a default is inferred. Specify Focus
adherence and outcome independently. Decide whether compact trends add meaning
beyond a well-labelled pair of values and a supported difference.

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
