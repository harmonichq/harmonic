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
`basal_events`, `bolus_events`, `carb_entries` and `pump_events`), to
`_LIGHTEST` after `"meal-size"`, and to the warm roster after Meal size's entry.

## ADR 632 — The shape

```
window: { start, end, data_days } | null
daily_dose: { units }
basal: { units, share }          bolus: { units, share }
boluses: { count, manual: { count, share }, control_iq: { count, share } }
carbs: { grams }
by_type:   { food, correction, override, control_iq }   each { units, share }
by_method: { standard, extended, quick, control_iq }     each { units, share }
site_change: { count, every_days }
```

Every figure is a daily average over `data_days`, served unrounded; the card's
format rounds it. A share is the part over its total as a fraction (the
`share` format prints it as a whole percent). `by_type` shares are over the
bolus units; `by_method` shares likewise, so a store with codeless boluses
serves method shares that do not reach 100 %. `site_change.every_days` is the
mean gap in days between consecutive site changes inside the window, null below
two changes.

## ADR 632 — The denominator is the window's days with any delivery

`data_days` counts the pump-local days inside the window that hold at least one
basal or bolus row. A window a sync has not reached, or a pump off the body,
does not dilute the average. It is the number the Overview already prints
beside its profile, so the cards and the profile name one population.

## ADR 632 — Basal units are delivered rate times duration

Basal units per day are the sum over the window's `basal_events` of
`basal_rate × duration_mins / 60`, the delivered rate (`commandedRate`), never
the programmed one, over `data_days`. A row with a null rate or duration adds
nothing. Bolus units are the sum of `insulin` over the window's completed
boluses with a positive `insulin`.

## ADR 632 — The type partition

Each bolus's units go to exactly one row of `by_type`, in this order:
Control-IQ when `BolusEvent.is_automatic_bolus` is true (codes 3 and 6);
otherwise Override when `user_override` is 1; otherwise, when both
`food_insulin` and `correction_insulin` are served, `food_insulin` to Food and
`correction_insulin` to Correction (the requested split; the delivered total
is what the card's shares are over, so a bolus whose split exceeds its delivery
is scaled to it); otherwise the whole bolus to Food when it carried carbs and
to Correction when it did not. The coordinating session set these as the
triage defaults on 2026-10-24.

## ADR 632 — The method partition

`by_method` reads `bolus_options`: 0 Standard, 1 Extended, 2 Quick, 3 and 6
Control-IQ. Every other code, and a null one, counts in the bolus total and in
no method row. Manual and Control-IQ counts in `boluses` read
`is_automatic_bolus`: true is Control-IQ, anything else manual.

## ADR 632 — One site-change row

`Store.pump_events` already joins the pump's three fills into one site change
(`SITE_CHANGE_EVENT`, `SITE_CHANGE_GAP`), and the stored rows carry one type
for all three, so the engine serves the procedure's cadence as one row. Three
rows would print one number three times from a store that cannot tell them
apart. Connor sees this at #633's structure gate and may reopen it.

## ADR 632 — The wearer gains Extended and Quick, the showcase nothing

`scripts/ui_patient.py` stamps, on a fixed rule over the day index, one planned
meal bolus a week as Extended (`bolus_options` 1, `extended` 1) and one user
correction a week as Quick (`bolus_options` 2), delivery and glucose unchanged,
so the wearer serves every method row. The fixtures regenerate; every existing
store-state guard in `gen_ui_fixtures.py` must stay green, and a story store
that loses a state is fixed by choosing other days, never by relaxing a guard.
The committed QA showcase is not touched: stamping its codeless boluses would
move `is_automatic_bolus` from the magnitude heuristic to the code for the
analyzers that read it (the Day timeline, the scenario anchors, the carb-ratio
corrections, correction stacking, the override classifier), and so the Queue's
expectations and the five QA budgets; a site change would open exclusion
windows. #634's contract test asserts the showcase's figures as served.
