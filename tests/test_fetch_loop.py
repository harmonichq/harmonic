"""Hourly background fetch loop tests.

The live ``pull_from_tconnect`` call is untestable without real credentials
(CLAUDE.md), so these mock it out and cover the loop's own contract instead:
fetch on startup, record success/failure without ever raising, then wait. The
one class that runs the real pull checks a refusal that comes before any login,
and mocks the credential read so no host can reach one.
"""

import asyncio
import contextlib
import os
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from ciq_autotune.fetch_loop import FETCH_WINDOW_DAYS, run_fetch_loop, run_fetch_once
from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings
from ciq_autotune.store import Store
from ciq_autotune.sync import NotSetUp, PartialFetchError, SignInRefused, pull_from_tconnect
from tests.test_wall_clock import (
    PROCESS_ZONE, PUMP_ZONE, assert_near, assert_window_end, pin_process_zone, pin_pump_zone, pump_now,
)

# Whether an attempt committed anything is read off the store's own durable
# revision (#146), so a mock that merely raises proves nothing — it leaves the
# revision where it was. These stand-ins write through the real Store the pull
# was handed, then fail the way the real pull fails.
_BASAL_ROW = {"seq_num": 1, "time": "2026-06-01 00:00:00",
              "delivery_type": "algorithmDelivery", "duration_mins": 5,
              "basal_rate": 0.8, "profile_basal_rate": 0.6}

_SETTINGS = PumpSettings(active_idp=1, profiles=(
    ProfileSettings(idp=1, name="1", dia_min=300, carb_entry=True, max_bolus=15.0,
                    segments=(ProfileSegment(start_min=0, basal_rate=0.6, isf=30,
                                             carb_ratio=7.0, target_bg=110),)),
))


def _commits_rows_then_raises(error):
    """A window's upserts land, then a later window fails."""
    def pull(store, **kwargs):
        store.upsert_basal([_BASAL_ROW])
        raise error
    return pull


def _commits_settings_then_raises(error):
    """The settings snapshot lands, then the *first* window fails — sync
    captures settings before any window is fetched, so even that failure leaves
    committed rows behind."""
    def pull(store, **kwargs):
        store.upsert_settings_snapshot("2026-06-01 09:00:00", _SETTINGS)
        raise error
    return pull


class RunFetchOnceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")

    def tearDown(self):
        self.tmp.close()

    @patch("ciq_autotune.sync.pull_from_tconnect")
    def test_records_success(self, mock_pull):
        mock_pull.return_value = {"cgm_readings": 10}
        run_fetch_once(self.tmp.name)
        with Store.open(self.tmp.name) as store:
            status = store.fetch_status()
        self.assertIsNotNone(status["last_success_at"])
        self.assertIsNone(status["last_error"])
        self.assertEqual(status["last_written"], {"cgm_readings": 10})

    @patch("ciq_autotune.sync.pull_from_tconnect")
    def test_records_failure_without_raising(self, mock_pull):
        mock_pull.side_effect = RuntimeError("no creds")
        run_fetch_once(self.tmp.name)  # must not raise
        with Store.open(self.tmp.name) as store:
            status = store.fetch_status()
        self.assertIsNone(status["last_success_at"])
        self.assertEqual(status["last_error"], "no creds")

    @patch("ciq_autotune.sync.pull_from_tconnect")
    def test_partial_fetch_records_failure_naming_windows(self, mock_pull):
        mock_pull.side_effect = PartialFetchError(
            RuntimeError("network blip"),
            written={"cgm_readings": 7},
            windows_completed=2, windows_total=5,
            failed_window=("2026-02-01", "2026-03-03"),
        )
        run_fetch_once(self.tmp.name)  # must not raise
        with Store.open(self.tmp.name) as store:
            status = store.fetch_status()
        # A partial run is not a success — last_success stays unset.
        self.assertIsNone(status["last_success_at"])
        # ...but /status must show how far it got and why it stopped.
        self.assertIn("2 of 5 windows", status["last_error"])
        self.assertIn("network blip", status["last_error"])

    @patch("ciq_autotune.sync.pull_from_tconnect")
    def test_partial_fetch_that_committed_returns_its_counts(self, mock_pull):
        # #146: the completed windows are durably in the store, so the caller is
        # told to invalidate even though the attempt is recorded as a failure.
        mock_pull.side_effect = _commits_rows_then_raises(PartialFetchError(
            RuntimeError("network blip"),
            written={"basal_events": 1},
            windows_completed=2, windows_total=5,
            failed_window=("2026-02-01", "2026-03-03"),
        ))
        self.assertEqual(run_fetch_once(self.tmp.name), {"basal_events": 1})
        with Store.open(self.tmp.name) as store:
            status = store.fetch_status()
        # Invalidating does not promote a partial run to a success.
        self.assertIsNone(status["last_success_at"])
        self.assertIn("2 of 5 windows", status["last_error"])

    @patch("ciq_autotune.sync.pull_from_tconnect")
    def test_success_that_committed_nothing_still_returns_counts(self, mock_pull):
        # The success branch stays unconditional: a fetch that found nothing new
        # is still a success and still invalidates (#146).
        mock_pull.return_value = {}
        self.assertEqual(run_fetch_once(self.tmp.name), {})

    @patch("ciq_autotune.sync.pull_from_tconnect")
    def test_first_window_failure_that_committed_settings_invalidates(self, mock_pull):
        # A first-window failure propagates raw rather than as a
        # PartialFetchError, but the settings snapshot taken before window 0 is
        # already committed — counts unknown on this path, so an empty dict (#146).
        mock_pull.side_effect = _commits_settings_then_raises(
            RuntimeError("network blip"))
        self.assertIsNotNone(run_fetch_once(self.tmp.name))

    @patch("ciq_autotune.sync.pull_from_tconnect")
    def test_failure_that_committed_nothing_returns_none_but_reconciles_status_revision(self, mock_pull):
        # Status-only failures preserve the no-row return sentinel, while the
        # frontier still catches up to their durable input revision (#404).
        from unittest.mock import patch
        mock_pull.side_effect = PartialFetchError(
            RuntimeError("network blip"), written={"cgm_readings": 7},
            windows_completed=2, windows_total=5,
            failed_window=("2026-02-01", "2026-03-03"))
        with patch("ciq_autotune.watched_change.reconcile_ingested_follow_up") as reconcile:
            self.assertIsNone(run_fetch_once(self.tmp.name))
            mock_pull.side_effect = RuntimeError("no creds")
            self.assertIsNone(run_fetch_once(self.tmp.name))
        self.assertEqual(reconcile.call_count, 2)

    @patch("ciq_autotune.sync.pull_from_tconnect")
    def test_unexpected_exception_also_recorded_not_raised(self, mock_pull):
        mock_pull.side_effect = ValueError("boom")
        run_fetch_once(self.tmp.name)  # must not raise
        with Store.open(self.tmp.name) as store:
            status = store.fetch_status()
        self.assertEqual(status["last_error"], "boom")


