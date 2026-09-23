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
  the cause `text`. `cause_lever` and `text` are set only on the episode's driver
  anchor (`explore_exposures.py:171,194`); cross-family claims such as a meal
  behind a Meal bolus short High reach the meal only through `attributed_levers`.
  Meal opportunities carry their bolus in `members`; correction clusters carry both
  corrections. Every recorded classifier name is a `Lever` value (`attribute.py`),
  so `levers.title` names each one.
- **Pattern claims are not episode causes.** A Pattern roster claims a row through
  `outcome_patterns._lever_identities`, which reads `attributed_levers`
  (`outcome_patterns.py:209-216`); an unclaimed row's per-habit states are mapped
  fired to outranked (`finding_case_file.py:384`). On the showcase, 0 of 32 meal
  exposure Occurrences carry a `cause_lever` and one carries `meal_bolus_short` in
  `attributed_levers`.
- **The episode "worst" reading is not a meal peak.** `severity.worst_bg` returns
  the episode's lowest reading whenever it went below range. On the showcase, 3 of
  the 32 meal episodes report a value below 70.
- **A meal's peak already has one owner.** CONTEXT.md defines the **Post-meal
  arc**, **Arc peak** and **Arc nadir**, and `ciq_autotune/outcomes_trend.py`
  computes them (`_meal_arc`, read through `meal_measurements`, which follow-up
  comparison also consumes and reads by key). `_meal_arc` scans the whole series
  it is given. The arc truncates at the next meal under the same `anchors._is_meal`
  predicate that defines the meal Occurrence population. `meal_measurements`
  returns no reading times and needs a bolus object for the meal's starting glucose.
- **Meal bolus short is judged at the rise, not at the meal.** Meal anchors carry
  `carb_undercount`, `late_bolus` and `meal_over_delivery` verdicts;
  `meal_bolus_short` and `missed_meal` are recorded on the High anchor, and the
  meal roster joins them by occurrence id. Correction-cluster exposure rows carry
  no verdicts; `_population` computes `classify_correction_stacking` per cluster.
  A single-habit row can be fired by association (`_population` sets
  `states[lever][key] = "fired"`) while its own anchor's recorded verdict reads
  otherwise.
- **Three fixture paths hid the dash.** `tests/test_finding_case_file.py` hand-sets
  `"bg": 120` on meal Occurrences; `.claude/qa/gen_synthetic_fixtures.py` builds
  meal Opportunities with anchor glucose 130 and correction clusters with 175 for
  `mockups/diagnose-workstation.synthetic/finding-case-files.json`, and its
  manufactured exposure rows (the committed `explore-exposures.capture.json` uses
  them) give meal and correction rows a low-range glucose;
  `mockups/diagnose-event-comparison.synthetic/generate.mjs` copies that glucose
  into `pattern_populations`, which `project.mjs` serves as Pattern case-file rows
  to the browser gates; and `scripts/gen_findings_projection_fixtures.py`'s
  `exposures()` hand-sets meal and correction glucose (`:575-599`) in
  `frontend/__fixtures__/findings-projection.json`. Three generators construct
  `Member` directly with hand-set verdicts (`.claude/qa/gen_synthetic_fixtures.py`,
  `scripts/gen_missed_meal_comparison_fixtures.py`, and the Pattern case of
  `scripts/gen_findings_projection_fixtures.py`, which goes through exposure rows).
- **Tests pin the served key sets.** `tests/test_explore_exposures.py` pins the
  exposure Occurrence keys; `tests/test_finding_case_file_api.py:739-740` and
  `:772-777` pin the case-file Occurrence, anchor and detail keys.
- **Two desk stories pin the retired copy.** S25 (`frontend/c2.replay.mjs`)
  asserts the "N glucose readings" and "N event markers" lines; S107
  (`frontend/c4.replay.mjs`, with its node test in `frontend/c4.replay.test.js`)
  asserts every meal row description contains "Completed carb bolus".
  `frontend/diagnose-workstation.test.js` pins the canvas sentence. The desk replay
  switches case stores only when `CASE_STORE_DIR` is set
  (`frontend/desk-behavior.replay.mjs:3206`).

## ADR 432 — A meal Occurrence is read by its bolus and its post-meal arc

