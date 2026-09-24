# #429 The watch dock names Changes and opens the watched record

## Status

**Triage source for #429.** An ordinary ticket change. The desk's frozen
behavior ledger (`mockups/harmonic-v2-desktop.behavior.md`) and its replay
(`frontend/desk-behavior.replay.mjs`) stay the contract; this change adds two
app-only stories beside them and amends no existing story.

## Why

The watch dock at the foot of the Diagnose inspector still names Verify, the v1
surface #416 retired. A watched Trial offers "Open Verify ›", and a pinned Focus
reads "adherence and outcome are read on Verify" with the same link. The click
already lands on Changes, which owns Trial and Focus progress under ADR 397, but
it does so under a label for a place the reader cannot find anywhere in the app.

Changes also cannot promise to show the watched record. Changes keeps a
client-local flag once the reader presses Open Plan, and never clears it. A later
arrival then opens the Plan, not the watched Trial or Focus. That happens
whenever a staged or saved Plan draft exists, even while the server says a change
is being watched. This was reproduced at node level on the base (a4d374a7).

## What changes

- The Trial and Focus dock states name Changes: the link reads "Open Changes ›"
  and its route token is `changes`. The Focus detail line reads
  "Pinned ‹MM-DD› · adherence and outcome are read in Changes".
- The dock's link opens Changes with an arrival that names the watch
  (`/changes?subject=watch`). While the server serves an active change, that
  arrival opens the watched Trial or Focus, even when the reader opened a Plan
  earlier in the same page session. When no change is being watched any more,
  the arrival behaves exactly like any other arrival to Changes.
- The dock's code comments and tests name Changes and describe only what Changes
  actually renders.
- Two new desk ledger stories pin the dock's words and where its link lands, one
  for a Trial and one for a Focus; the ledger's pinned inventory counts move with
  them.

## What does not change

- The dock's Plan and idle states, its kind labels, the Trial's title and
  maturity line, and its day clamp. #431 owns the Plan state.
- Trial maturity, the Focus lifecycle, the one-active-watch rule, and every
  served payload.
- Every other arrival to Changes: the topbar destination, Diagnose's
  "Return to Trial", and the landing after a Focus pin. They share the same
  open-Plan preemption. They fall outside this ticket's checklist, so a
  separate issue covers them.
- The Verify residue outside the dock, in CONTEXT.md, the surfaces
  specification and a backend test comment. It is retire-v1 residue for a
  separate issue.

## Sanction

The copy change falls within ADR 397's sanctioned destination-copy amendments
(D3). The operator's standing UI sanction for this release covers the ledger
amendment. Connor Griffin, 2026-09-23, answering "Can your reply here count as
sign-off for the UI copy and tone changes?": "Q1 A, Q2 A, defaults all fine, go".

## Capabilities

- `surfaces` — ADDED: the watch dock names Changes for a watched Trial or Focus;
  the watch dock opens Changes on the watched Trial or Focus.