class FetchOnThePumpClockTest(unittest.TestCase):
    """ADR 443: an attempt's stamps and window follow ``TIMEZONE_NAME``'s wall
    clock, not the process's. The zones are pinned 25 h apart."""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        self.addCleanup(self.tmp.close)
        pin_process_zone(self, PROCESS_ZONE)
        pin_pump_zone(self, PUMP_ZONE)

    @patch("ciq_autotune.sync.pull_from_tconnect")
    def test_success_stamps_the_pump_clock(self, pull):
        pull.return_value = {"cgm_readings": 1}
        run_fetch_once(self.tmp.name)
        with Store.open(self.tmp.name) as store:
            status = store.fetch_status()
        assert_near(self, status["last_success_at"], pump_now())
        assert_near(self, status["last_attempt_at"], pump_now())

    @patch("ciq_autotune.sync.pull_from_tconnect")
    def test_failed_attempt_stamps_the_pump_clock(self, pull):
        pull.side_effect = RuntimeError("synthetic network failure")
        run_fetch_once(self.tmp.name)
        with Store.open(self.tmp.name) as store:
            status = store.fetch_status()
        assert_near(self, status["last_attempt_at"], pump_now())
        self.assertIsNone(status["last_success_at"])

    def _assert_window(self, pump):
        with patch("ciq_autotune.sync.pull_from_tconnect", return_value={}) as pull:
            run_fetch_once(self.tmp.name)
        end = pull.call_args.kwargs["end"]
        assert_window_end(self, end, pump)
        self.assertEqual(pull.call_args.kwargs["start"], end - timedelta(days=FETCH_WINDOW_DAYS))

    def test_window_with_the_process_a_day_ahead(self):
        self._assert_window(PUMP_ZONE)

    def test_window_with_the_process_a_day_behind(self):
        pin_process_zone(self, PUMP_ZONE)
        pin_pump_zone(self, PROCESS_ZONE)
        self._assert_window(PROCESS_ZONE)


class FetchRefusesUnusableZoneTest(unittest.TestCase):
    """The real pull runs here, so the credential read is mocked to ``None``: no
    host can reach a login. The zone refusal comes before that read, so the mock
    is never called."""

    def _status_after_fetch(self, **zone):
        env = {key: value for key, value in os.environ.items()
               if key != "TIMEZONE_NAME" and not key.startswith("TCONNECT_")}
        with tempfile.TemporaryDirectory() as directory, \
                patch.dict(os.environ, {**env, **zone}, clear=True), \
                patch("ciq_autotune.credentials.load_credentials", return_value=None) as credentials:
            run_fetch_once(directory + "/synthetic.sqlite", key_path=directory + "/secret.key")
            with Store.open(directory + "/synthetic.sqlite") as store:
                status = store.fetch_status()
        credentials.assert_not_called()
        return status

    def test_unset_zone_is_recorded_not_raised(self):
        status = self._status_after_fetch()
        self.assertIn("TIMEZONE_NAME", status["last_error"])
        self.assertIsNotNone(status["last_attempt_at"])
        self.assertIsNone(status["last_success_at"])

    def test_unloadable_zone_is_recorded_on_the_process_clock(self):
        pin_process_zone(self, "UTC")
        for name in ("Not/AZone", "America"):
            with self.subTest(TIMEZONE_NAME=name):
                status = self._status_after_fetch(TIMEZONE_NAME=name)
                self.assertIn("TIMEZONE_NAME", status["last_error"])
                assert_near(self, status["last_attempt_at"], datetime.now())
                self.assertIsNone(status["last_success_at"])


