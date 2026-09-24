"""The server's clock of record (ADR 443).

Every stamp the server writes is read from one clock: now on ``TIMEZONE_NAME``'s
wall clock, whatever zone the server process runs in. Three writes are floored
just after the latest stored pump-read capture, recorded Plan or Focus pin, so a
clock that steps back cannot write a history out of order.

Each case pins both zones itself, so none depends on the runner's zone or on
``tests/conftest.py``'s ``UTC`` default. Apart: the process runs on
Pacific/Kiritimati (UTC+14) and the pump on Pacific/Pago_Pago (UTC-11). The two
wall clocks are 25 h apart and neither observes daylight saving, so a stamp and
its date differ at every instant. Stores are seeded only from the committed QA
case recipes and from vendor-shaped pump reads built here.
"""

import os
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from ciq_autotune.api import create_app
from ciq_autotune.store import Store
from ciq_autotune.sync import _capture_settings_snapshot
from ciq_autotune.watched_change import reconcile_ingested_follow_up

PROCESS_ZONE = "Pacific/Kiritimati"
PUMP_ZONE = "Pacific/Pago_Pago"


def pin_process_zone(test, name):
    """Run the rest of ``test`` with the process on zone ``name``; restore it in cleanup."""
    if not getattr(test, "_process_zone_pinned", False):
        previous = os.environ.get("TZ")

        def restore():
            if previous is None:
                os.environ.pop("TZ", None)
            else:
                os.environ["TZ"] = previous
            time.tzset()
        test.addCleanup(restore)
        test._process_zone_pinned = True
    os.environ["TZ"] = name
    time.tzset()


def pin_pump_zone(test, name):
    """Run the rest of ``test`` with ``TIMEZONE_NAME`` set to ``name``."""
    env = mock.patch.dict(os.environ, {"TIMEZONE_NAME": name})
    env.start()
    test.addCleanup(env.stop)


def pump_now(zone=PUMP_ZONE):
    return datetime.now(ZoneInfo(zone)).replace(tzinfo=None)


def assert_near(test, stamp, clock_now):
    """``stamp`` (a datetime or its stored text) lies within two minutes of ``clock_now``."""
    value = stamp if isinstance(stamp, datetime) else datetime.fromisoformat(stamp)
    test.assertLess(abs(value - clock_now), timedelta(minutes=2),
                    f"{stamp} is not within two minutes of {clock_now:%Y-%m-%d %H:%M:%S}")


def assert_window_end(test, end, zone):
    """A fetch window ends on the later of the pump's current date and the UTC date."""
    pump_today = datetime.now(ZoneInfo(zone)).date()
    test.assertEqual(end, max(pump_today, datetime.now(timezone.utc).date()))
    test.assertGreaterEqual(end, pump_today)


def _segment(start, basal_mu, isf, cr_mu, target):
    return {"startTime": start, "basalRate": basal_mu, "isf": isf, "carbRatio": cr_mu, "targetBg": target}


def pump_read(active_idp):
    """A vendor-shaped settings read: two profiles differing only in correction
    factor (30, then 40), with ``active_idp`` active."""
    pad = [_segment(0, 0, 0, 0, 0)] * 15

    def profile(idp, isf):
        return {"name": str(idp), "idp": idp, "insulinDuration": 300, "carbEntry": 1,
                "maxBolus": 15000, "tDependentSegs": [_segment(0, 600, isf, 7000, 110)] + pad}
    return {"settings": {"settingsHash": "synthetic", "details": {
        "profiles": {"activeIdp": active_idp, "profile": [profile(1, 30), profile(2, 40)]},
        "cgmSettings": {}}}}


_CARB = {"t": "2024-05-01 12:00:00", "grams": 30, "certainty": "exact"}


