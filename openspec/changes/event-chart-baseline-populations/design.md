# Design — event chart baseline populations (#180)

## ADR 180 — Every By-event comparison names its own population

### Context

Every By-event comparison in Diagnose draws its cohorts from a verdict taxonomy,
so the line a reader compares against is whatever the classifier did not claim.
The Finding case-file lens splits the Exposure population by the five verdict
states (`finding_case_file._event` over `findings_projection.FINDING_VERDICTS`),
which puts `Does not meet` — the `clean` verdict — under the comparison. The
standalone comparison feed does the same thing in a second vocabulary
(`fired` / `near_rule` / `neutral` / `another_factor` / `excluded`), where
`neutral` reads "Comparable; no factor matched".

Both are verdict residue: a negative verdict on Occurrences already routed to the
lever, not a population the comparison's claim rests on. #178 overturned this for
one Exposure, giving Missed / unannounced meal a declared positive baseline
(announced completed-bolus meals). This record generalizes that move to every
lever and closes the taxonomy, before the evidence canvas (#135) bakes event
tiles against per-Exposure shapes.

### Decision

**One shape, every lever.** A comparison draws at most four series: Occurrences
this lever matched; Occurrences it nearly matched; the comparison population; and
the reader's own selected Occurrence trace. There is no fifth.

**The three cohorts partition the Exposure population.** A nearly-matched
Occurrence is drawn on the near-miss line only. The three counts reconcile
against the population, so the chart's own numbers add up.

**The comparison population is the lever's own Exposure population with the
Occurrences this lever matched taken out — and nothing else taken out.** An
Occurrence some other lever claimed is an ordinary member of the comparison line;
removing it would rebuild the `Does not meet` cohort under a new name. A
comparison population is never conditioned on the outcome that followed (#178's
selection-bias rule).

**Comparison identity, per lever:**

| Lever | Comparison population |
| --- | --- |
| Carb undercount | Other completed carb-bolus meals |
| Late bolus | Other completed carb-bolus meals |
| Meal over-delivery | Other completed carb-bolus meals |
| Over-treated low | Other low excursions |
| Correction on active insulin | Other low excursions |
| Correction stacking | Other back-to-back correction pairs |
| Missed / unannounced meal | Completed carb-bolus meals (cross-Exposure, #178) |
| Meal bolus fell short | Completed carb-bolus meals (cross-Exposure) |

The two `HIGHS` levers are cross-Exposure because both make a claim about a meal
dose, so meals are the population their claims rest on. Their near-miss line
stays with their own Exposure, keeping all eight levers on one three-line shape.

**Anchors for the cross-Exposure pairs.** Missed / unannounced meal keeps #178's
pairing (detected rise onset against completed carb-bolus time, fixed
`[-60, +300]`). Meal bolus fell short anchors both lines on a meal dose: matched
Occurrences on the dose the engine already records as the one it judged
(`MealBolusShortVerdict.meal_t`), comparison meals on their own dose, over the
same fixed window. Both lines then mean "the hours after a meal dose".

**Comparison support decides what is drawn, and it is unchanged.** Occurrences
with too few usable readings to contribute are counted, not drawn, on the
existing `Supported` / `Limited` / `Withheld` grading
(`event_comparison.py:685-691`). This record changes which Occurrences a cohort
holds, never how a cohort's presentation authority is graded.

**A window whose comparison population is Withheld draws the matched line and
says the comparison is unavailable.** Never a withheld chart, and never a silent
fall back to the verdict cohorts.

**Naming is server-owned.** The matched and nearly-matched lines read the same on
every chart; the comparison line names its own population. The frontend renders
the published words and derives none of them, per the repository's standing rule
that cohort membership stays server-owned.

**One builder, one entry point.** The standalone comparison feed is retired
rather than kept beside the case files. A case file becomes reachable by lever
and window rather than only by a Finding that fired, and the By-event view asks
for one the same way every other surface does.

### Consequences

- Decision 6 of `openspec/changes/diagnose-finding-case-files/design.md` is
  amended: event alignment no longer reprojects the roster into the five verdict
  cohorts. The five-state verdict taxonomy and the Finding attribution account
  are untouched for the verdict and accounting surfaces, which keep their own
  denominator.
- The `another factor applies` cohort and its request coordinate disappear with
  the retired vocabulary.
- The attribution equations that assume a Finding's claim
  (`finding_case_file.py:110-118`) must be scoped to Finding-keyed requests, so a
  lever-and-window request is not measured against a claim it does not carry.
- The retired schema's fixtures, mirrors and drift checks retire or move with it,
  every existing `--check` obligation preserved.
- Two capability statements assert the five cohorts today and become false only
  when the build lands: `openspec/specs/surfaces/spec.md:55-57` and
  `openspec/specs/behavioral-layer/spec.md:39`. They fold in that pull request,
  not in this record's.
- #135's Explore mode needs the same lever-and-window generalization, and gets it
  here rather than forcing it later.
- #178 remains the prototype and lands first; nothing here contradicts it.

### Provenance

Settled by operator interview during `/ticket triage 180` (2026-08-25). Question
by question record and the risk contract:
`docs/scope/180-event-chart-baselines.md`. Build handoff: #181.
