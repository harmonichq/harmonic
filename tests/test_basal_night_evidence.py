"""Public API contract for analyzer-owned basal nightly evidence (#143)."""

import json
import pathlib
import tempfile
import unittest
from datetime import datetime, timedelta

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

from ciq_autotune.store import Store
from ciq_autotune.analyzers.basal import analyze_basal
from ciq_autotune.basal_night_evidence import (
    IncompleteBasalNightEvidence,
    prepare_basal_night_evidence,
)
from ciq_autotune.events import BasalEvent, BolusEvent, CarbEntry, CgmReading

_FIXTURE = (pathlib.Path(__file__).resolve().parents[1]
            / "frontend" / "__fixtures__" / "basal-night-evidence.json")


# The slot's setting-epoch cut for the six-cause nights: nights 1-3 predate it.
_SETTING_CUT = {0: datetime(2026, 2, 4)}


def _six_cause_nights():
    """Sixteen synthetic nights in slot 00:00 (#434).

    Nights 1-3 predate the setting cut, nights 4-11 are steady, and nights 12-16
    are each excluded by one cause: 12 suspended at a low, 13 high, 14 under a 2 U
    bolus given 30 minutes before, 15 under a 20 g Carb log entry, and 16 rising
    1 mg/dL/min while still inside the range.
    """
    basal, cgm, bolus, carbs = [], [], [], []
    for day in range(1, 17):
        start = datetime(2026, 2, day)
        if day == 12:
            basal.append(BasalEvent(start, "algorithmDelivery (control-iq suspension)",
                                    30, 0.0, 0.6))
        else:
            basal.append(BasalEvent(start, "algorithmDelivery", 30, 0.8, 0.6))
        for minute in range(-60, 36, 5):
            bg = {12: 60, 13: 220}.get(day, 120)
            if day == 16:
                bg = 80 + (minute + 60)  # 80 to 175 mg/dL, never out of range
            cgm.append(CgmReading(start + timedelta(minutes=minute), bg, "EGV"))
        if day == 14:
            bolus.append(BolusEvent(start - timedelta(minutes=30), insulin=2.0))
        if day == 15:
            carbs.append(CarbEntry(start - timedelta(minutes=5), 20.0, "exact", "manual"))
    return basal, cgm, bolus, carbs


