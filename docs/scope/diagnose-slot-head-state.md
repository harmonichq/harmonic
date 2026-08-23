# Scope ledger — Diagnose basal-slot case file head (#103)

Ticket: https://github.com/harmonichq/harmonic/issues/103

Split out of #102's triage, which ruled the head at
`frontend/diagnose-workstation.js:705` out of that ticket's scope. #103 is built
**after** #102 on a shared integration branch, so every fact below that #102
moves is stated as "re-measure", never as a literal.

## Decisions

- The defect is one expression:
  `verdict: canStage ? s.safety_status : 'insufficient evidence'` in
  `renderSlotLevel` (`frontend/diagnose-workstation.js:705`, function opens at
  `:696`). It hardcodes a verdict for **every** slot that cannot stage, not only
  a no-data one. Why: read in the module and reproduced live (below). `inline`
- **The blast radius is wider than the ticket states, and it is live on the
  committed demo payload today.** Reproduced against the committed payload
  through the replay's own `openApp`: a `no change` slot's case-file head reads
  "insufficient evidence" while its own lane tile reads "holds at current" and
  its own sentence reads "delivery matches the programmed rate through these
  hours". 41 of the 48 committed slots are `no change`. The no-data instance the
  ticket names is the same defect in a state no committed fixture holds. Why:
  executed reproduction, recorded below. `inline`
- **The head is corrected through the module's own verdict vocabulary**, not by
  special-casing no-data: `VERDICT_KEY[cell.verdict]` on the non-asserting
  branch. Spiked against the real `buildSlotLane` over all ten
  `ciq_autotune.safety.Status` values and both `recommended` states: when
  `canStage` is false, `cell.verdict` can only ever be `hold`, `insufficient` or
  `nodata`. So the head can only ever print three strings, all already user copy
  in `VERDICT_KEY`, and no engine jargon ("no baseline", "held (recurring-low
  gate)", "capped (raise)") can reach the surface. Head and lane tile then agree
  by construction, because both read the same map keyed on the same
  `cell.verdict`. Why: spike executed, table recorded below. `inline`
- Reading the raw `s.safety_status` on the non-asserting branch is **rejected**:
  it would print `no baseline` and `held (recurring-low gate)` verbatim, which
  DESIGN.md voice rule 2 (`DESIGN.md:137-138`) bans as engine jargon. Why: the
  same spike table. `inline`
- **Nothing in the frozen contract has to be retired.** The literal string
  "insufficient evidence" appears nowhere in
  `mockups/finding-evidence-routing.behavior.md`, and no replay story asserts a
  basal slot's case-file head: the only `.slot-head` read in
  `frontend/diagnose-workstation-behavior.replay.mjs` is the third fallback at
  `:147`, and every `levelHead` assertion (`:991`, `:1005`, `:1008`, `:1012`,
  `:1017`) is on an occurrence level. S15 asserts crumb and chip only; S16
  (`:1090`) opens an **asserting** slot. No replay story opens a `nodata`,
  `insufficient` or `hold` cell. Why: grepped and read. `inline`
- P40 (`mockups/finding-evidence-routing.behavior.md:750`) is the story that owns
  line 705's source range and it does not assert the head string, so the
  revision **amends** P40 rather than retiring anything. Its `source:` line
  already cites `renderParamLevel` at 568-627 and its callers at 629-760, which
  is stale on `main` today (the function opens at `:635`, `renderSlotLevel` at
  `:696`); the amendment re-quotes it. Why: read both. `inline`
- **The pin is a new replay story, not only a browser-suite assertion.** The
  ledger's replay is this surface's contract, the behavior changed, and
  `reference/revise.md` requires the old replay to fail before the new one
  passes. The new story fails pre-change by construction: pre-change both heads
  read "insufficient evidence"; post-change they read their own state. Why:
  reproduction shows both pre-change values. `inline`
