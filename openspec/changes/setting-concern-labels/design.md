# #451 design

Sanction for every decision below: Q3 delegation, Connor Griffin, 2026-09-23
("figure it out yourself from here"). It covers coordinator ruling R451 as
corrected, the coordinator's widening of #451 on 2026-09-23, and its rulings on
plan review round 1 (2026-09-24).

## ADR 451 — A setting concern is served under its setting's user label

**Decision.** Guidance's setting adapter (`_setting` in `ciq_autotune/guidance.py`)
serves a setting concern's `title` from the closed setting-label table ADR 426
added (`_SETTING_TITLES`: Basal, Carb ratio, Correction factor). It no longer
takes the tuning lever's title from `_priority_inputs`.

Unchanged by this decision:

- the tuning lever's titles in `ciq_autotune/analyzers/tuning_priority.py`;
- `priority_inputs`, which copies the tuning lever row, `title` included, as the
  Priority inputs record (no desk line prints it);
- the served `units`;
- `_state`, which never carried a name, so no set-aside concern returns
  because its name changed.

**Consequence for records.** The Plan and Trial source context (`source_context`
in `ciq_autotune/api.py`) records `explanation` from the selected candidate's
`title`. Every record written after this change therefore records "Correction
factor", "Carb ratio" or "Basal" for a setting concern.

## ADR 451 — Every served subject name comes from one backend lookup

**Decision.** Guidance gains one public lookup, `subject_title(subject)`. It
names a guidance subject from the backend's own name sources, keyed by the
whole subject and never parsed from it:

| Subject | Name source |
|---|---|
| a setting subject | the setting-label table |
| a habit subject | its Lever's title (`levers.title`, already in `_MEMBER_TITLES`) |
| the uncaused-highs investigation | its one title constant, which the investigation candidate also uses |

Any other subject has no name, and the lookup returns null.

Two reads use it:

- **Absent rows.** Guidance's absent rows (set-aside preferences the read no
  longer carries) serve `title: subject_title(subject)`.
- **The Plan history read.** `/api/plan/history` serves `subject_titles` beside
  `subjects` in each record's `decision_context`: a parallel list, computed at
  read time and never stored.

Names never enter `_state`, a baseline or a stored record.

**No Pattern or override branch.** Neither can be reached:

- The outcome roster serves every Pattern present on every read, so a set-aside
  Pattern keeps its roster title and is never absent. A test pins this.
- Habit subjects are closed over `Lever` (`_HABIT_SUBJECTS`), `Lever` has no
  override member, and `is_preference_subject` gates every new preference
  write (`api.py`, the preference endpoint). So the override lever's title
  (`OVERRIDE_TITLE`) names no guidance subject.

**Unnamed rows.** A preference row stored before that gate can carry a subject
outside today's closed set. It is served with `title: null`. Changes lists such
a row as "A concern no longer in this read" and never prints its identifier.
`CONTEXT.md` gains a **Concern** entry, the desk's existing user word for one
thing guidance serves to Changes, so the phrase is in the glossary's terms.
Changes leads with a habit, a Pattern or an investigation; guidance never
selects a setting to lead.

## ADR 451 — The carb-ratio analyzer's sentences pass the user-copy register

**Decision.** Every sentence the carb-ratio analyzer serves
(`ciq_autotune/analyzers/ic.py`) passes every rule of DESIGN.md's user-copy
register. In practice that means three changes:

- it names the setting "carb ratio", never "I:C";
- it uses no prose em dash;
- it says "identifiable meals" (CONTEXT.md's **I:C-identifiable meal**, without
  the engine prefix), never "clean-start".

Comments, docstrings and error messages keep the engine terms. The sentences,
with their new wording:

