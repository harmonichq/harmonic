# #454 design — Pattern mirror family filter, producer-shaped rows, and one served sentence

Sanction for every shipped-surface revision and ledger change here:
`Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R454`.
The coordinator's rulings on this change (2026-09-23): Q1 accept the four band moves;
Q2 re-claim the two correction-cluster rows for Correction stacking and list every
fact that moves; Q3 widen to the High anchor glucose; Q4 widen to the duplicated
sentence, served once, with ledger story S182; Q5 widen to the event-comparison
capture's comparison rows; Q2 limit, keep the re-claim to the rows themselves; Q6
widen to the browser gate's scoped Pattern list (freeze the server's list for each
window the browser checks use, pass it in, fail loudly for any other window, amend
the Afternoon fast-gate test to the server's answer, list every moved fact); Q6a
also freeze the narrowed-window Pattern case files, any other narrowed Pattern
request failing by name; Q7 add a fifth step that feeds the test desk the inputs
the Pattern lists and prices come from, so its queue order matches the server's
exactly, with the mirror check comparing order.

## Verified facts (origin/main b03431d2, 2026-09-23)

- **The backend's family rule.** `ciq_autotune/finding_case_file.py`
  `_pattern_case` sets `family = findings_projection.pattern_rate_family(pattern)`
  (the sixth column of `outcome_patterns._ROSTER`) and keeps
  `habits = [lever for each habit member if policy_for(lever).rate_family is family]`.
  That one list feeds the row verdict (`_pattern_verdicts(recorded, driver, None,
  habits)`) and the selected reason (`_pattern_reason(member, claimant, habits)`).
  Claims are separate: `credited_claims` over the Pattern's `rate_levers` still lets
  an out-of-family rate lever claim a row, and the reason then names it as the
  cause with no habit entry of its own. `tests/test_finding_case_file.py`
  (`_PATTERN_HABITS`) already pins this for Correction stacking.
- **Which members fall outside.** `policy_for(lever).rate_family`: Carb undercount,
  Late bolus, Meal over-delivery, Meal bolus fell short → meals; Over-treated low,
  Correction on active insulin → lows; Correction stacking → correction clusters;
  Missed / unannounced meal → highs; High-carb sequence, Repeat eating → none. The
  whole-day roster admits a habit member whenever a scenario row exists for its lever
  (`outcome_patterns._habit_members`), so Highs after meals can carry the two
  Sequence habits and Lows after correcting highs can carry Correction stacking.
- **The mirror.** `mockups/diagnose-event-comparison.synthetic/project.mjs`
  `projectPatternCaseFile` judges every habit member. Reproduced:
  `node --test docs/scope/454-mirror-family.repro.mjs` fails 2 of 2; over the same
  rosters `uv run python docs/scope/454-backend-family.repro.py` serves
  `['correction_on_iob']` and `['carb_undercount', 'late_bolus']`.
- **The unread table.** `generate.mjs` publishes a hand-written lever→family table
  as the capture's `pattern_families`; nothing reads it, it says highs for Meal bolus
  fell short where the backend says meals, and it omits three levers.
- **Real exposure-row shapes.** `explore_exposures.py` copies `kind`, `label`,
  `state` and `verdicts` from the episode view (`model_view._KIND_LABEL`: Low, Meal
  bolus, High, Correction) and `text` from the episode's first attributed step,
  whose text is the driving verdict's own `detail` (`attribute._step`). Per anchor
  kind the attribution step judges: a meal, Carb undercount, Late bolus and Meal
  over-delivery, always; a low, Over-treated low (absent only when split off or
  refuted) and Correction on active insulin, always; a high, Missed / unannounced
  meal and Meal bolus fell short (a rebound High instead carries one matched
  Over-treated low); a correction, only Correction stacking, on the stacking dose
  or the episode's last correction, and only when the episode holds two or more
  corrections. A claimed row's own lever therefore reads matched, and a low
  Correction on active insulin claims has Over-treated low unmatched. Silence
  reasons are the eight-member `SilenceReason`.
