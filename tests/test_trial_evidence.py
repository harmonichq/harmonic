"""The Verify workstation's per-period breakdown, read through the roster (#660).

Every assertion here goes through ``review_trials(selected=...)`` — the surface's
one front door — on fixtures built to the real event shapes, so a change that
moves the derivation without moving the interface is caught. Nothing is hand-set:
the "all day"/"varies" scopes come out of two real profiles being diffed, which is
the lesson #273's tests missed by asserting on a flag the fixture itself set.
"""

import tempfile
import unittest
from datetime import datetime, timedelta

from ciq_autotune.events import CarbEntry
from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings
from ciq_autotune.store import Store
from ciq_autotune.watched_change import review_trials

BASE = datetime(2026, 6, 1)
SWITCH = datetime(2026, 6, 5, 9)
NOW = datetime(2026, 6, 12, 23, 30)


def _profile(idp, segments):
    return ProfileSettings(idp=idp, name=str(idp), dia_min=300, carb_entry=True,
                           max_bolus=15.0, segments=segments)


def _cgm(store, start, end, value_at):
    """A reading every 30 minutes across ``[start, end)``, valued by hour."""
    rows, t = [], start
    while t < end:
        rows.append({
            "EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
            "Readings (CGM / BGM)": value_at(t),
            "Description": "EGV",
        })
        t += timedelta(minutes=30)
    store.upsert_cgm(rows)


def _meals(store, days, hours, seq_base, carbs=45.0):
    """One carb bolus per day at each of ``hours``.

    ``seq_base`` keeps two calls apart: boluses are keyed on the pump's seqNum
    (#194), so reusing one would merge the second batch onto the first.
    """
    rows = []
    for i, day in enumerate(days):
        for j, hour in enumerate(hours):
            at = datetime.combine(day, datetime.min.time()) + timedelta(hours=hour)
            rows.append({
                "seq_num": seq_base + i * 10 + j,
                "request_time": at.strftime("%Y-%m-%d %H:%M:%S"),
                "completion_time": at.strftime("%Y-%m-%d %H:%M:%S"),
                "description": "Bolus",
                "completion": "Completed",
                "insulin": 4.0,
                "carbs": carbs,
                "isf": 40,
                "carb_ratio": 5.0,
                "target_bg": 110,
            })
    store.upsert_bolus(rows)


def _seed_profile_switch(path):
    """A whole-profile switch: basal and ISF move all day uniformly, I:C does not.

    The incoming profile splits the day at noon and lands a different I:C on each
    half, so the carb-ratio constituent covers the whole day *and* varies — the
    two scope words the surface prints, produced by a real diff rather than set.
    """
    old = _profile(1, (ProfileSegment(0, 0.6, 40, 5.0, 110),))
    new = _profile(2, (ProfileSegment(0, 0.8, 36, 4.6, 110),
                       ProfileSegment(720, 0.8, 36, 4.2, 110)))
    with Store.open(path) as store:
        store.upsert_settings_snapshot("2026-06-04 09:00:00", PumpSettings(1, (old, new)))
        store.upsert_settings_snapshot(
            SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(2, (old, new)))
        store.upsert_basal([{
            "seq_num": 200, "time": "2026-06-06 00:00:00",
            "delivery_type": "profileDelivery", "duration_mins": 5,
            "basal_rate": 0.8, "profile_basal_rate": 0.8,
        }])
        # Readings run 120 before the switch and 100 after, so a period's medians
        # are unambiguous and the two envelopes cannot be confused for each other.
        _cgm(store, SWITCH - timedelta(days=14), SWITCH, lambda t: 120)
        _cgm(store, SWITCH, NOW, lambda t: 100)
        _meals(store, [(SWITCH - timedelta(days=d)).date() for d in range(1, 6)], [8, 13], 1000)
        _meals(store, [(SWITCH + timedelta(days=d)).date() for d in range(1, 4)], [8, 13], 2000)
        store.upsert_carb_entry(CarbEntry(
            t=SWITCH - timedelta(days=2), grams=16.0, certainty="exact", source="manual"))
        store.upsert_carb_entry(CarbEntry(
            t=SWITCH - timedelta(days=1), grams=None, certainty="unknown", source="manual"))
        store.upsert_carb_entry(CarbEntry(
            t=SWITCH + timedelta(days=1), grams=20.0, certainty="estimate",
            source="low-prompt"))


