"""Each meal's glucose miss converts with its own ISF, never the estimate (ADR 563).

Two stores carry the same meals, bolus stamps, printed lows and meal-window basal,
and differ only in their fasting nights: one lane answers the insulin that acted
overnight, the other is a flat wall, so the ISF analyzer serves a real fasting
estimate for the first and zero for the second. Neither the carb-ratio result nor
the scenario engine's carb-undercount attribution may move with that estimate, and
the zero must not switch the glucose term off.
"""

import hashlib
import json
import tempfile
import unittest
from dataclasses import asdict
from datetime import datetime, timedelta

from ciq_autotune.analyze import analyze
from ciq_autotune.analyzers.scenario_config import ScenarioConfig
from ciq_autotune.explore_exposures import build_exposures
from ciq_autotune.follow_up_comparison import capture_comparison_context, compare_follow_up
from ciq_autotune.settings import ProfileSegment, PumpSettings
from ciq_autotune.store import Store

from scripts.qa_e2e_cases import QA_CASES, WINDOW_DAYS, execute_case, materialize_case
from tests.test_follow_up_store import trial as stored_trial
from tests.test_trial_evidence import NOW, SWITCH, _profile


_CASE = next(case for case in QA_CASES if case.name == "behavioral-carb-counting")


def _served(*, responded_nights: bool) -> tuple[dict, dict]:
    """The pair's served analysis and exposures."""
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        with Store.open(database.name) as store:
            if responded_nights:
                materialize_case(store, _CASE)
            else:
                # The recipe alone: its lane nights stay the flat 120 mg/dL wall
                # `materialize_case` would otherwise make answer the acted insulin.
                _CASE.recipe(store)
        with Store.open_readonly(database.name) as store:
            analysis = analyze(
                store, window_days=WINDOW_DAYS,
                carb_entries=store.carb_entries(),
                prompt_responses=store.prompt_responses(),
            ).to_dict()
            return analysis, build_exposures(store, window_days=WINDOW_DAYS)


def _carb_undercount_verdicts(exposures: dict) -> dict:
    """Each served meal's carb-undercount verdict: its match, tier and silence."""
    return {
        occurrence["t"]: (verdict["matched"], verdict["evidence_tier"], verdict["silence_reason"])
        for occurrence in exposures["exposures"]["meals"]["occurrences"]
        for verdict in occurrence["verdicts"]
        if verdict["classifier"] == "carb_undercount"
    }


class DoseStampedIsfConversionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.measured, cls.measured_exposures = _served(responded_nights=True)
        cls.flat, cls.flat_exposures = _served(responded_nights=False)

    def test_the_two_stores_serve_different_fasting_estimates_one_zero(self):
        measured = self.measured["isf"][0]["estimate"]["value"]
        flat = self.flat["isf"][0]["estimate"]["value"]
        self.assertIsNotNone(measured)
        self.assertNotEqual(measured, 0.0)
        self.assertEqual(flat, 0.0)

    def test_carb_ratio_rows_and_blocks_do_not_move_with_the_fasting_estimate(self):
        self.assertEqual(self.measured["ic"], self.flat["ic"])
        self.assertEqual(self.measured["ic_blocks"], self.flat["ic_blocks"])

    def test_carb_undercount_attribution_does_not_move_with_the_fasting_estimate(self):
        measured = _carb_undercount_verdicts(self.measured_exposures)
        flat = _carb_undercount_verdicts(self.flat_exposures)
        judged = [t for t, (_, tier, _) in measured.items() if tier != "not_in_data"]
        self.assertTrue(judged, "no meal's carb count was judged")
        self.assertEqual(measured, flat)

    def test_every_meal_with_a_readable_outcome_carries_its_travel_in_units(self):
        for analysis in (self.measured, self.flat):
            points = [point for row in analysis["ic"]
                      for point in (row.get("evidence") or {}).get("points", [])]
            runs = [run for block in analysis["ic_blocks"]
                    for run in block["evidence"]["runs"]]
            read = [row for row in points + runs if row["outcome_bg"] is not None]
            self.assertTrue(read, "no meal read its full-DIA outcome")
            for row in read:
                with self.subTest(t=row["t"]):
                    self.assertIsNotNone(row["bg_outcome_u"])


def _served_runs(case_name: str) -> dict:
    case = next(case for case in QA_CASES if case.name == case_name)
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        with Store.open(database.name) as store:
            materialize_case(store, case)
        with Store.open_readonly(database.name) as store:
            analysis = execute_case(store, case).analysis
    return {run["t"]: run for block in analysis["ic_blocks"]
            for run in block["evidence"]["runs"]}


