"""Per-parameter post-change "settling" state (#95).

After a confirmed change a parameter enters a *settling* state: its ``Epoch.start``
is recent and its post-change data hasn't yet cleared its analyzer's own
sufficiency gate, so Review must *replace* the (untrustworthy, revert-happy)
recommendation with the settling state instead. Three things are proved here:

1. ``describe_gate()`` on each config returns a structured descriptor built by
   interpolating that config's *own* constants — change a constant, the text
   changes (so it can never drift from the gate);
2. ``analyze()`` detects settling per parameter off ``Epoch.start`` + post-change
   progress vs. the gate, and reports it in a ``settling`` block;
3. the settling block is JSON-serializable and its ``have`` never reaches
   ``needed`` while settling (the countdown is honest).
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyze import analyze
from ciq_autotune.analyzers.ic import IcConfig
from ciq_autotune.analyzers.isf import IsfConfig
from ciq_autotune.model import ModelConfig
from ciq_autotune.rest_window import RestWindowConfig
from ciq_autotune.settings import parse_pump_settings
from ciq_autotune.store import Store


def _raw_settings(isf=30, cr_mu=6000, basal_mu=600):
    pad = [{"startTime": 0, "basalRate": 0, "isf": 0, "carbRatio": 0, "targetBg": 0}] * 15
    return {"profiles": {"activeIdp": 4, "profile": [
        {"name": "4", "idp": 4, "insulinDuration": 300, "carbEntry": 1, "maxBolus": 15000,
         "tDependentSegs": [{"startTime": 0, "basalRate": basal_mu, "isf": isf,
                             "carbRatio": cr_mu, "targetBg": 110}] + pad}]},
            "cgmSettings": {}}


class DescribeGateInterpolationTest(unittest.TestCase):
    """The explanatory text is code-driven: a constant change moves the descriptor."""

    def test_basal_gate_interpolates_model_config(self):
        gate = ModelConfig().describe_gate()
        self.assertEqual(gate["unit"], "clean days")
        self.assertEqual(gate["needed"], ModelConfig().high_min_days)
        self.assertFalse(gate["soft"])
        # A stricter day count changes the descriptor — proves no hand-typed number.
        strict = ModelConfig(high_min_days=9).describe_gate()
        self.assertEqual(strict["needed"], 9)
        self.assertIn("9 distinct clean days", " ".join(strict["criteria"]))
        self.assertNotEqual(gate["needed"], strict["needed"])

    def test_ic_gate_interpolates_ic_config(self):
        gate = IcConfig().describe_gate()
        self.assertEqual(gate["unit"], "meal runs")
        self.assertEqual(gate["needed"], IcConfig().min_runs)
        crit = " ".join(gate["criteria"])
        self.assertIn("10 g carbs", crit)       # min_carbs
        self.assertIn("0.3 U bolus", crit)       # min_meal_dose_u
        self.assertIn("5 h", crit)               # post_meal_min / 60
        # Change the constants → the criteria strings track them.
        moved = IcConfig(min_carbs=25.0, min_meal_dose_u=0.5,
                         min_runs=5, post_meal_min=360).describe_gate()
        self.assertEqual(moved["needed"], 5)
        mcrit = " ".join(moved["criteria"])
        self.assertIn("25 g carbs", mcrit)
        self.assertIn("0.5 U bolus", mcrit)
        self.assertIn("6 h", mcrit)

    def test_isf_gate_is_soft_no_number(self):
        gate = IsfConfig().describe_gate()
        self.assertTrue(gate["soft"])
        self.assertIsNone(gate["unit"])
        self.assertIsNone(gate["needed"])       # no fabricated countdown
        crit = " ".join(gate["criteria"])
        self.assertIn("22:00–08:00", crit)       # default rest-window envelope
        # Carb-bearing boluses keep the flat ~DIA lookback (excursion guard, #169),
        # so the "N h" interpolates again; the Carb-log half is grams-scaled COB.
        self.assertIn("5 h", crit)               # carb_lookback_min / 60
        self.assertIn("still on board", crit)    # the grams-scaled Carb-log half
        moved = IsfConfig(
            rest_window=RestWindowConfig(env_start_min=1380, env_end_min=420),  # 23:00–07:00
            carb_lookback_min=360).describe_gate()
        mcrit = " ".join(moved["criteria"])
        self.assertIn("23:00–07:00", mcrit)
        self.assertIn("6 h", mcrit)


def _settling_store():
    """A store where every tunable parameter changed a couple of days ago and has
    only sparse post-change data — so each analyzer is still below its gate."""
    store = Store.open(":memory:")
    basal, cgm, bolus = [], [], []
    # Days 1-5: OLD basal (0.6 U/h programmed). Days 6-7: a fresh basal edit to
    # 0.9 U/h programmed — a recent per-slot change with only ~2 post-change days.
    for d in range(1, 8):
        prog_mu = 600 if d <= 5 else 900
        t0 = datetime(2026, 6, d, 0, 0, 0)
        for k in range(288):  # full day of 5-min samples
            tt = t0 + timedelta(minutes=5 * k)
            basal.append({"seq_num": int(tt.strftime("%Y%m%d%H%M%S")), "time": tt.strftime("%Y-%m-%d %H:%M:%S"),
                          "delivery_type": "algorithmDelivery", "duration_mins": 5,
                          "basal_rate": 0.8, "profile_basal_rate": prog_mu / 1000.0})
            # CGM only outside the fasting window (06:00+), so ISF finds no clean
            # fasting steps and produces no estimate — the soft "collecting" gate.
            if tt.hour >= 6:
                cgm.append({"EventDateTime": tt.strftime("%Y-%m-%dT%H:%M:%S"),
                            "Readings (CGM / BGM)": 120, "Description": "EGV"})
    store.upsert_basal(basal)
    store.upsert_cgm(cgm)
    # Two settings snapshots differing in ISF and I:C → a recent ISF and I:C epoch.
    store.upsert_settings_snapshot(
        "2026-06-05 09:00:00", parse_pump_settings(_raw_settings(isf=50, cr_mu=6000)))
    store.upsert_settings_snapshot(
        "2026-06-06 09:00:00", parse_pump_settings(_raw_settings(isf=30, cr_mu=9000)))
    # One isolated qualifying meal after the change — below IcConfig.min_meals.
    bolus.append({"seq_num": 1, "request_time": "2026-06-07 12:00:00",
                  "description": "Standard",
                  "completion": "Completed", "insulin": "4.0", "carbs": "40.0"})
    store.upsert_bolus(bolus)
    return store


class SettlingDetectionTest(unittest.TestCase):
    def setUp(self):
        self.store = _settling_store()
        self.result = analyze(self.store, window_days=30,
                              now=datetime(2026, 6, 8, 0, 0, 0))
        self.by_param = {s.parameter: s for s in self.result.settling}

    def tearDown(self):
        self.store.close()

    def test_basal_settling_counts_clean_days_since_change(self):
        s = self.by_param.get("basal_rate")
        self.assertIsNotNone(s, "basal should be settling after a recent edit")
        self.assertEqual(s.gate["unit"], "clean days")
        self.assertEqual(s.gate["needed"], ModelConfig().high_min_days)
        # Only ~2 post-change days exist, below the gate.
        self.assertIsNotNone(s.have)
        self.assertLess(s.have, s.gate["needed"])
        self.assertIsNotNone(s.since)

    def test_ic_settling_counts_closed_meal_runs(self):
        s = self.by_param.get("carb_ratio")
        self.assertIsNotNone(s, "I:C should be settling after a recent change")
        self.assertEqual(s.gate["unit"], "meal runs")
        self.assertEqual(s.gate["needed"], IcConfig().min_runs)
        self.assertLess(s.have, s.gate["needed"])   # 1 run < 3

    def test_isf_settling_is_soft_with_no_number(self):
        s = self.by_param.get("isf")
        self.assertIsNotNone(s, "ISF should be settling after a recent change")
        self.assertTrue(s.gate["soft"])
        self.assertIsNone(s.have)                    # no fabricated countdown
        self.assertIsNone(s.gate["needed"])

    def test_settling_block_is_json_serializable(self):
        import json
        json.dumps(self.result.to_dict()["settling"])
        self.assertTrue(self.result.to_dict()["settling"])

    def test_preview_mode_clears_settling(self):
        """ignore_setting_changes nulls the epochs, so preview reveals the
        recommendation instead of the settling state (the manual override)."""
        preview = analyze(self.store, window_days=30,
                          now=datetime(2026, 6, 8, 0, 0, 0),
                          ignore_setting_changes=True)
        self.assertEqual(preview.settling, [])


class NoSettlingWhenStableTest(unittest.TestCase):
    def test_no_change_no_settling(self):
        """A store with no recent parameter change reports no settling states."""
        store = Store.open(":memory:")
        basal, cgm = [], []
        for d in range(1, 15):
            t0 = datetime(2026, 6, d, 0, 0, 0)
            for k in range(288):
                tt = t0 + timedelta(minutes=5 * k)
                basal.append({"seq_num": int(tt.strftime("%Y%m%d%H%M%S")), "time": tt.strftime("%Y-%m-%d %H:%M:%S"),
                              "delivery_type": "algorithmDelivery", "duration_mins": 5,
                              "basal_rate": 0.8, "profile_basal_rate": 0.6})
                cgm.append({"EventDateTime": tt.strftime("%Y-%m-%dT%H:%M:%S"),
                            "Readings (CGM / BGM)": 120, "Description": "EGV"})
        store.upsert_basal(basal)
        store.upsert_cgm(cgm)
        store.upsert_settings_snapshot(
            "2026-06-14 09:00:00", parse_pump_settings(_raw_settings()))
        result = analyze(store, window_days=30, now=datetime(2026, 6, 15, 0, 0, 0))
        self.assertEqual([s.parameter for s in result.settling
                          if s.parameter == "basal_rate"], [])
        store.close()


if __name__ == "__main__":
    unittest.main()
