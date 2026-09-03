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
publishes: nine family-and-register pairs are reachable (basal `assert`,
`held`, `blind`; carb ratio `assert`, `held`; correction factor `assert`,
`held`; event comparison `finding`; past setting `history`), and each has its
own ruled template. The frontend renders it verbatim and composes no sentence of its
own: the stage card's title is the headline's only home, the basal chart deck
loses the headline it drew, drawer cells keep the short nameplate, and no
drill level repeats it. A headline is composed only from the row's own fields or
from the analyzer payload the projection already holds — the basal night
roster through `prepare_basal_night_evidence(analysis)` and the ISF rest
windows through `prepare_isf_rest_window_evidence(analysis)`, both pure
functions of the analysis, and the I:C blocks' own published counts from
`analysis["ic_blocks"]` — inside the cached projection (no second cache, no
recount of raw records); it never states a count, direction or verdict the
analyzer did not publish. Two things are not sources because each needs a
store the projection does not have (`prepare_findings_projection` takes only
`analysis`, `exposures`, `scenarios`): the Finding case file
(`ciq_autotune/finding_case_file.py` imports the projection and prepares one
inside a store transaction) and the I:C block CGM series
(`prepare_ic_block_evidence(store, analysis)` reads CGM rows). A behavioral
row's sentence therefore draws on the row's own served facts — its title, episodes, evidence, verdict counts, appearances
and window — and a consequence fact the case file alone carries is not a slot
until the projection publishes it. A template's slots name those served facts
and nothing else. `history` rows are authored and served
like every other pair: the stage never shows one (a history row publishes no
chart), nothing in this ticket renders that sentence, and its consumer is
#302's queue rows, which read the same field; that one pair is priced into
the attended round knowingly, because the operator ruled that every finding
gets a headline. A family's sentence reads only its own family's evidence and
only when that payload is present; a missing payload yields the family's
plain thin-read sentence, never a failed projection.

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
`evidence/headlines.authored.csv`, one entry per family and register. Ruled in
the attended round of 2026-09-03: the operator asked for candidate sentences over
the generated facts sheet, rated them, and ruled the templates below; the
rendered example under each sanction is the operator's accepted rendering
against the sheet's row. Two shape rules the operator added in that round bind
every template:

- The headline never restates what the short nameplate already carries: no slot,
  no clock range, no parameter name, no "your pump". The nameplate stays beside
  it on the stage card (Connor Griffin · 2026-09-03: "the chart title really
  should carry the context … a non-editorialized part of the title that just is
  specifying the slot I'm looking at").
- A setting sentence carries the delivered or measured value, the count of
  steady nights, fasting nights or meal runs, and the programmed value, in that
  order, and closes with the served verdict sentence (Connor Griffin ·
  2026-09-03: "we use the delivered terminology … we specify the number of steady
  nights … we state what was needed, and we say what was programmed"; "being
  templated is the goal here. We don't want to write bespoke sentences for each
  category").

Slots name served row fields (`estimate.value`, `support.n`, `current`,
`annotation`, `reason`, `tier`, `direction`, `lean`, `appearances[0]`,
`past_setting`, `programmed_now`, `regime_end`) and nothing else; the basal
night evidence and the I:C block counts turned out to add no slot the row does
not already carry, and the Finding case file's `ref_` columns were shown to
the operator as reference only before the round began (Connor Griffin ·
2026-09-03, told in the round's opening message; the sheet's `_note` and header
mark them). Three rules the review round fixed after the operator delegated
the remaining choices ("I'll take your recommendations going forth", Connor
Griffin · 2026-09-03):

- **Units follow `CONTEXT.md`.** Correction factor prints unit-first
  (`1 U : 24 mg/dL`), never `mg/dL/U`; basal prints `U/h`; carb ratio prints
  `g/U`.
- **Numbers print at the parameter's precision.** U/h to two decimals (`0.60`,
  `0.48`); mg/dL and g/U as a whole number when the served value is whole
  (`40`, `12`) and to one decimal otherwise (`24.0` for a served `23.9974`);
  `regime_end` prints its date only.
- **A merged basal run names no rate.** `_basal_rows` serves `current`,
  `recommended` and `estimate` only on a single-slot row and `null` on a merged
  run ("a merged run names no single programmed rate"), so the basal templates
  read the row's own values, never the first member's evidence, and a row whose
  `current` is null takes the rate-free form below, which states only the served
  direction or lean and the steady-night count.

- basal · assert — Connor Griffin · 2026-09-03 · "Delivered 0.48 U/h across 30
  steady nights against 0.60 programmed. One cautious step down is supported at
  this time." (single-slot row); merged run, the showcase's `basal:180-240`:
  "Delivered below the programmed rate across 30 steady nights. One cautious
  step down is supported at this time."
  `Delivered {estimate.value} U/h across {support.n} steady nights against {current} programmed. {annotation}.`
  merged (`current` null): `Delivered {below|above by direction} the programmed rate across {support.n} steady nights. {annotation}.`
- basal · held — Connor Griffin · 2026-09-03 · "Delivered 0.48 U/h across 7
  steady nights against 0.60 programmed. Not enough nights of steady data yet to
  point one way."
  `Delivered {estimate.value} U/h across {support.n} steady nights against {current} programmed. {annotation}.`
  merged (`current` null): `Delivered {below|above by lean} the programmed rate across {support.n} steady nights. {annotation}.`; a held run with no lean (`lean` null: its estimate sits at the programmed rate, or is absent) states only the count: `{support.n} steady nights delivered so far. {annotation}.`
- basal · blind — Connor Griffin · 2026-09-03 · "No steady nights delivered
  against the programmed rate here, so nothing to say either way." (rate-free
  for single and merged rows alike: a blind row has no delivered value to set
  against it)
  `No steady nights delivered against the programmed rate here, so nothing to say either way.`
