"""A basal change seen only in delivery history is one Trial per changed block (#510).

Connor, 2026-10-14 (Q39), on a basal change the delivery feed alone shows,
which was one Trial per 30-minute slot: "They should be grouped." A 02:00–05:00
change is one Trial carrying its block, measured across the block exactly as a
change read from two settings reads is (ADR 506).

Every store is a manufactured QA case store (``scripts/qa_e2e_cases.py``): the
programmed 02:00–05:00 rate falls from 0.9 to 0.7 units an hour on the basal feed alone, first
delivered at 02:00 on 2024-05-21, with CGM low from 04:00 to 05:00 on every
night before the change. The legacy cases hold the six per-slot records an
earlier build saved for that change. Everything is read through
``GET /api/verify/trials``.
"""

import json
import tempfile
import unittest

from fastapi.testclient import TestClient

from ciq_autotune.api import create_app
from ciq_autotune.store import Store
from ciq_autotune.watched_change import reconcile_ingested_follow_up

BLOCK_ID = "basal_rate-02-00-20240521020000"
FINISHED_ID = "basal_rate-04-30-20240521043000"
SLOT_IDS = [f"basal_rate-{h:02d}-{m:02d}-20240521{h:02d}{m:02d}00"
            for h, m in ((2, 0), (2, 30), (3, 0), (3, 30), (4, 0), (4, 30))]


