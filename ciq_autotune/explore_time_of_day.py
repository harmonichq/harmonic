"""Fixed 30-day time-of-day evidence for Explore.

The public reader has one fixed cohort and no presentation-driven filters: the
30 pump-local calendar days ending after the newest CGM day.  It owns the
five-minute aggregation so every Explore client reads the same evidence.
"""

from __future__ import annotations

import statistics
from datetime import date, datetime, time, timedelta

from .events import format_t
from .false_low import drop_readings, false_low_spans

_BIN_MINUTES = 5
_BINS_PER_DAY = 24 * 60 // _BIN_MINUTES
_DATA_DAYS = 30
_TARGET_RANGE = {"low": 70, "high": 180}
_POOLED_BIN_MINUTES = 15
_POOL_MINUTES = 45
_POOLED_BINS_PER_DAY = 24 * 60 // _POOLED_BIN_MINUTES
# Explore's pooled CGM envelope needs this many distinct observed days before it
# paints supported evidence. It happens to equal the basal-night floor today,
# but CGM coverage and basal directional support are independent safety rules.
_MIN_SUPPORTED_CGM_DAYS = 8


def build_time_of_day(store) -> dict:
    """Return Explore's fixed, pump-local 30-day time-of-day evidence."""
    history = store.cgm_readings()
    if not history:
        return {
            "window": None,
            "bin_minutes": _BIN_MINUTES,
            "target_range": _TARGET_RANGE,
            "bins": [],
            "pooled": None,
        }

    latest = max(reading.t for reading in history)
    end = datetime.combine(latest.date() + timedelta(days=1), time.min)
    start = end - timedelta(days=_DATA_DAYS)
    values = [[] for _ in range(_BINS_PER_DAY)]
    meals = [0] * _BINS_PER_DAY

    # A false-low span is resolved from all retained CGM before the cohort is
    # sliced: its anchor and drop shoulder can sit before this fixed window.
    spans = false_low_spans(history, store.prompt_responses())
    retained = [reading for reading in drop_readings(history, spans)
                if start <= reading.t < end and reading.bg is not None]
    for reading in retained:
        if reading.bg is not None:
            values[_bin_index(reading.t)].append(reading.bg)
    boluses = store.bolus_events(format_t(start), format_t(end))
    for bolus in boluses:
        if bolus.carbs is not None and bolus.carbs >= 10:
            meals[_bin_index(bolus.t)] += 1

    return {
        "window": {"start": format_t(start), "end": format_t(end), "data_days": _DATA_DAYS},
        "bin_minutes": _BIN_MINUTES,
        "target_range": _TARGET_RANGE,
        "bins": [_bin(minute, values[index], meals[index])
                 for index, minute in enumerate(range(0, 24 * 60, _BIN_MINUTES))],
        "pooled": _pooled_envelope(retained, boluses),
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


def _circular_distance(a: int, b: int) -> int:
    distance = abs(a - b)
    return min(distance, 24 * 60 - distance)


def _pooled_night(t: datetime, center_minute: float) -> date:
    """Return the date of the nearest occurrence of a pooled bin's center."""
    offset = ((_minute_of_day(t) - center_minute + 720) % (24 * 60)) - 720
    return (t - timedelta(minutes=offset)).date()


def _pooled_envelope(readings: list, boluses: list) -> dict:
    """Return the workstation's exact pooled canvas, computed before serialization."""
    bins = []
    meals = []
    for minute in range(0, 24 * 60, _POOLED_BIN_MINUTES):
        # Counts cover [minute, minute + 15); center the wider summary on the
        # same interval's midpoint so both describe the same clock period.
        center_minute = minute + _POOLED_BIN_MINUTES / 2
        pooled = [reading for reading in readings
                  if _circular_distance(
                      _minute_of_day(reading.t), center_minute) <= _POOL_MINUTES]
        raw = [reading for reading in readings
               if _minute_of_day(reading.t) // _POOLED_BIN_MINUTES
               == minute // _POOLED_BIN_MINUTES]
        values = [reading.bg for reading in pooled]
        support_days = len({_pooled_night(reading.t, center_minute) for reading in pooled})
        meal_count = sum(
            1 for bolus in boluses
            if bolus.carbs is not None and bolus.carbs >= 10
            and _minute_of_day(bolus.t) // _POOLED_BIN_MINUTES
            == minute // _POOLED_BIN_MINUTES
        )
        bins.append({
            "minute": minute,
            "n": len(values),
            "raw_n": len(raw),
            "support_days": support_days,
            "supported": support_days >= _MIN_SUPPORTED_CGM_DAYS,
            **_summary(values),
            "meal_count": meal_count,
        })
    for minute in range(0, 24 * 60, 30):
        # The workstation's meal track is locked at 12 g, unlike bin meal_count's 10 g.
        bucket = [
            bolus for bolus in boluses
            if (bolus.carbs is not None and bolus.carbs >= 12
                and _minute_of_day(bolus.t) // 30 == minute // 30)
        ]
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
