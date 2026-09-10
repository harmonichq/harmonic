# Design — #342

The spec deltas are the normative behavior contract. This design records its
rationale, implementation shape and ownership; acceptance is defined in `specs/`.

## ADR 342 — Price observed burden before choosing episode ownership

### Approved direction

The operator approved: “Price the new findings using the existing model: observed
glucose burden for impact, plus recurrence for Priority.” For overlapping advice,
compare impact, retain the lower-impact explanation as outranked evidence, and
make no claim about the benefit of an intervention. The local research is recorded
at `docs/scope/342-impact-research.md`; no fitted model from it ships.

### One evaluator, two stages

Keep `assemble` and the store-facing Scenario entry as caller-facing interfaces.
Concentrate the shared episode evaluation behind a new deep module
`ciq_autotune/analyzers/scenario/evaluation.py`: event streams, current configs,
window bounds and answers in; one evaluation containing episode geometry, candidate
matches, prices, winners and occurrence/population identities out. `assemble`,
`tally_attributions`, model-view and exposure construction consume that result.
The module earns its seam by replacing the duplicated evaluation across these real
callers. No registry framework or second classifier implementation is introduced.

First collect every existing matched classifier, not only the first meal match,
and supported sequence candidates. Establish bounded episode geometry before price
comparison. Preserve the existing segmentation, caused-low splits, rebound terminal,
return-to-range extension and non-overlap clamps; candidate winner selection must
not resize the outcome whose severity supplied its comparison. In groups with no
sequence candidate, attribution remains today's earliest-actionable-driver rule.
Groups with a supported sequence candidate compare that candidate with every
existing matched explanation in that group.

Compute each contender's candidate impact once from its matched population before
ownership: the mean of the existing `normalized_severity(severity_score(...))`
over unique occurrence representatives. Preserve each ordinary lever's current
occurrence identity; a sequence occurrence uses the worst member episode as its
representative, as the existing multi-episode meal policy does. Do not sum the
4-hour and 6-hour report intervals, or add sequence severity on top of member
severity. A candidate's raw observations may be compared by several explanations;
that comparison is not an attribution tally or additive burden total.

Choose the candidate with the larger unrounded candidate impact for a contested
episode. Exact ties between the two new levers prefer Repeat eating, as #342
already directs. Other exact ties use the existing chronological classifier order.
Retain candidate matches and their impact even when they lose; preserve model-view
`outranked` and findings' row-relative `fired` distinction. Do not silently rewrite
those two different evidence semantics into one flag.

Only then derive attributed occurrence counts: one episode has one owner; multiple
episodes owned by the same new lever within one sequence count once. Recurrence is
the existing Wilson lower bound of winning unique occurrences over eligible
opportunities. Published impact is the same pre-ownership candidate impact used to
choose the winner; do not recompute it from only the winners and create a feedback
loop. Priority uses the existing shared formula with that impact and recurrence.
This changes the impact population for a lever participating in sequence competition;
levers not participating retain existing scoring behavior. A candidate with no
owned occurrence contributes no Pattern. Other levers' settings prices never change.

### Sequence identity, membership and eligibility

Reuse the report's one construction, pooled empirical quintiles, coverage and
exclusion logic. Deepen `eating_sequences.py` with one evaluation that yields both
its unchanged aggregate report and the eligible identity-bearing sequence records
needed by behavioral evaluation; `build_report` remains a compatible report-only
view of that result. No projection reconstructs sequence chains, quintiles or floors.

Sequence identity is derived from the first carb-bearing pump event's stable
`seq_num`, with the existing timestamp identity fallback for inputs lacking a
sequence number; include the full membership list. It is not a generated episode
index, current quintile or winning lever. Rank equal-time boluses deterministically
by time and stable event identity (use the same timestamp fallback when seq_num is absent) without changing the existing grouping or carb totals.

For each new lever, select the detector's already-chosen supported comparison and
period. High-carb eligible opportunities are that scope's qualifying sequences;
Q5 sequences are candidates. Repeat eligible opportunities are qualifying
single-window or three-plus-window sequences in the selected matched carb quintile;
the two-window band is descriptive and outside that denominator. A period exclusion
removes the sequence from both candidate count and denominator. Both comparison
cohorts must still have at least eight qualifying sequences before any candidate is
admitted. Preserve the detector's TIR-first / SD-second headline rules and its fixed
Diagnose source window; never widen that window to make a finding appear.

