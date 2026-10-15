"""#431, as #518 amends it: a recorded Plan is a Done's acknowledgment. The first
sync after it decides it from the pump read, and every recorded Plan serves one
verdict read off its record.

Every store here is a manufactured QA case (`basal-raise`) plus synthetic
settings reads and Plans; no source data or generated files.
"""
import os
import tempfile
import time
import unittest
from dataclasses import replace
from datetime import datetime, timedelta
from unittest import mock

from fastapi.testclient import TestClient

from ciq_autotune.api import create_app
from ciq_autotune.settings import ProfileSegment
from ciq_autotune.store import FollowUpConflict, Store
from ciq_autotune.watched_change import reconcile_ingested_follow_up

FMT = "%Y-%m-%d %H:%M:%S"
PARAMETERS = ("basal_rate", "isf", "carb_ratio", "target_bg")
SLOT = 120  # a synthetic 02:00 basal slot for Plans recorded as older history


def at(plan):
    return datetime.fromisoformat(plan["applied_at"])


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


class PlanCase(unittest.TestCase):
    def setUp(self):
        self.open_case()

    def open_case(self):
        from scripts.qa_e2e_cases import QA_CASES, materialize_case
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = directory.name + "/synthetic.sqlite"
        with Store.open(self.path) as store:
            materialize_case(store, next(case for case in QA_CASES if case.name == "basal-raise"))
            reconcile_ingested_follow_up(store)
            latest = store.settings_snapshots()[-1]
            self.source, self.source_at = latest.settings.active().segments, latest.captured_at
            # The server's clock stands an hour after the case's data, so a Done
            # and the reads after it fall inside the analysis window.
            now = store.latest_cgm_or_basal_timestamp() + timedelta(hours=1)
        clock = mock.patch("ciq_autotune.api.wall_clock_now", lambda after=None: (
            max(now, after + timedelta(seconds=1)) if after else now))
        clock.start()
        self.addCleanup(clock.stop)
        self.client = TestClient(create_app(
            db_path=self.path, token="synthetic-token", enable_fetch_loop=False))
        self.headers = {"Authorization": "Bearer synthetic-token"}

    def current_rate(self):
        return [s for s in self.source if s.start_min <= SLOT][-1].basal_rate

    def get(self, route):
        response = self.client.get(route, headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def history(self):
        return self.get("/api/plan/history")["history"]

    def row(self, plan):
        return next(row for row in self.history() if row["applied_at"] == plan["applied_at"])

    def record_plan(self):
        """Done on the basal card, through the public route."""
        guidance = self.get("/api/guidance")
        response = self.client.post("/api/plan/apply", headers=self.headers, json={
            "request_id": f"apply-{time.time_ns()}", "input_revision": guidance["input_revision"],
            "subject": "setting:basal_rate", "analysis_generation": guidance["analysis_generation"]})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["record"]

    def record_older_plan(self, items, applied_at):
        """A Plan recorded as history from before decisions and schedules were captured."""
        with Store.open(self.path) as store:
            store.save_plan_draft(items, stamp(applied_at))
            return store.apply_plan(stamp(applied_at))

    def write_read(self, when, *, rows=None, segments=None):
        """Append one settings read whose active profile, edited in place, holds
        the given captured schedule rows or segments."""
        if rows is not None:
            segments = tuple(ProfileSegment(start_min=row["start_min"],
                                            **{key: row[key]["value"] for key in PARAMETERS})
                             for row in rows)
        with Store.open(self.path) as store:
            settings = store.settings_snapshots()[-1].settings
            profile = replace(settings.active(), segments=tuple(segments))
            store.upsert_settings_snapshot(stamp(when), replace(settings, profiles=tuple(
                profile if p.idp == settings.active_idp else p for p in settings.profiles)))

    def deliver(self, when):
        """One delivery row at ``when``: the store holds pump data from then."""
        rate = self.source[0].basal_rate
        with Store.open(self.path) as store:
            store.upsert_basal([{"seq_num": 9_600_000, "time": stamp(when), "delivery_type": "profileDelivery",
                                 "duration_mins": 5, "basal_rate": rate, "profile_basal_rate": rate}])

    def reconcile(self):
        with Store.open(self.path) as store:
            reconcile_ingested_follow_up(store)

    def withdraw(self, plan):
        revision = self.get("/api/plan/history")["input_revision"]
        response = self.client.post("/api/plan/history/withdraw", headers=self.headers, json={
            "request_id": f"withdraw-{time.time_ns()}", "input_revision": revision,
            "applied_at": plan["applied_at"], "reason": None})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def trials(self):
        with Store.open_readonly(self.path) as store:
            return store.follow_up_records("trial")

    def feed(self, day0, days, rate_at):
        """The delivery feed on each of ``days`` after ``day0``, every slot at
        ``rate_at(its start minute)``."""
        with Store.open(self.path) as store:
            store.upsert_basal([{
                "seq_num": 9_000_000 + (day + 1) * 48 + slot,
                "time": stamp(day0 + timedelta(days=day, minutes=30 * slot + 2)),
                "delivery_type": "algorithmDelivery", "duration_mins": 30,
                "basal_rate": rate_at(30 * slot), "profile_basal_rate": rate_at(30 * slot)}
                for day in days for slot in range(48)])


class ServerResolutionTest(PlanCase):
    def test_an_in_place_edit_after_the_decision_is_the_plans_trial(self):
        # The edit is a pump change, so it is a Trial (#500), and the Plan it
        # carries out names it.
        plan = self.record_plan()
        read_at = at(plan) + timedelta(minutes=5)
        self.write_read(read_at, rows=plan["deliverable"]["rows"])
        self.reconcile()
        (trial,) = self.trials()
        self.assertEqual((trial["parameter"], trial["changed_at"]), ("basal_rate", stamp(read_at)))
        row = self.row(plan)
        self.assertEqual(row["reconciliation"]["trial_id"], trial["id"])
        self.assertEqual(row["verdict"], {"state": "on_pump", "read_at": stamp(read_at)})
        self.assertEqual(trial["reconciliation"]["applied_at"], plan["applied_at"])
        guidance = self.get("/api/guidance")
        self.assertEqual(guidance["disposition"], "active_change")
        self.assertEqual(guidance["admission"]["active_id"], trial["id"])
        self.assertEqual(guidance["admission"]["focus_pin"], {"available": False, "reason": "active_trial"})

    def test_a_change_the_dose_stream_carries_before_its_read_is_one_trial_at_the_read(self):
        # The feed carries the edit for two days before the read that shows it.
        # That read dates the one Trial, and the Plan names it (#500).
        plan = self.record_plan()
        rows = plan["deliverable"]["rows"]
        day0 = (at(plan) + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        self.feed(day0, range(2), lambda minute: [r for r in rows if r["start_min"] <= minute][-1]["basal_rate"]["value"])
        read_at = day0 + timedelta(days=2, hours=1)
        self.write_read(read_at, rows=rows)
        self.reconcile()
        (trial,) = self.trials()
        self.assertEqual((trial["parameter"], trial["changed_at"]), ("basal_rate", stamp(read_at)))
        self.assertEqual(trial["reconciliation"]["applied_at"], plan["applied_at"])
        self.assertEqual(self.row(plan)["verdict"], {"state": "on_pump", "read_at": stamp(read_at)})

    def test_two_qualifying_trials_leave_the_plan_unlinked(self):
        # The read moves the Plan's two slots to a value other than its own, so
        # it closes on the pump; each slot is its own Trial, and an ambiguous
        # match links neither (ADR 463 decision 7).
        value = round(self.current_rate() + 0.1, 2)
        other = (SLOT + 240) % 1440
        decision = self.source_at + timedelta(hours=1)
        plan = self.record_older_plan([{"type": "basal", "start_min": minute, "value": round(value + 0.05, 2)}
                                       for minute in (SLOT, other)], decision)
        self.write_read(decision + timedelta(hours=2),
                        segments=edited_in_place(edited_in_place(self.source, SLOT, value), other, value))
        self.reconcile()
        trials = self.trials()
        self.assertEqual(sorted(t["slot"] for t in trials), ["02:00", "06:00"])
        self.assertEqual(self.row(plan)["verdict"]["state"], "on_pump")
        self.assertTrue(all(t["reconciliation"]["state"] != "available" for t in trials))

    def test_a_read_from_before_the_decision_never_resolves(self):
        plan = self.record_plan()
        self.deliver(at(plan) + timedelta(minutes=1))
        # One unchanged read before the decision, and one captured at it.
        self.write_read(at(plan) - timedelta(minutes=1), segments=self.source)
        self.write_read(at(plan), segments=self.source)
        self.reconcile()
        self.assertEqual(self.row(plan)["verdict"], {"state": "waiting", "read_at": None})

    def test_the_first_sync_that_decides_names_its_read_and_later_reads_change_nothing(self):
        plan = self.record_plan()
        rows = plan["deliverable"]["rows"]
        self.write_read(at(plan) + timedelta(minutes=5), segments=self.source)
        self.reconcile()
        self.assertEqual(self.row(plan)["verdict"]["state"], "waiting", "no pump data after the Done yet")
        self.write_read(at(plan) + timedelta(minutes=10), rows=rows)
        self.reconcile()
        first = self.row(plan)
        self.assertEqual(first["verdict"], {"state": "on_pump", "read_at": stamp(at(plan) + timedelta(minutes=10))})
        self.write_read(at(plan) + timedelta(minutes=20), segments=self.source)
        self.reconcile()
        again = self.row(plan)
        self.assertEqual((again["reconciliation"], again["verdict"]), (first["reconciliation"], first["verdict"]))

    def test_an_incomparable_recorded_plan_fails_nothing_and_leaves_by_withdrawal(self):
        # A key-only item names no start minute, so no read decides it.
        decision = self.source_at + timedelta(hours=1)
        plan = self.record_older_plan([{"type": "basal", "key": 0, "value": 0.7}], decision)
        self.write_read(decision + timedelta(minutes=5), segments=self.source)
        self.reconcile()
        self.assertEqual(self.row(plan)["verdict"], {"state": "waiting", "read_at": None})
        self.withdraw(plan)
        self.assertEqual(self.row(plan)["verdict"]["state"], "withdrawn")

    def test_a_recorded_plan_todays_item_rules_refuse_resolves_without_failing(self):
        # A history row an older build accepted: it names start minutes and
        # values, but mixes families, which today's item rules refuse. It names
        # no one setting, so it serves no card's state.
        decision = stamp(self.source_at + timedelta(hours=1))
        items = ('[{"type": "basal", "start_min": 120, "value": 0.8},'
                 ' {"type": "isf", "start_min": 0, "value": 40}]')
        with Store.open(self.path) as store, store.conn:
            store.conn.execute("INSERT INTO plan_history (applied_at, items_json) VALUES (?, ?)",
                               (decision, items))
        self.write_read(self.source_at + timedelta(hours=1, minutes=5), segments=self.source)
        self.reconcile()
        self.assertEqual(self.row({"applied_at": decision})["verdict"]["state"], "not_on_pump")
        basal = next(row for row in self.get("/api/guidance")["candidates"] if row["subject"] == "setting:basal_rate")
        self.assertIsNone(basal["acknowledgment"])

    def test_a_plan_recorded_without_a_captured_schedule_resolves_from_the_reads(self):
        rate = round(self.current_rate() + 0.1, 2)
        decision = self.source_at + timedelta(hours=1)
        plan = self.record_older_plan([{"type": "basal", "start_min": SLOT, "value": rate}], decision)
        self.assertEqual(self.row(plan)["deliverable"]["reason"], "legacy_not_recorded")
        read_at = decision + timedelta(minutes=5)
        self.write_read(read_at, segments=edited_in_place(self.source, SLOT, rate))
        self.reconcile()
        row = self.row(plan)
        self.assertIsNone(row["reconciliation"]["trial_id"])
        self.assertEqual(row["verdict"], {"state": "on_pump", "read_at": stamp(read_at)})
        (trial,) = self.trials()
        self.assertEqual(trial["reconciliation"]["applied_at"], plan["applied_at"],
                         "the Trial its read closed links to it")


class ServedVerdictTest(PlanCase):
    def acknowledgment(self):
        return next(row for row in self.get("/api/guidance")["candidates"]
                    if row["subject"] == "setting:basal_rate")["acknowledgment"]

    def test_the_history_and_guidance_reads_agree(self):
        plan = self.record_plan()
        self.assertEqual(self.row(plan)["verdict"], {"state": "waiting", "read_at": None})
        self.assertEqual(self.acknowledgment()["state"], "waiting")
        self.deliver(at(plan) + timedelta(minutes=1))
        self.write_read(at(plan) + timedelta(minutes=5), segments=self.source)
        self.reconcile()
        verdict = {"state": "not_on_pump", "read_at": stamp(at(plan) + timedelta(minutes=5))}
        self.assertEqual(self.row(plan)["verdict"], verdict)
        self.assertEqual((self.acknowledgment()["state"], self.acknowledgment()["read_at"]),
                         ("not_on_pump", verdict["read_at"]))

    def test_a_withdrawn_plan_reads_withdrawn(self):
        plan = self.record_plan()
        self.withdraw(plan)
        self.assertEqual(self.row(plan)["verdict"], {"state": "withdrawn", "read_at": None})
        self.assertIsNone(self.acknowledgment())

    def test_a_deciding_read_not_yet_reconciled_still_serves_waiting(self):
        # The verdict is read off the record; only a sync's reconcile decides it.
        plan = self.record_plan()
        self.write_read(at(plan) + timedelta(minutes=5), rows=plan["deliverable"]["rows"])
        row = self.row(plan)
        self.assertEqual(row["reconciliation"]["state"], "unavailable")
        self.assertEqual(row["verdict"], {"state": "waiting", "read_at": None})

    def test_undo_refuses_a_done_the_latest_read_already_decides(self):
        # The withdraw lifecycle reconciles first, which closes the Done on the
        # pump, so it refuses as nonpending_plan and rolls that back with the
        # refused write.
        plan = self.record_plan()
        self.write_read(at(plan) + timedelta(minutes=5), rows=plan["deliverable"]["rows"])
        revision = self.get("/api/plan/history")["input_revision"]
        response = self.client.post("/api/plan/history/withdraw", headers=self.headers, json={
            "request_id": f"withdraw-{time.time_ns()}", "input_revision": revision,
            "applied_at": plan["applied_at"], "reason": None})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["detail"]["code"], "nonpending_plan")
        row = self.row(plan)
        self.assertEqual((row["withdrawal"]["state"], row["reconciliation"]["state"]),
                         ("unavailable", "unavailable"))
        # The refusal withdrew nothing: the next reconciliation decides it.
        self.reconcile()
        self.assertEqual(self.row(plan)["verdict"]["state"], "on_pump")

    def test_a_done_on_the_pump_stays_on_the_pump_when_the_pump_moves_again(self):
        plan = self.record_plan()
        read_at = at(plan) + timedelta(minutes=5)
        self.write_read(read_at, rows=plan["deliverable"]["rows"])
        self.reconcile()
        self.write_read(at(plan) + timedelta(minutes=10), segments=self.source)
        self.reconcile()
        self.assertEqual(self.row(plan)["verdict"], {"state": "on_pump", "read_at": stamp(read_at)})

    def test_history_keeps_serving_newest_first(self):
        decision = self.source_at + timedelta(hours=1)
        older = self.record_older_plan([{"type": "basal", "start_min": SLOT, "value": 0.5}], decision)
        newer = self.record_older_plan([{"type": "basal", "start_min": SLOT, "value": 0.6}],
                                       decision + timedelta(hours=1))
        self.assertEqual([row["applied_at"] for row in self.history()],
                         [newer["applied_at"], older["applied_at"]])


class PlanReceiptIdentityTest(unittest.TestCase):
    """Task 1.1, through Store.save_follow_up_record in a follow-up transaction."""

    def setUp(self):
        from tests.test_follow_up_store import ITEMS, T0
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.path = os.path.join(tmp.name, "synthetic.sqlite")
        self.store = Store.open(self.path)
        self.addCleanup(lambda: self.store.close())
        self.store.save_plan_draft(ITEMS, T0)
        self.store.apply_plan(T0)
        self.plan = self.store.follow_up_record("plan", T0)

    def receipt(self, trial_id):
        from tests.test_follow_up_store import T0, T1, T2, available
        return available(applied_at=T0, trial_id=trial_id, established_at=T2,
                         observed_snapshot={"captured_at": T1, "active_idp": 1})

    def test_a_plan_receipt_without_a_trial_saves(self):
        with self.store.follow_up_transaction():
            saved = self.store.save_follow_up_record({**self.plan, "reconciliation": self.receipt(None)})
        self.assertEqual(saved["reconciliation"], self.receipt(None))
        self.store.close()
        self.store = Store.open(self.path)
        self.assertEqual(self.store.follow_up_record("plan", self.plan["id"])["reconciliation"],
                         self.receipt(None))

    def test_a_plan_receipt_naming_a_missing_trial_is_refused(self):
        revision = self.store.input_data_revision()
        with self.assertRaises(FollowUpConflict):
            with self.store.follow_up_transaction():
                self.store.save_follow_up_record({**self.plan, "reconciliation": self.receipt("missing-trial")})
        self.assertEqual(self.store.input_data_revision(), revision)
        self.assertEqual(self.store.follow_up_record("plan", self.plan["id"]), self.plan)

    def test_a_trial_receipt_without_a_trial_is_refused(self):
        from tests.test_follow_up_store import trial
        with self.store.follow_up_transaction():
            record = self.store.save_follow_up_record(trial())
        revision = self.store.input_data_revision()
        with self.assertRaises(ValueError):
            with self.store.follow_up_transaction():
                self.store.save_follow_up_record({**record, "reconciliation": self.receipt(None)})
        self.assertEqual(self.store.input_data_revision(), revision)
        self.assertEqual(self.store.follow_up_record("trial", record["id"]), record)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