- **A correction row cannot be claimed by Correction on active insulin.**
  `_low_lever` is the only place that lever is judged, so its driver is always a low
  anchor. `_is_driver` marks an anchor as driving it only when that anchor's time
  equals the low's trigger time. `_correction_lever` (the only lever a correction
  anchor runs) returns Correction stacking alone, and `_is_driver` gives a
  correction anchor Correction stacking only when its bolus is the stacked pair's
  second dose. The producer claims a correction row for Correction stacking, never
  for Correction on active insulin.
- **The duplicated sentence is served.** A claimed row's `reason.cause.text` is the
  episode's first attributed step text (`claim_text`), and the claimant's habit
  entry `detail` is its recorded classifier sentence at that anchor
  (`_habit_entry`); `_step` makes both the same verdict `detail`. The desk prints
  both verbatim (`frontend/diagnose-workstation.js` `occurrenceFacts`: the cause
  line, then each habit line with its sentence). Measured in-process over the real
  producers on QA case stores: pattern-near-tie Highs after meals 3 of 3 claimed
  rows repeat the sentence, Carb undercount 3 of 3, Over-treated low 1 of 1;
  behavioral-correction-stacking Correction stacking 2 of 2, Missed / unannounced
  meal 1 of 1; showcase Over-treated low 1 of 1 and Correction on active insulin 1
  of 1 (Meal bolus fell short 0: its claimant serves no sentence there).
- **Manufactured rows.** `.claude/qa/gen_synthetic_fixtures.py` `build_exposures()`
  manufactures 46 exposure Occurrences through `occurrence()` (the committed feed is
  that fallback). Its case-file capture's claimed members carry a synthetic claim
  text different from their recorded sentence, a pairing the producer never serves.
  The event-comparison capture's lows comparison rows judge Correction stacking,
  which the attribution step never judges at a low.
- **High anchors** are the peak of a run reaching `ScenarioConfig.anchor_high_mgdl`
  (250 mg/dL).

## Every manufactured row, today and required

| Family | Rows (minute seeds) | Claim | Today | Required |
|---|---|---|---|---|
| lows | 15 (95…1075; 55, 365, 515, 755, 835) | Over-treated low | low · Low; Over-treated low matched; `iob_stacking`/`no_signal`; low-treatment sentence | Over-treated low matched, detail = text; Correction on active insulin calm; sentence kept |
| lows | 3 (410, 700, 1015) | Correction on active insulin | Over-treated low **matched**; `iob_stacking`; low-treatment sentence | Over-treated low calm; Correction on active insulin matched, detail = text; its own sentence |
| lows | 2 (160, 980) | none | Over-treated low unjudgeable; `iob_stacking` | both judged classifiers unjudgeable |
| meals | 2 (455, 780) | Late bolus | low · Low; Over-treated low matched; `iob_stacking`; low-treatment sentence | meal · Meal bolus; Late bolus matched, detail = text; Carb undercount and Meal over-delivery calm; late-bolus sentence |
| meals | 18 | none | low · Low; Over-treated low unjudgeable; `iob_stacking` | meal · Meal bolus; all three meal classifiers unjudgeable |
| highs | 3 (520, 830, 1200) | Missed / unannounced meal | low · Low; glucose 70–78; Over-treated low matched; `iob_stacking`; low-treatment sentence | high · High; glucose 250 + (draw − 58); Missed / unannounced meal matched, detail = text; Meal bolus fell short calm; missed-meal sentence |
| highs | 1 (1310, the #63 uncaused High) | none | low · Low; glucose 72; Over-treated low unjudgeable; `iob_stacking` | high · High; glucose as above; both high classifiers unjudgeable |
| correction clusters | 2 (610, 900) | Correction on active insulin → **Correction stacking** | low · Low; Over-treated low matched; `iob_stacking`; low-treatment sentence | correction · Correction; Correction stacking matched, detail = text; stacked-correction sentence |

"Calm" is `no_trigger` (observed); "unjudgeable" is `insufficient_data` (not in
data); a matched verdict keeps `inferred`. Every other field — time, date, dose,
carbs, worst reading, state, episode id — is unchanged, and no random draw is added,
removed or reordered. The case-file capture's claimed member carries its recorded
sentence as its claim text. The lows comparison view judges Over-treated low and
Correction on active insulin only.

**Row-level, not episode-level (coordinator ruling, Q2 limit).** The fixture
manufactures rows, each alone in its episode; no family's claimed row brings its
episode's other anchors (a Late bolus meal has no High beside it, an Over-treated
low no rebound). A real Correction stacking claim also emits the pair's first
correction as an unclaimed row and stamps the low it reached with Correction
stacking in `attributed_levers`. Whole episodes are not re-claimed. Adding those
siblings would move the twenty-row low population and add a claim to Lows after
correcting highs, which goes beyond the fixture-honesty defect this change fixes: a
row serving a kind, verdict, claim or cause text its producer never serves.