**Decision.** Every case-file Occurrence serves its anchor bolus's delivered dose
and carbs beside the anchor glucose it already serves. A meal Occurrence also
serves one outcome reading: its **Arc peak** when the case file judges a high
outcome, its **Arc nadir** when it judges a low one, with the reading's time and
its minutes after the bolus. The direction is `levers.outcome_kind` of the case
file's lever; a Pattern uses the population lever its case file already resolves,
so Highs after meals reads peaks and Lows after meals reads nadirs. The arc is
computed by `outcomes_trend`'s existing `_meal_arc`, which stays the one
implementation, through one public per-meal read that `meal_measurements` also
uses. That read runs `_meal_arc` on the time-sorted judged series narrowed by
bisection to (bolus, bolus + 6 h], so a window of meals costs a slice per meal
rather than a scan of the whole series. The judged series is the readings the
analyzer judged (confirmed false lows removed, the case file's `sequence_cgm`);
truncation is at the next meal among the window's `_is_meal` boluses. An arc half
with no reading, or an Arc nadir whose window does not qualify, serves no outcome.
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

**Decision.** A selected Occurrence's detail serves a `reason` built from the same
claim account and verdict states its roster row was built from, so it cannot
disagree with the row's served verdict.

- **Cause** is non-null exactly when the row is claimed in this case file's claim
  account, and names the claimant: in a single-habit case file, the case lever,
  when the row's id is in the case file's claimed set; in a Pattern case file, the
  habit in the row's served `member`. It carries the claimant, `levers.title` of
  it, and a `text`: for a single-habit claim, the first attributed step text of the
  episode whose attribution made the claim; for a Pattern claim, the exposure
  Occurrence's `text` when that Occurrence's `cause_lever` equals the claimant,
  otherwise "". A meal claimed by Meal bolus short inside Highs after meals
  therefore serves that cause with an empty text. An unclaimed row, and every row
  of a claim-free lever request, serves no cause.
- **Habits** carry one entry per habit the roster judged for the row, with exactly
  the verdict the roster assigned: a single-habit case file serves one entry, its
  lever, whose verdict is the row's served verdict; a Pattern case file serves one
  entry per habit member in its rate family, whose verdict is that habit's
  `findings_projection._occurrence_verdict` state, mapped fired to outranked on an
  unclaimed row exactly as the roster maps it; on a claimed row the claimant's
  entry is fired and the others keep their unmapped state. An unclaimed Pattern
  row's verdict is thus its highest-precedence entry (clean when none), a claimed
  row's is fired with its claimant, and a single-habit row's is its one entry.
- **Detail sentence.** Each entry carries `detail`: the habit's recorded
  classifier sentence at this anchor, served only when that recorded verdict, read
  through `_occurrence_verdict` with the anchor's episode driver, gives the entry's
  verdict, or gives fired for an entry an unclaimed Pattern row maps to outranked;
  otherwise null. A row fired by association whose own recorded verdict reads
  otherwise shows its verdict and its cause, never a sentence that contradicts
  them.

Correction clusters read the `classify_correction_stacking` verdict `_population`
already computes. The frontend prints what is served and derives no verdict,
reason or threshold.

**Carrier.** The recorded verdicts, the episode driver at the anchor and the claim
text reach selection time on `Member`, as three fields with defaults so every
existing constructor keeps working: `recorded` (a tuple of the anchor's classifier
verdict dicts as the model view serializes them, default `()`), `driver` (the
lever that drove the anchor's episode at this anchor, `_population`'s existing
`cause`, default `None`) and `claim_text` (default ""). `_population` fills them
for single-habit rosters; `_pattern_case` fills them from the exposure
Occurrence's `verdicts`, `cause_lever` and, when `cause_lever` is the claimant,
`text`. A `Member` built with the defaults serves, for a claimed row, the cause
with an empty text, and always its habit entries with their verdicts and null
sentences, so a fired or nearly-matched row's reason is never empty.

**Why.** The ticket asks why an Occurrence was matched, nearly matched or not
matched, and the analyzer already wrote that sentence. Building the reason from
the roster's own claim account and states keeps policy in its owner (AGENTS.md,
"Put any hold in the backend predicate") and makes disagreement unrepresentable
rather than merely untested.

## Served shape (the contract every chunk reads)

Every anchor object a Finding case file serves (roster `anchor`, Missed /
unannounced meal `comparison_anchor`, and every detail `anchor`) carries
`insulin` and `carbs`, each a number or null:

