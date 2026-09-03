# Design — the left-column pattern (#306)

Safe start for every serve in this change: the QA copy-then-serve command in
`AGENTS.md` "The data boundary" (`cp mockups/qa-e2e.synthetic/harmonic.sqlite`
to scratch, then `uv run harmonic serve --no-fetch --token '' --db "$scratch"
--port <n>`), whose database `scripts/gen_qa_e2e_db.py` generates in full from
the case catalog. Every source is synthetic; no operator or patient data is
read. This shipped-surface revision creates no lock manifest; the behavior
ledger and app-only replay remain the contract.

## ADR 306 — The stage holds the active finding's chart

**Decision.** The left column's second slot (the spotlight, `#tile-focal`)
always holds the active finding's chart: the rank-1 finding's chart while the
findings queue shows, the drilled finding's chart while drilled, and the rank-1
chart again the moment the reader leaves the drill. An explorer pick opens that
chart's finding through the one chart-click route (ADR 294), so the stage never
shows a chart whose finding is not the active one. The stage chart keeps its
drawer cell as the marked current frame: ADR 215's sanction that the dock is
the whole ordered set, spotlight included, stands.

**Why.** #305's active-chart rule. Today a drill already seats its chart, but
`popTo` clears the drill mark without re-seating rank-1, so the stage kept the
last drilled chart at the queue; and the explorer pick moved the stage without
a drill. #302's hero row is chartless by this rule, so "nothing renders twice"
is met by that row and by the once-only headline, not by removing the drawer's
current-frame cell (operator, 2026-09-02, Q3 → keep the echo).

## ADR 306 — The charts drawer is a picker that opens minimized

**Decision.** The drawer boots hidden and never comes back up on its own: the
ADR 215 dock-floor rule's grow-back half (a field growing back past 376px
re-docked the strip) is retired; shrinking past the floor still hides. Picking
a chart from the drawer — a cell click or Enter, a Watching tail cell, or an
explorer pick — seats and drills that chart and puts the drawer away.
"Bring the charts up", "show every chart" and chart fullscreen are unchanged.

**Why.** Operator, 2026-09-02: "I really want it to be a picker … closed on
default load and something you can bring up, that you can scroll through, you
can still bring it up full screen if you want, but when you click on a chart,
it goes away." On the re-dock: "It opens minimized. It never comes back up on
its own. That path is archived. It's gone." The minimized default and the pick
rule are one behavior, so both land in this ticket rather than a follow-up.

## ADR 306 — Every findings row carries one served headline, authored with the operator

**Decision.** The findings projection stamps `headline` on every row it
publishes, every register included (`assert`, `finding`, `held`, `blind`,
`history`). The frontend renders it verbatim and composes no sentence of its
own: the stage card's title is the headline's only home, the basal chart deck
loses the headline it drew, drawer cells keep the short nameplate, and no
drill level repeats it. A headline is composed only from the row's own fields or
from the evidence its chart's endpoint serves — basal night evidence, ISF
rest-window evidence, I:C block evidence, the Finding case file — read through
the same module functions those endpoints call, inside the cached projection
(no second cache, no recount of raw records); it never states a count,
direction or verdict the analyzer did not publish. A template's slots name
those served facts and nothing else. `history` rows are authored and served
like every other register: the stage never shows one (a history row publishes
no chart), and their consumer is #302's queue rows, which read the same field.

The sentences are the operator's, not an agent's. Before any template is
written, the executing session generates a facts sheet over the QA showcase
(one row per findings row, every fact the engine publishes for it) and the
operator writes an example headline per row; the templates are built from
those examples and recorded below as dated sanctions, one per family and
register. Shape rule (operator, 2026-09-02): "It's honest, it doesn't
editorialize, it uses facts and it tells a story. But more than anything, it
doesn't sound like AI." A strong read carries its counts and consequence
("missed meals led to highs on 3 separate nights, above 200 for over 6 hours in
total"); a thin read gets the plain sentence ("this slot doesn't have enough
evidence to recommend a change either way").

**Why.** The findings projection is the one delivery the rail, the stage card
and #302's chartless hero row all read, and the frontend already renders it
verbatim (ADR 730); a chart-payload headline would exist only once a chart
loads, and the hero row draws none. Operator lean, 2026-09-02: "the back end
owns the headline … it's part of the chart, it's not something that we want
the front end rendering." Every family gets one now: "everybody gets a
headline, and it's part of this ticket, not sub-tickets for each."

**Headline templates.** Appended by the executing session from
`evidence/headlines.authored.csv`, one entry per family and register:

- (pending the attended authoring round)

## ADR 306 — The nameplate's editorial treatment is settled at the running app

**Decision.** The stage card's title gains editorial weight, so the bar it
lives in changes with it; no value of that treatment is chosen headless. The
executing session serves the base and the revision side by side on the same
showcase copy and iterates the nameplate with the operator in UI Craft revise
rounds, recording each ruling below as a dated sanction before the CSS lands.
The 1.5rem no-hero cap (DESIGN.md) binds every option rendered.

**Why.** Operator, 2026-09-02: "given that we're trying to give this title a
little bit more editorial weight, we probably need to change the drop-down bar
that it lives in, and since we're giving the spotlight more space, we have
room for that now." #317 set the precedent that a look-and-feel ruling is the
operator's on the running app.

**Nameplate rulings.** Appended by the executing session:

- (pending the attended revise round)

## Base story counts

Recorded by task 1.1 against the base worktree:

- `frontend/diagnose-workstation-behavior.replay.mjs`: (pending)
