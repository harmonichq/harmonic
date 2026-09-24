"""#443 reproduction: the server stamps on the process clock. Synthetic only.

Run from the repo root: uv run python docs/scope/443-read-time-pump-zone.repro.py

PinnedZones: the process zone is Pacific/Kiritimati (UTC+14) and TIMEZONE_NAME is
Pacific/Pago_Pago (UTC-11); the window case swaps them. The wall clocks are 25 h
apart and neither observes daylight saving, so the stamp and the calendar date
differ at every instant. The pull is mocked; nothing is fetched. After #443 the
window ends on the later of the pump's date and UTC's (design.md Decision 4).

BackwardStep: what a stamping clock that steps back 7 h does to durable records.
A container west of UTC takes that step once, when its stamps move from UTC to
the pump's zone. On base the step is made by moving the process zone from UTC to
America/Phoenix between two writes. Each case fails on base. After #443, stamps no
longer read the process zone, so these three pass; the implementation's own tests
make the step through TIMEZONE_NAME instead.
"""
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ciq_autotune.fetch_loop import run_fetch_once  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402
from ciq_autotune.sync import _capture_settings_snapshot  # noqa: E402
from ciq_autotune.watched_change import reconcile_ingested_follow_up  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from ciq_autotune.api import create_app  # noqa: E402
from scripts.qa_e2e_cases import QA_CASES, materialize_case  # noqa: E402
from tests.test_api import _guidance_client, _source_plan_items  # noqa: E402

PROCESS_ZONE = "Pacific/Kiritimati"
PUMP_ZONE = "Pacific/Pago_Pago"


def _process_zone(test, name):
    """Pin the process zone for the rest of ``test``; restore it in cleanup."""
    if not hasattr(test, "_zone_restore"):
        previous = os.environ.get("TZ")

        def restore():
            if previous is None:
                os.environ.pop("TZ", None)
            else:
                os.environ["TZ"] = previous
            time.tzset()
        test.addCleanup(restore)
        test._zone_restore = True
    os.environ["TZ"] = name
    time.tzset()


def _pump_zone(test, name):
    env = mock.patch.dict(os.environ, {"TIMEZONE_NAME": name})
    env.start()
    test.addCleanup(env.stop)


