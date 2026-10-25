"""How much insulin was delivered, and how (#632, ADR 632).

The Overview's Insulin summary and Bolus review cards read this over the window
the Overview shows: the last 14, 30 or 90 pump-local calendar days ending after
the newest CGM day, the glucose profile's and Meal size's window rule, so these
cards and the ones above them read one population.

**The denominator.** Every figure is a daily average over ``delivery_days``, the
window's days holding any basal or bolus row, so a day a sync has not reached, or
a pump off the body, does not dilute it. ``window.data_days`` stays the window's
length, as the profile serves it.

**What is read.** Basal is the delivered rate times its duration, never the
programmed rate; a row with no rate or no duration adds nothing. A bolus counts
when it completed (``"Completed"``, or no completion recorded, the meals'
convention) with insulin delivered; any other bolus counts nowhere. Carbs are the
counted boluses' carbs and the manual carb log's grams; an entry of unknown grams
adds nothing.

**The type rows.** Every unit of a bolus lands in exactly one, so they sum to the
bolus units: Control-IQ's own boluses (its provenance codes) whole to Control-IQ;
else an overridden bolus whole to Override; else, with a requested split at or
above zero on both parts and above zero in all, the delivered units divided
between Food and Correction in that proportion; else the whole bolus to Food when
it carried carbs and to Correction when it did not.

**The method rows.** By the provenance code: Standard, Extended, Quick and
Control-IQ. A bolus with any other code, or none, counts in the totals and in no
method row, so the method shares can fall short of one. Manual and Control-IQ
counts read the same codes; a bolus without Control-IQ's is manual.

Every share is the part over its total, served as its own field. Nothing here
judges a setting or a habit: it is a report, never a Queue item.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta

from .events import format_t
from .explore_time_of_day import DATA_DAYS

TYPES = ("food", "correction", "override", "control_iq")
METHODS = ("standard", "extended", "quick", "control_iq")
#: The method row each provenance code delivers through.
_METHOD_BY_CODE = {0: "standard", 1: "extended", 2: "quick", 3: "control_iq", 6: "control_iq"}


def build_insulin_windows(store, *, windows: tuple = DATA_DAYS) -> dict:
    """Each window's insulin figures, keyed by its days as text.

    Every window ends at the same instant, so the rows of the widest are read once
    and each window keeps those that start inside it."""
    history = store.cgm_readings()
    if not history:
        return {str(days): _window(None, set(), [], [], []) for days in windows}
    latest = max(reading.t for reading in history)
    end = datetime.combine(latest.date() + timedelta(days=1), time.min)
    start, stop = format_t(end - timedelta(days=max(windows))), format_t(end)
    basal = store.basal_events(start, stop)
    boluses = store.bolus_events(start, stop)
    entries = store.carb_entries(start, stop)

    def inside(rows, days):
        opens = end - timedelta(days=days)
        return [row for row in rows if row.t >= opens]

    result = {}
    for days in windows:
        window_basal, window_boluses = inside(basal, days), inside(boluses, days)
        delivered = {row.t.date() for row in (*window_basal, *window_boluses)}
        result[str(days)] = _window(
            {"start": format_t(end - timedelta(days=days)), "end": stop, "data_days": days},
            delivered, window_basal, window_boluses, inside(entries, days))
    return result


def _window(window, delivered: set, basal, boluses, entries) -> dict:
    counted = [b for b in boluses
               if b.completion in ("Completed", None) and b.insulin is not None and b.insulin > 0]
    basal_units = sum(row.basal_rate * row.duration_mins / 60 for row in basal
                      if row.basal_rate is not None and row.duration_mins is not None)
    by_type, by_method = dict.fromkeys(TYPES, 0.0), dict.fromkeys(METHODS, 0.0)
    for bolus in counted:
        for row, units in _type_parts(bolus):
            by_type[row] += units
        method = _METHOD_BY_CODE.get(bolus.bolus_options)
        if method is not None:
            by_method[method] += bolus.insulin
    bolus_units = sum(b.insulin for b in counted)
    automatic = sum(1 for b in counted if b.is_automatic_bolus is True)
    carbs = (sum(b.carbs for b in counted if b.carbs is not None)
             + sum(e.grams for e in entries if e.grams is not None))

    days = len(delivered)

    def daily(total):
        return total / days if days else None

    def share(part, total):
        return part / total if days and total else None

    def part(units, total):
        return {"units": daily(units), "share": share(units, total)}

    return {
        "window": window,
        "delivery_days": days,
        "daily_dose": {"units": daily(basal_units + bolus_units)},
        "basal": part(basal_units, basal_units + bolus_units),
        "bolus": part(bolus_units, basal_units + bolus_units),
        "boluses": {
            "count": daily(len(counted)),
            "manual": {"count": daily(len(counted) - automatic),
                       "share": share(len(counted) - automatic, len(counted))},
            "control_iq": {"count": daily(automatic), "share": share(automatic, len(counted))},
        },
        "carbs": {"grams": daily(carbs)},
        "by_type": {row: part(units, bolus_units) for row, units in by_type.items()},
        "by_method": {row: part(units, bolus_units) for row, units in by_method.items()},
    }


def _type_parts(bolus):
    """The type rows one bolus's delivered units land in, every unit in one."""
    if bolus.is_automatic_bolus is True:
        return (("control_iq", bolus.insulin),)
    if bolus.user_override == 1:
        return (("override", bolus.insulin),)
    food, correction = bolus.food_insulin, bolus.correction_insulin
    if food is not None and correction is not None and food >= 0 and correction >= 0 \
            and food + correction > 0:
        food_share = food / (food + correction)
        return (("food", bolus.insulin * food_share),
                ("correction", bolus.insulin * (1 - food_share)))
    return (("food" if bolus.carbs else "correction", bolus.insulin),)
