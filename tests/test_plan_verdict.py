"""#431: the server confirms a pending Plan from a matching pump read, only the
newest recorded Plan can be pending, and every recorded Plan serves one verdict.

Every store here is a manufactured QA case (`basal-raise`) plus synthetic
settings reads and Plans; no source data or generated files.
"""
import os
import tempfile
import time
import unittest
from dataclasses import replace
from datetime import datetime, timedelta

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
        """Record the served basal action through the public Plan routes."""
        guidance = self.get("/api/guidance")
        action = next(row for row in guidance["candidates"]
                      if row["subject"] == "setting:basal_rate")["action"][0]
        items = [{"type": "basal", "start_min": action["start_min"], "value": action["recommended"]}]
        draft = self.client.put("/api/plan", headers=self.headers, json={"items": items}).json()
        response = self.client.post("/api/plan/apply", headers=self.headers, json={
            "request_id": f"apply-{time.time_ns()}", "input_revision": guidance["input_revision"],
            "subject": "setting:basal_rate", "analysis_generation": guidance["analysis_generation"],
            "draft_updated_at": draft["updated_at"]})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["record"]

    def record_older_plan(self, items, applied_at):
        """A Plan recorded as history from before schedules were captured."""
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


class ServerConfirmationTest(PlanCase):
    def test_an_in_place_edit_after_the_decision_confirms_the_plan(self):
        plan = self.record_plan()
        read_at = at(plan) + timedelta(minutes=5)
        self.write_read(read_at, rows=plan["deliverable"]["rows"])
        self.reconcile()
        row = self.row(plan)
        self.assertEqual(row["reconciliation"]["state"], "available")
        self.assertIsNone(row["reconciliation"]["trial_id"])
        self.assertEqual(row["reconciliation"]["observed_snapshot"]["captured_at"], stamp(read_at))
        guidance = self.get("/api/guidance")
        self.assertNotEqual(guidance["disposition"], "pending_plan")
        self.assertIsNone(guidance["pending_plan"])
        self.assertEqual(guidance["admission"]["focus_pin"], {"available": True, "reason": None})
        with Store.open_readonly(self.path) as store:
            self.assertEqual(store.follow_up_records("trial"), [])

    def dose_stream(self, plan):
        """Two days of the delivery feed from the day after the decision, each
        slot's programmed rate read off the Plan's captured rows."""
        rows = plan["deliverable"]["rows"]
        day0 = (at(plan) + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        self.feed(day0, range(2), lambda minute: [r for r in rows if r["start_min"] <= minute][-1]["basal_rate"]["value"])
        return day0

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

    def trials(self):
        with Store.open_readonly(self.path) as store:
            return store.follow_up_records("trial")

    def test_a_change_the_dose_stream_detects_still_confirms_from_the_read(self):
        plan = self.record_plan()
        rows = plan["deliverable"]["rows"]
        day0 = self.dose_stream(plan)
        # About 46 hours after the Trial's change time: more than a day, so the
        # Trial stays unlinked (ADR 463 decision 7).
        read_at = day0 + timedelta(days=2, hours=1)
        self.write_read(read_at, rows=rows)
        self.reconcile()
        trials = self.trials()
        self.assertEqual([trial["parameter"] for trial in trials], ["basal_rate"])
        self.assertNotIn(trials[0]["changed_at"], {stamp(read_at)})
        self.assertNotEqual(trials[0]["reconciliation"]["state"], "available")
        row = self.row(plan)
        self.assertEqual(row["reconciliation"]["state"], "available")
        self.assertIsNone(row["reconciliation"]["trial_id"])
        self.assertEqual(row["verdict"], {"state": "confirmed", "confirmed_at": stamp(read_at), "on_pump": True})

    def test_a_trial_detected_within_a_day_of_the_confirming_read_links_to_its_plan(self):
        plan = self.record_plan()
        rows = plan["deliverable"]["rows"]
        day0 = self.dose_stream(plan)
        read_at = day0 + timedelta(days=1, hours=1)
        self.write_read(read_at, rows=rows)
        self.reconcile()
        (trial,) = self.trials()
        self.assertEqual(trial["parameter"], "basal_rate")
        receipt = trial["reconciliation"]
        self.assertEqual((receipt["state"], receipt.get("applied_at"), receipt.get("trial_id")),
                         ("available", plan["applied_at"], trial["id"]))
        self.assertEqual(receipt["observed_snapshot"]["captured_at"], stamp(read_at))
        row = self.row(plan)
        self.assertIsNone(row["reconciliation"]["trial_id"], "the Plan's own receipt is never rewritten")
        self.assertEqual(row["verdict"], {"state": "confirmed", "confirmed_at": stamp(read_at), "on_pump": True})
        served = self.get(f"/api/verify/trials?selected={trial['id']}")["selected"]
        self.assertEqual(served["original"]["context"], plan["decision_context"])
        self.assertEqual(served["original"]["context"]["state"], "available")

    def test_an_ambiguous_or_other_setting_trial_stays_unlinked(self):
        source_rate = self.current_rate()
        other = (SLOT + 240) % 1440
        for label in ("two qualifying Trials", "a Trial of another setting"):
            with self.subTest(label):
                self.open_case()
                if label == "two qualifying Trials":
                    items = [{"type": "basal", "start_min": minute, "value": round(source_rate + 0.1, 2)}
                             for minute in (SLOT, other)]
                    segments = edited_in_place(edited_in_place(self.source, SLOT, items[0]["value"]),
                                               other, items[1]["value"])
                    held = segments
                else:
                    items = [{"type": "basal", "start_min": SLOT, "value": round(source_rate + 0.1, 2)}]
                    held = edited_in_place(self.source, SLOT, items[0]["value"])
                    segments = edited_in_place(self.source, other, round(source_rate + 0.1, 2))
                with Store.open(self.path) as store:
                    applied = max(event.t for event in store.basal_events()) + timedelta(days=1)
                plan = self.record_older_plan(items, applied)
                # A day at the source rates, then two at the edited ones, so each
                # edited slot has a value to change from.
                day0 = (applied + timedelta(days=1)).replace(hour=0, minute=0, second=0)
                rate = lambda profile: lambda minute: [s for s in profile if s.start_min <= minute][-1].basal_rate
                self.feed(day0, (-1,), rate(self.source))
                self.feed(day0, range(2), rate(segments))
                self.write_read(day0 + timedelta(days=1, hours=1), segments=held)
                self.reconcile()
                trials = self.trials()
                self.assertEqual(sorted(t["slot"] for t in trials),
                                 ["02:00", "06:00"] if label == "two qualifying Trials" else ["06:00"],
                                 "premise: the feed detects the edited slots' Trials")
                self.assertEqual(self.row(plan)["verdict"]["state"], "confirmed", "premise: the read confirms the Plan")
                self.assertTrue(all(t["reconciliation"]["state"] != "available" for t in trials))

    def test_a_read_from_before_the_decision_never_confirms(self):
        plan = self.record_plan()
        # One holding read before the decision, and one captured at it.
        self.write_read(at(plan) - timedelta(minutes=1), rows=plan["deliverable"]["rows"])
        self.write_read(at(plan), rows=plan["deliverable"]["rows"])
        self.reconcile()
        self.assertEqual(self.row(plan)["reconciliation"]["state"], "unavailable")
        guidance = self.get("/api/guidance")
        self.assertEqual(guidance["disposition"], "pending_plan")
        self.assertEqual(guidance["pending_plan"]["applied_at"], plan["applied_at"])
        self.assertEqual(guidance["admission"]["focus_pin"]["reason"], "pending_plan")

    def test_a_latest_read_that_differs_keeps_the_plan_pending(self):
        plan = self.record_plan()
        self.write_read(at(plan) + timedelta(minutes=5), rows=plan["deliverable"]["rows"])
        self.write_read(at(plan) + timedelta(minutes=10), segments=self.source)
        self.reconcile()
        self.assertEqual(self.row(plan)["reconciliation"]["state"], "unavailable")
        guidance = self.get("/api/guidance")
        self.assertEqual(guidance["disposition"], "pending_plan")
        self.assertEqual(guidance["pending_plan"]["applied_at"], plan["applied_at"])
        self.assertEqual(guidance["admission"]["focus_pin"]["reason"], "pending_plan")

    def test_the_confirmed_time_is_the_first_read_of_the_matching_run(self):
        plan = self.record_plan()
        rows = plan["deliverable"]["rows"]
        self.write_read(at(plan) + timedelta(minutes=5), segments=self.source)
        self.write_read(at(plan) + timedelta(minutes=10), rows=rows)
        self.write_read(at(plan) + timedelta(minutes=15), rows=rows)
        self.reconcile()
        first = self.row(plan)
        self.assertEqual(first["verdict"]["confirmed_at"], stamp(at(plan) + timedelta(minutes=10)))
        self.assertEqual(first["reconciliation"]["observed_snapshot"]["captured_at"],
                         stamp(at(plan) + timedelta(minutes=10)))
        self.write_read(at(plan) + timedelta(minutes=20), rows=rows)
        self.reconcile()
        again = self.row(plan)
        self.assertEqual(again["reconciliation"], first["reconciliation"])
        self.assertEqual(again["verdict"], first["verdict"])

    def test_an_incomparable_recorded_plan_fails_nothing_and_leaves_by_withdrawal(self):
        # A key-only item (no start minute) and a null value: the second, over an
        # unchanged read, would look held if a missing value counted as current.
        for item in ({"type": "basal", "key": 0, "value": 0.7},
                     {"type": "basal", "start_min": SLOT, "value": None}):
            with self.subTest(item=item):
                self.open_case()
                decision = self.source_at + timedelta(hours=1)
                plan = self.record_older_plan([item], decision)
                self.write_read(decision + timedelta(minutes=5), segments=self.source)
                self.reconcile()
                pending = {"state": "pending", "confirmed_at": None, "on_pump": False}
                self.assertEqual(self.row(plan)["verdict"], pending)
                guidance = self.get("/api/guidance")
                self.assertEqual(guidance["pending_plan"]["verdict"], pending)
                self.assertEqual(guidance["admission"]["focus_pin"]["reason"], "pending_plan")
                withdrawn = self.withdraw(plan)
                self.assertEqual(withdrawn["record"]["withdrawal"]["state"], "available")
                self.assertNotEqual(withdrawn["admission"]["focus_pin"]["reason"], "pending_plan")
                self.reconcile()
                self.assertEqual(self.row(plan)["verdict"]["state"], "withdrawn")
                self.assertIsNone(self.get("/api/guidance")["pending_plan"])

    def test_a_recorded_plan_todays_item_rules_refuse_is_incomparable(self):
        # A history row an older build accepted: it names start minutes and
        # values, but mixes families, which today's item rules refuse.
        decision = stamp(self.source_at + timedelta(hours=1))
        items = ('[{"type": "basal", "start_min": 120, "value": 0.8},'
                 ' {"type": "isf", "start_min": 0, "value": 40}]')
        with Store.open(self.path) as store, store.conn:
            store.conn.execute("INSERT INTO plan_history (applied_at, items_json) VALUES (?, ?)",
                               (decision, items))
        plan = {"applied_at": decision}
        self.write_read(self.source_at + timedelta(hours=1, minutes=5), segments=self.source)
        self.reconcile()
        pending = {"state": "pending", "confirmed_at": None, "on_pump": False}
        self.assertEqual(self.row(plan)["verdict"], pending)
        self.assertEqual(self.get("/api/guidance")["pending_plan"]["verdict"], pending)
        self.withdraw(plan)
        self.assertEqual(self.row(plan)["verdict"]["state"], "withdrawn")

    def test_a_plan_recorded_without_a_captured_schedule_confirms_from_its_values(self):
        rate = round(self.current_rate() + 0.1, 2)
        decision = self.source_at + timedelta(hours=1)
        plan = self.record_older_plan([{"type": "basal", "start_min": SLOT, "value": rate}], decision)
        self.assertEqual(self.row(plan)["deliverable"]["reason"], "legacy_not_recorded")
        read_at = decision + timedelta(minutes=5)
        self.write_read(read_at, segments=edited_in_place(self.source, SLOT, rate))
        self.reconcile()
        row = self.row(plan)
        self.assertIsNone(row["reconciliation"]["trial_id"])
        self.assertEqual(row["verdict"], {"state": "confirmed", "confirmed_at": stamp(read_at), "on_pump": True})
        self.assertIsNone(self.get("/api/guidance")["pending_plan"])


class NewestPendingTest(PlanCase):
    def test_superseded_history_does_not_block_the_desk(self):
        current = self.current_rate()
        for ending in ("confirmed", "withdrawn"):
            with self.subTest(ending=ending):
                self.open_case()
                older_at, newer_at = self.source_at + timedelta(hours=1), self.source_at + timedelta(hours=2)
                older_rate, newer_rate = round(current + 0.1, 2), round(current + 0.2, 2)
                older = self.record_older_plan([{"type": "basal", "start_min": SLOT, "value": older_rate}], older_at)
                newer = self.record_older_plan([{"type": "basal", "start_min": SLOT, "value": newer_rate}], newer_at)
                if ending == "confirmed":
                    self.write_read(newer_at + timedelta(minutes=5),
                                    segments=edited_in_place(self.source, SLOT, newer_rate))
                    self.reconcile()
                else:
                    # The latest read holds the OLDER Plan: a superseded Plan is
                    # never confirmed by a pump read.
                    self.write_read(newer_at + timedelta(minutes=5),
                                    segments=edited_in_place(self.source, SLOT, older_rate))
                    self.withdraw(newer)
                    self.reconcile()
                guidance = self.get("/api/guidance")
                self.assertIsNone(guidance["pending_plan"])
                self.assertNotEqual(guidance["admission"]["focus_pin"]["reason"], "pending_plan")
                self.assertEqual(self.row(newer)["verdict"]["state"], ending)
                self.assertEqual(self.row(older)["verdict"]["state"], "superseded")
                self.assertEqual(self.row(older)["reconciliation"]["state"], "unavailable")
                self.assertEqual(self.row(older)["withdrawal"]["state"], "unavailable")


class ServedVerdictTest(PlanCase):
    def assert_reads_agree(self):
        history = self.get("/api/plan/history")
        guidance = self.get("/api/guidance")
        self.assertEqual(history["input_revision"], guidance["input_revision"])
        self.assertEqual(history["history"][0]["verdict"], guidance["pending_plan"]["verdict"])
        return guidance["pending_plan"]["verdict"]

    def test_the_history_and_guidance_reads_agree(self):
        plan = self.record_plan()
        self.assertEqual(self.assert_reads_agree(), {"state": "pending", "confirmed_at": None, "on_pump": False})
        self.write_read(at(plan) + timedelta(minutes=5), segments=self.source)
        self.reconcile()
        self.assertEqual(self.assert_reads_agree(), {"state": "mismatch", "confirmed_at": None, "on_pump": False})

    def test_a_withdrawn_newest_plan_reads_withdrawn_on_both_reads(self):
        plan = self.record_plan()
        self.withdraw(plan)
        self.assertEqual(self.row(plan)["verdict"], {"state": "withdrawn", "confirmed_at": None, "on_pump": False})
        self.assertIsNone(self.get("/api/guidance")["pending_plan"])

    def test_a_holding_read_not_yet_reconciled_serves_pending(self):
        plan = self.record_plan()
        self.write_read(at(plan) + timedelta(minutes=5), rows=plan["deliverable"]["rows"])
        row = self.row(plan)
        self.assertEqual(row["reconciliation"]["state"], "unavailable")
        self.assertEqual(row["verdict"], {"state": "pending", "confirmed_at": None, "on_pump": True})

    def test_withdraw_refuses_a_pending_plan_the_latest_read_already_holds(self):
        # Served pending with on_pump true: the withdraw lifecycle reconciles
        # first, which confirms the Plan, so it refuses as nonpending_plan and
        # rolls that confirmation back with the refused write.
        plan = self.record_plan()
        self.write_read(at(plan) + timedelta(minutes=5), rows=plan["deliverable"]["rows"])
        held = {"state": "pending", "confirmed_at": None, "on_pump": True}
        self.assertEqual(self.row(plan)["verdict"], held)
        revision = self.get("/api/plan/history")["input_revision"]
        response = self.client.post("/api/plan/history/withdraw", headers=self.headers, json={
            "request_id": f"withdraw-{time.time_ns()}", "input_revision": revision,
            "applied_at": plan["applied_at"], "reason": None})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["detail"]["code"], "nonpending_plan")
        row = self.row(plan)
        self.assertEqual((row["withdrawal"]["state"], row["reconciliation"]["state"]),
                         ("unavailable", "unavailable"))
        self.assertEqual(row["verdict"], held)
        # The refusal withdrew nothing: the next reconciliation confirms it.
        self.reconcile()
        self.assertEqual(self.row(plan)["verdict"]["state"], "confirmed")

    def test_a_confirmed_plan_the_pump_stops_holding_stays_confirmed(self):
        plan = self.record_plan()
        confirmed_at = at(plan) + timedelta(minutes=5)
        self.write_read(confirmed_at, rows=plan["deliverable"]["rows"])
        self.reconcile()
        self.write_read(at(plan) + timedelta(minutes=10), segments=self.source)
        self.reconcile()
        self.assertEqual(self.row(plan)["verdict"],
                         {"state": "confirmed", "confirmed_at": stamp(confirmed_at), "on_pump": False})

    def test_a_differing_read_after_the_decision_serves_a_mismatch(self):
        plan = self.record_plan()
        self.write_read(at(plan) + timedelta(minutes=5), segments=self.source)
        self.reconcile()
        self.assertEqual(self.row(plan)["verdict"], {"state": "mismatch", "confirmed_at": None, "on_pump": False})

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
