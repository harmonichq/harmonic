# Findings layout exploration — #341

## Decisions

- 2026-09-04: Attended layout investigation, routed to ui-craft revise/divergent wireframes. The user requested wireframes before implementation. inline
- Use three arrangements with identical queue information: evidence first, findings left, compact overview. Selected treatment is independent of ranked position. → issue #341
- Use the committed synthetic findings projection as input. Diagrams are schematic, not replacement chart implementations. inline

- 2026-09-04: Connor selected A (Evidence first): "A looks good." Spotlight above glucose overview; queue remains right. → issue #341

- 2026-09-04: Connor confirmed "Exactly." to removing the docked strip, opening All charts directly fullscreen, returning a picked chart to A, preserving selection/window on dismissal, and keeping the spotlight Expand control. → issue #341

- 2026-09-04: Connor chose "Keep today’s behavior: row click opens details immediately". Keep the shared chart-to-finding drill route and omit a preview-only selection state or Open finding button. → issue #341

## Open questions

- Implementation details remain for the built-app revision; no further arrangement or chart-browser question is open.
- No further product decision is needed for the brief. Exact spacing will be verified in the built-app revision using existing tokens and chart readability floors.

## Spawned tasks

- https://github.com/harmonichq/harmonic/issues/341

Remaining dispositions: none. No execution lock exists.

### Risk contract

- **Must prevent:** secret or patient-data exposure; irreversible loss of authoritative data; silent incorrect success; changing backend-owned ranking, support, eligibility, staging verdicts, or the finding identity behind the visible chart.
- **Must recover:** no new automatic recovery requirement; preserve existing request-generation, stale-evidence and retry handling.
- **Accepted failure:** an unavailable local browser or failed gate stops verification with its failure reported; no claim of a passing build or publish.
- **Unsupported:** live vendor fetch, real patient databases, theme redesign, new analysis or recommendation behavior.
- **Evidence owed:** public queue/chart/drill behavior and focus preservation; matching selected chart and finding; intact clock-window interactions; permanent retired-mode absence checks; synthetic before/after renders and existing merge gates.

Why: this is a reversible layout and navigation-mode revision around unchanged advisory judgments.
Disposition: → implementation brief for #341.

## Implementation-brief review

2026-09-04, ordinary targeted plan review, one independent Terra panel.
One authoring blocker: the draft envelope used ordinal task ranges where the
source checklist used phase-qualified labels. Mechanically corrected the two
references to 1.1–1.5 and 2.1–2.5; no scope changed. Same-reviewer recheck
countersigned all five axes. No injected blockers. The reviewed source is
be8b09bc7de258ae4a8c8afdac7551e6ea8bb127. Execution lock awaits operator approval.
