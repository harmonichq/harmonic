"""Public-contract tests for the Overview's insulin read (#632, ADR 632).

The store here is manufactured: a flat glucose history from 1 Mar to 9 Apr 2026,
basal every hour at a known rate, and a handful of boluses that each exercise
one partition rule, so every served figure is a literal worked from the recipe
below, never read off the builder's output.
"""

import tempfile
import unittest
from datetime import datetime, timedelta

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

from ciq_autotune.events import CarbEntry
from ciq_autotune.store import Store

_FIRST_DAY = datetime(2026, 3, 1)
_DAYS = 40  # through 9 Apr: the windows end at 10 Apr and open on 27 Mar, 11 Mar, 10 Jan
_RAISED = datetime(2026, 3, 27)  # basal runs 1.0 U/h before, 1.5 U/h from here
_NO_DELIVERY = datetime(2026, 4, 1)  # a window day with no basal and no bolus


def _stamp(t: datetime) -> str:
    return t.strftime("%Y-%m-%d %H:%M:%S")


def _cgm_rows():
    rows, t = [], _FIRST_DAY
    while t < _FIRST_DAY + timedelta(days=_DAYS):
        rows.append({"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                     "Readings (CGM / BGM)": 120.0, "Description": "EGV"})
        t += timedelta(minutes=5)
    return rows


def _basal_rows():
    """An hour-long row every hour of every history day but 1 Apr, except that 26
    Mar's last hour is 55 minutes and a ten-minute row (the feed's longest) running
    five minutes into 27 Mar, whose first row is the 55 minutes from 00:05; one 5 U
    row on 5 Jan, before every window opens; and on 5 Apr a row with no rate and
    one with no duration, which add nothing."""
    rows = []

    def row(t, rate, duration=60.0):
        rows.append({"seq_num": len(rows) + 1, "time": _stamp(t), "delivery_type": "profileDelivery",
                     "duration_mins": duration, "basal_rate": rate})

    row(datetime(2026, 1, 5, 12), 5.0)
    for day in range(_DAYS):
        date = _FIRST_DAY + timedelta(days=day)
        if date != _NO_DELIVERY:
            for hour in range(24):
                t, rate = date + timedelta(hours=hour), 1.5 if date >= _RAISED else 1.0
                if t == _RAISED - timedelta(hours=1):
                    row(t, rate, 55.0)
                    row(t + timedelta(minutes=55), rate, 10.0)
                elif t == _RAISED:
                    row(t + timedelta(minutes=5), rate, 55.0)
                else:
                    row(t, rate)
    row(datetime(2026, 4, 5, 12, 30), None)
    row(datetime(2026, 4, 5, 12, 40), 2.0, None)
    return rows


def _bolus(t, insulin, *, carbs=None, option=0, override=0, food=None, correction=None,
           completion="Completed", extended=False):
    return {"request_time": _stamp(t), "bolex_start_time": _stamp(t) if extended else None,
            "extended_bolus": "1" if extended else "0", "description": "Bolus",
            "completion": completion, "insulin": insulin, "requested_insulin": insulin,
            "carbs": carbs, "bolus_options": option, "user_override": override,
            "food_insulin": food, "correction_insulin": correction}


_BOLUSES = (
    # Before every window opens: counted nowhere. Every other bolus with delivered
    # insulin counts, whatever its completion (ADR 492).
    _bolus(datetime(2026, 1, 5, 12), 10.0, carbs=100, food=10.0, correction=0.0),
    # Inside the 30 and 90 days only: 6 U Standard, all Food, 60 g.
    _bolus(datetime(2026, 3, 15, 12), 6.0, carbs=60, food=6.0, correction=0.0),
    # Inside every window.
    # Control-IQ's own (codes 3 and 6): 1.0 + 0.5 U, type and method Control-IQ.
    _bolus(datetime(2026, 4, 2, 9), 1.0, option=3, food=0.0, correction=1.0),
    _bolus(datetime(2026, 4, 2, 15), 0.5, option=6, food=0.0, correction=0.5),
    # An override: 3 U, Override, Standard, 40 g.
    _bolus(datetime(2026, 4, 3, 12), 3.0, carbs=40, override=1, food=4.0, correction=0.0),
    # Extended: 4 U, all Food, 50 g.
    _bolus(datetime(2026, 4, 4, 12), 4.0, carbs=50, option=1, food=4.0, correction=0.0,
           extended=True),
    # Quick, its split summing to zero, with carbs: 2 U to Food, 20 g.
    _bolus(datetime(2026, 4, 5, 8), 2.0, carbs=20, option=2, food=0.0, correction=0.0),
    # No split and no carbs: 1.5 U Standard to Correction.
    _bolus(datetime(2026, 4, 5, 16), 1.5),
    # A split (1.5 + 0.5) below its 3 U delivery: 2.25 U Food, 0.75 U Correction, 30 g.
    _bolus(datetime(2026, 4, 6, 12), 3.0, carbs=30, food=1.5, correction=0.5),
    # A negative correction part, clamped at zero: the whole 2 U to Food, 25 g.
    _bolus(datetime(2026, 4, 7, 12), 2.0, carbs=25, food=2.5, correction=-0.5),
    # No provenance code, no split, no carbs: 1 U to Correction, manual, no method row.
    _bolus(datetime(2026, 4, 7, 20), 1.0, option=None),
    # A null completion counts: 2 U Standard, Food, 20 g.
    _bolus(datetime(2026, 4, 8, 12), 2.0, carbs=20, food=2.0, correction=0.0, completion=None),
    # Cut short at 2 U of its 3 + 1 split: 1.5 U Food, 0.5 U Correction, Standard, 30 g.
    _bolus(datetime(2026, 4, 9, 12), 2.0, carbs=30, food=3.0, correction=1.0,
           completion="Terminated"),
)

_CARB_ENTRIES = (
    CarbEntry(datetime(2026, 3, 20, 15), 10.0, "estimate", "manual"),  # the 30 and 90 days
    CarbEntry(datetime(2026, 4, 3, 15), 30.0, "exact", "manual"),
    CarbEntry(datetime(2026, 4, 4, 15), None, "unknown", "manual"),    # adds nothing
)


def _window(start, data_days):
    return {"start": _stamp(start), "end": "2026-04-10 00:00:00", "data_days": data_days}


def _part(units, total):
    return {"units": units, "share": units / total}


def _expected(*, start, data_days, delivery_days, basal, boluses, control_iq_count, carbs,
              food, correction, override, control_iq, standard, extended, quick):
    """One window as served, from its totals over the window; every average is over
    ``delivery_days``."""
    bolus = food + correction + override + control_iq
    count = boluses
    n = delivery_days
    return {
        "window": _window(start, data_days),
        "delivery_days": n,
        "daily_dose": {"units": (basal + bolus) / n},
        "basal": {"units": basal / n, "share": basal / (basal + bolus)},
        "bolus": {"units": bolus / n, "share": bolus / (basal + bolus)},
        "boluses": {"count": count / n,
                    "manual": {"count": (count - control_iq_count) / n,
                               "share": (count - control_iq_count) / count},
                    "control_iq": {"count": control_iq_count / n,
                                   "share": control_iq_count / count}},
        "carbs": {"grams": carbs / n},
        "by_type": {"food": _part(food / n, bolus / n),
                    "correction": _part(correction / n, bolus / n),
                    "override": _part(override / n, bolus / n),
                    "control_iq": _part(control_iq / n, bolus / n)},
        "by_method": {"standard": _part(standard / n, bolus / n),
                      "extended": _part(extended / n, bolus / n),
                      "quick": _part(quick / n, bolus / n),
                      "control_iq": _part(control_iq / n, bolus / n)},
    }


def _rounded(value):
    """Served numbers to nine places, so a quotient compares as written."""
    if isinstance(value, float):
        return round(value, 9)
    if isinstance(value, dict):
        return {key: _rounded(item) for key, item in value.items()}
    return value


# The eleven boluses inside every window: Control-IQ 1.0 + 0.5; Override 3; Food
# 4 + 2 + 2.25 + 2 + 2 + 1.5; Correction 1.5 + 0.75 + 1 + 0.5; Standard
# 3 + 1.5 + 3 + 2 + 2 + 2, Extended 4, Quick 2, and the codeless 1 U in no method
# row. Their carbs: 40 + 50 + 20 + 30 + 25 + 20 + 30 = 215 g, and 30 g logged by hand.
_RECENT = dict(boluses=11, control_iq_count=2, food=13.75, correction=3.75, override=3.0,
               control_iq=1.5, standard=13.5, extended=4.0, quick=2.0)
# 27 Mar to 9 Apr less 1 Apr: 13 days at 1.5 U/h, less the five minutes 27 Mar's
# own first row does not cover (35.875 U that day). 26 Mar's last row adds its
# five minutes inside 27 Mar (1/12 U) to whichever window holds them.
_RECENT_BASAL = 12 * 36.0 + 35.875
_SPILL = 1.0 * 5 / 60


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class InsulinReadTest(unittest.TestCase):
    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        self.client = TestClient(create_app(db_path=self.tmp.name, token=None,
                                            enable_fetch_loop=False))

    def tearDown(self):
        self.tmp.close()

    def _body(self, **params):
        response = self.client.get("/api/explore/insulin", params=params)
        self.assertEqual(response.status_code, 200, response.text)
        return _rounded(response.json())

    def _seed(self):
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm(_cgm_rows())
            store.upsert_basal(_basal_rows())
            store.upsert_bolus([{**row, "seq_num": seq}
                                for seq, row in enumerate(_BOLUSES, start=1)])
            for entry in _CARB_ENTRIES:
                store.upsert_carb_entry(entry)

    def test_fourteen_days_average_over_the_days_with_delivery(self):
        self._seed()
        self.assertEqual(self._body(days=14), _rounded(_expected(
            start=datetime(2026, 3, 27), data_days=14, delivery_days=13,
            basal=_RECENT_BASAL + _SPILL, carbs=215 + 30, **_RECENT)))

    def test_the_daily_dose_is_the_day_screens_total_over_the_same_days(self):
        """ADR 632: basal plus bolus units over the window is what the Day screen's
        own read serves as its total over those days (ADR 492)."""
        self._seed()
        body = self.client.get("/api/explore/insulin", params={"days": 14}).json()
        day = self.client.get("/api/timeline", params={"start": "2026-03-27T00:00:00",
                                                         "end": "2026-04-10T00:00:00"})
        self.assertEqual(day.status_code, 200, day.text)
        total = day.json()["insulin_totals"]["total"]
        self.assertAlmostEqual(body["daily_dose"]["units"] * body["delivery_days"], total)
        self.assertAlmostEqual((body["basal"]["units"] + body["bolus"]["units"])
                               * body["delivery_days"], total)

    def test_thirty_days_add_the_earlier_bolus_and_carb_entry(self):
        self._seed()
        # 11 to 26 Mar at 1.0 U/h (16 days of 24 U, and 26 Mar's last row whole)
        # and the 13 days above.
        self.assertEqual(self._body(days=30), _rounded(_expected(
            start=datetime(2026, 3, 11), data_days=30, delivery_days=29,
            basal=16 * 24.0 + _SPILL + _RECENT_BASAL, carbs=215 + 30 + 60 + 10,
            **{**_RECENT, "boluses": 12, "food": 13.75 + 6.0, "standard": 13.5 + 6.0})))

    def test_ninety_days_leave_out_what_came_before_them(self):
        self._seed()
        # 1 to 26 Mar at 1.0 U/h (26 days) and the 13 days above; 5 Jan is outside.
        self.assertEqual(self._body(days=90), _rounded(_expected(
            start=datetime(2026, 1, 10), data_days=90, delivery_days=39,
            basal=26 * 24.0 + _SPILL + _RECENT_BASAL, carbs=215 + 30 + 60 + 10,
            **{**_RECENT, "boluses": 12, "food": 13.75 + 6.0, "standard": 13.5 + 6.0})))

    def test_a_store_with_no_readings_serves_a_null_window(self):
        nothing = {"units": None, "share": None}
        self.assertEqual(self._body(days=30), {
            "window": None, "delivery_days": 0,
            "daily_dose": {"units": None}, "basal": nothing, "bolus": nothing,
            "boluses": {"count": None, "manual": {"count": None, "share": None},
                        "control_iq": {"count": None, "share": None}},
            "carbs": {"grams": None},
            "by_type": dict.fromkeys(("food", "correction", "override", "control_iq"), nothing),
            "by_method": dict.fromkeys(("standard", "extended", "quick", "control_iq"), nothing),
        })

    def test_any_other_window_is_refused(self):
        self.assertEqual(self.client.get("/api/explore/insulin", params={"days": 7}).status_code,
                         400)


if __name__ == "__main__":
    unittest.main()
