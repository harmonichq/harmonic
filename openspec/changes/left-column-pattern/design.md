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
  direction or lean and the steady-night count. The same form applies when the
  row's `estimate.value` is null with `current` set — a harm-forced move on
  zero clean nights (`HARM_LOWER`) publishes a programmed rate but no delivered
  estimate, so there is no delivered value to set against it (sub-order 2 found
  the state in the QA catalog's `basal-recurring-low-gate` shape; recorded here
  under the operator's 2026-09-03 delegation, "I'll take your recommendations
  going forth").

**Sentence order — verdict first (Connor Griffin · 2026-09-03).** The stage
card renders the served headline verbatim and styles its first sentence as the
title and the rest as the subtitle, so the templates below put the assessment
first and the measured facts second: "I think we need to flip the order of the
sentences to have the second sentence lead … Title is one cautious step down
and supported at this time. And the subtitle would be delivered below the
programmed rate across 30." The slot nameplate is furniture on the card, never
the star: "the user has picked that slot … the name of the slot is more
important than anything else — it's not right. It needs to be like furniture,
like a chip or a tile on the card." The per-family orderings below were
recorded under the operator's standing delegation ("I'll take your
recommendations going forth"); every slot is unchanged from the 2026-09-03
templates, only the order moves, and a one-sentence template (basal blind)
is its own title with no subtitle.

- basal · assert — Connor Griffin · 2026-09-03 · "One cautious step down is
  supported at this time. Delivered 0.48 U/h across 30 steady nights against
  0.60 programmed." (single-slot row); merged run, the showcase's
  `basal:180-240`: "One cautious step down is supported at this time.
  Delivered below the programmed rate across 30 steady nights."
  `{annotation}. Delivered {estimate.value} U/h across {support.n} steady nights against {current} programmed.`
  merged (`current` null) or no delivered estimate (`estimate.value` null): `{annotation}. Delivered {below|above by direction} the programmed rate across {support.n} steady nights.`
- basal · held — Connor Griffin · 2026-09-03 · "Not enough nights of steady
  data yet to point one way. Delivered 0.48 U/h across 7 steady nights against
  0.60 programmed."
  `{annotation}. Delivered {estimate.value} U/h across {support.n} steady nights against {current} programmed.`
  merged (`current` null) or no delivered estimate: `{annotation}. Delivered {below|above by lean} the programmed rate across {support.n} steady nights.`; a held run with no lean (`lean` null: its estimate sits at the programmed rate, or is absent) states only the count: `{annotation}. {support.n} steady nights delivered so far.`
- basal · blind — Connor Griffin · 2026-09-03 · "No steady nights delivered
  against the programmed rate here, so nothing to say either way." (one
  sentence: the title, no subtitle)
  `No steady nights delivered against the programmed rate here, so nothing to say either way.`
- correction factor · assert — Connor Griffin · 2026-09-03 · "Overnight you
  look more sensitive to insulin than the set value, so corrections can run a
  little stronger. Measured 1 U : 24.0 mg/dL across 29 fasting nights against
  1 U : 40 mg/dL programmed."
  `{annotation}. Measured 1 U : {estimate.value} mg/dL across {support.n} fasting nights against 1 U : {current} mg/dL programmed.`
- correction factor · held — Connor Griffin · 2026-09-03 · "No direction is
  called: rescue-carb history doesn't cover this window. 29 fasting nights
  measured against 1 U : 40 mg/dL programmed." (the held sentence prints no
  estimate: the showcase's held estimate is a fixture artifact of 0.0)
  `No direction is called: {reason}. {support.n} fasting nights measured against 1 U : {current} mg/dL programmed.`
- carb ratio · assert — Connor Griffin · 2026-09-03 · "Meals look slightly
  over-covered relative to programmed I:C. Measured 12 g/U across 8 meal runs
  against 10 programmed."
  `{annotation}. Measured {estimate.value} g/U across {support.n} meal runs against {current} programmed.`
