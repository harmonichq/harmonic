# Design — Highs after meals counts (#424)

## Reproduction

Grounded on origin/main a4d374a7, in-process, synthetic data only.

1. **Pattern case file, hand-built through the test helpers** of
   `tests/test_finding_case_file.py` (six meals: one claimed by Carb undercount,
   one calm, one with no data, one where Late bolus matched on a meal that did not
   drive its episode, one that Meal over-delivery drove, one named by a Meal bolus
   fell short high). The event projection served `matched 2, nearly_matched 0,
   comparison 4, not_comparable 4` against a denominator of 6: the leftover equals
   the comparison cohort, the no-data meal sits inside that cohort, and the caption
   would read 2 + 0 + 4 + 4 = 10 of 6. Verdict counts were `fired 2, outranked 2,
   near_miss 0, no_data 1, clean 1`; both outranked meals carry `member: "clean"`
   and sit inside the header's `6 − 2 = 4` not attributed.
2. **Manufactured QA case stores** (`scripts/gen_qa_e2e_db.py --case`, read
   through `execute_case` and `finding_case_file.prepare`):
   - `behavioral-carb-undercount`: Highs after meals, 3 of 6 meals; verdicts
     `fired 3, near_miss 1, no_data 1, clean 1`; event counts `matched 3,
     nearly_matched 1, comparison 2, not_comparable 2`. The caption would read
     "3 matched · 1 nearly matched · 2 comparison · 2 not comparable" (8 of 6)
     beneath a band footer reading "1 not comparable". Its causes, Carb undercount
     2 of 6 meals and Late bolus 1 of 6 meals, add up to 3.
   - `behavioral-missed-meal`: Missed / unannounced meal, 2 of 6 highs; event
     counts `matched 2, nearly_matched 1, comparison 2, not_comparable 3`. Here 3
     highs really are in no cohort, because the comparison cohort is announced
     meals; the caption still calls them "not comparable" beside a band footer
     whose "not comparable" is the one no-data high.
   - `behavioral-correction-stacking`: Lows after correcting highs, 2 of 2 lows;
     its one folded cause, Correction stacking, prints only "2 of 8 correction
     clusters", so no folded line is on the Pattern's population.
   - The showcase: Highs after meals folds Meal bolus fell short ("1 of 32
     meals"), so a rate lever that is not a habit member does get a cause line.

## ADR 424 — The comparison's leftover is the roster outside every cohort

**Context.** `finding_case_file._event` serves `not_comparable = len(roster) −
matched − nearly_matched`. ADR 180 already rules that for a comparison drawn from
the lever's own population the three cohorts partition that population, and the
frontend validator already enforces that partition for every same-population case
file. The leftover is therefore the comparison cohort counted a second time,
labelled with the word ADR 41 gives the no-data verdict. Only a cross-population
comparison (Missed / unannounced meal, #178 and ADR 180) leaves roster Occurrences
in no cohort.

**Decision.** The case file serves `outside_comparison`: the roster Occurrences in
none of the matched, nearly-matched and comparison cohorts. It is always served,
zero included. For a same-population case file matched + nearly matched +
comparison equals the denominator and `outside_comparison` is zero; for a
cross-population case file matched + nearly matched + `outside_comparison` equals
the denominator. The `not_comparable` count key is retired from the case file. The
desk's caption names this count "outside the comparison", after the served
population noun, and prints it only when it is non-zero. The verdict band keeps
ADR 41's "not comparable" for no data, unchanged.

**Consequences.** Every drift-checked artifact that serializes case files moves
with the producer: the Missed-meal fixture, the workstation synthetic capture and
the design exploration's captures regenerate, and the fixture-only Pattern
case-file projector (`mockups/diagnose-event-comparison.synthetic/project.mjs`)
changes with the frontend validator that checks its output. The HTTP and surface requirements that named a
"not-comparable" Missed-meal count now name "outside the comparison".

## ADR 424 — Each cohort names the band state it holds

**Context.** The band counts Meets criteria, Borderline and Does not meet; the
cohorts count Matched, Nearly matched and the served comparison cohort. For a
same-population comparison Matched is exactly the Meets criteria Occurrences and
Nearly matched exactly the Borderline ones; for Missed / unannounced meal Matched
is only the attributed subset of Meets criteria. The cohort names are locked
language (desktop lock HV2-18) and #437, which owns the Pattern chart's key, keeps
them.

**Decision.** Each served cohort carries `band_verdict`: `fired` on a matched
cohort drawn from verdict `fired`, `near_miss` on a nearly-matched cohort, and
`null` otherwise (the comparison cohort, and Missed / unannounced meal's attributed
cohort). The caption shows the link once, after the cohort's served name, in the
band's own words ("Matched (meets criteria)"). The cohort names do not change, so
the chart key #437 adds agrees with the caption.

**Consequences.** The validator checks that a cohort's `band_verdict`, when set,
equals every member's verdict and that its count equals the band's count for that
verdict. The desk derives no link from counts.

## ADR 424 — A folded cause counts on its Pattern's population

**Context.** The rail folds every served Finding row whose lever is one of a
Pattern's rate levers or habit members (`findings_projection._pattern_rows`), and
each line prints that cause's own count sentences, one per family it appears in
(ADR 413). A Pattern's count, however, is the number of Occurrences in its one
rate family claimed by any of its rate levers (`outcome_patterns._rate`). The
lines therefore never show that they make up the Pattern's count: a cause may be
counted only in another family (Correction stacking in correction clusters), may
add a second family (Late bolus in correction clusters), or may not be a rate
lever at all (a Sequence habit, which CONTEXT.md says adds nothing to the rate).
The issue's theory that Meal bolus fell short counts toward the total with no line
naming it does not hold: the rail folds rate levers as well as habit members, and
the showcase shows its line.

**Decision.** One Pattern-owned function in `outcome_patterns.py` credits each of
a Pattern's claimed Occurrences to the first rate lever, in the roster's rate-lever
order, whose claims include it. `_rate` counts its result, `_pattern_case` names
each claimed meal's member from it, and the findings projection reads it over the
same window population the Pattern producer used. Every folded cause serves
`fold_sentences`: a rate-lever cause leads with its credited count on the
Pattern's denominator and noun (scope `pattern`), then its count sentences on any
other family (scope `outside`); a cause that is not a rate lever serves all its
count sentences as `outside`. The credited counts of a Pattern's folded causes add
up to the Pattern's count. The fold prints every fold sentence, sets the outside
ones apart behind the words "outside the count", and prints no outcome word, as
before. A cause's `count_sentences` and `appearances`, and the Pattern roster the
projection publishes verbatim, are unchanged.

**Consequences.** A meal two rate levers both claim is credited to the first; its
second claimant's credited count is lower than its own case file's claimed count
by exactly the shared meals. The fixture-only findings mirror transcribes the
credit over its own outcome-window filter and the frozen projection fixture, the
eating-sequence fixture and the exploration's captures regenerate. The QA case
expectations, the showcase and the Pattern roster do not move. The #413 rail-fold
requirement, still in the unarchived `desk-design-completion` change, is modified
here, so that change archives first.

## ADR 424 — Claimed-by-another-factor meals are outside the Pattern's count

**Context.** The issue asked whether a Pattern case file's "claimed by another
factor" meals belong inside the header's "not attributed". `_pattern_case` marks a
meal `fired` only when one of the Pattern's rate levers claims it; a meal where a
member habit matched without that claim, or where another lever drove the meal's
episode, reads `outranked`. That follows ADR 0019 §2's anchor state (a matched
anchor that is not its episode's driver is outranked), and ADR 41 labels outranked
"claimed by another factor".

**Decision.** These meals are outside the Pattern's claimed count, so the header's
"not attributed" (denominator − claimed) is right and does not change. A test on
the case file's verdict counts pins it: claimed equals the `fired` count, and not
attributed equals outranked + near miss + no data + clean. The words for the
outranked state are #423's; this change adds none and leaves the band's residue
line as #423 leaves it. The per-meal reason for a selected Occurrence is #432's.

## Grounding

- Case-file consumers of the leftover: `frontend/diagnose-workstation.js`
  (caption), `frontend/finding-case-file-validation.js` (total check),
  `mockups/diagnose-event-comparison.synthetic/project.mjs`, and the committed
  captures `frontend/__fixtures__/missed-meal-comparison.json`,
  `mockups/diagnose-workstation.synthetic/finding-case-files.json` and
  `mockups/harmonic-v2.exploration/{focus,journey,workstation}.json`. No other
  reader: `frontend/diagnose-workstation.js` reads `projection.counts` by cohort
  key for the selected position, and those keys stay.
- Projection consumers of a new row field, measured by #413 on this tree's
  parent: `scripts/gen_findings_projection_fixtures.py`,
  `scripts/gen_eating_sequence_fixtures.py` and
  `mockups/harmonic-v2.exploration/generate.py`, plus
  `mockups/findings-projection.mirror.mjs`.
- The frozen projection fixture already folds a two-family rate-lever cause and a
  cause counted only outside its Pattern's family, so mirror parity exercises both
  fold scopes.
