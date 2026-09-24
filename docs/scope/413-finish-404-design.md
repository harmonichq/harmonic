# Scope ledger: #413 finish the missed #404 design

Routed by `/scope` to interview mode on 2026-09-20. A locked design exists
(Connor's 2026-09-14 design-lock comment on #413 and the mockup it names); what
remains untested is how it lands in the code that exists.

## Decisions

- **The 2026-09-14 design lock is the scope.** Rail member fold, rail urgency,
  one mini, one count grammar, lane key and verdict paint, 24 h default window,
  cold loading skeleton, plus the evidence repair in the issue body. Why: Connor
  locked it on the ticket. Disposition: inline.
- **Payload and window retention, the record-open loading state and roster
  cleanup are out.** Why: split to #414, merged as #415. Disposition: inline.
- **Profile: none.** Why: `AGENTS.md` declares no `Harden:` command.
  Disposition: inline.
- **Q1: the v2 desk changes; v1 stays exactly as it is.** Connor, 2026-09-20: v1
  development stops entirely. The rail, lane, mini and default-window changes are
  reached only through the desk's composition of the shared workstation, and v1's
  frozen ledgers must stay green untouched. Why: v1 is being retired, so no work
  is spent on it or on re-freezing its ledger. Disposition: inline.
- **v1 retirement is its own ticket.** Why: Connor asked for it. Disposition:
  → issue, discharged as #416.
- **Q2: the backend serves the count sentence's outcome words for every ranked
  row, Patterns included.** The desk prints served words and keeps no word list
  of its own. Why: the design lock says served words. Disposition: → ADR, in
  this change's `design.md`.
- **Q3: a new change, `v2-desk-design-completion` (renamed `desk-design-completion` on 2026-09-22), records this work** and states
  that it supersedes task 3.3's completion claim in `v2-findings-ledger`, which
  is left as written. Why: Connor delegated it; one ticket, one change.
  Disposition: inline.
- **A row identity with no served outcome words cannot ship.** The projection
  owns the words for its closed sets of Pattern keys and lever-and-family pairs and a backend test pins that every
  ranked row carries them, so the desk carries no fallback. Why: the charter's
  earn-every-guard rule; defaulted, not asked. Disposition: inline.

### Risk contract

- **Must prevent:** real glucose, insulin or schedule values in any committed
  fixture, capture or screenshot; a rail row whose printed sentence, tier, rank
  or lane verdict differs from what the backend served (silent incorrect
  success); any staging, verdict, floor or ranking decision moving into the
  frontend; any change to what v1 renders.
- **Must recover:** none.
- **Accepted failure:** a Pattern key or lever-and-family pair added later
  without outcome words fails the backend test and cannot merge; nothing degrades
  at run time.
- **Unsupported:** v1; viewports other than the two supported desktop sizes.
- **Evidence owed:** rendered checks at both desktop sizes that fail on today's
  main for the clipped lane key, unpainted hold cells, sibling member rows and
  the blank loading block; a projection test that every ranked row serves its
  outcome words; the mirror comparison; v1's ledgers unchanged and green; the
  desk ledger's inherited stories preserved.
- Why: advisory dosing guidance read off these rows; the harm is a wrong
  sentence or verdict, not downtime. Disposition: copied into the change's
  `design.md` at admission.

## Grounded facts (origin/main 6821bbf6)

- The v2 desk embeds the shipped v1 workstation and restyles it in
  `frontend-v2/desk.css`. The rail, the lane, the minis and the window presets
  live in shared `frontend/` modules that v1 at `/` also renders, and v1's frozen
  workstation ledger reads the lane key text and the rail structure.
- The lane key renders below the cells inside a wrapper that clips it. Hold
  cells are unpainted.
- Each claimed Pattern member is its own rail row with a gutter mark, a drill and
  a mini.
- Pattern outcome words ("ran high") are a frontend constant. Cause rows are
  served a count, a denominator and a noun, and no outcome phrase.
- Tiers are stamped by the server; the frontend only labels them.
- Three separate builders draw the three rail minis.
- The workstation boots on the overnight window; the v2 owner selects 24 h only
  for a Pattern subject.
- The cold loading frame is an empty field-coloured block.
- `openspec/changes/archive/2026-09-24-v2-findings-ledger` (#404) is still active and unarchived
  with task 3.3 checked; #404 is closed but was never finalized.

## Review rounds

- **Panel 1, 2026-09-21, cold Opus at high effort: BLOCKED, four blockers, one
  note, all reproduced against the tree before acting.** (1) authoring: outcome
  words cannot be keyed by family, two meals Patterns end in opposite words;
  re-keyed to the Pattern key and the lever-and-family pair. (2) authoring: a
  Cause serves one count per family appearance, so the served shape is one
  sentence per appearance, never merged. (3) authoring: the desk ledger's story
  counts are pinned in the acceptance wrapper, which the evidence sub-order could
  not touch; allowlist widened and the counts named in tasks 2.4, 3.6, 4.4.
  (4) authoring: the full desk ledger command was cited to a block that does not
  hold it; the wrapper's replay leg is now named. Note: the two parallel
  sub-orders both listed the task checklist; it now has one owner.

## Re-triage after #418 (2026-09-22)

#418 (ADR 416) merged as eec4652a: v1 is deleted, the desk is the only shell at
`/`, and `frontend-v2/` folded into `frontend/`. `/scope` found nothing
genuinely uncertain; the decisions below are defaults that follow from ADR 416.

### Decisions

- **Q1 is superseded: the design lands directly in the shared modules.** No
  composition statement, no desk branch, no v1-unchanged tests, no v1 ledger
  legs. Why: `openspec/changes/retire-v1/design.md` "Sequencing against #413"
  records that #413 no longer needs the desk-only path. Disposition: → ADR,
  rewritten as ADR 413 in the change's `design.md`.
- **The frontend Pattern word constant is deleted**, including its use for the
  Pattern mini's cohort label. Why: Q2's served words leave it no reader once v1
  is gone. Disposition: inline (task 3.3).
- **The change folder is renamed `desk-design-completion`.** Why: ADR 416 takes
  the v2 name out of the living system; this change was never pinned by an
  executed lock. Disposition: inline.
- **`frontend/diagnose-workstation.css` may change; `frontend/theme.css` tokens
  may not.** Why: the desk imports both now, so the old ban protected only v1;
  token values stay the app's. Disposition: inline.
- **Base eec4652a; base replay is main push CI run 35785233892.** Disposition:
  inline.
- **Risk contract:** the v1 clauses are removed; the rest is unchanged.
  Disposition: copied into `design.md`.

### Grounded facts (origin/main eec4652a)

- Every desk file lock 1 named kept its file name under `frontend/`; the desk
  replay is now `frontend/desk-behavior.replay.mjs`. The ledger, sweep and
  exploration paths keep their `harmonic-v2` names as historical records.
- The ledger inventory pins 142 issued, 123 active, 19 retired.
- A probe field beside `headline` drifts the same three generators and six
  fixture files as on 6821bbf6; the new acceptance case-cache check stays clean.
- The desk imports `diagnose-workstation.css` and `theme.css` from `main.js`.
- The browser gates are the desk suite, the follow-up suite, the browser-runner
  regression and the desk ledger replay.

### Review rounds (lock 2)

- **Panel 1, 2026-09-22, cold Opus at high effort (Claude-only), three passes,
  COUNTERSIGNED.** Pass 1 BLOCKED, three blockers and four notes, all reproduced:
  (1) authoring: the frontend Pattern word table also decides a cause's parent
  family and three eligibility checks; task 3.3 now names a served replacement
  for each. (2) authoring: the served `headline` already carries the Pattern
  count; it is pinned byte-identical and the count sentence is additive.
  (3) authoring: the full-ledger cost was 13 minutes against a recorded 25 to 35
  per size. Notes: the 24 h pre-state, the wrapper dropping `ONLY`, the stale
  ACCEPTANCE.md inventory, and the base CI run (verified green outside the
  reviewer's sandbox). Pass 2 BLOCKED on one injected blocker: the iteration
  command lived only in the header. Notes: pin the overnight presets and name
  the case-file invariant. Pass 3 clean.

## Open questions

None.

## Spawned tasks

- #416: retire the v1 app.
