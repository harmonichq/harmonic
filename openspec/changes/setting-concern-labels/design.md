# #451 design

## ADR 451 — A setting concern is served under its setting's user label

**Decision.** Guidance's setting adapter (`_setting` in `ciq_autotune/guidance.py`)
serves a setting concern's `title` from the closed setting-label table ADR 426
added (`_SETTING_TITLES`: Basal, Carb ratio, Correction factor). It no longer
takes the tuning lever's title from `_priority_inputs`. An absent row is a
set-aside preference whose subject this read no longer carries. When that
subject is a setting subject, the absent row serves the same label, looked up
by the whole subject in `_MEMBER_TITLES`. It is never parsed out of the
identifier. Absent habit and Pattern rows keep `title: null`, because they are
not setting concerns (R451).

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
factor", "Carb ratio" or "Basal" for a setting concern, and `api.py` needs no
edit.

**Why this owner.** Guidance already holds the one reader-facing name for each
setting subject (ADR 426) and serves it on Pattern members. Before this change
it served a second, engine-titled name for the same subject on the setting
concern itself.

Coordinator ruling R451, under Q3 delegation, Connor Griffin, 2026-09-23
("figure it out yourself from here").

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
- Diagnose: the findings queue's numbers and the correction-factor inspector.
- The watched-change dock's Trial title and Diagnose's staged title.

The table forms (`userValue` in `plan-view.js` and `utilities.js`) print bare
numbers under a unit column head. They keep that form and take their
correction-factor branch from the same formatter. The formatter receives the
number exactly as each line prints it today, so no line's rounding moves.
Diagnose's basal values keep their "U/hr" suffix: it is not an engine unit and
this change does not touch it.

**Why `plan.js`.** It is the import-free leaf that already owns the
per-parameter plan facts (`PLAN_PARAMS`, `PARAM_PRECISION`), and every consumer
already imports it or can import it without a cycle. `history.js` imports
`follow-up.js`, which imports `plan-view.js`, so neither of those two can import
`history.js`. `diagnose-findings-queue.js` imports nothing today and stays
node-loadable importing `plan.js`. One formatter is the charter's reuse rule.
Before this change, four desk modules each spelled the correction factor's
user form, and three unit tables spelled mg/dL/U.

**The Action figure reads the instruction, not the concern.** A setting
concern's action rows and a Pattern's rows carried from its chosen setting
member both hold `parameter` and `recommended`. The figure prints
`<direction> to <settingValue(parameter, recommended)>`. It never reads the
concern's served `units`: a Pattern serves `units: null`, which is why its
figure printed a bare number. The served `units` stay exactly as they are,
because guidance's set-aside comparison reads them (`_setting_change`).

**"What was known" reads the recorded instruction.** A recorded decision context
carries `settings` rows (value and unit) built one-to-one, in order, from its
recorded `action` rows. The section prints each recorded value through the
formatter, using the parameter of the action row it was captured from. The
recorded values and units are never rewritten.

## ADR 451 — The carb ratio keeps its "<value> g/U" form

