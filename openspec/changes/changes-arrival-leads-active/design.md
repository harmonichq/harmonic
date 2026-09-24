# Design — #446

## ADR 446 — The watched change leads every plain arrival to Changes

### Context

Verified on the base (b03431d2):

- `frontend/changes.js` holds `planOpen` as module state. Pressing Open Plan sets
  it, and nothing clears it. `mount` opens the Plan when
  `planOpen && planUnderway() && !watchArrival`, before it reads the served
  disposition. `planUnderway()` (`frontend/plan-view.js`) is true for a staged
  change, a saved draft with items, or a recorded Plan still pending or
  mismatched.
- The router hands every arrival a new `navigation` value (`routes.js` `navigate`
  and its history subscription); `render()` keeps it. `focus-entry.js` already
  keys its once-per-arrival read on that value.
- The topbar's Changes (`routes.js` `bindTopbar`), Diagnose's "Return to Trial"
  (`diagnose.js`) and the Focus-pin landing (`focus-entry.js`) all call
  `navigate('changes')` with no context. ADR 429 exempted only the dock's
  `subject: 'watch'` arrival, and deferred every other arrival to this issue.
- The API serves the `draft` and `pending_plan` dispositions only when no change
  is watched. While one is watched it serves `active_change`, and it refuses to
  record a Plan (`occupied_admission`). It does not refuse saving a draft.
  In-process against the `basal-lower` case store: a draft saved during a Trial
  answers 200 and is served as guidance's `draft`, and recording it answers 409
  `occupied_admission`.
- While `active_change` is served, Changes renders the follow-up
  (`follow-up.js`). No `[data-set="open-plan"]` control renders there. The only
  Plan route is the Trial's "Revert to Plan" section, whose Open Plan runs
  `stagePrior`. On a `stage-prior` route that saves the prior setting as the
  draft, replacing any saved draft. A Focus has no Plan route at all.
- Stage in the Plan's own idle frame (`plan-view.js`) sets Save draft as its
  focus target, then calls `navigate('changes')`. That lands on the Plan only
  when the remembered Plan-open state happens to be set. Otherwise it lands on
  the concern's frame, and focus has nowhere to go.
- Diagnose opened from the watched change shows its return control whenever the
  trend serves a watched change. It labels it "Return to Trial" for either kind.
  In-process against the `c3-focus` case store, the trend's `watched_change` is
  the Focus.

**Reproduction** (`docs/scope/446-changes-arrival.repro.mjs`, node, synthetic):
after Stage and Open Plan, a plain arrival while `active_change` is served reads
`/api/plan`, `/api/plan/history` and `/api/pump-settings`, which is the Plan. The
same arrival without the earlier Open Plan reads `/api/verify/trials`. The dock's
arrival reads `/api/verify/trials`. With nothing watched, the Plan reopens on the
next plain arrival.

### Decision

The operator's settled ruling R446 decides the rule. The coordinator's #446
rulings (Q3 delegation, 2026-09-23) settle decisions 3 to 5: Q1 A (decision 4),
Q2 widened to Diagnose's return (decision 5), and Plan's own Stage accepted into
this change (decision 3). This ADR records how they land.

1. **One place clears the Plan-open state.** Changes' `mount` compares
   `deps.navigation` with the last arrival it saw. On a new one, it clears the
   Plan-open state before any branch runs. Open Plan sets it and calls
   `render()`, so the Plan stays open for the rest of that visit and no longer.
   An explicit Plan arrival opens the Plan by its own context, so clearing on it
   changes nothing.
2. **The #429 dock exception is removed.** With the state cleared on every
   arrival, `watchArrival` guards nothing that can still occur: it cannot differ
   from the general rule without Open Plan being pressed during the watch
   arrival's own visit. The concern frame that carries Open Plan does not render
   while `active_change` is served. The precedence keeps its other places: the
   history and record routes, the explicit Plan arrival, and the served `draft`
   and `pending_plan` dispositions.
3. **Plan's own Stage stays on the Plan.** Stage in the Plan's idle frame
   re-renders in place (`render()`), so the reader stays at the Plan request they
   are in, and Save draft takes focus. Before, it made a plain arrival that the
   rule above would never let reach the Plan.
4. **A draft is reachable while a change is watched** (coordinator ruling Q1 A).
   The watched Trial's and Focus's nameplate in Changes offers "Open Plan" when a
   Plan draft exists. That means guidance serves a `draft` with items, or
   `planUnderway()` holds for the page. With no draft there is no control. It sits
   beside "View change record" and makes the explicit Plan arrival
   `navigate('changes', { subject: 'plan' })`, the same arrival the Trial's Revert
   to Plan already makes. The Plan it opens holds for that visit. The next plain
   arrival leads with the watched change again, under decision 1. It is an arrival
   rather than the in-page flag because a page opened straight onto a watched
   change has not loaded the Plan's state, so the flag alone could not open a
   saved draft. The label matches the concern frame's control and R446's wording.
   The Plan renders unchanged. Record decision stays offered, and the server's 409
   (`occupied_admission`) shows through the Plan's existing failed-record path.
   The desk adds no gate.

   **Why a watched Trial carries both this Open Plan and Revert to Plan.** They are
   different actions. Revert to Plan stages the Trial's prior values: on a
   `stage-prior` route it saves them as the draft, replacing whatever draft was
   saved, then opens the Plan. The nameplate's Open Plan changes nothing. It opens
   the draft as it stands. Removing either would drop an action the other cannot
   take. A Focus has no Revert route, so it carries only the nameplate's.
