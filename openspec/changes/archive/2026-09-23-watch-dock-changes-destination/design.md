# Design — #429

## ADR 429 — The watch dock opens Changes on the watched Trial or Focus

### Context

The dock is the Diagnose inspector's floor. It shows exactly one of four states:
a watched Trial, a watched Focus, a staged Plan, or nothing. The server decides
which change is watched, so the dock chooses nothing itself. Both the dock's
`watched` object and Changes' follow-up read the same admission verdict:
`active_watched_change` is a thin adapter over `follow_up_admission`.

On the base (a4d374a7):

- The Trial and Focus states return `{ label: 'Open Verify', to: 'verify' }`,
  and the Focus detail says adherence and outcome "are read on Verify".
- The dock is the only caller of Diagnose's `go` callback. `go` sends every
  token except `day`, `settings` and `plan` to Changes with an empty context.
  The `verify` token therefore lands on Changes by fall-through.
- Changes' `mount` checks `planOpen && planUnderway()` before it reads the
  served disposition. `planOpen` is module state that pressing Open Plan sets
  and nothing clears. `planUnderway()` is true for any staged draft or saved
  draft with items. Saving a draft is not refused while a watch is active; only
  applying one is. A node-level reproduction staged a concern, pressed Open Plan,
  then served `active_change`. A plain arrival then read `/api/plan`,
  `/api/plan/history` and `/api/pump-settings`, which is the Plan. The same
  arrival without the earlier Open Plan read `/api/verify/trials`, the watched
  record's follow-up.
- Changes' follow-up renders the maturity figure as "‹elapsed› of ‹required›
  days" while maturing and "‹elapsed› days · ‹required› required" once met. Only
  its progress bar clamps to the requirement. The retired Verify surface printed
  "day 14 of 14", and that is what the dock's comment claims to mirror.

### Decision

1. **Words.** The Trial and Focus link reads "Open Changes ›". The Focus detail
   reads "Pinned ‹MM-DD› · adherence and outcome are read in Changes". "In
   Changes" is how the ledger already says it (S58, S77). "Adherence" and
   "outcome" are CONTEXT.md's two Focus dimensions. This change edits no kind
   label.
2. **Route token.** Both states route with the token `changes`, and Diagnose's
   `go` turns that token into a Changes arrival with subject `watch`. The token
   `plan` keeps its arrival with subject `plan`. In the address it reads
   `/changes?subject=watch`. The token names the domain's own noun for the
   active watched change (CONTEXT.md, "Watching changes"), the way `plan` and
   `history` already name Changes' other seats. No Changes reader treats
   `watch` as a concern subject: Focus entry reads only `pattern:` subjects.
3. **Precedence.** Changes skips its client-local open-Plan preemption only for
   the watch arrival, and only while the served disposition is
   `active_change`. Every other rule keeps its place:
   - the history and record routes;
   - the explicit `plan` route, which the follow-up's own stage-prior action
     uses while a Trial is active;
   - the served draft and pending-Plan dispositions (the server serves neither
     while a watch is active).

   If the watch has ended by the time the arrival lands, Changes renders exactly
   what any other arrival would. HV2-15 ("One active change leads") is the rule
   this restores for the dock's arrival.
4. **Comments tell the truth about Changes.** The dock's comments and its clamp
   test name Changes and describe only what Changes renders: its Trial progress
   bar clamps to the requirement. They claim no matching "N of N" text, because
   Changes prints none for a completed Trial.

### Alternatives considered

- **Rely on Changes' default landing.** Rejected. It is right whenever the
  server serves `active_change`, but the reproduction shows the open-Plan flag
  taking the seat. The dock would then promise the watched record and deliver a
  Plan.
- **Put the active change ahead of the open-Plan flag for every arrival.**
  Deferred to a separate issue. It would also change the topbar, "Return to
  Trial" and the Focus-pin landing, and it would decide whether a draft stays
  reachable in Changes while a watch runs. D3 does not cover that decision.
- **Open the change record** (`subject=history&occurrence=record:‹kind›:‹id›`).
  Rejected. The record view is the retained decision and ending. The dock
  reports progress ("Maturing — 6 of 14 days"), and the Trial's progress lives
  in the follow-up, where "Return to Trial" (S45b) already lands.

### Sanction

The label and destination fall within ADR 397's sanctioned destination-copy
amendments (the operator's D3, 2026-09-23). The ledger amendment and its two
stories are covered by Connor Griffin's standing sanction for this release,
2026-09-23, answering "Can your reply here count as sign-off for the UI copy
and tone changes?": "Q1 A, Q2 A, defaults all fine, go".

### Risk contract

- **Must prevent:** the dock promising the watched record and then showing
  another seat while the server serves an active change; a frontend rule that
  re-derives which change is active instead of reading the served disposition
  and admission; a dock state that names a destination the desk does not have;
  and the defaults of secret exposure, irreversible loss of authoritative data
  and silent incorrect success.
- **Must recover:** nothing automatic. The arrival is stateless. A watch that
  has ended falls back to the plain Changes arrival, and the follow-up's own
  admission read already renders its "No active change" frame when a cached
  read has gone stale.
- **Accepted failure:** until the separate issue lands, the topbar, "Return to
  Trial" and the Focus-pin landing can still open a Plan the reader opened
  earlier, and the dock's link reaches the watched record from there. For a
  completed Trial, the dock's "14 of 14 days" and Changes' "15 days · 14
  required" continue to differ.
- **Unsupported:** real-data stores, and any viewport other than the ledger's two
  desktop sizes (1280×720 and 1440×900).
- **Evidence owed:** each scenario in this change's two requirements, exercised
  through public interfaces. That means the dock view, Changes' `mount`,
  Diagnose's `go` callback, and replay stories S139 and S140 at both sizes, each
  shown failing on the base first. Also: S45, S45b, S56 and S57 still pass on the
  branch at both sizes. Also: base and branch renders of the dock for a watched
  Trial and a watched Focus at both sizes, the branch showing the detail line
  wrapped inside the reserve and never ellipsized.

Why: the change is advisory-free routing and copy, so the stakes are a reader
misled about which change they are looking at, not a dose.
Disposition: inline (carried by this ADR and the pinned tasks).

### Consequences

- The desk gains one address context value, `subject=watch`, on Changes.
  Reloading that address behaves like the dock's arrival.
- The desk ledger gains S139 (Trial) and S140 (Focus), and its pinned inventory
  moves from 147 issued · 128 active · 19 retired to 149 · 130 · 19.
- The dock still reads "Ready to judge — 14 of 14 days" for a completed Trial,
  while Changes prints "15 days · 14 required". This change does not reconcile
  the two, because Trial maturity display is outside #429.