def _seed_block_ic_switch(path):
    """An I:C change confined to the midday block, on a three-segment profile."""
    segments = lambda ic: (ProfileSegment(0, 0.6, 40, 5.0, 110),      # noqa: E731
                           ProfileSegment(720, 0.6, 40, ic, 110),
                           ProfileSegment(900, 0.6, 40, 5.0, 110))
    old, new = _profile(1, segments(5.0)), _profile(2, segments(4.4))
    with Store.open(path) as store:
        store.upsert_settings_snapshot("2026-06-04 09:00:00", PumpSettings(1, (old, new)))
        store.upsert_settings_snapshot(
            SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(2, (old, new)))
        # #581: only a complete annotated applied group corroborates the block-scoped
        # I:C move (12:00–15:00), upgrading it from general to block-isolated evidence.
        provenance = {"block_start_min": 720, "block_end_min": 900,
                      "block_member_start_mins": [720]}
        store.save_plan_draft([{
            "type": "ic", "start_min": 720, "value": 4.4, "current": 5.0,
            "ic_block_provenance": provenance,
        }], "2026-06-04 09:00:00")
        store.apply_plan("2026-06-04 09:00:00")
        store.upsert_basal([{
            "seq_num": 201, "time": "2026-06-06 00:00:00",
            "delivery_type": "profileDelivery", "duration_mins": 5,
            "basal_rate": 0.6, "profile_basal_rate": 0.6,
        }])
        _cgm(store, SWITCH - timedelta(days=14), NOW, lambda t: 120)
        # One meal inside the changed block (13:00) and one outside it (08:00),
        # every day either side of the switch.
        _meals(store, [(SWITCH - timedelta(days=d)).date() for d in range(1, 5)], [8, 13], 1000)
        _meals(store, [(SWITCH + timedelta(days=d)).date() for d in range(1, 5)], [8, 13], 2000)


class TrialBreakdownTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        with Store.open(self.tmp.name):
            pass

    def tearDown(self):
        self.tmp.close()

    def _selected(self, seed, predicate=lambda trial: True):
        seed(self.tmp.name)
        with Store.open(self.tmp.name) as store:
            roster = review_trials(store, now=NOW)
            trial = next(t for t in roster["trials"] if predicate(t))
            return review_trials(store, now=NOW,
                                 selected=trial["id"])["selected"]

    def test_a_whole_day_uniform_move_reports_the_day_and_one_pair(self):
        detail = self._selected(_seed_profile_switch)

        basal = next(c for c in detail["changes"] if c["parameter"] == "basal_rate")
        self.assertEqual(basal["slots_changed"], 48)
        self.assertTrue(basal["uniform"])
        self.assertEqual((basal["before"], basal["after"]), (0.6, 0.8))

    def test_a_whole_day_move_that_varies_still_carries_a_real_pair(self):
        detail = self._selected(_seed_profile_switch)

        carb_ratio = next(c for c in detail["changes"] if c["parameter"] == "carb_ratio")
        self.assertEqual(carb_ratio["slots_changed"], 48)
        self.assertFalse(carb_ratio["uniform"])
        # The first changed slot's pair — never a null beside the word "varies".
        self.assertEqual((carb_ratio["before"], carb_ratio["after"]), (5.0, 4.6))
        self.assertEqual(carb_ratio["slot"], "00:00")

    def test_the_paired_envelopes_separate_the_two_periods(self):
        detail = self._selected(_seed_profile_switch)

        before = detail["envelopes"]["before_period"]
        trial = detail["envelopes"]["trial_period"]
        self.assertEqual(len(before), 48)
        self.assertEqual(len(trial), 48)
        self.assertEqual({row["med"] for row in before if row["n"]}, {120})
        self.assertEqual({row["med"] for row in trial if row["n"]}, {100})
        # No quartiles: lock term 5 retired the bands, so the payload carries none.
        self.assertNotIn("p25", before[0])

    def test_rescue_carbs_count_the_manual_log_per_period(self):
        detail = self._selected(_seed_profile_switch)

        self.assertEqual(detail["rescue"]["before_period"],
                         {"n": 2, "grams": 16, "n_unknown": 1, "n_low_prompt": 0})
        self.assertEqual(detail["rescue"]["trial_period"],
                         {"n": 1, "grams": 20, "n_unknown": 0, "n_low_prompt": 1})

    def test_day_counts_are_the_calendar_days_each_period_touches(self):
        detail = self._selected(_seed_profile_switch)

        self.assertEqual(detail["days"]["before_period"], 15)
        self.assertEqual(detail["days"]["trial_period"], 8)
        self.assertEqual(len(detail["day_rows"]["before_period"]), 15)
        # The per-day rows pass no coverage verdict of their own; gaps are the
        # roster's single answer (#273's lesson applied to display).
        self.assertNotIn("covered", detail["day_rows"]["before_period"][0])

    def test_a_block_scoped_trial_anchors_only_on_meals_inside_its_block(self):
        detail = self._selected(_seed_block_ic_switch,
                                lambda trial: trial["slot"] is not None)

        arcs = detail["meal_arcs"]
        self.assertEqual(arcs["block"], [720, 900])
        # Two meals a day were bolused; only the 13:00 one falls in 12:00–15:00.
        self.assertEqual(arcs["before_period"]["n_meals"], 4)
        self.assertEqual(arcs["trial_period"]["n_meals"], 4)
        self.assertEqual(len(arcs["before_period"]["bins"]), 20)
        self.assertEqual(arcs["before_period"]["bins"][0]["t"], -60)
        self.assertEqual(arcs["before_period"]["bins"][-1]["t"], 225)

    def test_a_corroborated_block_trial_carries_no_general_caveat(self):
        # #581: once uniquely corroborated the evidence is block-isolated, so the
        # ADR 579 §5 general "not isolated to the block" caveat is amended away.
        detail = self._selected(_seed_block_ic_switch,
                                lambda trial: trial["slot"] is not None)

        self.assertNotIn("limitation", detail)
        self.assertNotIn(
            "This is general I:C evidence. It is not isolated to the block that changed.",
            detail["limits"],
        )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()


