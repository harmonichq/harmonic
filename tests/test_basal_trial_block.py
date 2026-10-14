"""A basal Trial is measured across the whole time block its pump change moved (#506).

Connor, 2026-10-14: a Trial can cover more than a 30-minute block — "I could
change my insulin to carb ratio from noon to seven, and that would cover more
than just a 30-minute block." Before this, a basal pump change was read only
over its starting slot, so a 02:00–05:00 change was judged on 02:00–02:30, before
the insulin acts, and the lows it targets at 04:00–05:00 were never seen.

Every store here is synthetic: two settings reads either side of an in-place
basal edit, five-minute CGM manufactured night by night, reconciled through the
ingestion path and read through ``GET /api/verify/trials``.
"""

import json
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
LAST_READING = CHANGE + timedelta(days=15)


def _profile(segments):
    """``segments`` is ``[(start_min, basal), ...]``; every other setting is flat."""
    return ProfileSettings(idp=1, name="1", dia_min=300, carb_entry=True, max_bolus=15.0,
                           segments=tuple(ProfileSegment(start, basal, 40, 5.0, 110)
                                          for start, basal in segments))


# The 02:00–05:00 basal rate moves 0.9 → 0.7; the rest of the day stays at 0.6.
_SMALL_HOURS_BEFORE = ((0, 0.6), (120, 0.9), (300, 0.6))
_SMALL_HOURS_AFTER = ((0, 0.6), (120, 0.7), (300, 0.6))
# The 22:00–02:00 basal rate, across midnight, moves 0.9 → 0.7.
_ACROSS_MIDNIGHT_BEFORE = ((0, 0.9), (120, 0.6), (1320, 0.9))
_ACROSS_MIDNIGHT_AFTER = ((0, 0.7), (120, 0.6), (1320, 0.7))


class BasalTrialBlockTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = self.directory.name + "/synthetic.sqlite"
        with Store.open(self.path):
            pass
        self.client = TestClient(create_app(db_path=self.path, token=None, enable_fetch_loop=False))

    def _store(self, before, after, *, low_minutes):
        """Two reads either side of the edit, and five-minute CGM at 120 mg/dL
        except 62 mg/dL on every night before the change inside ``low_minutes``."""
        lo, hi = low_minutes
        rows, t = [], FIRST_READ - timedelta(days=1)
        while t < LAST_READING:
            minute = t.hour * 60 + t.minute
            low = t < CHANGE and lo <= minute < hi
            rows.append({"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                         "Readings (CGM / BGM)": 62 if low else 120, "Description": "EGV"})
            t += timedelta(minutes=5)
        with Store.open(self.path) as store:
            store.upsert_settings_snapshot(FIRST_READ.strftime(_FMT), PumpSettings(1, (_profile(before),)))
            store.upsert_settings_snapshot(CHANGE.strftime(_FMT), PumpSettings(1, (_profile(after),)))
            store.upsert_cgm(rows)
            reconcile_ingested_follow_up(store)

    def _trial(self):
        response = self.client.get("/api/verify/trials")
        self.assertEqual(response.status_code, 200, response.text)
        trials = response.json()["trials"]
        self.assertEqual(len(trials), 1, trials)
        return trials[0]

    def _comparison(self, trial_id):
        response = self.client.get("/api/verify/trials",
                                   params={"selected": trial_id, "assessment": "retained"})
        self.assertEqual(response.status_code, 200, response.text)
        selected = response.json()["selected"]
        return selected, selected["reassessment"]["comparison"]

    def _outcomes(self, comparison):
        return {row["key"]: row for row in comparison["outcomes"]}

    def test_lows_late_in_the_block_are_read_into_the_target_metric(self):
        self._store(_SMALL_HOURS_BEFORE, _SMALL_HOURS_AFTER, low_minutes=(240, 300))
        trial = self._trial()
        self.assertEqual((trial["parameter"], trial["slot"]), ("basal_rate", "02:00"))
        self.assertEqual(trial["target_metrics"], ["tbr"])

        selected, comparison = self._comparison(trial["id"])
        outcomes = self._outcomes(comparison)
        # Lows fill 04:00–05:00, one hour of the three-hour block, every night
        # before the change and none after.
        self.assertEqual(outcomes["tbr"]["before"], 33.3)
        self.assertEqual(outcomes["tbr"]["after"], 0.0)
        self.assertEqual(outcomes["nights_with_low"]["before"], 100.0)
        self.assertEqual(outcomes["nights_with_low"]["after"], 0.0)
        # Every reading in the three-hour block, 36 a night, is in the population.
        self.assertEqual(outcomes["tbr"]["denominators"]["before"], 36 * 20)
        # The served Trial evidence reads its target over the same block.
        tbr = next(row for row in selected["evidence"] if row["key"] == "tbr")
        self.assertEqual((tbr["role"], tbr["before"]["value"], tbr["trial"]["value"]),
                         ("target", 33.3, 0.0))

    def test_readiness_counts_every_slot_the_block_covers(self):
        self._store(_SMALL_HOURS_BEFORE, _SMALL_HOURS_AFTER, low_minutes=(240, 300))
        _, comparison = self._comparison(self._trial()["id"])
        for arm in ("before", "after"):
            self.assertEqual([row["slot"] for row in comparison["readiness"][arm]["slots"]],
                             [4, 5, 6, 7, 8, 9])

    def test_a_block_across_midnight_is_read_on_both_sides_of_it(self):
        self._store(_ACROSS_MIDNIGHT_BEFORE, _ACROSS_MIDNIGHT_AFTER, low_minutes=(60, 120))
        trial = self._trial()
        self.assertEqual(trial["slot"], "22:00")
        _, comparison = self._comparison(trial["id"])
        outcomes = self._outcomes(comparison)
        # 01:00–02:00 of the four-hour 22:00–02:00 block runs low before the change.
        self.assertEqual(outcomes["tbr"]["before"], 25.0)
        self.assertEqual(outcomes["tbr"]["after"], 0.0)
        self.assertEqual(comparison["readiness"]["after"]["slots"][0]["slot"], 0)
        self.assertEqual(sorted(row["slot"] for row in comparison["readiness"]["after"]["slots"]),
                         [0, 1, 2, 3, 44, 45, 46, 47])

    def test_the_record_keeps_its_slotted_id_and_carries_its_block(self):
        self._store(_SMALL_HOURS_BEFORE, _SMALL_HOURS_AFTER, low_minutes=(240, 300))
        trial = self._trial()
        self.assertEqual(trial["id"], "basal_rate-02-00-20260620090000")
        with Store.open_readonly(self.path) as store:
            record = store.follow_up_record("trial", trial["id"])
        self.assertEqual(list(record["block"]), [120, 300])
        self.assertIsNone(record["members"])

    def test_the_served_trial_carries_its_block(self):
        # A reader matches a queued basal block to the Trial whose block it lies
        # in, so the served Trial names its block, not only its starting slot.
        self._store(_SMALL_HOURS_BEFORE, _SMALL_HOURS_AFTER, low_minutes=(240, 300))
        self.assertEqual(self._trial()["block"], [120, 300])

    def test_the_served_trial_carries_a_block_across_midnight(self):
        self._store(_ACROSS_MIDNIGHT_BEFORE, _ACROSS_MIDNIGHT_AFTER, low_minutes=(60, 120))
        self.assertEqual(self._trial()["block"], [1320, 120])

    def test_a_record_saved_without_its_block_is_served_with_it(self):
        self._store(_SMALL_HOURS_BEFORE, _SMALL_HOURS_AFTER, low_minutes=(240, 300))
        trial_id = self._trial()["id"]
        with Store.open(self.path) as store:
            row = store.conn.execute("SELECT record_json FROM follow_up_records WHERE kind = 'trial' AND id = ?",
                                     (trial_id,)).fetchone()
            store.conn.execute("UPDATE follow_up_records SET record_json = ? WHERE kind = 'trial' AND id = ?",
                               (json.dumps({**json.loads(row["record_json"]), "block": None}), trial_id))
            store.conn.commit()
        self.assertEqual(self._trial()["block"], [120, 300])

    def test_a_record_saved_without_its_block_is_measured_across_the_block(self):
        # A record an earlier build saved at the pump change carries no block. It
        # keeps its id and is measured over the block its own two reads show.
        self._store(_SMALL_HOURS_BEFORE, _SMALL_HOURS_AFTER, low_minutes=(240, 300))
        trial_id = self._trial()["id"]
        with Store.open(self.path) as store:
            row = store.conn.execute("SELECT record_json FROM follow_up_records WHERE kind = 'trial' AND id = ?",
                                     (trial_id,)).fetchone()
            record = {**json.loads(row["record_json"]), "block": None}
            store.conn.execute("UPDATE follow_up_records SET record_json = ? WHERE kind = 'trial' AND id = ?",
                               (json.dumps(record), trial_id))
            store.conn.commit()
            reconcile_ingested_follow_up(store)
            self.assertIsNone(store.follow_up_record("trial", trial_id)["block"])

        self.assertEqual(self._trial()["id"], trial_id)
        _, comparison = self._comparison(trial_id)
        self.assertEqual(self._outcomes(comparison)["tbr"]["before"], 33.3)
        self.assertEqual([row["slot"] for row in comparison["readiness"]["after"]["slots"]],
                         [4, 5, 6, 7, 8, 9])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
