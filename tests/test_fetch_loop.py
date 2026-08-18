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
from ciq_autotune.store import Store
from ciq_autotune.sync import PartialFetchError


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
        # #424: on_write now also pre-warms the result cache — seconds of pure-Python
        # compute — so it must run in a worker thread, not on the loop serving requests.
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
    async def test_on_write_does_not_fire_when_nothing_written(self, mock_once):
        # A failed/partial fetch returns None → no invalidation.
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