## ADR 454 — The fixture Pattern mirror judges only its rate family, from the backend's own table

**Decision.** `projectPatternCaseFile` keeps a habit member only when that lever's
rate family, read from the capture's `pattern_families`, equals the Pattern's
family, and uses that one list for the row verdict and the selected reason, as
`_pattern_case` does. `scripts/gen_findings_projection_fixtures.py` freezes the table
from `policy_for(lever).rate_family` for every Lever (value or null) as
`habit_rate_families` in `frontend/__fixtures__/findings-projection.json`;
`generate.mjs` publishes it as `pattern_families` and its hand table is deleted. The
same generator freezes `pattern_family_cases`: the Python producer's answers for
two real out-of-family rosters (Correction stacking under Lows after correcting
highs; High-carb sequence under Highs after meals), built from the browser inputs
plus one scenario Pattern. A node test holds the mirror to them.

**Why.** "Exactly as the backend does" is checkable only against the backend's
answer. A hand table would be a second transcription; generating the capture's
already-present, unread and partly wrong table replaces one instead.

**Considered.** A literal expected list: held the mirror to a belief, not the
producer. Filtering on `rate_levers`: wrong, since a rate lever may be out of family.

## ADR 454 — Manufactured rows take their producer's shapes

**Decision.** Every manufactured row carries the table's required shape. The four
Finding bands that move on their own claimed rows are accepted (Q1). The two
correction-cluster rows are claimed by Correction stacking (Q2), the cause the
producer gives a correction row. The High glucose is lifted (Q3). The case-file
capture's claimed members carry their recorded sentence as claim text, and the lows
comparison view judges only what a low is judged by (Q5).

**Why.** R454 puts every row carrying a kind, verdict or cause text the producer
never serves in scope. The producer always marks a claimed row's own verdict matched
and never claims a correction row for Correction on active insulin (verified facts).
The coordinator amended the issue's "no count moving elsewhere" boundary for exactly
the moves the Q2 re-claim causes, listed below.

**Considered.** Keeping the cluster claim and fixing only kind, verdicts and text:
still serves a claim no correction anchor can carry (Q2 ruled it out).

## ADR 454 — A claimed Occurrence's sentence is served once

**Decision.** The case-file producer serves the claimant's classifier sentence once:
on a claimed row, when the claimant's recorded sentence equals the cause's text, the
claimant's habit entry serves a null sentence. One rule covers single-habit and
Pattern case files (`_habit_reason`, `_pattern_reason`), and the fixture mirror
applies it too. The desk is unchanged: it prints what is served, so the claimant's
line reads its title and band label, and the sentence prints once, on the cause
line. Ledger story S182 proves it on pattern-near-tie.

**Why.** Grounded: the duplicate is served, not composed by the desk (two served
fields carry the same string), so the server is the one source to fix (Q4). An
equality rule prints each fact once and keeps any claimant sentence that says
something the cause does not.

**Considered.** Dropping the cause's text instead: the cause line is the
attribution's narrative and must stay non-empty wherever the claimant drove the
episode. A desk-side filter: a second rule over served text, which Q4 and the
"backend is the one source" invariant rule out.

## ADR 454 — The browser findings mirror serves the server's scoped Pattern list, or fails