An episode's association is determined by its outcome witness: the timestamp of its
most clinically significant CGM reading within its bounded severity interval (the
nadir when below range, otherwise the peak, earliest timestamp on equality). Associate
it with an eligible sequence only when that witness lies in that sequence's selected
half-open measured interval. Preserve that witness in the evaluation so projections
never guess from a trigger or array position. Publish its clock minute as
`outcome_minute` on each associated occurrence. The Python window-membership reader
and its JS mirror prefer that served field over static lever outcome-kind lookup;
the normal legacy fallback applies only to legacy occurrences. Both new entries
use `sequence` as their closed-set outcome-kind marker, meaning an explicit witness
is required rather than a fixed high/low anchor. Missing required witness withholds
the new occurrence from scoped membership instead of falling back to its trigger.
The normative compatibility rule is in behavioral-layer requirement 3. No CGM witness means no sequence
association. Existing next-sequence overlap exclusions keep admitted intervals from
reaching into a later sequence. If the two detectors select different periods, each
candidate must satisfy its own interval; both may attach to the same sequence.

A currently leverless anchor group may become sequence-owned; it uses the existing
ordinary bounded end resolution and the same severity calculation. Its eligibility
participates in the pre-pass that clamps an earlier rebound, avoiding overlapping
owned danger-time. No free-standing synthetic bolus or invented glucose event is
created. If an eligible sequence has no associated episode, it remains in n and
contributes no k. Enforce k <= n through identity membership, never by clamping n.

### Consumer contract and compatibility

The evaluation publishes the two closed lever values `high_carb_sequence` and
`repeat_eating`, candidate/winner information, sequence occurrence ids, member
episode ids, outcome witness, recurrence population and raw counts. Exposures,
model-view, outcome tallies, case-file preparation and findings read the same result.
The population policy owns the sequence noun and cohort comparison reference, rather
than pretending a sequence is a single meal bolus. Both new metadata entries have
Meals display affinity (`Exposure.MEALS`), but their sequence recurrence population
is custom (`recurrence_family=None`, noun `sequences`). Deepen that policy to consume
the shared evaluated sequence records, not the existing custom-policy bolus filter.
Neither lever enters the legacy clean-rate accounts or `_BEHAVIOR_ORDER`: this ticket
adds no Verify trend tile or new Exposure family. `compute_clean_rates` must explicitly
exclude these sequence populations before converting a custom noun to `Exposure`;
existing custom meal populations retain their current rollup. Existing levers still
contribute their final winning counts, which may change under the approved competition.
The normative compatibility rule is in behavioral-layer requirement 3. Preserve old payload keys and
add versioned/additive fields following each payload's current schema convention.

The new lever finding rows use the normal server Priority queue and a served short title,
headline and `asserts_move: false` where the row contract carries that field. No
behavioral metadata maps to a pump parameter. Full source-window pricing stays
stable under a drawn clock window; membership of the filtered row is decided by the
served outcome witness. A chart and its finding must belong to the same analysis
generation; reuse the existing coherence/retry behavior rather than introducing a
new cache, registry or endpoint lifecycle.

### Lock 2 reconciliation — habit membership and episode coverage

High-carb sequence and Repeat eating are lever patterns and lever findings, not
new outcome Patterns. Both are habit-member-only under **Highs after meals** in
every window; neither enters its `rate_levers`. Each retains its own producer
floor, eligible sequence denominator and Priority. The parent retains its meals
population and the union of winning identities from its existing rate levers.
Support is not pooled and no Exposure family or Verify trend tile is added.

The exposures producer maps member associations only to emitted meal opportunities
covered by the winning bounded episode. Sequence pump-event membership, nearby
boluses, chart citations and witness instants do not supply meal targets. These
additive `member_associations` are evidence, never rate claims. A supported winner
with no covered meal stays visible in its own sequence case file and remains a
habit member, without creating a Pattern meal occurrence. One episode still has
one owner under this ADR's observed-impact decision.

Whole-day `claimed_by` is the deduplicated union of served habit-member and
rate-lever subjects, preserving rate-only meal_bolus_short. The inherited painter
nests the causes with quiet ticks, member counts and server adjacency; it adds no
rank numeral, Findings/Sift count or new Pattern copy/chip key. The parent keeps
highs/meals chips and pattern-case-file; causes receive highs/meals chips and use
eating-sequence charts. Scoped queries omit the whole-feed Pattern under the
existing rule, follow each cause's explicit witness, preserve source-window
prices and introduce no orphan `claimed_by`.

## ADR 342 — Extend the shipped chart through the design harness

Surface lifecycle: revise. Existing contract:
`mockups/finding-evidence-routing.behavior.md` and
`frontend/diagnose-workstation-behavior.replay.mjs`.
The baseline replay and inventory passed; see `evidence/baseline.md`.

