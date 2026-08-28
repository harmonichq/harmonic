"""Per-day model-view tests (#152 / ADR 0019).

The model-view is the debug/introspection payload behind ``/model-view?date=``: for
one calendar day, every anchor the engine saw and *why* each detector did/didn't fire,
including the buried near-misses the coaching path discards once a driver fires.

Coverage:

* **state precedence** — the five distinct anchor states (fired / outranked / near_miss
  / clean / no_data), unit-tested on the pure decision.
* **all-verdicts, none collapsed** — a meal anchor reports every classifier that looked
  at it, not just the surfaced one (ADR 0019 §3).
* **buried near-miss surfaces** — an episode that fires still carries the non-firing
  verdicts of its other anchors (ADR 0019 §1 — the whole reason the view exists).
* **day assignment / spanning** — an episode is assigned to the day it resolves on and
  marks ``spans_midnight`` when it straddles it.
"""

import unittest
from datetime import date, datetime, timedelta

from ciq_autotune.analyzers.classifiers.evidence import EvidenceTier, SilenceReason
from ciq_autotune.analyzers.scenario import Lever, LowPromptAnswer, assemble
from ciq_autotune.analyzers.scenario.anchors import Anchor, AnchorKind
from ciq_autotune.analyzers.scenario.model_view import (
    AnchorVerdict,
    _anchor_state,
    _low_verdicts,
    assemble_model_view,
)
from ciq_autotune.analyzers.scenario_config import ScenarioConfig
from ciq_autotune.events import BolusEvent, CgmReading

from tests.test_scenario_engine import ISF, cgm_flat, cgm_ramp, corr, meal, suspend_run


def _v(matched, reason=None, tier=EvidenceTier.OBSERVED):
    return AnchorVerdict("x", matched, "detail", tier, reason)


class AnchorStateTest(unittest.TestCase):
    """The five-state precedence (ADR 0019 §2)."""

    def test_driver_is_fired(self):
        self.assertEqual(_anchor_state(True, [_v(False, SilenceReason.NO_TRIGGER)]), "fired")

    def test_matched_but_not_driver_is_outranked(self):
        self.assertEqual(_anchor_state(False, [_v(True)]), "outranked")

    def test_loud_silence_is_near_miss(self):
        self.assertEqual(
            _anchor_state(False, [_v(False, SilenceReason.UNDER_THRESHOLD)]), "near_miss"
        )

    def test_upstream_cause_is_near_miss(self):
        self.assertEqual(
            _anchor_state(False, [_v(False, SilenceReason.UPSTREAM_CAUSE)]), "near_miss"
        )

    def test_only_no_trigger_is_clean(self):
        self.assertEqual(
            _anchor_state(False, [_v(False, SilenceReason.NO_TRIGGER),
                                  _v(False, SilenceReason.NO_TRIGGER)]), "clean"
        )

    def test_no_verdicts_is_clean(self):
        self.assertEqual(_anchor_state(False, []), "clean")

    def test_insufficient_data_is_no_data(self):
        self.assertEqual(
            _anchor_state(False, [_v(False, SilenceReason.INSUFFICIENT_DATA)]), "no_data"
        )

    def test_near_miss_beats_no_data(self):
        # A loud reason on one classifier wins over an unjudgeable one on another.
        self.assertEqual(
            _anchor_state(False, [_v(False, SilenceReason.INSUFFICIENT_DATA),
                                  _v(False, SilenceReason.UNDER_THRESHOLD)]), "near_miss"
        )


