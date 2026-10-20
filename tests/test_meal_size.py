"""Public-contract tests for the Overview's Meal size read (#501, ADR 501).

Every store here is manufactured: a flat 120 mg/dL history with meal-shaped
excursions drawn on it at known sizes, so each served value is a literal read
off the recipe, never derived from the builder's output.
"""

import tempfile
import unittest
from datetime import datetime, timedelta

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

from ciq_autotune.store import Store

_FIRST_DAY = datetime(2026, 3, 1)
_DAYS = 100  # through 8 Jun 2026: the 90-day window opens on 11 Mar
_BASELINE = 120.0


def _meal(day, carbs, *knots, at=(12, 0), top_up=None):
    """A meal bolus on ``day`` (month, day) and the glucose shape after it:
    ``knots`` are (minutes after the bolus, mg/dL above the baseline), joined by
    straight lines, zero outside them."""
    t = datetime(2026, *day, *at)
    return {"t": t, "carbs": carbs, "knots": knots, "top_up": top_up}


def _arc(climb, to_peak, at_3h):
    """The usual meal: up to ``climb`` at ``to_peak`` minutes, ``at_3h`` at three
    hours, back to the baseline an hour later."""
    return ((0, 0), (to_peak, climb), (180, at_3h), (240, 0))


_MEALS = (
    # Before the window opens: never counted.
    _meal((3, 5), 30, *_arc(80, 60, 0)),
    # Under 25 g.
    _meal((4, 1), 15, *_arc(30, 45, 0)),
    _meal((4, 2), 20, *_arc(50, 60, 10)),
    # Under the engine's 10 g meal floor: not a meal.
    _meal((4, 3), 9, *_arc(99, 60, 0)),
    # 25–39 g, at both edges.
    _meal((4, 4), 25, *_arc(60, 60, 20)),
    _meal((4, 5), 39, *_arc(70, 75, 10)),
    # 30 g and a 20 g top-up ten minutes later: one 50 g meal (ADR 470).
    _meal((4, 6), 30, *_arc(90, 90, 30), top_up=20),
    _meal((4, 7), 40, *_arc(100, 90, 40)),
    _meal((4, 8), 60, *_arc(140, 120, 60)),
    # 90 g, and two hours later another meal: the first's peak is cut there and it
    # has no reading at three hours; the second starts at 248, above 180.
    _meal((4, 9), 90, (0, 0), (150, 160), (240, 40), (300, 0)),
    _meal((4, 9), 20, at=(14, 0)),
    # Glucose already at 200 when this one was bolused.
    _meal((4, 10), 30, (-185, 0), (-180, 80), (300, 80), (305, 0)),
    # Bolused into a rise the engine judges late (from 120 to 160 over the
    # half hour before it, then on to 220).
    _meal((4, 11), 30, (-30, 0), (0, 40), (60, 100), (180, 0)),
    # Bolused into a rise that then stays in range (156 at the bolus, 175 at its
    # peak): the classifier calls it not late, since there was no spike to blunt,
    # but glucose was not flat before it, so it is left out all the same.
    _meal((4, 15), 30, (-30, 0), (0, 36), (30, 55), (150, 0)),
    # No reading in the quarter hour before it (the readings gap below).
    _meal((4, 12), 30, *_arc(80, 60, 0)),
    # A meal glucose ends below its start.
    _meal((4, 13), 45, *_arc(40, 30, -20)),
    # A 20 g breakfast and a 35 g meal two hours later, glucose flat between.
    _meal((4, 14), 20, (0, 0), (30, 40), (90, 0), at=(8, 0)),
    _meal((4, 14), 35, *_arc(50, 60, 0), at=(10, 0)),
    # A week before the history ends: inside every window the Overview offers.
    _meal((6, 1), 30, *_arc(70, 60, 10)),
)
# The readings gap: nothing from 11:30 to 12:30 on 12 Apr.
_GAP = (datetime(2026, 4, 12, 11, 30), datetime(2026, 4, 12, 12, 30))


def _offset(meal, t):
    minutes = (t - meal["t"]).total_seconds() / 60
    knots = meal["knots"]
    if not knots or minutes < knots[0][0] or minutes > knots[-1][0]:
        return 0.0
    for (m0, v0), (m1, v1) in zip(knots, knots[1:]):
        if m0 <= minutes <= m1:
            return v0 + (v1 - v0) * (minutes - m0) / (m1 - m0)
    return 0.0