class BasalNightEvidenceProjectionTest(unittest.TestCase):
    def test_projection_copies_analyzer_glucose_evidence_verbatim(self):
        start = datetime(2026, 4, 1)
        basal = [BasalEvent(start, "algorithmDelivery", 30, 0.8, 0.6)]
        cgm = [
            CgmReading(start + timedelta(minutes=minute), 120 + minute / 5, "EGV")
            for minute in range(-30, 31, 5)
        ]
        slot = analyze_basal(basal, cgm, [], [])[0]

        projected = prepare_basal_night_evidence({
            "basal": [slot.to_dict()],
        }).project(0, analysis_generation="test")

        self.assertEqual(
            projected["roster_glucose_mean"],
            slot.evidence["roster_glucose_mean"],
        )
        self.assertEqual(projected["nights"], slot.evidence["night_roster"])

    def test_projection_rejects_a_roster_without_its_glucose_norm(self):
        projection = prepare_basal_night_evidence({"basal": [{
            "slot": 0,
            "evidence": {
                "night_roster": [],
                "directional_support_count": 0,
                "excluded_night_count": 0,
            },
        }]})

        with self.assertRaisesRegex(
            IncompleteBasalNightEvidence, "roster_glucose_mean"
        ):
            projection.project(0, analysis_generation="test")

    def test_projection_copies_the_analyzer_excluded_night_reasons_verbatim(self):
        basal, cgm, bolus, carbs = _six_cause_nights()
        slot = analyze_basal(basal, cgm, bolus, [], carb_entries=carbs,
                             slot_starts=_SETTING_CUT)[0]

        projected = prepare_basal_night_evidence({
            "basal": [slot.to_dict()],
        }).project(0, analysis_generation="test")

        self.assertEqual(projected["excluded_night_reasons"],
                         slot.evidence["excluded_night_reasons"])
        self.assertEqual(projected["excluded_night_count"], 8)

    def test_projection_refuses_evidence_without_excluded_night_reasons(self):
        projection = prepare_basal_night_evidence({"basal": [{
            "slot": 0,
            "evidence": {
                "night_roster": [],
                "roster_glucose_mean": None,
                "directional_support_count": 0,
                "excluded_night_count": 0,
            },
        }]})

        with self.assertRaisesRegex(
            IncompleteBasalNightEvidence, "excluded_night_reasons"
        ):
            projection.project(0, analysis_generation="test")


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class BasalNightEvidenceEndpointTest(unittest.TestCase):
    def setUp(self):
        from ciq_autotune.api import create_app

        self.fixture = json.loads(_FIXTURE.read_text())
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        with Store.open(self.tmp.name) as store:
            store.upsert_basal(self.fixture["input"]["basal"])
            store.upsert_cgm(self.fixture["input"]["cgm"])
            store.upsert_bolus(self.fixture["input"]["bolus"])
        self.app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False,
                              analysis_incarnation="basal-night-evidence-fixture")
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp.close()

    def test_serves_the_analyzer_roster_and_distinct_support_counts(self):
        analysis = self.client.get("/api/analyze", params={"window": 30, "pool": True})
        response = self.client.get("/api/diagnose/basal-night-evidence", params={"slot": 0})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), self.fixture["expected"])
        slot = analysis.json()["basal"][0]
        evidence = response.json()
        self.assertEqual([night["date"] for night in evidence["nights"]],
                         [point["date"] for point in slot["evidence"]["points"]])
        self.assertEqual(evidence["directional_support_count"],
                         slot["evidence"]["directional_support_count"])
        self.assertEqual(evidence["asserts_move"], slot["asserts_move"])
        self.assertEqual(evidence["current"], slot["current"])
        self.assertEqual(evidence["recommended"], slot["recommended"])
        self.assertEqual(evidence["estimate"], {
            "value": slot["estimate"]["value"],
            "lo": slot["estimate"]["lo"],
            "hi": slot["estimate"]["hi"],
            "confidence": slot["estimate"]["confidence"],
        })
        self.assertEqual(evidence["roster_count"], 7)
        self.assertEqual(evidence["directional_support_count"], 6)
        self.assertEqual(evidence["excluded_night_count"], 1)
        self.assertNotIn("2026-01-08", [night["date"] for night in evidence["nights"]])
        self.assertEqual(evidence["roster_glucose_mean"], 113.5)
        lead_only = next(
            night for night in evidence["nights"] if night["date"] == "2026-01-07"
        )
        self.assertIsNone(lead_only["glucose_mean"])
        self.assertEqual(lead_only["glucose_entry"], 117.0)
        self.assertIsNone(lead_only["glucose_exit"])
        self.assertEqual(lead_only["glucose_trace"][0], {
            "t": "2026-01-06 23:00:00", "minute": -60.0, "bg": 117,
        })
        self.assertEqual(lead_only["glucose_trace"][-1], {
            "t": "2026-01-06 23:55:00", "minute": -5.0, "bg": 117,
        })

    def test_serves_the_analyzer_excluded_night_reasons(self):
        analysis = self.client.get("/api/analyze", params={"window": 30, "pool": True})
        response = self.client.get("/api/diagnose/basal-night-evidence", params={"slot": 0})

        self.assertEqual(response.status_code, 200)
        served = response.json()["excluded_night_reasons"]
        self.assertEqual(served, analysis.json()["basal"][0]["evidence"]["excluded_night_reasons"])
        # The fixture's one excluded night is the bolused 2026-01-08.
        self.assertEqual(served, {
            "before_current_setting": 0, "below_range_or_suspended": 0,
            "above_range": 0, "insulin_acting": 1, "carb_log": 0, "other": 0,
        })

    def test_empty_roster_serves_a_complete_null_glucose_norm(self):
        response = self.client.get(
            "/api/diagnose/basal-night-evidence", params={"slot": 47}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["roster_count"], 0)
        self.assertIsNone(response.json()["roster_glucose_mean"])

    def test_repeat_read_reuses_the_fixed_preparation_and_write_rebuilds_it(self):
        import ciq_autotune.api as api_mod
        from unittest.mock import patch

        real = api_mod.prepare_basal_night_evidence
        calls = []

        def counting(*args, **kwargs):
            calls.append(1)
            return real(*args, **kwargs)

        with patch.object(api_mod, "prepare_basal_night_evidence", counting):
            self.client.get("/api/diagnose/basal-night-evidence", params={"slot": 0})
            self.client.get("/api/diagnose/basal-night-evidence", params={"slot": 0})
            self.assertEqual(len(calls), 1)
            response = self.client.post("/api/carbs", json={
                "t": "2026-01-11 00:00:00", "grams": 8, "certainty": "exact"})
            self.assertEqual(response.status_code, 200)
            self.client.get("/api/diagnose/basal-night-evidence", params={"slot": 0})
            self.assertEqual(len(calls), 2)

    def _epoch_client(self, rates):
        """Build a public API client with an analyzer-detected slot setting epoch."""
        from ciq_autotune.api import create_app

        database = tempfile.NamedTemporaryFile(suffix=".db")
        self.addCleanup(database.close)
        basal, cgm = [], []
        split = len(rates) // 2
        for day, rate in enumerate(rates, 1):
            start = datetime(2026, 3, day)
            duration = 30
            profile = 0.6 if day <= split else 1.0
            basal.append({"seq_num": day, "time": start.isoformat(" "),
                          "delivery_type": "algorithmDelivery", "duration_mins": duration,
                          "basal_rate": rate, "profile_basal_rate": profile})
            cgm.extend({"EventDateTime": (start + timedelta(minutes=minute)).isoformat(),
                        "Readings (CGM / BGM)": 120, "Description": "EGV"}
                       for minute in range(0, duration + 6, 5))
        with Store.open(database.name) as store:
            store.upsert_basal(basal)
            store.upsert_cgm(cgm)
        return TestClient(create_app(db_path=database.name, token=None,
                                    enable_fetch_loop=False))

    def test_endpoint_counts_regime_b_pre_cut_nights_outside_the_roster(self):
        response = self._epoch_client([0.8, 0.8, 0.8, 1.2, 1.2, 1.2]).get(
            "/api/diagnose/basal-night-evidence", params={"slot": 0})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["roster_count"], 3)
        self.assertEqual(response.json()["excluded_night_count"], 3)

    def test_endpoint_names_regime_b_pre_cut_nights_before_the_current_setting(self):
        client = self._epoch_client([0.8, 0.8, 0.8, 1.2, 1.2, 1.2])
        analysis = client.get("/api/analyze", params={"window": 30, "pool": True})
        response = client.get("/api/diagnose/basal-night-evidence", params={"slot": 0})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["excluded_night_reasons"], {
            "before_current_setting": 3, "below_range_or_suspended": 0,
            "above_range": 0, "insulin_acting": 0, "carb_log": 0, "other": 0,
        })
        self.assertEqual(response.json()["excluded_night_reasons"],
                         analysis.json()["basal"][0]["evidence"]["excluded_night_reasons"])