- correction factor · assert — Connor Griffin · 2026-09-03 · "Measured 1 U : 24.0
  mg/dL across 29 fasting nights against 1 U : 40 mg/dL programmed. Overnight you look more
  sensitive to insulin than the set value, so corrections can run a little
  stronger."
  `Measured 1 U : {estimate.value} mg/dL across {support.n} fasting nights against 1 U : {current} mg/dL programmed. {annotation}.`
- correction factor · held — Connor Griffin · 2026-09-03 · "29 fasting nights
  measured against 1 U : 40 mg/dL programmed, but rescue-carb history doesn't cover
  this window. No direction is called." (the held sentence prints no estimate:
  the showcase's held estimate is a fixture artifact of 0.0)
  `{support.n} fasting nights measured against 1 U : {current} mg/dL programmed, but {reason}. No direction is called.`
- carb ratio · assert — Connor Griffin · 2026-09-03 · "Measured 12 g/U across 8
  meal runs against 10 programmed. Meals look slightly over-covered relative to
  programmed I:C."
  `Measured {estimate.value} g/U across {support.n} meal runs against {current} programmed. {annotation}.`
- carb ratio · held — Connor Griffin · 2026-09-03 · "Measured 8 g/U across 8
  meal runs against 10 programmed. Held at current: pre-empted low." (the served
  hold reason `pre-empted low; held at current` reordered into a sentence, the
  operator's pick over printing the fragment verbatim)
  `Measured {estimate.value} g/U across {support.n} meal runs against {current} programmed. Held at current: {reason without its "; held at current" tail}.`
- event comparison · finding — Connor Griffin · 2026-09-03 · rendered against
  every lever the showcase publishes: "Showed up in 1 of 5 lows in this window,
  and ranks." (over_treated_low) · "Showed up in 1 of 5 lows in this window, not
  often enough to rank yet." (correction_on_iob) · "Showed up in 1 of 32 meals in
  this window, not often enough to rank yet." (meal_bolus_short)
  `Showed up in {appearances[0].n} of {appearances[0].m} {appearances[0].noun} in this window{, and ranks | , not often enough to rank yet}.` — the rank clause reads the served `tier`: `next_in_line` and `worth_a_look` rank, `noted` does not.
- past setting · history — Connor Griffin · 2026-09-03 · "Measured 12 g/U across
  14 meal runs while 12 was programmed, until 2024-06-16. Programmed now: 10."
  `Measured {estimate.value} g/U across {support} meal runs while {past_setting} was programmed, until {regime_end date}. Programmed now: {programmed_now}.`

## ADR 306 — The nameplate's editorial treatment is settled at the running app

**Decision.** The stage card's title gains editorial weight, so the bar it
lives in changes with it; no value of that treatment is chosen headless.
DESIGN.md's no-hero rule stays the cap and gains the one sentence that names
the stage card's headline as a card title under it, not a page headline. The
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

## QA budgets

Re-measured by sub-order 2 after the row change, per `AGENTS.md` "Maintaining
QA coverage eras" step 4, none raised: committed showcase size (≤25 MiB),
showcase drift (≤30 s), focused QA suite (≤90 s), slowest generated case
(≤15 s), full pytest (≤2.5× the chunk-1 baseline of 62.93 s, ceiling
157.33 s, last measured at 148.76 s in
`openspec/changes/archive/2026-09-02-qa-e2e-coverage-eras/coverage-appendix.md`):

- (pending)

`evidence/headline-facts.csv` and `evidence/headlines.authored.csv` are
generator-authored artifacts with no `--check`: the generator reads a served
app, which CI cannot start, so they are regenerated by hand from the serves
named in the generator's docstring and are not a drift gate. They sit under
`openspec/changes/`, outside the publishable tree, and their only consumer is
sub-order 2's implementer.

## Base story counts

Recorded by task 1.1 against the base worktree:

- `frontend/diagnose-workstation-behavior.replay.mjs`: 145 applicable stories, 145 passed, 0 failed, 0 opener problems, against the base worktree at `112ea3a694a28b6549f32708074973cd586d190e` (the ticket branch's merge-base with `origin/main`), served from its own scratch copy of `mockups/qa-e2e.synthetic/harmonic.sqlite` on port 8307 (`app: 145 of 145 stories passed`; the retired stories S33, S34, S35, S37, S38, S112 and S113 printed their sanctions and are not counted).