class OverTreatedLowModelViewTest(unittest.TestCase):
    """The low view retains the complete shared rebound judgment (#90)."""

    def _low_rebound(self, peak):
        t0 = datetime(2026, 6, 20, 12, 0)

        def ramp(offset, start_bg, end_bg, minutes):
            return [
                CgmReading(
                    t=t0 + timedelta(minutes=offset + step),
                    bg=start_bg + (end_bg - start_bg) * step / minutes,
                    type="EGV",
                )
                for step in range(0, minutes + 1, 5)
            ]

        return (
            ramp(0, 100.0, 100.0, 20)
            + ramp(20, 100.0, 55.0, 20)
            + ramp(40, 55.0, peak, 40)
            + ramp(80, peak, peak - 90.0, 60)
        )

    def _over_treated_verdict(self, peak):
        t = datetime(2026, 6, 20, 12, 0)
        anchor = Anchor(t=t, kind=AnchorKind.LOW, bg=55.0)
        cgm = [
            CgmReading(t=t, bg=55.0, type="EGV"),
            CgmReading(t=t + timedelta(minutes=5), bg=peak, type="EGV"),
        ]
        verdicts = _low_verdicts(
            anchor, cgm, [], [], scenario_config=ScenarioConfig(), low_answers=()
        )
        return next(v for v in verdicts if v.classifier == "over_treated_low")

    def test_low_view_publishes_matched_and_silent_rebound_judgments(self):
        cases = (
            ("matched", 165.0, True, EvidenceTier.INFERRED, None),
            ("under threshold", 155.0, False, EvidenceTier.OBSERVED,
             SilenceReason.UNDER_THRESHOLD),
            ("no trigger", 135.0, False, EvidenceTier.OBSERVED,
             SilenceReason.NO_TRIGGER),
        )
        for label, peak, matched, tier, silence_reason in cases:
            with self.subTest(label=label):
                verdict = self._over_treated_verdict(peak)
                self.assertEqual(verdict.matched, matched)
                self.assertEqual(verdict.evidence_tier, tier)
                self.assertEqual(verdict.silence_reason, silence_reason)

        t = datetime(2026, 6, 21, 12, 0)
        verdict = next(v for v in _low_verdicts(
            Anchor(t=t, kind=AnchorKind.LOW, bg=55.0),
            [CgmReading(t=t, bg=55.0, type="EGV")], [], [],
            scenario_config=ScenarioConfig(), low_answers=(),
        ) if v.classifier == "over_treated_low")
        self.assertFalse(verdict.matched)
        self.assertEqual(verdict.evidence_tier, EvidenceTier.NOT_IN_DATA)
        self.assertEqual(verdict.silence_reason, SilenceReason.INSUFFICIENT_DATA)

    def test_announced_meal_ownership_is_a_calm_published_non_match(self):
        t = datetime(2026, 6, 20, 12, 0)
        anchor = Anchor(t=t, kind=AnchorKind.LOW, bg=55.0)
        cgm = [
            CgmReading(t=t, bg=55.0, type="EGV"),
            CgmReading(t=t + timedelta(minutes=5), bg=165.0, type="EGV"),
        ]
        announced = BolusEvent(t=t, insulin=2.0, carbs=20.0)
        verdict = next(v for v in _low_verdicts(
            anchor, cgm, [announced], [],
            scenario_config=ScenarioConfig(), low_answers=(),
        ) if v.classifier == "over_treated_low")

        self.assertFalse(verdict.matched)
        self.assertEqual(verdict.evidence_tier, EvidenceTier.INFERRED)
        self.assertEqual(verdict.silence_reason,
                         SilenceReason.OWNED_BY_ANNOUNCED_MEAL)
        self.assertEqual(_anchor_state(False, [verdict]), "clean")

    def test_published_model_view_keeps_matched_and_silent_low_judgments(self):
        for peak, matched, silence_reason in (
            (165.0, True, None),
            (155.0, False, SilenceReason.UNDER_THRESHOLD),
        ):
            with self.subTest(peak=peak):
                payload = assemble_model_view(
                    [], self._low_rebound(peak), [], target=date(2026, 6, 20)
                )
                low = next(
                    anchor
                    for episode in payload["episodes"]
                    for anchor in episode["anchors"]
                    if anchor["kind"] == "low" and anchor["t"] == "2026-06-20 12:40:00"
                )
                verdict = next(
                    verdict for verdict in low["verdicts"]
                    if verdict["classifier"] == "over_treated_low"
                )
                self.assertEqual(verdict["matched"], matched)
                self.assertEqual(verdict["silence_reason"],
                                 silence_reason.value if silence_reason else None)

    def test_refuted_and_split_off_lows_suppress_over_treated_low(self):
        t = datetime(2026, 6, 22, 12, 0)
        cgm = [
            CgmReading(t=t, bg=55.0, type="EGV"),
            CgmReading(t=t + timedelta(minutes=5), bg=165.0, type="EGV"),
        ]
        cases = (
            (
                "refuted",
                Anchor(t=t, kind=AnchorKind.LOW, bg=55.0),
                (LowPromptAnswer(anchor_t=t, answer="no"),),
            ),
            (
                "split off",
                Anchor(t=t, kind=AnchorKind.LOW, bg=55.0,
                       over_treatment_split_off=True),
                (),
            ),
        )
        for label, anchor, low_answers in cases:
            with self.subTest(label=label):
                verdicts = _low_verdicts(
                    anchor, cgm, [], [],
                    scenario_config=ScenarioConfig(), low_answers=low_answers,
                )
                self.assertNotIn(
                    "over_treated_low", {verdict.classifier for verdict in verdicts}
                )


