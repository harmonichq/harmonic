"""#443 reproduction: the fetch loop stamps its read in the process zone. Synthetic only.

Run from the repo root: uv run python docs/scope/443-read-time-pump-zone.repro.py

The process zone is pinned to Pacific/Kiritimati (UTC+14) and TIMEZONE_NAME to
Pacific/Pago_Pago (UTC-11). The two wall clocks are 25 h apart and neither
observes daylight saving, so the stamp and the calendar date differ at every
instant. The pull is mocked; nothing is fetched.
"""
import os
import sys
import tempfile
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ciq_autotune.fetch_loop import run_fetch_once  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402

PROCESS_ZONE = "Pacific/Kiritimati"
PUMP_ZONE = "Pacific/Pago_Pago"


class PinnedZones(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        self.addCleanup(self.tmp.close)
        previous = os.environ.get("TZ")
        os.environ["TZ"] = PROCESS_ZONE
        time.tzset()

        def restore():
            if previous is None:
                os.environ.pop("TZ", None)
            else:
                os.environ["TZ"] = previous
            time.tzset()
        self.addCleanup(restore)
        env = mock.patch.dict(os.environ, {"TIMEZONE_NAME": PUMP_ZONE})
        env.start()
        self.addCleanup(env.stop)

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
    def test_fetch_window_ends_on_the_pump_calendar_day(self, pull):
        pull.return_value = {}
        run_fetch_once(self.tmp.name)
        pump_today = datetime.now(ZoneInfo(PUMP_ZONE)).date()
        print(f"\nwindow end={pull.call_args.kwargs['end']} pump_today={pump_today}")
        self.assertEqual(pull.call_args.kwargs["end"], pump_today)


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


if __name__ == "__main__":
    unittest.main(verbosity=2)
