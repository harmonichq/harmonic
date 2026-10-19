"""Time-of-day evidence over a fixed 14-, 30- or 90-day window.

The public reader has one cohort per window and no presentation-driven filters:
the 14, 30 or 90 pump-local calendar days ending after the newest CGM day (30 by
default; the Overview's glucose profile follows its window switch).  It owns the
five-minute aggregation so every client reads the same evidence.
"""

from __future__ import annotations

import statistics
from datetime import datetime, time, timedelta

from .analyzers.meals import group_meals
from .events import format_t
from .false_low import drop_readings, false_low_spans

_BIN_MINUTES = 5
_BINS_PER_DAY = 24 * 60 // _BIN_MINUTES
# The windows a profile may cover, the Overview's 14 / 30 / 90 d, and the default.
DATA_DAYS = (14, 30, 90)
DEFAULT_DATA_DAYS = 30
_TARGET_RANGE = {"low": 70, "high": 180}
_POOLED_BIN_MINUTES = 15
_POOL_MINUTES = 45
_POOLED_BINS_PER_DAY = 24 * 60 // _POOLED_BIN_MINUTES
# A pooled bin centred at ``minute + 7.5`` holds every reading within
# ``_POOL_MINUTES`` of that centre on the clock: the whole minutes from
# ``minute - 37`` to ``minute + 52``, wrapping at midnight.
_POOL_REACH = range(-int(_POOL_MINUTES - _POOLED_BIN_MINUTES / 2),
                    int(_POOL_MINUTES + _POOLED_BIN_MINUTES / 2) + 1)
# Explore's pooled CGM envelope needs this many distinct observed days before it
# paints supported evidence. It happens to equal the basal-night floor today,
# but CGM coverage and basal directional support are independent safety rules.
_MIN_SUPPORTED_CGM_DAYS = 8


def build_time_of_day(store, *, days: int = DEFAULT_DATA_DAYS) -> dict:
    """Return the pump-local time-of-day evidence over the last ``days`` days,
    one of ``DATA_DAYS``."""
    return build_time_of_day_windows(store, windows=(days,))[str(days)]


def build_time_of_day_windows(store, *, windows: tuple = DATA_DAYS) -> dict:
    """Return each window's evidence, keyed by its days as text (#566).

    Every window ends at the same instant and reads the same history: its false-low
    spans and its meals are resolved over all of it, so they are resolved once here
    and each window only slices its own cohort out of them.
    """
    history = store.cgm_readings()
    if not history:
        return {str(days): {
            "window": None,
            "bin_minutes": _BIN_MINUTES,
            "target_range": _TARGET_RANGE,
            "bins": [],
            "pooled": None,
        } for days in windows}

    latest = max(reading.t for reading in history)
    end = datetime.combine(latest.date() + timedelta(days=1), time.min)
    # A false-low span is resolved from all retained CGM before the cohort is
    # sliced: its anchor and drop shoulder can sit before this window.
    spans = false_low_spans(history, store.prompt_responses())
    kept = [reading for reading in drop_readings(history, spans)
            if reading.t < end and reading.bg is not None]
    # One meal per first carb bolus; a same-meal top-up is part of it (ADR 470).
    # Meals form over the whole bolus history, so which bolus opened a meal never
    # depends on where the window starts.
    boluses = store.bolus_events(None, format_t(end))
    meal_times = [meal.t for meal in group_meals(boluses)]
    return {str(days): _window(kept, boluses, meal_times, end, days) for days in windows}


def _window(readings: list, boluses: list, meal_times: list, end: datetime,
            days: int) -> dict:
    """One window's evidence, from the readings and meals before ``end``."""
    start = end - timedelta(days=days)
    retained = [reading for reading in readings if reading.t >= start]
    boluses = [bolus for bolus in boluses if bolus.t >= start]
    meal_times = [t for t in meal_times if t >= start]
    values = [[] for _ in range(_BINS_PER_DAY)]
    meals = [0] * _BINS_PER_DAY
    for reading in retained:
        values[_bin_index(reading.t)].append(reading.bg)
    for t in meal_times:
        meals[_bin_index(t)] += 1

    return {
        "window": {"start": format_t(start), "end": format_t(end), "data_days": days},
        "bin_minutes": _BIN_MINUTES,
        "target_range": _TARGET_RANGE,
        "bins": [_bin(minute, values[index], meals[index])
                 for index, minute in enumerate(range(0, 24 * 60, _BIN_MINUTES))],
        "pooled": _pooled_envelope(retained, boluses, meal_times),
    }


