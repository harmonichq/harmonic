# #431 design

## ADR 431 — The server confirms a pending Plan from a matching pump read

### Decision

Reconciliation confirms the pending Plan when the latest pump settings read
captured after its decision holds its schedule. "Holds" is the existing server
comparison, `guidance.schedule_matches`: every parameter at the union of both
schedules' boundaries, at pump precision. The schedule is the Plan's captured
deliverable rows. A Plan recorded before #388 captured deliverables has none, so
its recorded items are applied over that read's active profile with the existing
`guidance.plan_deliverable`, and the result is compared with the same read.

A Plan any of whose recorded items lacks an integer `start_min` or a numeric
`value` is incomparable. Pre-#388 history can hold such rows (for example a
key-only basal item), and `validate_plan_items` checks only the family, so
`Store.save_plan_draft` and `Store.apply_plan` still record them. Feeding one to
`plan_deliverable` or `schedule_matches` raises, and a null value would let an
unchanged read appear to hold it. An incomparable Plan is therefore never
confirmed by a read, serves `pending` with `on_pump` false, and leaves pending
only by Withdraw. Neither the reconciler nor the verdict raises on it:
reconciliation runs inside Withdraw, after every fetch and at `serve` startup,
and the verdict runs on every `/api/plan/history` row, so a raise there would
fail all of them. (Release coordinator ruling, #431 review round 1.)

The receipt names the first read of the unbroken run of reads after the
decision, ending at the latest, that each hold the schedule. It carries the
Plan's key, that read's capture time and active profile, the schedule it matched,
when it was established, and `trial_id: null`. The Store accepts a Plan receipt
without a Trial; a Plan receipt that names a Trial must still name an existing
one, and a Trial's receipt still names itself.

The confirmation runs in `reconcile_follow_up` after the per-Trial pass, so when
a Trial-matched receipt is available in the same pass it wins. Every caller of
`reconcile_follow_up` already commits and bumps the result cache, so no new write
path or cache exception is introduced.

Authority: operator decision D5 (Connor Griffin, 2026-09-23, relayed by the
release coordinator): "the server confirms a pending Plan once the latest pump
read matches it."

### What it amends

ADR 386 (`openspec/changes/harmonic-v2/design.md`) requires "a real observed
transition" for a Plan–Trial relationship. That rule is unchanged, and a
pump-read confirmation creates no relationship. What changes is that a
relationship is no longer the only way a Plan leaves pending: confirmation and
relationship become separate facts. ADR 386's receipt already names "observed
snapshot/change identity"; a pump-read receipt names the snapshot.

### Grounding

Reproduced in-process on the `basal-raise` QA case
(`docs/scope/431-plan-state-repro.py`):

- A Plan recorded through the routes, then an in-place edit of the active
  profile read after the decision: no Trial, the Plan stays pending, guidance
  serves `pending_plan`, Focus admission names `pending_plan`.
- The same edit plus two days of pump-local basal events at the edited rates:
  the dose stream detects a basal-rate Trial at a basal-event time, no settings
  read shares that time, and `_reconcile_plan` finds no observed snapshot. The
  Plan stays pending.
- In both, the server's own comparison holds the Plan on the read after the
  decision and does not hold it on the source profile.

A profile switch keyed before recording creates a Trial, and an active Trial
refuses the decision (`occupied_admission`), so the issue's keyed-first theory
reaches the stuck state only through the dose-stream path.

### Consequences

- A Plan the pump holds leaves pending on the next ingest, including the oldest
  stuck Plans that captured no schedule.
- The time a confirmed Plan names does not move with later fetches.
- A Plan whose reads stopped matching before any reconciliation saw a match
  stays pending with a served mismatch, and leaves by Withdraw.

## ADR 431 — Only the newest recorded Plan can be pending

### Decision

`pending_plan` returns the newest recorded Plan when it is neither confirmed nor
withdrawn, and otherwise nothing. An older Plan that is neither is superseded by
the newer recorded decision: it withholds nothing, is never confirmed by a pump
read, and is served as `superseded`, never as confirmed or withdrawn.

### Why

Today `pending_plan` returns the newest unconfirmed, unwithdrawn record. The
apply route refuses while a Plan is pending, so history written since ADR 386
holds at most one open Plan. History written before it can hold several, none
with a captured schedule. Confirming or withdrawing the newest would then
surface an older Plan whose values the pump may no longer hold, and block Focus
and new decisions again. That is the silent block the issue rules out.

ADR 386's contracts already say "only the latest pending intent leads" and that
older unmatched applies are shown "without silently declaring them entered or
canceled"; `superseded` is that state named.

## ADR 431 — Every recorded Plan serves one verdict

### Decision

One server function in `ciq_autotune/watched_change.py` computes a Plan's
verdict at read time, without writing:

| Field | Meaning |
|---|---|
| `state` | `pending`: newest, not confirmed, and the latest read after the decision holds its schedule, or there is no such read, or the Plan is incomparable. `mismatch`: newest, not confirmed, comparable, and the latest read after the decision does not hold its schedule. Otherwise `confirmed`, `withdrawn` or `superseded`. A holding read that reconciliation has not yet seen serves `pending`, never `confirmed`. |
| `confirmed_at` | The receipt's read time for a confirmed Plan, else null. |
| `on_pump` | Whether the latest read after the decision holds the schedule; false for an incomparable Plan. |
| `checked_at` | The latest read's capture time, or null. |

`/api/plan/history` serves it on every row, in the same query-only transaction,
and keeps its newest-first order. `/api/guidance` serves it on `pending_plan`.
The surfaces read it verbatim; no browser code decides whether a Plan is on the
pump.

## Surface decisions

Wording follows CONTEXT.md and DESIGN.md rule 8 (Basal, Correction factor, Carb
ratio, Target) and is sanctioned under Q2.

- **Changes phase words:** Pending, Mismatch, On pump, Confirmed, Draft saved,
  Staged, Save failed. On pump and Confirmed come only from a served
  `confirmed`.
- **Changes status:** "✓ On pump since <confirmed_at> — the pump matches your
  plan." while `on_pump`; "✓ Confirmed on the pump <confirmed_at>. The latest
  pump read no longer matches this Plan." after. Pending and mismatch copy, the
  mismatch rows and Re-key are unchanged; the rows are drawn only under a served
  `mismatch`.
- **Actions:** a pending or mismatched Plan offers Withdraw and "View change
  record", as shipped. A confirmed Plan with no newer draft keeps "View change
  record" and offers no Withdraw. Today that door comes only from the pending
  branch of the Plan frame, and S105's no-op Plan is confirmed by the server once
  this change lands, so the confirmed frame must supply it.
- **Decision block:** fields describe only the recorded Plan: Decision recorded,
  On pump (the confirmed time, "Awaiting pump evidence", or "The latest pump read
  doesn't match"), Re-key asked. A draft saved during a pending Plan is the line
  "Next change: draft saved <time>. It can be recorded once this Plan is
  confirmed or withdrawn." With no Plan pending, a draft is the frame's subject
  (Draft saved / Decision recorded: Not recorded, Save draft, Record decision),
  and the newest confirmed Plan is the line "Previous Plan: recorded <time>,
  confirmed on the pump <confirmed_at>." The field labels S41 reads are kept.
- **Newest record:** the served history is newest first, so the recorded Plan is
  the first served row that is neither withdrawn nor superseded.
- **Watch panel:** kind "Plan · awaiting pump"; title "<setting> · recorded
  MM-DD"; detail "Recorded — waiting for a pump read that matches" (`pending`)
  or "The latest pump read doesn't match this Plan" (`mismatch`); route "Open
  Changes ›" to Changes at `subject=plan`. Precedence: Trial, Focus, pending Plan,
  staged draft, idle. The staged-draft route reads "Open Changes ›" to the same
  address. Per the coordinator's ruling from #429, no Plan state routes to the
  watched-change address (`subject=watch`), which #429 owns.
- **Default assumed, returned to the coordinator:** a confirmed Plan holds no
  watch-panel state. The panel shows what holds the one active-change seat, and
  the server releases that seat on confirmation. A confirmed state shown
  indefinitely would outlive the schedule it names.
- **Case-file header:** carries no pending-Plan note for any case. The
  `pending_plan` entries in `frontend/guidance.js`'s admission copy go with it,
  since no other reader uses them (`unavailable` only ever carries
  `reconciliation_required`).

## Revise preparation

- **Lifecycle:** `revise`, routed by UI Craft on 2026-09-23 (`shipped`,
  `runnable`, declaration `complete`, data source `manufactured`). Convergent
  work: the direction is ruled (D5, the issue checklist, Q2), so no wireframe
  phase opens.
- **Safe start:** `AGENTS.md`, "The data boundary", the QA copy-then-serve
  command, `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port
  8765`, over a copy of `mockups/qa-e2e.synthetic/harmonic.sqlite` or a named
  case store emitted by `scripts/gen_qa_e2e_db.py --case <name>`. Both come
  entirely from `scripts/gen_qa_e2e_db.py`.
- **Base:** `origin/main` a4d374a7 (#420). The ledger was frozen at
  eec4652a and re-frozen for #413 (147 issued, 128 active, 19 retired).
- **Base replay:** not re-run by triage; the release brief forbids port-bound
  runs in workers and names the frozen ledger as the contract. The coordinator
  runs every port-bound leg.
- **Inventory diff:** no ledger story covers the watch panel's Plan states, the
  server's confirmation, a draft after a confirmed Plan, or the pending-Plan
  note (the note is held only by `frontend/desk.browser.test.mjs`). S145–S147
  are added. C2's S42 body reads "On pump as of" and changes to "On pump since",
  and it and `frontend/replay-pump.py` read the served history's first (newest)
  record instead of its last. S105 records a no-op Plan that the server now
  confirms, so its "View change record" comes from the confirmed frame, and its
  premise also asserts the served confirmation. S40, S41 and S89 keep passing
  because the labels and pending copy they read are unchanged.
- **Ledger amendment:** S145–S147 and the amended bodies are recorded in a dated
  `## #431 amendment — 2026-09-23` section, following the #413 and #414
  pattern. No existing `★ FROZEN` block is rewritten, re-dated or replaced. The
  inventory literals in `acceptance.py` and `acceptance.test.py` move on this
  branch; the header's inventory line and the release freeze block belong to
  the release coordinator.
- **Moved behavior:** the pending-Plan note leaves the case-file header and
  lands in the watch panel. Every reader of it is updated in the same change:
  the desk browser test, `frontend/focus-entry.test.js` and the new S147.
- **Sanction:** Q2, Connor Griffin, 2026-09-23: "Yes. I record your answer as
  the approval for every change these 13 checklists call for, and write the
  wording in CONTEXT.md terms." No shipped behavior is retired.

## Risk contract

- **Must prevent:** a Plan served or shown as confirmed or on the pump when no
  pump read after its decision holds its schedule (silent incorrect success on
  advisory dosing guidance); two surfaces making different claims about one Plan
  record; a hold, floor or staging verdict moving into the frontend; real
  glucose, insulin or schedule values in any committed test, fixture, capture or
  comment.
- **Must recover:** none beyond the existing reconciliation on every ingest.
- **Accepted failure:** a Plan whose pump reads stopped matching before any
  reconciliation saw a match stays pending with a visible mismatch and leaves by
  Withdraw; an incomparable recorded Plan (an item without an integer start
  minute or a numeric value) is never confirmed by a read, stays pending, and
  leaves by Withdraw; an older unconfirmed Plan superseded by a newer record is
  neither confirmed nor withdrawn, and is not listed as either.
- **Unsupported:** an out-of-process CLI fetch while `serve` runs (the existing
  process-local cache rule); viewports other than the two supported desktop
  sizes.
- **Evidence owed:** backend tests through the public routes and
  `reconcile_ingested_follow_up` (in-place edit after the decision; dose-stream
  Trial; read before the decision; mismatch; a Plan without a captured schedule;
  an incomparable Plan through reconciliation, both reads and Withdraw; a
  holding read not yet reconciled; superseded history; the confirmed time
  holding across a later read; history and guidance serving one verdict; the
  store's receipt identity rule), each asserting changed behavior shown failing
  on the base and each guard shown passing there; frontend unit tests for the
  Changes phase, status, actions, Decision block and newer-draft frame and for
  the watch panel's Plan states; the browser test and replay stories named in
  the change; the desk ledger's inherited stories preserved.
- Why: these screens are read as advisory insulin-dosing guidance; the harm is a
  false "on the pump", not downtime. Disposition: admitted into
  `openspec/changes/plan-state-one-verdict/design.md` unchanged.
