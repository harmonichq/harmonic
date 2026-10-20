"""A first-load read while a sync is landing answers its last coherent answer (#579).

A sync commits window by window, and the cache is invalidated only once it ends.
Every heavy read takes one consistent snapshot of the store and keeps what it
computed only if no write committed meanwhile. While a sync is landing, a write
commits during every snapshot such a read takes, so each attempt is thrown away;
the read used to give up with a server error. Like a read whose current answer is
not computed yet (#566), it now answers the last coherent answer it has, labelled
with ``input_data_age``, and fails only when it has none. The warm pass does not
drop a shape a write crossed: it computes it once the write has landed.
"""

import contextlib
import os
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import ciq_autotune.derived_artifacts as artifacts
from ciq_autotune.api import create_app
from ciq_autotune.derived_artifacts import sidecar_path
from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES, materialize_case

# The reads the app's five tabs make on first load that the warm pass names.
_OVERVIEW = (
    *(("/api/explore/time-of-day", {"days": days}) for days in (14, 30, 90)),
    *(("/api/explore/meal-size", {"days": days}) for days in (14, 30, 90)),
    *(("/api/outcomes", {"window": days}) for days in (14, 30, 90)),
    *(("/api/analyze", {"window": days}) for days in (14, 30, 90)),
    ("/api/analyze", {"window": 30, "pool": True}),
    ("/api/verify/trials", {}),
)
# Composed from the follow-up state at the current revision, so only their
# findings are an earlier answer.
_QUEUE = (("/api/diagnose/findings", {}), ("/api/guidance", {}), ("/api/focus", {}))


def _sync_window(path):
    """One sync window landing: re-upsert the newest stored reading, as an hourly
    re-pull of an overlapping window does. It commits, advancing both revisions,
    and changes no value."""
    with Store.open(path) as store:
        row = store.conn.execute(
            "SELECT t, bg, type FROM cgm_readings ORDER BY t DESC LIMIT 1").fetchone()
        store.upsert_cgm([{"EventDateTime": row["t"], "Readings (CGM / BGM)": row["bg"],
                           "Description": row["type"]}])


@contextlib.contextmanager
def _a_sync_landing(path):
    """A sync window commits during every snapshot a read takes. One snapshot per
    attempt keeps the reads short; every one of them is crossed either way."""
    real = artifacts._call

    def crossed(compute, store):
        try:
            return real(compute, store)
        finally:
            _sync_window(path)

    with patch.object(artifacts, "_call", side_effect=crossed), \
         patch.object(artifacts, "_MAX_SNAPSHOT_ATTEMPTS", 1):
        yield


