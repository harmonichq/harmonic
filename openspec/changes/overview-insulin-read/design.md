# Design — the Overview's insulin read (#632)

## ADR 632 — One fixed result for three windows, as Meal size

`ciq_autotune/insulin_summary.py` exposes `build_insulin_windows(store, *,
windows=DATA_DAYS)`, returning `{"14": …, "30": …, "90": …}`. The windows end
at the start of the day after the newest CGM day and span the last N pump-local
calendar days, the glucose profile's and Meal size's rule, so the three cards
and the cards above them read one population. A store with no readings serves
`window: null` and every figure null for each window. `/api/explore/insulin`
takes `days` in `DATA_DAYS` (400 otherwise), reads `fixed(("insulin",),
"insulin-v1", build_insulin_windows)` and projects its window. `"insulin"` is
added to `_RECORDED_DATA_RESULTS` (the builder reads only `cgm_readings`,
`basal_events`, `bolus_events` and `carb_entries`), to
`_LIGHTEST` after `"meal-size"`, and to the warm roster after Meal size's entry.
The roster leads the app by one slice: the app reads the endpoint only once
#634 lands, so the roster's docstring and AGENTS.md's roster paragraphs, which
name what the five tabs read, are updated in #634, not here.

## ADR 632 — The shape

```
window: { start, end, data_days } | null     # data_days: the window's length, as the profile's
delivery_days                                  # the days inside it with any basal or bolus row
daily_dose: { units }
basal: { units, share }          bolus: { units, share }
boluses: { count, manual: { count, share }, control_iq: { count, share } }
carbs: { grams }
by_type:   { food, correction, override, control_iq }   each { units, share }
by_method: { standard, extended, quick, control_iq }     each { units, share }
```

Every figure is a daily average over `delivery_days`, served unrounded; the card's
format rounds it. A share is the part over its total as a fraction (the
`share` format prints it as a whole percent). `by_type` shares are over the
bolus units; `by_method` shares likewise, so a store with codeless boluses
serves method shares that do not reach 100 %.

## ADR 632 — The denominator is the window's days with any delivery

`delivery_days` counts the pump-local days inside the window that hold at least
one basal or bolus row. A window a sync has not reached, or a pump off the body,
does not dilute the average. It is its own field: `window.data_days` keeps the
meaning the profile and Meal size give it, the window's length, so the sibling
reads never serve one name with two meanings. A window with no delivery serves
`delivery_days` 0 and every average null.

## ADR 632 — The units are the Day screen's split, with Override carved out

Amended 2026-10-25 (lock 2) after code review: a second implementation of the
Day screen's split (ADR 492, `timeline.insulin_totals`) counted a different
population, so the Overview's daily dose could disagree with the Day screens
over the same days. The coordinating session approved reusing the Day screen's
split under Connor's delegation.

Each window's units come from `timeline.insulin_totals` over `[window start,
end)`, the one owner of what a window's delivered insulin is:

- **Basal** is the delivered rate over the part of each row inside the window,
  never the programmed rate. The builder reads basal from a day before the
  widest window opens, so a row that starts before a window and runs into it
  counts its inside part.
- **Boluses** are every bolus in the window with delivered insulin, whatever its
  completion: a bolus cut short counts the units it delivered.
- **Control-IQ** is a bolus `BolusEvent.is_automatic_bolus` tags automatic.
- **Override** is a user bolus with `user_override` 1, its delivered units whole.
  It is the one category the Day screen lacks, so the overridden boluses are
  summed here and left out of the boluses handed to `insulin_totals`; every
  other user bolus is split there.
- **Food and Correction** are `insulin_totals`' meal and correction: the
  requested food and correction sizes, each clamped at zero, divide the
  delivered units in that proportion; with no positive split, a bolus with carbs
  is all Food and one without is all Correction.

So the four type rows sum to the bolus units, and basal plus the bolus units is
the Day screens' total over the same days. Carbs per day are the counted
boluses' `carbs` plus the grams of the window's `carb_entries`; an entry of
unknown grams (`grams` null, certainty `unknown`) adds nothing.

## ADR 632 — The method partition

`by_method` reads `bolus_options`: 0 Standard, 1 Extended, 2 Quick, 3 and 6
Control-IQ. Every other code, and a null one, counts in the bolus total and in
no method row. Manual and Control-IQ counts in `boluses` read
`is_automatic_bolus`: true is Control-IQ, anything else manual. Both count the
same boluses the units do: every bolus in the window with delivered insulin.

## ADR 632 — The wearer gains Extended and Quick, the showcase nothing

`scripts/ui_patient.py` stamps, on a fixed rule over the day index, one planned
meal bolus a week that is not an override (never a "short" one, which the
Extended code would drop from the override classifier and `override_gap`) as
Extended (`bolus_options` 1, `extended` 1) and one user correction a week as
Quick (`bolus_options` 2), delivery and glucose unchanged,
so the wearer serves every method row. The fixtures regenerate; every existing
store-state guard in `gen_ui_fixtures.py` must stay green, and a story store
that loses a state is fixed by choosing other days, never by relaxing a guard.
The committed QA showcase is not touched: stamping its codeless boluses would
move `is_automatic_bolus` from the magnitude heuristic to the code for the
analyzers that read it (the Day timeline, the scenario anchors, the carb-ratio
corrections, correction stacking, the override classifier), and so the Queue's
expectations and the five QA budgets. #634's contract test asserts the showcase's figures as served.
