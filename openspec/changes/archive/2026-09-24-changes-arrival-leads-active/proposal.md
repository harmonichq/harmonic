# #446 The watched change leads every plain arrival to Changes

## Status

**Triage source for #446.** An ordinary ticket change in the #442–#457
follow-up release. The desk's frozen behavior ledger
(`mockups/harmonic-v2-desktop.behavior.md`) and its replay
(`frontend/desk-behavior.replay.mjs`) stay the contract. This change adds three
app-only stories beside them (S166–S168) and amends no existing story.

## Why

Changes remembers that the reader pressed Open Plan, and nothing ever clears it.
Every later arrival to Changes then opens the Plan whenever a Plan draft is
staged, saved or pending, even while the server serves an active change. The
server itself refuses to record that draft while a change is watched. #429 fixed
only the watch dock's own arrival. The topbar's Changes, Diagnose's "Return to
Trial" and the landing after a Focus pin still open the Plan in the watched
change's seat. HV2-15 says one active change leads, and S45b and amended S56 say
those two returns land on the watched change.

This was reproduced at node level on the base (b03431d2). After Stage and Open
Plan, a plain arrival while `active_change` is served reads `/api/plan`,
`/api/plan/history` and `/api/pump-settings`, which is the Plan. The same arrival
without the earlier Open Plan reads `/api/verify/trials`, the watched record's
follow-up. With nothing watched, the remembered Open Plan also reopens the Plan
on every later arrival. `docs/scope/446-changes-arrival.repro.mjs` reproduces
all of this.

## What changes

- Open Plan holds for the one visit to Changes in which it was pressed. The
  remembered Plan-open state is cleared in one place, on each arrival. A
  re-render within the visit keeps the Plan open.
- While the server serves an active change, every arrival to Changes that does
  not ask for the Plan or a change record opens the watched Trial or Focus. That
  covers the topbar, Diagnose's return, the Focus-pin landing, a history step and
  the dock. An explicit Plan arrival still opens the Plan. The #429 dock-only
  exception becomes this general rule and is removed.
- With nothing watched, a plain return to Changes shows the staged concern, with
  "Staged", Undo and Open Plan, instead of reopening the Plan. Stage pressed in
  the Plan's own frame keeps the reader on the Plan, with Save draft in hand.
- While a change is watched, a Plan draft stays reachable. When a draft is saved
  or staged, the watched Trial's and Focus's own view offers "Open Plan". It opens
  the Plan with an explicit Plan arrival. The Plan renders as it does today, and
  the server still refuses to record it while the change is watched. The desk
  adds no gate of its own.
- Diagnose opened from a watched Focus names its return "Return to Focus". It
  still lands on the Focus. A watched Trial keeps "Return to Trial".
- Three new desk ledger stories (S166–S168) pin the new behavior. The ledger's
  pinned inventory counts move with them.

## What does not change

- Which change is active, the admission verdict, the one-active-watch rule, and
  every served payload. The server's refusal to record a Plan while a change is
  watched (`occupied_admission`) is unchanged, and no frontend rule restates it.
- The served `draft` and `pending_plan` dispositions still open the Plan. The
  server serves neither while a change is watched.
- The history and change-record routes, and the explicit Plan route that the
  Trial's Revert to Plan uses.
- The Trial's Revert to Plan section and what its own Open Plan does.
- The Plan's own frames, phases, capacity and pump-entry schedule.

## Sanction

`Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R446`.
It covers this shipped-surface revision and its ledger amendment (S166–S168).

## Capabilities

- `surfaces` — MODIFIED: The watch dock opens Changes on the watched Trial or
  Focus (its sentence keeping every other arrival's old precedence is replaced).
  ADDED: the served active change leads every plain arrival to Changes; Open Plan
  holds for the visit in which it was pressed; a Plan draft stays reachable while
  a change is watched; Diagnose's return names the watched change.
