# #413 v2 desk design completion — design

## ADR 413 — The #413 design lands on the v2 desk only

### Decision

The rail, basal lane, rail mini and default-window behavior of this change are
reached only through the v2 desk's composition of the shared Diagnose
workstation. The desk states that composition once, where it mounts the
workstation (`frontend-v2/diagnose.js` through
`createDiagnoseEventComparison({ root, callbacks })`, which passes it to
`createDiagnoseWorkstation`), and the shared rail, lane and mini code reads that
one statement. Absent it, every shared module renders exactly what it renders
today. Paint that needs no markup change lives in `frontend-v2/desk.css`, which
v1 never loads.

### Authority

Connor, 2026-09-20, asked whether v1 changes too: "B, drop V1 development
entirely. I need a new ticket to retire it fully as well." The retirement is
#416.

### Consequences

v1's frozen workstation, event-comparison and verify ledgers are not amended and
must pass as they are. The shared modules carry one desk branch until #416
deletes v1 and with it the v1 side of that branch; this is a known, dated
duplication, accepted because re-freezing a 168-story ledger for an app being
retired buys nothing. No second rail, lane or mini implementation is created:
the desk branch lives inside the existing modules.

## ADR 413 — The backend serves the count sentence

### Decision

The findings projection serves one count sentence per count-bearing Pattern and
Cause row, beside the `headline` it already owns, from one closed
family-to-outcome table. The desk prints it. The frontend's Pattern word
constant stays only on the v1 path and goes with v1.

### Authority

Connor's design lock on #413, 2026-09-14: "`n of d noun outcome` on every row,
causes included, from served words." Confirmed 2026-09-20: "Backend."

### Grounding

Measured on origin/main 6821bbf6 by adding a probe field beside `headline` and
running every Python drift check: exactly three generators drift
(`mockups/harmonic-v2.exploration/generate.py`,
`scripts/gen_findings_projection_fixtures.py`,
`scripts/gen_eating_sequence_fixtures.py`), rewriting
`frontend/__fixtures__/findings-projection.json`,
`mockups/eating-sequence-findings.synthetic/payload.json` and the exploration's
`focus.json`, `journey.json`, `setting.json` and `workstation.json`. The QA
showcase and its case expectations do not move. One backend test pins the row
shape, the eating-sequence fixture's determinism test, and regeneration
satisfies it. The fixture-only browser mirror
(`mockups/findings-projection.mirror.mjs`, decision record 735) must answer the
new field.

### Consequences

A family added later without outcome words fails the projection's tests and
cannot merge, so the desk carries no fallback wording. Setting rows keep their
now-to-then figures; they carry no count sentence.

## Revise preparation

- **Lifecycle:** `revise`, routed by UI Craft on 2026-09-20 (`shipped`,
  `runnable`, declaration `complete`, data source `manufactured`). Convergent
  work: the direction is ruled, so no wireframe phase opens.
- **Safe start:** `AGENTS.md`, "The data boundary", the QA copy-then-serve
  command: `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port
  8765` over a copy of `mockups/qa-e2e.synthetic/harmonic.sqlite`, or a named
  case store emitted by `scripts/gen_qa_e2e_db.py --case <name>`. Both are
  generated entirely by `scripts/gen_qa_e2e_db.py`; no other source is used.
- **Base:** origin/main `6821bbf6352544686960458ddcb8d0f255e43e0a`.
- **Base replay:** scheduled CI run 35513963144 on that exact commit replayed the
  complete desk ledger, 142 stories selected, green in all four shards at
  1280x720 and at 1440x900, with the v1 workstation and verify ledgers green in
  the same run. No local base replay was run.
- **Inventory diff:** the desk ledger holds no story for the rail's claimed
  member rows, the lane key or verdict paint, the default window on a cold
  arrival, or the cold loading block's content. Each becomes a story with a
  replay function in this change, proved failing on the base before it passes.
  Existing desk replays and tests read the changing facts in few places (claimed
  rows, the Overnight default, `.gf-loading`); each is re-read for intent in the
  chunk that changes the fact.
- **Sanctioned changes to shipped desk behavior** (Connor, #413 design lock,
  2026-09-14):
  - Member minis leave the rail: "No member minis in the rail; the parent's mini
    stands for the group."
  - Claimed causes stop being sibling rows: "Pattern members fold under their
    parent on the parent's spine, one line each".
  - The default window changes: "Default window on load is 24 h."
  No other shipped desk behavior is retired.
- **Visual reference:** Connor's locked mockup, claude.ai artifact
  `4cfa1bf6-c45f-4b51-8862-fd43b58560f1` version 2, "stands as drawn". It is a
  decision record, not a lock manifest; the app's tokens win on any value.

## Risk contract

- **Must prevent:** real glucose, insulin or schedule values in any committed
  fixture, capture or screenshot; a rail row whose printed sentence, tier, rank
  or lane verdict differs from what the backend served (silent incorrect
  success); any staging, verdict, floor or ranking decision moving into the
  frontend; any change to what v1 renders.
- **Must recover:** none.
- **Accepted failure:** a family added later without outcome words fails the
  backend test and cannot merge; nothing degrades at run time.
- **Unsupported:** v1; viewports other than the two supported desktop sizes.
- **Evidence owed:** rendered checks at both desktop sizes that fail on the base
  for the clipped lane key, unpainted hold cells, sibling member rows, the
  Overnight arrival and the blank loading block; a projection test that every
  count-bearing row serves its outcome words; the mirror comparison; v1's
  ledgers unchanged and green; the desk ledger's inherited stories preserved.
- Why: these rows are read as advisory dosing guidance, so the harm is a wrong
  sentence or verdict, not downtime. Disposition: admitted here from
  `docs/scope/413-finish-404-design.md`.
