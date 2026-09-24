# #454 design — fixture Pattern mirror family filter and real-shaped manufactured rows

## Verified facts (origin/main b03431d2, 2026-09-23)

- **The backend's rule.** `ciq_autotune/finding_case_file.py` `_pattern_case` sets
  `family = findings_projection.pattern_rate_family(pattern)` (the sixth column of
  `outcome_patterns._ROSTER`) and keeps
  `habits = [lever for each habit member if policy_for(lever).rate_family is family]`.
  That one list feeds the row verdict (`_pattern_verdicts(recorded, driver, None,
  habits)`) and the selected reason (`_pattern_reason(member, claimant, habits)`).
  Claims are separate: `credited_claims` over the Pattern's `rate_levers` still lets
  an out-of-family rate lever claim a row, and the reason then names it as the
  cause with no habit entry of its own. `tests/test_finding_case_file.py`
  (`_PATTERN_HABITS`) already pins this for Correction stacking under Lows after
  correcting highs.
- **Which members fall outside.** `policy_for(lever).rate_family` is the policy's
  recurrence family, else the Exposure its recurrence noun names, else none:
  Carb undercount, Late bolus, Meal over-delivery and Meal bolus fell short → meals;
  Over-treated low and Correction on active insulin → lows; Correction stacking →
  correction clusters; Missed / unannounced meal → highs; High-carb sequence and
  Repeat eating → none. So Highs after meals (meals) drops High-carb sequence and
  Repeat eating, and Lows after correcting highs (lows) drops Correction stacking.
  The whole-day roster admits a habit member whenever a scenario row exists for its
  lever (`outcome_patterns._habit_members`), so both happen on real data.
- **The mirror.** `mockups/diagnose-event-comparison.synthetic/project.mjs`
  `projectPatternCaseFile` builds `habits` from every `kind === 'habit'` member and
  feeds it to `patternOccurrence` (verdict and reason). Reproduced:
  `node --test docs/scope/454-mirror-family.repro.mjs` fails 2 of 2 (the selected
  reason lists `correction_stacking`, and `high_carb_sequence`); over the same
  rosters `uv run python docs/scope/454-backend-family.repro.py` serves
  `['correction_on_iob']` and `['carb_undercount', 'late_bolus']`.
- **The unread table.** `generate.mjs` publishes a hand-written lever→family table
  as the capture's `pattern_families`; no code reads it (repository-wide search),
  it says highs for Meal bolus fell short where the backend says meals, and it has
  no entry for Missed / unannounced meal, High-carb sequence or Repeat eating.
- **The existing parity mechanism.** `frontend/browser-fixture-population.test.js`
  deep-compares the mirror's selected Highs after meals clock case with
  `findings-projection.json`'s `pattern_clock_case`, which
  `scripts/gen_findings_projection_fixtures.py` freezes through the Python
  `PreparedCases.case`.
- **The real exposure-row shapes.** `ciq_autotune/explore_exposures.py` copies each
  row's `kind`, `label`, `state` and `verdicts` from the episode view
  (`analyzers/scenario/model_view.py`: labels Low, Meal bolus, High, Correction) and
  its `text` from the episode's first attributed step, whose text is the driving
  classifier verdict's own `detail` (`attribute._step`). The attribution step
  judges, per anchor kind (`attribute.py` `_meal_lever`, `_low_lever`,
  `_high_lever`, the correction-cluster branch): a meal, Carb undercount, Late
  bolus and Meal over-delivery, always all three; a low, Over-treated low (absent
  only when split off or refuted) and Correction on active insulin, always; a
  high, Missed / unannounced meal and Meal bolus fell short (a rebound High instead
  carries one matched Over-treated low and is claimed by it); a correction, only
  Correction stacking, and only when its episode holds two or more corrections. A
  claimed row's own lever therefore always reads matched, and a low Correction on
  active insulin claims has Over-treated low unmatched (Over-treated low precedes
  it and would have claimed the low). Silence reasons are the eight-member
  `SilenceReason`. A correction anchor is a single correction bolus; it drives
  Correction on active insulin only if its time equals a low's, which the feed does
  not produce in practice.