class PinnedZones(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        self.addCleanup(self.tmp.close)
        _process_zone(self, PROCESS_ZONE)
        _pump_zone(self, PUMP_ZONE)

    @mock.patch("ciq_autotune.sync.pull_from_tconnect")
    def test_read_stamp_is_on_the_pump_wall_clock(self, pull):
        pull.return_value = {"cgm_readings": 1}
        run_fetch_once(self.tmp.name)
        with Store.open(self.tmp.name) as store:
            status = store.fetch_status()
        pump_now = datetime.now(ZoneInfo(PUMP_ZONE)).replace(tzinfo=None)
        stamp = datetime.strptime(status["last_success_at"], "%Y-%m-%d %H:%M:%S")
        print(f"\nlast_success_at={status['last_success_at']} pump_now={pump_now:%Y-%m-%d %H:%M:%S} "
              f"process_now={datetime.now():%Y-%m-%d %H:%M:%S}")
        self.assertLess(abs(stamp - pump_now), timedelta(minutes=2))

    @mock.patch("ciq_autotune.sync.pull_from_tconnect")
    def test_fetch_window_ends_no_earlier_than_the_pump_day(self, pull):
        # Swapped: the process a day behind the pump, so base's process-date end
        # is always the pump's yesterday.
        _process_zone(self, PUMP_ZONE)
        _pump_zone(self, PROCESS_ZONE)
        pull.return_value = {}
        run_fetch_once(self.tmp.name)
        pump_today = datetime.now(ZoneInfo(PROCESS_ZONE)).date()
        utc_today = datetime.now(timezone.utc).date()
        end = pull.call_args.kwargs["end"]
        print(f"\nwindow end={end} pump_today={pump_today} utc_today={utc_today}")
        self.assertEqual(end, max(pump_today, utc_today))
        self.assertGreaterEqual(end, pump_today)


class UnsetZone(unittest.TestCase):
    def test_refused_fetch_is_recorded_without_raising(self):
        # The real pull refuses before any network call when TIMEZONE_NAME is unset.
        env = {k: v for k, v in os.environ.items() if k != "TIMEZONE_NAME"}
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp, mock.patch.dict(os.environ, env, clear=True):
            run_fetch_once(tmp.name)
            with Store.open(tmp.name) as store:
                status = store.fetch_status()
        self.assertIsNone(status["last_success_at"])
        self.assertIsNotNone(status["last_attempt_at"])
        self.assertIn("TIMEZONE_NAME", status["last_error"])


def _seg(start, basal_mu, isf, cr_mu, target):
    return {"startTime": start, "basalRate": basal_mu, "isf": isf, "carbRatio": cr_mu, "targetBg": target}


def _pump_read(active_idp):
    """A vendor-shaped settings read: two profiles differing only in correction
    factor (30, then 40), with ``active_idp`` active."""
    pad = [_seg(0, 0, 0, 0, 0)] * 15

    def profile(idp, isf):
        return {"name": str(idp), "idp": idp, "insulinDuration": 300, "carbEntry": 1,
                "maxBolus": 15000, "tDependentSegs": [_seg(0, 600, isf, 7000, 110)] + pad}
    return {"settings": {"settingsHash": "synthetic", "details": {
        "profiles": {"activeIdp": active_idp, "profile": [profile(1, 30), profile(2, 40)]},
        "cgmSettings": {}}}}


class BackwardStep(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = directory.name + "/synthetic.sqlite"
        with Store.open(self.path):
            pass
        self.client = TestClient(create_app(db_path=self.path, token="synthetic-token", enable_fetch_loop=False))
        self.headers = {"Authorization": "Bearer synthetic-token"}
        _pump_zone(self, "America/Phoenix")
        _process_zone(self, "UTC")

    def seed_case(self, name):
        with Store.open(self.path) as store:
            materialize_case(store, next(case for case in QA_CASES if case.name == name))
        return self.client.get("/api/guidance", headers=self.headers).json()

    def test_a_switch_read_after_the_step_is_recorded_forward(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp, Store.open(tmp.name) as store:
            _capture_settings_snapshot(store, _pump_read(1))
            time.sleep(1.1)
            _process_zone(self, "America/Phoenix")
            _capture_settings_snapshot(store, _pump_read(2))
            reconcile_ingested_follow_up(store)
            trials = [(r["changed_at"], r["before"], r["after"]) for r in store.follow_up_records("trial")]
        print(f"\ntrials after the step: {trials}")
        self.assertEqual([(before, after) for _, before, after in trials], [(30, 40)])

    def test_a_plan_recorded_after_the_step_is_the_pending_plan(self):
        client = _guidance_client(self, "basal-raise")
        items = _source_plan_items(client, "basal_rate")
        client.put("/api/plan", json={"items": items})
        first = client.post("/api/plan/apply").json()
        revision = client.get("/api/status").json()["input_revision"]
        withdrawn = client.post("/api/plan/history/withdraw", json={
            "request_id": "repro-withdraw", "input_revision": revision, "applied_at": first["applied_at"]})
        self.assertEqual(withdrawn.status_code, 200, withdrawn.text)
        time.sleep(1.1)
        _process_zone(self, "America/Phoenix")
        client.put("/api/plan", json={"items": items})
        second = client.post("/api/plan/apply").json()
        history = [(h["applied_at"], h["verdict"]["state"]) for h in client.get("/api/plan/history").json()["history"]]
        pending = (client.get("/api/guidance").json().get("pending_plan") or {}).get("id")
        print(f"\nplans after the step: {history}; pending={pending}")
        self.assertEqual(history[0][0], second["applied_at"])
        self.assertEqual(pending, second["applied_at"])

    def test_a_focus_ended_after_the_step_ends_after_its_pin(self):
        source = self.seed_case("behavioral-missed-meal")
        pinned = self.client.post("/api/focus", headers=self.headers, json={
            "request_id": "repro-pin", "input_revision": source["input_revision"], "lever": "missed_meal",
            "subject": "habit:missed_meal", "analysis_generation": source["analysis_generation"]})
        self.assertEqual(pinned.status_code, 200, pinned.text)
        pinned = pinned.json()
        with Store.open(self.path) as store:
            revision = store.input_data_revision()
        time.sleep(1.1)
        _process_zone(self, "America/Phoenix")
        ended = self.client.post(f'/api/focus/{pinned["id"]}/resolve', headers=self.headers, json={
            "request_id": "repro-resolve", "input_revision": revision, "conclusion": "Synthetic observation"})
        self.assertEqual(ended.status_code, 200, ended.text)
        ending = ended.json()["record"]["ending"]
        print(f"\nfocus pinned {pinned['pinned_at']}, ending effective {ending['effective_at']}")
        self.assertGreater(ending["effective_at"], pinned["pinned_at"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