**Decision.** Only the correction factor moves to an insulin-first form. A carb
ratio prints "<value> g/U" on every desk line, as it does today, and the change
adds the unit where a Pattern-carried carb-ratio figure printed none ("lower to
9 g/U").

**Why.**

- R451 binds each displayed value to "its CONTEXT.md user form". CONTEXT.md
  gives the correction factor an insulin-first form and bans mg/dL/U. It gives
  the carb ratio only its label, "Carb ratio", and does not ban g/U.
- The operator authored Diagnose's carb-ratio headline templates on 2026-09-03
  with "Measured <value> g/U". The surfaces requirement "Headlines are authored
  with the operator from the engine's facts" governs those templates.
- An insulin-first carb ratio would either split the desk by destination
  (Changes one form, Diagnose's headlines, queue, inspector and dock another) or
  reopen those operator-authored templates.

R451's recorded gloss reads "insulin unit first for correction factor and carb
ratio". That conflict went back to the release coordinator with this default.

## ADR 451 — A record keeps the explanation it recorded

**Decision.** The desk prints a recorded explanation as recorded:

- the Plan's "What was known";
- the record's "Original explanation";
- the Focus or Trial context line.

A record written before this change keeps "ISF", "Carb ratio (I:C)" or "Basal
profile" there. Records written after it carry the label (ADR 451 above).

**Why.** Those lines are the saved record of what the app said when the decision
was made (S54: the saved record distinguishes the original decision context).
Rewriting recorded words on display would make a record claim something it
never said.

## Revise preparation

- **Lifecycle:** `revise`, routed by UI Craft on 2026-09-23 (`shipped`,
  `runnable`, declaration `complete`, data source `manufactured`). The work is
  convergent: the wording is settled, so no wireframe phase opens.
- **Safe start:** `AGENTS.md`, "The data boundary". The QA copy-then-serve
  command (`--no-fetch`, `--token ''`) runs over a named case store emitted by
  `scripts/gen_qa_e2e_db.py --case isf-strengthen`, which is generated entirely
  by `scripts/gen_qa_e2e_db.py`.
- **Base:** origin/main `b03431d2b937b46bdabbb2de1e6ba0ba6c6b57b1` (#456).
- **Base replay:** main push CI run 35959034199 on that exact commit replayed
  the complete desk ledger (171 selected) green at 1280x720 and 1440x900. No
  local base replay was run: the release brief forbids port-bound legs in
  triage.
- **Inventory diff:**
  - No replay story or browser suite asserts a setting concern's title,
    "mg/dL/U", "g/U", "ISF" or "I:C" on the lines this change moves (searched
    across `frontend/*.replay.mjs`, `frontend/replay-assertions.mjs` and
    `frontend/*.browser.test.mjs`).
  - S55 needs a "·" in a record's title. The record title keeps it, and its
    form does not change.
  - No story is amended or retired.
- **Added stories:** S177–S179 on the manufactured case store isf-strengthen.
  - S177: Changes' Action figure.
  - S178: Diagnose's queue numbers, the correction-factor inspector and the
    staged dock title.
  - S179: the recorded Plan's "What was known".

  Each is recorded in the ticket's own section,
  `## #451 amendment — 2026-09-23`, at the end of
  `mockups/harmonic-v2-desktop.behavior.md`. No `★ FROZEN` block, header
  inventory line or earlier story body is edited. S177 joins the PR smoke slice,
  so the new case store stays covered.
- **Sanction:** Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out
  yourself from here"); coordinator ruling R451.
- **Renders owed** (coordinator-run, before/after, 1280x720 and 1440x900), all
  on isf-strengthen:
  - Changes plain arrival: the Action figure.
  - Diagnose: the correction-factor queue row and its inspector.
  - The dock's staged title.
  - The recorded Plan's "What was known".

## Risk contract

- **Must prevent:**
  - a desk line this change owns naming a setting concern "ISF", "Carb ratio
    (I:C)" or "Basal profile", or printing mg/dL/U after a correction-factor
    value;
  - a printed value that differs from the served number (silent incorrect
    success);
  - any change to served `units`, recommendation values, caps, floors,
    `asserts_move`, staging, Priority or the set-aside comparison, including a
    set-aside concern returning because its title changed;
  - a record's recorded words rewritten;
  - real data in any fixture, capture or log.
- **Must recover:** none.
- **Accepted failure:** a record written before this change keeps its recorded
  engine title in its explanation lines.
- **Unsupported:** viewports other than the two supported desktop sizes.
- **Evidence owed:**
  - a backend test through guidance's public read: each manufactured case's
    setting concern carries its label, an absent setting preference is named,
    and the baseline is unchanged;
  - a node test for each moved line, failing first on the base;
  - S177–S179 replayed at both sizes, failing on the base and passing on the
    branch;
  - the renders above.
- Why: these lines sit on an advisory dosing surface, so the harm is a misread
  setting or unit, not downtime. Disposition: admitted here from
  `docs/scope/451-setting-concern-labels.md`.

## Traps for the implementer

- **Settings never lead.** Settings are never guidance's selection
  (`build_guidance` excludes `kind == "setting"` from `selection_rows`), and the
  desk sets aside only the served selection (`changes.js`,
  `aside.subject = selectedConcern()?.subject`). So a setting concern's own
  frame (nameplate, Action header, "leads now") is reached only when guidance
  serves one. The node test drives it through the Changes mount. On served data,
  the reachable instances are:
  - the Pattern Action figure (case ic-lower or isf-strengthen);
  - set-aside rows from durable preferences;
  - the Plan's "What was known";
  - the record views.
- **Return reasons carry the engine unit but print nowhere.** `_describe` prints
  mg/dL/U inside guidance's return reasons. No desk line prints those: Changes
  shows `return_reason` only for a set-aside concern, whose only possible
  reason is the comparison-version sentence. Leave `_describe` as it is.
- **Diagnose's finding titles are not guidance titles.** Diagnose's "ISF ·
  <direction>" and "I:C <span> · <direction>" finding titles come from the
  findings projection (`_title` in `ciq_autotune/findings_projection.py`). They
  are pinned in `mockups/findings-projection.mirror.mjs`, the committed fixture
  and the QA finding-title literals. This change does not touch them, nor the
  correction-factor inspector's "ISF" head.
- **Dead status strip.** `diagnose-workstation.js` writes an "ISF … mg/dL/U"
  line into `#status-src`, an id no shipped shell renders. It is not a desk
  line. Leave it.
- **Test stubs.** `frontend/guidance.test.js` stubs a setting concern titled
  "Basal profile". Change it to the served label so the stub keeps the served
  shape.
- **Overlapping tickets.** Other tickets in this release edit neighbouring
  lines; the coordinator merges:
  - #445, #449/#450 and #452: `history.js` and `follow-up.js`;
  - #446: `changes.js`;
  - #447: the dock's day count in `watched-change-dock.js`;
  - #453: `plan.js`.
