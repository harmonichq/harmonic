---
target: "Harmonic #404 Diagnose and follow-up"
total_score: 27
p0_count: 0
p1_count: 4
timestamp: 2026-09-11T19-59-48Z
slug: diagnose-js
---
Method: dual-agent (A: Opus 5 high · B: Astra low)

# #404 design critique before corrections

Target: the shipped v2 Diagnose desk and related Focus, Day and late-conclusion states. The operator requested Opus 5 high and authorized supported fixes. Assessment A read source, then all 15 synthetic screenshots after an initial scratch-path permission denial was resolved. Assessment B independently ran the detector and inspected supplied synthetic captures. Neither assessment used personal data. No live overlay is bundled; no overlay or fresh interactive browser session is claimed. Screenshots do not establish keyboard behavior or measured contrast.

## Design health

| Heuristic | Score / 4 | Main observation |
| --- | --- | --- |
| System status | 2 | Focus reasons and Day reload status are not visible |
| Real-world language | 3 | Two different fields say Conclusion |
| Control and freedom | 3 | Existing navigation and retry paths retained |
| Consistency | 2 | Filter differs from Window and loses v1 styling |
| Error prevention | 3 | Missing marker glucose can be fabricated |
| Recognition | 2 | Unavailable action and hidden reason obscure next step |
| Efficiency | 3 | Canonical destinations and compact controls help |
| Minimalism | 3 | Grouped rows repeat their cohort at the expense of event text |
| Recovery | 3 | Retry exists but stale explanatory copy can survive |
| Help | 3 | Local explanations exist but some are hover-only |
| Total | 27 / 40 | Significant corrections needed |

## Overall impression and anti-patterns

The focused, dense desk follows the existing product language. The main issue is the truth and visibility of state, rather than a generic new visual theme. Focus admission remains served by the backend, the late-conclusion section explains its limits, and the chart and roster reuse existing owners.

The detector returned 17 findings (15 warnings, 2 advisories): 14 font detections, a design-system font and color detection, and a radius advisory. Three detections come from test regex/comment text; thirteen are approved Inter declarations. The remaining 1 px radius is inherited lane geometry. These findings do not justify changing the project's approved font or palette. The independent image assessment also noticed a clipped lower chart tick; it did not establish a new regression.

## Priority fixes

1. **P1: Show the served Focus withholding or read-failure reason.** A title tooltip is insufficient. Keep a compact header control and put the reason visibly beneath it, connected by aria-describedby.
2. **P1: Remove the dead-end Focus unavailable button.** Render status when no route exists; retain actual View Plan, View Focus, View Trial and Retry actions.
3. **P1: Never place a missing reading at an invented 120 mg/dL.** Use the existing marker owner and an honest missing-data treatment; test empty and null trace points.
4. **P1: Preserve v1 Filter and share v2 Window styling.** Restore the unscoped base and use shared values for resting, expanded, active and loading states.
5. **P2: Make Day reload visible and grouped rows readable.** Keep the old frame while visibly loading. Omit a constant per-row cohort already printed in the group heading, while retaining varying tiers in mixed rosters.

All are shipped revisions under ui-craft revise, with focused public tests and revised synthetic captures.

## Walkthrough implications

For a reader trying to start a Focus, the captured unavailable button provides no visible explanation and leads to a repeated denial. For a keyboard or assistive-technology reader, a reason confined to title is not a reliable explanation; failed reads need status semantics as well as ink. For a reader adding a later Trial conclusion, two fields called Conclusion suggest editing the immutable original record. These are evidence-based implications, not claims of a completed keyboard or screen-reader test.

## Minor corrections and objections

Use Later conclusion for the new field; warn ink plus status semantics for failed reads; prioritize read failure over stale admission copy; retune the drawn-window chip to its actual text. Opus's initial claim that Filter and Focus compete in the same header was incorrect: they appear at different depths. Its title-truncation claim was not reproduced. Expanded Filter already has an affordance; resting Filter was absent from the initial captures, so a caret remains optional until measured. No new layout, phone redesign, clinical rule or route expansion follows from those suggestions.

The central design question is already answered by the operator: surface the truthful next action and implement the supported critique. Implementation and revised-state verification are pending; this is a baseline critique, not a final approval.
