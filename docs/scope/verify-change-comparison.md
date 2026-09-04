# Verify comparison scope

## Decisions

- Route the user's Verify planning request to epic. Its comparison semantics,
  evidence progress, lifecycle, and UI choices are interdependent. → issue
- Keep one epic and no child backlog at inception. The operator wants the queue
  small and explicitly rejected automatically reviving older Verify decisions. → issue
- Capture desired behavior and open questions without declaring a build ready.
  No evidence count, expiration policy, or visual design is locked here. inline

- On 2026-09-04, Connor authorized organized children and confirmed the whole Verify
  feature as the delivery boundary. The parent design records the ADR; #340 owns
  remaining feature-wide scoping. The intended follow-on is one integrated build,
  subject to actual admission and session sizing. inline

## Open questions

The active change owns the named questions:
`openspec/changes/verify-change-comparison/design.md` (Q1–Q5).

## Spawned tasks

[Epic #336](https://github.com/harmonichq/harmonic/issues/336).

[#340 — Scope and lock the complete Verify redesign](https://github.com/harmonichq/harmonic/issues/340).

## Remaining dispositions

None. Both issue dispositions are discharged by #336. No ADR disposition was declared.