class EachRunConvertsWithItsOwnIsfTest(unittest.TestCase):
    """The `ic-dose-stamped-isf` QA case: every meal travels 60 mg/dL to its read.

    Its schedule programs ISF 30 before noon and 60 after; a second capture on
    day 50 strengthens the morning to 40, and the morning stamps follow it.
    """

    @classmethod
    def setUpClass(cls):
        cls.runs = _served_runs("ic-dose-stamped-isf")

    def assert_converted(self, days, hour, units):
        for day in days:
            run = self.runs[f"2024-{day}T{hour:02d}:00:00"]
            with self.subTest(day=day, hour=hour):
                self.assertEqual(run["outcome_bg"], 180.0)
                self.assertEqual(run["bg_outcome_u"], units)

    def test_each_meal_converts_with_the_isf_stamped_on_its_bolus(self):
        self.assert_converted(("03-13", "03-15", "03-17", "03-19", "03-21", "03-23"), 9, 2.0)
        self.assert_converted(("04-22", "04-24", "04-26", "04-28", "04-30", "05-02"), 9, 1.5)
        self.assert_converted(("03-13", "03-15", "03-17", "03-19", "03-21", "03-23",
                               "04-22", "04-24", "04-26", "04-28", "04-30"), 18, 1.0)

    def test_an_unstamped_meal_converts_with_its_segment_as_of_its_time(self):
        # Before the day-50 capture, the morning segment it programs (40) is ignored.
        self.assert_converted(("03-25", "03-27", "03-29"), 9, 2.0)
        self.assert_converted(("03-25", "03-27", "03-29"), 18, 1.0)
        self.assert_converted(("05-04", "05-06", "05-08"), 9, 1.5)

    def test_an_unstamped_meal_before_every_capture_is_not_converted(self):
        for day in ("03-04", "03-06", "03-08"):
            run = self.runs[f"2024-{day}T09:00:00"]
            with self.subTest(day=day):
                self.assertEqual(run["outcome_bg"], 180.0)
                self.assertIsNone(run["bg_outcome_u"])
                self.assertFalse(run["in_pool"])