class RunFetchLoopTest(unittest.IsolatedAsyncioTestCase):
    @patch("ciq_autotune.fetch_loop.run_fetch_once")
    async def test_fetches_immediately_then_waits(self, mock_once):
        task = asyncio.create_task(run_fetch_loop(":memory:", interval_seconds=100))
        await asyncio.sleep(0.05)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        mock_once.assert_called_once()

    @patch("ciq_autotune.fetch_loop.run_fetch_once")
    async def test_on_write_fires_when_fetch_wrote(self, mock_once):
        # #267: a fetch that wrote (truthy return) invalidates the cache.
        mock_once.return_value = {"cgm_readings": 5}
        fired = []
        task = asyncio.create_task(run_fetch_loop(
            ":memory:", interval_seconds=100, on_write=lambda: fired.append(1)))
        await asyncio.sleep(0.05)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        self.assertEqual(fired, [1])

    @patch("ciq_autotune.fetch_loop.run_fetch_once")
    async def test_on_write_runs_off_the_event_loop(self, mock_once):
        # #125: on_write is the fetch-thread callback that bumps and signals the
        # lifecycle worker; it must not run on the serving loop.
        import threading

        mock_once.return_value = {"cgm_readings": 5}
        loop_thread = threading.current_thread()
        ran_on = []
        task = asyncio.create_task(run_fetch_loop(
            ":memory:", interval_seconds=100,
            on_write=lambda: ran_on.append(threading.current_thread())))
        await asyncio.sleep(0.05)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        self.assertEqual(len(ran_on), 1)
        self.assertIsNot(ran_on[0], loop_thread)

    @patch("ciq_autotune.fetch_loop.run_fetch_once")
    async def test_on_write_fires_when_fetch_committed_unknown_counts(self, mock_once):
        # #146: a failure that committed rows returns {} — committed, counts
        # unknown. It is falsy, and it must still invalidate.
        mock_once.return_value = {}
        fired = []
        task = asyncio.create_task(run_fetch_loop(
            ":memory:", interval_seconds=100, on_write=lambda: fired.append(1)))
        await asyncio.sleep(0.05)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        self.assertEqual(fired, [1])

    @patch("ciq_autotune.fetch_loop.run_fetch_once")
    async def test_on_write_does_not_fire_when_nothing_written(self, mock_once):
        # A fetch that committed nothing returns None → no invalidation.
        mock_once.return_value = None
        fired = []
        task = asyncio.create_task(run_fetch_loop(
            ":memory:", interval_seconds=100, on_write=lambda: fired.append(1)))
        await asyncio.sleep(0.05)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        self.assertEqual(fired, [])

    @patch("ciq_autotune.fetch_loop.run_fetch_once")
    async def test_cancellation_propagates(self, mock_once):
        task = asyncio.create_task(run_fetch_loop(":memory:", interval_seconds=100))
        await asyncio.sleep(0.01)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task



# The text requests gives a connection that never opened, as the fetch stores it.
_UNREACHABLE = ("HTTPSConnectionPool(host='sso.example.invalid', port=443): Max retries "
                "exceeded with url: /login (Caused by NewConnectionError('Failed to "
                "establish a new connection: [Errno 101] Network is unreachable'))")


class FetchErrorLabelTest(unittest.TestCase):
    """Settings shows a failed fetch by a short label the server serves beside
    the raw error text, classified from what the fetch raised."""

    def setUp(self):
        tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        tmp.close()
        self.addCleanup(os.unlink, tmp.name)
        self.db = tmp.name

    def _status_after(self, error):
        from fastapi.testclient import TestClient
        from ciq_autotune.api import create_app
        with patch("ciq_autotune.sync.pull_from_tconnect", side_effect=error, return_value={}):
            run_fetch_once(self.db)
        client = TestClient(create_app(db_path=self.db, token=None, enable_fetch_loop=False))
        return client.get("/api/status").json()

    def test_each_failure_is_served_by_its_label_beside_its_text(self):
        import requests
        from tconnectsync.api.common import ApiException
        cases = [
            (requests.exceptions.ConnectionError(_UNREACHABLE), "No connection"),
            (requests.exceptions.ConnectTimeout("connect timed out"), "Timed out"),
            (requests.exceptions.ReadTimeout("read timed out"), "Timed out"),
            (SignInRefused("Error sending POST to login_api_url: denied (HTTP 401)"),
             "Sign-in refused"),
            (ApiException(400, "TandemSourceApi HTTP 400 response: bad"), "HTTP 400"),
            (NotSetUp("t:connect credentials are not configured."), "Not set up"),
            (RuntimeError("something else"), "Unknown"),
        ]
        for error, label in cases:
            with self.subTest(label=label, error=type(error).__name__):
                status = self._status_after(error)
                self.assertEqual(status["last_error_label"], label)
                self.assertEqual(status["last_error"], str(error))

    def test_partial_fetch_is_labelled_by_what_stopped_it(self):
        import requests
        status = self._status_after(PartialFetchError(
            requests.exceptions.ConnectionError(_UNREACHABLE), written={},
            windows_completed=1, windows_total=4, failed_window=("2026-02-01", "2026-03-03")))
        self.assertEqual(status["last_error_label"], "No connection")
        self.assertIn("1 of 4 windows", status["last_error"])

    def test_success_serves_no_label(self):
        status = self._status_after(None)
        self.assertIsNone(status["last_error"])
        self.assertIsNone(status["last_error_label"])

    def test_an_error_stored_before_labels_is_served_as_unknown(self):
        from fastapi.testclient import TestClient
        from ciq_autotune.api import create_app
        with Store.open(self.db) as store:
            store.conn.execute(
                "INSERT INTO fetch_status (id, last_attempt_at, last_error) "
                "VALUES (1, '2026-06-01 09:00:00', 'an older failure')")
            store.conn.commit()
        client = TestClient(create_app(db_path=self.db, token=None, enable_fetch_loop=False))
        self.assertEqual(client.get("/api/status").json()["last_error_label"], "Unknown")


