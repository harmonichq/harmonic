# Serve the Overview's insulin figures per window (#632)

## Why

The Overview reports glucose: the metrics against the previous period, the
time-in-ranges bar, the glucose profile, the basal estimate and Meal size, each
over the selected 14, 30 or 90 days. It says nothing about insulin, though the
store holds every fact: delivered basal every five minutes, each bolus with its
units, carbs, provenance code, override flag and food/correction split, the
manual carb log. Connor asked (#631) for two of the
cards Tandem Source draws below its day chart, Insulin summary and Bolus review,
on Harmonic's Overview ("I don't need site change data, just the
other stuff", 2026-10-24). The lock amendment (#633) and the
Overview's revision (#634) need the figures served first, because the Storybook
prechecks trace every printed number to a served field and the frontend derives
none.

## What changes

- **One new fixed read, `/api/explore/insulin?days=N`.** Built as Meal size is:
  one fixed result for all three windows, measured in one pass over the history
  they share, keyed by the recorded-data revision, routed through `fixed()`,
  warmed by the roster beside Meal size and computed among the lightest kinds.
  Each window serves the Insulin summary (daily dose, basal and bolus with units
  and share, boluses per day with manual and Control-IQ counts and shares,
  carbs per day), the Bolus review (units and share by type and by delivery
  method). Every share is its own
  served field. Every average divides by the window's days that hold any
  delivery, served as `delivery_days` beside the window's length.
- **The partition rules are the engine's, recorded as ADRs.** Control-IQ's own
  boluses by their provenance code; Override by the pump's override flag;
  Food and Correction by the Day screen's own split (ADR 492, reused, so the
  Overview and Day count one population), a bolus with no split going
  whole by whether it carried carbs; the delivery method by the code, a bolus
  with no code counted in the totals and in no method row.
- **The library fixtures carry the answer.** `scripts/gen_ui_fixtures.py` adds
  the read for the wearer, its first days and the unsynced store under
  `overview`, with a store-state guard like Meal size's, and the synthetic
  wearer stamps a few existing boluses Extended and Quick, their delivery
  unchanged, so no method row is empty on the wearer.
- **The committed QA showcase is untouched.** Its 34 user boluses carry no
  provenance code; the contract test (#634) asserts
  that served state as it is.

## Not in this change

- Any component, story, lock amendment or screen (#633), the live adapter, the
  app's client and the contract test (#634).
- Load activity (site changes): Connor dropped it from #631 on 2026-10-24.
- A store serving a window with readings but no bolus: #633 adds one through
  this generator's wearer cut if the lock lists that state.
- The roster docstring and AGENTS.md's roster paragraphs, which name what the
  app reads: #634, when the app reads it (ADR 632).

## Risk contract

- **Must prevent:** a served figure that is not what the store holds (a wrong
  denominator, a unit counted in two type rows, type rows that do not sum to
  the bolus units); a stale cached answer after a write (the key is in the
  recorded-data results and the roster); a committed fixture written from real
  data; a change to the QA showcase's bytes or expectations.
- **Must recover:** nothing automatic; a wrong figure is a bug fix.
- **Accepted failure:** a store whose boluses carry no provenance code serves
  its method rows short of its bolus total (the codeless boluses are in the
  totals only), which is the honest reading of such a store.
- **Unsupported:** a basal row with no duration or rate (it contributes no
  units); a window with no delivery (every figure null, `delivery_days` 0).
- **Evidence owed:** a backend test building a store of N days of known events
  and asserting each card's figures as literals per window (manual and Control-IQ boluses, an override, an extended and a quick bolus, a bolus with no split, a bolus whose split is below its delivery, a bolus whose split sums to zero, a bolus with a negative correction part, a codeless bolus, a null-completion bolus, a bolus cut short (another completion, delivered units counted), a basal row running into the window from before it, manual carbs with one entry of unknown grams, a delivery before the window opens, a window day with no delivery); the Overview-instant tests extended to the new read (a
  write answers its predecessor, a restart computes nothing, the worker's
  order); the follow-up-read record extended to the new read (AGENTS.md's condition
  for `_RECORDED_DATA_RESULTS`); the fixtures' store-state guard; both
  generators' `--check` green.
