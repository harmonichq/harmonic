# Plan shares the Diagnose workstation composition — triage and review ledger

Ticket: #344 (ordinary ticket; no parent, no `epic` label). Filed 2026-09-05 from
Connor's read that Plan "is its own thing, kinda ugly" next to Diagnose.

## Grounding (verified live in this triage, 2026-09-05)

- Base: `origin/main` at aeb37c6a (archive of eating-sequence-evidence-plumbing,
  #339). Worktree `/Users/connor/worktrees/harmonic/344`, branch
  `344-plan-diagnose-composition`.
- Codebase Memory reported an active-generation conflict on three `ensure`
  attempts; ordinary discovery was used for the whole triage.
- Plan today: generic `.section` / `.cards` / `.card.full` chrome
  (`frontend/index.html:1700-1860`), pure logic in `frontend/plan.js`, Vue state and
  handlers in `frontend/index.html:5030-5210`. Layers: Verify-revert guidance
  banner; active-profile `<details>` reference table; accepted-change chips (type,
  time, current → value, edited flag, jump-back, remove); the editable four-parameter
  deliverable table (provenance tint per cell, `new break` pill, `current →` hint,
  one-family guard with flash, revert clears the edit); reconcile block (on-pump
  confirm link, mismatch table with Re-key and Accept pump values, pending copy,
  matches-pump copy, nothing-to-deliver copy); Apply history table.
- Workstation hosts: Diagnose `.dw` (`frontend/diagnose-workstation.css`) and
  Verify `.vw` (`frontend/verify-workstation.css`, mirrored value-for-value from
  `.dw`). Anatomy: 42px instrument strip (`.instruments` / `.verify-strip`, 14px
  inset, micro-caps `cap`) over `.panes` (`minmax(0,1fr) | var(--side, 430px)`),
  `.pane > header` with micro-caps `h2` and mono `.meta`, `--ck-*` tokens (pad 12,
  gap 10, radius 8, body 12.5px, micro 10px, data 12px mono). `.main-content >
  div:has(.dw)` sizes the tab wrapper to 100%.
- `frontend/theme.css` themes by ROLE over the closed set `:is(.dw, .vw)` (pane
  body, pane header rail, instrument rail, dock floor) and states "a new surface
  either realises a role above, or it is a recorded gap"; the `.dw`/`.vw` rename
  is deferred by the lock itself. `DESIGN.md:116-119` repeats the rule.
- Pins on Plan markup: `frontend/cockpit-shell.browser.test.mjs` uses
  `.active-profile-ref` as Plan's readiness selector (line 94) and asserts the
  Plan badge count (S8); `frontend/plan-first-match.browser.mjs` (CI gate
  "First-plan reconcile") locates `.card.full` containing an `h2` "Deliverable",
  matches "Deliverable — pump-ready", "On pump", "Confirm & re-baseline",
  "Pending", "likely a keying error", "nothing to program yet", and edits
  `table tbody tr input.plan-value`; `frontend/index.test.js:71` slices
  `index.html` at the `<!-- ==== PLAN ====` banner comment.
- No Plan behavior ledger exists. `mockups/INDEX.md` lists Plan only inside the
  cockpit-shell row. `mockups/sweep/` does not exist.
- Safe start (worktree `CLAUDE.md`): copy `mockups/qa-e2e.synthetic/harmonic.sqlite`
  to scratch, `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port
  8765`. That showcase has `profile_settings` (3 rows, one-segment profile
  `0.6 / 40 / 10.0 / 110`), `plan_draft` 0 rows, `plan_history` 0 rows, so the
  live server evidences only the nothing-staged Plan state. Pending, on-pump,
  mismatch and history states are reachable only through stubbed routes, as
  `plan-first-match.browser.mjs` and the Verify replay opener already do.
- Slicing anchors (reviewer memory, fact of match only): the "split a live
  surface ticket at the live run" rule and the shipped-chart three-serial-chunk
  anchor both agree this is chunked with the browser run as its own boundary.

## Decisions

- 2026-09-05 · Q5 = B: an attended wireframe round precedes the app branch.
  Why: Connor asked to see the pane arrangements before ruling Q1. Wireframes live
  in `openspec/changes/plan-workstation/wireframes/`, headed `WIREFRAME — NO
  FIDELITY CLAIM — NOT LOCKABLE`, and are deleted when the change lands; only
  screenshots and the ruling survive. `inline`
- 2026-09-05 · Q1 = A (Connor): schedule left, case file right. Wireframe renders
  under `openspec/changes/plan-workstation/wireframes/shots/`; the runnable page
  is deleted by the implementation pull request. `→ ADR` (ADR 344 in the change's
  design.md).
- 2026-09-05 · Q2, Q3, Q4, Q6 delegated by Connor with the anchor "don't change
  too much behaviorally, anchor in the current behavior, just change the page
  theming". Calls: Q2 — the collapsible active-profile reference stays exactly as
  shipped, housed in the right pane; the strip additionally names the profile
  identity. Q3 — apply history stays an always-visible block (when non-empty) at
  the bottom of the right pane, not collapsed. Q4 — below 760px the right pane
  stacks under the schedule, CSS only. Q6 — stubbed-route replay is the proof for
  pending, on-pump, mismatch and history; the live showcase proves the composition
  and the nothing-staged state. No shipped behavior is retired. `inline`

## Open questions

(none; frontier empty 2026-09-05)

## Spawned tasks

(none yet)