class ModelViewPayloadTest(unittest.TestCase):
    """The assembled per-day payload shape + the all-verdicts / buried-near-miss contract."""

    def _carb_undercount_day(self):
        """A single runaway meal that carb-undercount fires on: a badly under-covered
        20 g / 2 U dose whose BG ramps 100 -> ~316 over 3 h — the excursion implies far
        more carbs than were logged (ratio >1.5, gap >30 g), so the meal ran away high."""
        m = meal(16, 12, 0, carbs=20.0, dose=2.0)
        cgm = (
            cgm_flat(16, 10, 0, 100, 120)
            + cgm_ramp(16, 12, 0, 100, 1.2, 180)      # 100 -> ~316 over 3 h
            + cgm_flat(16, 15, 5, 120, 120)
        )
        return [m], cgm

    def test_meal_anchor_reports_every_classifier(self):
        bolus, cgm = self._carb_undercount_day()
        day = assemble_model_view(bolus, cgm, [], target=date(2026, 6, 16),
                                  isf=ISF)
        meal_anchors = [a for ep in day["episodes"] for a in ep["anchors"]
                        if a["kind"] == "meal"]
        self.assertTrue(meal_anchors, "expected a meal anchor")
        classifiers = {v["classifier"] for v in meal_anchors[0]["verdicts"]}
        # All three meal classifiers are reported, none collapsed (ADR 0019 §3).
        self.assertEqual(classifiers,
                         {"carb_undercount", "late_bolus", "meal_over_delivery"})

    def test_fired_meal_has_fired_state_and_matched_verdict(self):
        bolus, cgm = self._carb_undercount_day()
        day = assemble_model_view(bolus, cgm, [], target=date(2026, 6, 16),
                                  isf=ISF)
        meal_anchor = next(a for ep in day["episodes"] for a in ep["anchors"]
                           if a["kind"] == "meal")
        self.assertEqual(meal_anchor["state"], "fired")
        cu = next(v for v in meal_anchor["verdicts"]
                  if v["classifier"] == "carb_undercount")
        self.assertTrue(cu["matched"])
        self.assertIsNone(cu["silence_reason"])
        # A matched verdict still lists the other, non-firing classifiers beside it.
        others = [v for v in meal_anchor["verdicts"] if not v["matched"]]
        self.assertTrue(others, "buried non-firing verdicts must be retained")

    def test_meal_over_delivery_names_the_selected_later_suspend(self):
        m = meal(16, 11, 45, carbs=50.0, dose=5.0)
        basal = suspend_run(16, 12, 0, rows=12)
        cgm = (
            cgm_flat(16, 11, 30, 110.0, 85)
            + cgm_ramp(16, 12, 55, 110.0, -1.4, 30)
        )

        day = assemble_model_view([m], cgm, basal, target=date(2026, 6, 16), isf=None)

        meal_anchor = next(a for ep in day["episodes"] for a in ep["anchors"]
                           if a["kind"] == "meal")
        verdict = next(v for v in meal_anchor["verdicts"]
                       if v["classifier"] == "meal_over_delivery")
        self.assertTrue(verdict["matched"])
        self.assertEqual(verdict["suspend_start"], "2026-06-16 12:00:00")

    def test_independent_reads_keep_scenario_and_model_view_selection_in_parity(self):
        at = datetime(2026, 6, 16, 11, 45)
        reads = [
            [
                BolusEvent(t=at, insulin=4.0, carbs=40.0,
                           completion="Completed", seq_num=5),
                BolusEvent(t=at, insulin=5.0, carbs=50.0,
                           completion="Completed", seq_num=9),
            ],
            [
                BolusEvent(t=at, insulin=5.0, carbs=50.0,
                           completion="Completed", seq_num=9),
                BolusEvent(t=at, insulin=4.0, carbs=40.0,
                           completion="Completed", seq_num=5),
            ],
        ]
        basal = suspend_run(16, 12, 0, rows=12)
        cgm = cgm_ramp(16, 12, 55, 110.0, -1.4, 30)
        selected = []

        for bolus in reads:
            report = assemble(bolus, cgm, basal, isf=None)
            self.assertIn(
                Lever.MEAL_OVER_DELIVERY,
                {episode.lever for episode in report.episodes.values()},
            )
            day = assemble_model_view(
                bolus, cgm, basal, target=date(2026, 6, 16), isf=None
            )
            verdicts = [
                verdict
                for episode in day["episodes"]
                for anchor in episode["anchors"]
                for verdict in anchor["verdicts"]
                if verdict["classifier"] == "meal_over_delivery" and verdict["matched"]
            ]
            self.assertEqual(len(verdicts), 1)
            selected.append(verdicts[0]["suspend_start"])

        self.assertEqual(selected, ["2026-06-16 12:00:00"] * 2)

    def test_unstamped_runaway_reports_carb_undercount_as_not_in_data(self):
        bolus, cgm = self._carb_undercount_day()
        bolus = [meal(16, 12, 0, carbs=20.0, dose=2.0, carb_ratio=None)]
        day = assemble_model_view(bolus, cgm, [], target=date(2026, 6, 16), isf=ISF)
        meal_anchor = next(a for ep in day["episodes"] for a in ep["anchors"]
                           if a["kind"] == "meal")
        cu = next(v for v in meal_anchor["verdicts"]
                  if v["classifier"] == "carb_undercount")

        self.assertFalse(cu["matched"])
        self.assertEqual(cu["evidence_tier"], "not_in_data")

    def test_anchor_facts_and_payload_shape(self):
        bolus, cgm = self._carb_undercount_day()
        day = assemble_model_view(bolus, cgm, [], target=date(2026, 6, 16),
                                  isf=ISF)
        self.assertEqual(day["date"], "2026-06-16")
        self.assertIn("window", day)
        self.assertIn("cgm", day["window"])
        m = next(a for ep in day["episodes"] for a in ep["anchors"]
                 if a["kind"] == "meal")
        self.assertEqual(m["label"], "Meal bolus")
        self.assertEqual(m["carbs"], 20.0)
        self.assertEqual(m["insulin"], 2.0)

    def test_equal_time_corrections_mark_only_the_classifier_selected_second_seq(self):
        corrections = [
            BolusEvent(t=datetime(2026, 6, 16, 14, 40), insulin=3, seq_num=12),
            BolusEvent(t=datetime(2026, 6, 16, 14, 10), insulin=3, seq_num=10),
            BolusEvent(t=datetime(2026, 6, 16, 14, 40), insulin=3, seq_num=11),
        ]
        cgm = (cgm_ramp(16, 14, 0, 160, -0.8, 60)
               + cgm_ramp(16, 15, 5, 108, -1.2, 60))
        day = assemble_model_view(
            corrections, cgm, [], target=date(2026, 6, 16), isf=ISF,
        )
        matched = [
            verdict for episode in day["episodes"] for anchor in episode["anchors"]
            for verdict in anchor["verdicts"]
            if verdict["classifier"] == "correction_stacking" and verdict["matched"]
        ]
        self.assertEqual(len(matched), 1)
        fired_episode = next(
            episode for episode in day["episodes"]
            if episode["lever"] == "correction_stacking"
        )
        self.assertEqual(fired_episode["trigger_t"], "2026-06-16 14:40:00")
        correction_anchors = [anchor for episode in day["episodes"]
                              for anchor in episode["anchors"]
                              if anchor["kind"] == "correction"]
        self.assertEqual(sum(anchor["state"] == "fired" for anchor in correction_anchors), 1)

    def test_fired_episode_carries_steps(self):
        # #248 (ADR 0024): the Day surface's tier-2 "Model steps" reads ep["steps"],
        # the attributed step-through — present (non-empty) on a fired episode, each
        # step carrying {t, text, evidence_tier}.
        bolus, cgm = self._carb_undercount_day()
        day = assemble_model_view(bolus, cgm, [], target=date(2026, 6, 16),
                                  isf=ISF)
        fired = next(ep for ep in day["episodes"] if ep["lever"] is not None)
        self.assertIn("steps", fired)
        self.assertTrue(fired["steps"], "a fired episode should carry its step-through")
        step = fired["steps"][0]
        self.assertIn("t", step)
        self.assertIn("text", step)
        self.assertIn("evidence_tier", step)

    def test_episode_assigned_to_resolve_day_but_capped_end_is_not_spanning(self):
        # A late meal at 23:30 whose window gets pushed past midnight by the 5h
        # segment cap (#280) -> assigned to the NEXT day (it resolves there), but
        # with NO anchor actually landing after 00:00, spans_midnight must be False.
        m = meal(16, 23, 30, carbs=45.0, dose=3.0)
        cgm = (
            cgm_flat(16, 22, 0, 120, 90)
            + cgm_ramp(16, 23, 30, 120, 0.7, 180)     # runs past midnight into the 17th
            + cgm_flat(17, 2, 35, 120, 120)
        )
        d17 = assemble_model_view([m], cgm, [], target=date(2026, 6, 17),
                                  isf=ISF)
        self.assertTrue(d17["episodes"], "capped episode should land on its resolve day")
        self.assertFalse(d17["episodes"][0]["spans_midnight"])
        self.assertEqual(d17["midnight"], "2026-06-17 00:00:00")
        # It does NOT also appear on the 16th (single-day resolve assignment).
        d16 = assemble_model_view([m], cgm, [], target=date(2026, 6, 16),
                                  isf=ISF)
        self.assertEqual(d16["episodes"], [])

    def test_real_post_midnight_anchor_marks_spanning(self):
        # A late meal at 23:30 followed by a correction bolus at 00:30 -> a real
        # anchor lands after midnight, so this episode genuinely spans it (#280).
        m = meal(16, 23, 30, carbs=45.0, dose=3.0)
        c = corr(17, 0, 30, units=2.0)
        cgm = (
            cgm_flat(16, 22, 0, 120, 90)
            + cgm_ramp(16, 23, 30, 120, 0.7, 180)
            + cgm_flat(17, 2, 35, 120, 120)
        )
        d17 = assemble_model_view([m, c], cgm, [], target=date(2026, 6, 17),
                                  isf=ISF)
        self.assertTrue(d17["episodes"], "spanning episode should land on its resolve day")
        self.assertTrue(d17["episodes"][0]["spans_midnight"])


if __name__ == "__main__":
    unittest.main()
