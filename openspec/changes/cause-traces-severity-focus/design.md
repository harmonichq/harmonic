## ADR 593 — A claim carries its episode's severity, and the Pattern producer orders causes by it

**Context.** The drill-down lock orders a Pattern's cause cards by summed
episode severity, largest first: the hypo-weighted mg/dL·min outside range of
`analyzers/scenario/severity.severity_score`. A Pattern's shares come from
`outcome_patterns.credited_claims`, which credits each claimed Occurrence of the
Pattern's family to the first rate lever, in roster order, whose
`attributed_levers` include it (ADR 424). The findings projection serves them
in roster order (`findings_projection._served_as`).

Every evaluated episode already carries its severity
(`evaluation.EvaluatedEpisode.severity`, over its bounded `[start, end]`). The
scenario payload republishes it per policy Occurrence in each Pattern's
`occurrence_groups`, but that cannot be the source here, for two reasons a spike
on the `pattern-correction-collapse` case store showed:

1. A credited claim can have no group. That store credits one low to
   Correction stacking, from a single episode; the engine builds no scenario
   Pattern for a lever under `engine_min_occurrences`, so no group carries its
   severity (720.0 for that episode).
2. The two feeds name episodes differently (`ep-000` in the scenario payload,
   `2024-05-14-ep0` on an exposure Occurrence) from two separate evaluations, so
   joining them is a positional coincidence, not a key.

The exposures feed attaches every claim where it appends to
`attributed_levers`, holding the evaluated episode the claim came from:
`explore_exposures.build_exposures`, at the episode's own claim and at a
correction-stacking episode's reached low. On that store the stamped values
(Correction stacking 720.0; Correction on active insulin 3377.5 and 3377.5)
equal the scenario payload's episode severities.

**Decision.**

1. Each exposure Occurrence serves `claim_severity`, a map from every lever in
   its `attributed_levers` to the severity of the episode that lever's claim
   came from, the largest when one lever claims it from more than one episode,
   as the engine takes a policy Occurrence's worst episode. It is written at the
   two places a lever is appended, so every attributed lever has one; an
   Occurrence with no claim serves none. A scoped window's population is a deep
   copy, so it carries the same values.
2. `outcome_patterns.cause_order(exposures, family, rate_levers)` is the one
   ordering rule. It calls `credited_claims` unchanged and returns each rate
   lever with a share, with that share, ordered by the sum of
   `claim_severity[lever]` over the Occurrences credited to it, largest first,
   ties in roster order. It reads the severity of the crediting lever's own
   claim, never another lever's claim on the same Occurrence.
3. The findings projection's shares and the Pattern case file's per-cause traces
   both read that rule over the same window population. Nothing else orders
   causes; the app never sorts.

**Consequences.** Crediting, counts, shares and the roster are unchanged; only
the served order moves. `/api/explore/exposures` gains a field, so every
hand-built exposure input in the tests and the projection fixture generator that
reaches a share must carry it; no reader defaults a missing one (`tasks.md` lists them). On
`pattern-correction-collapse`, Lows after correcting highs serves Correction on
active insulin (2 lows, 6755.0) before Correction stacking (1 low, 720.0),
the reverse of roster order.

## ADR 593 — A Pattern that keeps its row serves its shares on that row

**Context.** ADR 520 serves a Pattern's shares (`cause_counts`) only on the row
of a habit a Pattern is served as. A meal Pattern always holds its carb-ratio
setting member, and `build_outcome_patterns` collapses only a Pattern with one
admitted member and no setting, so a meal Pattern never collapses and its
`pattern:` row serves no shares; its causes reach the queue only as folded rows
with fold sentences. The drill-down's example is Highs after meals with Carb
undercount and Late bolus, and the Queue model already reads a Pattern's count
through one "counter": the served-as object for a collapsed Pattern, the Pattern
row otherwise (`queue-model.ts` `pattern()`).

**Decision.** Every Pattern row that serves a count sentence serves
`cause_counts` beside it, in `served_as`'s entry shape (`subject`, `title`,
`count`) and order, from the same function; a Pattern row with no count
sentence serves `cause_counts: null`. The drill-down then reads a Pattern's
causes from the same counter it reads the count from.

**Consequences.** The findings projection fixture and the component library's
fixtures gain the field on Pattern rows; the live adapter already passes rows
whole. Fold sentences are unchanged.

## ADR 593 — Each cause's trace is the Pattern's own cohort, restricted to its credited Occurrences

**Context.** `finding_case_file._pattern_traces` serves `traces.pattern` from
every claimed Occurrence and `traces.typical` from the Pattern's comparison
(ADR 523): a meal Pattern's event-comparison meals, every other low, or every
other lone correction. Each Occurrence's crediting lever is already known there
(`claimant_of`, served as `occurrences[].member`).

**Decision.** A Pattern case file serves `traces.causes`, one entry per cause in
`cause_order`: `{"subject": "habit:<lever>", "pattern": <cohort>}`. The cohort is
`_trace_cohort` over the anchors the pooled trace would draw for that cause's
credited Occurrences alone (the meal's bolus, the low's nadir, or the correction
dose the low followed under that lever), with the same window, bins, ten-minute
lead and eight-episode cut, so a cause of eight or fewer draws its episodes even
when the Pattern draws only its band. Typical is not repeated: every cause is
drawn against `traces.typical`. A Pattern with no claimed Occurrence serves an
empty list.

**Consequences.** One cause's anchors are a subset of its credited Occurrences,
and the causes' anchors together are the Pattern's, so a card's count, chart and
population read one source. A correction dose that two causes' lows both
followed is drawn once in the pooled trace and once under each cause.
