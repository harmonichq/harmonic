"""A burst of Prompt answers pays one follow-up reconcile, after its responses (#677).

Answering a Prompt is a recorded-data write: it invalidates the result cache at
once. It used to reconcile the whole history inside its request as well, so on a
long history every answer took seconds, and a burst of them, answered row after
row, took tens of seconds each as their reconciles ran side by side. The
reconcile now runs after the response, and a write that finds one running leaves
its own to it, which reconciles once more when it is done (ADR 677).
"""

import shutil
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from ciq_autotune import watched_change
from ciq_autotune.api import create_app
from ciq_autotune.store import Store

SHOWCASE = (Path(__file__).resolve().parent.parent
            / "mockups" / "qa-e2e.synthetic" / "harmonic.sqlite")

# Far longer than an answer that does not wait on the reconcile takes on any runner.
_BLOCKED_SECONDS = 10


class PromptAnswerReconcileTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = str(Path(self.dir.name) / "harmonic.sqlite")
        shutil.copyfile(SHOWCASE, self.path)
        self.client = TestClient(
            create_app(db_path=self.path, token=None, enable_fetch_loop=False),
            raise_server_exceptions=False)

    def tearDown(self):
        self.dir.cleanup()

    def answer(self, prompt):
        return self.client.post("/api/prompts/answer", json={
            "detector": prompt["detector"], "anchor_t": prompt["anchor_t"], "answer": "not-sure"})

    def test_answers_made_while_a_reconcile_runs_are_saved_at_once_and_reconciled_once(self):
        first, *burst = [p for p in self.client.get("/api/prompts").json() if p["answer"] is None][:3]
        self.assertEqual(len(burst), 2)
        reconcile = watched_change.reconcile_ingested_follow_up
        running, release = threading.Event(), threading.Event()
        calls = []

        def slow_reconcile(store):
            # The whole-history reconcile, held on its first call as a long history holds it.
            calls.append(1)
            if len(calls) == 1:
                running.set()
                release.wait(_BLOCKED_SECONDS)
            return reconcile(store)

        responses = []
        with patch.object(watched_change, "reconcile_ingested_follow_up", slow_reconcile):
            ahead = threading.Thread(target=lambda: responses.append(self.answer(first)))
            ahead.start()
            self.assertTrue(running.wait(_BLOCKED_SECONDS))
            # A roster read while it reconciles answers the frontier as behind.
            during = self.client.get("/api/verify/trials").json()["admission"]
            started = time.monotonic()
            later = [self.answer(prompt) for prompt in burst]
            elapsed = time.monotonic() - started
            release.set()
            ahead.join()

        self.assertEqual([r.status_code for r in responses + later], [200, 200, 200])
        self.assertLess(elapsed, _BLOCKED_SECONDS / 2, "an answer waited on another's reconcile")
        # One reconcile for the first answer, and one more for the two made while it ran.
        self.assertEqual(len(calls), 2)
        answered = {p["anchor_t"]: p["answer"] for p in self.client.get("/api/prompts").json()}
        self.assertEqual([answered[p["anchor_t"]] for p in [first, *burst]], ["not-sure"] * 3)
        with Store.open_queryonly(self.path) as store:
            frontier = store.follow_up_frontier()
            revision = store.input_data_revision()
        self.assertEqual(frontier["reconciled_input_revision"], revision)
        # The roster read meanwhile is not kept: once reconciled, it is read again.
        self.assertEqual(during["reason"], "reconciliation_required")
        self.assertNotEqual(self.client.get("/api/verify/trials").json()["admission"].get("reason"),
                            "reconciliation_required")


if __name__ == "__main__":
    unittest.main()