- **The manufactured rows.** `.claude/qa/gen_synthetic_fixtures.py`
  `build_exposures()` manufactures 46 exposure Occurrences through `occurrence()`,
  and the committed feed is that fallback (the production reader over the
  manufactured trace lacks the replay shapes). `finding-case-files.json`'s Members
  are built through real Opportunities and lever-consistent recorded verdicts and
  are not in question; `explore-day`, `settings-audit` and `ic-blocks*` carry no
  kind, verdict or cause text.
- **High anchors.** A High anchor is the peak of a run that reaches
  `ScenarioConfig.anchor_high_mgdl` (250 mg/dL).

## Every manufactured row, today and required

| Family | Rows (minute seeds) | Claim | Today | Required |
|---|---|---|---|---|
| lows | 15 (95…1075; 55, 365, 515, 755, 835) | Over-treated low | low · Low; Over-treated low matched; `iob_stacking`/`no_signal`; low-treatment sentence | Over-treated low matched, its detail = text; Correction on active insulin calm; sentence kept |
| lows | 3 (410, 700, 1015) | Correction on active insulin | Over-treated low **matched**; `iob_stacking`; low-treatment sentence | Over-treated low calm; Correction on active insulin matched, detail = text; correction-on-active-insulin sentence |
| lows | 2 (160, 980) | none | Over-treated low unjudgeable; `iob_stacking` | both judged classifiers unjudgeable |
| meals | 2 (455, 780) | Late bolus | low · Low; Over-treated low matched; `iob_stacking`; low-treatment sentence | meal · Meal bolus; Late bolus matched, detail = text; Carb undercount and Meal over-delivery calm; late-bolus sentence |
| meals | 18 | none | low · Low; Over-treated low unjudgeable; `iob_stacking` | meal · Meal bolus; all three meal classifiers unjudgeable |
| highs | 3 (520, 830, 1200) | Missed / unannounced meal | low · Low; glucose 70–78; Over-treated low matched; `iob_stacking`; low-treatment sentence | high · High; glucose ≥ 250; Missed / unannounced meal matched, detail = text; Meal bolus fell short calm; missed-meal sentence |
| highs | 1 (1310, the #63 uncaused High) | none | low · Low; glucose 72; Over-treated low unjudgeable; `iob_stacking` | high · High; glucose ≥ 250; both high classifiers unjudgeable |
| correction clusters | 2 (610, 900) | Correction on active insulin | low · Low; Over-treated low matched; `iob_stacking`; low-treatment sentence | correction · Correction; no verdict (each is alone in its episode); claim kept; correction-on-active-insulin sentence |

"Calm" is `no_trigger` (observed); "unjudgeable" is `insufficient_data` (not in
data); a matched verdict keeps `inferred`. Every other field — time, date, dose,
carbs, worst reading, state, claim, attributed levers, cause title, episode id — is
unchanged, and no random draw is added, removed or reordered, so no other
manufactured value moves.

## ADR 454 — The fixture Pattern mirror judges only its rate family, from the backend's own table

**Decision.** `projectPatternCaseFile` keeps a habit member only when that lever's
rate family, read from the capture's `pattern_families`, equals the Pattern's
family, and uses that one list for the row verdict and the selected reason, as
`_pattern_case` does. `scripts/gen_findings_projection_fixtures.py` freezes the
table from `policy_for(lever).rate_family` for every Lever (value or null) as
`habit_rate_families` in `frontend/__fixtures__/findings-projection.json`;
`generate.mjs` publishes it as the capture's `pattern_families` and its
hand-written table is deleted. The same generator freezes, as
`pattern_family_cases`, the Python producer's answer for two real out-of-family
rosters, built from the browser inputs plus one scenario Pattern for the extra
lever exactly as `docs/scope/454-backend-family.repro.py` does: Correction stacking
under Lows after correcting highs, and High-carb sequence under Highs after meals.
Each case freezes the roster row, the whole clock case and the clock case selected
at the first population Occurrence. A node test runs the mirror over the committed
capture with that roster row swapped in and requires the same verdict counts, the
same verdict and member per row in order, and the same selected reason.

**Why.** "Exactly as the backend does" is checkable only against the backend's
answer. A hand table in the mirror would be a second transcription of the policy;
the capture already carries a hand table that nothing reads and that is wrong for
Meal bolus fell short, so generating it replaces one transcription instead of
adding one. The two variants cover both ways a member falls outside: counted in
another family, and counted in none.

**Considered.** A literal expected list in the node test: held the mirror to a
belief, not to the producer. Filtering on `rate_levers`: wrong, since a rate lever
may be out of family (Correction stacking is both).

## ADR 454 — Manufactured exposure rows take the real feed's shapes

**Decision.** Every manufactured exposure row carries the table's required shape.
A claimed row's own verdict reads matched, so four Finding verdict bands move on
their own claimed rows and nowhere else (measured below); they are recorded, not
avoided. The two correction-cluster rows keep their Correction on active insulin
claim, with a correction's kind, label, empty verdict list and a
correction-on-active-insulin sentence. The High rows' anchor glucose is derived
from the existing draw at or above 250 mg/dL.

**Why.** R454 puts every row carrying a kind, verdict or cause text the producer
never serves in scope. The producer always carries a claimed row's own verdict
matched, so no real shape keeps a claimant reading Outranked on its own Finding,
which is what the fixture served; those cells are the rows' own verdicts, and every
other count stays put. Re-attributing the correction clusters to Correction
stacking was measured: it moves the queue order in three windows and the
Correction on active insulin Finding's episodes (5 → 3), chips, count sentences
and headline, which the issue forbids; kind, verdicts and text are what the ruling
names, and all three are fixed. A High anchor at 70–78 mg/dL is not servable, and
lifting it moves nothing (measured).

**Coordinator confirmations owed (triage defaults).** Q1 accepts the four band
moves; Q2 keeps the cluster claim; Q3 widens #454 to the High glucose. A different
ruling amends this record and the lock before it is posted.

## Measured facts (scratch regeneration of the required shapes, 2026-09-23)

`docs/scope/454-row-shapes.measure.py` over the committed payload and the
candidate: family tallies, the Pattern roster (members, k, n, admission, collapse)
and every window's row order are identical; every other row field is identical
except these verdict bands. Whole day:

| Finding | Before | After |
|---|---|---|
| Late bolus | 0 fired · 2 outranked | 2 fired · 0 outranked |
| Missed / unannounced meal | 0 fired · 3 outranked | 3 fired · 0 outranked |
| Correction on active insulin | 0 fired · 20 outranked | 3 fired · 17 outranked |
| Over-treated low | 18 fired · 0 outranked | 15 fired · 3 outranked |

The windowed projections move the same rows' cells only. The JS findings mirror
over the two payloads moves exactly the same cells. The desk never draws these
queue-row bands: it draws a case file's own `verdict_counts`, and the browser
population replaces the row's bands with the preparation's. The implementation
re-runs the script on its own regeneration and records the output here.

In the regenerated chain: only `explore-exposures.capture.json` and `payload.json`
move among the generator's seven files; in `findings-projection.json` only
`pattern_clock_case` moves (anchor kind meal; the late-bolus sentence as cause text;
each habit's sentence where it agrees), before this change's two added keys; in
`capture.json` only `pattern_populations` rows' kind, text, verdicts (and High
anchor glucose) move, before `pattern_families` is replaced. The node fast gate
passed 1013 of 1014: `#432 · a selected Pattern Occurrence lists each served habit
with its band label` pins habit lines without sentences, and now serves them. Its
Late bolus line repeats the cause sentence, because production serves the
claimant's recorded sentence and the cause text from the same verdict detail. The
exploration drift check stayed current.

## Regeneration order and drift checks

The chain has a read cycle (`gen_findings_projection_fixtures.py` reads
`capture.json`'s first meal trace; `generate.mjs` reads `findings-projection.json`),
and one ordered pass reaches its fixed point:

1. `uv run python .claude/qa/gen_synthetic_fixtures.py mockups/diagnose-workstation.synthetic`
2. `uv run python scripts/gen_findings_projection_fixtures.py`
3. `node mockups/diagnose-event-comparison.synthetic/generate.mjs --write`

| Artifact | Moves | Check |
|---|---|---|
| `mockups/diagnose-workstation.synthetic/explore-exposures.capture.json` | rows | `uv run python scripts/check_demo_fixtures.py` |
| `mockups/diagnose-workstation.synthetic/payload.json` | `exposures` rows | same |
| `frontend/__fixtures__/findings-projection.json` | `pattern_clock_case`; adds `habit_rate_families`, `pattern_family_cases` | `uv run python scripts/gen_findings_projection_fixtures.py --check` |
| `mockups/diagnose-event-comparison.synthetic/capture.json` | `pattern_populations`, `pattern_families` | `node mockups/diagnose-event-comparison.synthetic/generate.mjs --check` (also `acceptance.py`'s `event-drift` step) |

Unmoved and still checked: the workstation's other five generator files, the three
externally generated workstation captures, every other `--check` generator (none
reads these files) and `mockups/harmonic-v2.exploration/generate.py --check`.

## Readers of the moved artifacts

- Node fast gate: `browser-fixture-population`, `diagnose-workstation`,
  `diagnose-event-comparison`, `diagnose-evidence-charts`,
  `diagnose-findings-queue`, `diagnose-workstation-chart`,
  `finding-case-file-validation`, `findings-projection-mirror`, `changes` and
  `c4.replay` tests; one amended.
- `frontend/desk.browser.test.mjs` serves `payload.json`, `capture.json` and
  `findings-projection.json` through `frontend/browser-fixture-population.js` in
  every test; no assertion reads a moved field. The tests that drive a Pattern
  case file: "a failed Focus read keeps a short visible Retry beside its
  explanation", "a grouped comparison owns its cohort label once", "c2 carries one
  Findings composition, Patterns and all basal slots" (each at 1280x720 and
  1440x900).
- `frontend/follow-up.browser.test.mjs` and
  `frontend/browser-runner.browser.test.mjs` read none of them.
- The desk ledger replay runs on QA case stores and reads none of them; no story is
  added or amended (block S182 unused).

## Risk contract

- **Must prevent:** a committed fixture that serves a kind, verdict, silence
  reason, cause text or anchor glucose the real producer cannot serve for its
  family; a mirror that passes its gate while diverging from the Python case
  producer (silent incorrect success); any count, claim, admission, queue order or
  sentence moving outside the enumerated band cells; real or copied patient data in
  any fixture; any change under `ciq_autotune/`.
- **Must recover:** none (build-time fixture generation, no runtime path).
- **Accepted failure:** a drift check that fails because the chain was regenerated
  out of order; clear stop, rerun in the documented order.
- **Unsupported:** an out-of-family member in the committed browser roster (none
  today; the frozen variants cover it); the event-comparison capture's
  exploration-only `views`.
- **Evidence owed:** a node test through `projectPatternCaseFile` that fails on the
  base mirror against the frozen Python answers; a Python test through the
  generator's committed output that fails on the base rows; every drift check
  green; the measurement's before/after recorded here.
- **Why:** the browser gates certify the advisory desk against these fixtures; a
  fixture the producer cannot emit certifies a state no user can reach.
- **Disposition:** admitted with this change; the scope ledger
  (`docs/scope/454-fixture-meal-shapes.md`) keeps the session record.