class ExactComparisonEvidenceTest(unittest.TestCase):
    def test_meal_union_does_not_double_count_and_curves_clip_to_period(self):
        from ciq_autotune.trial_evidence import comparison_evidence
        from ciq_autotune.events import CgmReading, BolusEvent
        start, end = datetime(2026,6,1,12), datetime(2026,6,1,16)
        cgm = [CgmReading(start + timedelta(minutes=i*5), bg=120) for i in range(-12, 61)]
        meals = [BolusEvent(start, insulin=4, carbs=40, seq_num=1),
                 BolusEvent(start+timedelta(hours=1), insulin=4, carbs=40, seq_num=2),
                 BolusEvent(end, insulin=4, carbs=40, seq_num=3)]
        result = comparison_evidence(parameter="carb_ratio", slot=None, block=(720,960),
                                     changed_at=start, before=10, after=9, start=start, end=end,
                                     cgm=cgm, bolus=meals, basal=[], carbs=[], snapshots=[])
        self.assertEqual(len(result["readings"]),48)
        self.assertEqual(result["intervals"],[(start,end)])
        self.assertEqual(len(result["view"]["occurrences"]),2)
        self.assertEqual(result["view"]["projection"]["routed_count"],2)
        for occurrence in result["view"]["occurrences"]:
            anchor = datetime.fromisoformat(occurrence["anchor_t"])
            self.assertTrue(all(start <= anchor + timedelta(minutes=p["minute"]) < end
                                for p in occurrence["trace"]["cgm"]))

    def test_isf_keeps_real_fasting_steps_in_owned_rest_hours(self):
        from ciq_autotune.trial_evidence import comparison_evidence
        from ciq_autotune.events import CgmReading
        start, end = datetime(2026,6,1), datetime(2026,6,3)
        cgm = [CgmReading(start + timedelta(minutes=5*i), bg=110+i%3) for i in range(576)]
        result = comparison_evidence(parameter="isf", slot="01:00", block=None,
                                     changed_at=start, before=40, after=45, start=start, end=end,
                                     cgm=cgm, bolus=[], basal=[], carbs=[], snapshots=[])
        self.assertGreater(len(result["view"]["rest_windows"]),0)
        self.assertGreater(len(result["view"]["fasting_steps"]),0)
        self.assertTrue(all(r.t.hour == 1 and r.t.minute < 30 for r in result["readings"]))
        self.assertTrue(all(step["window_id"].startswith("rest:") for step in result["view"]["fasting_steps"]))
        readiness = result["readiness"]
        self.assertEqual(readiness["observed"], len({s["window_id"] for s in result["view"]["fasting_steps"]}))
        self.assertGreater(readiness["step_count"], readiness["observed"])
        self.assertEqual(readiness["required"], 30)
        self.assertFalse(readiness["criterion_met"])


class CircularComparisonTest(unittest.TestCase):
    def test_wrapping_block_owns_meal_and_readings(self):
        from ciq_autotune.trial_evidence import comparison_evidence
        from ciq_autotune.events import BolusEvent, CgmReading
        start = datetime(2026,6,1,22)
        dose = BolusEvent(start+timedelta(hours=1), insulin=4, carbs=40, completion="Completed", seq_num=1)
        result = comparison_evidence(parameter="carb_ratio", slot="22:00", block=(1320,120),
            changed_at=start, before=10, after=9, start=start, end=start+timedelta(hours=8),
            cgm=[CgmReading(dose.t+timedelta(minutes=5),120)], bolus=[dose], basal=[], carbs=[], snapshots=[])
        self.assertEqual(len(result["meals"]), 1)
        self.assertEqual(len(result["readings"]), 1)
        self.assertIn("readiness", result)


