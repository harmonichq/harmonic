"""Public-contract tests for the Diagnose workstation exposures feed."""

import tempfile
import unittest
from datetime import datetime, timedelta
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


class ExploreExposuresTest(unittest.TestCase):
    def _seeded_store(self):
        db = tempfile.NamedTemporaryFile(suffix=".db")
        store = Store.open(db.name)
        meal_t = datetime(2026, 6, 30, 12)
        store.upsert_bolus([_bolus(1, meal_t, 20)])
        store.upsert_cgm([
            _cgm(meal_t - timedelta(minutes=5), 110),
            _cgm(meal_t, 115),
            _cgm(meal_t + timedelta(minutes=5), 120),
        ])
        return db, store

    def _seed_scenario_events(self, store, bolus, cgm):
        store.upsert_cgm([
            _cgm(reading.t, reading.bg)
            for reading in cgm
        ])
        store.upsert_bolus([
            {"seq_num": index, "request_time": event.t.strftime("%Y-%m-%d %H:%M:%S"),
             "description": "Bolus", "carbs": event.carbs, "insulin": event.insulin,
             "carb_ratio": event.carb_ratio}
            for index, event in enumerate(bolus, start=1)
        ])

    def test_empty_store_keeps_every_exposure_family(self):
        from ciq_autotune.explore_exposures import build_exposures

        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            with Store.open(db.name) as store:
                payload = build_exposures(store)

        self.assertEqual(set(payload), {"window", "exposures"})
        self.assertEqual(set(payload["exposures"]), {
            "lows", "meals", "highs", "correction_clusters",
        })
        for family in payload["exposures"].values():
            self.assertEqual(family, {
                "n": 0, "attributed": 0, "clean": 0, "uncaused": 0,
                "levers": [], "by_cause": {}, "occurrences": [],
            })

    def test_occurrences_and_family_rollups_keep_the_locked_invariants(self):
        from ciq_autotune.explore_exposures import build_exposures

        db, store = self._seeded_store()
        try:
            payload = build_exposures(store)
        finally:
            store.close()
            db.close()

        self.assertEqual(set(payload["window"]), {"start", "end"})
        for family in payload["exposures"].values():
            occurrences = family["occurrences"]
            self.assertEqual(family["n"], len(occurrences))
            self.assertEqual(family["attributed"], sum(
                occurrence["attributed"] for occurrence in occurrences))
            self.assertEqual(family["clean"], family["n"] - family["attributed"])
            self.assertEqual(family["attributed"], sum(
                occurrence["state"] == "fired" for occurrence in occurrences))
            self.assertTrue(all(
                occurrence["text"] == "" for occurrence in occurrences
                if not occurrence["attributed"]
            ))
            self.assertEqual(family["by_cause"], {
                title: sum(occurrence["cause_title"] == title for occurrence in occurrences)
                for title in {occurrence["cause_title"] for occurrence in occurrences}
                if title is not None
            })
            self.assertEqual(sum(family["by_cause"].values()), family["attributed"])
            levers = [occurrence["cause_lever"] for occurrence in occurrences
                      if occurrence["cause_lever"] is not None]
            self.assertEqual(set(family["levers"]), set(levers))
            self.assertEqual(len(family["levers"]), len(set(family["levers"])))
            for occurrence in occurrences:
                self.assertEqual(set(occurrence), {
                    "t", "date", "bg", "worst_bg", "kind", "label", "state",
                    "attributed", "cause_lever", "cause_title", "text", "verdicts", "ep_id",
                })
                self.assertEqual(occurrence["attributed"], occurrence["state"] == "fired")
                for verdict in occurrence["verdicts"]:
                    self.assertEqual(set(verdict), {
                        "classifier", "matched", "detail", "evidence_tier", "silence_reason",
                    })

    def test_fired_drivers_keep_their_episode_cause_and_narrative(self):
        from ciq_autotune.explore_exposures import build_exposures
        from tests.test_scenario_engine import ISF, cgm_flat, cgm_ramp, corr, meal

        cgm = (
            cgm_flat(19, 18, 40, 120, 20)
            + cgm_ramp(19, 19, 0, 120, 1.75, 40)
            + cgm_ramp(19, 19, 40, 190, -1.4, 100)
            + cgm_ramp(19, 21, 20, 50, 4.0, 40)
            + cgm_ramp(19, 22, 0, 210, -1.2, 80)
        )
        bolus = [meal(19, 19, 0, carbs=40, dose=6), corr(19, 20, 0, units=4)]
        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            with Store.open(db.name) as store:
                self._seed_scenario_events(store, bolus, cgm)
                with patch("ciq_autotune.explore_exposures._effective_isf", return_value=ISF):
                    payload = build_exposures(store)

        high = payload["exposures"]["highs"]["occurrences"][0]
        self.assertEqual(
            (high["kind"], high["state"], high["cause_lever"], high["cause_title"]),
            ("high", "fired", "over_treated_low", "Over-treated low"),
        )
        self.assertTrue(high["text"])
        for family in payload["exposures"].values():
            self.assertEqual(family["attributed"], sum(
                occurrence["state"] == "fired" for occurrence in family["occurrences"]
            ))
            self.assertEqual(sum(family["by_cause"].values()), family["attributed"])

    def test_announced_meal_low_stays_in_low_population_without_association(self):
        from ciq_autotune.explore_exposures import build_exposures
        from tests.test_scenario_engine import ISF, cgm_flat, cgm_ramp, corr, meal

        cgm = (
            cgm_flat(19, 18, 40, 120, 20)
            + cgm_ramp(19, 19, 0, 120, 1.75, 40)
            + cgm_ramp(19, 19, 40, 190, -1.4, 100)
            + cgm_ramp(19, 21, 20, 50, 4.0, 40)
            + cgm_ramp(19, 22, 0, 210, -1.2, 80)
        )
        bolus = [
            meal(19, 19, 0, carbs=40, dose=6),
            corr(19, 20, 0, units=4),
            meal(19, 21, 20, carbs=20, dose=2),
        ]
        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            with Store.open(db.name) as store:
                self._seed_scenario_events(store, bolus, cgm)
                with patch("ciq_autotune.explore_exposures._effective_isf", return_value=ISF):
                    payload = build_exposures(store)

        low = next(row for row in payload["exposures"]["lows"]["occurrences"]
                   if row["t"] == "2026-06-19 21:20:00")
        own = next(v for v in low["verdicts"]
                   if v["classifier"] == "over_treated_low")
        self.assertEqual((own["matched"], own["silence_reason"]),
                         (False, "owned_by_announced_meal"))
        self.assertNotEqual(low["cause_lever"], "over_treated_low")
        self.assertEqual(payload["exposures"]["lows"]["n"], 1)


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class ExploreExposuresRouteTest(unittest.TestCase):
    def test_registered_route_returns_the_feed(self):
        from ciq_autotune.api import create_app

        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            client = TestClient(create_app(db_path=db.name, token=None, enable_fetch_loop=False))
            response = client.get("/api/explore/exposures")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(set(response.json()), {"window", "exposures"})


if __name__ == "__main__":
    unittest.main()
