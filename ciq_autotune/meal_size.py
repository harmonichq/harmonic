"""How far glucose climbs after meals of each size (#501, ADR 501).

The Overview's Meal size card reads this over the window the Overview shows: the
last 14, 30 or 90 pump-local calendar days ending after the newest CGM day, the
glucose profile's window rule (#565; ADR 501 first fixed it at 90 days). A short
window holds few meals, and each size serves how many.

**The meals.** The engine's own meals (:func:`~.analyzers.meals.group_meals`, ADR
470: a first carb bolus of at least 10 g and its same-meal top-ups), formed over the
whole bolus history so where the window starts never changes which bolus opened a
meal. A meal is counted when

* the last reading at or up to 15 minutes before its bolus is at or under the range
  line (180 mg/dL), so the climb is read from a start in range;
* the Late bolus classifier found glucose flat before the bolus (its ``no_trigger``
  verdict): a meal bolused into a rise, or one too sparse to judge, is left out. The
  classifier's ``matched`` verdict alone would not do, since it also requires the meal
  to have run above 180, so it would leave out only the rising meals that climbed
  high and keep the ones that did not;
* its Arc peak exists (:func:`~.analyzers.meals.meal_peak`).

**What is read per meal.** Its climb, the Arc peak less the start; how many minutes
after the bolus that peak came; and its change at three hours, the reading then less
the start, only when no later meal began by then. A false low's readings are left
out, as the profile leaves them out.

The three hours, the climb's horizon and the change's instant, is served as
``horizon_hours`` so the card prints the engine's own.

**The sizes.** Under 25 g, 25–39 g, 40–59 g and 60 g or more, each served with how
many meals it counts, the median and 10th, 25th, 75th and 90th percentiles of their
climbs, the median minutes to peak, and the median change at three hours with how
many meals it was read from. The meals themselves are not served: the card draws
each size from its percentiles (#570).
Nothing here judges a setting or a habit: it is a report, never a Queue item.
"""

from __future__ import annotations

import bisect
import statistics
from datetime import datetime, time, timedelta

from .analyzers.classifiers import classify_late_bolus
from .analyzers.classifiers.evidence import SilenceReason
from .analyzers.meals import ARC_PEAK_HORIZON_MIN, group_meals, meal_peak
from .analyzers.scenario_config import ScenarioConfig
from .events import format_t
from .explore_time_of_day import DEFAULT_DATA_DAYS
from .false_low import drop_readings, false_low_spans

#: Each size's carbs, ``carbs_from`` ≤ carbs < ``carbs_to``; ``None`` is open.
SIZES = ((None, 25), (25, 40), (40, 60), (60, None))
#: How long before an instant its reading may be: the start's, and the three hours'.
_READING_LOOKBACK = timedelta(minutes=15)
_HORIZON = timedelta(minutes=ARC_PEAK_HORIZON_MIN)
HORIZON_HOURS = int(ARC_PEAK_HORIZON_MIN // 60)
_CONFIG = ScenarioConfig()


def build_meal_size(store, *, days: int = DEFAULT_DATA_DAYS) -> dict:
    """The climb after each counted meal of the last ``days`` days (one of the
    profile's ``DATA_DAYS``), by size."""
    history = store.cgm_readings()
    if not history:
        return {"window": None, "horizon_hours": HORIZON_HOURS,
                "sizes": [_size(lo, hi, []) for lo, hi in SIZES]}
    latest = max(reading.t for reading in history)
    end = datetime.combine(latest.date() + timedelta(days=1), time.min)
    start = end - timedelta(days=days)

    spans = false_low_spans(history, store.prompt_responses())
    readings = sorted((r for r in drop_readings(history, spans) if r.bg is not None),
                      key=lambda r: r.t)
    boluses = sorted(store.bolus_events(None, format_t(end)), key=lambda b: b.t)
    basal = sorted(store.basal_events(), key=lambda b: b.t)
    context = _Context(readings, boluses, basal)

    meals = group_meals(boluses)
    measured = []
    for index, meal in enumerate(meals):
        if start <= meal.t < end:
            following = meals[index + 1].t if index + 1 < len(meals) else None
            row = _measure(meal, following, context)
            if row is not None:
                measured.append(row)
    return {
        "window": {"start": format_t(start), "end": format_t(end), "data_days": days},
        "horizon_hours": HORIZON_HOURS,
        "sizes": [_size(lo, hi, [row for row in measured
                                 if (lo is None or row["carbs"] >= lo)
                                 and (hi is None or row["carbs"] < hi)])
                  for lo, hi in SIZES],
    }


class _Context:
    """The readings, boluses and basal around one instant, as the engine hands its
    classifiers context (``engine_context_pad_min`` either side)."""

    def __init__(self, readings, boluses, basal):
        self.readings, self.boluses, self.basal = readings, boluses, basal
        self._times = [r.t for r in readings]
        self._bolus_times = [b.t for b in boluses]
        self._basal_times = [b.t for b in basal]

    def around(self, t: datetime):
        pad = timedelta(minutes=_CONFIG.engine_context_pad_min)
        def window(items, times):
            return items[bisect.bisect_left(times, t - pad):bisect.bisect_right(times, t + pad)]
        return (window(self.readings, self._times), window(self.boluses, self._bolus_times),
                window(self.basal, self._basal_times))

    def reading_at(self, t: datetime):
        """The last reading at or up to 15 minutes before ``t``, or ``None``."""
        index = bisect.bisect_right(self._times, t) - 1
        if index < 0 or t - self._times[index] > _READING_LOOKBACK:
            return None
        return self.readings[index]


def _measure(meal, following, context: _Context):
    begin = context.reading_at(meal.t)
    if begin is None or begin.bg > _CONFIG.segment_range_high_mgdl:
        return None
    cgm, bolus, basal = context.around(meal.t)
    verdict = classify_late_bolus(meal, cgm, basal, bolus, scenario_config=_CONFIG)
    if verdict.silence_reason is not SilenceReason.NO_TRIGGER:
        return None
    peak = meal_peak(meal.t, following, cgm)
    if peak is None:
        return None
    three = meal.t + _HORIZON
    landing = context.reading_at(three) if following is None or following > three else None
    return {
        "carbs": meal.carbs,
        "climb": peak[1] - begin.bg,
        "to_peak": (peak[0] - meal.t).total_seconds() / 60,
        "at_3h": landing.bg - begin.bg if landing is not None else None,
    }


#: The climb percentiles each size serves, by name.
_PERCENTILES = {"p10": 10, "p25": 25, "p75": 75, "p90": 90}


def _size(lo, hi, meals: list) -> dict:
    climbs = [row["climb"] for row in meals]
    landings = [row["at_3h"] for row in meals if row["at_3h"] is not None]
    if len(climbs) > 1:
        cuts = statistics.quantiles(climbs, n=100, method="inclusive")
        spread = {name: cuts[at - 1] for name, at in _PERCENTILES.items()}
    else:
        spread = dict.fromkeys(_PERCENTILES, climbs[0] if climbs else None)
    return {
        "carbs_from": lo,
        "carbs_to": hi,
        "count": len(meals),
        "climb": {"median": statistics.median(climbs) if climbs else None, **spread},
        "to_peak": {"median": statistics.median(row["to_peak"] for row in meals) if meals else None},
        "at_3h": {"count": len(landings),
                  "median": statistics.median(landings) if landings else None},
    }