def _seed_stamps_disagree_with_the_programmed_isf(path):
    """A midday I:C Trial and a carb-undercount Focus, both changed at ``SWITCH``.

    Every segment programs ISF 40, and every bolus stamps 80, so a comparison that
    converts with the retained programmed value and one that converts with the
    stamps disagree. Each day carries a 07:00 meal that runs away to 260 mg/dL (a
    carb undercount at 40, not at 80) and a 13:00 meal in the changed block that
    settles 30 mg/dL above its start five hours later.
    """
    segments = lambda ic: (ProfileSegment(0, 0.6, 40, 5.0, 110),      # noqa: E731
                           ProfileSegment(720, 0.6, 40, ic, 110),
                           ProfileSegment(900, 0.6, 40, 5.0, 110))
    old, new = _profile(1, segments(5.0)), _profile(2, segments(4.4))
    with Store.open(path) as store:
        store.upsert_settings_snapshot("2026-06-04 09:00:00", PumpSettings(1, (old, new)))
        store.upsert_settings_snapshot(SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(2, (old, new)))
        store.save_plan_draft([{
            "type": "ic", "start_min": 720, "value": 4.4, "current": 5.0,
            "ic_block_provenance": {"block_start_min": 720, "block_end_min": 900,
                                    "block_member_start_mins": [720]},
        }], "2026-06-04 09:00:00")
        store.apply_plan("2026-06-04 09:00:00")
        store.upsert_basal([{
            "seq_num": 201, "time": "2026-06-06 00:00:00",
            "delivery_type": "profileDelivery", "duration_mins": 5,
            "basal_rate": 0.6, "profile_basal_rate": 0.6,
        }])
        readings, t = [], SWITCH - timedelta(days=14)
        while t < NOW:
            value = 260 if 8 <= t.hour < 10 else 150 if 17 <= t.hour < 19 else 120
            readings.append({"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                             "Readings (CGM / BGM)": value, "Description": "EGV"})
            t += timedelta(minutes=5)
        store.upsert_cgm(readings)
        boluses = []
        for seq_base, days in ((1000, [SWITCH.date() - timedelta(days=d) for d in range(1, 5)]),
                               (2000, [SWITCH.date() + timedelta(days=d) for d in range(1, 5)])):
            for i, day in enumerate(days):
                for j, hour in enumerate((7, 13)):
                    at = datetime.combine(day, datetime.min.time()) + timedelta(hours=hour)
                    stamp = at.strftime("%Y-%m-%d %H:%M:%S")
                    boluses.append({
                        "seq_num": seq_base + i * 10 + j, "request_time": stamp,
                        "completion_time": stamp, "description": "Bolus",
                        "completion": "Completed", "insulin": 4.0,
                        "carbs": 20.0 if hour == 7 else 45.0, "isf": 80,
                        # The block's after-change meals stamp its new ratio.
                        "carb_ratio": 4.4 if (seq_base, hour) == (2000, 13) else 5.0,
                        "target_bg": 110,
                    })
        store.upsert_bolus(boluses)


# A context as the capture before ADR 563 retained it over this store at SWITCH:
# the active profile's median programmed ISF. Its configuration is the scenario
# configuration a retained Focus must still execute (ADR 462), not the fact under test.
_RETAINED_CONTEXT = {
    "version": "386:1", "state": "available", "reason": None,
    "captured_at": "2026-06-05 09:00:00", "input_revision": 1,
    "policy": "340:1/386:1/387:1", "configuration": asdict(ScenarioConfig()),
    "programmed_isf": {"value": 40.0, "unit": "mg/dL/U"},
    "source_snapshot": {"captured_at": "2026-06-05 09:00:00", "active_idp": 2},
    "id": "e941f834c8aaa6435d28b4771958e235de492407bd06b7f2622964242e14350e",
}

# Copied from a run on the base commit (0cd6b642) over this store: the SHA-256 of
# each record's served comparison as sorted JSON, and the values the ISF reaches.
_BEFORE_DIGEST = {
    "trial": "79734985c3877fd78d21bab03385bcbce69caeb6b18cf9995573575c186390e3",
    "focus": "04d8aa5d456d15d175b0625cb01f4e0b5c45fbbfc5998ca8830a4ef2044b2d5e",
}
_BEFORE_RUN_UNITS = [0.75, 0.75, 0.75, 0.75]       # 30 mg/dL at the retained 40
_BEFORE_UNDERCOUNTS = (4, 4)                        # the 07:00 runaways, of 8 meals per arm


def _records(context):
    trial = {"kind": "trial", "id": "synthetic", "parameter": "carb_ratio", "slot": "12:00",
             "block": [720, 900], "members": [720], "detected_at": str(SWITCH),
             "before": 5.0, "after": 4.4, "comparison_context": context}
    focus = {"kind": "focus", "id": 1, "lever": "carb_undercount", "pinned_at": str(SWITCH),
             "status": "active", "ending": None, "comparison_context": context}
    return {"trial": trial, "focus": focus}


def _digest(comparison) -> str:
    return hashlib.sha256(json.dumps(comparison, sort_keys=True, default=str).encode()).hexdigest()


def _run_units(comparison):
    return [run["bg_outcome_u"] for run in comparison["readiness"]["after"]["runs"]]


def _undercounts(comparison):
    return tuple(comparison["adherence"][arm]["numerator"] for arm in ("before", "after"))


class RetainedComparisonKeepsItsIsfTest(unittest.TestCase):
    """ADR 563 rule 5, over a store whose stamps disagree with the retained value."""

    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.path = f"{cls.directory.name}/synthetic.sqlite"
        _seed_stamps_disagree_with_the_programmed_isf(cls.path)
        with Store.open_readonly(cls.path) as store:
            cls.captured = capture_comparison_context(store, at=SWITCH, input_revision=1)
            cls.retained = cls.compare(store, _records(_RETAINED_CONTEXT))
            cls.dose_stamped = cls.compare(store, _records(cls.captured))

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    @staticmethod
    def compare(store, records):
        return {kind: compare_follow_up(store, record=record, data_cutoff=NOW,
                                        input_revision=2)["comparison"]
                for kind, record in records.items()}

    def test_a_retained_comparison_serves_what_it_served_before(self):
        for kind in ("trial", "focus"):
            with self.subTest(kind=kind):
                comparison = self.retained[kind]
                self.assertEqual(comparison["availability"], {"state": "available", "reason": None})
                self.assertEqual(_digest(comparison), _BEFORE_DIGEST[kind])
        self.assertEqual(_run_units(self.retained["trial"]), _BEFORE_RUN_UNITS)
        self.assertEqual(_undercounts(self.retained["focus"]), _BEFORE_UNDERCOUNTS)

    def test_a_new_capture_records_the_dose_stamped_source_and_no_value(self):
        self.assertEqual(self.captured["isf_source"], "dose_stamped")
        self.assertNotIn("programmed_isf", self.captured)
        self.assertEqual(self.captured["state"], "available")

    def test_a_new_capture_converts_with_the_stamps(self):
        # 30 mg/dL at the stamped 80, not the retained or median 40; and at 80 no
        # 07:00 runaway implies enough carbs to read as an undercount.
        for kind in ("trial", "focus"):
            with self.subTest(kind=kind):
                comparison = self.dose_stamped[kind]
                self.assertEqual(comparison["availability"], {"state": "available", "reason": None})
                self.assertNotEqual(_digest(comparison), _BEFORE_DIGEST[kind])
        self.assertEqual(_run_units(self.dose_stamped["trial"]), [0.375, 0.375, 0.375, 0.375])
        self.assertEqual(_undercounts(self.dose_stamped["focus"]), (0, 0))

    def test_the_store_accepts_a_new_capture(self):
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                record = {**stored_trial(), "comparison_context": self.captured}
                with store.follow_up_transaction():
                    saved = store.save_follow_up_record(record)
                self.assertEqual(saved["comparison_context"], self.captured)


if __name__ == "__main__":
    unittest.main()
