"""What the Changes screen draws for a Trial, served by its comparison (#524).

Connor, 2026-10-14, on the redesigned Changes screen: the current change leads,
with a before-vs-after glucose trace for its block, In range / Below 70 / Above
180, Mean / GMI / CV, and for a basal Trial "how active Control IQ was before
versus after. Because that's kind of why you're doing it". The frontend computes
nothing statistical, so every one of those is served here, by each arm of the
selected Trial's comparison, over the population the arm's outcomes read.

Every store is synthetic: settings reads either side of a change, five-minute CGM
and basal rows manufactured night by night, meal boluses at fixed hours,
reconciled through the ingestion path and read through ``GET /api/verify/trials``.
"""

import tempfile
import unittest
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from ciq_autotune.api import create_app
from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings
from ciq_autotune.store import Store
from ciq_autotune.watched_change import reconcile_ingested_follow_up

_FMT = "%Y-%m-%d %H:%M:%S"
CHANGE = datetime(2026, 6, 20, 9)
FIRST_READ = CHANGE - timedelta(days=20)


def _profile(segments, idp=1):
    """``segments`` is ``[(start_min, basal, carb ratio), ...]``."""
    return ProfileSettings(idp=idp, name=str(idp), dia_min=300, carb_entry=True, max_bolus=15.0,
                           segments=tuple(ProfileSegment(start, basal, 40, ratio, 110)
                                          for start, basal, ratio in segments))


# The 02:00–05:00 basal rate moves 0.9 → 0.7; the rest of the day stays at 0.6.
_BASAL_BEFORE = ((0, 0.6, 5.0), (120, 0.9, 5.0), (300, 0.6, 5.0))
_BASAL_AFTER = ((0, 0.6, 5.0), (120, 0.7, 5.0), (300, 0.6, 5.0))
# The 11:00–14:00 carb ratio moves 5.0 → 4.0.
_RATIO_BEFORE = ((0, 0.6, 5.0), (660, 0.6, 5.0), (840, 0.6, 5.0))
_RATIO_AFTER = ((0, 0.6, 5.0), (660, 0.6, 4.0), (840, 0.6, 5.0))


class ChangesComparisonTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = self.directory.name + "/synthetic.sqlite"
        with Store.open(self.path):
            pass
        self.client = TestClient(create_app(db_path=self.path, token=None, enable_fetch_loop=False))

    def _store(self, before, after, *, last, glucose, delivered=None, meals=(), gap=None):
        """Two reads either side of the change; five-minute CGM valued by
        ``glucose(t)`` up to ``last``, with no reading inside ``gap``; a basal row
        every five minutes delivering ``delivered(t, programmed)``; and a carb
        bolus at each ``meals`` hour of every day."""
        cgm, basal, bolus = [], [], []
        t = FIRST_READ - timedelta(days=1)
        seq = 0
        while t < last:
            seq += 1
            if gap is None or not gap[0] <= t < gap[1]:
                cgm.append({"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                            "Readings (CGM / BGM)": glucose(t), "Description": "EGV"})
            segments = before if t < CHANGE else after
            minute = t.hour * 60 + t.minute
            programmed = max((s for s in segments if s[0] <= minute), key=lambda s: s[0])[1]
            rate = delivered(t, programmed) if delivered else programmed
            basal.append({"seq_num": seq, "time": t.strftime(_FMT), "delivery_type": "algorithmDelivery",
                          "duration_mins": 5, "basal_rate": rate, "profile_basal_rate": programmed})
            if t.minute == 0 and t.hour in meals:
                bolus.append({"seq_num": 500_000 + seq, "request_time": t.strftime(_FMT),
                              "completion_time": t.strftime(_FMT), "description": "Bolus",
                              "completion": "Completed", "insulin": 6.0, "carbs": 30.0,
                              "isf": 40, "carb_ratio": 5.0, "target_bg": 110})
            t += timedelta(minutes=5)
        with Store.open(self.path) as store:
            store.upsert_settings_snapshot(FIRST_READ.strftime(_FMT), PumpSettings(1, (_profile(before),)))
            store.upsert_settings_snapshot(CHANGE.strftime(_FMT), PumpSettings(1, (_profile(after),)))
            store.upsert_cgm(cgm)
            store.upsert_basal(basal)
            store.upsert_bolus(bolus)
            reconcile_ingested_follow_up(store)

    def _comparison(self):
        trials = self.client.get("/api/verify/trials").json()["trials"]
        self.assertEqual(len(trials), 1, trials)
        response = self.client.get("/api/verify/trials",
                                   params={"selected": trials[0]["id"], "assessment": "retained"})
        self.assertEqual(response.status_code, 200, response.text)
        comparison = response.json()["selected"]["reassessment"]["comparison"]
        self.assertEqual(comparison["availability"]["state"], "available", comparison["availability"])
        return trials[0], comparison

    def _basal_store(self, *, last):
        # Lows fill 04:00–05:00 every night before the change, while Control-IQ
        # suspends; after it, Control-IQ runs every block row 20% above the
        # lowered rate.
        def glucose(t):
            return 62 if t < CHANGE and 240 <= t.hour * 60 + t.minute < 300 else 120

        def delivered(t, programmed):
            minute = t.hour * 60 + t.minute
            if t < CHANGE:
                return 0.0 if 240 <= minute < 300 else programmed
            return round(programmed * 1.2, 2) if 120 <= minute < 300 else programmed

        self._store(_BASAL_BEFORE, _BASAL_AFTER, last=last, glucose=glucose, delivered=delivered)

    def test_every_trial_serves_mean_gmi_and_cv_beside_its_ranges(self):
        self._basal_store(last=CHANGE + timedelta(days=15))
        _, comparison = self._comparison()
        rows = {row["key"]: row for row in comparison["outcomes"]}
        self.assertEqual([key for key in rows if key in ("tir", "tbr", "tar", "mean", "gmi", "cv")],
                         ["tir", "tbr", "tar", "mean", "gmi", "cv"])
        # Before: 24 of 36 readings a night at 120, 12 at 62; after, all 120.
        mean_before = (24 * 120 + 12 * 62) / 36
        self.assertAlmostEqual(rows["mean"]["before"], round(mean_before, 1))
        self.assertEqual(rows["mean"]["after"], 120.0)
        self.assertEqual(rows["gmi"]["before"], round(3.31 + 0.02392 * mean_before, 1))
        self.assertEqual(rows["gmi"]["after"], round(3.31 + 0.02392 * 120, 1))
        self.assertEqual((rows["gmi"]["unit"], rows["cv"]["unit"], rows["mean"]["unit"]), ("%", "%", "mg/dL"))
        self.assertGreater(rows["cv"]["before"], 0)
        self.assertEqual(rows["cv"]["after"], 0.0)
        # The three read the same readings as the ranges.
        for key in ("mean", "gmi", "cv"):
            self.assertEqual(rows[key]["denominators"], rows["tir"]["denominators"])
            # A row that claims no direction is not resampled for an interval.
            self.assertEqual(rows[key]["assessment"]["state"], "context")
            self.assertIsNone(rows[key]["assessment"]["interval"])

    def test_a_basal_trace_is_aligned_by_clock_time_across_the_block(self):
        self._basal_store(last=CHANGE + timedelta(days=15))
        _, comparison = self._comparison()
        before = comparison["views"]["before"]["trace"]
        self.assertEqual({k: before[k] for k in ("alignment", "start_min", "start", "end", "bin_minutes")},
                         {"alignment": "clock", "start_min": 120, "start": 0, "end": 180, "bin_minutes": 10})
        # One episode a night: the twenty nights before the change.
        self.assertEqual((before["episodes"], before["left_off"], before["traces"]), (20, 0, None))
        bins = {row["t"]: row for row in before["bins"]}
        # 03:00 is 120 every night; 04:30 is the low.
        self.assertEqual((bins[60]["median"], bins[60]["p25"], bins[60]["p75"]), (120.0, 120.0, 120.0))
        self.assertEqual((bins[150]["median"], bins[150]["p25"], bins[150]["p75"]), (62.0, 62.0, 62.0))
        self.assertEqual(bins[150]["n"], 2 * 20)
        after = comparison["views"]["after"]["trace"]
        self.assertGreaterEqual(after["episodes"], 3)
        self.assertEqual({row["median"] for row in after["bins"]}, {120.0})

    def test_fewer_than_three_episodes_serve_each_episode_instead_of_a_band(self):
        self._basal_store(last=CHANGE + timedelta(days=2))
        _, comparison = self._comparison()
        after = comparison["views"]["after"]["trace"]
        self.assertEqual(after["episodes"], 2)
        self.assertEqual(after["bins"], [])
        self.assertEqual(len(after["traces"]), 2)
        # Each episode is its own readings, at their offsets into the block.
        self.assertEqual(after["traces"][0][0], {"t": 0, "bg": 120})
        self.assertEqual(len(after["traces"][0]), 36)

    def test_a_basal_trial_serves_how_active_control_iq_was_in_the_block(self):
        self._basal_store(last=CHANGE + timedelta(days=15))
        _, comparison = self._comparison()
        before = comparison["views"]["before"]["basal"]
        after = comparison["views"]["after"]["basal"]
        # Before: suspended for one hour of the three, programmed 0.9 throughout.
        self.assertEqual(before, {"minutes": 180 * 20, "delivered": 0.6, "programmed": 0.9,
                                  "above": 0.0, "below": 33.3})
        self.assertEqual({k: after[k] for k in ("delivered", "programmed", "above", "below")},
                         {"delivered": 0.84, "programmed": 0.7, "above": 100.0, "below": 0.0})
        # The rows read the same windows the glucose does: a minute a reading.
        tir = next(row for row in comparison["outcomes"] if row["key"] == "tir")
        self.assertEqual(before["minutes"], 5 * tir["denominators"]["before"])

    def test_a_carb_ratio_trace_is_aligned_at_each_in_block_meal_bolus(self):
        # Lunch at 12:00 (in the 11:00–14:00 block) and dinner at 18:00 (outside
        # it) every day; glucose rises to 200 for two hours after each lunch.
        def glucose(t):
            minutes = t.hour * 60 + t.minute - 720
            return 200 if 0 <= minutes < 120 else 120

        # One lunch after the change has no reading in the half hour before it.
        gap_day = CHANGE.date() + timedelta(days=3)
        gap = (datetime.combine(gap_day, datetime.min.time()) + timedelta(hours=11, minutes=30),
               datetime.combine(gap_day, datetime.min.time()) + timedelta(hours=12, minutes=30))
        self._store(_RATIO_BEFORE, _RATIO_AFTER, last=CHANGE + timedelta(days=6), glucose=glucose,
                    meals=(12, 18), gap=gap)
        trial, comparison = self._comparison()
        self.assertEqual((trial["parameter"], trial["block"]), ("carb_ratio", [660, 840]))
        before = comparison["views"]["before"]["trace"]
        self.assertEqual({k: before[k] for k in ("alignment", "start", "end", "bin_minutes")},
                         {"alignment": "meal", "start": -30, "end": 240, "bin_minutes": 5})
        self.assertNotIn("start_min", before)
        # Every in-block lunch before the change; none of the dinners.
        self.assertEqual(before["episodes"], comparison["denominators"]["before"]["contributing_meals"])
        bins = {row["t"]: row["median"] for row in before["bins"]}
        self.assertEqual((bins[-30], bins[60], bins[180]), (120.0, 200.0, 120.0))
        after = comparison["views"]["after"]["trace"]
        # Six lunches after the change, the one with the gap left off.
        self.assertEqual(comparison["denominators"]["after"]["contributing_meals"], 6)
        self.assertEqual((after["episodes"], after["left_off"]), (5, 1))
        # A carb ratio Trial has no basal module.
        self.assertNotIn("basal", comparison["views"]["after"])

    def test_every_count_changes_prints_names_one_population(self):
        """#575, Connor on the phone, of Meals before 74 / after 5 above a trace
        legend of Before 71 / After 4: "The meal numbers disagree??". A meal the
        trace leaves off is still one of the arm's meals, so an arm's drawn and
        left-off meals are exactly the meals the Trial card counts; and every
        metric row is read from the arm's one set of readings, the Readings
        both glucose modules print."""
        gap_day = CHANGE.date() + timedelta(days=2)
        gap = (datetime.combine(gap_day, datetime.min.time()) + timedelta(hours=11, minutes=30),
               datetime.combine(gap_day, datetime.min.time()) + timedelta(hours=12))
        self._store(_RATIO_BEFORE, _RATIO_AFTER, last=CHANGE + timedelta(days=5),
                    glucose=lambda t: 140, meals=(12, 18), gap=gap)
        _, comparison = self._comparison()
        for arm, left_off in (("before", 0), ("after", 1)):
            with self.subTest(arm=arm):
                trace = comparison["views"][arm]["trace"]
                denominators = comparison["denominators"][arm]
                self.assertEqual(trace["left_off"], left_off)
                self.assertEqual(trace["episodes"] + trace["left_off"], denominators["contributing_meals"])
                printed = ("tir", "tbr", "tar", "mean", "gmi", "cv")
                self.assertEqual({row["key"]: row["denominators"][arm] for row in comparison["outcomes"]
                                  if row["key"] in printed},
                                 dict.fromkeys(printed, denominators["readings"]))


class PreviousChangesTest(unittest.TestCase):
    """The roster serves what each previous change's row prints without a
    detail read per change: a whole-profile switch's constituent settings."""

    def test_a_whole_profile_switch_names_its_constituent_settings_on_the_roster(self):
        from tests.test_trial_evidence import _seed_profile_switch
        with tempfile.TemporaryDirectory() as directory:
            path = directory + "/synthetic.sqlite"
            _seed_profile_switch(path)
            with Store.open(path) as store:
                reconcile_ingested_follow_up(store)
            client = TestClient(create_app(db_path=path, token=None, enable_fetch_loop=False))
            trials = client.get("/api/verify/trials").json()["trials"]
        profile = next(t for t in trials if t["parameter"] == "profile")
        changes = {c["parameter"]: c for c in profile["changes"]}
        self.assertEqual((changes["basal_rate"]["before"], changes["basal_rate"]["after"]), (0.6, 0.8))
        self.assertEqual((changes["isf"]["before"], changes["isf"]["after"]), (40, 36))
        self.assertEqual(changes["basal_rate"]["slot"], "00:00")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