- **The no-data state is posed through `openApp`'s `analysisInputs` callback**,
  not through an uncommitted scratch payload file. That callback is the replay's
  own sanctioned mechanism for a shape the committed payload cannot pose
  (`frontend/diagnose-workstation-behavior.replay.mjs:429-430`, and the comment
  at `:423-428`: "A story that needs a shape the payload cannot pose supplies a
  function, which derives the override from that payload inside this driver —
  never a hand-written fixture"). Verified working in the reproduction below.
  This supersedes the scratch-payload recipe #102's order used for its own
  no-data render. Why: executed. `inline`
- The exploration is **not** a lockstep copy of this fact.
  `mockups/finding-evidence-routing.exploration/` transcribes `VERDICT_KEY` and
  `VERDICT_SHORT` verbatim (`build.mjs:229-232`, `pooled.js:96-99`) but holds no
  copy of `renderSlotLevel`, `renderParamLevel` or the `.slot-head` markup. A
  head-only fix leaves both transcriptions true. Its `build.mjs --check` still
  runs, because CI runs it on every change to `diagnose-workstation.js`
  (`.github/workflows/ci.yml:140`). Why: grepped that directory. `inline`
- The source-text guard at `frontend/diagnose-workstation.browser.test.mjs:1013`
  reads `diagnose-workstation-chart.js`, not `diagnose-workstation.js`, so the
  head fix does not break it. Its `doesNotMatch` guards (`:992-1008`) **do**
  cover `diagnose-workstation.js`: the new expression must introduce no
  `? 'raise' : 'lower'` conditional, no `verdict = 'raise'|'lower'` assignment,
  no `return 'raise'|'lower'`, and no numeric comparison against a
  `days`/`n_runs`/`support` field. A `VERDICT_KEY` lookup satisfies all four.
  Why: read the test. `inline`
- **This settles a rule and gets an ADR.** `openspec/changes/isf-detail-verdict/`
  records ADR 25 settling the identical question for the correction-factor
  detail — the verdict comes from the analyzer's own field, stageability stays
  separate, and "DESIGN.md's voice register governs the copy". #103 is that same
  decision for the basal slot, and it changes shipped copy on a majority of
  slots, so it is recorded as `## ADR 103` in the change's `design.md`, per
  `AGENTS.md:376-386` (there is no `docs/adr/` tree; `scripts/check_adr_numbers.py`
  fails on one). Why: read ADR 25 and the AGENTS.md convention. `→ ADR`
- The **asserting** branch keeps printing `s.safety_status` raw (an `up` slot's
  head reads "raise" while its tile reads "suggests a raise"). That is a second,
  milder head/tile mismatch, it is not what #103 reports, and changing it moves
  copy on the one state the ticket does not mention. Out of scope, named in the
  order's Boundaries. Why: reproduced ("up" head = `raise`). `inline`
- `mockups/findings-projection.mirror.mjs:32` `HELD_STATUSES` omits `'no data'`
  and `'no change'`. Different surface (the findings queue), different contract,
  not touched here. Why: read. `inline`

### Risk contract

- **Must prevent:** secret exposure; irreversible loss of authoritative data;
  silent incorrect success — a case-file head that names a state the slot is not
  in, or a head that disagrees with the same slot's lane tile.
- **Must recover:** none.
- **Accepted failure:** none beyond the defaults.
- **Unsupported:** the head of an **asserting** slot (still the raw
  `safety_status`), the findings queue's own status vocabulary, and any surface
  other than the Diagnose basal-slot case file.
- **Evidence owed:** a no-data slot's head names no-data and matches its tile; a
  no-change slot's head names holds-at-current and matches its tile; an
  insufficient-evidence slot's head is unchanged; an asserting slot's head is
  unchanged; the new replay story fails against the pre-change module and passes
  after; every standing ledger story replays green against the built revision.
- **Why:** copy-and-verdict change on an advisory dosing surface; no dosing
  logic, no analyzer output, and no staging predicate moves.
- **Disposition:** inline (copied into the work order).

### Reproduction — executed in this worktree, nothing written to the branch

Run against `codex/103-no-data-head-verdict` at `7cddfe9` (origin/main), through
the replay's own `openApp` with `appSource: 'fixture'`, against the committed
payload `mockups/diagnose-workstation.synthetic/payload.json`. The no-data row
poses that state with the field set the engine publishes for `Status.NO_DATA`.

| lane cell | tile accessible name | case-file head | the slot's own sentence |
|---|---|---|---|
| `insufficient` (committed) | insufficient evidence | **insufficient evidence** | too few clean nights to assert a direction here |
| `hold` — `no change` (committed) | holds at current | **insufficient evidence** | delivery matches the programmed rate through these hours |
| `up` — `raise` (committed) | suggests a raise | raise | a conservative one-step move would raise this slot |
| `nodata` (posed) | no clean data | **insufficient evidence** | no nights of steady data at this time yet |

Both bolded rows are the bug. The `hold` row is reproducible on the committed
payload with no override at all, and covers 41 of the 48 slots.

Payload population, counted from the committed file: 6 `insufficient evidence`,
41 `no change`, 1 `raise`; **0** `no data`, which is why the ticket's own state
needs posing.

### Spike — which head strings are reachable

Executed against the real `buildSlotLane`
(`frontend/diagnose-workstation-chart.js`) over all ten `Status` values from
`ciq_autotune/safety.py:113-123`, with and without a `recommended` number:

- `canStage` true only for `raise`, `lower`, `capped (raise)`, `capped (lower)`,
  `lower (recurring lows)` **and** a non-null `recommended`.
- When `canStage` is false, `cell.verdict` ∈ `{hold, insufficient, nodata}` —
  every time, for every status. `no baseline` and `held (recurring-low gate)`
  both land on `hold`; an actionable status with a null `recommended` lands on
  `insufficient`.

So the corrected head can print exactly three strings, all from `VERDICT_KEY`:
its `nodata`, `insufficient` and `hold` entries. Post-#102 those read "no nights
of steady data", "insufficient evidence" and "holds at current".

## Open questions

- **How wide is the fix?** Recorded in the work order under "Open decisions" with
  options and a recommendation. The order builds the recommended option; the
  narrow alternative is a one-expression delta, named there. Not blocking: both
  options are executable from the same order and the narrow one is strictly a
  subset.

## Spawned tasks

- None. This triage files nothing.

## Review rounds

Recorded by the mandatory plan-review panel; see the work order's own record.
