# Design — evidence-first Diagnose

## Status and authority

Connor selected arrangement A and direct full-screen All charts, and retained
immediate row-to-detail navigation. This brief was executed under the posted
#341 lock and Connor’s subsequent
placement and useful-preview rulings. Both implementation phases are integrated
on the ticket branch; the active change remains available for human PR review.

The surfaces delta is the sole normative product contract. `tasks.md` assigns
execution; `behavior-map.md` identifies current owners and contract consumers;
`verification.md` assigns checks and rendered evidence. `facts.md` records the
actual grounding commands and outputs. The retained wireframe screenshots are
decision context, not a fidelity oracle.
The disposable `wireframes.html` has been removed.

## ADR 341 — Evidence first, findings on the right

On 2026-09-04 Connor chose A: "A looks good." The selected arrangement moves
the spotlight ahead of the glucose overview and retains the right-hand
findings/details pane. The current range stays by the window presets; Adjust
window provides a short path back to the lower overview. The wireframe settles
composition, not new chart styles or clinical copy.

After reviewing the first render, Connor authorized keeping the global window
selector at the top while grouping the overview-specific header/readout with
the overview chart and basal lane below the spotlight: "your call just make it
feel cohesive and professional and makesure it flows with the other states that
the user can enter when using the app so diagnose doesn't move a control that
strands a different interfaace". In All charts and single-chart fullscreen,
that same header row follows the active chart surface and remains above its
content, so neither return path strands the Close control.

## ADR 341 — All charts opens fullscreen without a docked strip

On 2026-09-04 Connor confirmed "Exactly." to:
"Charts opens the full-screen All charts browser directly. Choose a chart to
return to A with that finding selected. Close or Escape returns without changing
the selection or time window. The spotlight keeps Expand for viewing just its
selected chart fullscreen."

This sanctions retiring the docked strip. The premise is that queue minis now
supply quick previews, while All charts retains the broader catalog including
Watching reads. The browser and single-chart expansion remain distinct.
The permanent behavior-ledger retirement entries must cite this ruling and
premise when the implementation changes the app. The unchanged base retains
its current frozen ledger until then.

## ADR 341 — Queue and chart picks keep immediate detail navigation

On 2026-09-04 Connor selected "Keep today’s behavior: row click opens details
immediately" when asked whether to follow the wireframe's preview-only row
selection and separate Open finding control. That choice supersedes that part
of the original wireframe. It does not reopen the chosen layout or chart browser.

Reuse the existing shared chart-to-finding route. A picked chart closes All
charts and opens its matching details beside the spotlight; a dismiss without a
pick preserves context. Returning from details follows the existing root-stage
fallback. There is no new persisted or preview-only selection state.

## Implementation shape

Two serial phases share one ticket branch and one PR. Phase 1 owns the surface
implementation, its public state/queue contracts, tests and ledger amendments.
Phase 2 owns live app verification, rendered evidence, and corrections revealed
by that evidence; it inherits the settled product contract, not permission to
invent a replacement interaction model.

The slicing traits are live operation with corrective work and lifecycle-gated
surface revision. A nearby reviewer-memory anchor agrees with separating the
live run from implementation. No backend/projection/fixture-policy boundary is
changed, so further slicing would duplicate grounding without isolating another
capability. The existing module remains the single owner of chart identity,
drill routing, async generation and viewport state; no new abstraction is needed.

Review depth is targeted: the changed behavior is followed end to end and the
repo's governing rules are checked. This revision changes neither authentication,
authorization, secrets, destructive writes, shared organizational behavior nor
clinical calculation. The existing advisory output and staging contracts remain
regression obligations. Profile is none; the repository declares no Harden line.

## Data and baseline

Use the current AGENTS.md safe copy-then-serve protocol. The baseline source and
its synthetic generator are recorded in facts.md. Earlier baseline evidence
at `evidence/base-replay.txt` passed the complete existing replay. The later
main-branch archive changed specifications only; facts.md checks that production
source is identical to the tested base. Re-run the base replay immediately before
implementation comparison, as required by ui-craft.

The wireframe reads the existing generated findings projection and shows
schematic plots. The app replay and QA showcase are separately named sources;
never label them as the same bytes. No private screenshots are copied, committed
or published. Existing source-coupled generated outputs are refreshed only
through their current generators.

## Scope boundary

No API or database change, analyzer work, new clinical ranking, automatic staging,
new theme, mobile information-architecture redesign, generic modal framework,
new fixture generator, CI redesign or unrelated historical-mock redesign.
The existing responsive policy adapts the chosen arrangement; exact spacing
uses shipped tokens and chart readability floors, verified in the live pass.

### Risk contract

- **Must prevent:** secret or patient-data exposure; irreversible loss of authoritative data; silent incorrect success; changing backend-owned ranking, support, eligibility, staging verdicts, or the finding identity behind the visible chart.
- **Must recover:** no new automatic recovery requirement; preserve existing request-generation, stale-evidence and retry handling.
- **Accepted failure:** an unavailable local browser or failed gate stops verification with its failure reported; no claim of a passing build or publish.
- **Unsupported:** live vendor fetch, real patient databases, theme redesign, new analysis or recommendation behavior.
- **Evidence owed:** public queue/chart/drill behavior and focus preservation; matching selected chart and finding; intact clock-window interactions; permanent retired-mode absence checks; synthetic before/after renders and existing merge gates.

Why: this is a reversible layout and navigation-mode revision around unchanged advisory judgments.
Disposition: copied into this authoritative implementation brief; scope retains the session record.

## ADR 341 — Useful evidence previews stay in the queue

During live judging Connor explicitly retained the queue charts: “Charts stay in
the queue... They just shoundn't be unuseful garbarge”, then confirmed the
purpose-built preview direction. Each chart-backed row keeps readable finding
text and supplied evidence counts above a dedicated full-width preview. All
ranked rows use the same geometry. Available Watching charts retain previews
when expanded.

The compact chart keeps the evidence appropriate to its family: departures
from programmed basal, correction steps, meal traces, or cohort response and
spread. Served gaps remain gaps and sparse observations remain visible. The
preview changes presentation only; selecting the row still opens the detailed
finding and full-size chart, and the backend still owns support, rank, direction
and staging. This ruling supersedes the earlier requirement for identical
mini/catalog rendering and the narrow-layout omission of queue previews. Their
replay replacements retain evidence-identity and readability obligations.

Implementation and verification evidence is indexed in
[evidence/phase-2/MANIFEST.md](evidence/phase-2/MANIFEST.md). Coordinator
integration checks are recorded in [evidence/merged-verification](evidence/merged-verification).
