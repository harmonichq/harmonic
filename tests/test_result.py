"""AnalysisResult schema tests (F3).

The result object is the contract a frontend builds on; transport is secondary.
So the load-bearing test is that it serializes to plain JSON with a schema
version and the nested estimates intact.
"""

import json
from dataclasses import replace
import unittest
from datetime import datetime

from ciq_autotune.result import (
    SCHEMA_VERSION,
    AnalysisResult,
    ConsolidatedProfile,
    ProfileSegment,
    DataQuality,
    EpochInfo,
    Finding,
    IcHistory,
    IcHistoryRunRecord,
    Occurrence,
    SegmentEstimate,
    SlotEstimate,
    Span,
    TuningLever,
)
from ciq_autotune.safety import Status
from ciq_autotune.uncertainty import Confidence, Estimate


def _minimal_result():
    est = Estimate(value=0.6, lo=0.55, hi=0.65, n=40, confidence=0.8, method="bootstrap-median")
    return AnalysisResult(
        schema_version=SCHEMA_VERSION,
        generated_at="2026-06-29 14:00:00",
        window_days=30,
        span=Span(start="2026-05-30 00:00:00", end="2026-06-29 13:00:00"),
        epochs=[EpochInfo(parameter="basal_rate", start="2026-06-29 08:30:00",
                          unverified_before=None, effective_days=0.2)],
        data_quality=DataQuality(counts={"cgm_readings": 2169}, notes=["thin basal epoch"]),
        basal=[SlotEstimate(slot=0, label="00:00", current=0.6, estimate=est,
                            recommended=0.6, annotation="no change", days=3)],
        isf=[SegmentEstimate(start_min=0, label="Fasting", parameter="isf", current=36.0,
                             estimate=Estimate(35.0, 30.0, 41.0, 12, 0.8, "bootstrap-ols-isf"),
                             recommended=None,
                             annotation="fasting data confirms your programmed ISF",
                             evidence={"n_steps": 12})],
        ic=[],
        behavioral=[Finding(detector="not-pre-bolusing", severity="medium",
                            summary="Boluses land after the meal spike.", evidence={"share": 0.4},
                            occurrences=[Occurrence(t=datetime(2026, 6, 12, 14, 32, 0),
                                                    detail="glucose rising 1.8 mg/dL/min before bolus")])],
        disclaimer="Advisory only — not medical advice.",
    )