class _ApiCase(unittest.TestCase):
    """A fresh synthetic store behind the API."""

    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = directory.name + "/synthetic.sqlite"
        with Store.open(self.path):
            pass
        self.client = TestClient(create_app(db_path=self.path, token="synthetic-token", enable_fetch_loop=False))
        self.headers = {"Authorization": "Bearer synthetic-token"}

    def seed_case(self, name):
        from scripts.qa_e2e_cases import QA_CASES, materialize_case
        with Store.open(self.path) as store:
            materialize_case(store, next(case for case in QA_CASES if case.name == name))
        return self.client.get("/api/guidance", headers=self.headers).json()

    def pin_focus(self, source):
        response = self.client.post("/api/focus", headers=self.headers, json={
            "request_id": "pin", "input_revision": source["input_revision"], "lever": "missed_meal",
            "subject": "habit:missed_meal", "analysis_generation": source["analysis_generation"]})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def capture_switch(self):
        """Capture a read on profile 1, then one that switches to profile 2
        (correction factor 30 -> 40), and reconcile the store."""
        with Store.open(self.path) as store:
            _capture_settings_snapshot(store, pump_read(1))
            time.sleep(1.1)
            _capture_settings_snapshot(store, pump_read(2))
            reconcile_ingested_follow_up(store)
            return store.follow_up_records("trial")


class StampsOnThePumpClockTest(_ApiCase):
    """Each stamp family, written through its public path with the zones apart."""

    def setUp(self):
        pin_process_zone(self, PROCESS_ZONE)
        pin_pump_zone(self, PUMP_ZONE)
        super().setUp()

    def test_pump_read_capture(self):
        with Store.open(self.path) as store:
            _capture_settings_snapshot(store, pump_read(1))
        served = self.client.get("/api/pump-settings", headers=self.headers).json()
        assert_near(self, served["fetched_at"], pump_now())

    def test_focus_pin(self):
        pinned = self.pin_focus(self.seed_case("behavioral-missed-meal"))
        assert_near(self, pinned["pinned_at"], pump_now())

    def test_plan_and_draft(self):
        from tests.test_api import _guidance_client, _source_plan_items
        client = _guidance_client(self, "basal-raise")
        items = _source_plan_items(client, "basal_rate")
        draft = client.put("/api/plan", json={"items": items}).json()
        assert_near(self, draft["updated_at"], pump_now())
        self.assertRegex(draft["updated_at"], r"\.\d{6}$")
        applied = client.post("/api/plan/apply")
        self.assertEqual(applied.status_code, 200, applied.text)
        assert_near(self, applied.json()["applied_at"], pump_now())

    def test_guidance_set_aside(self):
        from tests.test_api import _guidance_client
        client = _guidance_client(self, "behavioral-carb-undercount")
        subject = "pattern:highs_after_meals"
        current = client.get("/api/guidance").json()
        saved = client.put(f"/api/guidance/preferences/{subject}",
                           json={"generation": current["analysis_generation"]})
        self.assertEqual(saved.status_code, 200, saved.text)
        served = client.get("/api/guidance").json()
        row = next(row for row in served["candidates"] + served["alternatives"] if row["subject"] == subject)
        assert_near(self, row["decision"]["decided_at"], pump_now())

    def test_carb_log_entry(self):
        created = self.client.post("/api/carbs", headers=self.headers, json=_CARB)
        self.assertEqual(created.status_code, 200, created.text)
        assert_near(self, created.json()["created_at"], pump_now())

    def test_prompt_answer(self):
        answered = self.client.post("/api/prompts/answer", headers=self.headers, json={
            "detector": "low", "anchor_t": "2024-05-01 12:00:00", "answer": "no"})
        self.assertEqual(answered.status_code, 200, answered.text)
        with Store.open(self.path) as store:
            (response,) = store.prompt_responses()
        assert_near(self, response["answered_at"], pump_now())

    def test_analysis(self):
        self.seed_case("basal-raise")
        analysis = self.client.get("/api/analyze", headers=self.headers)
        self.assertEqual(analysis.status_code, 200, analysis.text)
        assert_near(self, analysis.json()["generated_at"], pump_now())

    def test_reconcile_observes_a_trial(self):
        (trial,) = self.capture_switch()
        self.assertEqual((trial["before"], trial["after"]), (30, 40))
        assert_near(self, trial["first_observed_at"], pump_now())

    def test_reassessment(self):
        self.capture_switch()
        listed = self.client.get("/api/verify/trials", headers=self.headers).json()
        (trial,) = listed["trials"]
        read = self.client.get("/api/verify/trials", headers=self.headers,
                               params={"selected": trial["id"], "assessment": "current"})
        self.assertEqual(read.status_code, 200, read.text)
        assert_near(self, read.json()["selected"]["reassessment"]["computed_at"], pump_now())