def _cgm_rows():
    rows = []
    t = _FIRST_DAY
    end = _FIRST_DAY + timedelta(days=_DAYS)
    while t < end:
        if not _GAP[0] <= t <= _GAP[1]:
            bg = _BASELINE + sum(_offset(meal, t) for meal in _MEALS)
            rows.append({"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                         "Readings (CGM / BGM)": round(bg, 3), "Description": "EGV"})
        t += timedelta(minutes=5)
    return rows


def _bolus_rows():
    rows = []
    for meal in _MEALS:
        rows.append({"seq_num": len(rows) + 1, "request_time": meal["t"].strftime("%Y-%m-%d %H:%M:%S"),
                     "description": "Bolus", "carbs": meal["carbs"], "insulin": 2.0})
        if meal["top_up"]:
            top_up = meal["t"] + timedelta(minutes=10)
            rows.append({"seq_num": len(rows) + 1, "request_time": top_up.strftime("%Y-%m-%d %H:%M:%S"),
                         "description": "Bolus", "carbs": meal["top_up"], "insulin": 1.0})
    return rows


def _at(day, hour):
    """A served time: ``day`` (month, day) of the recipe's year at ``hour``."""
    return datetime(2026, *day, hour).strftime("%Y-%m-%d %H:%M:%S")


def _row(carbs_from, carbs_to, count, climb, to_peak, at_3h):
    """One size as served: how many meals it counts, its climbs' median and
    10th, 25th, 75th and 90th percentiles, its median minutes to peak, and its
    change at three hours with the meals that is read from (#570: no per-meal
    list)."""
    return {"carbs_from": carbs_from, "carbs_to": carbs_to, "count": count,
            "climb": dict(zip(("median", "p10", "p25", "p75", "p90"), climb)),
            "to_peak": {"median": to_peak},
            "at_3h": dict(zip(("count", "median"), at_3h))}


_NONE = (None, None, None, None, None)


def _rounded(value):
    """Served numbers to six places, so an interpolated percentile compares as written."""
    if isinstance(value, float):
        return round(value, 6)
    if isinstance(value, dict):
        return {key: _rounded(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_rounded(item) for item in value]
    return value


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class MealSizeReadTest(unittest.TestCase):
    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        self.client = TestClient(create_app(db_path=self.tmp.name, token=None,
                                            enable_fetch_loop=False))

    def tearDown(self):
        self.tmp.close()

    def _body(self, **params):
        response = self.client.get("/api/explore/meal-size", params=params)
        self.assertEqual(response.status_code, 200, response.text)
        return _rounded(response.json())

    def _seed(self):
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm(_cgm_rows())
            store.upsert_bolus(_bolus_rows())

    def test_each_size_serves_its_counts_and_climb_percentiles(self):
        self._seed()

        body = self._body(days=90)
        self.assertEqual(body["window"], {"start": _at((3, 11), 0), "end": _at((6, 9), 0),
                                          "data_days": 90})
        self.assertEqual(body["horizon_hours"], 3)
        self.assertEqual(body["sizes"], [
            # 15 g, 20 g and the 20 g breakfast: climbs 30, 50, 40.
            _row(None, 25, 3, (40.0, 32.0, 35.0, 45.0, 48.0), 45.0, (2, 5.0)),
            # 25 g, 39 g, the 35 g meal after breakfast and 1 June's 30 g: 60, 70, 50, 70.
            _row(25, 40, 4, (65.0, 53.0, 57.5, 70.0, 70.0), 60.0, (4, 10.0)),
            # 30 g with its 20 g top-up, 40 g and 45 g: 90, 100, 40.
            _row(40, 60, 3, (90.0, 50.0, 65.0, 95.0, 98.0), 90.0, (3, 30.0)),
            # 60 g, and 90 g cut by the meal after it: 140, 128.
            _row(60, None, 2, (134.0, 129.2, 131.0, 137.0, 138.8), 120.0, (1, 60.0)),
        ])

    def test_the_window_follows_the_overviews_switch(self):
        """#565: the card reads the window the Overview shows, 14, 30 or 90 days."""
        self._seed()

        body = self._body(days=14)
        self.assertEqual(body["window"], {"start": _at((5, 26), 0), "end": _at((6, 9), 0),
                                          "data_days": 14})
        self.assertEqual(body["sizes"], [
            _row(None, 25, 0, _NONE, None, (0, None)),
            _row(25, 40, 1, (70.0, 70.0, 70.0, 70.0, 70.0), 60.0, (1, 10.0)),
            _row(40, 60, 0, _NONE, None, (0, None)),
            _row(60, None, 0, _NONE, None, (0, None)),
        ])
        refused = self.client.get("/api/explore/meal-size", params={"days": 7})
        self.assertEqual(refused.status_code, 400)

    def test_a_store_with_no_readings_serves_four_empty_sizes(self):
        body = self._body()
        self.assertEqual(body, {"window": None, "horizon_hours": 3, "sizes": [
            _row(None, 25, 0, _NONE, None, (0, None)),
            _row(25, 40, 0, _NONE, None, (0, None)),
            _row(40, 60, 0, _NONE, None, (0, None)),
            _row(60, None, 0, _NONE, None, (0, None)),
        ]})


if __name__ == "__main__":
    unittest.main()
