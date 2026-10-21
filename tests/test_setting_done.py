"""#518: Done on a Queue Setting card records an acknowledgment that the person
programmed the setting into the pump. It waits for the pump; the first sync
after it decides it. A changed setting is the pump change's Trial; an unchanged
one returns the card to the Queue marked Not on pump.

Every store here is the manufactured QA case `basal-raise` plus synthetic
settings reads and delivery rows written after the acknowledgment; no source
data or generated files.
"""
import tempfile
import time
import unittest
from dataclasses import replace
from unittest import mock
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from ciq_autotune.api import create_app
from ciq_autotune.store import Store
from ciq_autotune.watched_change import reconcile_ingested_follow_up

FMT = "%Y-%m-%d %H:%M:%S"
SUBJECT = "setting:basal_rate"


def stamp(when):
    return when.strftime(FMT)


def edited_in_place(segments, start, rate):
    """The same profile with one 30-minute basal slot reprogrammed."""
    def segment_at(minute):
        return [s for s in segments if s.start_min <= minute][-1]
    starts = sorted({s.start_min for s in segments} | {start, start + 30})
    return tuple(replace(segment_at(m), start_min=m,
                         basal_rate=rate if start <= m < start + 30 else segment_at(m).basal_rate)
                 for m in starts)


class DoneCase(unittest.TestCase):
    CASE = "basal-raise"

    def setUp(self):
        from scripts.qa_e2e_cases import QA_CASES, materialize_case
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = directory.name + "/synthetic.sqlite"
        with Store.open(self.path) as store:
            materialize_case(store, next(case for case in QA_CASES if case.name == self.CASE))
            reconcile_ingested_follow_up(store)
            self.source = store.settings_snapshots()[-1].settings.active().segments
            # The server's clock stands an hour after the case's data, so a Done
            # and the reads after it fall inside the analysis window.
            self.now = store.latest_cgm_or_basal_timestamp() + timedelta(hours=1)
        clock = mock.patch("ciq_autotune.api.wall_clock_now", lambda after=None: (
            max(self.now, after + timedelta(seconds=1)) if after else self.now))
        clock.start()
        self.addCleanup(clock.stop)
        self.client = TestClient(create_app(
            db_path=self.path, token="synthetic-token", enable_fetch_loop=False))
        self.headers = {"Authorization": "Bearer synthetic-token"}

    def get(self, route):
        response = self.client.get(route, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def candidate(self, subject=SUBJECT):
        return next(row for row in self.get("/api/guidance")["candidates"] if row["subject"] == subject)

    def done(self, subject=SUBJECT):
        guidance = self.get("/api/guidance")
        return self.client.post("/api/plan/apply", headers=self.headers, json={
            "request_id": f"done-{time.time_ns()}", "input_revision": guidance["input_revision"],
            "subject": subject, "analysis_generation": guidance["analysis_generation"]})

    def undo(self, record):
        revision = self.get("/api/plan/history")["input_revision"]
        return self.client.post("/api/plan/history/withdraw", headers=self.headers, json={
            "request_id": f"undo-{time.time_ns()}", "input_revision": revision,
            "applied_at": record["applied_at"], "reason": None})

    def write_read(self, when, segments):
        """Append one settings read whose active profile holds ``segments``."""
        with Store.open(self.path) as store:
            settings = store.settings_snapshots()[-1].settings
            profile = replace(settings.active(), segments=tuple(segments))
            store.upsert_settings_snapshot(stamp(when), replace(settings, profiles=tuple(
                profile if p.idp == settings.active_idp else p for p in settings.profiles)))

    def deliver(self, when):
        """One delivery row at ``when``: the sync carries pump data from then."""
        rate = self.source[0].basal_rate
        with Store.open(self.path) as store:
            store.upsert_basal([{"seq_num": 9_500_000, "time": stamp(when), "delivery_type": "profileDelivery",
                                 "duration_mins": 5, "basal_rate": rate, "profile_basal_rate": rate}])

    def sync(self):
        with Store.open(self.path) as store:
            reconcile_ingested_follow_up(store)

    def trials(self):
        with Store.open_readonly(self.path) as store:
            return store.follow_up_records("trial")

    def history_row(self, record):
        return next(row for row in self.get("/api/plan/history")["history"]
                    if row["applied_at"] == record["applied_at"])


class DoneTest(DoneCase):
    def test_done_waits_for_the_pump_and_leaves_the_queue(self):
        before = self.candidate()
        self.assertTrue(before["admitted"], "premise: the basal card is queued")
        self.assertIsNone(before["acknowledgment"])
        response = self.done()
        self.assertEqual(response.status_code, 200, response.text)
        record = response.json()["record"]
        action = before["action"]
        self.assertEqual([item["start_min"] for item in record["items"]], [a["start_min"] for a in action])
        self.assertEqual([item["value"] for item in record["items"]], [a["recommended"] for a in action])
        acknowledgment = self.candidate()["acknowledgment"]
        self.assertEqual(acknowledgment["state"], "waiting")
        self.assertEqual(acknowledgment["applied_at"], record["applied_at"])
        self.assertIsNone(acknowledgment["read_at"])
        current = [s for s in self.source if s.start_min <= action[0]["start_min"]][-1].basal_rate
        # The block as the card shows it: the first run of adjacent actions at one suggestion.
        end = action[0]["end_min"]
        for row in action[1:]:
            if row["start_min"] == end and row["recommended"] == action[0]["recommended"]:
                end = row["end_min"]
        self.assertEqual(acknowledgment["blocks"][0], {
            "start_min": action[0]["start_min"], "end_min": end,
            "current": current, "recommended": action[0]["recommended"], "units": "U/h"})
        self.assertEqual(self.history_row(record)["verdict"], {"state": "waiting", "read_at": None})
        # Changes lists it from the Trial roster, which it reads instead of the guidance (#524).
        self.assertEqual(self.get("/api/verify/trials")["waiting"], [
            {"subject": SUBJECT, "parameter": "basal_rate", "acknowledgment": acknowledgment}])
        # One Done per card: a second while it waits is refused.
        self.assertEqual(self.done().json()["detail"]["code"], "ineligible_source")
        # A Done does not hold a Pin back.
        self.assertTrue(self.get("/api/guidance")["admission"]["focus_pin"]["available"])

    def test_undo_takes_the_done_back(self):
        record = self.done().json()["record"]
        response = self.undo(record)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(self.candidate()["acknowledgment"])
        self.assertEqual(self.get("/api/verify/trials")["waiting"], [])
        self.assertEqual(self.history_row(record)["verdict"]["state"], "withdrawn")
        self.assertEqual(self.undo(record).status_code, 200, "a repeated Undo is the same answer")
        self.assertEqual(self.done().status_code, 200, "the card can be Done again")

    def test_a_read_without_pump_data_after_the_done_keeps_it_waiting(self):
        record = self.done().json()["record"]
        applied = datetime.fromisoformat(record["applied_at"])
        self.write_read(applied + timedelta(minutes=5), self.source)
        self.sync()
        self.assertEqual(self.candidate()["acknowledgment"]["state"], "waiting")

    def test_a_later_sync_with_the_setting_unchanged_returns_the_card_not_on_pump(self):
        record = self.done().json()["record"]
        applied = datetime.fromisoformat(record["applied_at"])
        self.deliver(applied + timedelta(minutes=10))
        self.write_read(applied + timedelta(minutes=30), self.source)
        self.sync()
        acknowledgment = self.candidate()["acknowledgment"]
        self.assertEqual((acknowledgment["state"], acknowledgment["read_at"]),
                         ("not_on_pump", stamp(applied + timedelta(minutes=30))))
        self.assertEqual(self.trials(), [])
        self.assertEqual(self.history_row(record)["verdict"],
                         {"state": "not_on_pump", "read_at": stamp(applied + timedelta(minutes=30))})
        # The card is back: the person can press Done again.
        self.assertEqual(self.done().status_code, 200)
        self.assertEqual(self.candidate()["acknowledgment"]["state"], "waiting")

    def test_not_on_pump_clears_on_a_snooze(self):
        record = self.done().json()["record"]
        applied = datetime.fromisoformat(record["applied_at"])
        self.deliver(applied + timedelta(minutes=10))
        self.write_read(applied + timedelta(minutes=30), self.source)
        self.sync()
        self.now = applied + timedelta(hours=1)
        generation = self.get("/api/guidance")["analysis_generation"]
        response = self.client.put(f"/api/guidance/preferences/{SUBJECT}", headers=self.headers,
                                   json={"generation": generation, "reason": None})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(self.candidate()["acknowledgment"])

    def test_a_different_value_on_the_pump_is_the_trial_and_closes_the_done(self):
        record = self.done().json()["record"]
        applied = datetime.fromisoformat(record["applied_at"])
        item = record["items"][0]
        other = round(item["value"] + 0.05, 2)
        read_at = applied + timedelta(minutes=30)
        self.write_read(read_at, edited_in_place(self.source, item["start_min"], other))
        self.sync()
        (trial,) = self.trials()
        self.assertEqual((trial["parameter"], trial["after"]), ("basal_rate", other))
        self.assertEqual(trial["reconciliation"]["applied_at"], record["applied_at"],
                         "the Trial carries the Done as its decision")
        candidate = next((row for row in self.get("/api/guidance")["candidates"]
                          if row["subject"] == SUBJECT), {})
        self.assertIsNone(candidate.get("acknowledgment"))
        self.assertEqual(self.history_row(record)["verdict"], {"state": "on_pump", "read_at": stamp(read_at)})
        guidance = self.get("/api/guidance")
        self.assertEqual(guidance["admission"]["active_id"], trial["id"])

    def test_done_is_recorded_while_a_trial_is_watched(self):
        # An earlier pump edit of another slot is the active Trial; Done does not wait on it.
        action = self.candidate()["action"][0]
        other = (action["start_min"] + 600) % 1440
        rate = [s for s in self.source if s.start_min <= other][-1].basal_rate
        self.write_read(self.now - timedelta(minutes=30), edited_in_place(self.source, other, round(rate + 0.1, 2)))
        self.sync()
        self.assertEqual(self.get("/api/guidance")["admission"]["active_kind"], "trial")
        response = self.done()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.candidate()["acknowledgment"]["state"], "waiting")