| Where | Today | Becomes |
|---|---|---|
| `_recommend`, no estimate | not enough isolated carb-tagged meals to estimate I:C | not enough isolated carb-tagged meals to estimate the carb ratio |
| `_recommend`, no programmed value | implied I:C from post-meal correction burden | carb ratio implied by post-meal corrections |
| `_recommend`, under-covered | post-meal corrections imply meals are under-covered — a tighter (smaller) I:C would dose more per carb | post-meal corrections imply meals are under-covered, so a tighter (smaller) carb ratio would dose more per carb |
| `_recommend`, over-covered | meals look slightly over-covered relative to programmed I:C | meals look slightly over-covered relative to the programmed carb ratio |
| `_START_HIGH_XREF` | " Pre-meal BG is the bigger lever here — see the 'meals start high' finding." | " Pre-meal BG is the bigger lever here (see the 'meals start high' finding)." |
| hold intro, too few meals | I:C direction needs more identifiable meals — | Carb ratio direction needs more identifiable meals: |
| hold intro, prior-meal insulin | Prior-meal insulin cannot be separated from this meal — | Prior-meal insulin cannot be separated from this meal: |
| hold exit texts | {n} clean-start/correction-only meals are available… the programmed I:C | {n} identifiable meals are available… the programmed carb ratio |
| hold close | Held at the programmed I:C. | Held at the programmed carb ratio. |
| block owner prefix | Read with the {label} stretch — the meals can't tell these hours apart. | Read with the {label} stretch: the meals can't tell these hours apart. |
| `_block_annotation`, below floor | Below the floor for a dosing change — evidence shown, no move suggested. | Below the floor for a dosing change: evidence shown, no move suggested. |
| `_block_annotation`, unmeasured alone | Meals here always chain into neighbouring hours — read with the rest of the day. | Meals here always chain into neighbouring hours, so read them with the rest of the day. |
| `_history_annotation` | … measured {v} g/U (CI {lo}–{hi}). Past setting. … | … measured {v} g/U (range {lo}–{hi}). Past setting. … |

Every other clause of those sentences is unchanged, including "held at current"
and "meals still bracket the current ratio".

The analyzer's three Findings (carb-counting, meals-start-high,
post-meal-correction-burden) reword their summaries and occurrence details the
same way:

- "I:C" becomes "carb ratio";
- each prose em dash becomes a comma, a colon or a new sentence.

Their meaning and every served number stay the same, and no fixture or test pins
their wording on b03431d2.

These copies are regenerated or re-dumped, never hand-edited:

- `frontend/__fixtures__/analysis.json`, the findings-projection fixture and
  `mockups/diagnose-workstation.synthetic/ic-history-events.capture.json`, each
  regenerated by its generator;
- the four QA queue-row literals and `tests/test_analyzer_ic.py`'s pinned lines,
  re-dumped by the AGENTS.md coverage-era process.

`tests/test_result.py`'s "(CI …)" string is a hand-set serialization input, not
analyzer output, and stays.

**Guard.** A new test in `tests/test_annotation_register.py` builds every served
carb-ratio sentence branch through the analyzer's own functions:

- the `_recommend` branches;
- the three hold variants, with and without the start-high cross-reference;
- the block owner prefix;
- each `_block_annotation` state and hold reason;
- the history annotation;
- the three Findings' summaries and occurrence details.

It checks every one against the full `BANNED` list, exactly as the basal and
correction-strength tests do. `BANNED` gains `(re.compile(r"\bI:C\b"),
'user-facing "I:C"')` beside its "ISF" rule, so the guard catches the word this
ruling is about. It is a guard on changed behavior, so it fails first on the
base.

## ADR 451 — Diagnose's setting findings are titled by their user labels

**Decision.** The findings projection (`_title` call sites in
`ciq_autotune/findings_projection.py`) titles:

- the correction-factor row "Correction factor", "Correction factor ·
  <direction>" or "Correction factor · leaning <direction>";
- a carb-ratio block "Carb ratio <span>" with the same suffixes.

Basal rows keep "Basal <span>".

These move with the title:

- the JS mirror (`mockups/findings-projection.mirror.mjs`), held identical by
  `frontend/findings-projection-mirror.test.js`;
- the fixtures regenerated by their generators;
- the QA finding-title literals, re-dumped.

For `mockups/diagnose-workstation.synthetic/finding-case-files.json`, the
generator's two hand-written titles (`'ISF'`, `'I:C Evening'` in
`.claude/qa/gen_synthetic_fixtures.py`) are retitled. Nothing else in that
generator changes.

**Accepted consequence: tied rows reorder.** The projection's sort key ends with
the row title. Renaming "ISF" and "I:C …" changes the order only among rows tied
on every earlier key (register, Priority presence and value, episodes, span
start, history recency) within a tier. That reorder is accepted: it follows the
names the reader now sees, and no rank, tier, Priority or verdict moves.

## ADR 451 — One desk formatter prints a setting value in the wearer's words

**Decision.** `settingValue(parameter, value)` moves from `frontend/history.js`
into `frontend/plan.js`, unchanged:

| Parameter | Prints |
|---|---|
| any, value null | "not recorded" |
| correction factor | "1 U : <value> mg/dL" |
| carb ratio | "<value> g/U" |
| basal | "<value> U/h" |
| target | "<value> mg/dL" |

Every desk line that prints a setting value with its unit calls it:

- Changes: the Action figure and the Plan's "What was known".
- The change record (`history.js`) and the Trial follow-up (`follow-up.js`),
  which drop their private copies and unit tables.
