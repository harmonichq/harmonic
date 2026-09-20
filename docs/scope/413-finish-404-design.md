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
- **Q3: a new change, `v2-desk-design-completion`, records this work** and states
  that it supersedes task 3.3's completion claim in `v2-findings-ledger`, which
  is left as written. Why: Connor delegated it; one ticket, one change.
  Disposition: inline.
- **A finding family with no served outcome words cannot ship.** The projection
  owns the words for its closed family set and a backend test pins that every
  ranked row carries them, so the desk carries no fallback. Why: the charter's
  earn-every-guard rule; defaulted, not asked. Disposition: inline.

### Risk contract

- **Must prevent:** real glucose, insulin or schedule values in any committed
  fixture, capture or screenshot; a rail row whose printed sentence, tier, rank
  or lane verdict differs from what the backend served (silent incorrect
  success); any staging, verdict, floor or ranking decision moving into the
  frontend; any change to what v1 renders.
- **Must recover:** none.
- **Accepted failure:** a family added later without outcome words fails the
  backend test and cannot merge; nothing degrades at run time.
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
- `openspec/changes/v2-findings-ledger` (#404) is still active and unarchived
  with task 3.3 checked; #404 is closed but was never finalized.

## Open questions

None.

## Spawned tasks

- #416: retire the v1 app.
