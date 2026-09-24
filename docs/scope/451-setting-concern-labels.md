# #451 — a setting concern is titled by the engine and a correction factor prints mg/dL/U

Scope ledger. Opened 2026-09-23 by delegated triage (release brief for
#442–#457). Route: nothing for a specialist. The wording is settled by
coordinator ruling R451 under Connor Griffin's Q3 delegation of 2026-09-23
("figure it out yourself from here"). The one conflict inside that ruling went
back to the release coordinator with a default (Open questions).

## Decisions

- Classification: code. Why: six reproduced render defects and one served
  field. `inline`
- Guidance serves a setting concern's `title` from `_SETTING_TITLES`, including
  an absent setting-subject preference row, looked up by the whole subject. The
  tuning lever's title, `priority_inputs`, `units` and `_state` stay unchanged.
  Why: guidance already owns the one reader-facing name per setting subject
  (ADR 426). R451. `→ ADR`
- One desk formatter, `settingValue`, moves from `history.js` to `plan.js`, and
  every line printing a setting value with its unit calls it. Why:
  - four desk modules spelled the correction factor's user form, and three unit
    tables spelled mg/dL/U;
  - `plan.js` is the cycle-free leaf (history → follow-up → plan-view blocks the
    other homes).

  `→ ADR`
- The sweep covers every desk line printing a setting concern's served title or
  a correction-factor value with mg/dL/U. On Changes: the Action figure, the
  Plan's "What was known" and the set-aside rows. On Diagnose: the findings
  queue's numbers, the correction-factor inspector and the staged title. Plus
  the watched-change dock's Trial title. Why: coordinator instruction for #451
  ("sweep every desk line … all are in scope"). `inline`
- The carb ratio keeps "<value> g/U" everywhere; only its missing unit on a
  Pattern-carried Action figure is added. Why:
  - CONTEXT.md's user form for the carb ratio is its label and g/U; it bans
    only mg/dL/U;
  - the operator-authored Diagnose headline templates print g/U;
  - an insulin-first carb ratio splits the desk by destination or reopens those
    templates.

  Default pending the coordinator (Q1). `→ ADR`
- Recorded explanations print as recorded. Why: the record is what the app said
  at the time (S54). Default pending the coordinator (Q2). `→ ADR`
- Two serial chunks. Chunk 1 holds the served title plus the Changes and Diagnose
  value lines. Chunk 2 holds the dock and staged title, the ledger amendment and
  the three replay stories. Why: two slicing traits fire (a served contract plus
  a desk consumer plus a ledger; replay against the offline server), and each
  chunk projects at or above the 120k floor. `inline`
- S177–S179 are new stories on case store isf-strengthen; S177 joins the smoke
  slice. Why: no mapped store serves a correction-factor concern with a staged
  action; isf-strengthen is the manufactured case that does. `inline`

### Risk contract

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
  - before/after renders of the affected states on isf-strengthen.
- Why: these lines sit on an advisory dosing surface, so the harm is a misread
  setting or unit, not downtime. Disposition: copied unchanged into
  `openspec/changes/setting-concern-labels/design.md`.

## Open questions

- Q1 (coordinator). R451's recorded gloss asks for "insulin unit first for
  correction factor and carb ratio". CONTEXT.md defines no insulin-first carb
  ratio, and Diagnose's operator-authored headlines print g/U. Default encoded:
  the carb ratio keeps g/U. If the coordinator reaffirms the insulin-first carb
  ratio, it must choose Changes-only (the desk prints the carb ratio two ways) or
  desk-wide. Desk-wide reopens the carb-ratio headline templates under the
  surfaces requirement that headlines are operator-authored, with their JS mirror,
  fixture and QA literals.
- Q2 (coordinator). Recorded explanations of records written before this change
  keep their engine title. Default: print as recorded.

## Spawned tasks

None. The release rule is that nothing is filed as a follow-up; findings go to
the coordinator.

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
  - a setting concern frame prints "ISF" and "strengthen to 32 mg/dL/U";
  - the set-aside list prints `setting:isf`;
  - Diagnose's queue prints "now 30.0 mg/dL/U → 32.0 mg/dL/U";
  - the dock titles a correction-factor Trial "ISF · 30.0 → 32.0 mg/dL/U".

## Review rounds

- (none yet; the coordinator dispatches `/plan-review` on the lock draft)