- Diagnose: the findings queue's numbers and the correction-factor panel.
- The watch dock's values.

The table forms (`userValue` in `plan-view.js` and `utilities.js`) print bare
numbers under a unit column head. They keep that form and take their
correction-factor branch from the same formatter. Each line passes the number
exactly as it prints it today, so no rounding moves. Diagnose's basal values
keep "U/hr".

**Why `plan.js`.** It is the import-free leaf every consumer can import without
a cycle: `history.js` imports `follow-up.js`, which imports `plan-view.js`.

**The Action figure reads the instruction.** It prints `<direction> to
<settingValue(parameter, recommended)>` from each instruction's own `parameter`,
never from the concern's served `units`: a Pattern serves `units: null`. Served
`units` stay unchanged, because guidance's set-aside comparison reads them
(`_setting_change`).

**"What was known."**

- It names each recorded subject by its served name (`subject_titles`), prints
  nothing for a subject without one, and never prints an identifier.
- It prints each recorded setting value through the formatter, using the
  parameter of the recorded action row it was captured from. The two are built
  one-to-one, in order, by `source_context`.

## ADR 451 — The carb ratio keeps its "<value> g/U" form

**Decision.** Only the correction factor moves to an insulin-first form. A carb
ratio prints "<value> g/U" on every desk line, and the unit is added where a
Pattern-carried carb-ratio figure printed none ("lower to 9 g/U").

**Why.**

- CONTEXT.md gives the correction factor an insulin-first form and bans
  mg/dL/U. It gives the carb ratio its label only and does not ban g/U.
- The operator authored Diagnose's carb-ratio headlines with "Measured <value>
  g/U" (surfaces: "Headlines are authored with the operator from the engine's
  facts").

The release coordinator ruled on 2026-09-23 that R451's "insulin unit first for
carb ratio" was an overreach, and confirmed this default.

## ADR 451 — A record keeps the explanation it recorded

**Decision.** The desk prints a recorded explanation as recorded:

- the Plan's "What was known";
- the record's "Original explanation";
- the Focus or Trial context line.

A record written before this change keeps "ISF", "Carb ratio (I:C)" or "Basal
profile" there. A record written after it says "Correction factor", "Carb ratio"
or "Basal".

**Why.** Those lines are the saved record of what the app said when the decision
was made (S54). Rewriting recorded words on display would make a record claim
something it never said. The release coordinator ruled this on 2026-09-23.

## ADR 451 — Changes says why its concern leads in words

**Decision.** Guidance's served `disposition` is a code from a closed set. The
desk's guidance module (`frontend/guidance.js`), which already turns served
codes into words, gains the status words, which say what the reader can actually
do. It chooses them from:

- the desk's own staged state: whether the change is staged in the Plan draft
  (`phase()` in `frontend/plan-view.js`, the state the pane's "Staged · Undo"
  reads), checked first;
- the disposition;
- under `eligible_action`, the served action's shape;
- for an identified action, whether a served Focus offer exists (the same
  `focusOffer(subject)` over the served `pinnable_patterns` that draws Changes'
  Start Focus) and the Pattern's served readiness verdict.

`focus-entry.js` and `plan-view.js` both import `guidance.js`, so the words
function takes the offer and the staged state as arguments from Changes rather
than importing either. Changes' nameplate and
its Action heading print the words, never the code:

| Code, action | Words | Drawn from |
|---|---|---|
| any, with the change staged in the Plan draft | Staged | the pane's own Staged state (`phase()`) |
| `eligible_action`, setting instruction rows | Ready to stage | the concern's Stage change |
| `eligible_action`, an identified action with a served Focus offer | Ready to start a Focus | Changes' Start Focus and the Focus entry's "ready to start a Focus" |
| `eligible_action`, an identified action on a Pattern whose served readiness verdict is `withheld` | Focus withheld | the served "Focus is withheld: …" reason the pane prints |
| `eligible_action`, any other identified action (no offer, e.g. a legacy habit lead) | Action identified | the Action figure, which names the identified action |
| `guided_investigation` | Evidence to inspect | its Inspect route |

Any other code prints no words, and the rest of the frame still renders. The
other served codes never reach this frame: Changes routes `active_change`,
`draft` and `pending_plan` to their own frames, and `quiet` and `unavailable`
select no concern, so the only frame they can seat is a set-aside concern, which
prints no status words because it is not the concern the read leads with. The
Staged row reads the staged state Changes and the pane already share, passed in
like the Focus offer. These rows were settled after sub-order 3's chunk review
(Q3 delegation, Connor Griffin, 2026-09-23; coordinator ruling R451). The
unselected frame's honesty line, which quotes an unknown code, stays. The words
read served fields (the action's shape, the served offer, the served readiness
verdict) and one state the desk itself owns, the Plan draft's staged state
(`phase()`). They decide no eligibility and re-derive no gate.