5. **Diagnose's return names the served watched kind** (coordinator ruling Q2,
   widened to `frontend/diagnose.js`). It reads "Return to Focus" when the served
   watched change is a Focus. Otherwise it reads "Return to Trial". It still makes
   the same plain arrival.

### Alternatives considered

- **Clear the state only while `active_change` is served.** Rejected. R446 makes
  Open Plan a choice for one visit. Keeping it across visits with nothing watched
  is the same stale memory the issue reports, only in a quieter state.
- **Replace Open Plan with an explicit Plan arrival and delete the remembered
  state.** Rejected. Every Open Plan would push a history entry and change the
  address, and Undo inside the Plan would leave the reader on an empty Plan
  frame instead of the concern. S38, S39 and S90 would change for no reason in
  this issue.
- **Reach the draft only through the address and the Trial's Revert to Plan.**
  Rejected by the coordinator's Q1 ruling. A Focus has no Plan route. On a Trial whose route stages the prior setting, Revert replaces
  the saved draft it was meant to reach.
- **Gate Record decision while a change is watched.** Rejected by R446. The
  server's refusal is the one owner, and the frontend re-derives no admission.

### Sanction

`Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R446`.
It covers the shipped-surface revision (the arrival rule, the watched change's
Open Plan, Plan's own Stage and the Focus return label) and the ledger amendment
adding S166–S168. The coordinator's #446 rulings on Q1 and Q2 and its acceptance
of Plan's own Stage, 2026-09-23, fall under the same delegation.

### Safe start (revise lifecycle)

- Declaration: `AGENTS.md`, "The data boundary", the QA copy-then-serve command
  `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`, over
  a copy of `mockups/qa-e2e.synthetic/harmonic.sqlite` or a named case store
  emitted by `scripts/gen_qa_e2e_db.py --case <name>`.
- Data source: generator-owned synthetic stores only. The stories use
  `basal-lower` and `c3-focus` from `scripts/qa_e2e_cases.py`, served per story
  by `frontend/replay-cases.mjs`. Pump reads are advanced only by
  `frontend/replay-pump.py`.
- Contract: the frozen ledger (`★ FROZEN 2026-09-23`) and its replay. Under this
  release's brief the coordinator owns every port-bound leg and the re-freeze. No
  sweep is re-run in the ticket.

### Risk contract

- **Must prevent:** Changes showing a Plan in the watched change's seat on a
  plain arrival while the server serves an active change. A frontend rule that
  decides which change is active, or whether recording is allowed, instead of
  reading the served disposition and the server's answer. A control that promises
  the Plan and lands elsewhere. And the defaults of secret exposure, irreversible
  loss of authoritative data and silent incorrect success.
- **Must recover:** nothing automatic. The state is per visit. A reload starts
  clean.
- **Accepted failure:** a staged change that was never saved lives only in this
  page's memory, as it does today. After a reload it is gone, and nothing warns
  about that.
- **Unsupported:** real-data stores, and any viewport other than the ledger's two
  desktop sizes (1280×720 and 1440×900).
- **Evidence owed:** each scenario in this change's requirements, through public
  interfaces. At node level: Changes' `mount` and the desk's `navigate('changes')`
  (the call all three plain arrivals make), Diagnose's return label, and Plan's
  own Stage. In the browser: S166–S168 at both sizes, each failing on the base
  first at a feature assertion, not a premise. S45, S45b, S56, S57, S139 and S140
  must still pass on the branch at both sizes.
- **Evidence limit:** no generated case store serves both a stageable setting
  action and a pinnable Pattern. The Focus-pin landing after an earlier Open Plan
  therefore has node-level proof through the desk's own `navigate('changes')`,
  plus S56's unchanged landing, and no browser story. This was checked in-process:
  `basal-lower` serves a basal action and no pinnable Pattern, and `c3-pin` serves
  a pinnable Pattern whose action is a habit.

Why: the change is advisory-free routing and one control, so the stakes are a
reader misled about which change they are looking at, not a dose.
Disposition: inline (carried by this ADR and the pinned tasks).

### Revision evidence (coordinator, port-bound)

The coordinator captures before/after renders from the base and the branch, in
the desk's one theme, at 1280×720 and 1440×900:

1. Changes after the topbar arrival once S166's Trial has begun. The base shows
   the Plan; the branch shows the Trial.
2. Changes after a plain return with nothing watched, in S166's first half. The
   base shows the Plan; the branch shows the concern with "Staged", Undo and Open
   Plan.
3. The watched Trial's view with a saved draft (S167). The base has no nameplate
   Open Plan. The branch shows it beside "View change record", with Revert to Plan
   unchanged in the reading pane.
4. The watched Focus's nameplate with a saved draft (S168).
5. Diagnose's crumb opened from a watched Focus (S168): "Return to Trial" on the
   base, "Return to Focus" on the branch.

They land in a private design-evidence record, not part of the public tree.

### Consequences

- Open Plan is a choice for one visit. Pressing it again after returning is one
  extra press, and it is the price of never opening a Plan in the watched
  change's seat.
- On a Trial with a draft, two controls named "Open Plan" show, one per action
  (decision 4). The nameplate's opens the draft as it stands. The Revert to Plan
  section's stages the prior setting, as it does today.
- The desk ledger gains S166–S168. Its pinned inventory moves from 171 issued ·
  152 active · 19 retired to 174 · 155 · 19 on this branch. The coordinator
  reconciles release totals on the integration branch.