The worktree's `AGENTS.md` declares manufactured `npm install && npm run dev`
inside `harness/` for chart work. Use it for the new story and visual iteration.
The harness imports the real Diagnose composition and chart modules; the chart
is not reimplemented in a separate mock. Use the existing shipped tokens, nameplate,
thumbnail, compact-row mini, stage tile and fullscreen frame.

The added registry kind is `eating-sequence` (six total entries), selected for the two new levers before
the generic event-comparison predicate. It shows served cohort pairs for
in-sequence, post-4h and post-6h; the active detector headline comparison is identified
without calculating another verdict. High-carb compares Q5 with the rest; Repeat
eating compares three-plus with single-window at matched carb quintile. Every mark
uses served values, units, cohort names and counts. Insufficient/null cells stay
explicitly insufficient, never zero. Do not plot incompatible metric units on one
unlabeled axis or treat a cohort aggregate as an individual's predicted trace.

Establish a supported starting clock window before declaring a story ready.
Add manufactured story states for both levers, thin and null cells, different
selected periods and long labels. Exact chart layout is iterated with the operator
inside the real chart harness under this revision lifecycle. Preserve all existing
stage, drawer, dock, sizing, selection and fullscreen behavior. Integration evidence
then uses the documented synthetic QA copy-then-serve command in `AGENTS.md` with
`--no-fetch --token ''`, never the research snapshot.

Carry the new behavior stories and source/style inventory in the existing ledger,
update `DESIGN.md`'s chart-family description and `mockups/INDEX.md`, and retain
before/after synthetic evidence. No existing story is authorized for retirement by
this change. Any base behavior gap blocks freeze and is recorded before admission.

### Served transport and inherited controls

The dedicated synthetic payload contains fifteen manufactured states, each with
`global` and `0-360` (Overnight) windows. Each window retains the actual producer's
preparation, including original `findings.rows`, `rendered_rows`, event/clock cases
and every sequence selection. Repeated JSON containers are interned in `shared`
and referenced by `$ref`. The single vue-free fixture decoder expands those values
for the harness, replay and Node consumers; it reconstructs no findings, verdicts
or population counts. This is fixture transport, not a new production API format.
Python compares expanded captures with fresh public producers. The dedicated
payload's size guard remains below 1,000,000 bytes.

The sequence detail and occurrence footer call the same `renderClearTrace`
control, with the existing Clear trace label and callback. Sequence detail does
not add a Day handoff. Both family-label and short-family copy say `sequences`.
The backend report formats percentages in the served summary sentence to one
decimal; report numeric fields retain their precision.

The ledger admits exactly S151–S158: covered/empty nesting and dual-cause adjacency
(S151–S152), cause minis and All charts with the parent chart retained
(S153–S154), canonical drill/fullscreen/return and shared clear control
(S155–S156), scoped witness membership (S157), and truthful thin/null/period/unit/
label states (S158). There are 183 issued and 182 active stories; S117 stays retired.
No inherited behavior is retired by this change. Measured evidence and remaining
coordinator gates are recorded in `evidence/verification-lock-2.md`.

## Risk contract

- Must prevent: any pump-setting change or Plan staging from these levers; a frontend-derived verdict, median or difference; real data in fixtures, tests, prompts or logs; a finding that fires on fewer than eight qualifying sequences per cohort; secret exposure; irreversible loss of authoritative data; silent incorrect success.
- Must recover: no new automatic recovery requirement.
- Accepted failure: a window with no supported cohort shows no finding. Rare recoverable operational failures stop clearly for manual recovery.
- Unsupported: live pulls, real-data fixtures, new pump-setting levers, new Diagnose surfaces or altered stage/dock/drawer behavior.
- Evidence owed: a test through the analyzer interface showing each lever's finding appears in the projection from N synthetic sequences and is absent below the floor; the chart kind rendered in the shipped Diagnose tile with the existing browser gates green; a collision test for the settled one-lever rule.

## Wiring and ownership

| Producer | Contract | Consumers | Owner |
| --- | --- | --- | --- |
| Eating-sequence evaluation | Report + eligible sequence identities/cohorts/intervals | Scenario evaluation | Chunk 1 |
| Scenario evaluation | Candidates, candidate impact, winner, unique counts and outcome witness | Scenario report, tally, model-view, exposures | Chunk 1 |
| Population policy + evaluation | Served sequence case file and finding rows | Existing API generation/preparation, frontend adapter | Chunk 2 |
| Served report/finding | Sixth registry descriptor and chart data | Shipped tile and harness story | Chunk 3 |
| Synthetic recipes and real producers | Frozen fixtures and JS parity inputs | Tests, harness, replay | Chunk 4 |

The exact path allowlists and acceptance partition are carried by the work order.