class DeliveryBasalBlockTest(unittest.TestCase):
    def _case(self, name):
        from scripts.qa_e2e_cases import QA_CASES, materialize_case
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = directory.name + "/case.sqlite"
        with Store.open(self.path) as store:
            materialize_case(store, next(case for case in QA_CASES if case.name == name))
        self.client = TestClient(create_app(db_path=self.path, token=None, enable_fetch_loop=False))

    def _roster(self):
        response = self.client.get("/api/verify/trials")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def _trial(self):
        trials = self._roster()["trials"]
        self.assertEqual(len(trials), 1, [row["id"] for row in trials])
        return trials[0]

    def _selected(self, trial_id):
        response = self.client.get("/api/verify/trials",
                                   params={"selected": trial_id, "assessment": "retained"})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["selected"]

    def _records(self):
        with Store.open_readonly(self.path) as store:
            return {record["id"]: record for record in store.follow_up_records("trial")}

    def _assert_measured_across_the_block(self, trial_id, *, tbr_before=33.3, nights_before=100.0,
                                          evidence_before=33.3):
        selected = self._selected(trial_id)
        comparison = selected["reassessment"]["comparison"]
        outcomes = {row["key"]: row for row in comparison["outcomes"]}
        # Lows fill 04:00–05:00, one hour of the three-hour block, on every night
        # before the change and none after; one slot alone would read 0% or 100%.
        self.assertEqual((outcomes["tbr"]["before"], outcomes["tbr"]["after"]), (tbr_before, 0.0))
        self.assertEqual(outcomes["nights_with_low"]["before"], nights_before)
        for arm in ("before", "after"):
            self.assertEqual([row["slot"] for row in comparison["readiness"][arm]["slots"]],
                             [4, 5, 6, 7, 8, 9])
        tbr = next(row for row in selected["evidence"] if row["key"] == "tbr")
        self.assertEqual((tbr["role"], tbr["before"]["value"], tbr["trial"]["value"]),
                         ("target", evidence_before, 0.0))
        return selected

    def test_a_delivery_only_change_is_one_trial_across_its_block(self):
        self._case("delivery-basal-block")
        trial = self._trial()
        self.assertEqual((trial["id"], trial["parameter"], trial["slot"], trial["block"]),
                         (BLOCK_ID, "basal_rate", "02:00", [120, 300]))
        self.assertEqual((trial["changed_at"], trial["before"], trial["after"]),
                         ("2024-05-21 02:00:00", 0.9, 0.7))
        self._assert_measured_across_the_block(trial["id"])
        records = self._records()
        self.assertEqual(list(records), [BLOCK_ID])
        self.assertEqual(records[BLOCK_ID]["block"], [120, 300])

    def test_a_block_across_midnight_is_one_trial_read_on_both_sides_of_it(self):
        # 22:00–02:00 moves; the new rate is first delivered at 22:00 on 05-20.
        self._case("delivery-basal-across-midnight")
        trial = self._trial()
        self.assertEqual((trial["id"], trial["slot"], trial["block"]),
                         ("basal_rate-22-00-20240520220000", "22:00", [1320, 120]))
        comparison = self._selected(trial["id"])["reassessment"]["comparison"]
        outcomes = {row["key"]: row for row in comparison["outcomes"]}
        # 01:00–02:00 of the four-hour block runs low on every night before.
        self.assertEqual((outcomes["tbr"]["before"], outcomes["tbr"]["after"]), (25.0, 0.0))
        self.assertEqual(sorted(row["slot"] for row in comparison["readiness"]["after"]["slots"]),
                         [0, 1, 2, 3, 44, 45, 46, 47])

    def test_a_change_over_the_whole_day_is_one_whole_day_trial(self):
        self._case("delivery-basal-whole-day")
        trial = self._trial()
        self.assertEqual((trial["id"], trial["slot"], trial["block"]),
                         ("basal_rate-all-20240521000000", None, None))
        selected = self._selected(trial["id"])
        comparison = selected["reassessment"]["comparison"]
        self.assertEqual(comparison["availability"]["state"], "available")
        self.assertEqual([row["slot"] for row in comparison["readiness"]["after"]["slots"]],
                         list(range(48)))
        # The served evidence reads the whole day: one low hour in twenty-four.
        tbr = next(row for row in selected["evidence"] if row["key"] == "tbr")
        self.assertEqual((tbr["before"]["value"], tbr["trial"]["value"]), (4.2, 0.0))

    def test_the_block_trial_keeps_its_identity_across_fetches(self):
        self._case("delivery-basal-block")
        with Store.open(self.path) as store:
            reconcile_ingested_follow_up(store)
            reconcile_ingested_follow_up(store)
        self.assertEqual(self._trial()["id"], BLOCK_ID)
        self.assertEqual(list(self._records()), [BLOCK_ID])
        self.assertEqual(self._roster()["admission"]["active_id"], BLOCK_ID)

    def test_legacy_slot_records_are_served_as_one_trial_with_their_ending(self):
        self._case("delivery-basal-legacy")
        before = self._records()
        self.assertEqual(sorted(before), sorted(SLOT_IDS))
        trial = self._trial()
        # Served under the record the person finished, with its saved ending.
        self.assertEqual((trial["id"], trial["block"]), (FINISHED_ID, [120, 300]))
        self.assertEqual(trial["ending"]["kind"], "user_finished")
        self.assertEqual(trial["ending"]["conclusion"],
                         "Synthetic observation: the early-morning lows stopped.")
        self.assertEqual(trial["edit"], f"edit-{FINISHED_ID}")
        self.assertEqual(self._roster()["edits"][0]["count"], 1)
        # It keeps its own 04:30 dating, so its before periods end with the
        # in-range 02:00–04:30 of the change's first night: 31.9% over the
        # comparison's 20 nights (19 with a low), 32.1% over the evidence's 14.
        selected = self._assert_measured_across_the_block(FINISHED_ID, tbr_before=31.9,
                                                          nights_before=95.0, evidence_before=32.1)
        self.assertEqual(selected["original"]["ending"]["kind"], "user_finished")
        # A hidden sibling's id still opens the one served Trial.
        self.assertEqual(self._selected(SLOT_IDS[0])["id"], FINISHED_ID)

        # Another fetch records nothing new and rewrites no record.
        with Store.open(self.path) as store:
            reconcile_ingested_follow_up(store)
        after = self._records()
        self.assertEqual(sorted(after), sorted(SLOT_IDS))
        self.assertEqual(json.dumps(after, sort_keys=True), json.dumps(before, sort_keys=True))
        self.assertTrue(all(record["block"] is None for record in after.values()))
        self.assertEqual(self._trial()["id"], FINISHED_ID)

    def test_an_open_legacy_change_is_served_from_its_block_start_and_is_the_active_trial(self):
        self._case("delivery-basal-legacy-open")
        trial = self._trial()
        self.assertEqual((trial["id"], trial["slot"], trial["block"]), (SLOT_IDS[0], "02:00", [120, 300]))
        # The earlier build admitted the 04:30 record; the served Trial is the active one.
        admission = self._roster()["admission"]
        self.assertEqual((admission["active_kind"], admission["active_id"]), ("trial", SLOT_IDS[0]))
        self.assertEqual(trial["watch_disposition"], "active")
        self._assert_measured_across_the_block(SLOT_IDS[0])

        response = self.client.post(f"/api/verify/trials/{SLOT_IDS[0]}/finish", json={
            "request_id": "finish-legacy-block", "input_revision": admission_revision(self.path),
            "conclusion": "Synthetic observation: kept."})
        self.assertEqual(response.status_code, 200, response.text)
        trial = self._trial()
        self.assertEqual((trial["id"], trial["ending"]["kind"]), (SLOT_IDS[0], "user_finished"))
        self.assertEqual(sorted(self._records()), sorted(SLOT_IDS))


def admission_revision(path):
    with Store.open_readonly(path) as store:
        return store.input_data_revision()


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