**Grounded (base b03431d2).** `populateFindingsProjectionInput` supplies only the
whole-day roster (`browser_outcome_patterns`). For a scoped query the mirror reads
`outcome_patterns_by_window[window]`, and falls back to no Patterns at all when that
map is absent. So in every scoped browser window the fixture queue serves no Pattern
row and folds no cause. The server serves both Patterns there, with charts
(00:00–06:00: Highs after meals n 4 k 0, Lows after correcting highs n 8 k 0;
02:15–04:45: n 1 and 5; 12:00–18:00: n 7 k 1 and n 6 k 1), and folds Late bolus and
both correction Findings in 12:00–18:00. The browser checks request exactly three
scoped windows of the fixture mirror: `0-360` in the desk suite (its `prepare`
refuses any scope `finding-case-files.json` lacks, and that holds only `0-360`), and
`135-285` and `720-1080` in the fast gate. Every other mirror call uses the
projection fixture's own inputs, which carry their own per-window map.

**Decision.** The projection fixture generator freezes the server's scoped roster
(`browser_outcome_patterns_by_window`) and the server's queue shape
(`browser_window_queues`) for those three windows over the same browser inputs as
the whole-day roster. The browser population passes the map in, unless the caller
brings its own; the mirror throws, naming the window, when a supplied map lacks the
window. Because scoped Pattern rows now appear with charts, the browser population
builds their headers through the fixture Pattern case-file mirror, which answers
from the whole-day population (00:00–06:00 Highs after meals would read 2 of 20
where the server serves 0 of 4). So the generator also freezes the server's scoped
Pattern case files (`browser_pattern_cases_by_window`: clock and event, no
selection) and the Pattern mirror answers a scoped coordinate only from them. It
throws for any other scoped coordinate and for any scoped selection; no browser
check selects inside a scoped Pattern.

**Why.** Q6: freeze the server's answer for each window the browser checks use, and
fail loudly for any other. Freezing the scoped case files extends that ruling to the
headers the roster newly exposes; without it, the fix would swap a missing Pattern
for a Pattern with the wrong counts (coordinator confirmed, Q6a).

With the roster in, the mirror's Pattern rows, folds, counts and chip counts equal
the server's in all three windows, but row order does not until the ADR below
("The test desk projects the server's own inputs"). So sub-order 4's tests compare
rows as a set and sub-order 5 makes them ordered. The "After" column below gives
sub-order 4's rows; sub-order 5's table gives the final order.

**Moved facts (fixture mirror, browser windows; after the Q2 re-claim).**

