# #432 design

## Verified grounding (2026-09-23, base a4d374a7)

- **The row slot is anchor glucose, and a meal anchor has none.** The case roster
  and the response-comparison roster in `frontend/diagnose-workstation.js` print
  `anchor.bg`, or a dash when it is null, then the fixed `anchor.label`. The anchor
  model (`ciq_autotune/analyzers/scenario/anchors.py`) documents that a bolus
  anchor carries no glucose. `finding_case_file._occurrence` serves only
  `anchor.bg`; single-habit rosters take it from `opportunities.Opportunity`, where
  meal and correction-cluster opportunities never set it, and Pattern rosters copy
  the exposure Occurrence's `bg`, which is null for meal and correction anchors.
- **The facts already exist upstream.** The model-view anchor
  (`model_view._build_episode_view`) carries the anchor bolus's `insulin` and
  `carbs`; the exposure Occurrence (`explore_exposures.build_exposures`) copies
  only `bg`, but it does carry `verdicts` (each classifier's `matched`, `detail`
  sentence, `evidence_tier`, `silence_reason`), `cause_lever`, `cause_title` and
  the cause `text`. Meal opportunities carry their bolus in `members`; correction
  clusters carry both corrections. Every recorded classifier name is a `Lever`
  value (`attribute.py`), so `levers.title` names each one.
- **The episode "worst" reading is not a meal peak.** `severity.worst_bg` returns
  the episode's lowest reading whenever it went below range. On the showcase, 3 of
  the 32 meal episodes report a value below 70.
- **A meal's peak already has one owner.** CONTEXT.md defines the **Post-meal
  arc**, **Arc peak** and **Arc nadir**, and `ciq_autotune/outcomes_trend.py`
  computes them (`_meal_arc`, read through `meal_measurements`, which follow-up
  comparison also consumes and reads by key). The arc truncates at the next meal
  under the same `anchors._is_meal` predicate that defines the meal Occurrence
  population. `meal_measurements` returns no reading times and needs a bolus
  object for the meal's starting glucose.
- **Meal bolus short is judged at the rise, not at the meal.** Meal anchors carry
  `carb_undercount`, `late_bolus` and `meal_over_delivery` verdicts;
  `meal_bolus_short` and `missed_meal` are recorded on the High anchor, and the
  meal roster joins them by occurrence id. Correction-cluster exposure rows carry
  no verdicts; `_population` computes `classify_correction_stacking` per cluster.
- **Three fixtures hid the dash.** `tests/test_finding_case_file.py` hand-sets
  `"bg": 120` on meal Occurrences; `.claude/qa/gen_synthetic_fixtures.py` builds
  meal Opportunities with anchor glucose 130 and correction clusters with 175 for
  `mockups/diagnose-workstation.synthetic/finding-case-files.json`, and its
  manufactured exposure rows (the committed `explore-exposures.capture.json` uses
  them) give every family, meals included, `kind: 'low'` and a low-range glucose;
  `mockups/diagnose-event-comparison.synthetic/generate.mjs` copies that glucose
  into `pattern_populations`, which `project.mjs` serves as Pattern case-file rows
  to the browser gates.
- **Two desk stories pin the retired copy.** S25 (`frontend/c2.replay.mjs`)
  asserts the "N glucose readings" and "N event markers" lines; S107
  (`frontend/c4.replay.mjs`, with its node test in `frontend/c4.replay.test.js`)
  asserts every meal row description contains "Completed carb bolus".
  `frontend/diagnose-workstation.test.js` pins the canvas sentence.

## ADR 432 — A meal Occurrence is read by its bolus and its post-meal arc

