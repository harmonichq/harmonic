# Scope — harness story coverage and per-story data source (#240)

Child of epic #238. Deliverable: a decision record on the epic's design.md. No code.

## Decisions

- **The harness runs on real history by default, with a few manufactured states for
  what real history never shows.** Operator answered Q1 = B, flagging it as sounding
  complicated. Reopened in round 2 once the operator restated the actual goal.
  **Superseded in round 2.** The operator restated the goal as cheap iteration with
  an AI agent, and his real history is the one thing an agent can never load, since
  it is never committed. Real-first therefore makes the agent's half harder, not
  easier. `inline`
- **Coverage taxonomy is not the operator's decision.** Operator answered "I don't
  know" to both the story-addressing question and the extra-surfaces question, and
  restated the goal as: a way to edit charts without iteration with an AI agent being
  a giant pain. Both taken as defaults rather than pressed:
  - Stories are one per chart kind, with mode, coordinate, size and theme on pickers,
    and the picker state carried in the address so an exact view reopens. `inline`
  - Two extra stories, the full-width clock strip and the inspector drill. The drawer
    thumbnails are the same four charts drawn with their existing miniature flag
    (`mini`, a parameter of the same option builders), so they are a size setting on
    the four chart stories rather than a story of their own. `inline`

## Open questions

None. Frontier empty after round 3 (Q4 = C, Q5 = B).

## Spawned tasks

None yet.

## Grounding measured this session

Measured live, not read from docs.

- Registry (`frontend/diagnose-evidence-charts.js`): four kinds — `basal`
  (modes clock, event), `isf` (event, clock), `carb-ratio` (event, clock),
  `event-comparison` (modes null). Seven chart/mode combinations, not four.
- Operator's real database, 30-day findings window, read-only snapshot taken and
  deleted this session: his current history does not exercise every state the chart
  reviews judge. Which states it leaves empty is deliberately not recorded: this
  repository is public, the fact goes stale within weeks, and the ruling needs only
  that the gap was measured rather than assumed. No record-level value from that
  snapshot appears anywhere in this ticket.
- Committed synthetic database (`mockups/revise-e2e.synthetic/harmonic.sqlite`),
  served with the sanctioned `--no-fetch` command: 3 rows only — 2 carb-ratio
  (one **asserting a raise**), 1 late-bolus habit; 1 basal slot (slot 0), 1 all-day
  I:C block, ISF rest windows present (30 windows, not asserting).
- Serving that committed database mutates it: WAL sidecars plus a
  `harmonic.sqlite.derived.sqlite`, and the file itself shows modified. Restored by
  hand this session; `gen_revise_e2e_db.py --check` passes again after restore.
- Committed generator-authored captures already exist under
  `mockups/diagnose-workstation.synthetic/`, including `ic-blocks-asserting.capture.json`
  (a manufactured asserting I:C state) and a
  140 KB `payload.json` the browser gates drive the whole workstation from.
- Sibling #239 settled the toolchain: Vite alone, npm, exact pins with committed
  lockfile, no CI job, Node 22 documented, harness lives in top-level `harness/`.

- **Both data sources, behind one switch per story (Q4 = C, conditional on being
  simple to build).** The agent works from committed manufactured data and opens the
  chart itself; the operator flips the same story onto his running app. `→ ADR`
- **Simplicity established by measurement, not assertion.** Both halves already exist:
  the browser gates already serve the whole workstation from committed synthetic
  payloads through route stubs plus the drift-checked findings mirror
  (`mockups/findings-projection.mirror.mjs`, held identical by
  `frontend/findings-projection-mirror.test.js`), and the proxy to a running
  `harmonic serve` is the same one #238 already requires. The harness adds one switch
  between them, not new machinery. `inline`
- **Six stories.** One per registry chart kind (basal, ISF, carb ratio,
  event comparison), plus the full-width clock strip (#204) and the inspector drill
  (#212). The drawer thumbnails and mini tiles (#209) are the same four charts drawn
  with their existing miniature flag, so they are a size setting on the four chart
  stories rather than a story of their own. `→ ADR`
- **Manufactured set starts as what is already committed.** A new manufactured state
  is added only when a review actually needs one it cannot show. Chosen for minimum
  ongoing maintenance, consistent with #239's framing. `→ ADR`
- **No chart is settled until it has been seen on the operator's real history
  (Q5 = B).** He is the only reviewer, the flip is one switch, and a misleading chart
  here advises a real dose. `→ ADR`

### Risk contract

Why: a dev-only tool with one operator, whose output nonetheless steers advisory
insulin-dosing guidance in the shipped app.
Disposition: `→ ADR`, copied unchanged into the work order.

- **Must prevent:** any real glucose, insulin, dose, timestamp or credential value
  reaching a commit, a screenshot, a CI log or a pull request body; a chart settled
  on manufactured data alone; any harness dependency entering the shipped app or the
  dependency-free fast gate.
- **Must recover:** nothing. No unattended or long-running process exists here.
- **Accepted failure:** the harness breaks because a pinned dependency no longer
  works with the host Node or browser, or because a committed payload's shape drifted
  from the app. Found the next time the harness is opened, repaired by hand then.
- **Unsupported:** running the manufactured side against a live vendor pull; pointing
  the harness at the committed synthetic database by serving it (measured this
  session: that mutates a tracked file, leaving WAL sidecars and a derived database);
  any use of the harness as a test or a gate.
- **Evidence owed:** none from this ticket, which changes no behavior. The stage-1
  build child (#241) owes proof that the shipped app is byte-identical and that the
  fast gate still runs with no npm install.
