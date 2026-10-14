"""The app's first-load reads answer while another connection holds the writer.

``serve`` runs the hourly fetch in the same process as the API, and its
follow-up reconciliation holds SQLite's one writer for as long as it computes.
Every read that opened a Store used to queue behind that writer and fail with
``database is locked`` once it outlasted the 30 s busy timeout — the whole first
load of the app. A held writer here stands in for that fetch.
"""

import shutil
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi.testclient import TestClient

from ciq_autotune.api import create_app

SHOWCASE = (Path(__file__).resolve().parent.parent
            / "mockups" / "qa-e2e.synthetic" / "harmonic.sqlite")

# The reads the app makes on first load that open a Store: the badges' status
# and Prompts, and the Overview's and Day's fixed results.
FIRST_LOAD = (
    "/api/status",
    "/api/prompts",
    "/api/day-navigator",
    "/api/explore/time-of-day?days=14",
    "/api/outcomes?window=14",
)


class FirstLoadUnderWriterTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = str(Path(self.dir.name) / "harmonic.sqlite")
        shutil.copyfile(SHOWCASE, self.path)
        self.client = TestClient(
            create_app(db_path=self.path, token=None, enable_fetch_loop=False),
            raise_server_exceptions=False)

    def tearDown(self):
        self.dir.cleanup()

    def test_first_load_reads_answer_while_another_connection_holds_the_writer(self):
        writer = sqlite3.connect(self.path, isolation_level=None)
        writer.execute("BEGIN IMMEDIATE")
        try:
            with ThreadPoolExecutor(max_workers=len(FIRST_LOAD)) as pool:
                codes = dict(pool.map(
                    lambda url: (url, self.client.get(url).status_code), FIRST_LOAD))
        finally:
            writer.rollback()
            writer.close()
        self.assertEqual(codes, {url: 200 for url in FIRST_LOAD})


if __name__ == "__main__":
    unittest.main()