def _bin_index(t: datetime) -> int:
    return (t.hour * 60 + t.minute) // _BIN_MINUTES


def _bin(minute: int, values: list, meal_count: int) -> dict:
    return {"minute": minute, "n": len(values), **_summary(values),
            "meal_count": meal_count}


def _summary(values: list) -> dict:
    n = len(values)
    if not n:
        return {"median": None, "p10": None, "p25": None, "p75": None, "p90": None}
    if n == 1:
        return dict.fromkeys(("median", "p10", "p25", "p75", "p90"), values[0])
    percentiles = statistics.quantiles(values, n=100, method="inclusive")
    return {
        "median": statistics.median(values),
        "p10": percentiles[9],
        "p25": percentiles[24],
        "p75": percentiles[74],
        "p90": percentiles[89],
    }


def _minute_of_day(t: datetime) -> int:
    return t.hour * 60 + t.minute


def _pooled_envelope(readings: list, boluses: list, meal_times: list) -> dict:
    """Return the workstation's exact pooled canvas, computed before serialization.

    Readings are bucketed by their minute of the day once, so each bin gathers its
    pool from the ninety minutes around its centre rather than scanning every
    reading. A reading's night is the date of the nearest occurrence of the bin's
    centre: its own date, the next one when the pool reaches back across midnight
    to it, or the one before when the pool reaches forward across midnight.
    """
    day = 24 * 60
    by_minute = [[] for _ in range(day)]
    for reading in readings:
        by_minute[_minute_of_day(reading.t)].append((reading.bg, reading.t.toordinal()))
    meals_by_bin = [0] * _POOLED_BINS_PER_DAY
    for t in meal_times:
        meals_by_bin[_minute_of_day(t) // _POOLED_BIN_MINUTES] += 1
    bins = []
    for minute in range(0, day, _POOLED_BIN_MINUTES):
        # Counts cover [minute, minute + 15); the wider summary is centred on the
        # same interval's midpoint so both describe the same clock period.
        values = []
        nights = set()
        for reach in _POOL_REACH:
            clock = minute + reach
            shift = 1 if clock < 0 else -1 if clock >= day else 0
            for bg, night in by_minute[clock % day]:
                values.append(bg)
                nights.add(night + shift)
        support_days = len(nights)
        bins.append({
            "minute": minute,
            "n": len(values),
            "raw_n": sum(len(by_minute[clock])
                         for clock in range(minute, minute + _POOLED_BIN_MINUTES)),
            "support_days": support_days,
            "supported": support_days >= _MIN_SUPPORTED_CGM_DAYS,
            **_summary(values),
            "meal_count": meals_by_bin[minute // _POOLED_BIN_MINUTES],
        })
    # The workstation's meal track is locked at 12 g, unlike bin meal_count's 10 g.
    by_half_hour = {}
    for bolus in boluses:
        if bolus.carbs is not None and bolus.carbs >= 12:
            by_half_hour.setdefault(_minute_of_day(bolus.t) // 30, []).append(bolus)
    meals = []
    for minute in range(0, day, 30):
        bucket = by_half_hour.get(minute // 30)
        if bucket:
            carbs = [bolus.carbs for bolus in bucket]
            meals.append({
                "minute": minute,
                "count": len(bucket),
                "carbs": sum(carbs),
                "median_carbs": statistics.median(carbs),
                "insulin": sum(bolus.insulin or 0 for bolus in bucket),
            })
    return {
        "bin_minutes": _POOLED_BIN_MINUTES,
        "pool_minutes": _POOL_MINUTES,
        "reading_count": len(readings),
        "captured_days": len({reading.t.date() for reading in readings}),
        "bins": bins,
        "meals": meals,
    }
