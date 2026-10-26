# Design — the insulin cards on the Overview (#634)

## ADR 634 — The cards' row

Below Meal size, the two locked cards (§4.2 entries 29 and 30). On desktop they
share one row of the Overview's cards, two columns, the row as tall as its taller
card and each card filling it; the Overview's equal-height rule (`grid-auto-rows:
1fr`, §2.5 2026-10-20 #564) stays on the basal estimate's and Meal size's rows, so
nothing above the insulin row stretches. On the phone they stack after Meal size,
Insulin summary first. The coordinating session settled this on 2026-10-26 under
Connor's delegation ("No input from me please, do everything unattended.").

## ADR 634 — The cards read their window as the Overview's other cards do

The screen passes `insulinSummary(store, window)` and `bolusReview(store, window)`
(overview-model.ts, #633) for the window the Overview shows. The live adapter's
`overviewWindow(window)` reads the insulin answer beside the profile, the basal
estimate and Meal size, through a new `fetchInsulin(days)` on the app's one client
(`frontend/data.js`), trimmed exactly as `gen_ui_fixtures._insulin` trims it,
into `answers.overview.wearer.insulin[window]`; `empty()` seeds `insulin: {}`; the
Overview tab's keys gain `insulin <window>` for each window, so a write reads it
again. A store the screen draws other than the wearer reads its served answer as
the stories serve it.

## ADR 634 — §1.5 takes the words #633 admitted

The amendment of 2026-10-25 admitted Food, Bolus, Manual, Override, Standard,
Extended and Quick to the two library cards ahead of their §1.5 rows, because the
shipped Glossary page lists only the terms the app prints. With the cards on the
Overview the app prints them, so §1.5 gains the rows the amendment named, in its
wording, and `OVERVIEW_LABELS` drops those seven words; the regenerated Glossary
lists them.

## ADR 634 — The roster's description

The warm roster has held the insulin read since #632 (ADR 632). With the app now
reading it, the roster's docstring and AGENTS.md's roster and fixed-result
paragraphs name it beside Meal size; the roster itself does not change.

## ADR 634 — The must-survive list changes by amendment

The #564 amendment's Overview list said every row of the cards is one height;
the insulin row is not. The 2026-10-26 amendment restates the Overview's list,
superseding #564's, as task 2.1 gives it, and the pull request maps each line to
the render or play that shows it (ui-craft revise). Settings · Glossary is a
locked screen too: it gains the seven §1.5 rows, so its stories are before and
after shots.