- carb ratio · held — Connor Griffin · 2026-09-03 · "Held at current:
  pre-empted low. Measured 8 g/U across 8 meal runs against 10 programmed."
  (the served hold reason `pre-empted low; held at current` reordered into a
  sentence, the operator's pick over printing the fragment verbatim)
  `Held at current: {reason without its "; held at current" tail}. Measured {estimate.value} g/U across {support.n} meal runs against {current} programmed.`
- event comparison · finding — Connor Griffin · 2026-09-03 · rendered against
  every lever the showcase publishes: "Ranks among this window's findings.
  Showed up in 1 of 5 lows in this window." (over_treated_low) · "Not ranked in
  this window yet. Showed up in 1 of 5 lows in this window." (correction_on_iob)
  · "Not ranked in this window yet. Showed up in 1 of 32 meals in this window."
  (meal_bolus_short)
  `{Ranks among this window's findings | Not ranked in this window yet}. Showed up in {appearances[0].n} of {appearances[0].m} {appearances[0].noun} in this window.` — the verdict sentence reads the served `tier`: `next_in_line` and `worth_a_look` rank, `noted` does not. Amended by the coordinator on 2026-09-03 under the operator's delegation after the chunk-5 review: the earlier "Recurring often enough to rank" / "Not often enough to rank yet" stated a recurrence frequency the analyzer never published (a finding's tier is its scenario price, not a count), which the risk contract lists as must-prevent; the sentence now states only the published rank.
- past setting · history — Connor Griffin · 2026-09-03 · "Past setting, no
  change suggested. Measured 12 g/U across 14 meal runs while 12 was
  programmed, until 2024-06-16. Programmed now: 10."
  `Past setting, no change suggested. Measured {estimate.value} g/U across {support} meal runs while {past_setting} was programmed, until {regime_end date}. Programmed now: {programmed_now}.`

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

**Nameplate rulings.** Appended by the executing session from the attended
revise round of 2026-09-03, run on the base (port 8307) and the revision (port
8308) served side by side from the same synthetic showcase, with a throwaway
wireframe under `wireframe/` (marked not lockable, deleted when the change
lands) drawing the concepts at the 1440 and 1280 card widths:

- Round 1 · the bar the headline lives in — Connor Griffin · 2026-09-03 · ruled
  A′, "identity first": "I like A, but … the kicker should take priority in the
  sentence because the kicker is factual … the sentence is more of the
  assessment"; "the facts are the most important part. The graph supports the
  facts, the sentence embellishes them." The short nameplate (`descriptor.title`)
  leads the stage card as a kicker at the app's Title style (700, 1.02rem,
  -.01em), the served sentence follows at 17px/500 in full ink, wrapping under
  the 1.5rem cap; the chart's subtitle (`tile-meta`) is dropped from the stage
  bar — "What is the meta doing? Is it doing anything that just reading the
  chart wouldn't do?" — because the plot's axis labels and legend already carry
  it, and the tile rule is one fact in one place. The slot-as-chip concept was
  declined ("overuse of chips feels cheap"), and the sentence keeps its weight
  by rank, not size: "I don't necessarily think the sentence loses the weight.
  I just think we're redistributing the weight." Rejected: A (assessment
  outranks identity, meta repeats the plot), B (one micro-caps line runs long
  on other families), C (chip). Cost accepted: none of the plot; the bar is
  66px at 1440 against the first pass's 59px.
- Round 2 · the typography — Connor Griffin · 2026-09-03 · "the user has picked
  that slot. You do not need to then make the title the most important thing …
  the name of the slot is more important than anything else — it's not right.
  It needs to be like furniture, like a chip or a tile on the card, something
  like that … it needs to not be the star of the show. I think we need to flip
  the order of the sentences to have the second sentence lead. So bigger text,
  stronger font … Title is 'one cautious step down and supported at this time'.
  And the subtitle would be 'delivered below the programmed rate across 30'."
  The stage card's head is three ranks, top to bottom: the slot nameplate
  (`descriptor.title`) as furniture in the app's own Label style (700,
  `--ck-micro`, `--ck-track`, uppercase, `--mk-muted`) — no border, no chip,
  because a chip was already declined in round 1; the served headline's first
  sentence as the card title at Title rank (1.14rem/700, -.01em, `--mk-text`,
  wrapping); the remainder of that same headline as the subtitle at Body rank
  (.9rem/400, line-height 1.45, `--mk-muted`, wrapping), omitted entirely when
  the headline is one sentence. The chart's `tile-meta` stays off the stage,
  round 1's ruling standing. The frontend cuts the served string at its first
  sentence end and composes nothing: which sentence carries the verdict is the
  server's business, and the flip to verdict-first is recorded under
  "## Headline templates" by the coordinator. Computed bar ≈ 72px at the 1440
  focal width with a one-line title and subtitle, ≈ 96px at 1280 where the
  correction-factor title takes a second line, ≈ 48px for a one-sentence
  headline. Rejected this round: K-a (identity at Stat rank — makes the slot
  name the star), K-b (identity as a stamped plate over a hairline — still
  spends the head's structure on the slot name), K-c (identity as a headword
  leading the sentence — same fault on one baseline). Rejected in round 1: A
  (meta repeats the plot), B (one micro-caps line runs long on other families),
  C (chip). This ruling supersedes round 1's rank ordering: identity no longer
  leads the head, it furnishes it, and the assessment is the title.

