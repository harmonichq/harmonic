# #451 — setting names, the correction factor's user form, and served words for ids and codes

Scope ledger. Opened 2026-09-23 by delegated triage (release brief for
#442–#457). Route: nothing for a specialist. Wording and breadth are settled by
coordinator ruling R451 as corrected and by the coordinator's widening of #451.
Both come under Connor Griffin's Q3 delegation of 2026-09-23 ("figure it out
yourself from here").

## Decisions

- Classification: code. Why: reproduced render defects plus served fields.
  `inline`
- Guidance serves a setting concern's `title` from `_SETTING_TITLES`. The tuning
  lever's title, `priority_inputs`, `units` and `_state` stay unchanged. Why:
  guidance already owns the one reader-facing name per setting subject (ADR
  426). R451. `→ ADR`
- One subject-name lookup in guidance serves names for set-aside subjects and for
  recorded Plan subjects. Its sources:
  - settings: the setting-label table;
  - habits: `levers.title`;
  - Patterns: the outcome roster's name, through a public lookup over
    `_ROSTER`;
  - the uncaused-highs investigation: its title constant.

  There is no override branch: habit subjects are closed over `Lever`, which
  has no override member. Why: coordinator widening (c) and (b), 2026-09-23.
  `→ ADR`
- Diagnose's setting findings are titled "Correction factor …" and "Carb ratio
  <span> …". The correction-factor panel's heading, breadcrumb and scope
  sentence say "Correction factor". The JS mirror, both fixtures and the six QA
  finding-title literals move with it, the literals by the coverage-era dump.
  Why: coordinator widening (a). `→ ADR`
- One desk formatter, `settingValue`, lives in `plan.js`. A correction factor
  reads "1 U : <value> mg/dL" on every desk line. Why: CONTEXT.md; four desk
  modules each spelled the form. `→ ADR`
- The carb ratio keeps "<value> g/U" everywhere; only the missing unit is added.
  Why: coordinator ruling on Q1, 2026-09-23. R451's insulin-first carb ratio
  was withdrawn, because CONTEXT.md defines none. `→ ADR`
- Recorded explanations print as recorded; new records carry the label. Why:
  coordinator ruling on Q2, 2026-09-23. `→ ADR`
- Changes prints the served disposition in words, drawn from existing desk copy.
  Why: coordinator addition from #449's triage, 2026-09-23. `→ ADR`
- The dead `#status-src`/`#status-clock` writes are deleted. Why: no shipped
  markup declares either id. Coordinator widening (d). `→ ADR`
- Three serial chunks, all on Opus:
  1. backend names and their generated parity;
  2. the Changes and Diagnose desk lines;
  3. the watch dock plus the ledger amendment and replay.

  Why: three slicing traits fire (multiple deliverable artifacts; a live run
  against the offline server; lockstep copies of the finding title across the
  projection, the JS mirror, two fixtures and the QA literals). The rubric's
  registry and lifecycle boundary is absent, and each remaining chunk projects
  between 120k and 180k. Operator instruction: every chunk runs on Opus.
  `inline`
- S177–S179 are new stories on case store isf-strengthen, and S177 joins the
  smoke slice. Why: it is the manufactured case that serves a correction-factor
  concern with a staged action. `inline`

### Risk contract

- **Must prevent:**
  - a desk line this change owns printing "ISF", "I:C", "Carb ratio (I:C)",
    "Basal profile", "mg/dL/U", a raw guidance subject id or a raw disposition
    code;
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
  - A legacy set-aside subject outside today's closed subject set still
    prints its identifier.
- **Unsupported:** viewports other than the two supported desktop sizes.
- **Evidence owed:**
  - Backend tests through the public reads:
    - guidance's setting titles and set-aside names for setting, habit and
      Pattern subjects, with the baseline unchanged;
    - the Plan history read's served subject names;
    - the projection's setting finding titles;
    - the QA case tests over the re-dumped finding-title literals.
  - A node test for each moved desk line, failing first on the base.
  - S177–S179 replayed at both sizes, failing on the base and passing on the
    branch.
  - Before/after renders on isf-strengthen.
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
  - the committed QA literal for isf-strengthen carries the finding title "ISF
    · strengthen", and four carb-ratio literals carry "I:C 00:00 to 24:00 · …";
  - `knownSection` prints `context.subjects` raw;
  - no shipped markup declares `status-src` or `status-clock`.

## Review rounds

- Pre-review coordinator rulings (2026-09-23) on lock 1's draft at 95159944:
  - Q1 and Q2 took their defaults;
  - #451 was widened by (a)–(d) and by the disposition words;
  - every chunk runs on Opus.

  The change was re-authored and re-pinned; the lock draft awaits
  `/plan-review`.