class PracticalReadinessTest(unittest.TestCase):
    def evidence(self, parameter, start, end, *, cgm=(), bolus=(), basal=(), block=None, snapshots=(), isf=40):
        from ciq_autotune.trial_evidence import comparison_evidence
        return comparison_evidence(parameter=parameter, slot=None, block=block, changed_at=start,
            before=10, after=9, start=start, end=end, cgm=list(cgm), bolus=list(bolus),
            basal=list(basal), carbs=[], snapshots=list(snapshots), isf=isf)

    def test_basal_uses_owned_clean_dates_for_each_slot(self):
        from ciq_autotune.events import BasalEvent,CgmReading
        start=datetime(2026,6,1)
        cgm=[CgmReading(start+timedelta(minutes=5*i),120) for i in range(15*288+1)]
        basal=[BasalEvent(start+timedelta(minutes=5*i),delivery_type="profileDelivery",basal_rate=1,profile_basal_rate=1,duration_mins=5)
               for i in range(15*288+1)]
        result=self.evidence('basal_rate',start,start+timedelta(days=14),cgm=cgm,basal=basal,block=(720,780))
        readiness=result['readiness']
        self.assertEqual(readiness['observed'],14)
        self.assertEqual([r['observed'] for r in readiness['slots']],[14,14])
        self.assertTrue(readiness['criterion_met'])
        empty=self.evidence('basal_rate',start,start+timedelta(days=14),cgm=cgm,block=(720,780))
        self.assertEqual(empty['readiness']['observed'],0)
        self.assertFalse(empty['readiness']['criterion_met'])

    def test_ic_uses_fractional_pool_and_unreadable_runs_do_not_count(self):
        from scripts.gen_estimator_truth import chained_run_sets
        truth=chained_run_sets()[0]
        result=self.evidence('carb_ratio',truth['analysis_start'],truth['analysis_end'],
            cgm=truth['cgm_readings'],bolus=truth['events'],snapshots=truth['snapshots'],
            block=(0,720),isf=truth['isf_effective'])
        readiness=result['readiness']
        self.assertAlmostEqual(readiness['observed'],10)
        self.assertTrue(readiness['criterion_met'])
        self.assertTrue(any(0<r['ownership']<1 for r in readiness['runs']))
        empty=self.evidence('carb_ratio',truth['analysis_start'],truth['analysis_end'],
            bolus=truth['events'],snapshots=truth['snapshots'],block=(0,720),isf=truth['isf_effective'])
        self.assertEqual(empty['readiness']['observed'],0)
        self.assertFalse(empty['readiness']['criterion_met'])
        unmatched=self.evidence('carb_ratio',truth['analysis_start'],truth['analysis_end'],
            cgm=truth['cgm_readings'],bolus=truth['events'],snapshots=truth['snapshots'],block=(60,720))
        self.assertFalse(unmatched['readiness']['available'])

    def test_profile_requires_duration_and_coverage_on_partial_dates(self):
        from ciq_autotune.events import CgmReading
        start=datetime(2026,6,1,12)
        cgm=[CgmReading(start+timedelta(minutes=5*i),120) for i in range(30*288)]
        ready=self.evidence('profile',start,start+timedelta(days=30),cgm=cgm)['readiness']
        self.assertEqual(ready['observed'],31)
        self.assertTrue(ready['criterion_met'])
        early=self.evidence('profile',start,start+timedelta(days=29,hours=23),cgm=cgm)['readiness']
        self.assertFalse(early['criterion_met'])

    def test_eight_effective_runs_can_be_ready_below_fourteen_dates(self):
        from scripts.gen_estimator_truth import chained_run_sets
        truth=chained_run_sets()[0]
        # Five source-owned run shares (.25 + .35 + .45 + .70 + .25) total two.
        excluded={datetime.fromisoformat(t).date() for t in
                  ('2026-01-31','2026-02-03','2026-02-06','2026-02-21','2026-02-24')}
        retained=[b for b in truth['events'] if b.t.date() not in excluded]
        result=self.evidence('carb_ratio',truth['analysis_start'],truth['analysis_end'],
            cgm=truth['cgm_readings'],bolus=retained,snapshots=truth['snapshots'],
            block=(0,720),isf=truth['isf_effective'])
        self.assertAlmostEqual(result['readiness']['observed'],8)
        self.assertEqual(len(result['readiness']['contributing_dates']),13)
        self.assertTrue(result['readiness']['criterion_met'])