- a meal: the meal bolus's delivered dose and carbs;
- a correction cluster: the second correction's dose, carbs null;
- a low, a high, and a Missed / unannounced meal rise-onset anchor
  (`_rise_onset_anchor`): both null.

The Pattern path reads them from the exposure Occurrence's new `insulin` and
`carbs`, never by matching a bolus on time. Eating-sequence case files are
unchanged.

Every roster Occurrence also carries `outcome`: `{"kind": "peak" | "nadir",
"bg": number, "t": "YYYY-MM-DD HH:MM:SS", "minute": number}` or null, per the
first ADR above. `minute` is minutes from the anchor to `t`, rounded to one decimal
like every other served minute.

The selected detail carries `anchor`, `outcome` and `reason`:

- `anchor` equals the roster row's `anchor`, except that a Missed / unannounced
  meal event selection's detail anchor equals the row's `comparison_anchor` (the
  rise onset, as the validator already requires), and the announced-meal detail
  (`_announced_detail`) has no roster row;
- `outcome` equals the roster row's `outcome`; the announced-meal detail, a meal
  anchor, serves its Arc peak;
- `reason` is `{"cause": {"lever": str, "title": str, "text": str} | null,
  "habits": [{"lever": str, "title": str, "verdict": one of the five Finding
  verdicts, "detail": str | null}]}` per the second ADR above; the announced-meal
  detail serves a null cause and no habits.

The exposure feed adds `insulin` and `carbs` to every exposure Occurrence, copied
from the model-view anchor (null where the anchor is not a bolus).

`Member` gains `recorded`, `driver` and `claim_text` with the defaults above.

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
  classifier's sentence when served), and, as today, each source correction. The
  fixed sentence "The canvas shows the selected glucose trace and evidence
  markers." and the two count-only lines are retired.
- Wording follows CONTEXT.md (Occurrence, Arc peak, Arc nadir, Finding verdicts);
  no new term is introduced.

## Fixture honesty

- `tests/test_finding_case_file.py` Pattern rows stop hand-setting a meal glucose;
  they carry what the exposure feed serves for a meal (null glucose, dose, carbs).
- `.claude/qa/gen_synthetic_fixtures.py`:
  - the case-file capture's meal Opportunities come from
    `opportunities.build_opportunities` over its synthetic meal boluses (the real
    anchor path); its hand-paired correction clusters carry no anchor glucose (the
    real builder pairs every adjacent correction, which would change the
    population the capture pins);
  - each hand-verdicted `Member` passes a `recorded` verdict for its lever that
    `_occurrence_verdict` reads as its hand-set verdict (matched for fired, under
    threshold for nearly matched, insufficient data for no data, no trigger for
    clean, and no trigger with another lever as `driver` for outranked), with a
    synthetic sentence, and its one claimed `Member` passes a synthetic
    `claim_text`, so every selected detail carries a habit entry with its sentence
    and the claimed one also a cause with text;
  - its manufactured meal and correction-cluster exposure rows carry a null
    glucose and the dose and carbs the exposure feed serves; their kinds, labels,
    states, attribution and verdicts are unchanged, because the replay stories and
    the queue counts pin them and an added own-lever verdict would move a row from
    outranked to fired.
- `scripts/gen_missed_meal_comparison_fixtures.py` keeps its hand-verdicted
  `Member` defaults: each detail serves one habit entry carrying its row's verdict
  with a null sentence, and a claimed row also the Missed / unannounced meal cause
  with an empty text.
- `scripts/gen_findings_projection_fixtures.py`'s `exposures()` meal and correction
  rows carry a null glucose and a dose and carbs (carbs null on corrections); its
  Pattern case reads its exposure rows, so its reason follows the Pattern rule. The
  #426 ticket also regenerates `frontend/__fixtures__/findings-projection.json`;
  the release coordinator regenerates it once on the integration branch.
- `generate.mjs` carries the exposure rows' dose, carbs and `text` into
  `pattern_populations`; `project.mjs` serves the shape above for Pattern rows and
  details: `insulin` and `carbs` on every anchor, a null `outcome` (no analyzer arc
  exists on the fixture side), and a `reason` by the Pattern rule, using its
  existing per-habit state function and fired-to-outranked mapping.
- Every committed artifact whose generator drifts is regenerated by that generator
  and its `--check` stays green.