| Window | Before | After (= server's rows, folds, counts, chips) |
|---|---|---|
| 00:00–06:00 | Over-treated low only; finding 1; chips highs 1 · lows 0 · meals 0 · corrections 0 | Highs after meals and Lows after correcting highs Patterns (charted; headers 0 of 4 meals and 0 of 8 lows) and Over-treated low; finding 3; chips 2 · 1 · 1 · 1 |
| 02:15–04:45 | Over-treated low only; finding 1; chips 1 · 0 · 0 · 0 | both Patterns (headers 0 of 1 meals, 0 of 5 lows) and Over-treated low; finding 3; chips 2 · 1 · 1 · 1 |
| 12:00–18:00 | Over-treated low, Correction on active insulin, Correction stacking, Late bolus, Missed meal, unfolded; finding 5; lows chip 2 | Highs after meals (folds Late bolus; header 1 of 7 meals), Lows after correcting highs (folds Correction on active insulin and Correction stacking; header 1 of 6 lows), Over-treated low, Missed meal; finding 4; chips 3 · 1 · 1 · 1 |

The Afternoon fast-gate test (12:00–18:00, Highs, Meals and Corrections chips) moves
from Over-treated low, Correction stacking, Late bolus, Missed meal to the server's
Highs after meals, Lows after correcting highs, Over-treated low, Missed meal, still
"4 in this window". The desk suite's Overnight test ("after a Day return, acting
inside Diagnose re-addresses it in place…") now shows both Patterns in the
00:00–06:00 queue while it holds its Over-treated low case; none of its assertions
reads the queue.

## ADR 454 — The test desk projects the server's own inputs

**Grounded (base b03431d2).** The browser population feeds the findings mirror the
payload's analysis and scenarios, which carry no tuning levers and price no habit
Pattern, while the Pattern rosters are built from the projection fixture's browser
analysis (with tuning levers) and browser scenarios (the projection's own plus a
Late bolus and a Correction on active insulin Pattern). The whole-day roster is also
built over exposures the payload does not carry: one unclaimed meal re-marked as
claimed by Meal over-delivery (`memberless_low`, #395). So the fixture queue prices
Patterns from one input and every other row from another. The desk reads the
scenarios payload only to record its age, and renders no tuning lever.

**Decision.** The projection generator freezes `browser_inputs` (the browser
analysis, browser scenarios and analysis generation) and builds every browser
roster and case from the payload's exposures unaltered, deleting the
`memberless_low` mutation. The browser population feeds the mirror those frozen
inputs and takes only exposures from the caller, and the desk suite's
`/api/analyze` and `/api/scenarios` stubs serve the same frozen inputs. The
generator freezes the server's full projection of them (`browser_windows`, whole day
and each frozen window), and the mirror must equal it byte for byte, order
included. Measured in scratch: all four answers are byte-equal.

**Why.** Q7: the test desk's queue order must be the server's. The mutation is the
one input difference left once the prices match: it makes the roster claim a meal
the queue's exposures never claim, and after this change's row shapes the claimed
row would carry an unmatched own verdict the producer never serves.

**Moved facts (fixture mirror, relative to sub-order 4).**

| Window | Row order before → after | Other moves |
|---|---|---|
| whole day | Highs after meals [Late bolus], Lows after correcting highs [Correction on active insulin, Correction stacking], Over-treated low, Missed meal, Basal 07:00 (basal:420-450), Lows after meals, Overnight lows → **Basal 07:00 (basal:420-450), Over-treated low**, Highs after meals […], Lows after correcting highs […], Missed meal, Lows after meals, Overnight lows | Basal 07:00 (basal:420-450) priority none → 39, tier noted → next in line; Over-treated low none → 28, Late bolus none → 18, Correction on active insulin none → 20, each noted → worth a look, headline "Not ranked in this window yet…" → "Ranks among this window's findings…"; Lows after meals k 1 → 0, rate 0.05 → 0, Wilson 0.0151–0.1532 → 0–0.0759 |
| 00:00–06:00 | Highs after meals, Lows after correcting highs, Over-treated low, … → **Over-treated low**, Highs after meals, Lows after correcting highs, … | Over-treated low priced 28, worth a look, "Ranks among…" (7 of 8 lows) |
| 02:15–04:45 | same reorder | Over-treated low priced 28, "Ranks among…" (4 of 5 lows) |
| 12:00–18:00 | Highs after meals […], Lows after correcting highs […], Over-treated low, Missed meal → **Over-treated low**, Highs after meals […], Lows after correcting highs […], Missed meal | Over-treated low 28, Late bolus 18, Correction on active insulin 20, each worth a look, "Ranks among…" |

Every window's `analysis_generation` becomes the frozen generation. Counts, chip
counts, folds and Pattern rows do not move.

**Tests whose expectation encoded the old prices, order or roster.**
- Fast gate: the Afternoon test (server order: Over-treated low, Highs after
  meals, Lows after correcting highs, Missed meal; "4 in this window").
- Fast gate: the join test's headline ("Ranks among this window's findings.
  Showed up in 1 of 10 lows in this window.").
- Fast gate: `#413 · an unpriced claimed member folds under the tail Pattern`,
  re-pointed to Correction stacking, the server's unpriced member.
- Backend: `tests/test_findings_projection.py`
  `test_memberless_patterns_keep_their_count_without_a_chart`, which read the
  committed browser roster's Lows after meals k > 0. It now builds its own memberless
  roster with k > 0 over a clone of the payload exposures through
  `build_outcome_patterns`, carrying the deleted mutation in the one test that needs
  it, in the shape the producer serves.

The `#395` mini-host test projects its own inputs directly, and its answer is
unchanged.

**The public-tree dose/ratio baseline (measured in scratch).** Of the files this
change touches, only `frontend/__fixtures__/findings-projection.json` carries
acknowledged entries (86 of the baseline). The generator writes it with sorted keys,
so every new top-level key that sorts before `inputs` shifts those entries' line
numbers. After sub-orders 1 and 2 the set is unchanged (86 entries, none added or
removed). Sub-order 3's `habit_rate_families` alone shifts 49 of them, and the
sub-order 4 and 5 keys shift all 86. So sub-orders 3, 4 and 5 each re-record the
baseline. Each of those workers reviews every added entry (all synthetic), lists
them in its result, and runs
`uv run python scripts/scan_public_tree.py <tree> --accept-dose-ratio-baseline`.
The coordinator reviews those lists at integration under Q3.

**Desk browser tests and replay stories, read for position or order.** None
encodes the old order:
- `.qrow[data-id^="pattern:"]` `.first()` (the Focus-read, grouped-comparison, c2
  and thin-basal tests) is Highs after meals before and after.
- `.qfold` `.first()` (c2) is Highs after meals' fold before and after. It now
  arrives closed, because Basal 07:00 (basal:420-450) is rank one, and the test already clicks a
  closed fold open.
- `.qrow[data-id]` `.first()` and `.qitem.member` `.first()` only wait.
- `openRailRow` opens every closed fold.
- By-id clicks (`finding:over_treated_low`) stay on an unclaimed row.
- `[data-event-view="glucose"]` marks the always-present workstation shell.
- The tests near `openRailRow`'s callers (lines 403, 466, 1234–1263) run on the
  eating-sequence fixture.
- No replay module imports the browser population or the findings mirror; the
  ledger replays QA case stores.
The one test file amended is `frontend/desk.browser.test.mjs`, and only its two
input stubs.

## Revise lifecycle record (sub-order 1)

- **Route.** Embodiment shipped, runnability runnable, declaration complete, data
  source manufactured → `revise`. The frozen behavior ledger
  (`mockups/harmonic-v2-desktop.behavior.md`) and its replay are the contract; no
  sweep is re-run.
- **Safe start.** AGENTS.md's QA copy-then-serve command, tokenless and
  `--no-fetch`, over a `scripts/gen_qa_e2e_db.py --case pattern-near-tie` store; the
  replay's `CASE_STORE_DIR` runs each story on a fresh copy.
- **Ledger.** A dated `## #454 amendment — 2026-09-23` section adds app-only S182
  (block S182) with the sanction line above; no story is amended or retired; no
  `★ FROZEN` block, header inventory line, ACCEPTANCE.md or INDEX.md is edited.
  Inventory on this branch: 172 issued · 153 active · 19 retired. `SMOKE_STORIES` is
  unchanged: `SmokeSelectionTest` passes on base with pattern-near-tie in the
  registry (S150), so the slice already covers the store.
- **Design record.** DESIGN.md and CONTEXT.md do not describe the selected block's
  sentence placement; they do not change.

## Measured facts (scratch regeneration, 2026-09-23)

`docs/scope/454-row-shapes.measure.py` over the committed payload and the candidate.
The Pattern roster, and every family tally except the correction clusters' cause,
are identical. Row order changes only by the Correction stacking row.

Every moved fact, by window (fired · outranked):

| Window | Moved |
|---|---|
| whole day | Late bolus 0·2 → 2·0; Missed / unannounced meal 0·3 → 3·0; Over-treated low 18·0 → 15·3; Correction on active insulin 0·20 → 3·15, episodes 5 → 3, appearances correction clusters + lows → lows, chips 2 → 1, count sentence "2 of 2 correction clusters" → "3 of 20 lows", headline likewise; **Correction stacking row added after it** ("Not ranked in this window yet. Showed up in 2 of 2 correction clusters", noted, folded under Lows after correcting highs) |
| 06:00–12:00 | Over-treated low 6·0 → 4·2; Late bolus 0·1 → 1·0; Missed meal 0·1 → 1·0; Correction on active insulin 0·7 → 2·4, episodes 3 → 2, lows only, "2 of 6 lows"; Correction stacking row added |
| 12:00–18:00 | Over-treated low 5·0 → 4·1; Late bolus 0·1 → 1·0; Missed meal 0·1 → 1·0; Correction on active insulin 0·6 → 1·4, episodes 2 → 1, lows only, "1 of 6 lows"; Correction stacking row added |
| 18:00–24:00 | Missed meal 0·1 → 1·0 |
| 04:30–08:00 | Over-treated low 4·0 → 3·1; Late bolus 0·1 → 1·0; Correction on active insulin 0·4 → 1·3 |
| 12:00–14:00 | Late bolus 0·1 → 1·0; Missed meal 0·1 → 1·0 |
| 14:00–16:00 | Correction on active insulin row **replaced** by the Correction stacking row ("1 of 1 correction clusters") |
| 14:00–21:00 | Over-treated low 3·0 → 2·1; Missed meal 0·1 → 1·0; Correction on active insulin 0·4 → 1·2, episodes 2 → 1, lows only, "1 of 4 lows"; Correction stacking row added |
| 12:00–15:00 (drawn) | Late bolus 0·1 → 1·0; Missed meal 0·1 → 1·0 |
| 00:00–06:00, 22:00–02:00, 03:00–04:00, 02:15–04:45 | nothing |

The JS findings mirror moves the same cells, rows and order, with one exception
the Q6 ADR above removes. In 06:00–12:00 and 12:00–18:00 the unscoped mirror leaves
the new row unclaimed (`counts.finding` 4 → 5, `chip_counts.lows` 1 → 2), where the
server folds it under Lows after correcting highs. The desk draws a case file's own
`verdict_counts`, never these queue-row bands.

Moved artifacts: `explore-exposures.capture.json`, `payload.json` and
`finding-case-files.json` among the workstation generator's seven files;
`findings-projection.json`'s `pattern_clock_case` (anchor kind meal; the late-bolus
sentence as cause text, served once), before sub-order 3's two added keys;
`capture.json`'s `pattern_populations` rows and `views` lows factors, before
`pattern_families` is replaced; the exploration's `focus.json`, `journey.json` and
`workstation.json`, by claimant sentences that became null.

