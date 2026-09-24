# #451 — setting names, the correction factor's user form, and served words for ids and codes

Scope ledger. Opened 2026-09-23 by delegated triage (release brief for
#442–#457). Route: nothing for a specialist. Wording and breadth are settled by
coordinator ruling R451 as corrected, the coordinator's widening of #451, and
its plan review round 1 rulings. All come under Connor Griffin's Q3 delegation
of 2026-09-23 ("figure it out yourself from here").

## Decisions

- Classification: code. Why: reproduced render defects plus served fields.
  `inline`
- Guidance serves a setting concern's `title` from `_SETTING_TITLES`;
  `priority_inputs`, `units` and `_state` are unchanged. Why: R451; ADR 426's
  label table. `→ ADR`
- One subject-name lookup in guidance serves names for set-aside subjects and
  for recorded Plan subjects, with no Pattern or override branch. Its sources:
  - settings: the setting-label table;
  - habits: `levers.title`;
  - the uncaused-highs investigation: its title constant.

  Why: widening (b) and (c). Round 1 found the Pattern branch unreachable,
  because the roster serves every Pattern present. `→ ADR`
- An unnamed set-aside row prints "A concern no longer in this read", and
  CONTEXT.md gains **Concern**. Why: round 1 item 6; never print an id.
  `→ ADR`
- The carb-ratio analyzer's served sentences pass every user-copy register
  rule: "carb ratio", no prose em dash, "identifiable meals" for "clean-start",
  and "(range …)" for "(CI …)".
  - Its three Findings reword the same way.
  - The new annotation-register test applies the full rule set.
  - Four fixtures are regenerated (analysis, findings-projection,
    ic-history-events, case files).
  - The QA queue-row literals and `test_analyzer_ic` pins are re-dumped.

  Why: round 1 item 1, widened by the coordinator's ruling on the register
  finding, 2026-09-24. `→ ADR`
- Diagnose's setting findings are titled "Correction factor …" and "Carb ratio
  <span> …". The mirror, three fixtures (two hand-written generator literals
  retitled) and the QA finding-title literals move with them. Rows tied on every
  earlier sort key may reorder by their new titles, which is accepted. Why:
  widening (a); round 1 items 5 and 7. `→ ADR`
- One desk formatter, `settingValue`, lives in `plan.js`, and the correction
  factor reads "1 U : <value> mg/dL" on every desk line. `→ ADR`
- The carb ratio keeps "<value> g/U". Why: ruling on Q1. `→ ADR`
- Recorded explanations print as recorded. Why: ruling on Q2. `→ ADR`
- Changes' status words come from the disposition and, under `eligible_action`,
  the served action's shape: "Ready to stage" or "Ready to start a Focus". Why:
  coordinator addition; round 1 item 2. `→ ADR`
- The dock's one-line title carries only the setting name, span and served
  direction, and the dock derives none. The from→to values move to the wrapping
  detail line, and S178 measures that nothing truncates. Why: round 1 item 3;
  AGENTS.md forbids a frontend-derived direction. `→ ADR`
- The dead `#status-src`/`#status-clock` writes are deleted. Why: widening (d);
  no shipped markup declares either id. `→ ADR`
- Four serial chunks, all on Opus:
  1. analyzer and projection wording with generated parity;
  2. guidance and Plan-history names;
  3. the Changes and Diagnose lines;
  4. the dock plus the ledger and replay.

  Why: three traits fire (multiple deliverable artifacts; lockstep copies of the
  finding titles and carb-ratio sentences across the projection, the mirror,
  three fixtures and the QA literals; a live run). Round 1's additions pushed the
  first chunk past the 180k target, so the guidance names split into their own
  chunk. That is four chunks, the rubric's ceiling. Two parallel backend chunks
  would both tick `tasks.md`, so the four run serially. `inline`
- S177–S179 are new stories on case store isf-strengthen, and S177 joins the
  smoke slice. `inline`

### Risk contract

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
  - Before/after renders on isf-strengthen.

  Tests of changed behavior fail first on the base. Invariance and served-data
  rendering tests are regression tests.
- Why: these lines sit on an advisory dosing surface, so the harm is a misread
  setting, unit or state, not downtime. Disposition: copied unchanged into
  `openspec/changes/setting-concern-labels/design.md`.

## Open questions

None. Q1 and Q2 were ruled by the coordinator on 2026-09-23.

## Spawned tasks

None. The release rule is that nothing is filed as a follow-up.

## Spikes

- `docs/scope/451-setting-concern-labels.repro.py`
  (`uv run python docs/scope/451-setting-concern-labels.repro.py`), on base
  b03431d2:
  - guidance titles isf-strengthen and isf-held "ISF", ic-lower and ic-held
    "Carb ratio (I:C)", and basal-lower "Basal profile";
  - the Pattern selected on isf-strengthen serves `units=None`;
  - a set-aside `setting:isf` preference over basal-lower comes back absent
    with `title=None`.
- `docs/scope/451-setting-concern-labels.repro.mjs`
  (`node docs/scope/451-setting-concern-labels.repro.mjs`), on base b03431d2:
  - Changes' Action figure prints "strengthen to 32 " and "lower to 9 ";
  - a setting concern frame prints "ISF", "strengthen to 32 mg/dL/U" and the
    disposition code "eligible_action";
  - the set-aside list prints `setting:isf`;
  - Diagnose's queue prints "now 30.0 mg/dL/U → 32.0 mg/dL/U";
  - the dock titles a correction-factor Trial "ISF · 30.0 → 32.0 mg/dL/U".
- Read from source on b03431d2:
  - the committed QA literals carry "ISF · strengthen", "ISF · weaken" and "I:C
    00:00 to 24:00 · …" finding titles, plus four carb-ratio queue-row
    headlines quoting "programmed I:C";
  - `knownSection` prints `context.subjects` raw;
  - no shipped markup declares `status-src` or `status-clock`;
  - `build_outcome_patterns` appends one row per roster entry;
  - a watched Trial and a carb-ratio block serve no direction.

## Review rounds

- Pre-review coordinator rulings (2026-09-23) on lock 1's draft at 95159944:
  - Q1 and Q2 took their defaults;
  - #451 was widened by (a)–(d) and by the disposition words;
  - every chunk runs on Opus.

  The change was re-pinned at 488f20bf.
- Plan review round 1 (coordinator-dispatched, 2026-09-24): BLOCKED, 8. All eight
  were ruled by the coordinator:
  1. carb-ratio sentences;
  2. status words from the action's shape;
  3. the dock's title and detail split;
  4. drop the Pattern branch;
  5. two generator literals;
  6. an unnamed-row phrase;
  7. accept the tiebreak reorder;
  8. the fail-first scope.

  All were fixed in one commit and re-pinned at 1d82f68a; the chunking was
  re-assessed from three to four.
- Coordinator ruling on the register finding (2026-09-24): widen. The
  carb-ratio sentences pass every register rule, and the guard applies all of
  them. The work stays in sub-order 1. Re-pinned; round 2 follows.