## ADR 451 — The watch dock's title names the change; its values wrap below

**Decision.** The watch dock's one-line title may ellipsize (term 49), so it
carries only the name of the change:

- the setting's user name, through the desk's `SETTING_NAME` (a whole profile
  keeps its own word);
- its slot or span where it has one;
- the direction the server serves for it, where it serves one: the correction
  factor's direction, and a staged basal run's direction when every staged half
  hour carries it.

A watched Trial and a carb-ratio block serve no direction, and the dock derives
none: AGENTS.md forbids the frontend re-deriving a direction for any parameter.

The from→to values, in their user form, lead the dock's wrapping detail line,
before its existing sentence.

Diagnose's staged descriptor (`stagedDescriptor`) serves the dock the title and
a separate values part. S178 measures that the staged title does not truncate
(`scrollWidth <= clientWidth`) and that the values are fully visible, at both
sizes.

## ADR 451 — The dead status-strip writes are deleted

**Decision.** Delete the `#status-src` and `#status-clock` writes in
`frontend/diagnose-workstation.js`, along with the "ISF … mg/dL/U · I:C … g/U"
line.

**Why (the fact that makes them dead).** No shipped markup declares either id:

- not the shell (`frontend/index.html`, `frontend/shell.js`);
- not the workstation's own markup.

The only references to either id on b03431d2 are these two guarded writes.
Their guards therefore never pass, and the lines never render.

**Widened by the coordinator after sub-order 3** (Q3 delegation, Connor Griffin,
2026-09-23; coordinator ruling R451). Two more pieces of dead desk code carrying
engine words or unrendered ids are deleted, for the same kind of reason:

- **The `#scope-range` and `#scope-days` writes**, with the date helper and the
  parameter only they read. No shell or template declares either id: the built
  shell's bundle holds only these two lookups, and `frontend/index.html`,
  `frontend/shell.js` and the built `index.html` never mention them.
- **The Plan mismatch label table (`PARAM_LABEL`) and its `|| cell.label`
  fallback.** The mismatch diff names each cell by `SETTING_NAME[cell.param]`.
  Cells are built over the four Plan parameters only, and `SETTING_NAME` names
  all four, so the fallback never ran and the table's "ISF (mg/dL/U)" and
  "I:C (g/U)" never rendered. A node test through the mismatch reader pins that
  every cell it emits has a name. This replaces relabelling the table.
- **The capture fields only those writes read.** The workstation's data adapter
  stops producing `exposureCapture`, which only the scope writes and the
  status-clock write read, and the explore-day capture's `isf` and
  `programmed_ic`, which only the status line read. A whole-tree grep finds no
  other reader.
- **The explore-day capture itself.** Nothing on the desk reads `day.days`, on
  this branch or on b03431d2, so its lazy per-day timeline fetch
  (`loadDay`/`onDayLoaded`) never fires, and that fetch is not one of the five
  reads the Diagnose input-data age check covers. The capture, its map and its
  fetch are deleted; the workstation's `repaintDay` stays, because the event
  comparison still calls it.

## Revise preparation

- **Lifecycle:** `revise`, routed by UI Craft on 2026-09-23 (`shipped`,
  `runnable`, declaration `complete`, data source `manufactured`). The work is
  convergent: the wording is settled, so no wireframe phase opens.
- **Safe start:** `AGENTS.md`, "The data boundary". The QA copy-then-serve
  command (`--no-fetch`, `--token ''`) runs over the case store emitted by
  `scripts/gen_qa_e2e_db.py --case isf-strengthen`.
