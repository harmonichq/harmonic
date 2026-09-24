# #431 one served Plan verdict

## Status

**Triage source for #431.** An ordinary ticket change, grounded on 2026-09-23
against `origin/main` a4d374a7 and synthetic QA case stores only. It revises the
shipped desk under its frozen behavior ledger
(`mockups/harmonic-v2-desktop.behavior.md`, replay
`frontend/desk-behavior.replay.mjs`) with the operator's standing sanction for
this release (Q2, Connor Griffin, 2026-09-23).

## Why

One recorded Plan read three ways at once. The server held it as awaiting
confirmation, so Diagnose offered no Focus and refused a new decision. Changes
said it was on the pump. The watch panel said nothing was being watched.

The grounding and an in-process reproduction
(`docs/scope/431-plan-state-repro.py`, `docs/scope/431-plan-state-repro.mjs`)
found why:

- The server confirms a Plan only through a detected setting change that is
  captured at the same instant as a pump read. An edit made to the active pump
  profile is detected from the dose stream instead, so no read ever shares its
  time, and a Plan no Trial matches never leaves pending. Nothing retries or
  times it out.
- Changes reads the server's pending state and then decides "On pump" itself
  from the latest pump read. The time it shows is that read's time, so it moves
  with every fetch.
- After a confirmed Plan, a newer draft is compared as if it were committed: a
  draft that differs from the pump reads as a keying error under an "On pump"
  head, and the frame offers neither Save draft nor Record decision.
- The Decision block pairs the current draft's saved time with the last
  record's decision time, and reads the oldest served record as the newest.
- The watch panel knows Trial, Focus, a staged draft and idle. Recording a
  decision clears the draft, so a Plan waiting for the pump reads as idle.
- The pending-Plan note reaches the case-file header only when the selected case
  links to a Pattern, so it appears in one window and vanishes in another.

## What changes

- The server confirms the pending Plan when the latest pump read after the
  decision holds the Plan's schedule, stamping the first read of that matching
  run. A Plan recorded before schedules were captured is compared as its
  recorded values over that read; one whose items cannot be compared (no start
  minute or no value, or items today's item rules refuse: a row mixing tuning
  families, or a carb-ratio block row ending at minute 0) is never confirmed by
  a read and leaves by Withdraw. The
  Trial-matched confirmation still wins in the same pass. (ADR 431; operator
  decision D5.)
- Only the newest recorded Plan can be pending; older unconfirmed history is
  superseded and blocks nothing.
- Every recorded Plan the server serves carries one verdict — pending,
  mismatch, confirmed, withdrawn or superseded, when it was confirmed, and
  whether the latest read still holds it — on both the Plan history and the
  guidance read.
- Changes names the phase, status and Decision block from that verdict. "On
  pump since" names the confirming read and stays put. The browser's comparison
  only draws the mismatch rows.
- Changes keeps the recorded Plan apart from a newer draft: a draft saved while
  a Plan is pending is a separate next-change line; with no Plan pending, a
  draft is the frame's subject, reads Draft saved, and can be recorded. A
  confirmed Plan keeps its "View change record" door.
- The watch panel gains a Plan-awaiting-pump state, routed with "Open Changes ›"
  to Changes' Plan (never the watched-change address), and the staged-draft
  state routes with the same words.
- The case-file header carries no pending-Plan note in any window or case; the
  watch panel carries it.

## Out of scope

- The server's Plan-to-Trial matching rule (ADR 386), which is unchanged; the
  pump-read confirmation creates no Plan–Trial relationship.
- Any classifier, cap, floor, staging predicate or admission rule other than
  the pending Plan's way out.
- The watch panel's Trial and Focus copy and their route (#429), and served
  names for the unavailable reason (#426).
- Pump writes, real-data reads, vendor fetches, any port-bound run inside a
  worker.

## Impact

- Backend: `ciq_autotune/watched_change.py`, `ciq_autotune/store.py`,
  `ciq_autotune/api.py`, a new backend test module, `CONTEXT.md`.
- Frontend: `frontend/plan-view.js`, `frontend/watched-change-dock.js`,
  `frontend/diagnose-workstation.js`, `frontend/diagnose.js`,
  `frontend/focus-entry.js`, `frontend/guidance.js` and their unit tests.
- Contract: three new desk replay stories (S145–S147), amended S42 and S105
  replay bodies, a rewritten desk browser test, the replay pump producer's new
  in-place capture, the ledger amendment and its inventory counts.
- Specs: ADDED requirements in `plan` and `surfaces`; nothing modified.
