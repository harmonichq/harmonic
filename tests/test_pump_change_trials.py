"""A change made on the pump is a Trial whether or not a Plan proposed it (#500).

Connor: "Don't throw something away just because it wasn't started in-app. User
making profile changes on pump is authoritative and ends any existing trial or
focus." Every store here is built from settings snapshots alone, reconciled
through the ingestion path, and read through ``GET /api/verify/trials``. No Plan
is recorded anywhere in this file.
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
FIRST_READ = datetime(2026, 6, 4, 9)
CHANGE = datetime(2026, 6, 5, 9)


def _profile(idp, segments):
    """``segments`` is ``[(start_min, basal, isf, ic, target), ...]``."""
    return ProfileSettings(idp=idp, name=str(idp), dia_min=300, carb_entry=True, max_bolus=15.0,
                           segments=tuple(ProfileSegment(*row) for row in segments))


# Midnight-to-midnight at one value for every setting, then the same profile with
# only the 12:00–15:00 carb ratio moved 5.0 → 4.4.
_FLAT = ((0, 0.6, 40, 5.0, 110),)
_IC_BLOCK = ((0, 0.6, 40, 5.0, 110), (720, 0.6, 40, 4.4, 110), (900, 0.6, 40, 5.0, 110))
# Only the 06:00–09:00 basal rate moved 0.6 → 0.75.
_BASAL_BLOCK = ((0, 0.6, 40, 5.0, 110), (360, 0.75, 40, 5.0, 110), (540, 0.6, 40, 5.0, 110))
# Basal and correction factor both moved in one edit.
_TWO_SETTINGS = ((0, 0.6, 40, 5.0, 110), (360, 0.75, 45, 5.0, 110), (540, 0.6, 40, 5.0, 110))


class PumpChangeTrialTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = self.directory.name + "/synthetic.sqlite"
        with Store.open(self.path):
            pass
        self.client = TestClient(create_app(db_path=self.path, token=None, enable_fetch_loop=False))

    def _read(self, at, settings, *, cgm_until=None):
        """Record one settings read, with CGM through ``cgm_until``, and reconcile."""
        with Store.open(self.path) as store:
            store.upsert_settings_snapshot(at.strftime(_FMT), settings)
            start, end = FIRST_READ - timedelta(days=14), cgm_until or at + timedelta(hours=1)
            rows, t = [], start
            while t < end:
                rows.append({"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                             "Readings (CGM / BGM)": 120, "Description": "EGV"})
                t += timedelta(minutes=30)
            store.upsert_cgm(rows)
            reconcile_ingested_follow_up(store)

    def _roster(self, **params):
        response = self.client.get("/api/verify/trials", params=params)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _only_trial(self, roster):
        self.assertEqual(len(roster["trials"]), 1, roster["trials"])
        return roster["trials"][0]

    def test_single_block_carb_ratio_switch_without_a_plan_is_the_active_trial(self):
        old, new = _profile(1, _FLAT), _profile(2, _IC_BLOCK)
        self._read(FIRST_READ, PumpSettings(1, (old, new)))
        self._read(CHANGE, PumpSettings(2, (old, new)))

        roster = self._roster()
        trial = self._only_trial(roster)
        self.assertEqual((trial["parameter"], trial["slot"]), ("carb_ratio", "12:00"))
        self.assertEqual((trial["before"], trial["after"]), (5.0, 4.4))
        self.assertEqual(trial["changed_at"], CHANGE.strftime(_FMT))
        self.assertEqual((roster["admission"]["active_kind"], roster["admission"]["active_id"]),
                         ("trial", trial["id"]))
        self.assertEqual(trial["watch_disposition"], "active")
        detail = self._roster(selected=trial["id"])["selected"]
        self.assertEqual(detail["meal_arcs"]["block"], [720, 900])

    def test_in_place_edit_of_the_active_profile_is_a_trial(self):
        self._read(FIRST_READ, PumpSettings(1, (_profile(1, _FLAT),)))
        self._read(CHANGE, PumpSettings(1, (_profile(1, _BASAL_BLOCK),)))

        roster = self._roster()
        trial = self._only_trial(roster)
        self.assertEqual((trial["parameter"], trial["slot"]), ("basal_rate", "06:00"))
        self.assertEqual((trial["before"], trial["after"]), (0.6, 0.75))
        self.assertEqual(trial["changed_at"], CHANGE.strftime(_FMT))
        self.assertEqual(roster["admission"]["active_id"], trial["id"])

    def test_an_edit_to_an_inactive_profile_is_not_a_trial(self):
        active = _profile(1, _FLAT)
        self._read(FIRST_READ, PumpSettings(1, (active, _profile(2, _FLAT))))
        self._read(CHANGE, PumpSettings(1, (active, _profile(2, _IC_BLOCK))))

        roster = self._roster()
        self.assertEqual(roster["trials"], [])
        self.assertEqual(roster["admission"]["reason"], "no_active_change")

    def test_an_in_place_split_that_moves_no_value_is_not_a_trial(self):
        split = ((0, 0.6, 40, 5.0, 110), (720, 0.6, 40, 5.0, 110))
        self._read(FIRST_READ, PumpSettings(1, (_profile(1, _FLAT),)))
        self._read(CHANGE, PumpSettings(1, (_profile(1, split),)))

        roster = self._roster()
        self.assertEqual(roster["trials"], [])
        self.assertEqual(roster["admission"]["reason"], "no_active_change")

    def test_a_change_to_two_settings_is_one_whole_profile_trial(self):
        for name, first, second in (
                ("switch", PumpSettings(1, (_profile(1, _FLAT), _profile(2, _TWO_SETTINGS))),
                 PumpSettings(2, (_profile(1, _FLAT), _profile(2, _TWO_SETTINGS)))),
                ("in-place edit", PumpSettings(1, (_profile(1, _FLAT),)),
                 PumpSettings(1, (_profile(1, _TWO_SETTINGS),)))):
            with self.subTest(name):
                self.setUp()
                self._read(FIRST_READ, first)
                self._read(CHANGE, second)
                roster = self._roster()
                trial = self._only_trial(roster)
                self.assertEqual((trial["parameter"], trial["slot"]), ("profile", None))
                self.assertEqual(trial["changed_at"], CHANGE.strftime(_FMT))
                self.assertEqual(roster["admission"]["active_id"], trial["id"])

    def test_a_pump_change_ends_the_active_trial_and_becomes_the_active_trial(self):
        later = CHANGE + timedelta(days=5)
        self._read(FIRST_READ, PumpSettings(1, (_profile(1, _FLAT),)))
        self._read(CHANGE, PumpSettings(1, (_profile(1, _BASAL_BLOCK),)))
        first = self._only_trial(self._roster())

        edited = ((0, 0.6, 40, 5.0, 110), (360, 0.75, 40, 5.0, 110), (540, 0.6, 40, 5.0, 110),
                  (720, 0.6, 40, 4.4, 110), (900, 0.6, 40, 5.0, 110))
        self._read(later, PumpSettings(1, (_profile(1, edited),)))

        roster = self._roster()
        by_parameter = {row["parameter"]: row for row in roster["trials"]}
        self.assertEqual(set(by_parameter), {"basal_rate", "carb_ratio"})
        old, new = by_parameter["basal_rate"], by_parameter["carb_ratio"]
        self.assertEqual(old["id"], first["id"])
        self.assertEqual(old["ending"]["kind"], "superseded")
        self.assertEqual(old["ending"]["effective_at"], later.strftime(_FMT))
        self.assertNotIn("kind", new["ending"])
        self.assertEqual((new["slot"], new["before"], new["after"]), ("12:00", 5.0, 4.4))
        self.assertEqual((roster["admission"]["active_kind"], roster["admission"]["active_id"]),
                         ("trial", new["id"]))

    def test_a_pump_change_ends_the_active_focus_and_becomes_the_active_trial(self):
        from ciq_autotune.follow_up_comparison import capture_comparison_context
        profile = _profile(1, _FLAT)
        self._read(FIRST_READ, PumpSettings(1, (profile,)))
        pinned_at = FIRST_READ + timedelta(hours=2)
        with Store.open(self.path) as store:
            with store.follow_up_transaction():
                focus = store.pin_focus("late_bolus", pinned_at.strftime(_FMT))
                store.save_follow_up_record({
                    "kind": "focus", "version": "386:1", **focus,
                    "comparison_context": capture_comparison_context(
                        store, at=pinned_at, input_revision=store.input_data_revision())})
            reconcile_ingested_follow_up(store)
        self.assertEqual(self._roster()["admission"]["active_kind"], "focus")

        self._read(CHANGE, PumpSettings(1, (_profile(1, _IC_BLOCK),)))

        roster = self._roster()
        trial = self._only_trial(roster)
        self.assertEqual((trial["parameter"], trial["slot"]), ("carb_ratio", "12:00"))
        self.assertEqual((roster["admission"]["active_kind"], roster["admission"]["active_id"]),
                         ("trial", trial["id"]))
        ended = next(row for row in roster["focuses"] if row["id"] == focus["id"])
        self.assertEqual(ended["status"], "dropped")
        self.assertEqual(ended["ending"]["kind"], "trial_preempted")
        self.assertEqual(ended["ending"]["effective_at"], CHANGE.strftime(_FMT))

    def _deliver(self, start_day, days, rate_at):
        """The delivery feed on ``days`` from ``start_day``, each 30-minute slot at
        ``rate_at(its start minute)``."""
        with Store.open(self.path) as store:
            store.upsert_basal([{
                "seq_num": 1_000_000 + day * 48 + slot,
                "time": (start_day + timedelta(days=day, minutes=30 * slot + 2)).strftime(_FMT),
                "delivery_type": "algorithmDelivery", "duration_mins": 30,
                "basal_rate": rate_at(30 * slot), "profile_basal_rate": rate_at(30 * slot)}
                for day in days for slot in range(48)])

    @staticmethod
    def _rates(segments):
        return lambda minute: [row for row in segments if row[0] <= minute][-1][1]

    def test_delivery_that_carried_the_change_before_its_read_is_the_same_trial(self):
        # The pump ran the new 06:00–09:00 rate from 06:00 on 06-05; the read that
        # first shows it is the fetch at 09:00. One Trial, at the read.
        day = datetime(2026, 6, 5)
        self._read(FIRST_READ, PumpSettings(1, (_profile(1, _FLAT),)))
        self._deliver(day - timedelta(days=2), range(2), self._rates(_FLAT))
        self._deliver(day, range(1), self._rates(_BASAL_BLOCK))
        self._read(CHANGE, PumpSettings(1, (_profile(1, _BASAL_BLOCK),)), cgm_until=day + timedelta(days=1))

        trial = self._only_trial(self._roster())
        self.assertEqual((trial["parameter"], trial["slot"]), ("basal_rate", "06:00"))
        self.assertEqual(trial["changed_at"], CHANGE.strftime(_FMT))

    def test_delivery_outside_the_changed_block_stays_a_trial_of_its_own(self):
        # The read shows only 06:00–09:00 moving 0.6 → 0.75; the feed also shows
        # 18:00 moving 0.6 → 0.75, a change the read does not hold.
        day = datetime(2026, 6, 5)
        evening = _BASAL_BLOCK[:2] + ((540, 0.6, 40, 5.0, 110), (1080, 0.75, 40, 5.0, 110))
        self._read(FIRST_READ, PumpSettings(1, (_profile(1, _FLAT),)))
        self._deliver(day - timedelta(days=2), range(2), self._rates(_FLAT))
        self._deliver(day, range(1), self._rates(evening))
        self._read(CHANGE, PumpSettings(1, (_profile(1, _BASAL_BLOCK),)), cgm_until=day + timedelta(days=1))

        slots = sorted(row["slot"] for row in self._roster()["trials"])
        self.assertEqual(slots[0], "06:00")
        self.assertTrue(set(slots[1:]) and all(slot >= "18:00" for slot in slots[1:]), slots)

    def test_a_change_already_recorded_from_delivery_is_not_recorded_twice(self):
        # A fetch brought the delivery feed but not its settings read, so the edit
        # was recorded at its first delivery observation; the read that arrives
        # next adds no second record for the same change.
        day = datetime(2026, 6, 5)
        self._deliver(day - timedelta(days=2), range(2), self._rates(_FLAT))
        self._deliver(day, range(1), self._rates(_BASAL_BLOCK))
        self._read(FIRST_READ, PumpSettings(1, (_profile(1, _FLAT),)), cgm_until=day + timedelta(days=1))
        recorded = sorted(row["id"] for row in self._roster()["trials"])
        self.assertTrue(recorded and all(row.startswith("basal_rate-0") for row in recorded), recorded)

        self._read(CHANGE + timedelta(hours=1), PumpSettings(1, (_profile(1, _BASAL_BLOCK),)),
                   cgm_until=day + timedelta(days=1))
        self.assertEqual(sorted(row["id"] for row in self._roster()["trials"]), recorded)

    def test_a_walk_back_closes_both_sides(self):
        back = CHANGE + timedelta(days=2)
        for name, before, changed in (
                ("switch", PumpSettings(1, (_profile(1, _FLAT), _profile(2, _IC_BLOCK))),
                 PumpSettings(2, (_profile(1, _FLAT), _profile(2, _IC_BLOCK)))),
                ("in-place edit", PumpSettings(1, (_profile(1, _FLAT),)),
                 PumpSettings(1, (_profile(1, _IC_BLOCK),)))):
            with self.subTest(name):
                self.setUp()
                self._read(FIRST_READ, before)
                self._read(CHANGE, changed)
                opened = self._only_trial(self._roster())
                self._read(back, before)

                roster = self._roster()
                trial = self._only_trial(roster)
                self.assertEqual(trial["id"], opened["id"])
                self.assertEqual(trial["ending"]["kind"], "reverted")
                self.assertEqual(trial["ending"]["effective_at"], back.strftime(_FMT))
                self.assertEqual(roster["admission"]["reason"], "no_active_change")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