- **Base:** origin/main `b03431d2b937b46bdabbb2de1e6ba0ba6c6b57b1` (#456).
- **Base replay:** main push CI run 35959034199 on that exact commit replayed
  the complete desk ledger (171 selected) green at 1280x720 and 1440x900. No
  local base replay was run: the release brief forbids port-bound legs in
  triage.
- **Inventory diff:** no replay story or browser suite asserts any line this
  change moves, whether by text or by title lookup:
  - setting concern and finding titles;
  - "ISF", "I:C", "mg/dL/U" and "g/U";
  - disposition codes;
  - "What was known" and the dock's title.

  The occurrences in `frontend/*.replay.mjs` are assertion messages only. S55
  needs a "·" or a counted profile change in a record title, which the record
  title keeps. No story is amended or retired.
- **Added stories:** S177–S179 on isf-strengthen.
  - S177: Changes' Action figure and status words.
  - S178: the Diagnose finding title, panel and queue numbers, and the staged
    dock title's fit and values.
  - S179: the recorded Plan's "What was known".

  They are recorded in `## #451 amendment — 2026-09-23` at the end of the
  ledger. No `★ FROZEN` block, header inventory line or earlier story body is
  edited. S177 joins the PR smoke slice.
- **Renders owed** (coordinator-run, before/after, 1280x720 and 1440x900), all
  on isf-strengthen:
  - Changes plain arrival.
  - Diagnose findings queue and correction-factor panel.
  - The dock with the correction factor staged.
  - The recorded Plan's "What was known".

## Risk contract

- **Must prevent:**
  - a desk line this change owns printing "ISF", "I:C", "Carb ratio (I:C)",
    "Basal profile", "mg/dL/U", a raw guidance subject id or a raw disposition
    code;
  - a truncated dock title that hides its values;
  - a printed value that differs from the served number (silent incorrect
    success);
  - any change to served `units`, recommendation values, caps, floors,
    `asserts_move`, staging, Priority or the set-aside comparison, including a
    set-aside subject returning because a name was added;
  - a record's recorded words rewritten;
  - real data in any fixture, capture or log.
- **Must recover:** none.
- **Accepted failures:**
  - A record written before this change keeps its recorded engine title in
    its explanation lines.
  - Findings-projection rows tied on every earlier sort key may reorder within
    their tier by their new titles.
- **Unsupported:** viewports other than the two supported desktop sizes.
- **Evidence owed:**
  - Backend tests through the public reads:
    - the carb-ratio register guard (every rule);
    - guidance's setting titles and set-aside names for a setting, a habit and
      the investigation, with a set-aside Pattern served present;
    - the Plan history read's subject names;
    - the projection's setting finding titles;
    - the QA case tests over the re-dumped literals.
  - A node test for each moved desk line.
  - S177–S179 replayed at both sizes, failing on the base and passing on the
    branch.
  - The renders above.

  Tests of changed behavior fail first on the base. Invariance and served-data
  rendering tests are regression tests.
- Why: these lines sit on an advisory dosing surface, so the harm is a misread
  setting, unit or state, not downtime. Disposition: admitted here from
  `docs/scope/451-setting-concern-labels.md`.

## Traps for the implementer

- **Settings never lead.** Settings are never guidance's selection, and the desk
  sets aside only the served selection (`changes.js`,
  `aside.subject = selectedConcern()?.subject`). A setting concern's own frame is
  reached only when guidance serves one; node tests drive it through the
  Changes mount. On served data, the reachable instances are:
  - the Pattern Action figure (case isf-strengthen or ic-lower);
  - set-aside rows from durable preferences;
  - "What was known";
  - the record views.
- **Return reasons carry the engine unit but print nowhere.** `_describe` prints
  mg/dL/U inside guidance's return reasons. No desk line prints those: Changes
  shows `return_reason` only for a set-aside concern, whose only possible
  reason is the comparison-version sentence. Leave `_describe` as it is.
- **Circular import.** `guidance.py` imports `watched_change.py`
  (`is_pinnable`), so serve `subject_titles` in the `/api/plan/history`
  endpoint (`api.py` already imports guidance).
- **Tests pinning the old titles and sentences.** Move these with the titles:
  - `tests/test_findings_projection.py`;
  - `tests/test_analyzer_ic.py`'s pinned carb-ratio sentences (the "direction
    needs more identifiable meals", "clean-start" and "When Carb ratio was … (CI
    …)" lines);
  - `frontend/diagnose-findings-queue.test.js` and
    `frontend/findings-projection-mirror.test.js`.

  `tests/test_render.py` and `tests/test_report.py` pin the engine report's
  "ISF", which is not a desk line; leave them.
- **The dock's height.** The dock's detail line wraps inside a fixed reserve
  (`PLAN_DETAIL`'s comment), and leading it with the values adds length. S178
  measures that the values are fully visible at both sizes.
- **Overlapping tickets.** Other tickets in this release edit neighbouring
  lines; do not touch another ticket's lines, and the coordinator merges and
  regenerates at integration:
  - #445, #449/#450 and #452: `history.js` and `follow-up.js`. #449/#450 owns
    their Focus names and reason words.
  - #446: `changes.js` `planOpen`.
  - #447: the dock's day count.
  - #453: `plan.js`.
  - #454: the rest of `.claude/qa/gen_synthetic_fixtures.py` and the
    event-comparison `project.mjs`. #454 also regenerates the findings-projection
    fixture.
