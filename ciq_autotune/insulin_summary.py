"""How much insulin was delivered, and how (#632, ADR 632).

The Overview's Insulin summary and Bolus review cards read this over the window
the Overview shows: the last 14, 30 or 90 pump-local calendar days ending after
the newest CGM day, the glucose profile's and Meal size's window rule, so these
cards and the ones above them read one population.

**The denominator.** Every figure is a daily average over ``delivery_days``, the
window's days holding delivery: each day the part of a basal row inside the window
falls on, and each delivered bolus's day, so a day a sync has not reached, or a
pump off the body, does not dilute it, and a row crossing midnight counts on both
days in every window that holds them. ``window.data_days`` stays the window's
length, as the profile serves it.

**The units.** The Day screen's own (:func:`~.timeline.insulin_totals`, ADR 492),
over the whole window and read as it reads them, so the daily dose here is the Day
screens' total over the same days: basal at the delivered rate over the part of
each row inside the window, read back by the feed's longest row before it opens,
and every bolus in it with delivered insulin, whatever its completion, so
a bolus cut short counts what it delivered. Its Control-IQ, meal and correction
are the Control-IQ, Food and Correction rows. Override, the one row the Day screen
lacks, is the overridden user boluses whole, kept out of what it splits, so the
four rows sum to the bolus units. Carbs are the same boluses' carbs and the manual
carb log's grams; an entry of unknown grams adds nothing.

**The method rows.** By the provenance code: Standard, Extended, Quick and
Control-IQ. A bolus with any other code, or none, counts in the totals and in no
method row, so the method shares can fall short of one. Manual and Control-IQ
counts read the same boluses; a bolus Control-IQ did not give is manual.

Every share is the part over its total, served as its own field. Nothing here
judges a setting or a habit: it is a report, never a Queue item.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta

from .events import format_t
from .explore_time_of_day import DATA_DAYS
from .tandemsource_map import _BASAL_GAP_CAP_MIN
from .timeline import insulin_totals

METHODS = ("standard", "extended", "quick", "control_iq")
#: The method row each provenance code delivers through.
_METHOD_BY_CODE = {0: "standard", 1: "extended", 2: "quick", 3: "control_iq", 6: "control_iq"}
_NOTHING = dict.fromkeys(("basal", "meal", "correction", "control_iq_bolus", "total"), 0.0)
#: How far before a window a basal row is read, as the Day screen reads it.
_LOOKBACK = timedelta(minutes=_BASAL_GAP_CAP_MIN)


def build_insulin_windows(store, *, windows: tuple = DATA_DAYS) -> dict:
    """Each window's insulin figures, keyed by its days as text.

    Every window ends at the same instant, so the rows of the widest are read once
    and each window keeps those it would read alone: basal from the feed's longest
    row before it opens, as the Day screen's read does, so a row running into it
    counts its inside part."""
    history = store.cgm_readings()
    if not history:
        return {str(days): _window(None, _NOTHING, set(), [], []) for days in windows}
    latest = max(reading.t for reading in history)
    end = datetime.combine(latest.date() + timedelta(days=1), time.min)
    widest = end - timedelta(days=max(windows))
    basal = store.basal_events(format_t(widest - _LOOKBACK), format_t(end))
    boluses = store.bolus_events(format_t(widest), format_t(end))
    entries = store.carb_entries(format_t(widest), format_t(end))

    result = {}
    for days in windows:
        opens = end - timedelta(days=days)
        read = [row for row in basal if row.t >= opens - _LOOKBACK]
        counted = [b for b in boluses
                   if b.t >= opens and b.insulin is not None and b.insulin > 0]
        totals = insulin_totals(read, [b for b in counted if not _overridden(b)],
                                opens, end, None)
        result[str(days)] = _window(
            {"start": format_t(opens), "end": format_t(end), "data_days": days},
            totals or _NOTHING,
            {day for row in read for day in _days_inside(row, opens, end)}
            | {b.t.date() for b in counted},
            counted, [e for e in entries if e.t >= opens])
    return result


def _days_inside(row, opens: datetime, end: datetime):
    """The days the part of a basal row inside ``[opens, end)`` falls on."""
    if not row.duration_mins:
        return ()
    lo = max(row.t, opens)
    hi = min(row.t + timedelta(minutes=row.duration_mins), end)
    if hi <= lo:
        return ()
    last = (hi - timedelta(microseconds=1)).date()
    return [lo.date() + timedelta(days=n) for n in range((last - lo.date()).days + 1)]


def _overridden(bolus) -> bool:
    """A user bolus whose calculated size the person changed (Override)."""
    return bolus.user_override == 1 and bolus.is_automatic_bolus is not True


def _window(window, totals: dict, delivered: set, counted: list, entries) -> dict:
    """One window's figures, from its Day-screen totals and its counted boluses."""
    override = sum(b.insulin for b in counted if _overridden(b))
    by_type = {"food": totals["meal"], "correction": totals["correction"],
               "override": override, "control_iq": totals["control_iq_bolus"]}
    bolus_units = sum(by_type.values())
    dose = totals["total"] + override
    by_method = dict.fromkeys(METHODS, 0.0)
    for bolus in counted:
        method = _METHOD_BY_CODE.get(bolus.bolus_options)
        if method is not None:
            by_method[method] += bolus.insulin
    automatic = sum(1 for b in counted if b.is_automatic_bolus is True)
    carbs = (sum(b.carbs for b in counted if b.carbs is not None)
             + sum(e.grams for e in entries if e.grams is not None))

    days = len(delivered)

    def daily(total):
        return total / days if days else None

    def share(part, total):
        return part / total if total else None

    def part(units, total):
        return {"units": daily(units), "share": share(units, total)}

    return {
        "window": window,
        "delivery_days": days,
        "daily_dose": {"units": daily(dose)},
        "basal": part(totals["basal"], dose),
        "bolus": part(bolus_units, dose),
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