- The no-anchor-glucose rule covers served case-file and exposure Occurrences. It
  excludes `mockups/diagnose-event-comparison.synthetic/capture.json`'s `views` and
  `pattern_populations`: `views` feed only the exploration-only
  `projectSyntheticCapture` (its own comment says shipped and browser evidence uses
  case files) and carry hard-coded synthetic glucose (`generate.mjs:286`) outside
  this change's scope, and `pattern_populations` are that capture's source rows,
  not served Occurrences.

## Revise lifecycle record

- **Route.** `/ui-craft` route: embodiment shipped, runnability runnable,
  declaration complete, data source manufactured → `revise`.
- **Safe start.** AGENTS.md "The data boundary": the QA copy-then-serve command,
  `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`, over a
  copy of `mockups/qa-e2e.synthetic/harmonic.sqlite` or a store emitted by
  `scripts/gen_qa_e2e_db.py --case <name>`; both come from committed generators.
  Story selections run with `CASE_STORE_DIR` set to a fresh directory and nothing
  else bound to port 8765.
- **Contract.** The desk ledger frozen 2026-09-22 at eec4652a, S1–S117. No sweep is
  re-run; the release coordinator runs every port-bound leg serially.
- **Freeze rule (release).** No `★ FROZEN` block is rewritten, re-dated or
  replaced, and the header's inventory line is not edited. This ticket records its
  stories and amendments in its own dated `## #432 amendment — 2026-09-23` section.
  `acceptance.py inventory()` counts every line beginning `<id> ·`, fenced or not,
  and rejects duplicates, so only the new stories S148–S150 get such a line; each
  amendment is written `Amended S25 · 2026-09-23 · #432 / Q2 sanction: …` and
  `Amended S107 · 2026-09-23 · #432 / Q2 sanction: …`, never as a line beginning
  `S25 ·` or `S107 ·`. The ticket moves only the numeric literals in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` (`inventory()`) and its test
  (`:226` the plan count, `:292` the range bounds that encode the active/retired
  split, `:295-296` the equal-total ranges and their total) so its own tests pass,
  and runs the port-free `acceptance.py inventory` check. `ACCEPTANCE.md`'s count
  sentence, `mockups/INDEX.md` and the one release freeze block are the release
  coordinator's, written once on the integration branch.
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
  retired. On this branch the inventory literals move from 147 to 150 issued (131
  active, 19 retired); the coordinator reconciles release totals.
- **Revision evidence (coordinator-owned).** A render matrix at 1280x720 and
  1440x900, base and branch: the Meal bolus short roster, its selected matched
  meal, an Over-treated low selected detail, and the Highs after meals Pattern
  roster and selection (`pattern-near-tie`). It is recorded as release pull request
  revision evidence in `docs/scope/release-422-434-evidence/432/` on the
  integration branch.
- **Design record.** This file and the desk behavior ledger. DESIGN.md and
  `mockups/INDEX.md` describe neither the row copy nor the detail block, so neither
  changes for this ticket.

## Risk contract

- **Must prevent:** a meal row or detail showing a glucose the analyzer did not
  compute for that meal (including an episode nadir presented as a peak);
  a served reason that disagrees with the served verdict; any change to verdicts,
  counts, cohorts, staging, caps or floors; real data in a commit; silent
  incorrect success of a gate that ran zero assertions.
- **Must recover:** none automatic. A case file whose new fields are malformed is
  refused by the frontend validator as an inconsistent projection, as today.
- **Accepted failure:** a meal whose arc has no reading shows carbs and dose only;
  a claimed row whose claimant did not drive its episode shows the cause title with
  no text; an entry whose recorded verdict reads otherwise shows no sentence.
- **Unsupported:** eating-sequence rows; outcome readings for correction clusters,
  lows or highs beyond their existing anchor glucose.
- **Evidence owed:** served facts tested through `PreparedCases.case` over
  analyzer output built from N synthetic meals, failing first on the base; a
  reason-agreement test over analyzer output covering every row of the tested case
  files, including a meal claimed by Meal bolus short inside Highs after meals;
  the exposure feed's and the case-file API's key contracts; the arc read's
  unchanged output for existing consumers; the row and detail renderers under node
  with a served meal Occurrence; the validator refusing malformed new fields;
  S148–S150 failing on the base and passing on the branch; S25 and S107 failing as
  frozen and passing as amended on the branch build; the whole desk browser suite
  once; the render matrix.

Why: the row and detail are read by a person deciding on meal dosing, so a wrong
number is a silent incorrect success. Disposition: copied unchanged into the
#432 execution lock through this pinned change.
