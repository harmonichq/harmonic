# #426 served names, not ids

## Status

**Triage source for #426.** An ordinary ticket change, triaged on 2026-09-23 as
part of the #422–#434 desk release. The inherited desk revise contract
(`mockups/harmonic-v2-desktop.behavior.md` and its replay
`frontend/desk-behavior.replay.mjs`) stays frozen; this change amends the two
stories whose wording moves (S61, S62) under Connor's standing sanction of
2026-09-23 and retires nothing.

## Why

Five reader-facing lines print an internal identifier even though the server
already has a name for the thing, or a closed word table would cover it:

- Day's "Opened from" prints the routing subject (`pattern:highs_after_meals`,
  `finding:over_treated_low`, `basal:180`).
- Episode Log rows end in the raw key for a missed meal, a meal bolus that fell
  short, a high-carb sequence and repeat eating, because the model read serves
  only the Lever key and the Day desk carries a six-entry name table.
- A Focus record's "What changed" prints the behavior's key.
- A record with no original context says "unavailable: not_recorded".
- A Pattern concern in Changes prints `habit:` and `setting:` ids in its member
  table and the raw action id as its Action figure.

Each was reproduced against the shipped modules on 2026-09-23 (base a4d374a7).

## What changes

- The per-day model read serves `lever_title` on every episode: the attributed
  Lever's name from the one lever name source, or null.
- The guidance read serves a `title` on every Pattern member, an `action_title`
  on every member that carries an action, and a `title` on the Pattern's action
  when it is an identified action. Names travel beside identifiers and never
  enter set-aside comparison.
- Every contextual Day entry carries a display `title` beside its routing
  subject, kept in the address; "Opened from" prints it and never the subject.
- Episode Log rows print the served `lever_title`; the Day desk's partial name
  table and the Day chart module's unused one are deleted.
- A Focus record names its behavior by its served title; an unavailable
  original context states its reason in words.
- A Pattern concern in Changes prints its members and action by their served
  names.

## Not in this change

Which Lever an episode carries, and every classifier, attribution, cap, floor,
ranking and staging rule. Identifiers in addresses, data attributes and routing.
The Episode Log's tier word, claimed-moment relationship, tone, band count and
band glossary (#423, which consumes `lever_title`). The Diagnose address and its
`focus` value (#428). The record's retained-context comparison and "First seen"
label (#430). The active Focus arm's lever name table and the ending
assessment's reason wording (a follow-up the coordinator files). Pump writes,
real data reads, vendor fetches.

## Impact

Backend: `ciq_autotune/analyzers/scenario/model_view.py`, `ciq_autotune/guidance.py`,
the findings-projection fixture generator and its committed fixture. Desk: Day,
its entry doors and the address keys; Changes' Pattern concern and record
detail. Contract: the desk behavior ledger's S61 and S62 amendments with the S61
replay. No migration; no durable state changes shape.