class ResultSerializationTest(unittest.TestCase):
    def test_round_trips_through_json(self):
        d = _minimal_result().to_dict()
        s = json.dumps(d)               # must not raise — proves it's plain data
        back = json.loads(s)
        self.assertEqual(back["schema_version"], SCHEMA_VERSION)

    def test_populated_ic_blocks_round_trip_with_every_decision_field(self):
        # An empty list round-trips trivially; the contract that matters is a real
        # block, because the client branches on `state`, ranks on `priority`, keys
        # dispositions on `block_id` + `current_values`, and stages
        # `member_start_mins`. A field lost in serialization is a silent behaviour
        # change on the surface, not a schema nicety.
        from ciq_autotune.result import IcBlock

        block = IcBlock(
            block_id=420, start_min=420, end_min=660, label="Morning",
            member_start_mins=[420, 570], current_values=[4.0],
            estimate=Estimate(value=3.4, lo=3.1, hi=3.8, n=18, confidence=0.8,
                              method="bootstrap-pooled-ratio-clustered"),
            recommended=3.7, n_runs=18, n_meals=41, state="numeric",
            asserts_move=True, annotation="meals are under-covered",
            impact_u_day=2.4, priority=52, recurrence=0.55,
            recurrence_channel={"kind": "ic_runs", "k": 14, "n": 18},
            harm={"arm_days": 0, "row_days": 0},
            regime={"full": {"value": 3.4}, "on_regime": {"value": 3.5},
                    "straddles_programmed": False},
            evidence={"eligibility": {"runs_floor": 8}},
        )
        result = replace(_minimal_result(), ic_blocks=[block], ic_runs=53)
        back = json.loads(json.dumps(result.to_dict()))

        self.assertEqual(back["ic_runs"], 53)
        got = back["ic_blocks"][0]
        self.assertEqual(got["block_id"], 420)
        self.assertEqual(got["member_start_mins"], [420, 570])
        self.assertEqual(got["current_values"], [4.0])
        self.assertEqual(got["recommended"], 3.7)
        self.assertEqual(got["state"], "numeric")
        self.assertIs(got["asserts_move"], True)
        self.assertEqual(got["direction"], "lower")
        self.assertEqual((got["n_runs"], got["n_meals"]), (18, 41))
        self.assertEqual(got["priority"], 52)
        self.assertEqual(got["impact_u_day"], 2.4)
        self.assertEqual(got["recurrence_channel"]["kind"], "ic_runs")
        self.assertEqual(got["regime"]["straddles_programmed"], False)
        self.assertEqual(got["estimate"]["value"], 3.4)
        self.assertEqual(got["evidence"]["eligibility"]["runs_floor"], 8)
        # An asserting block emits the run age when the analyzer supplies it.
        self.assertNotIn("days_observed", got)

    def test_ic_history_round_trips_as_measurement_only(self):
        row = IcHistory(
            history_id="ich1_example", block_start_min=420, block_end_min=720,
            label="Morning", past_setting=6.0, programmed_now=5.0,
            estimate=Estimate(5.6, 5.2, 5.9, 4, 0.8,
                              "bootstrap-pooled-ratio-clustered"),
            support=4,
            annotation=("When Carb ratio was 6 g/U, 4 meal runs measured 5.6 g/U "
                        "(CI 5.2–5.9). Past setting. No change suggested."),
            lifecycle="active", regime_end="2026-05-01T09:00:00",
            runs=[IcHistoryRunRecord(
                run_id="icr1_example", first_member_at="2026-04-01T08:00:00",
                last_member_at="2026-04-01T10:00:00",
                member_offsets_min=[0.0, 120.0], cgm_start_min=-10.0,
                cgm_end_min=435.0, outcome_min=420.0,
            )],
        )
        got = json.loads(json.dumps(
            replace(_minimal_result(), ic_history=[row]).to_dict()))["ic_history"][0]

        self.assertEqual(got["id"], "ich1_example")
        self.assertEqual(got["estimate"]["value"], 5.6)
        self.assertEqual(
            got["annotation"],
            "When Carb ratio was 6 g/U, 4 meal runs measured 5.6 g/U "
            "(CI 5.2–5.9). Past setting. No change suggested.",
        )
        self.assertEqual(got["runs"][0]["member_offsets_min"], [0.0, 120.0])
        for forbidden in ("recommended", "direction", "lean", "priority",
                          "asserts_move", "plan"):
            self.assertNotIn(forbidden, got)

    def test_a_collecting_block_carries_its_day_countdown(self):
        from ciq_autotune.result import IcBlock

        block = IcBlock(
            block_id=0, start_min=0, end_min=1440, label="All day",
            member_start_mins=[0], current_values=[5.1],
            estimate=Estimate(value=None, lo=None, hi=None, n=0, confidence=0.8,
                              method="none"),
            recommended=None, n_runs=1, n_meals=4, state="collecting",
            asserts_move=False, annotation="not enough meals yet",
            days_observed=34, days_needed=90)
        got = json.loads(json.dumps(
            replace(_minimal_result(), ic_blocks=[block]).to_dict()))["ic_blocks"][0]
        self.assertEqual((got["days_observed"], got["days_needed"]), (34, 90))

    def test_nested_estimate_is_serialized(self):
        d = _minimal_result().to_dict()
        slot0 = d["basal"][0]
        self.assertEqual(slot0["estimate"]["value"], 0.6)
        self.assertIn("wide", slot0["estimate"])
        self.assertEqual(slot0["current"], 0.6)

    def test_sections_present(self):
        d = _minimal_result().to_dict()
        for key in ("span", "epochs", "data_quality", "basal", "isf", "ic",
                    "behavioral", "disclaimer", "window_days"):
            self.assertIn(key, d)

    def test_to_json_is_a_string(self):
        s = _minimal_result().to_json()
        self.assertIsInstance(s, str)
        self.assertEqual(json.loads(s)["schema_version"], SCHEMA_VERSION)

    def test_finding_serializes_with_evidence(self):
        d = _minimal_result().to_dict()
        f = d["behavioral"][0]
        self.assertEqual(f["detector"], "not-pre-bolusing")
        self.assertEqual(f["evidence"]["share"], 0.4)

    def test_finding_without_confidence_serializes_null(self):
        d = _minimal_result().to_dict()
        self.assertIsNone(d["behavioral"][0]["confidence"])

    def test_slot_estimate_serializes_asserts_move(self):
        est = Estimate(value=0.6, lo=0.55, hi=0.65, n=40, confidence=0.8, method="bootstrap-median")
        actionable = SlotEstimate(slot=0, label="00:00", current=0.6, estimate=est,
                                   recommended=0.75, annotation="raise", days=21,
                                   status=Status.RAISE)
        held = SlotEstimate(slot=1, label="00:30", current=0.6, estimate=est,
                             recommended=0.48, annotation="thin trim", days=3,
                             status=Status.INSUFFICIENT)
        self.assertTrue(actionable.to_dict()["asserts_move"])
        self.assertEqual(actionable.to_dict()["direction"], "raise")
        self.assertFalse(held.to_dict()["asserts_move"])
        self.assertIsNone(held.to_dict()["direction"])

    def test_every_actionable_slot_status_has_an_explicit_direction(self):
        est = Estimate(value=0.6, lo=0.55, hi=0.65, n=40, confidence=0.8,
                       method="bootstrap-median")
        expected = {
            Status.RAISE: "raise",
            Status.CAPPED_RAISE: "raise",
            Status.LOWER: "lower",
            Status.CAPPED_LOWER: "lower",
            Status.HARM_LOWER: "lower",
        }
        for status, direction in expected.items():
            with self.subTest(status=status):
                slot = SlotEstimate(
                    slot=0, label="00:00", current=0.6, estimate=est,
                    recommended=0.7, annotation="", days=21, status=status)
                self.assertEqual(slot.to_dict()["direction"], direction)

    def test_slot_estimate_serializes_safety_status(self):
        est = Estimate(value=0.6, lo=0.55, hi=0.65, n=40, confidence=0.8, method="bootstrap-median")
        gated = SlotEstimate(slot=0, label="00:00", current=0.6, estimate=est,
                             recommended=0.6, annotation="held", days=21,
                             status=Status.HARM_GATED)
        legacy = SlotEstimate(slot=1, label="00:30", current=0.6, estimate=est,
                              recommended=None, annotation="", days=0)
        self.assertEqual(gated.to_dict()["safety_status"], "held (recurring-low gate)")
        self.assertIsNone(legacy.to_dict()["safety_status"])

    def test_tuning_levers_default_empty_and_serialize(self):
        d = _minimal_result().to_dict()
        self.assertEqual(d["tuning_levers"], [])
        self.assertEqual(d["priority_active_threshold"], 30)

    def test_tuning_lever_serializes_priority_and_factors(self):
        lever = TuningLever(parameter="basal_rate", title="Basal profile",
                            impact=0.5, recurrence=0.5, priority=50, impact_u_day=0.5)
        d = lever.to_dict()
        self.assertEqual(
            set(d), {"parameter", "title", "impact", "recurrence", "priority", "impact_u_day"}
        )
        self.assertEqual(d["priority"], 50)
        self.assertEqual(d["parameter"], "basal_rate")

    def test_tuning_lever_serializes_selected_segment_identity(self):
        # #428: an I:C Lever names the exact segment (`start_min`) that earned its score so
        # the frontend renders that row instead of re-selecting one by raw divergence.
        lever = TuningLever(parameter="carb_ratio", title="Carb ratio (I:C)",
                            impact=1.0, recurrence=0.29, priority=54, impact_u_day=2.99,
                            headline_start_min=12 * 60)
        d = lever.to_dict()
        self.assertEqual(d["headline_start_min"], 12 * 60)
        # A Lever with no per-segment headline (basal/ISF, legacy payloads) omits the key.
        legacy = TuningLever(parameter="basal_rate", title="Basal profile",
                             impact=0.5, recurrence=0.5, priority=50, impact_u_day=0.5)
        self.assertNotIn("headline_start_min", legacy.to_dict())

    def test_finding_with_confidence_carries_structured_object(self):
        f = Finding(detector="not-pre-bolusing", severity="high",
                    summary="x", confidence=Confidence(n=200, k=100, effect=1.0))
        c = f.to_dict()["confidence"]
        self.assertEqual(
            set(c),
            {"rate", "lo", "hi", "n", "k", "effect", "score", "wide", "confidence"},
        )
        self.assertEqual(c["n"], 200)
        self.assertEqual(f.to_dict()["severity"], "high")
        json.dumps(c)  # plain JSON

    def test_finding_serializes_occurrences_as_iso_timestamps(self):
        d = _minimal_result().to_dict()
        occ = d["behavioral"][0]["occurrences"]
        self.assertEqual(len(occ), 1)
        self.assertEqual(occ[0]["t"], "2026-06-12T14:32:00")
        self.assertEqual(occ[0]["detail"], "glucose rising 1.8 mg/dL/min before bolus")
        json.dumps(d)  # must still be plain-JSON-serializable


