# Watch dock reads the served Plan draft — triage and review ledger

Ticket: #460. Change: `openspec/changes/qa-round-2` (ADR 460; tasks 1–10;
surfaces requirements 1 and 2). Triage ran unattended (AFK run, 2026-09-24).

## Reproduction

`node docs/scope/460-repro.mjs`, on main at e4862000:

```text
boot: isStaged=false
refresh: isStaged=true; callbacks carry planDraft=false
served draft items: 1
dock with served draft, no marks: idle
```

A cold seat whose `/api/plan` answer lands after the payload asks the staging
verdict once, at boot, and gets `false`. The later refresh would answer `true`,
but the real workstation only repaints there. The destination hands the view no
served draft, and the dock given the served one-item draft reads idle.

## Decisions

- The dock's staged state reads the served draft as a fallback to the surface's
  own marks; the marks re-seed on every refresh except mid-save. ADR 460.
  Decided autonomously during the AFK run.
- Surface lifecycle `revise` (UI Craft router: shipped, runnable, complete
  declaration, manufactured data). Contract: `mockups/harmonic-v2-desktop.behavior.md`
  replayed by `frontend/desk-behavior.replay.mjs`. The behavior sweep is
  deferred to start (sandbox): Chromium dies at launch in the triage sandbox.
- Flat order although the slicing rubric's live-run and lifecycle-gated traits
  fire: the coordinator's slice plan fixes one lock per ticket and one start
  session, and it runs every browser leg itself.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
| 1 | — | Initial flat draft pinned 961de781 | Blocker (`authoring`): Undo on the only staged change left the dock reading "Plan · staged" over the pre-press served draft, because nothing repainted after the save settled. Notes (`authoring`): task 4's re-ask clause was unobservable through a fake view, and the in-flight rule had no test; ACCEPTANCE.md and AGENTS.md state the story count outside the allowlist. Fixed: the post-save re-seed and repaint moved into task 6, the dock skips the draft fallback while a save is in flight (ADR 460 points 2 and 4), task 7 gained an Undo guard and an in-flight test, task 4 narrowed to the served-draft callback, and task 9 and the allowlist took both documents. | BLOCKED (1 block, 2 note) |