class BackwardStepTest(_ApiCase):
    """A container west of UTC upgrades once: its stored stamps are UTC wall
    time and its next ones the pump's, 7 h earlier. The process stays on UTC and
    ``TIMEZONE_NAME`` moves from UTC to America/Phoenix between two writes."""

    def setUp(self):
        pin_process_zone(self, "UTC")
        pin_pump_zone(self, "UTC")
        super().setUp()

    def test_a_switch_read_after_the_step_is_recorded_forward(self):
        with Store.open(self.path) as store:
            _capture_settings_snapshot(store, pump_read(1))
            pin_pump_zone(self, "America/Phoenix")
            _capture_settings_snapshot(store, pump_read(2))
            reconcile_ingested_follow_up(store)
            snapshots = store.settings_snapshots()
            trials = store.follow_up_records("trial")
        self.assertEqual([snapshot.settings.active_idp for snapshot in snapshots], [1, 2])
        self.assertEqual(self.client.get("/api/pump-settings", headers=self.headers).json()["active_idp"], 2)
        self.assertEqual([(trial["before"], trial["after"]) for trial in trials], [(30, 40)])
        self.assertEqual(datetime.fromisoformat(trials[0]["changed_at"]), snapshots[-1].captured_at)

    def test_a_plan_recorded_after_the_step_is_the_pending_plan(self):
        from tests.test_api import _guidance_client, _source_plan_items
        client = _guidance_client(self, "basal-raise")
        items = _source_plan_items(client, "basal_rate")
        client.put("/api/plan", json={"items": items})
        first = client.post("/api/plan/apply").json()
        withdrawn = client.post("/api/plan/history/withdraw", json={
            "request_id": "step-withdraw", "input_revision": client.get("/api/status").json()["input_revision"],
            "applied_at": first["applied_at"]})
        self.assertEqual(withdrawn.status_code, 200, withdrawn.text)
        pin_pump_zone(self, "America/Phoenix")
        client.put("/api/plan", json={"items": items})
        second = client.post("/api/plan/apply")
        self.assertEqual(second.status_code, 200, second.text)
        second = second.json()["applied_at"]
        self.assertEqual(client.get("/api/plan/history").json()["history"][0]["applied_at"], second)
        self.assertEqual((client.get("/api/guidance").json()["pending_plan"] or {}).get("id"), second)

    def test_a_focus_ended_after_the_step_ends_after_its_pin(self):
        pinned = self.pin_focus(self.seed_case("behavioral-missed-meal"))
        with Store.open(self.path) as store:
            revision = store.input_data_revision()
        pin_pump_zone(self, "America/Phoenix")
        ended = self.client.post(f'/api/focus/{pinned["id"]}/resolve', headers=self.headers, json={
            "request_id": "step-resolve", "input_revision": revision, "conclusion": "Synthetic observation"})
        self.assertEqual(ended.status_code, 200, ended.text)
        self.assertGreater(ended.json()["record"]["ending"]["effective_at"], pinned["pinned_at"])


class UnusableZoneTest(_ApiCase):
    """With no loadable zone, every stamp reads the process clock, as before."""

    def test_unset_zone_pins_a_focus_on_the_process_clock(self):
        pin_process_zone(self, PROCESS_ZONE)
        source = self.seed_case("behavioral-missed-meal")
        env = {key: value for key, value in os.environ.items() if key != "TIMEZONE_NAME"}
        with mock.patch.dict(os.environ, env, clear=True):
            pinned = self.pin_focus(source)
        assert_near(self, pinned["pinned_at"], datetime.now())

    def test_unloadable_zone_still_takes_a_stamped_write(self):
        pin_process_zone(self, "UTC")
        for name in ("Not/AZone", "America"):
            with self.subTest(TIMEZONE_NAME=name), mock.patch.dict(os.environ, {"TIMEZONE_NAME": name}), \
                    tempfile.TemporaryDirectory() as directory:
                with Store.open(directory + "/synthetic.sqlite"):
                    pass
                client = TestClient(create_app(db_path=directory + "/synthetic.sqlite", token="",
                                               enable_fetch_loop=False))
                created = client.post("/api/carbs", json=_CARB)
                self.assertEqual(created.status_code, 200, created.text)
                assert_near(self, created.json()["created_at"], datetime.now())


if __name__ == "__main__":
    unittest.main()
