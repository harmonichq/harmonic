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
  Generated facts C and D below show both on the `basal-lower` and `c3-focus`
  case stores.
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
  Generated fact D shows that on `c3-focus` the trend's `watched_change` is the
  Focus.
- The Focus-pin landing (`focus-entry.js`) runs
  `await loadGuidance({ force: true }); navigate('changes');`. That is the same
  no-context arrival the topbar makes, and S166 drives it from the topbar.

**Reproduction** (`docs/scope/446-changes-arrival.repro.mjs`, node, synthetic):
after Stage and Open Plan, a plain arrival while `active_change` is served reads
`/api/plan`, `/api/plan/history` and `/api/pump-settings`, which is the Plan. The
same arrival without the earlier Open Plan reads `/api/verify/trials`. The dock's
arrival reads `/api/verify/trials`. With nothing watched, the Plan reopens on the
next plain arrival.

### Generated facts (base b03431d2)

Each command runs from the repo root, and the output under it is its complete,
literal stdout. The three probes emit their synthetic case store with the
committed generator into a temporary directory. They reconcile it as
`frontend/replay-cases.mjs` does and answer through FastAPI's in-process test
client: no port, no fetch loop, no real data.

A. `node docs/scope/446-changes-arrival.repro.mjs` (Node's module-type and
localStorage warnings go to stderr):

```text
control · plain arrival, no earlier Open Plan, active_change: ["/api/verify/trials"]
plain arrival after Open Plan, active_change:             ["/api/plan","/api/plan/history","/api/pump-settings"]
watch arrival (subject=watch) after Open Plan:             ["/api/verify/trials"]
plain arrival after Open Plan, nothing watched · Plan frame: true · Open Plan offered: false
```

B. `uv run python docs/scope/446-basal-lower.probe.py` is S166's first-half
premise: a stageable basal action, with nothing watched.

```text
{"disposition": "eligible_action", "active_kind": null, "selected": "pattern:overnight_lows_no_iob", "stageable_action": [["basal_rate", 180]]}
```

C. `uv run python docs/scope/446-basal-lower-trial.probe.py` covers the premises of
S166's second half and of S167. A recorded Plan and a `match` pump read start a
Trial. No draft is served until one is saved. A draft saves while the Trial runs
and is served beside `active_change`. Recording it is refused, and nothing is
added to the history.

```text
draft 200 apply 200 then pending_plan
after match: {"disposition": "active_change", "active_kind": "trial", "served_draft_items": 0}
draft saved while watched: 200
after draft: {"disposition": "active_change", "served_draft_items": 1}
record while watched: 409 {'detail': 'occupied_admission'} history grew: False
```

D. `uv run python docs/scope/446-c3-focus.probe.py` covers S168's premises: an
active Focus, a draft saved beside it and served, and the trend's watched change
(which Diagnose's return reads) being the Focus.

```text
before: {"disposition": "active_change", "active_kind": "focus"}
draft saved while watched: 200
after draft: {"disposition": "active_change", "served_draft_items": 1}
trend watched_change kind: focus
```

E. The ledger's inventory, counted as `acceptance.py` `inventory()` counts it:

```text
$ grep -cE '^[SR][0-9]+[a-z]? ·' mockups/harmonic-v2-desktop.behavior.md
171
$ grep -cE '^S[0-9]+[a-z]? ·' mockups/harmonic-v2-desktop.behavior.md
152
$ grep -cE '^R[0-9]+[a-z]? ·' mockups/harmonic-v2-desktop.behavior.md
19
```

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
- **Focus-pin landing:** proved at node level, with no browser story of its own.
  The landing is `await loadGuidance({ force: true }); navigate('changes');`
  (`focus-entry.js`), the same no-context arrival S166 drives from the topbar.
  The desk-level node test drives that exact `navigate('changes')`, and S56 keeps
  proving the landing itself.

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

Base S166 fails at its first step (Stage inside the Plan's own frame), before it
reaches the states of renders 1 and 2. For those two base renders, the
coordinator drives the base app to each state directly, as the release render
driver does. The base runs of S167 and S168 reach renders 3, 4 and 5 before they
fail. S168 checks Diagnose's return label before the Focus nameplate, so its base
run captures the crumb first.

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

### Widening — 2026-09-23: each arrival re-reads guidance

Review round 1 found a second way a Plan could take the watched change's seat.
The desk keeps the last guidance read it made. When the server starts a watch
behind the page (the hourly fetch reading a pump switch, say), that read can
still say `pending_plan` or `draft`. A plain arrival then seated the Plan from
it, because the served-disposition Plan branch ran before any fresh read. The
coordinator widened this ADR under the same delegation. Sanction:
`Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R446`.

6. **Each new arrival re-reads guidance once, before a served draft or pending
   Plan can seat the Plan.** It is the same place that clears the Plan-open
   state (decision 1), on the same new `navigation` value. A re-render within
   the visit makes no read. While that read has not answered, a served `draft`
   or `pending_plan` shows the Reading frame instead of the Plan. When the read
   answers, Changes redraws and follows the disposition the server serves now.
   The Focus options read on the same arrival shares that one request.

   Only the served Plan branch waits. The explicit Plan arrival and Open Plan
   within the visit are the reader's own choice, and they open the Plan at once.
   The change record opens at once too. Every other frame draws from the read in
   hand and redraws when the new one lands, as it did before this change. Making
   every arrival wait would put a Reading frame on every visit to Changes. No
   frame other than the Plan can put the wrong change in the watched seat.
   If the arrival's read fails, the precedence from before this ADR stands.
