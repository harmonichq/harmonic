"""A fetch commits while a person's own write is reconciling follow-up (#576).

Answering a Prompt, like every local write, finishes with the follow-up
reconcile, and the fetch runs the same reconcile after its pull. The reconcile
reads the whole history to find the Trials. It used to read it while holding
SQLite's one writer, and on the home server after a restart, with the start
warm pass computing beside it, that read outlasted the 30 s busy timeout of the
other writer: the start fetch failed with ``database is locked``. Here the fetch
runs at the moment the Prompt answer's reconcile reads the history, and must
commit before that read ends.
"""

import shutil
import tempfile
import threading
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from ciq_autotune import watched_change
from ciq_autotune.api import create_app
from ciq_autotune.fetch_loop import run_fetch_once
from ciq_autotune.store import Store

SHOWCASE = (Path(__file__).resolve().parent.parent
            / "mockups" / "qa-e2e.synthetic" / "harmonic.sqlite")

# Long enough for an unblocked fetch on any runner, far short of the 30 s busy
# timeout a blocked one waits out before it would fail.
_FETCH_WAIT_SECONDS = 10


def _repull_latest_reading(store, **kwargs):
    """Stands in for the live pull: re-upsert the newest stored reading, as an
    hourly re-pull of an overlapping window does. It commits, advancing both
    revisions, and changes no value."""
    row = store.conn.execute(
        "SELECT t, bg, type FROM cgm_readings ORDER BY t DESC LIMIT 1").fetchone()
    store.upsert_cgm([{"EventDateTime": row["t"], "Readings (CGM / BGM)": row["bg"],
                       "Description": row["type"]}])
    return {"cgm_readings": 1}


class FetchBesideFollowUpReconcileTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = str(Path(self.dir.name) / "harmonic.sqlite")
        shutil.copyfile(SHOWCASE, self.path)
        self.client = TestClient(
            create_app(db_path=self.path, token=None, enable_fetch_loop=False),
            raise_server_exceptions=False)

    def tearDown(self):
        self.dir.cleanup()

    def test_a_fetch_commits_while_a_prompt_answer_reads_the_history(self):
        prompt = next(p for p in self.client.get("/api/prompts").json()
                      if p["answer"] is None)
        read_history = watched_change._reviewable_trials
        started, fetched = threading.Event(), threading.Event()
        fetch_errors = []
        during_read = []

        def fetch():
            try:
                run_fetch_once(self.path)
            except BaseException as error:  # surfaced by the assertion below
                fetch_errors.append(error)
            finally:
                fetched.set()

        def reconcile_reads_the_history(store, now, *, horizon_start=None):
            # The reconcile's own read (the whole history). The Prompt answer's,
            # the first, starts the fetch and gives it the time an unblocked fetch
            # needs; the fetch's own reconcile reads straight through.
            if horizon_start == datetime.min and not started.is_set():
                started.set()
                threading.Thread(target=fetch, daemon=True).start()
                during_read.append(fetched.wait(_FETCH_WAIT_SECONDS))
            return read_history(store, now, horizon_start=horizon_start)

        with patch("ciq_autotune.sync.pull_from_tconnect", _repull_latest_reading), \
                patch.object(watched_change, "_reviewable_trials", reconcile_reads_the_history):
            answer = self.client.post("/api/prompts/answer", json={
                "detector": prompt["detector"], "anchor_t": prompt["anchor_t"],
                "answer": "not-sure"})
            fetched.wait(60)

        self.assertEqual(answer.status_code, 200, answer.text)
        self.assertEqual(during_read, [True],
                         "the fetch waited on the reconcile's history read")
        self.assertEqual(fetch_errors, [])
        with Store.open_queryonly(self.path) as store:
            status = store.fetch_status()
            frontier = store.follow_up_frontier()
            revision = store.input_data_revision()
        self.assertIsNone(status["last_error"])
        self.assertIsNotNone(status["last_success_at"])
        # Both writers reconciled, so the frontier is current after them.
        self.assertEqual(frontier["reconciled_input_revision"], revision)


if __name__ == "__main__":
    unittest.main()
