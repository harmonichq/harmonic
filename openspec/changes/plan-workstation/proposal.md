# Plan shares the Diagnose workstation composition (#344)

## Why

Plan is the one workflow step that still renders as a stack of generic cards
while Diagnose and Verify sit on the workstation composition: a 42px
instrument strip over a docked two-pane sheet, micro-caps pane headers, mono
tabular data, and the theme's role rules. Connor's read on 2026-09-05: Plan
"is its own thing next to Diagnose, kinda ugly". `frontend/theme.css` already
says what a new surface owes: it realises one of the five named roles or it is
a recorded gap, never a silent third material. Plan is that gap today.

The revision is a re-theming, not a re-design. Every shipped Plan behavior
stays exactly as it is: the collapsible active-profile reference, the
accepted-change chips with jump-back and remove, the editable four-parameter
deliverable with provenance, the new-break pill, the one-family guard and the
revert-clears-edit rule, the reconcile states (pending, on pump with confirm,
mismatch with re-key and accept), draft persistence, apply history, and the
Verify-revert guidance. Connor's anchor for every delegated call: "don't change
too much behaviorally, anchor in the current behavior, just change the page
theming".

## What changes

- Plan becomes the third workstation host, `.pw`, mirrored value-for-value
  from Verify's `.vw` the way `.vw` was mirrored from `.dw`, and joins the
  theme's role set (`:is(.dw, .vw, .pw)`) for pane body, pane header rail and
  instrument rail. The `.dw`/`.vw` rename the theme lock deferred stays
  deferred.
- The arrangement Connor ruled from wireframes (Q1 = A): the schedule to key in
  fills the left pane; the right 430px pane is the case file, holding the
  accepted changes, the reconcile verdict and its actions, the collapsible
  active-profile reference, and apply history. The strip names the active
  profile (name or IDP, DIA, max bolus, carb entry, other-profiles pill) and
  carries the reconcile summary as its note. The Verify-revert guidance banner
  heads the right pane.
- Below 760px the right pane stacks under the schedule, and the schedule
  table gets the horizontal scrollport it has always lacked at phone width.
- Plan gets what Diagnose and Verify already have: a frozen behavior ledger
  (`mockups/plan.behavior.md`, sixteen stories, swept against base `aeb37c6a`
  before any code moved), an app-only replay
  (`frontend/plan-behavior.replay.mjs`) wired into the browser-gates matrix,
  and a fast-gate parity guard between the two.

## What does not change

- No Plan behavior is retired, moved to another surface, or gated differently.
  The one-family guard, the staging predicate the backend owns, the reconcile
  state machine, draft persistence and apply all keep their code paths.
- No analyzer, projection, API or safety code.
- The KB article facsimile (`.plan-tbl`) and `docs/kb/the-plan-tab.md`.

## Evidence

Base renders at 1440×900, 1024×768 and 390×844 are under `evidence/base/`;
the revision owes the paired set plus a live render of the QA showcase's
nothing-staged state from the declared no-fetch server. Wireframe renders
that settled Q1 are under `wireframes/shots/`; the runnable wireframe is
deleted by the implementation pull request.
