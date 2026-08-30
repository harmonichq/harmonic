# Findings-engine audit — tuning levers and their seams (#263)

Five independent audits, one per chunk below, each read the pinned tree at
`origin/main` (5e5b11df) with two lenses: does the code enforce what CLAUDE.md
and the capability specs claim, and does the design hold up against the
engineering charter. Every citation in the chunk sections was produced by the
auditing agent; the coordinator spot-checked citations from every chunk against
the same tree and confirmed each one reproduced, then ran the real-history
grounding pass below.

## Overall verdict

The safety architecture holds. All three tuning levers stage through exactly one
backend predicate each, the eight-night floors sit where the contributor brief
says they sit, the manual carb log stays an exclusion signal everywhere it is
threaded, every write endpoint bumps the result cache except the one documented
Plan-draft exception, and the frontend transcribes backend verdicts rather than
re-deriving them. No finding in this audit is a defect in shipped behavior. The
nine findings are dormant duplicate logic, hand-copied constants, one
private-name seam, and two contributor-brief claims that drifted from the code.

## Findings index

| Finding | Severity | Disposition |
|---|---|---|
| F1.1 dead `apply_safety_caps` / `Advisory` / `SlotAdvisory` | design-debt | [#264](https://github.com/harmonichq/harmonic/issues/264) |
| F1.2 frontend hardcodes the eight-night floor literal | design-debt | [#265](https://github.com/harmonichq/harmonic/issues/265) |
| F1.3 dead frontend `direction()` re-derivation | design-debt | [#266](https://github.com/harmonichq/harmonic/issues/266) |
| F1.4 test-side reimplementation of `cap()`'s direction rule | design-debt | report only; re-check on the next `cap()` change |
| F2.1 `max_step_frac` duplicated in `IsfConfig` and `SafetyConfig` | design-debt | [#267](https://github.com/harmonichq/harmonic/issues/267) |
| F2.2 "unranked" claim names the wrong layer | doc-drift | [#268](https://github.com/harmonichq/harmonic/issues/268) |
| F4.1 `_CgmSeries` private name imported by six modules | design-debt | [#269](https://github.com/harmonichq/harmonic/issues/269) |
| F4.2 "every analyzer feeds on the clean-window filter" overstates | doc-drift | [#268](https://github.com/harmonichq/harmonic/issues/268) |
| F5.1 backtest endpoint duplicates its own compute body | design-debt | [#270](https://github.com/harmonichq/harmonic/issues/270) |

## Coordinator verification beyond the chunks

* F1.1 upgraded from "may be unused" to confirmed dead: a repo-wide grep finds
  no caller of `apply_safety_caps` or `SlotAdvisory` outside `safety.py` itself
  and `tests/test_safety_backtest.py`.
* Chunk 2 could not locate an ISF-named capability spec; there is none. ISF
  requirements live in `openspec/specs/parameter-analysis/spec.md` and
  `openspec/specs/safety/spec.md`.
* Chunk 5's one UNVERIFIED row (mirror equivalence beyond the fixture windows)
  is inherent to decision record 735: the test is the binding mechanism and it
  proves equivalence only on the frozen inputs. No action.

## Real-history grounding

A WAL-safe read-only snapshot of the operator's own database was analyzed
coordinator-side at 30-day and 90-day windows; only aggregates appear here and
no worker saw the snapshot.

* 30-day window: 48 basal slots, none asserting a move; one ISF segment, not
  asserting; no I:C segment asserting. Zero staging-floor violations.
* 90-day window: three basal slots assert a move, with night rosters of 40, 16,
  and 18 informative nights, all comfortably above the eight-night floor; ISF
  and I:C assert nothing. Zero violations.
* Every asserting slot carried both a current and a recommended value; no
  segment asserted with a missing programmed value or a no-op recommendation.

## Chunk 1 — Basal lever

### Verdict
The one-predicate staging invariant holds end to end: `SlotEstimate.asserts_move` is a computed property (`ciq_autotune/result.py:156-166`), not a stored flag, and every consumer — deliverable schedule, priority tally, Plan staging, findings queue — reads it rather than re-deriving eligibility. The eight-night support floor is enforced exactly where CLAUDE.md says, inside `_sign_tails`, and the frontend's duplicated `MIN_SUPPORTED_NIGHTS = 8` constant is display-copy only, never a gate. `safety.py` is a well-scoped, single-purpose module; the main design smell is `cap()`'s dual eligibility paths (`supported_direction` vs. `estimate`/`min_directional_days`) coexisting in one function. An independent Explore-agent trace corroborated all invariant checks below and surfaced two additional design-debt items (dead code, a duplicated test-side implementation of `cap()`'s logic).

### Invariant checks
| Claim (source) | Enforced? | Evidence |
|---|---|---|
| One predicate (`asserts_move`) gates staging, deliverable schedule, and priority tally | yes | `result.py:156-166` (property = `status is not None and status.actionable`); deliverable: `analyzers/basal.py:564` (`_deliverable_rate`); tally: `analyzers/tuning_priority.py:73-78` (`_is_supported_change`); Plan staging: `frontend/plan.js:74`, `frontend/diagnose-workstation-data.js:119`, `frontend/diagnose-workstation.js:829`, `frontend/diagnose-workspaces.js:23,61` |
| No fourth consumer re-derives eligibility | yes | `ciq_autotune/findings_projection.py:647-662` (`_basal_key`) and `ciq_autotune/basal_night_evidence.py:46` read `asserts_move`/`slot.get("asserts_move")` for queue grouping and evidence payloads respectively — both read-only, neither recomputes it. No fifth site found by either pass |
| 8-night floor enforced inside `_sign_tails` via p=1.0 on both tails | yes | `ciq_autotune/safety.py:64-72` (`if len(signs) < _MIN_SUPPORTED_NIGHTS: return 1.0, 1.0`) |
| `analyzers/basal.py` passes per-slot verdict into `cap()` as `supported_direction=`, 0 downgrades to `INSUFFICIENT` | yes | `analyzers/basal.py:471-474` (`cap(..., supported_direction=supported_directions.get(s, 0))`); `safety.py:248-253` (`insufficient = supported_direction == 0 or supported_direction != direction`) |
| `min_directional_days` belongs to the CI-rule in `_insufficient`, basal doesn't use it, only non-default caller in the tree is a test | yes | `safety.py:186-207` (`_insufficient` signature); basal's `cap()` call at `analyzers/basal.py:471-474` never passes `min_directional_days`; only other `cap(` call sites are `safety.py:322` (`apply_safety_caps`, default), `tests/test_analyzer_basal.py:184` (default), and `tests/test_safety_backtest.py:104,113` (`min_directional_days=8`, the only overrides in the tree) — confirmed independently by both my grep and the Explore agent's |
| Suggestion is the median (not mean) of clean delivered basal per slot | yes | `analyzers/basal.py:464-466` (`per_day = [statistics.median(rs) ...]`, then `estimate_median(per_day)`); rationale in `analyzers/basal.py:1-4` and spec `openspec/specs/basal-suggestion/spec.md:88-101` |
| Frontend re-derives no basal floor/threshold/direction | yes (with a caveat, F1.3) | `diagnose-workstation.js:829` (`canStage = cell.asserts`, read not computed); `diagnose-workstation-chart.js:318-334` hardcodes `MIN_SUPPORTED_NIGHTS = 8` but its own comment documents it drives only display copy (`thin`/`footNote`), never `canStage`; `diagnose-workstation-chart.js:363-366` and `diagnose-workstation.js:461-463` read the backend's published `direction` field rather than comparing current/recommended. Caveat: `frontend/chart-builders.js:63-67` exports an unused `direction()` function that *would* re-derive direction from current/recommended if ever wired in — see F1.3 |
| Tests assert on analyzer output, not hand-set flags | yes (with a caveat, F1.4) | `tests/test_analyzer_basal.py:194-226` builds real 5/8/12-night synthetic fixtures via `night()`/`combine()` and asserts on `analyze_basal`'s derived `.status`/`.asserts_move`. `tests/test_analyzer_basal.py:369-401` directly constructs `SlotEstimate(..., status=Status.X)` fixtures, but these unit-test `_deliverable_rate`/`consolidate_profile` in isolation, not the analyzer's own eligibility computation — not the anti-pattern. Caveat: `tests/test_tuning_priority.py:37-101` hand-derives/hand-sets `status` via a test-local reimplementation of `cap()`'s logic to isolate the priority tally — see F1.4 |

### Design assessment
`safety.py`'s interface is deep for its two headline functions: `cap()` takes a handful of primitives and returns `(rate, Status)`, hiding the step-cap/absolute-range/noise-floor/direction logic; `apply_harm()` likewise collapses ADR 0038/412's gate-vs-nudge branching behind one call. The module's dependents (`analyzers/basal.py`, `analyzers/ic.py`) each supply exactly one non-default parameter (`supported_direction` for basal, nothing extra for I:C beyond the shared floor constant) — the "two adapters make a real seam" bar is met cleanly, not over-built.

One design wrinkle: `cap()` carries two mutually exclusive eligibility paths — the original `_insufficient`/`min_directional_days`/CI-spans-current rule, and the newer `supported_direction` sign-test rule (`safety.py:248-251`) — selected by whether the caller passes `supported_direction`. This is documented in the docstring (`safety.py:222-226`) and is real, not speculative: ISF/I:C still use the estimate/CI path while basal uses the sign-test path. It's a legitimate two-caller seam, but the `if/else` branching inside one function is a candidate for extraction into named strategies if a third caller with different semantics ever appears — not urgent, no third caller exists today.

`_basal_key` in `findings_projection.py:647-662` shows the same discipline on a smaller scale: it reads `asserts_move` first before falling back to `safety_status` groupings, and its own docstring states the ordering reason (a zero-clean-day harm-moved slot must read as the move it is, not as blind) rather than leaving it implicit.

No dead code found in `safety.py` itself. `apply_safety_caps`/`Advisory`/`SlotAdvisory` may be an unused convenience wrapper elsewhere in the tree (F1.1). `chart-builders.js`'s unused `direction()` export is a second, independently confirmed dead-code item (F1.3) — both are duplicate-logic risks sitting dormant rather than firing today, which is a different risk shape than the shipped-and-wrong bugs CLAUDE.md's basal history describes, but the charter's no-dead-code rule still applies.

### Findings

F1.1 — [severity: doc-drift] `apply_safety_caps`/`Advisory`/`SlotAdvisory` may be unused in the shipped path
  Evidence: `ciq_autotune/safety.py:318-329` defines `apply_safety_caps`, the only caller of the plain (non-`supported_direction`) `cap()` path outside tests. A grep for `apply_safety_caps(` and `Advisory(` found no call sites in `ciq_autotune/analyzers/`, `ciq_autotune/api.py`, or `frontend/`; basal's real path calls `cap()` directly from `analyzers/basal.py:471`, not through `apply_safety_caps`. Scoped to `ciq_autotune/` and `frontend/`; not exhaustively checked against `tests/`.
  Suggested action: confirm with a repo-wide grep for `apply_safety_caps` and `SlotAdvisory` whether this is dead production code (a leftover pre-`SlotEstimate` shape) or still wired somewhere unchecked; remove per the charter's no-dead-code rule if dead.

F1.2 — [severity: design-debt] Frontend hardcodes the 8-night floor as a second literal instead of receiving it from the API
  Evidence: `frontend/diagnose-workstation-chart.js:318` (`export const MIN_SUPPORTED_NIGHTS = 8;`) duplicates `ciq_autotune/safety.py:40` (`_MIN_SUPPORTED_NIGHTS = 8`) as a hand-copied literal tied together only by a code comment, not a shared source or contract test. Behaviorally inert today — it only drives copy text (`diagnose-workstation.js:832,852`), never `canStage` — but a future change to the backend floor would silently desync the frontend's "N of 8" messaging from the real gate.
  Suggested action: serve the floor value from the API payload alongside `safety_status`, or add a drift/contract test pinning the two constants together.

F1.3 — [severity: design-debt] Dead frontend function re-derives basal direction from current/recommended
  Evidence: `frontend/chart-builders.js:63-67` exports `direction(s)`, computing `'raise'`/`'lower'`/`'on target'` from `s.recommended > s.current` — independent of `asserts_move`/`safety_status`. A grep of every `chart-builders` import across `frontend/*.js` (excluding tests) shows only `day-dose-focus.js` and `day-hero-chart.js` importing other names (`bolusKind`, `DOSE_ROWS`, `BOLUS_SYMBOL`, `addMinutesIso`, `suspendRuns`, `falseLowGhost`); no importer of `direction` exists. Unused today, so it isn't currently violating "the frontend re-derives no direction," but it is exactly the kind of duplicate implementation the charter's no-dead-code rule and CLAUDE.md's "never re-derive in a frontend gate" rule warn against — a future caller would silently bypass the backend's `direction` field.
  Suggested action: remove `direction()` from `chart-builders.js`, or if a near-term caller is planned, confirm it will read `asserts_move`-gated data, not `current`/`recommended` alone.

F1.4 — [severity: design-debt] Priority-tally tests carry a second, hand-maintained reimplementation of `cap()`'s direction logic
  Evidence: `tests/test_tuning_priority.py:37-48` (`_derive_status`) reimplements a simplified RAISE/LOWER/INSUFFICIENT/NO_CHANGE decision from `wide`/`current`/`recommended`, and `_slot()` (`test_tuning_priority.py:51-72`) uses it by default to stamp `SlotEstimate.status` on synthetic fixtures, with an explicit `status=` override at `test_tuning_priority.py:97-101` hand-setting `Status.INSUFFICIENT` directly for the CI-spans-current regression case. This isolates `tuning_priority.py`'s own logic from analyzer numerics (its docstring says as much) rather than faking analyzer output — `test_analyzer_basal.py` already covers `status` derivation from real N-night samples — but it is a second hand-written copy of `cap()`'s direction rule in test code, which could silently diverge from `safety.cap()`'s real behavior without a test noticing.
  Suggested action: no immediate action required; if `cap()`'s direction rule changes again, cross-check `_derive_status` for drift, or replace it with a thin call into the real `cap()`.

### Coverage
Read: `ciq_autotune/safety.py` (full), `ciq_autotune/analyzers/basal.py` (full), `ciq_autotune/result.py:100-350` (`SlotEstimate`/`SegmentEstimate`/`IcBlock`), `ciq_autotune/analyzers/tuning_priority.py:1-110`, `ciq_autotune/findings_projection.py:640-665`, `openspec/specs/basal-suggestion/spec.md` (full), `frontend/diagnose-workstation-chart.js:255-340`, `frontend/diagnose-workstation.js:820-960`, `frontend/chart-builders.js:63-67`, `tests/test_analyzer_basal.py` (grep + targeted reads), `tests/test_safety_backtest.py` (grep), `tests/test_tuning_priority.py:1-105`. Grepped repo-wide for `asserts_move`, `min_directional_days`, `MIN_SUPPORTED_NIGHTS`, `medN`/`thin` in `frontend/*.js`, and every `chart-builders` importer. An independent Explore subagent re-traced items 2, 3, 5, and 6 of the brief from scratch and returned matching file:line citations plus the two items folded into F1.3/F1.4.

Not read: `ciq_autotune/harm.py` internals (treated as a separate capability basal only calls into); `ciq_autotune/api.py` in full (grepped only); `tests/test_harm_basal_arm.py` and `tests/test_basal_night_evidence.py` (listed, not opened).

GROUNDING-REQUEST: F1.1 (possible dead `apply_safety_caps`/`Advisory` code) should be confirmed against the actual shipped call graph — codebase-memory MCP tooling was unavailable for this pass (connecting, then disconnected mid-session), so this rests on a two-directory grep sweep rather than a full call-graph trace.
## Chunk 2 — ISF (correction factor) lever

### Verdict
The one-predicate staging invariant holds exactly as documented: `isf_asserts_move` (ciq_autotune/analyzers/isf.py:475-479) gates on programmed value, direction, and recommended≠current, and `analyze_isf` stamps it onto the sole `SegmentEstimate` at isf.py:834-844. The four visible-but-non-staging cases (weakening, missing programmed, hold, no-op) all route correctly to `direction=None`/`recommended=None`. The one place the audit brief's own phrasing needs correcting is "unranked": the underlying `TuningLever.priority` is always computed (tuning_priority.py:340-350) — it's the findings *queue* projection, not the priority calculation, that withholds rank for unstageable rows, exactly as ADR-223/`docs/scope/isf-direction-only-ranking.md` records.

### Invariant checks
| Claim (source) | Enforced? | Evidence |
|---|---|---|
| `isf_asserts_move` true only when current, direction, and recommended≠current all hold (CLAUDE.md) | yes | isf.py:475-479; stamped at isf.py:843 |
| Direction-only weakening remains visible but cannot stage (CLAUDE.md) | yes | isf.py:569-591 — weaken branch always returns `recommended=None`, `direction="weaken"`; `priced_target` is explicitly commented "never `recommended`, never stageable, never programmable" (isf.py:577-582) |
| Missing programmed value cannot stage (CLAUDE.md) | yes | isf.py:475-479 short-circuits on `current is None`; also isf.py:555-559 returns `direction=None` when `programmed is None` |
| A hold (no direction) cannot stage (CLAUDE.md) | yes | isf.py:596-628 — every no-direction branch returns `(None, ..., None, None)` |
| A rounded no-op cannot stage (CLAUDE.md) | yes | isf.py:479 `recommended != current` check; `_half_gap` rounds to 1dp (isf.py:472) before comparison, so a rounded match self-excludes |
| isf.py imports nothing from safety.py (CLAUDE.md) | yes | grep of isf.py imports (lines 57-86) shows no `safety` import; caps are `IsfConfig.max_step_frac` (isf.py:128) and `_half_gap` (isf.py:462-472), isf.py's own |
| ISF rows deliberately excluded from consolidated pump-profile schedule (CLAUDE.md) | yes | basal.py:779-788 — `isf` param to `consolidate_profile` is explicitly documented and coded as unused; schedule ISF is `_param_schedule(None, programmed_isf)`, pure carry-forward |
| Direction-only ISF stays visible but "unranked" (commit 186edee) | partial | Underlying `Priority` is unchanged and always computed (tuning_priority.py:292-350); the *queue* sets `priority: None` for a row only when `asserts_move is not True` (findings_projection.py:438-439), matching the ADR's "unchanged underlying Priority, queue withholds rank" decision — the brief's "unranked" phrasing describes the queue layer, not the lever itself |
| No frontend gate re-derives an ISF floor/threshold/direction | yes | frontend/plan.js:71-74 (`stageable` reads `item.asserts_move === true`); frontend/diagnose-findings-queue.js:128,206 gate on `row.asserts_move` verbatim, no recomputation found |

### Design assessment
`isf.py`'s interface is a single `analyze_isf(...) -> List[SegmentEstimate]` with dense internal machinery (fasting-step extraction, per-night fits, harm-channel gating, priced-target pricing) — a deep module by the charter's standard: one call, one list, the recommendation logic entirely hidden. `_recommend` is long but is a single decision tree over one well-documented invariant (lows own the direction), not several unrelated responsibilities.

The `max_step_frac = 0.20` cap is independently defined in both `IsfConfig` (isf.py:128) and `SafetyConfig` (safety.py:146), both defaulting to the same 0.20. This is coincidental duplication of a magic number rather than a shared fact: the two modules are deliberately not coupled (per CLAUDE.md's "not basal's safety machinery" note), so this isn't a seam violation, but a future change to the ±20% policy in one file silently drifts from the other unless a human remembers both. Flagged as design-debt below, not a defect — the non-sharing itself is principled, the number staying in sync currently is luck.

`isf_asserts_move`'s signature (`current, direction, recommended`) is minimal and the three-case boolean is easy to reason about at every call site (isf.py, gen_findings_projection_fixtures.py, test files) — good interface depth, no drift among the four call sites checked.

### Findings

F2.1 — [severity: design-debt] `max_step_frac = 0.20` duplicated as an independent constant in `IsfConfig` and `SafetyConfig`
  Evidence: isf.py:128 (`max_step_frac: float = 0.20`) and safety.py:146 (`max_step_frac: float = 0.20   # +/-20% of current per pass`) — same value, two unrelated dataclasses, no shared source.
  Suggested action: none required now (values agree and modules are intentionally decoupled per CLAUDE.md), but a change to the ±20% dosing-step policy should grep both files — worth a one-line comment in each pointing at the other so a future edit doesn't drift.

F2.2 — [severity: doc-drift] CLAUDE.md's "direction-only ISF warnings stay visible but unranked" is imprecise about which layer withholds rank
  Evidence: tuning_priority.isf_lever always computes `priority=priority_score(impact, recurrence)` (tuning_priority.py:347); only `findings_projection.py:438-439` nulls `priority` for the queue row when `asserts_move` is not `True`. A reader who checks `isf_lever` alone (as this audit's brief instructed) would wrongly conclude the claim is false.
  Suggested action: tighten the CLAUDE.md wording to name the findings-projection queue explicitly, matching `docs/scope/isf-direction-only-ranking.md`'s own precise phrasing ("queue withholds rank... underlying Priority unchanged").

### Coverage
Read in full: ciq_autotune/analyzers/isf.py, the relevant slices of ciq_autotune/result.py (SegmentEstimate, ProfileSegment, ConsolidatedProfile), ciq_autotune/analyzers/basal.py's `consolidate_profile` (isf-handling portion), ciq_autotune/analyzers/tuning_priority.py's `isf_lever`/`_isf_recurrence`, ciq_autotune/findings_projection.py's `_isf_rows`, docs/scope/isf-direction-only-ranking.md, commit 186edee's message/stat, and frontend/plan.js + frontend/diagnose-findings-queue.js grep hits for `isf`/`asserts_move`.

Not read: ciq_autotune/harm.py internals (isf.py's harm-gate consumer was traced only through its public `arm_harm`/`apply_harm_gate_nudge` call sites, not the harm module's own invariants — out of this chunk's scope per the brief). Did not open the ISF capability spec file under openspec/specs/ by name — searched for `*isf*`/`*correction*` filenames and found none; the capability may be documented under a different filename (e.g. a combined tuning-levers spec) that I did not locate by content search. Flagging as **GROUNDING-REQUEST**: confirm whether an ISF-specific openspec capability spec exists under a name I didn't guess, since the brief asked me to read it and I could not locate it by filename search alone.

No real-data grounding needed for this chunk — every claim above was verifiable from source and one commit's diff/message.
## Chunk 3 — Carb-ratio (I:C) lever

### Verdict
The one-predicate design is real and consistently enforced: `ic_asserts_move` (ic.py:120) is a pure read of `block.evidence["eligibility"]` and `block.state`, every consumer I found reads `.asserts_move` rather than re-testing a condition, and the frontend explicitly documents ("nothing here re-derives one," diagnose-workspaces.js:9) that it doesn't. The manual-carb-log boundary holds: carbs feeding the I:C ratio come only from `BolusEvent.carbs`, and `carb_entries`/`prompt_responses` are threaded through purely as exclusion/rescue-admission signals. Fixture generators for all three named artifacts exist, are committed, and stamp provenance.

### Invariant checks
| Claim (source) | Enforced? | Evidence |
|---|---|---|
| `ic_asserts_move` is THE predicate; lever/pump-profile schedule/frontend staging all read that one flag (CLAUDE.md) | yes | ic.py:120-163 defines it as a pure function of `block.evidence["eligibility"]`+`state`; tuning_priority.py:464,486 (`ic_lever`, `ic_headline_block`), basal.py:806 (`_protected_ic_boundaries`), and diagnose-workspaces.js:23,33,61 all read `.asserts_move` / `asserts_move` with no re-derivation |
| No consumer re-derives the predicate | yes | diagnose-workspaces.js:9 states this as an invariant in a module comment; grep of every `asserts_move` read site (ic.py:2630, admission.py:69/97, findings_projection.py:375/442, tuning_priority.py:464/486/541, basal.py:806, diagnose-workstation.js:460/889, diagnose-findings-queue.js:128/206, diagnose-workstation-chart.js:343/366) shows each is a boolean check on the stamped value, none recomputes eligibility conditions |
| ic.py imports exactly one name from safety.py: `_MIN_SUPPORTED_BLOCK_RUNS` (floor of 8) | yes | ic.py:66 `from ..safety import _MIN_SUPPORTED_BLOCK_RUNS`; safety.py:56 `_MIN_SUPPORTED_BLOCK_RUNS = 8`; used at ic.py:2432,2512-2513 to set `runs_floor_met` |
| Carbs come only from confirmed bolus requests; manual carb log is exclusion-only, never modeling input | yes | ic.py:790,1206-1226 use `carb_entries` only to build `window_entries`/`rescue_carb_entries` for isolation-eviction and rescue-admission (comment at ic.py:693: "remain the manual unbolused-carb log, not a food ledger"); the I:C ratio itself (`true_ic = carbs/(meal_dose+post_correction)`, module docstring ic.py:9) is computed from `BolusEvent.carbs`/`.insulin`, not `CarbEntry` |
| No frontend gate re-derives any I:C floor/threshold/direction | yes | diagnose-workspaces.js:8-9 explicit comment; diagnose-workstation.js:457 comment "It decides no eligibility: `ic_asserts_move`..."; no floor constant (8, band, regime) appears client-side in the grepped consumers |
| Fixture generators exist with provenance stamps | yes | scripts/gen_ic_block_fixtures.py:150, gen_ic_block_evidence_fixtures.py:78, gen_ic_history_event_fixtures.py:69 all write `_generated_by`; `frontend/__fixtures__/ic-blocks.json` carries the stamp verbatim |

### Design assessment
`ic_asserts_move` (ic.py:120-163) is a genuinely deep interface: four ADR-518 conditions collapse to one boolean, computed once beside the block that carries it, with the module's own docstring naming the exact prior failure mode (#273/#465 two-predicate drift) the design closes off. `IcConfig` (ic.py:166+) is a large, heavily-commented parameter object, but every field's comment cites a specific bug number or ADR grounding its value — this is documented tuning, not speculative surface. `_dose_is_untrustworthy` (ic.py:421) is one predicate shared by both the meal and run ledgers, explicitly to avoid semantic drift between them — good duplication discipline. I did not find dead code or unjustified guards in the sections read; `ic_band_excludes_programmed` (ic.py:107) and `ic_asserts_move` are each single call-in points with call sites matching their doc claims.

### Findings
(none — no defect, risk, doc-drift, or design-debt findings survived this pass)

### Coverage
Read in full or substantial part: ic.py (module docstring, `ic_band_excludes_programmed`, `ic_asserts_move`, `IcConfig`, `_dose_is_untrustworthy`, `_outcome_bg`, carb_entries usage across lines 560-2690 via grep+targeted reads), admission.py:55-104, tuning_priority.py:455-489, basal.py:795-811, diagnose-workspaces.js (full), safety.py (grepped constants only), the three named generator scripts and their committed fixture output.

Not read: `ic_history.py` internals (`prove_runs`, `schedule_blocks`, `programmed_values_over_span`) beyond their import surface, the full `_analyze_ic_blocks_shared` body (2000+ lines, only entry/exit points at 2432/2512/2630 read), `findings_projection.py` beyond the grepped `asserts_move` lines, and `diagnose-workstation.js`/`diagnose-findings-queue.js`/`diagnose-workstation-chart.js` beyond the grepped citation lines — these are lower-risk read-only consumers and the grep evidence was consistent across all of them.

GROUNDING-REQUEST: none — this chunk's claims were all verifiable from committed code and fixtures; no real-data grounding needed.
## Chunk 4 — Behavioral detectors + the clean-window filter

### Verdict
`model.py`'s clean-window filter is a genuinely deep module — a five-argument call hiding minute-by-minute reconstruction, bisect-indexed timelines, and a documented slope-artifact guard — and `insulin.py`'s bolus-only IOB is correctly isolated from basal by construction. The one claim in the brief that doesn't hold literally is "single shared upstream every analyzer feeds on": ISF and I:C deliberately do **not** call `clean_samples()`, each running its own regime detector instead, a divergence that is documented and justified (ADR 0001) rather than accidental duplication. The behavioral classifiers are a well-factored layer — one shared context gate, a closed `SilenceReason` taxonomy, all evidence floors in the backend — with one minor seam smell: six classifier modules reach into `model.py`'s underscore-private `_CgmSeries`.

### Invariant checks
| Claim (source) | Enforced? | Evidence |
|---|---|---|
| Clean-window filter is the shared primitive "behind both the profile suggestion and the backtest" (model.py docstring, model.py:419) | yes | `basal.py:28,345` and `backtest.py:33,132,230` and `report.py:14,199` all call `clean_samples()`/`ModelConfig` |
| Clean-window filter is shared by **every** analyzer (brief's framing) | no | `isf.py` never imports `clean_samples`/`ModelConfig`; it detects its own nightly `RestWindow` regime (`isf.py:79,97-101,218-273`, ADR 0001 cited at isf.py:9). `ic.py` never imports either; it runs its own meal-run isolation logic (`ic.py` throughout, e.g. lines 693-922). Documented divergence, not silent duplication — model.py:126-133 and isf.py's docstring cross-reference each other and explain the asymmetry (both consume the Carb-log stream only, by design, #169) |
| IOB is reconstructed bolus-only, no basal leak (CLAUDE.md "Tandem Source data facts") | yes | `insulin.py:101-148` `BolusIob.__init__` iterates only `bolus_events`; nothing basal-derived enters `self.amts`/`self.times`. A separate `basal_microdoses()` (insulin.py:177-190) and `InsulinActivity` (insulin.py:193-229) exist for ISF's *total*-activity need and are never mixed into `BolusIob` |
| Manual carb log is an exclusion signal only, never a modeling input (CLAUDE.md) | yes | `_CarbExclusionWindows` (model.py:327-365) only ever bars minutes (`contains()` returns bool, consumed as `not carb_excluded.contains(t)` at model.py:461) — no rate/quantity value from it enters `CleanSample.rate`. `carb_undercount.py`/`ic.py` also treat carb entries as exclusion/attribution signals, not synthetic doses (comments at ic.py:693-694) |
| One versioned `AnalysisResult` comes out of analyzers/ (CLAUDE.md, analyzers/__init__.py) | partial | `analyze.py:512` builds one `AnalysisResult`, `SCHEMA_VERSION = 9` (result.py:52) versions it — but the scenario/classifier layer (this chunk's behavioral detectors) is explicitly **excluded** from it and served separately via `/api/scenarios` (analyze.py:462-464, analyzers/__init__.py:9-11). The versioned-result claim holds for the parameter analyzers (basal/ISF/I:C), not for the behavioral layer in scope here |
| Evidence floors for behavioral classifiers live in the backend, never a frontend gate (CLAUDE.md's cross-cutting rule) | yes | Every classifier's insufficiency check (`SilenceReason.INSUFFICIENT_DATA`) is computed in Python from `_CgmSeries`/gate results (e.g. `late_bolus.py:142`, `missed_meal.py:141`, `meal_bolus_short.py:176`, `carb_undercount.py:168,184`, `suspend.py:145`, `correction_stacking.py`/`correction_on_iob.py` via shared `cgm_max_stale_min`). No floor logic found under `frontend/` for this chunk — not exhaustively re-verified here since frontend is outside this chunk's scope |

### Design assessment
**model.py** is deep: `clean_samples()`'s five-line contract (basal events, CGM, bolus events, pump events, config) hides ~130 lines of bisect-indexed timeline/series/exclusion-window machinery, and every threshold is either a cited empirical constant (slope-guard sparsity, model.py:107-118; one-sided BG dawn-band fraction, model.py:114-118) or backed by an ADR (DIA default, model.py:68-78, ADR 0004). It is not shallow-by-parameterization: `ModelConfig` has many knobs but they're genuinely one interface serving one filter, not per-caller special-casing — the one caller that reads slope-guard values without a `ModelConfig` (`_CgmSeries` class defaults, model.py:242-246) documents why (behavioral classifiers construct `_CgmSeries` directly, bypassing `ModelConfig`).

**Seam note**: `_CgmSeries` is underscore-prefixed (private) in `model.py` but is imported directly by six external modules — `late_bolus.py:26`, `missed_meal.py:37`, `meal_bolus_short.py:39`, `correction_stacking.py:44`, `correction_on_iob.py` (via correction_stacking's re-export per its docstring), `carb_undercount.py:45`, and `ic.py:47`. That's well past "two callers make it a real seam" — the class should arguably be promoted to a public name in `model.py`'s interface rather than reused across six modules under a leading underscore, which currently reads as "internal, don't depend on this" while being depended on repo-wide.

**Duplication check**: `correction_stacking.py` and `correction_on_iob.py` look like they could duplicate one fact (both detect over-correction crashes) but are explicitly partitioned by count (≥2 vs. exactly 1) and `correction_on_iob.py` documents reusing `correction_stacking`'s primitives (`BolusIob`, `_CgmSeries`, `upstream_cause`) rather than reimplementing them (correction_on_iob.py:17-19) — one fact, one shared implementation, two distinct triggering conditions layered on top. Not a violation.

**Guards**: model.py's guards are all earned at a trust boundary (durable pump/CGM feed data that a sensor gap or artifact can perturb) — the slope sparsity guard (model.py:277-307) is explicitly justified against a real observed CGM artifact class (±720 mg/dL/min from 2-point clusters), and the carb-exclusion back-buffer against observed logging clock skew (model.py:134-139).

### Findings
F4.1 — [severity: design-debt] `_CgmSeries` reused as a private class across 6+ external modules
  Evidence: `model.py:241` defines `class _CgmSeries` with a leading underscore; imported directly by `late_bolus.py:26`, `missed_meal.py:37`, `meal_bolus_short.py:39`, `correction_stacking.py:44`, `carb_undercount.py:45`, and `ic.py:47`.
  Suggested action: promote to a public name (drop the underscore) in model.py's interface, since it's a real cross-package seam, not an implementation detail.

F4.2 — [severity: doc-drift] Brief's "single shared upstream every analyzer feeds on" overstates what model.py actually serves
  Evidence: only `basal.py`, `backtest.py`, and `report.py` call `clean_samples()`/`ModelConfig`; `isf.py` and `ic.py` run independent regime detectors, a divergence documented at model.py:126-133 and isf.py:9 (ADR 0001) but not reflected in how the shared-filter claim is commonly phrased.
  Suggested action: none required in code — flagging for whoever synthesizes the audit, since a future reader taking "every analyzer" literally would misjudge where a clean-window change actually propagates.

### Coverage
Read in full: `model.py`, `insulin.py`, `analyzers/__init__.py`, `analyzers/classifiers/__init__.py`, `analyzers/classifiers/evidence.py`, `context_gate.py` (partial), `late_bolus.py`, `missed_meal.py`, `meal_bolus_short.py`, `correction_on_iob.py` (docstring/header), `suspend.py` (header), relevant sections of `isf.py`, `ic.py`, `analyze.py`, `result.py`, `openspec/specs/behavioral-layer/spec.md` (header + first three requirements). Grepped (not fully read): `correction_stacking.py`, `carb_undercount.py` bodies beyond cited lines, `scenario/` engine internals (attribution/priority machinery — belongs more to a scenario-engine-focused chunk than to "detectors + clean-window filter" as scoped here), `scenario_config.py` in full.

Deliberately not read: the `scenario/` attribution and priority-scoring code (engine.py, attribute.py, priority.py) — in scope for "behavioral detectors" only at the classifier-output boundary, not the episode-assembly/ranking layer, which reads as a separate chunk's concern.

GROUNDING-REQUEST: none — every claim here was verifiable from static source; no claim required real pump data to check.
## Chunk 5 — Cross-cutting seams

### Verdict
The seams are unusually disciplined for their age: all 14 write endpoints in `api.py` bump the cache with the one documented exception (Plan draft save), the three levers' staging verdicts (`asserts_move`/`safety_status`) travel through one projection (`findings_projection.py`) into one JS mirror bound by a deep-comparison test, and the frontend read sites transcribe backend verdicts rather than re-deriving them — including an explicit code comment (`diagnose-workstation-chart.js:320-341`) documenting a prior violation of exactly this rule and its fix. `result_cache.py` and `findings_projection.py` are both deep modules with simple interfaces over real concurrency/anchoring complexity.

### Invariant checks
| Claim (source) | Enforced? | Evidence |
|---|---|---|
| Every write endpoint bumps the cache (CLAUDE.md "result cache is coarse") | yes | All 14 mutating endpoints in `api.py` call `cache.bump()`: dismissals (1083), pattern-sweep approve/dismiss via shared helper (1120), fetch success + partial-commit path (1182, 1186), credentials (1204), carbs POST/PATCH/DELETE (1304, 1319, 1331), prompt answer/clear (1390, 1410), plan apply (1500), focus pin/resolve (1544, 1554), plus fetch-loop's `signal_recompute` (1564). |
| Plan draft save is the sole proven-safe non-bumping exception | yes | `api.py:1484-1486` — `PUT /api/plan` explicitly skips `cache.bump()` with a comment citing #427; no second unbumped write endpoint found among the 14 enumerated. |
| Hourly fetch bumps via `run_fetch_loop`'s `on_write`, then re-warms fixed initial shapes in the worker thread | yes | `fetch_loop.py:98-100` calls `on_write` (wired to `signal_recompute`, `api.py:1557-1565`) only when a fetch committed; `signal_recompute` bumps then signals the recompute loop, which the file's own docstring says re-warms via `app.state.recompute_event`. Did not trace the recompute-loop consumer itself (out of grep scope) — reported as verified for the seam, not for the warm-set contents. |
| One backend staging verdict per lever, no frontend re-derived floor/threshold/direction (basal, ISF, I:C) | yes | Frontend read sites (`diagnose-workstation-data.js:119`, `diagnose-findings-queue.js:128,206`, `plan.js:74`, `diagnose-workspaces.js:23,33,61`, `diagnose-evidence-charts.js:138-139`, `diagnose-workstation-chart.js:343,363-366`) all gate on `asserts_move`/`safety_status`/`direction` read verbatim off the payload; no independent threshold or dose-arithmetic re-derivation found in this grep sweep. `diagnose-workstation-chart.js:318-341` documents and closes the exact `#273/#465` recurrence CLAUDE.md warns about. |
| `/api/diagnose/findings` mirror held identical by `findings-projection-mirror.test.js` (decision record 735) | yes | Mirror lives at `mockups/findings-projection.mirror.mjs` (not literally "beside the synthetic fixture sets" as CLAUDE.md phrases it, but the fixture JSON it's tested against is at `frontend/__fixtures__/findings-projection.json`); the test (`findings-projection-mirror.test.js:1-40`) deep-compares `projectFindings`/`projectIcHistoryEvents` output against the frozen generator output across all seven named windows. |
| Mirror has not grown behavior the projection lacks | partial/UNVERIFIED | Top-level function names line up 1:1 between `findings_projection.py` and the mirror (`basalRows`↔basal handling, `icRows`, `isfRows`, `findingRows`, `historyRows`, `projectFindings`↔`FindingsProjection.project`). Python's `_title`, `_lean`, `_assign_tiers` have no same-named mirror counterpart — plausibly inlined under `stampedRow`/`sortKey`, but I did not read both function bodies line-by-line to confirm behavioral equivalence beyond what the fixture test's seven windows exercise. Flagged as UNVERIFIED rather than passed: the binding mechanism is the test, and the test only proves equivalence on the fixture inputs it was given, not on the full input space. |

### Design assessment
**`result_cache.py`** is a genuinely deep module: the interface is three verbs (`bump`, `get_or_compute`, `stable_read`) plus a leased-preparation variant, and underneath it hides single-flight computation, LRU eviction, and a race guard against a fetch landing mid-compute (`result_cache.py:180-243`). No duplication — one lock, one map, one version counter serving all cache-shaped callers.

**`findings_projection.py`** is similarly deep: one `project()` call collapses five registers, outcome-anchored windowing, and cross-lever merging behind a docstring that reads like a spec (lines 1-51). It reads only published API payloads, not analyzer internals (line 48-50) — a real seam, not a leaky one.

**The three levers' verdict shape is one seam, not three** — by design, verified above: `asserts_move`/`safety_status` is the uniform vocabulary basal, ISF, and I:C all publish, and `findings_projection.py` is the single place that normalizes them into one row shape. The ISF exception CLAUDE.md notes (no `safety.py` import, its own caps) is at the analyzer layer, not this seam — by the time it reaches `findings_projection.py` and the frontend, ISF looks like the other two.

**`api.py` itself is not a deep module** — it's a 1650-line flat file mixing routing, validation, and inline cache-key logic (e.g., the `backtest` endpoint at 1424-1467 hand-rolls a `snapshot_compute` duplicate of its own `compute` closure for the `fixed()` snapshot path — two near-identical bodies computing the same backtest dict, one for the ordinary cache and one for the pinned fixed-key path). That duplication is arguably justified by the two callers needing different persistence guarantees, but it reads as two implementations of one fact, worth a closer look than this pass gave it.

### Findings
F5.1 — [severity: design-debt] `backtest_endpoint` duplicates its own compute body for the fixed-key path
  Evidence: `ciq_autotune/api.py:1435-1465` — `compute()` and `snapshot_compute()` build the identical result dict from the identical inputs, one used for `cache.get_or_compute`, the other for `fixed(...)`. Same fact (a backtest run), two hand-written projections into the same shape.
  Suggested action: factor the dict-building into one helper both paths call, keeping the two persistence calls (`cache.get_or_compute` vs `fixed`) distinct.

### Coverage
Read in full: `result_cache.py`, `fetch_loop.py`, `api.py` lines 1-200 (imports/setup) and 1060-1650 (all write endpoints plus the findings/plan/focus routes), `findings_projection.py` lines 1-60 and function signatures throughout. Grepped: all `cache.bump()` sites, all `asserts_move`/`safety_status` sites across `ciq_autotune/` and `frontend/`, mirror vs. projection function names. Did not read: the recompute-loop consumer (`app.state.recompute_event` handler) that performs the actual re-warm — verified only that the signal is sent, not the warm-set's correctness; the full bodies of `_title`/`_lean`/`_assign_tiers` against their mirror equivalents (see F-row above); `admission.py`, `basal_night_evidence.py`, `ic_block_evidence.py`, `isf_rest_window_evidence.py` beyond the grep hits shown. GROUNDING-REQUEST: none — everything above was verifiable from committed fixtures and source, no real-data question arose in this chunk.