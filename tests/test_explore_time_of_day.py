"""Public-contract tests for Explore's fixed time-of-day evidence read."""

import tempfile
import unittest
from datetime import datetime
from unittest.mock import patch

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

from ciq_autotune.store import Store


def _cgm(t, bg):
    return {"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
            "Readings (CGM / BGM)": bg, "Description": "EGV"}


def _bolus(seq, t, carbs):
    return {"seq_num": seq, "request_time": t.strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Bolus", "carbs": carbs}


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class ExploreTimeOfDayTest(unittest.TestCase):
    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        self.client = TestClient(create_app(db_path=self.tmp.name, token=None,
                                            enable_fetch_loop=False))

    def tearDown(self):
        self.tmp.close()

    def _seed(self, cgm=(), bolus=()):
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm(cgm)
            store.upsert_bolus(bolus)

    def _body(self):
        response = self.client.get("/explore/time-of-day")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_exact_shape_bounds_order_and_off_grid_membership(self):
        self._seed(cgm=[
            _cgm(datetime(2026, 6, 1, 0, 0), 90),
            _cgm(datetime(2026, 6, 30, 23, 59, 59), 140),
        ])

        body = self._body()
        self.assertEqual(set(body),
                         {"window", "bin_minutes", "target_range", "bins", "pooled"})
        self.assertEqual(body["window"], {
            "start": "2026-06-01 00:00:00", "end": "2026-07-01 00:00:00",
            "data_days": 30,
        })
        self.assertEqual(body["bin_minutes"], 5)
        self.assertEqual(body["target_range"], {"low": 70, "high": 180})
        self.assertEqual(len(body["bins"]), 288)
        self.assertEqual([bin_["minute"] for bin_ in body["bins"]], list(range(0, 1440, 5)))
        self.assertEqual(body["bins"][287]["n"], 1)  # 23:59:59 floors to 23:55.
        self.assertEqual(body["bins"][0]["n"], 1)
        self.assertEqual(set(body["bins"][0]),
                         {"minute", "n", "median", "p10", "p25", "p75", "p90", "meal_count"})

    def test_pooled_envelope_is_server_computed_from_raw_readings(self):
        self._seed(cgm=[
            _cgm(datetime(2026, 6, 1, 23, 50), 80),
            _cgm(datetime(2026, 6, 2, 0, 5), 100),
            _cgm(datetime(2026, 6, 3, 0, 40), 140),
            _cgm(datetime(2026, 6, 30, 12, 0), 120),
        ], bolus=[_bolus(1, datetime(2026, 6, 2, 0, 7), 20)])

        pooled = self._body()["pooled"]
        self.assertEqual({key: pooled[key] for key in (
            "bin_minutes", "pool_minutes", "reading_count", "captured_days")}, {
                "bin_minutes": 15, "pool_minutes": 45,
                "reading_count": 4, "captured_days": 4,
            })
        self.assertEqual(len(pooled["bins"]), 96)
        midnight = pooled["bins"][0]
        self.assertEqual(midnight["minute"], 0)
        self.assertEqual(midnight["raw_n"], 1)
        self.assertEqual(midnight["meal_count"], 1)
        self.assertEqual(midnight["n"], 3,
                         "the ±45 minute pool wraps across midnight")
        self.assertEqual(midnight["median"], 100)
        self.assertIn("supported", midnight,
                      "thin-window honesty is decided in the backend")

    def test_midnight_pool_counts_nights_once_and_support_floor_is_server_owned(self):
        cgm = []
        for night in range(1, 9):
            cgm.extend([
                _cgm(datetime(2026, 6, night, 23, 50), 100),
                _cgm(datetime(2026, 6, night + 1, 0, 5), 110),
            ])
        cgm.extend(
            _cgm(datetime(2026, 6, day, 12, 5), 120)
            for day in range(2, 9)
        )
        self._seed(cgm=cgm)

        bins = self._body()["pooled"]["bins"]
        midnight = bins[0]
        noon = bins[48]
        self.assertEqual(midnight["support_days"], 8,
                         "a wrapping pool counts each observed night once")
        self.assertIs(midnight["supported"], True)
        self.assertEqual(noon["support_days"], 7)
        self.assertIs(noon["supported"], False)

    def test_pooled_summary_is_centered_on_the_forward_bucket_midpoint(self):
        self._seed(cgm=[
            _cgm(datetime(2026, 6, 29, 23, 20), 70),
            _cgm(datetime(2026, 6, 29, 23, 25), 90),
            _cgm(datetime(2026, 6, 30, 0, 50), 130),
            _cgm(datetime(2026, 6, 30, 0, 55), 150),
        ])

        midnight = self._body()["pooled"]["bins"][0]
        self.assertEqual(midnight["n"], 2)
        self.assertEqual(midnight["median"], 110.0)

    def test_inclusive_quantiles_and_empty_or_single_point_bins(self):
        latest = datetime(2026, 6, 30, 12, 0)
        self._seed(cgm=[
            _cgm(datetime(2026, 6, day, 1, 2), value)
            for day, value in enumerate((70, 100, 130, 160), start=1)
        ] + [_cgm(latest, 111)])

        bins = self._body()["bins"]
        self.assertEqual(bins[12], {
            "minute": 60, "n": 4, "median": 115.0, "p10": 79.0, "p25": 92.5,
            "p75": 137.5, "p90": 151.0, "meal_count": 0,
        })
        self.assertEqual(bins[144], {
            "minute": 720, "n": 1, "median": 111, "p10": 111, "p25": 111,
            "p75": 111, "p90": 111, "meal_count": 0,
        })
        self.assertEqual(bins[0], {
            "minute": 0, "n": 0, "median": None, "p10": None, "p25": None,
            "p75": None, "p90": None, "meal_count": 0,
        })

    def test_qualifying_boluses_aggregate_in_their_half_open_bins(self):
        self._seed(
            cgm=[_cgm(datetime(2026, 6, 30, 23, 0), 120)],
            bolus=[
                _bolus(1, datetime(2026, 6, 1, 7, 4, 59), 10),
                _bolus(2, datetime(2026, 6, 2, 7, 0), 35),
                _bolus(3, datetime(2026, 6, 3, 7, 1), 9.9),
                _bolus(4, datetime(2026, 7, 1, 0, 0), 20),
            ],
        )

        self.assertEqual(self._body()["bins"][84]["meal_count"], 2)

    def test_pooled_meals_use_the_workstation_12_gram_floor(self):
        self._seed(
            cgm=[_cgm(datetime(2026, 6, 30, 23, 0), 120)],
            bolus=[
                _bolus(1, datetime(2026, 6, 1, 7, 4), 10),
                _bolus(2, datetime(2026, 6, 2, 7, 29), 12),
                _bolus(3, datetime(2026, 6, 3, 7, 31), 36),
            ],
        )

        body = self._body()
        self.assertEqual([body["bins"][index]["meal_count"] for index in (84, 89, 90)],
                         [1, 1, 1], "the existing 10 g bin count remains unchanged")
        self.assertEqual(body["pooled"]["meals"], [
            {"minute": 420, "count": 1, "carbs": 12, "median_carbs": 12, "insulin": 0},
            {"minute": 450, "count": 1, "carbs": 36, "median_carbs": 36, "insulin": 0},
        ])

    def test_false_low_is_resolved_from_full_history_before_cohort_filter(self):
        boundary = datetime(2026, 6, 1)
        self._seed(cgm=[
            _cgm(datetime(2026, 5, 31, 23, 50), 130),
            _cgm(datetime(2026, 5, 31, 23, 55), 60),
            _cgm(boundary, 55),
            _cgm(datetime(2026, 6, 1, 0, 5), 130),
            _cgm(datetime(2026, 6, 30, 23, 0), 120),
        ])
        with Store.open(self.tmp.name) as store:
            store.record_prompt_response(
                detector="low", anchor_t=datetime(2026, 5, 31, 23, 55), answer="false-low")

        bins = self._body()["bins"]
        self.assertEqual(bins[0]["n"], 0)
        self.assertEqual(bins[1]["n"], 0)

    def test_no_cgm_is_a_successful_empty_state(self):
        body = self._body()
        self.assertEqual(body, {
            "window": None, "bin_minutes": 5, "target_range": {"low": 70, "high": 180},
            "bins": [], "pooled": None,
        })

    def test_carb_write_recomputes_but_plan_draft_does_not(self):
        self._seed(cgm=[_cgm(datetime(2026, 6, 30, 12, 0), 120)])
        import ciq_autotune.api as api
        real_build = api.build_time_of_day
        calls = []

        def counting_build(*args, **kwargs):
            calls.append(1)
            return real_build(*args, **kwargs)

        with patch.object(api, "build_time_of_day", counting_build):
            self._body()
            self._body()
            self.assertEqual(len(calls), 1)
            self.assertEqual(self.client.put("/plan", json={"items": []}).status_code, 200)
            self._body()
            self.assertEqual(len(calls), 1)
            self.assertEqual(self.client.post("/carbs", json={
                "t": "2026-06-30 12:05:00", "grams": 8, "certainty": "exact"}).status_code, 200)
            self._body()
            self.assertEqual(len(calls), 2)


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class ExploreTimeOfDayAuthTest(unittest.TestCase):
    def test_configured_token_rejects_missing_or_invalid_bearers(self):
        from ciq_autotune.api import create_app
        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            client = TestClient(create_app(db_path=db.name, token="secret", enable_fetch_loop=False))
            self.assertEqual(client.get("/explore/time-of-day").status_code, 401)
            self.assertEqual(client.get("/explore/time-of-day", headers={
                "Authorization": "Bearer wrong"}).status_code, 401)
            response = client.get("/explore/time-of-day", headers={
                "Authorization": "Bearer secret"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {
                "window": None, "bin_minutes": 5, "target_range": {"low": 70, "high": 180},
                "bins": [], "pooled": None,
            })