class ReadBesideASyncTest(unittest.TestCase):
    def setUp(self):
        database = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(database.close)
        self.addCleanup(self._remove_derived_results, database.name)
        self.path = database.name
        with Store.open(self.path) as store:
            materialize_case(store, next(case for case in QA_CASES if case.name == "c3-trial"))

    @staticmethod
    def _remove_derived_results(path):
        for suffix in ("", "-wal", "-shm"):
            with contextlib.suppress(FileNotFoundError):
                os.unlink(sidecar_path(path) + suffix)

    def _app(self):
        app = create_app(db_path=self.path, token=None, enable_fetch_loop=False)
        app.state.recompute_roster = lambda: ()
        return app

    def _changes_detail(self, client):
        """The Changes tab's one detail read: the active Trial's retained comparison."""
        admission = client.get("/api/verify/trials").json()["admission"]
        self.assertEqual(admission["active_kind"], "trial")
        return ("/api/verify/trials", {"selected": admission["active_id"], "assessment": "retained"})

    def _read_every_tab_while_a_sync_lands(self, client):
        detail = self._changes_detail(client)
        reads = (*_OVERVIEW, detail, *_QUEUE)
        before = {}
        for path, params in reads:
            response = client.get(path, params=params)
            self.assertEqual(response.status_code, 200, (path, params, response.text))
            self.assertNotIn("input_data_age", response.json())
            before[(path, tuple(params.items()))] = response.json()
        # The sync's first window has landed, and it has not ended, so nothing has
        # invalidated the cache.
        _sync_window(self.path)
        served = {}
        with _a_sync_landing(self.path):
            for path, params in reads:
                response = client.get(path, params=params)
                self.assertEqual(response.status_code, 200, (path, params, response.text))
                body = response.json()
                self.assertIn("input_data_age", body, (path, params))
                served[(path, tuple(params.items()))] = body
        for read in (*_OVERVIEW, detail):
            key = (read[0], tuple(read[1].items()))
            earlier = {k: v for k, v in served[key].items() if k != "input_data_age"}
            self.assertEqual(earlier, before[key], key)
        return before, served

    def test_every_first_load_read_answers_its_last_coherent_answer_labelled(self):
        client = TestClient(self._app(), raise_server_exceptions=False)
        before, served = self._read_every_tab_while_a_sync_lands(client)
        # The findings are the earlier answer, and no write is admitted against it.
        findings = served[("/api/diagnose/findings", ())]
        self.assertEqual({k: v for k, v in findings.items()
                          if k not in ("input_data_age", "analysis_generation")},
                         {k: v for k, v in before[("/api/diagnose/findings", ())].items()
                          if k != "analysis_generation"})
        guidance = served[("/api/guidance", ())]
        self.assertNotEqual(guidance["analysis_generation"],
                            before[("/api/guidance", ())]["analysis_generation"])
        subject = guidance["candidates"][0]["subject"]
        snooze = client.put(f"/api/guidance/preferences/{subject}",
                            json={"generation": guidance["analysis_generation"]})
        self.assertEqual(snooze.status_code, 409, snooze.text)

    def test_with_the_warm_worker_running_the_current_answers_land_once_the_sync_ends(self):
        app = self._app()
        with TestClient(app, raise_server_exceptions=False) as client:
            self._read_every_tab_while_a_sync_lands(client)
            # The sync's end invalidates, as the fetch loop's on_write does.
            app.state.signal_recompute()
            reads = (*_OVERVIEW, *_QUEUE)
            deadline = time.monotonic() + 60
            while any("input_data_age" in client.get(path, params=params).json()
                      for path, params in reads):
                self.assertLess(time.monotonic(), deadline, "the current answers never landed")
                time.sleep(0.05)

    def test_with_no_earlier_answer_a_read_fails_as_before(self):
        client = TestClient(self._app(), raise_server_exceptions=False)
        with _a_sync_landing(self.path):
            self.assertEqual(client.get("/api/outcomes", params={"window": 14}).status_code, 500)
            trials = client.get("/api/verify/trials")
            self.assertEqual(trials.status_code, 503)
            self.assertEqual(trials.json()["detail"], "history inputs changed during every snapshot")
            findings = client.get("/api/diagnose/findings")
            self.assertEqual(findings.status_code, 409)
            self.assertEqual(findings.json()["detail"]["code"], "analysis_generation_mismatch")
            self.assertEqual(client.get("/api/guidance").status_code, 503)

    def test_the_warm_pass_computes_a_crossed_shape_once_the_sync_has_landed(self):
        app = create_app(db_path=self.path, token=None, enable_fetch_loop=False)
        pooled = next(item for item in app.state.recompute_roster() if item[0] == "analyze-pooled")
        after = threading.Event()
        app.state.recompute_roster = lambda: (pooled, ("after", after.set))

        async def no_pace():
            return None

        app.state.recompute_pace = no_pace
        with TestClient(app, raise_server_exceptions=False) as client:
            with self.assertNoLogs("ciq_autotune.api", "WARNING"):
                with _a_sync_landing(self.path):
                    app.state.signal_recompute()
                    # The pass waits for the sync rather than computing the rest of
                    # the roster against a store still moving.
                    self.assertFalse(after.wait(2), "the pass ran on while the sync landed")
                app.state.signal_recompute()
                self.assertTrue(after.wait(30), "the pass never resumed once the sync landed")
            pooled_read = client.get("/api/analyze", params={"window": 30, "pool": True})
            self.assertEqual(pooled_read.status_code, 200)
            self.assertNotIn("input_data_age", pooled_read.json())


