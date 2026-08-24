"""Hourly background fetch loop tests.

The live ``pull_from_tconnect`` call is untestable without real credentials
(CLAUDE.md), so these mock it out and cover the loop's own contract instead:
fetch on startup, record success/failure without ever raising, then wait.
"""

import asyncio
import contextlib
import tempfile
import unittest
from unittest.mock import patch

from ciq_autotune.fetch_loop import run_fetch_loop, run_fetch_once
from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings
from ciq_autotune.store import Store
from ciq_autotune.sync import PartialFetchError

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
    def test_failure_that_committed_nothing_returns_none(self, mock_pull):
        # Both failure branches, because record_fetch_result advances the
        # revision itself: read after it, "the revision advanced" is always true
        # and every bad-credential run would clear the cache and re-warm, hourly,
        # forever (#146). Neither side effect here writes anything.
        mock_pull.side_effect = PartialFetchError(
            RuntimeError("network blip"), written={"cgm_readings": 7},
            windows_completed=2, windows_total=5,
            failed_window=("2026-02-01", "2026-03-03"))
        self.assertIsNone(run_fetch_once(self.tmp.name))
        mock_pull.side_effect = RuntimeError("no creds")
        self.assertIsNone(run_fetch_once(self.tmp.name))

    @patch("ciq_autotune.sync.pull_from_tconnect")
    def test_unexpected_exception_also_recorded_not_raised(self, mock_pull):
        mock_pull.side_effect = ValueError("boom")
        run_fetch_once(self.tmp.name)  # must not raise
        with Store.open(self.tmp.name) as store:
            status = store.fetch_status()
        self.assertEqual(status["last_error"], "boom")


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


if __name__ == "__main__":
    unittest.main()
