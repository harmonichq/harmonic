# #453 design

## ADR 453 — S89 certifies the newest Plan record as the decision it recorded

### Decision

The Plan lifecycle replay story S89 reads the decision it records as the first
record the Plan history read serves. The server lists that history newest first.
S89 does not trust position alone: the assertion that reads the record also
proves it is the decision just recorded. The served history holds exactly one
more record than the read S89 made before recording, and the first record's
`applied_at`, the Plan's identity, names none of the records in that earlier
read. The failed-Withdraw check compares that same first record's withdrawal
with the certified decision's. The reload check keeps finding the record by
`applied_at`, which does not depend on order.

The two identity clauses are what #453's checklist asks for. The reproduction
(`docs/scope/453-s89-history-order.repro.mjs`) measured what each clause adds,
across five served histories: A (no earlier Plan), B (an older never-withdrawn
Plan listed), C (an older withdrawn Plan listed, the new withdrawal dropped),
D (history served oldest first) and E (no earlier Plan, recording writes two
rows).

| S89 body | A | B | C | D | E |
|---|---|---|---|---|---|
| base, last listed record | PASS | FAIL reload | PASS | PASS | FAIL reload |
| `history[0]` only | PASS | PASS | FAIL reload | FAIL reload | PASS |
| `history[0]` + `applied_at` clause | PASS | PASS | FAIL reload | FAIL decision | PASS |
| `history[0]` + length clause | PASS | PASS | FAIL reload | FAIL reload | FAIL decision |
| `history[0]` + both clauses | PASS | PASS | FAIL reload | FAIL decision | FAIL decision |

"reload" is the "Plan reloaded withdrawal" check and "decision" is the "Plan
durable decision" check.

- Reading `history[0]` alone already fails C and D, but only at the later
  reload check. In C that is the right check: S89 certified the new decision,
  and the reload shows its withdrawal was dropped. In D, S89 has by then
  certified the wrong record as its decision.
- The `applied_at` clause moves D's failure to the check where S89 certifies
  the decision.
- Only the length clause catches E. Without it, a recording that adds two rows
  passes.

The fake-page test pins each failure to its check, so removing either clause
fails the test.

### Sweep

Ruling R453 also asked for every other story that reads Plan history, or any
other newest-first served list, at its last index. The server serves three such
lists: Plan history (`Store.plan_history`, `ORDER BY applied_at DESC`), the Focus
records on `/api/focus` and `/api/verify/trials` (`follow_up_records("focus")`,
`pinned_at DESC`), and the Trial roster on `/api/verify/trials` (maturing Trials
first, then newest `changed_at`). `/api/prompts` picks answered prompts newest
first but serves the list in time order, oldest first, and no replay reads it.
The sweep covered `frontend/`, `mockups/sweep/` and `tests/`, and looked for
`at(-1)`, `[… length - 1]`, `slice(-…)`, `pop()`, `findLast` and reversal. It
found S89's two reads (`c2.replay.mjs:259` and `:275`) and nothing else on those
lists.

The other last-index reads in the replay modules index something else:

- DOM lane cells in S32 (`c2.replay.mjs:693`).
- A grid track in S5, and roster, slot, night and figure controls in S29, S43
  and S44 (`desk-behavior.replay.mjs`). Each picks "another control", never the
  newest record.
- The pump profile's covering segment (`c4.replay.mjs:1514` and `:1593`), which
  reverses a start-ascending schedule.

Every other replay read of those three lists takes `[0]` for the newest or finds
by identity.

### Ledger

S89's frozen text ("Plan draft, decision, pending reconciliation, mismatch,
match and withdrawal persist through the Plan lifecycle APIs") still describes
the story. What moves is which record its evidence certifies. #431 recorded the
same newest-first correction for S42 as a dated amendment, so this change does
the same. It adds a new section at the end of the ledger, and no story line. The
inventory stays 171 issued, 152 active, 19 retired. The settled wording:

```
## #453 amendment — 2026-09-23

Replay S89 now certifies the Plan decision it records (ADR 453,
`openspec/changes/plan-cleanup-s89`). Its story text and lock term are
unchanged. No story is added or retired, and no ★ FROZEN block or inventory
line is edited.

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R453.

Amended S89 · 2026-09-23 · #453 / Q3 delegation: the story reads the decision it records as the newest Plan history record, which the served history lists first, not the last one listed. The same check proves that record is the decision just recorded: the history holds exactly one more record than before recording, and the newest record's `applied_at` names none of the records served before it. The failed-Withdraw check reads that same newest record. S89's store holds no earlier Plan, so its passes before #453 read the same row but did not show which record they certified.
The preceding S89 wording and results are the attributed pre-amendment record.
```

### Deleted check and its prose

`detectOnPump` goes, with its JSDoc and its four tests. The prose that names it
as part of the module is corrected:

- the `plan.js` module header's "(and the Confirmation-B detection)" and
  "detecting when the deliverable has landed on the pump";
- `plan.test.js`'s header line "Confirmation-B on-pump detection" and the section
  heading above the four tests.

The module still owns the pump-precision reconciliation that draws a served
mismatch's rows (`reconcileDeliverable`, live in `plan-view.js`). Its callees,
`collapseDeliverable`, `segmentAt` and `PLAN_PARAMS`, keep production callers
and stay.

`openspec/changes/harmonic-v2/contracts.md` lists `detectOnPump` among the
Plan module's exports in a #348-era planning table. That record is not
maintained: it still names the `frontend-v2/` tree that #416 retired. It is left
as history, like the verbatim test logs under archived changes' `evidence/`
directories.

`scripts/public_scan_config.txt` acknowledges two `plan.js` dose-precision
comments at lines 697 and 699, which the deletion moves up. The scan keys an
acknowledgement on path and matched text, never its line (`digest_key`). A
triage probe of the public-tree scan with the function deleted reported 0
findings. The config is not edited.

### Consequences

- S89 fails at the check where it certifies its decision when Plan history is
  served in another order (D) or one recording adds more than one row (E).
  Before #453 it passed D, and failed E only at the later reload check.
- The desk bundle is unchanged, so no render, browser suite or other replay
  story is owed.

### Risk contract

- **Must prevent:** a replay story certifying a Plan record it did not write
  (silent incorrect success); any change to a served payload, the Plan history
  order, staging or a reader-facing line; real data in a test.
- **Must recover:** nothing new. The replay's bounded assertions still fail with
  their wait name and the observed rows.
- **Accepted failure:** none added.
- **Unsupported:** two Plans recorded with the same `applied_at` second. The
  server keys Plan identity on it, so that is outside this story.
- **Evidence owed:** the fake-page test in `frontend/replay-cases.test.js`
  (histories B, C, D and E, each observed failing on the base body first); S89
  replayed on its case store at both sizes on the built app; the fast gate green
  after the four tests go.

Why: the change is evidence-only plus dead-code removal, so the risk is a proof
that proves the wrong row.
Disposition: inline (this record).
