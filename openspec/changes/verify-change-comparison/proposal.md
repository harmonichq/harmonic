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
- Show recent relevant meals, nights, or other events beside a clearly identified
  before-change baseline. Separate what has happened so far from what the evidence
  can support concluding. Do not treat readiness as proof that a change worked.
- Curate the primary comparison and supporting outcomes to the change. Keep a small
  secondary view of general care outcomes without turning Verify into a generic dashboard.
- Reuse Diagnose's shipped chart components, event inspection, layout, and interaction
  language wherever the same behavior is required. Reuse backend evidence producers
  where their cohort and time boundaries fit; do not copy their implementation.
- Include behavioral Focuses as well as setting Trials. Behavior adherence and its
  associated outcomes must remain distinguishable.

## Planning boundary

This is one planning epic, with no child issues filed at inception. The operator
closed the previous Verify backlog after it became burdensome and drifted away
from the evolving Diagnose surface. Historical decisions are inputs to reconsider,
not automatically accepted requirements for this effort. Do not revive the old
queue, turn every observation into a ticket, or pre-file an implementation sequence.

The epic remains useful if the operator chooses only a smaller next increment.
There is no implementation lock, settled statistical policy, or approved visual
revision yet. Select and scope one next slice when the operator wants to proceed.

## Out of scope for this planning session

App implementation, new dosing recommendations, changes to analyzer safety gates,
automatic changes to the pump, clinical certification of benefit, and a redesign of
Diagnose. No universal meal count, night count, or calendar duration is adopted.
