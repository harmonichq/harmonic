"""Per-day glycemic-severity feed for the Day surface's navigator (#248, ADR 0030).

The Day navigator is a month calendar of per-day glucose sparklines, tinted by
**glycemic severity** (lows / highs / TIR), not lever color. Each rendered cell
needs the day's own miniature glucose curve plus the low/high/TIR stats that drive
the severity tint — a heavier feed than a flat severity cell, so it gets its own
per-month GET rather than riding the per-day ``/api/model-view``.

Severity *encoding* (the tint / glyph mapping — lows win the tie, etc.) is decided
frontend-side in ``nav-chart.js`` (``navSeverity``) so the vocabulary lives in one
place; this module only serves the raw per-day facts (``lows``, ``highs``, ``tir``)
and the downsampled curve it maps.

Stdlib-only, like the rest of core — reads CGM straight off the store and buckets by
pump-local calendar day (CGM is stored naive-local, so ``reading.t.date()`` is the
right wall-clock day; see CLAUDE.md on the CGM time model).
"""

from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .store import Store

# The full clinical y-domain the frontend sparklines map against; we don't clamp
# here (the curve carries true mg/dL) but keep the range documented for parity.
_LOW = 70.0
_HIGH = 180.0

# Cap curve points per day so a month payload stays light: ~288 readings/day
# thinned to one every ``_CURVE_STRIDE`` (≈ every 30 min) ≈ 48 points/day.
_CURVE_STRIDE = 6

# Days of lead / trail around the calendar month so the collapsed Sun–Sat week
# ribbon (which can reach into the adjacent month) and the grid's leading/trailing
# blanks are always backed by real data.
_PAD_DAYS = 7


def _month_bounds(month: str) -> tuple[date_cls, date_cls]:
    """First and last calendar day of a ``YYYY-MM`` month string."""
    year, mon = (int(x) for x in month.split("-", 1))
    first = date_cls(year, mon, 1)
    nxt = date_cls(year + 1, 1, 1) if mon == 12 else date_cls(year, mon + 1, 1)
    return first, nxt - timedelta(days=1)


def _day_stats(bgs: List[float]) -> dict:
    """TIR + distinct low/high excursion counts for one day's readings.

    Mirrors ``day-chart.js`` ``dayStats``: lows/highs are counted as *runs*
    (distinct excursions), not per-5-min ticks, so a single 40-min low is one low.
    """
    in_range = sum(1 for b in bgs if _LOW <= b <= _HIGH)
    below = above = False
    lows = highs = 0
    for b in bgs:
        if b < _LOW:
            if not below:
                lows += 1
                below = True
        else:
            below = False
        if b > _HIGH:
            if not above:
                highs += 1
                above = True
        else:
            above = False
    return {
        "lows": lows,
        "highs": highs,
        "tir": round(in_range / len(bgs) * 100) if bgs else 0,
    }


def _curve(readings) -> List[dict]:
    """Downsampled ``[{x, bg}]`` sparkline curve for one day.

    ``x`` is the fractional hour-of-day (0..1) so the frontend maps it straight
    into a slice, matching the mockup's ``realDayCurve``. Thinned by
    ``_CURVE_STRIDE`` to keep the month payload light; the first and last readings
    are always kept so the trace spans the day it actually covers.
    """
    pts = [r for r in readings if r.bg is not None]
    if not pts:
        return []
    kept = pts[:: _CURVE_STRIDE]
    if pts[-1] is not kept[-1]:
        kept.append(pts[-1])
    out = []
    for r in kept:
        frac = (r.t.hour + r.t.minute / 60 + r.t.second / 3600) / 24
        out.append({"x": round(min(1.0, max(0.0, frac)), 4), "bg": r.bg})
    return out


def build_day_navigator(store: Store, month: str) -> dict:
    """The navigator feed for the calendar ``month`` (``YYYY-MM``), ± a week of pad.

    Returns ``{"month", "days": [{iso, has_data, lows, highs, tir, curve}]}`` for
    every calendar day in the padded span, ascending. Days with no CGM carry
    ``has_data=False`` and empty stats so the calendar shape stays intact (they
    render greyed / non-pickable). The frontend applies the severity encoding.
    """
    first, last = _month_bounds(month)
    win_start = datetime.combine(first - timedelta(days=_PAD_DAYS), datetime.min.time())
    win_end = datetime.combine(last + timedelta(days=_PAD_DAYS + 1), datetime.min.time())

    by_day: Dict[date_cls, list] = {}
    for r in store.cgm_readings(win_start, win_end):
        by_day.setdefault(r.t.date(), []).append(r)

    days: List[dict] = []
    d = first - timedelta(days=_PAD_DAYS)
    end_day = last + timedelta(days=_PAD_DAYS)
    while d <= end_day:
        readings = by_day.get(d, [])
        bgs = [r.bg for r in readings if r.bg is not None]
        row = {"iso": d.isoformat(), "has_data": bool(bgs)}
        if bgs:
            row.update(_day_stats(bgs))
            row["curve"] = _curve(readings)
        else:
            row.update({"lows": 0, "highs": 0, "tir": 0, "curve": []})
        days.append(row)
        d += timedelta(days=1)

    return {"month": month, "days": days}