In a scratch tree, 1008 of 1014 node fast-gate tests passed with all three widened
changes applied. The six failures are exactly the tests task 2.5 and task 1.5 amend:
the two #432 `diagnose-workstation` tests, the two S149/S150 helper tests
(`block432` printed "null"), the Afternoon queue test and the two-family join test.
The backend's `test_every_selected_reason_agrees_with_its_row` fails only for the
old sentence rule (task 1.2). Every other drift check stayed current, except the
basal-night check, which needs the `api` extra the scratch run lacked and reads no
case file. The Afternoon
queue still reads "4 in this window". The re-pointed join test's test-local
Over-treated low rebound High reproduces its assertions (projection order highs,
lows; the case file's lows appearance leads at 1 of 10; headline from the lead).

## Regeneration order and drift checks

One ordered pass reaches the fixed point (the chain reads in a cycle:
`gen_findings_projection_fixtures.py` reads `capture.json`'s first meal trace, and
`generate.mjs` reads `findings-projection.json`):

1. `uv run python .claude/qa/gen_synthetic_fixtures.py mockups/diagnose-workstation.synthetic`
2. `uv run python scripts/gen_findings_projection_fixtures.py`
3. `node mockups/diagnose-event-comparison.synthetic/generate.mjs --write`
4. `uv run python mockups/harmonic-v2.exploration/generate.py` (after any change
   under `ciq_autotune/`)

| Artifact | Moves | Check |
|---|---|---|
| `mockups/diagnose-workstation.synthetic/explore-exposures.capture.json`, `payload.json`, `finding-case-files.json` | rows; claimed members | `uv run python scripts/check_demo_fixtures.py` |
| `frontend/__fixtures__/findings-projection.json` | `pattern_clock_case`; `browser_outcome_patterns` (Lows after meals k 1 → 0); adds `habit_rate_families`, `pattern_family_cases`, `browser_outcome_patterns_by_window`, `browser_pattern_cases_by_window`, `browser_inputs`, `browser_windows` (sub-order 4's interim `browser_window_queues` is replaced by `browser_windows` in sub-order 5) | `uv run python scripts/gen_findings_projection_fixtures.py --check` |
| `mockups/diagnose-event-comparison.synthetic/capture.json` | `pattern_populations`, `views`, `pattern_families`; adds `pattern_cases_by_window` | `node mockups/diagnose-event-comparison.synthetic/generate.mjs --check` (also `acceptance.py`'s `event-drift`) |
| `mockups/harmonic-v2.exploration/focus.json`, `journey.json`, `workstation.json` | claimant sentences → null | `uv run python mockups/harmonic-v2.exploration/generate.py --check` |

| `scripts/public_scan_config.txt` (dose/ratio baseline block) | re-recorded by sub-orders 3, 4 and 5 | the public-tree line: `python3 scripts/build_public_tree.py "$t"`, `check_public_links.py`, `scan_public_tree.py` |

Unmoved and still checked: the workstation's other four generator files, the three
externally generated workstation captures, and every other `--check` generator.

## Readers, legs and stories

- Node fast gate: amended as tasks 1.5, 2.5, 4.4 and 5.3 list; new tests from 1.3,
  1.6, 3.5, 4.4 and 5.3.
- `frontend/desk.browser.test.mjs`: its `/api/analyze` and `/api/scenarios` stubs
  serve the frozen browser inputs (task 5.2); no assertion changes. The Q7 ADR lists
  every position-dependent locator and shows none changes target.
- `frontend/desk.browser.test.mjs` serves `payload.json`, `finding-case-files.json`,
  `capture.json` and `findings-projection.json` in every test; no assertion reads a
  moved field. Its Pattern-case tests — "a failed Focus read keeps a short visible
  Retry beside its explanation", "a grouped comparison owns its cohort label once",
  "c2 carries one Findings composition, Patterns and all basal slots" — at 1280x720
  and 1440x900.
- The desk suite's only scoped fixture window is 00:00–06:00, in "after a Day
  return, acting inside Diagnose re-addresses it in place, and its Findings address
  reloads with no case open" (one test); after Q6 its queue carries both Patterns.
- `frontend/follow-up.browser.test.mjs` and `frontend/browser-runner.browser.test.mjs`
  read none of them.
- Desk ledger replay (QA case stores; the served reason moves): S182 new; S25, S149
  and S150 render the selected reason and compare it with what is served; the
  complete ledger once per size.

## Risk contract

- **Must prevent:** a committed fixture that serves a kind, verdict, silence
  reason, claim, cause text or anchor glucose the producer cannot serve for its
  family; a mirror that passes its gate while diverging from the Python case
  producer (silent incorrect success); a served reason that drops a sentence saying
  something the cause does not; any count, claim, admission, queue order or sentence
  moving outside the enumerated moves; real or copied patient data in any fixture;
  any staging predicate, cap, floor or analyzer change.
- **Must recover:** none (build-time generation and a stateless served rule).
- **Accepted failure:** a drift check that fails because the chain was regenerated
  out of order; clear stop, rerun in the documented order.
- **Unsupported:** an out-of-family member in the committed browser roster (none;
  the frozen variants cover it); episode-level completeness of manufactured rows; a
  scoped browser window, scoped Pattern case or scoped Pattern selection that is not
  frozen (each fails by name).
- **Evidence owed:** the backend test over analyzer output that fails on base for
  the repeated sentence; the mirror's once-rule and family-parity tests that fail on
  base; the generator shape test that fails on base; S182 failing on base at its
  feature assertion and passing on the branch; the scoped-window parity test that
  fails on the base adapter; the ordered byte-parity test against the server's
  frozen projections that fails on the sub-order 4 adapter; every drift check green;
  the measurement matching the tables above.
- **Why:** the browser gates certify the advisory desk against these fixtures, and
  the served reason is advisory text on the shipped desk.
- **Disposition:** admitted with this change; the scope ledger
  (`docs/scope/454-fixture-meal-shapes.md`) keeps the session record.