**Decision.** Every case-file Occurrence serves its anchor bolus's delivered dose
and carbs beside the anchor glucose it already serves. A meal Occurrence also
serves one outcome reading: its **Arc peak** when the case file judges a high
outcome, its **Arc nadir** when it judges a low one, with the reading's time and
its minutes after the bolus. The direction is `levers.outcome_kind` of the case
file's lever; a Pattern uses the population lever its case file already resolves,
so Highs after meals reads peaks and Lows after meals reads nadirs. The arc is
computed by `outcomes_trend`'s existing arc implementation, exposed through one
public per-meal read that `meal_measurements` also uses, over the readings the
analyzer judged (confirmed false lows removed, the case file's `sequence_cgm`),
truncated at the next meal among the window's `_is_meal` boluses. An arc half with
no reading, or an Arc nadir whose window does not qualify, serves no outcome.
Lows and highs keep their anchor glucose, which already is their outcome.
Correction clusters serve the second correction's dose; they serve no outcome.

**Why.** The meal's own facts are what tell one row from the next, and the arc is
the product's existing definition of how high a meal went. Reusing it keeps one
fact with one implementation.

**Rejected.** The episode "worst" reading: it is a nadir on any episode that went
low. A peak over the case file's comparison window (−60 to +300 minutes): a second
peak definition that reads past the next meal and diverges from the Arc peak.
Relabelling the dash: honest but still names nothing.

## ADR 432 — A selected Occurrence serves why it was judged

**Decision.** A selected Occurrence's detail serves a `reason`: the cause that
drove its episode, when one did (lever, title, and the episode's first attributed
step text, the same text the exposure feed serves), and one entry per habit the
case file judges for which the analyzer recorded a classifier verdict at this
anchor. Each entry carries the habit, its title, its row-relative verdict from
`findings_projection._occurrence_verdict` (the function the rosters already use),
and the classifier's `detail` sentence. A single-habit case file judges its one
lever; a Pattern case file judges its habit members in its rate family;
correction clusters use the `classify_correction_stacking` verdict `_population`
already computes. Where no verdict was recorded (Meal bolus short at a meal), no
habit entry is served and the cause alone explains a match. The frontend prints
what is served and derives no verdict, reason or threshold.

**Why.** The ticket asks why an Occurrence was matched, nearly matched or not
matched, and the analyzer already wrote that sentence. Serving it keeps policy in
its owner (AGENTS.md, "Put any hold in the backend predicate").

## Served shape (the contract every chunk reads)

Each case-file roster Occurrence, in both the single-habit and Pattern paths:

- `anchor.insulin`, `anchor.carbs` — numbers or null: the anchor bolus's delivered
  dose and carbs. Meals: the meal bolus. Correction clusters: the second
  correction (carbs null). Lows and highs: both null. The Pattern path reads them
  from the exposure Occurrence's new `insulin` and `carbs`, never by matching a
  bolus on time.
- `outcome` — `{"kind": "peak" | "nadir", "bg": number, "t": "YYYY-MM-DD HH:MM:SS",
  "minute": number}` or null, per ADR 432 above. `minute` is minutes from the
  anchor to `t`, rounded to one decimal like every other served minute.

The selected detail repeats the row's `anchor` and `outcome` (the frontend
validator already requires the detail anchor to equal the roster row's) and adds:

- `reason` — `{"cause": {"lever": str, "title": str, "text": str} | null,
  "habits": [{"lever": str, "title": str, "verdict": one of the five Finding
  verdicts, "detail": str}]}`. `text` is empty when the analyzer published no
  narrative for that association.

The Missed / unannounced meal comparison's announced-meal detail
(`_announced_detail`) is a meal anchor too: it serves `insulin`, `carbs` and the
Arc peak outcome, and `reason` with a null cause and no habits.

The exposure feed adds `insulin` and `carbs` to every exposure Occurrence, copied
from the model-view anchor (null where the anchor is not a bolus).

## Surface

- **Rows** (both rosters, one pure description function): a meal row reads
  `<carbs> g · <dose> U · peak <glucose>` (or `nadir <glucose>`), dropping the
  constant anchor label its cohort heading and case header already name; with no
  served outcome it reads `<carbs> g · <dose> U`. A correction-cluster row reads
  `<dose> U · <anchor label>`. Low and high rows are unchanged. The form is chosen
  from the served fields, never from a family name. Values print as served,
  rounded for display (carbs and glucose whole, dose to at most one decimal).
- **Selected detail:** the figure line reads the meal's carbs and dose (or the
  correction's dose, or the anchor glucose as today) at the anchor label; the
  facts list prints the outcome ("Peak <glucose> mg/dL, <minutes> min after the
  bolus", or "Nadir …"), the served cause (title, then its text when not empty),
  each served habit (its title, the verdict's existing band label, then the
  classifier's sentence), and, as today, each source correction. The fixed
  sentence "The canvas shows the selected glucose trace and evidence markers." and
  the two count-only lines are retired.
- Wording follows CONTEXT.md (Occurrence, Arc peak, Arc nadir, Finding verdicts);
  no new term is introduced.

## Fixture honesty

- `tests/test_finding_case_file.py` Pattern rows stop hand-setting a meal glucose;
  they carry what the exposure feed serves for a meal (null glucose, dose, carbs).
- `.claude/qa/gen_synthetic_fixtures.py`: the case-file capture's meal
  Opportunities come from `opportunities.build_opportunities` over its synthetic
  meal boluses (the real anchor path); its hand-paired correction clusters carry no
  anchor glucose (the real builder pairs adjacent corrections, which would change
  the population the capture pins); its manufactured meal and correction-cluster
  exposure rows carry the analyzer's kind and label, null glucose, and dose and
  carbs.
- `generate.mjs` carries those facts into `pattern_populations`; `project.mjs`
  serves the shape above for Pattern rows and details. It serves a null outcome,
  because no analyzer arc exists on the fixture side, and it builds `reason` from
  the capture's recorded verdicts with its existing per-habit state function.
- Every committed artifact whose generator drifts is regenerated by that generator
  and its `--check` stays green.

## Revise lifecycle record

- **Route.** `/ui-craft` route: embodiment shipped, runnability runnable,
  declaration complete, data source manufactured → `revise`.
- **Safe start.** AGENTS.md "The data boundary": the QA copy-then-serve command,
  `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`, over a
  copy of `mockups/qa-e2e.synthetic/harmonic.sqlite` or a store emitted by
  `scripts/gen_qa_e2e_db.py --case <name>`; both come from committed generators.
- **Contract.** The desk ledger frozen 2026-09-22 at eec4652a, S1–S117. No sweep is
  re-run; the release coordinator runs every port-bound leg serially.
- **Sanction.** Connor Griffin, 2026-09-23, answering the release's Q2 ("Can your
  reply here count as sign-off for the UI copy and tone changes? … I record your
  answer as the approval for every change these 13 checklists call for, and write
  the wording in CONTEXT.md terms"): "Q1 A, Q2 A, defaults all fine, go." It covers
  the S25 and S107 amendments and S148–S150; it covers nothing outside #432's
  checklist.
- **Stories.** New, fail-first, app-only: S148 (meal rows name the meal, showcase),
  S149 (a selected meal Occurrence shows its facts and served reason, showcase),
  S150 (a Highs after meals Pattern case file carries the same facts,
  `pattern-near-tie`). Amended: S25 (selected facts are served facts, never
  counts) and S107 (row readability keys on the served description). No story is
  retired. The issued inventory moves from 147 to 150 (active 128 to 131, retired
  19).
- **Design record.** This file and the desk behavior ledger. DESIGN.md and
  `mockups/INDEX.md` describe neither the row copy nor the detail block, so neither
  changes.

## Risk contract

- **Must prevent:** a meal row or detail showing a glucose the analyzer did not
  compute for that meal (including an episode nadir presented as a peak);
  a served reason that disagrees with the served verdict; any change to verdicts,
  counts, cohorts, staging, caps or floors; real data in a commit; silent
  incorrect success of a gate that ran zero assertions.
- **Must recover:** none automatic. A case file whose new fields are malformed is
  refused by the frontend validator as an inconsistent projection, as today.
- **Accepted failure:** a meal whose arc has no reading shows carbs and dose only;
  a Pattern row claimed across families shows the cause title with no text.
- **Unsupported:** eating-sequence rows; outcome readings for correction clusters,
  lows or highs beyond their existing anchor glucose.
- **Evidence owed:** served facts tested through `PreparedCases.case` over
  analyzer output built from N synthetic meals, failing first on the base; the
  exposure feed's key contract; the arc read's unchanged output for existing
  consumers; the row and detail renderers under node with a served meal
  Occurrence; the validator refusing malformed new fields; S148–S150 failing on the
  base and passing on the branch; S25 and S107 passing as amended.

Why: the row and detail are read by a person deciding on meal dosing, so a wrong
number is a silent incorrect success. Disposition: copied unchanged into the
#432 execution lock through this pinned change.
