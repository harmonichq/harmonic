# #413 desk design completion — design

## ADR 413 — The #413 design lands in the shared modules the desk renders

### Decision

The rail, basal lane, rail mini, loading frame and default-window changes are
made directly in the modules that render them (`frontend/diagnose-findings-queue.js`,
`frontend/diagnose-workstation.js`, the three mini builders, `frontend/frame.js`,
`frontend/diagnose.js`) and in the stylesheets the desk imports. There is no
composition switch and no second rendering path.

### Supersedes

The earlier ADR 413 of this change (2026-09-20, "the #413 design lands on the v2
desk only"), which threaded a desk composition statement through the shared
workstation so that v1 would render unchanged. #418 (ADR 416, `openspec/changes/retire-v1/design.md`,
"Sequencing against #413") deleted v1 and recorded that #413 "no longer needs the
desk-only path". The branch, the byte-identical-v1 tests and v1's ledger legs
existed only for v1 and are dropped.

### Consequences

The desk is the only reader of these modules, so a change here is a change to
the desk. `frontend/theme.css` design tokens are not changed; paint uses the
existing tokens.

## ADR 413 — The backend serves the count sentence

### Decision

The findings projection serves count sentences beside the `headline` it already
owns, from one closed outcome table: one per count-bearing Pattern row, keyed by
the Pattern's served key, and one per served family appearance of a Cause row,
keyed by the lever and that appearance's family. A family cannot be the key:
highs after meals and lows after meals are both counted in meals and end in
opposite words, and a Cause in two families keeps both counts, never a merged
total (glossary term 35). The desk prints them in served order. The frontend's
Pattern word constant (`PATTERN_COPY` in `frontend/diagnose-findings-queue.js`)
is deleted, including its use for the Pattern mini's cohort label in
`frontend/diagnose-evidence-charts.js`, which reads served words instead.

### Authority

Connor's design lock on #413, 2026-09-14: "`n of d noun outcome` on every row,
causes included, from served words." Confirmed 2026-09-20: "Backend."

### Grounding

Measured on origin/main eec4652a (2026-09-22) by adding a probe field beside
`headline` and running every Python drift check CI runs, the acceptance
case-cache check included: exactly three generators drift
(`mockups/harmonic-v2.exploration/generate.py`,
`scripts/gen_findings_projection_fixtures.py`,
`scripts/gen_eating_sequence_fixtures.py`), rewriting
`frontend/__fixtures__/findings-projection.json`,
`mockups/eating-sequence-findings.synthetic/payload.json` and the exploration's
`focus.json`, `journey.json`, `setting.json` and `workstation.json`. The QA
showcase, its case expectations and the case cache do not move. The
fixture-only browser mirror (`mockups/findings-projection.mirror.mjs`, decision
record 735) must answer the new field.

### Consequences

A Pattern key or lever-and-family pair added later without outcome words fails
the projection's tests and cannot merge, so the desk carries no fallback
wording. Setting rows keep their now-to-then figures; they carry no count
sentence. The served `headline`, which already reads "title in k of n noun"
for a Pattern, stays byte-identical: the count sentence is a separate field,
not a rebuild of it.

## ADR 413 — The Cause outcome table covers every lever and family

### Decision

The Cause outcome table in `ciq_autotune/findings_projection.py` holds one entry
for every lever in the `Lever` enum crossed with every family a Cause appearance
can be filed under: the four exposure families (lows, meals, highs, correction
clusters), narrowed only where code narrows them — a lever whose evidence policy
has no recurrence family is filed under its one recurrence noun, and the two
sequence levers only under sequences. The projection test builds that set from
the same code and asserts the table's keys equal it.

### Why

Implementation found that the set of pairs the projection can emit is not closed
by any table: the analysis stamps a Cause's lever on whichever anchor coincides
in time with the trigger, so the family an appearance lands in is a fact about
the data. A synthetic store already produced a missed-meal appearance among
meals that no evidence policy predicts. A table keyed only on the pairs the
fixtures happened to produce would pass its tests and then raise inside the
projection on real data, taking the Diagnose findings read down — the opposite
of "nothing degrades at run time" in this change's risk contract. Closing the
table over the code-derived cross product makes the accepted failure the only
failure: a lever or family added later without words fails the backend test.

### Consequences

About two dozen outcome phrases exist for pairs that are rare in practice; each
says what the counted event followed ("followed a missed meal"). The frontend
still holds no word list. Coordinator decision during #413 execution, 2026-09-22.

## Revise preparation

- **Lifecycle:** `revise`, routed by UI Craft on 2026-09-20 (`shipped`,
  `runnable`, declaration `complete`, data source `manufactured`) and re-grounded
  on 2026-09-22 against the single-shell tree. Convergent work: the direction is
  ruled, so no wireframe phase opens.
- **Safe start:** `AGENTS.md`, "The data boundary", the QA copy-then-serve
  command: `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port
  8765` over a copy of `mockups/qa-e2e.synthetic/harmonic.sqlite`, or a named
  case store emitted by `scripts/gen_qa_e2e_db.py --case <name>`. Both are
  generated entirely by `scripts/gen_qa_e2e_db.py`; no other source is used.
- **Base:** origin/main `eec4652a8f1109aa62d126ce3a0b4f24973194b0` (#418).
- **Base replay:** the main push CI run on that exact commit, 35785233892, which
  replays the complete desk ledger (142 issued, 123 active, 19 retired) at
  1280x720 and 1440x900. No local base replay was run.
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
  frontend.
- **Must recover:** none.
- **Accepted failure:** a Pattern key or lever-and-family pair added later
  without outcome words fails the backend test and cannot merge; nothing degrades
  at run time.
- **Unsupported:** viewports other than the two supported desktop sizes.
- **Evidence owed:** rendered checks at both desktop sizes that fail on the base
  for the clipped lane key, unpainted hold cells, sibling member rows, the
  Overnight arrival and the blank loading block; a projection test that every
  count-bearing row serves its outcome words; the mirror comparison; the desk
  ledger's inherited stories preserved.
- Why: these rows are read as advisory dosing guidance, so the harm is a wrong
  sentence or verdict, not downtime. Disposition: admitted here from
  `docs/scope/413-finish-404-design.md`; the v1 clauses were removed on
  2026-09-22 because v1 no longer exists.
