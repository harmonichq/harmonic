# Harmonic v2 planning sequence

This is #348's attended investigation checklist, not an application build order.
The implementation sequence becomes executable only through subsequent reviewed
ticket locks after Connor approves the selected product direction.

## 1. Establish the current facts

- [x] 1.1 Verify the selected checkout's Codebase Memory is alive and usable.
- [x] 1.2 Read #348 and reconcile the live scope of #347, #336, and #340 without changing them.
- [x] 1.3 Ground the initial engine/API/storage map and record the agreed parallel-v2 architecture.
- [x] 1.4 Establish the operator's lead unmet need: one concrete priority with supporting glucose episodes.
- [x] 1.5 Settle unsupported-pattern guidance, the leading-priority objective, and set-aside behavior.
- [x] 1.6 Select the full-loop first usable release for both settings and habits (Q10), informed by the complete journey proposal.

## 2. Design the complete experience

- [x] 2.1 Complete the product brief and setting, habit, direct-Day, routine-return, and history journeys.
- [ ] 2.2 Test Overview / Explore / Changes / Day and settings access against those journeys.
- [ ] 2.3 Settle durable review/history, comparison-design reconciliation, and required backward-compatible contracts.
- [ ] 2.4 Settle the risk contract and the first useful v2 increment's single-file component/evidence boundaries, reusing authoritative domain and chart behavior without re-deriving engine policy or requiring wholesale v1 decomposition.
- [ ] 2.5 Obtain the required synthetic walkthroughs and rendered visual/interaction evidence through the applicable UI Craft lifecycle.

## 3. Review and hand off

- [x] 3.1 Record complete useful increments, v1/v2 coexistence checks, built-asset delivery, cutover, and retirement criteria.
- [x] 3.2 Strictly validate this planning-only change and run its ADR and publication guards. Author capability deltas in subsequent execution locks, once the design is approved.
- [x] 3.3 Obtain independent review of the planning proposal and resolve verified blocking findings. This countersign covers the stated planning scope, not visual approval or implementation.
- [ ] 3.4 Obtain Connor's approval of the selected direction; record the exact approved artifacts.
- [x] 3.5 Commit the reviewed planning result and post attributed findings on #348, clearly separating agreed design from pending implementation proof.

Connor subsequently requested a draft planning/prototype PR at the end of the
five-hour session budget. Commit and push the current checkpoint, document the
remaining work, and leave the PR open. No production implementation,
related-ticket mutation, new component backlog, merge, or execution admission
belongs to this investigation.


## Saved prototype checkpoint

Fable authored the workstation and setting journey. The generated Focus and
preemption evidence is ready, but its surface was not authored before Fable's
provider limit. Complete habit, direct-Day and utility walkthroughs, the final
language/polish pass, and Connor's visual approval remain open. The selected
concept's REVIEW.md and AUDIT.md distinguish observed checks from these gaps.

Published checkpoint: [draft PR #379](https://github.com/harmonichq/harmonic/pull/379), with [attributed findings on #348](https://github.com/harmonichq/harmonic/issues/348#issuecomment-5559540674). The publication completes the requested checkpoint; the open design and approval items above remain open.

## Resumed design work and integration dependencies

On 2026-09-06 Connor explicitly requested continuing from the published
checkpoint, retaining Fable 5.1 at high effort as design lead. The earlier
five-hour checkpoint is complete; the resumed work has no newly specified
deadline. His approval covers the workstation direction, with complete setting
and habit follow-up, navigation and history still to review. PR #379 remains
open and draft, and does not need to merge for this work to continue.

The [Diagnose QA sweep #350](https://github.com/harmonichq/harmonic/issues/350)
and [frontend foundation PR #380](https://github.com/harmonichq/harmonic/pull/380)
have now landed. The sweep owns the shared chart, staging, selection, keyboard
and responsive bug fixes; this investigation does not duplicate them. Before
final integration, visual lock or a build-ready handoff, incorporate both merged
changes, regenerate extracted app material and replay the affected journeys
against the resulting baseline.


## Subsequent mobile design round

On 2026-09-06 Connor requested the same design process for a mobile-first,
app-feeling version after the current designs are complete: a cohesive
full-screen flow with the polish of an application. This adds a separate
design round after the complete desktop journeys and their review. The existing
390-pixel usability checks do not fulfill that round.

- [ ] M1. Complete the current desktop prototype and its full journey/craft review before starting the dedicated mobile design work.
- [ ] M2. Continue with Fable 5.1 at high effort as design lead, using UI Craft, the original brief, DESIGN.md and approved CONTEXT.md language. Explore and review coherent mobile composition and navigation as their own design.
- [ ] M3. Prototype the complete setting and habit journeys, set aside and return, comparisons, individual episodes, Day, conclusions/history and retained utilities as full-screen app flows. Define touch interaction, transitions and context retention together.
- [ ] M4. Ground the mobile design in the same source evidence and reusable clinical/chart boundaries. Preserve cohort membership, dates, uncertainty and original/ending context.
- [ ] M5. Repeat rendered walkthroughs, independent review and attended refinement for the mobile experience. Record exact artifacts and obtain the applicable visual approval; do not infer it from the desktop direction or narrow-screen audit.

Both design rounds remain within #348's planning/prototype scope. PR #379 stays
open and draft, with no merge. Final integration and build-ready claims retain
the #350 and #380 dependency gates above.


Dependency update, September 6: [the QA sweep PR #381](https://github.com/harmonichq/harmonic/pull/381)
merged at 20:52 UTC, followed by [its archive PR #382](https://github.com/harmonichq/harmonic/pull/382)
at 21:47 UTC. PR #380 merged at 23:26:54 UTC as
`002e633b17673a25fec1b08c281472f580d16cd1`. Prototype integration,
regeneration and affected-journey replay remain pending against that baseline.
The build foundation is available; the eventual v2 build owns its new shell's
component boundaries and extraction of the shared pieces it uses. It does not
require a separate wholesale decomposition of the retiring v1 shell.
