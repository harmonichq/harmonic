# Design — event chart baseline populations (#180)

## ADR 180 — Every event comparison names its own population

### Context

Every By-event comparison in Diagnose draws its cohorts from a verdict taxonomy,
so the line a reader compares against is whatever the classifier did not claim.
The finding case-file lens splits the exposure roster by the five verdict states
(`finding_case_file._event` over `findings_projection.FINDING_VERDICTS`), which
puts `Does not meet` — the `clean` verdict — under the comparison. The standalone
comparison feed does the same thing in a second vocabulary
(`fired` / `near_rule` / `neutral` / `another_factor` / `excluded`), where
`neutral` reads "Comparable; no factor matched".

Both are verdict residue: a negative verdict on occurrences already routed to the
factor, not a population the comparison's claim rests on. #178 overturned this for
one family, giving Missed / unannounced meal a declared positive baseline
(announced completed-bolus meals). This record generalizes that move to every
family and closes the taxonomy, before the evidence canvas (#135) bakes event
tiles against per-family shapes.

### Decision

**One shape, every factor.** A comparison draws at most four series: occurrences
this factor matched; occurrences it nearly matched; the comparison population;
and the reader's own selected occurrence trace. There is no fifth.

**The three cohorts partition the population.** A nearly-matched occurrence is
drawn on the near-miss line only. The three counts reconcile against the
population, so the chart's own numbers add up.

**The comparison population is the factor's own declared population with the
occurrences this factor matched taken out — and nothing else taken out.** An
occurrence some other factor claimed is an ordinary member of the comparison
line; removing it would rebuild the `Does not meet` cohort under a new name. A
comparison population is never conditioned on the outcome that followed (#178's
selection-bias rule).

**Comparison identity, per factor:**

| Factor | Comparison population |
| --- | --- |
| Carb undercount | Other completed carb-bolus meals |
| Late bolus | Other completed carb-bolus meals |
| Meal over-delivery | Other completed carb-bolus meals |
| Over-treated low | Other low excursions |
| Correction on active insulin | Other low excursions |
| Correction stacking | Other back-to-back correction pairs |
| Missed / unannounced meal | Completed carb-bolus meals (cross-family, #178) |
| Meal bolus fell short | Completed carb-bolus meals (cross-family) |

The two Highs factors are cross-family because both make a claim about a meal
dose, so meals are the population their claims rest on. Their near-miss line
stays with their own family, keeping all eight factors on one three-line shape.

**Anchors for the cross-family pairs.** Missed / unannounced meal keeps #178's
pairing (detected rise onset against completed carb-bolus time, fixed
`[-60, +300]`). Meal bolus fell short anchors both lines on a meal dose: matched
occurrences on the dose the engine already records as the one it judged
(`MealBolusShortVerdict.meal_t`), comparison meals on their own dose, over the
same fixed window. Both lines then mean "the hours after a meal dose".

**Occurrences too sparse to judge are counted, never drawn**, riding the support
grading already in the tree (`event_comparison.py:685-691`).

**A window too thin to build a comparison draws the matched line and says the
comparison is unavailable.** Never a withheld chart, and never a silent fall back
to the verdict cohorts.

**Naming is server-owned.** The matched and nearly-matched lines read the same on
every chart; the comparison line names its own population. The frontend renders
the published words and derives none of them, per the repository's standing rule
that cohort membership stays server-owned.

**One builder, one entry point.** The standalone comparison feed is retired
rather than kept beside the case files. A case file becomes reachable by factor
and window rather than only by a finding that fired, and the By-event view asks
for one the same way every other surface does.

### Consequences

- Decision 6 of `openspec/changes/diagnose-finding-case-files/design.md` is
  amended: event alignment no longer reprojects the roster into the five verdict
  cohorts. The five-state verdict taxonomy and the Finding attribution account
  are untouched for the verdict and accounting surfaces, which keep their own
  denominator.
- The `another factor applies` cohort and its request coordinate disappear with
  the retired vocabulary.
- The attribution equations that assume a finding's claim
  (`finding_case_file.py:110-118`) must be scoped to finding-keyed requests, so a
  factor-and-window request is not measured against a claim it does not carry.
- The retired schema's fixtures, mirrors and drift checks retire or move with it,
  every existing `--check` obligation preserved.
- #135's Explore mode needs the same factor-and-window generalization, and gets
  it here rather than forcing it later.
- #178 remains the prototype and lands first; nothing here contradicts it.

### Provenance

Settled by operator interview during `/ticket triage 180` (2026-08-25). Question
by question record and the risk contract: `docs/scope/180-event-chart-baselines.md`.