class ConsolidatedProfileSchemaTest(unittest.TestCase):
    def test_defaults_to_none_and_serializes_null(self):
        d = _minimal_result().to_dict()
        self.assertIn("consolidated_basal", d)
        self.assertIsNone(d["consolidated_basal"])

    def test_populated_profile_round_trips_through_json(self):
        prof = ConsolidatedProfile(
            segments=[ProfileSegment(start_min=0, label="00:00", basal_rate=0.6,
                                     isf=50.0, carb_ratio=10.0, target_bg=110.0,
                                     basal_slots=[0, 1, 2], basal_max_deviation=0.02)],
            max_segments=16, noise_floor=0.05, total_daily_basal=14.4,
            forced_merges=False, note=None,
        )
        r = _minimal_result()
        r = AnalysisResult(**{**r.__dict__, "consolidated_basal": prof})
        d = r.to_dict()
        json.dumps(d)  # plain data
        cb = d["consolidated_basal"]
        self.assertEqual(cb["segment_count"], 1)
        self.assertEqual(cb["max_segments"], 16)
        self.assertEqual(cb["segments"][0]["basal_rate"], 0.6)
        self.assertEqual(cb["segments"][0]["isf"], 50.0)
        self.assertEqual(cb["segments"][0]["carb_ratio"], 10.0)
        self.assertEqual(cb["segments"][0]["target_bg"], 110.0)
        self.assertEqual(cb["segments"][0]["basal_slots"], [0, 1, 2])

    def test_forced_merge_note_is_carried(self):
        prof = ConsolidatedProfile(
            segments=[], max_segments=16, noise_floor=0.05,
            total_daily_basal=0.0, forced_merges=True, note="merged with max deviation 0.10 U/h",
        )
        self.assertTrue(prof.to_dict()["forced_merges"])
        self.assertIn("max deviation", prof.to_dict()["note"])


if __name__ == "__main__":
    unittest.main()