class CaseFilesBesideASyncTest(unittest.TestCase):
    """The case files the Queue reads keep their last answer too (#581)."""

    def setUp(self):
        database = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(database.close)
        self.addCleanup(ReadBesideASyncTest._remove_derived_results, database.name)
        self.path = database.name
        with Store.open(self.path) as store:
            materialize_case(store, next(case for case in QA_CASES
                                         if case.name == "behavioral-missed-meal"))

    def _app(self):
        app = create_app(db_path=self.path, token=None, enable_fetch_loop=False)
        app.state.recompute_roster = lambda: ()
        return app

    def _read(self, client):
        """The Queue's case-file reads: the preparation, then each finding's event case."""
        preparation = client.get("/api/diagnose/finding-case-file-preparation")
        self.assertEqual(preparation.status_code, 200, preparation.text)
        body = preparation.json()
        cases = {}
        for finding_id in body["behavioral_case_headers"]:
            case = client.get("/api/diagnose/finding-case-file", params={
                "projection_id": body["projection_id"], "finding_id": finding_id,
                "alignment": "event"})
            self.assertEqual(case.status_code, 200, (finding_id, case.text))
            cases[finding_id] = case.json()
        return body, cases

    @staticmethod
    def _without_age(body):
        return {k: v for k, v in body.items() if k != "input_data_age"}

    def test_after_a_restart_the_case_files_answer_without_preparing(self):
        import ciq_autotune.api as api_mod
        before = self._read(TestClient(self._app()))
        self.assertTrue(before[1], "the case store ranks a finding with a case file")
        builds = []
        real = api_mod.prepare_finding_cases
        with patch.object(api_mod, "prepare_finding_cases",
                          side_effect=lambda *a, **k: builds.append(1) or real(*a, **k)):
            after = self._read(TestClient(self._app()))
        self.assertEqual(after, before)
        self.assertEqual(builds, [])

    def test_after_a_restart_while_a_sync_lands_the_case_files_answer_labelled(self):
        preparation, cases = self._read(TestClient(self._app()))
        client = TestClient(self._app(), raise_server_exceptions=False)
        _sync_window(self.path)
        with _a_sync_landing(self.path):
            served, served_cases = self._read(client)
        self.assertIn("input_data_age", served)
        self.assertEqual(self._without_age(served), preparation)
        for finding_id, case in served_cases.items():
            self.assertIn("input_data_age", case, finding_id)
            self.assertEqual(self._without_age(case), cases[finding_id])


class StartFetchTest(unittest.TestCase):
    """The start fetch waits for the start warm pass (#581)."""

    def test_the_start_fetch_commits_only_after_the_start_warm_pass(self):
        import ciq_autotune.fetch_loop as fetch_loop
        database = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(database.close)
        with Store.open(database.name):
            pass
        app = create_app(db_path=database.name, token=None, enable_fetch_loop=True,
                         warm_on_start=True)
        warming, release, fetched = threading.Event(), threading.Event(), threading.Event()

        def shape():
            warming.set()
            self.assertTrue(release.wait(10))

        app.state.recompute_roster = lambda: (("start", shape),)
        with patch.object(fetch_loop, "run_fetch_once",
                          side_effect=lambda *args, **kwargs: fetched.set()):
            with TestClient(app):
                self.assertTrue(warming.wait(5), "the start warm pass never began")
                self.assertFalse(fetched.wait(1), "the start fetch ran beside the warm pass")
                release.set()
                self.assertTrue(fetched.wait(5), "the start fetch never ran")


if __name__ == "__main__":
    unittest.main()
