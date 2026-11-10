"""A burst of Prompt answers pays one follow-up reconcile, after its responses (#677).

Answering a Prompt is a recorded-data write: it invalidates the result cache at
once. It used to reconcile the whole history inside its request as well, so on a
long history every answer took seconds, and a burst of them, answered row after
row, took tens of seconds each as their reconciles ran side by side. The
reconcile now runs after the response, and a write that finds one running leaves
its own to it, which reconciles once more when it is done (ADR 677).
"""

import asyncio
import json
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


def post_marking_response(app, path, body, responded):
    """POST straight into the ASGI app, setting `responded` as the response's last
    byte is sent. Unlike TestClient, which returns only once the request's
    background tasks are done, this shows when the answer is answered."""
    payload = json.dumps(body).encode()
    status = {}

    async def run():
        delivered = False

        async def receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": payload, "more_body": False}
            while not responded.is_set():
                await asyncio.sleep(0.01)
            return {"type": "http.disconnect"}

        async def send(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            elif message["type"] == "http.response.body" and not message.get("more_body"):
                responded.set()

        await app({
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": "POST", "scheme": "http", "path": path, "raw_path": path.encode(),
            "query_string": b"", "root_path": "", "client": ("testclient", 50000),
            "server": ("testserver", 80),
            "headers": [(b"content-type", b"application/json"),
                        (b"content-length", str(len(payload)).encode())],
        }, receive, send)

    asyncio.run(run())
    return status.get("code")


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

    @staticmethod
    def body(prompt):
        return {"detector": prompt["detector"], "anchor_t": prompt["anchor_t"], "answer": "not-sure"}

    def answer(self, prompt):
        return self.client.post("/api/prompts/answer", json=self.body(prompt))

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

        statuses, responded = [], threading.Event()
        with patch.object(watched_change, "reconcile_ingested_follow_up", slow_reconcile):
            ahead = threading.Thread(target=lambda: statuses.append(post_marking_response(
                self.client.app, "/api/prompts/answer", self.body(first), responded)))
            ahead.start()
            self.assertTrue(running.wait(_BLOCKED_SECONDS))
            # The first answer is answered while its reconcile is still held: the
            # response does not wait for it.
            answered_first = responded.wait(_BLOCKED_SECONDS / 2)
            self.assertFalse(release.is_set())
            # A roster read while it reconciles answers the frontier as behind.
            during = self.client.get("/api/verify/trials").json()["admission"]
            started = time.monotonic()
            later = [self.answer(prompt) for prompt in burst]
            elapsed = time.monotonic() - started
            release.set()
            ahead.join()

        self.assertTrue(answered_first, "the answer waited on its own reconcile")
        self.assertEqual(statuses + [r.status_code for r in later], [200, 200, 200])
        self.assertLess(elapsed, _BLOCKED_SECONDS / 2, "an answer waited on another's reconcile")
        # Never two at once, and none inside a request: the first pass, and one more
        # for the pass both later answers crossed. Only that first pass was crossed.
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
