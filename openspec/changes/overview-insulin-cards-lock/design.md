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

- "Average daily insulin" (default 5): `daily_dose.units` with "U". Beneath it "Basal" and
  "Bolus", each its `share` as a whole percent and its `units` with "U".
- "Average daily boluses": `boluses.count`. Beneath it "Manual" and
  "Control-IQ", each its `share` and its `count`.
- "Average daily carbs": `carbs.grams` with "g".

**Bolus review**, its title one line, "Bolus review (daily average)", in
Connor's own wording (#631); the parenthesis is the title's, not a caption
(§2.3 ban 1). Two blocks under their headings:

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

1. **"Meal", not "Food".** The type row the engine serves as `food` is split by
   the Day screen's rule (ADR 492, reused by ADR 632) with one difference: an
   overridden bolus counts whole under Override, so the Overview's Meal and
   Correction leave those boluses out where the Day screen's include them. The
   default keeps §1.5's Meal, whose meaning (a bolus for carbs, or the carbs part
   of a bolus) holds, and the Override row's §1.5 meaning states the carve-out.
   Tandem's "Food", a name the Day screen does not use, is the alternative that
   marks the difference.
2. **Precision.** Units and daily counts to one decimal (`fixed1`), carbs to a
   whole gram (`round`), shares as whole percents (`share`). Tandem prints
   units to two decimals and counts whole.
3. **Placement.** Below Meal size: on desktop the two cards side by side in one
   row of the Overview's cards, one height; on the phone stacked, Insulin
   summary first.
4. **Units.** "U" as the Day screen prints insulin, not Tandem's "units".
5. **"Average daily insulin", not "Average daily dose".** §1.5's Insulin is
   everything the pump delivered in a day, which this headline averages, and
   CONTEXT.md avoids "dose" as too generic. Tandem's "Average daily dose", the
   wording Connor quoted, is the alternative.

## ADR 633 — The states

- **Populated**: every row its values.
- **No boluses in the window**: Insulin summary prints Bolus at 0.0 U and its
  share; the boluses block prints 0.0 with no shares ("–"); Bolus review prints
  every row at 0.0 U and "–" for its share. The engine serves a share as null
  when its total is zero (ADR 632); a card never computes one.
- **No data**: the window is null or `delivery_days` is 0; each card prints
  "No data" under its title, as Meal size does.
- **Not yet read**: each card its skeleton.

A row whose engine value is null prints "–".

## ADR 633 — The no-bolus store comes from the generator

`scripts/gen_ui_fixtures.py` builds one store more, `wearer-no-bolus`: the
synthetic wearer's history materialized with its boluses left out (basal,
readings and pump events kept) through a new keyword on
`ui_patient.materialize`, `boluses: bool = True`, whose default leaves every
existing store byte-identical; with False it ingests no bolus row. It is served through the same `_insulins` read under
`overview`. `_require_insulin` fails unless it serves `delivery_days` above
zero and `bolus.units` 0 at 30 d. No value is hand-written.

## ADR 633 — The selectors and the words

`overview-model.ts` gains `insulinSummary(store, window)` and
`bolusReview(store, window)`, returning null when the window is not read,
'none' for no data, and otherwise `Sourced` values for every printed number
(`overview.<store>.insulin.<window>.<field>`), as `mealSize` does. The cards'
words reach the allowlist through the generator's §2.5 Overview label list
(`OVERVIEW_LABELS`), not §1.5: the shipped Settings Glossary page renders §1.5
and lists only terms the app prints, so new terms would show there before any
screen prints them. The amendment names the §1.5 rows #634 adds with the cards
on the Overview: Override (a bolus you changed from the pump's suggestion,
counted whole on the Bolus review, apart from Meal and Correction), Manual (a
bolus you gave, not Control-IQ), and Standard, Extended and Quick (how a bolus
was delivered).