class SignInRefusedTest(unittest.TestCase):
    """The vendor client signs in on its first read and raises its plain
    ApiException when the sign-in is refused; the pull names that refusal."""

    def test_a_refused_sign_in_is_named(self):
        from tconnectsync.api.common import ApiException
        from ciq_autotune.credentials import Credentials

        class _Refusing:
            def __init__(self, *args):
                pass

            @property
            def tandemsource(self):
                raise ApiException(401, "Error sending POST to login_api_url: denied")

        with tempfile.TemporaryDirectory() as directory, \
                patch.dict(os.environ, {"TIMEZONE_NAME": "UTC"}), \
                patch("ciq_autotune.credentials.load_credentials",
                      return_value=Credentials("wearer@example.invalid", "synthetic", "US")), \
                patch("tconnectsync.api.TConnectApi", _Refusing), \
                Store.open(directory + "/synthetic.sqlite") as store:
            with self.assertRaises(SignInRefused) as raised:
                pull_from_tconnect(store, start="2026-06-01", end="2026-06-02")
        self.assertIn("login_api_url", str(raised.exception))


def _fails(db_path, times):
    """A stand-in fetch: records ``times`` failures to the store, then successes."""
    calls = []

    def fetch(path, **kwargs):
        calls.append(path)
        with Store.open(db_path) as store:
            store.record_fetch_result(
                attempted_at=f"2026-06-01 09:00:{len(calls):02d}",
                ok=len(calls) > times, error=None if len(calls) > times else "no connection",
                error_label=None if len(calls) > times else "No connection")
        return None
    return fetch, calls


class FetchLoopRetryTest(unittest.IsolatedAsyncioTestCase):
    """A fetch that fails — the network not up yet at container start — is
    retried a few minutes later rather than left Failed for the hour, a bounded
    number of times, before the loop falls back to hourly."""

    def setUp(self):
        tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        tmp.close()
        self.addCleanup(os.unlink, tmp.name)
        self.db = tmp.name

    async def _run(self, fetch, seconds=0.3):
        with patch("ciq_autotune.fetch_loop.run_fetch_once", side_effect=fetch):
            task = asyncio.create_task(run_fetch_loop(
                self.db, interval_seconds=100, retry_seconds=0.01))
            await asyncio.sleep(seconds)
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    async def test_a_failed_fetch_is_retried_early_until_it_succeeds(self):
        fetch, calls = _fails(self.db, times=2)
        await self._run(fetch)
        # Two failures, then the success; the next is the hourly one.
        self.assertEqual(len(calls), 3)

    async def test_early_retries_are_bounded(self):
        fetch, calls = _fails(self.db, times=100)
        await self._run(fetch)
        # The first attempt and three early retries, then hourly.
        self.assertEqual(len(calls), 4)

    async def test_a_success_waits_the_hour(self):
        fetch, calls = _fails(self.db, times=0)
        await self._run(fetch)
        self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