class BasalNightEvidenceAccountingTest(unittest.TestCase):
    """The analyzer's public result retains every omitted source night."""

    @staticmethod
    def _nights(rates):
        basal, cgm = [], []
        for day, rate in enumerate(rates, 1):
            start = datetime(2026, 2, day)
            basal.append(BasalEvent(start, "algorithmDelivery", 30, rate, 0.6))
            cgm.extend(CgmReading(start + timedelta(minutes=minute), 120, "EGV")
                       for minute in range(0, 36, 5))
        return basal, cgm

    def test_mid_slot_epoch_cut_counts_pre_cut_nights_outside_the_roster(self):
        basal, cgm = self._nights([0.8, 0.8, 0.8, 0.8])
        slot = analyze_basal(
            basal, cgm, [], [],
            slot_starts={0: datetime(2026, 2, 4, 0, 15)},
        )[0]
        self.assertEqual([point["date"] for point in slot.evidence["points"]], ["2026-02-04"])
        self.assertEqual(slot.evidence["excluded_night_count"], 3)

    def test_regime_b_post_only_keeps_omitted_pre_cut_nights_accounted(self):
        basal, cgm = self._nights([0.8, 0.8, 0.8, 1.2, 1.2, 1.2])
        slot = analyze_basal(
            basal, cgm, [], [], pool_agreeing_regimes=True,
            slot_starts={0: datetime(2026, 2, 4)},
        )[0]
        self.assertEqual(slot.evidence["pooling"]["pooled"], False)
        self.assertEqual(len(slot.evidence["night_roster"]), 3)
        self.assertEqual(slot.evidence["excluded_night_count"], 3)