- Round 3 · the fullscreen control — Connor Griffin · 2026-09-03 · "The
  maximize button on the header should still live where it was living." The
  focal head aligns its items to the top, so the control sits at the far end
  of the first line exactly where the one-line bar kept it, rather than
  centring in the two-line bar.

## QA budgets

Re-measured by sub-order 2 after the row change, per `AGENTS.md` "Maintaining
QA coverage eras" step 4, none raised: committed showcase size (≤25 MiB),
showcase drift (≤30 s), focused QA suite (≤90 s), slowest generated case
(≤15 s), full pytest (≤2.5× the chunk-1 baseline of 62.93 s, ceiling
157.33 s, last measured at 148.76 s in
`openspec/changes/archive/2026-09-02-qa-e2e-coverage-eras/coverage-appendix.md`):

| Budget | Measured | Limit |
| --- | ---: | ---: |
| Committed showcase database size | 2 MiB (`du -m`) | 25 MiB |
| Showcase logical drift check | 0.15 s (`gen_qa_e2e_db.py --check`) | 30 s |
| Focused QA suite (63 tests, `test_qa_e2e_cases.py` + `test_gen_qa_e2e_db.py`) | 15.71 s (`real`) | 90 s |
| Slowest `test_case_*`/catalog call | 2.41 s call (`test_showcase_exact_rest_windows_and_history_series_are_load_bearing`) | 15 s |
| Whole pytest (`real`) | 65.66 s against the chunk-1 baseline 62.93 s; ceiling 157.33 s (2187 passed, 1 skipped) | 2.5× baseline |

Every value is inside its limit; none raised.

Re-measured by sub-order 5 after the headline sentence-order flip, per
`AGENTS.md` "Maintaining QA coverage eras" step 4, none raised:

| Budget | Measured | Limit |
| --- | ---: | ---: |
| Committed showcase database size | 2 MiB (`du -m`) | 25 MiB |
| Showcase logical drift check | 0.15 s (`gen_qa_e2e_db.py --check`) | 30 s |
| Focused QA suite (63 tests, `test_qa_e2e_cases.py` + `test_gen_qa_e2e_db.py`) | 15.78 s (`real`) | 90 s |
| Slowest `test_case_*`/catalog call | 2.41 s call (`test_case_showcase` / `test_showcase_exact_rest_windows_and_history_series_are_load_bearing`, tied) | 15 s |
| Whole pytest (`real`) | 66.13 s against the chunk-1 baseline 62.93 s; ceiling 157.33 s (2188 passed, 1 skipped) | 2.5× baseline |

Every value is inside its limit; none raised.

`evidence/headline-facts.csv` and `evidence/headlines.authored.csv` are
generator-authored artifacts with no `--check`: the generator reads a served
app, which CI cannot start, so they are regenerated by hand from the serves
named in the generator's docstring and are not a drift gate. They sit under
`openspec/changes/`, outside the publishable tree, and their only consumer is
sub-order 2's implementer.

## Base story counts

Recorded by task 1.1 against the base worktree:

- `frontend/diagnose-workstation-behavior.replay.mjs`: 145 applicable stories, 145 passed, 0 failed, 0 opener problems, against the base worktree at `112ea3a694a28b6549f32708074973cd586d190e` (the ticket branch's merge-base with `origin/main`), served from its own scratch copy of `mockups/qa-e2e.synthetic/harmonic.sqlite` on port 8307 (`app: 145 of 145 stories passed`; the retired stories S33, S34, S35, S37, S38, S112 and S113 printed their sanctions and are not counted).
