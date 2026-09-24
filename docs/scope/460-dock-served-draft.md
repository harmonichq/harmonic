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
