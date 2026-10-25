# Design — the Overview's insulin cards (#633)

## ADR 633 — Two cards, read from the one insulin answer

Connor's request (#631), with Tandem Source's own Overview for reference, is two
cards: Insulin summary and Bolus review. Site changes were dropped by Connor on
2026-10-24 ("I don't need site change data, just the other stuff"). Each card
reads `/api/explore/insulin?days=N` (#632, ADR 632) for the window the Overview
shows, and follows its 14 / 30 / 90 d switch as the basal estimate and Meal
size do; neither card prints the window, which the screen's switch and date
span already name. Neither card carries a control: the Overview is a report.

## ADR 633 — What each card prints

**Insulin summary.** Three blocks, each a headline row and its parts:

- "Average daily dose": `daily_dose.units` with "U". Beneath it "Basal" and
  "Bolus", each its `share` as a whole percent and its `units` with "U".
- "Average daily boluses": `boluses.count`. Beneath it "Manual" and
  "Control-IQ", each its `share` and its `count`.
- "Average daily carbs": `carbs.grams` with "g".

**Bolus review**, titled with "daily average" beside it, as Tandem draws it.
Two blocks under their headings:

- "Type": "Meal", "Correction", "Override", "Control-IQ" from `by_type`, each
  its `share` and `units` with "U".
- "Delivery method": "Standard", "Extended", "Quick", "Control-IQ" from
  `by_method`, each its `share` and `units`.

Rows are label, share, value in three columns; the headline values take the
§2.2 metric size, the parts the body size, in neutral ink with no colour, since
none of these figures is judged good or bad.

## ADR 633 — Triage defaults the replay may change

Set at triage (2026-10-25) so the mock can be built; each is named in the pull
request for Connor's replay, and the amendment records what he approves:

1. **"Meal", not "Food".** The type row the engine serves as `food` is the same
   split the Day screen's insulin bar prints as Meal (ADR 492 reused, ADR 632),
   so the Overview names it Meal: one served fact, one name (§1.5). Tandem's
   "Food" is the alternative.
2. **Precision.** Units and daily counts to one decimal (`fixed1`), carbs to a
   whole gram (`round`), shares as whole percents (`share`). Tandem prints
   units to two decimals and counts whole.
3. **Placement.** Below Meal size: on desktop the two cards side by side in one
   row of the Overview's cards, one height; on the phone stacked, Insulin
   summary first.
4. **Units.** "U" as the Day screen prints insulin, not Tandem's "units".

## ADR 633 — The states

- **Populated**: every row its values.
- **No boluses in the window**: Insulin summary prints Bolus at 0.0 U and its
  share; the boluses block prints 0.0 with no shares ("–"); Bolus review prints
  every row at 0.0 U and "–" for its share. The engine serves a share as null
  when its total is zero (ADR 632); a card never computes one.
- **No data**: the window is null or `delivery_days` is 0; each card prints
  "No data" under its title, as Meal size does.
- **Not yet read**: each card its skeleton.

A row whose engine value is null prints "–". The first days (five delivery
days) are a populated story at 14 d, to show a short window.

## ADR 633 — The no-bolus store comes from the generator

`scripts/gen_ui_fixtures.py` builds one store more, `wearer-no-bolus`: the
synthetic wearer's history materialized with its boluses left out (basal,
readings and pump events kept), served through the same `_insulins` read under
`overview`. `_require_insulin` fails unless it serves `delivery_days` above
zero and `bolus.units` 0 at 30 d. No value is hand-written.

## ADR 633 — The selectors and the words

`overview-model.ts` gains `insulinSummary(store, window)` and
`bolusReview(store, window)`, returning null when the window is not read,
'none' for no data, and otherwise `Sourced` values for every printed number
(`overview.<store>.insulin.<window>.<field>`), as `mealSize` does. The cards'
words reach the allowlist through §1.5 for the terms with a meaning to define
(Bolus, Manual, Override, Standard, Extended, Quick, Average daily dose) and
through the generator's §2.5 Overview label list for the rest (the titles,
"daily average", "Type", "Delivery method", "U", "g").
