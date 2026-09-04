# Verify comparison: grounded design questions

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
2. How it is going: relevant recent events alongside the reference population;
   event selection exposes the same kind of evidence detail as Diagnose.
3. What can be concluded: a backend-owned interpretation, its evidence support,
   and what is still missing. Early observations remain distinct from conclusions.
4. Other care outcomes: a restrained set of supporting before/after values or
   compact trends, with units, period labels, and relevant denominators.

This hierarchy is a proposal, not a visual lock. Sparkline rows are an option to
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

### Q1 — What is the smallest useful first experience?

Candidate: a carb-ratio change confined to one block, with recent meals and the
before-change reference. It exercises the requested scoping and reuses the meal
charts. Confirm against the user's current priority before filing a build.

### Q2 — What is a fair before/after comparison?

Set baseline selection and stability, event eligibility, changing meal mix,
starting glucose, repeated events within a day, missing coverage, and unequal
exposure durations. Specify which observed traces can appear early and what delta
or direction is withheld until supported. “Last three” is an illustrative view,
not an evidence threshold. Mean versus median is also not settled by that phrase.

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
old withholding rule and the requested early “last few meals” read need an explicit
resolution. Do not treat this epic as silently amending either historical record.

The visual work should revise the running shipped surface through ui-craft, with
its existing behaviors inventoried and any sanctioned changes recorded. No fresh
mockup may substitute for the current app.

## Evidence required before implementation admission

The selected slice needs a bounded risk contract and public-interface acceptance
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