class OneDonePerCardTest(DoneCase):
    CASE = "basal-and-carb-ratio-lower"

    def test_each_setting_card_takes_its_own_done(self):
        for subject in (SUBJECT, "setting:carb_ratio"):
            response = self.done(subject)
            self.assertEqual(response.status_code, 200, response.text)
        basal, ratio = self.candidate(), self.candidate("setting:carb_ratio")
        self.assertEqual((basal["acknowledgment"]["state"], ratio["acknowledgment"]["state"]), ("waiting", "waiting"))
        (block,) = ratio["acknowledgment"]["blocks"]
        self.assertEqual((block["start_min"], block["end_min"], block["units"]), (0, 1440, "g/U"))
        items = self.history_row({"applied_at": ratio["acknowledgment"]["applied_at"]})["items"]
        self.assertEqual([(i["type"], i["start_min"], i["ic_block_provenance"]["block_member_start_mins"])
                          for i in items], [("ic", 0, [0])])


class IsfDoneTest(DoneCase):
    CASE = "pattern-near-tie"

    def test_a_correction_factor_takes_no_done(self):
        # ADR 564: no correction-factor card is served, so a Done on one is refused
        # and records no Plan, even over a store with overnight correction nights.
        response = self.done("setting:isf")
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["detail"]["code"], "ineligible_source")
        self.assertEqual(self.get("/api/plan/history")["history"], [])


if __name__ == "__main__":
    unittest.main()