class BasalExcludedNightReasonsTest(unittest.TestCase):
    """Every excluded night carries one reason, by the fixed rank order (#434)."""

    def test_six_causes_land_in_six_reasons_and_sum_to_the_count(self):
        basal, cgm, bolus, carbs = _six_cause_nights()
        slot = analyze_basal(basal, cgm, bolus, [], carb_entries=carbs,
                             slot_starts=_SETTING_CUT)[0]

        self.assertEqual(slot.evidence["excluded_night_reasons"], {
            "before_current_setting": 3, "below_range_or_suspended": 1,
            "above_range": 1, "insulin_acting": 1, "carb_log": 1, "other": 1,
        })
        self.assertEqual(slot.evidence["excluded_night_count"], 8)
        self.assertEqual(len(slot.evidence["night_roster"]), 8)

    def test_a_low_minute_outranks_a_high_night(self):
        basal, cgm, bolus, carbs = _six_cause_nights()
        dip = datetime(2026, 2, 13, 0, 10)
        cgm = [CgmReading(r.t, 60, r.type) if r.t == dip else r for r in cgm]
        slot = analyze_basal(basal, cgm, bolus, [], carb_entries=carbs,
                             slot_starts=_SETTING_CUT)[0]

        self.assertEqual(slot.evidence["excluded_night_reasons"], {
            "before_current_setting": 3, "below_range_or_suspended": 2,
            "above_range": 0, "insulin_acting": 1, "carb_log": 1, "other": 1,
        })
        self.assertEqual(slot.evidence["excluded_night_count"], 8)

    def test_pooled_pre_cut_nights_leave_the_setting_reason(self):
        basal, cgm, bolus, carbs = _six_cause_nights()
        slot = analyze_basal(basal, cgm, bolus, [], carb_entries=carbs,
                             slot_starts=_SETTING_CUT, pool_agreeing_regimes=True)[0]

        self.assertEqual(slot.evidence["pooling"], {"pooled": True})
        self.assertEqual(slot.evidence["excluded_night_reasons"], {
            "before_current_setting": 0, "below_range_or_suspended": 1,
            "above_range": 1, "insulin_acting": 1, "carb_log": 1, "other": 1,
        })
        self.assertEqual(slot.evidence["excluded_night_count"], 5)

    def test_a_high_pre_cut_night_is_named_by_whether_pooling_returned_its_era(self):
        basal, cgm, bolus, carbs = _six_cause_nights()
        high = datetime(2026, 2, 3).date()
        cgm = [CgmReading(r.t, 220, r.type) if r.t.date() == high else r for r in cgm]

        unpooled = analyze_basal(basal, cgm, bolus, [], carb_entries=carbs,
                                 slot_starts=_SETTING_CUT)[0]
        pooled = analyze_basal(basal, cgm, bolus, [], carb_entries=carbs,
                               slot_starts=_SETTING_CUT, pool_agreeing_regimes=True)[0]

        self.assertEqual(unpooled.evidence["excluded_night_reasons"], {
            "before_current_setting": 3, "below_range_or_suspended": 1,
            "above_range": 1, "insulin_acting": 1, "carb_log": 1, "other": 1,
        })
        self.assertEqual(unpooled.evidence["excluded_night_count"], 8)
        self.assertEqual(pooled.evidence["pooling"], {"pooled": True})
        self.assertEqual(pooled.evidence["excluded_night_reasons"], {
            "before_current_setting": 0, "below_range_or_suspended": 1,
            "above_range": 2, "insulin_acting": 1, "carb_log": 1, "other": 1,
        })
        self.assertEqual(pooled.evidence["excluded_night_count"], 6)
