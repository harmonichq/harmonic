# Verify: how is this change going?

Epic: https://github.com/harmonichq/harmonic/issues/336

## Why

Diagnose now gives the user a useful way to identify a setting or behavior to change.
Verify should let them return during the following weeks and understand how that
specific change is going. The shipped screen mostly compares aggregate glucose
curves and counts fourteen days; it cannot yet show the latest few relevant events
against the before-change experience with the same richness as Diagnose.

## Destination

- Keep the selected change, its start, and its affected part of the day visible.
  A lunch carb-ratio change follows the lunch block and its eating evidence.
- Lead with groups of relevant meals, nights, or other events beside a clearly identified
  before-change baseline. Separate what has happened so far from what the evidence
  can support concluding. Do not treat readiness as proof that a change worked.
- Curate the primary comparison and supporting outcomes to the change. Keep a small
  secondary view of general care outcomes without turning Verify into a generic dashboard.
- Reuse Diagnose's shipped chart components, event inspection, layout, and interaction
  language wherever the same behavior is required. Reuse backend evidence producers
  where their cohort and time boundaries fit; do not copy their implementation.
  Component reuse is mandatory across this epic: change the supplied data and
  exposed timeframe rather than rebuilding chart rendering or interactions.
  A missing component or required extension needs a separate discussion with Connor.
- Include behavioral Focuses as well as setting Trials. Behavior adherence and its
  associated outcomes must remain distinguishable.

## Planning boundary

The delivery target is the complete Verify feature described above, including
setting Trials and behavioral Focuses. The lunch carb-ratio comparison is a
worked example of the feature, not a separately shippable product increment.
Do not turn the screen, each chart, and each data adapter into separate tickets.

Connor authorized organized child tickets on 2026-09-04 and corrected the proposed
single-lunch first release: “I'm trying to ship a feature, not one component of
the feature.” Start with one feature-wide scoping/design spike. The intended
follow-on is one integrated build through the normal ticket workflow. This is a
planning target, not a claim that build admission or session sizing has passed.
If grounding establishes a real dependency or independently shippable capability
that requires a split, record the reason and settle it with Connor before filing.

Keep one child in flight. File the build only after its blocking decisions and
visual lock are settled. Keep additional concerns in the parent design instead
of pre-filing a backlog. Historical tickets remain context, not commitments to
revive. The planning branch carries the authority; child execution follows the
normal ticket lifecycle and human PR merges.

## Out of scope for this planning session

App implementation, new dosing recommendations, changes to analyzer safety gates,
automatic changes to the pump, clinical certification of benefit, and a redesign of
Diagnose. No universal meal count, night count, or calendar duration is adopted.
