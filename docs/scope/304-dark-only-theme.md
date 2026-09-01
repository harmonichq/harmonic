# Dark-only graphite theme — triage and review ledger

Ticket: #304 (parent composition: #305, order step 3)

## Decisions

- Light retires entirely: palette, footer Theme menu, `theme` localStorage key,
  boot-time class gate; every `html.dark` rule collapses into the base. Why:
  operator decision 2026-09-01 recorded on the ticket. inline
- Direction is the graphite prototype (branch `theme-cohesion-prototype`,
  70726e5): one warm-neutral structure family, green confined to data marks,
  orange as action and signal. Adopt the direction, not the bytes. Why: ticket
  body. inline
- Surface lifecycle is `revise` (UI Craft router: shipped, runnable, declared
  no-fetch entrypoint, synthetic database). Contracts:
  `mockups/cockpit-shell.behavior.md` + `frontend/cockpit-shell.browser.test.mjs`,
  `mockups/finding-evidence-routing.behavior.md` +
  `frontend/diagnose-workstation-behavior.replay.mjs`. inline
- Verified live (PR #303, run 33523566253): the prototype bytes fail the
  evidence-canvas drift gate, canvas-composition test 13, workstation tests
  20/23/24, and replay S23 by one pixel. Gates pin ADR 255 literals and Light's
  fixed-point cascade; both must be re-settled, not deleted. inline
- Defaults assumed (no question asked): historical commit-sha capture
  directories under `docs/screenshots/` stay as history; only gated scenarios
  re-capture. `DESIGN.md` front matter and palette prose re-point to the shipped
  dark tokens. The harness theme select retires. Active changes
  `light-ground-bone` (ADR 37) and `preserve-diagnose-theme-context` (ADR 230)
  are recorded as superseded in this change's design record, not archived here.

- Q1 → A: the finished palette (and the orange shared by action controls and
  high-glucose marks) is settled in an attended UI Craft revise round on the
  running app and posted as this ticket's second lock; lock 1 is the
  mechanical light retirement with Dark computed values unchanged. Why: the
  prototype is far from finished design and a headless worker cannot make
  that call. → ADR 304 (pinned change design.md)
- Q2 → A: cockpit S3/S10 and Diagnose S117 retire under "Connor Griffin, issue
  #304, 2026-09-01: light theme retired by operator decision". Why: a no-op
  Theme control is the papering-over the ticket forbids. → ADR 304
- Shape: three serial chunks (app + extracts; browser contracts + ledgers;
  identity evidence + record). Traits fired: multiple deliverable artifacts,
  lockstep copies, live run, lifecycle-gated surface revision. A nearby
  reviewer-memory anchor agreed. inline
- Review depth Full (every shipped surface; gates re-based). Profile none (no
  `Harden:` line). inline

## Open questions

None for lock 1. Lock 2 (palette settlement) opens after the attended revise
round.

## Spawned tasks

None.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
| 1 | — | Initial chunked draft | Reviewer found the evidence-chart module's dark flag, the ledger-parity test spanning chunks 2/3, and fidelity-report.json misowned (all `authoring`); probe blind to harness/screenshot files; a hand-typed match count | OBJECT (3 block, 2 note) |
| 2 | 3 | Task 1.8, ledger retirement moved into chunk 2, counts removed, probe widened | Reviewer read a stale draft (patch chain aborted on a failed count check), re-surfacing two `authoring` blockers; new `authoring` blocker: `frontend/index.test.js` pins html.dark selectors; probe missed optional chaining | OBJECT (3 block, 2 note) |
| 3 | 3 | Ledgers and fidelity report into chunk 2, index.test.js into chunk 1, probe fixed | New `authoring` blocker: ledger-parity mutation fixtures hardcode pre-retirement literals | OBJECT (1 block) |
| 4 | 1 | Parity test into chunk 2 with task 2.5 extension | Note: contracts probe blind to opener defaults and storage writes | COUNTERSIGN (1 note) |
| 5 | 0 | Probe pattern extended (mechanical) | — | COUNTERSIGN |

No `injected` blockers: every blocker was present since the draft. The
recurring class was a fast-gate test pinning stylesheet or ledger bytes that
no chunk owned.