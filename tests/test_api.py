"""HTTP API tests (needs the api extra; skipped if FastAPI isn't installed).

The API is a thin renderer over AnalysisResult, so the tests assert it serves the
same versioned JSON and enforces the single-user static token — not the analysis
itself (that is covered by the analyzer/facade tests).
"""

import contextlib
import os
import sqlite3
from concurrent.futures import ThreadPoolExecutor
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

try:
    import tconnectsync  # noqa: F401
    _HAS_TCONNECTSYNC = True
except ImportError:  # pragma: no cover
    _HAS_TCONNECTSYNC = False

from ciq_autotune.result import SCHEMA_VERSION
from ciq_autotune.derived_artifacts import load_latest_prior, sidecar_path
from ciq_autotune.settings import parse_pump_settings
from ciq_autotune.store import Store

# #353: internal architecture-decision references (e.g. "ADR 0038") must never
# reach a patient. This matches one anywhere in a nested JSON payload.
import re

_ADR_REF = re.compile(r"ADR\s*\d{4}")


def _find_adr_refs(node):
    """Every ADR-shaped reference reachable in a decoded JSON payload."""
    hits = []
    if isinstance(node, str):
        hits += _ADR_REF.findall(node)
    elif isinstance(node, dict):
        for k, v in node.items():
            hits += _find_adr_refs(k)
            hits += _find_adr_refs(v)
    elif isinstance(node, (list, tuple)):
        for v in node:
            hits += _find_adr_refs(v)
    return hits


def _find_harm_layer_refs(node):
    """Every patient-facing reference to the internal harm-layer term."""
    hits = []
    if isinstance(node, str):
        if "harm layer" in node:
            hits.append("harm layer")
    elif isinstance(node, dict):
        for k, v in node.items():
            hits += _find_harm_layer_refs(k)
            hits += _find_harm_layer_refs(v)
    elif isinstance(node, (list, tuple)):
        for v in node:
            hits += _find_harm_layer_refs(v)
    return hits


def _seed(path):
    with Store.open(path) as store:
        basal, cgm = [], []
        for d in range(1, 6):
            t0 = datetime(2026, 6, d, 0, 0, 0)
            for k in range(72):
                tt = t0 + timedelta(minutes=5 * k)
                basal.append({"seq_num": int(tt.strftime("%Y%m%d%H%M%S")), "time": tt.strftime("%Y-%m-%d %H:%M:%S"),
                              "delivery_type": "algorithmDelivery", "duration_mins": 5,
                              "basal_rate": 0.8, "profile_basal_rate": 0.6})
                cgm.append({"EventDateTime": tt.strftime("%Y-%m-%dT%H:%M:%S"),
                            "Readings (CGM / BGM)": 120, "Description": "EGV"})
        store.upsert_basal(basal)
        store.upsert_cgm(cgm)
        pad = [{"startTime": 0, "basalRate": 0, "isf": 0, "carbRatio": 0, "targetBg": 0}] * 15
        store.upsert_settings_snapshot("2026-06-05 09:00:00", parse_pump_settings(
            {"profiles": {"activeIdp": 4, "profile": [
                {"name": "4", "idp": 4, "insulinDuration": 300, "carbEntry": 1,
                 "maxBolus": 15000, "tDependentSegs": [
                     {"startTime": 0, "basalRate": 600, "isf": 30, "carbRatio": 6000,
                      "targetBg": 110}] + pad}]}, "cgmSettings": {}}))


def _guidance_client(test, case_name):
    """An isolated source-supported case for legacy lifecycle compatibility."""
    from ciq_autotune.api import create_app
    from scripts.qa_e2e_cases import QA_CASES, materialize_case
    database = tempfile.NamedTemporaryFile(suffix=".sqlite")
    test.addCleanup(database.close)
    with Store.open(database.name) as store:
        materialize_case(store, next(case for case in QA_CASES if case.name == case_name))
    app = create_app(db_path=database.name, token="", enable_fetch_loop=False)
    return TestClient(app)


def _candidate(client, parameter):
    source = client.get("/api/guidance").json()
    return next(row for row in source["candidates"] if row["subject"] == "setting:" + parameter)


def _done(client, subject):
    """Done on a Queue Setting card (#518), through the public route."""
    source = client.get("/api/guidance").json()
    return client.post("/api/plan/apply", json={
        "request_id": f"done-{time.time_ns()}", "input_revision": source["input_revision"],
        "subject": subject, "analysis_generation": source["analysis_generation"]})


def _seed_ready_cell(path):
    """Seed CGM that clears one cell (low__full__dow-6) into the ready queue: a strong,
    stable, confound-clean Sunday-low effect across 140 days — every Sunday low, hardly
    any other day low. Mirrors the ReadyQueueSignOffTest fixture, written through the
    store's CGM upsert so it drives the real API sweep."""
    from datetime import date

    with Store.open(path) as store:
        first_sunday = date(2026, 1, 4)  # a Sunday
        rows = []
        for offset in range(140):
            day = first_sunday + timedelta(days=offset)
            base = datetime.combine(day, datetime.min.time())
            low = day.weekday() == 6 or (day.weekday() == 3 and offset % 28 == 0)
            # 48 in-range readings 00:00–03:55 (makes the whole day eligible), plus two
            # sub-70 lows in the afternoon/evening on a low day.
            for k in range(48):
                tt = base + timedelta(minutes=5 * k)
                rows.append({"EventDateTime": tt.strftime("%Y-%m-%dT%H:%M:%S"),
                             "Readings (CGM / BGM)": 110, "Description": "EGV"})
            if low:
                for hour in (13, 19):
                    tt = base + timedelta(hours=hour)
                    rows.append({"EventDateTime": tt.strftime("%Y-%m-%dT%H:%M:%S"),
                                 "Readings (CGM / BGM)": 60, "Description": "EGV"})
        store.upsert_cgm(rows)


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class ApiTest(unittest.TestCase):
    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed(self.tmp.name)
        self.app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        self.client = TestClient(self.app)
        # Credential tests must not see this machine's real .env — force the
        # "no fallback available" placeholder state tconnectsync.secret would
        # have with no .env present.
        if _HAS_TCONNECTSYNC:
            self.env_patch = patch.multiple(
                "tconnectsync.secret",
                TCONNECT_EMAIL="email@email.com", TCONNECT_PASSWORD="password",
            )
            self.env_patch.start()
            self.addCleanup(self.env_patch.stop)

    def tearDown(self):
        self.tmp.close()

    def test_health(self):
        r = self.client.get("/api/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["schema_version"], SCHEMA_VERSION)

    def test_analyze_returns_versioned_result(self):
        for params in ({"window": 30}, {"window": 30, "pool": True}):
            r = self.client.get("/api/analyze", params=params)
            self.assertEqual(r.status_code, 200)
            body = r.json()
            self.assertEqual(body["schema_version"], SCHEMA_VERSION)
            self.assertEqual(len(body["basal"]), 48)
            self.assertEqual(body["basal_support_floor"], 8)
            self.assertIn("isf", body)
            self.assertIn("behavioral", body)

    def test_analyze_is_cached_two_identical_gets_are_equal(self):
        # #267: two identical GETs return the same payload — the second answers from
        # the in-process cache, correctness unchanged.
        a = self.client.get("/api/analyze", params={"window": 30})
        b = self.client.get("/api/analyze", params={"window": 30})
        self.assertEqual(a.status_code, 200)
        self.assertEqual(a.json(), b.json())
        self.assertEqual(b.json()["basal_support_floor"], 8)

    def test_pattern_sweep_serves_payload_with_exact_footnote(self):
        # #378: the read endpoint answers with the versioned sweep payload; its only
        # always-on user-facing string is the empty-state footnote.
        r = self.client.get("/api/pattern-sweep")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["grammar_version"], 1)
        self.assertIn("cells", body)
        self.assertEqual(
            body["footnote"],
            "Pattern sweep: nothing recurring in your data has cleared the evidence "
            "bar this window.",
        )
        # No internal ADR reference leaks into the payload (#353).
        self.assertEqual(_find_adr_refs(body), [])

    def test_pattern_sweep_is_cached(self):
        a = self.client.get("/api/pattern-sweep")
        b = self.client.get("/api/pattern-sweep")
        self.assertEqual(a.json(), b.json())

    def test_pattern_sweep_sign_off_rejects_a_cell_that_is_not_ready(self):
        # The seed data has no cleared pattern, so no cell is awaiting review. Approving
        # or dismissing a cell that is not currently ready must be refused — a tracked,
        # killed, or unknown cell can't be pre-approved and later bypass the queue when
        # its evidence changes. Nothing is persisted.
        from ciq_autotune.result_cache import ResultCache
        with patch.object(ResultCache, "bump", autospec=True) as bump:
            approve = self.client.post("/api/pattern-sweep/approve",
                                       json={"cell_id": "low__full__dow-6"})
            dismiss = self.client.post("/api/pattern-sweep/dismiss",
                                       json={"cell_id": "high__suspend__follow"})
        self.assertEqual(approve.status_code, 409)
        self.assertEqual(dismiss.status_code, 409)
        self.assertEqual(bump.call_count, 0)
        with Store.open(self.tmp.name) as store:
            self.assertEqual(store.pattern_reviews(), {})

    def test_pattern_sweep_approve_requires_cell_id(self):
        r = self.client.post("/api/pattern-sweep/approve", json={})
        self.assertEqual(r.status_code, 400)

    def test_isf_is_a_single_fasting_estimate(self):
        r = self.client.get("/api/analyze", params={"window": 30})
        isf = r.json()["isf"]
        self.assertEqual(len(isf), 1)
        self.assertEqual(isf[0]["start_min"], 0)

    def test_root_serves_the_shell(self):
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers["content-type"], "text/html; charset=utf-8")

    def test_every_built_index_asset_is_served(self):
        # The bundle carries every former per-surface module; a referenced asset
        # must therefore load with its browser-recognized type.
        index = (Path(__file__).resolve().parent.parent
                 / "frontend" / "dist" / "index.html").read_text()
        assets = sorted(set(re.findall(r'''["'](/assets/[^"']+)["']''', index)))
        self.assertTrue(assets, "built index must name fingerprinted assets")
        content_types = {
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
        }
        for asset in assets:
            r = self.client.get(asset)
            self.assertEqual(r.status_code, 200, f"{asset} has no serving route")
            suffix = Path(asset).suffix
            self.assertIn(suffix, content_types, asset)
            self.assertTrue(r.headers["content-type"].startswith(content_types[suffix]), asset)
            if suffix == ".svg":
                # A browser drops a malformed icon silently (a stray "--" inside a
                # comment is enough), leaving the blank page icon.
                root = ElementTree.fromstring(r.text)
                self.assertTrue(root.tag.endswith("svg"))

    def test_model_view_returns_per_day_payload(self):
        # #152 / ADR 0019: the per-day introspection feed — a day's episodes with
        # every anchor's every verdict + state, plus the chart window.
        r = self.client.get("/api/model-view", params={"date": "2026-06-03"})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["date"], "2026-06-03")
        self.assertIn("isf", body)
        self.assertNotIn("programmed_ic", body)
        self.assertIn("cgm", body["window"])
        self.assertIsInstance(body["episodes"], list)
        self.assertIsInstance(body["findings"], list)

    def test_model_view_marks_the_low_correction_stacking_reached(self):
        # The Lows after correcting highs Pattern counts the low the stacked
        # doses reached as Correction stacking's, so the day serves it as a
        # finding beside the stacking dose, and the first correction as none.
        client = _guidance_client(self, "behavioral-correction-stacking")
        body = client.get("/api/model-view", params={"date": "2024-05-24"}).json()
        self.assertEqual(body["findings"], [
            {"t": "2024-05-24 14:40:00", "kind": "correction", "bg": None,
             "levers": [{"lever": "correction_stacking", "title": "Correction stacking"}]},
            {"t": "2024-05-24 16:05:00", "kind": "low", "bg": 60.0,
             "levers": [{"lever": "correction_stacking", "title": "Correction stacking"}]},
        ])

    def test_model_view_rejects_bad_date(self):
        r = self.client.get("/api/model-view", params={"date": "06/03/2026"})
        self.assertEqual(r.status_code, 400)

    def test_catalog_is_generated_from_the_taxonomies(self):
        # #157: /api/catalog is the type-level Guide payload — the 8-lever catalog
        # (generated from levers._META, incl. the new `meaning`), the closed
        # 7-member SilenceReason taxonomy (ADR 0009), the 3 evidence tiers, the
        # pipeline, and one worked example. Static + DB-free; no PHI.
        from ciq_autotune.analyzers.scenario.levers import Lever
        from ciq_autotune.analyzers.classifiers import EvidenceTier, SilenceReason
        r = self.client.get("/api/catalog")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        for key in ("engine", "pipeline", "exposures", "levers",
                    "silence_reasons", "tiers", "worked"):
            self.assertIn(key, body)
        # the catalog is generated from the closed taxonomies, in enum order.
        self.assertEqual([l["value"] for l in body["levers"]], [l.value for l in Lever])
        self.assertEqual([s["value"] for s in body["silence_reasons"]],
                         [s.value for s in SilenceReason])
        self.assertEqual([t["value"] for t in body["tiers"]],
                         [t.value for t in EvidenceTier])
        # every lever carries the new authored `meaning`, distinct from its action.
        for l in body["levers"]:
            self.assertTrue(l["meaning"])
            self.assertNotEqual(l["meaning"], l["recommendation"])
        # each silence reason's tier is a real EvidenceTier value.
        tiers = {t.value for t in EvidenceTier}
        for s in body["silence_reasons"]:
            self.assertIn(s["tier"], tiers)
        # ADR 461: nine reasons, "Stayed in range" among them at tier Observed.
        self.assertEqual(len(body["silence_reasons"]), 9)
        self.assertIn({"value": "stayed_in_range", "label": "Stayed in range", "tier": "observed"},
                      [{k: s[k] for k in ("value", "label", "tier")} for s in body["silence_reasons"]])

    def test_kb_article_serves_raw_markdown(self):
        # #269: /api/kb/<slug> serves the authored how-to's RAW markdown (the API
        # stays dumb; the frontend renders it). The 4 flagship how-tos ship as
        # docs/kb/*.md.
        r = self.client.get("/api/kb/start-here")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("text/markdown"))
        body = r.text
        # raw markdown, not rendered HTML — a heading and the advisory framing.
        self.assertIn("## How to read any verdict here", body)
        self.assertIn("advisory", body)
        self.assertNotIn("<h2>", body)
        for slug in ("reading-diagnose", "reading-day", "the-plan-tab"):
            self.assertEqual(self.client.get(f"/api/kb/{slug}").status_code, 200)

    def test_kb_articles_name_no_verify(self):
        # #447: #416 retired Verify, so no served article names it, and the Guide
        # sends Cause levers to a Focus that Changes follows.
        for slug in ("start-here", "reading-diagnose", "reading-day", "the-plan-tab"):
            self.assertNotIn("Verify", self.client.get(f"/api/kb/{slug}").text, slug)
        article = " ".join(self.client.get("/api/kb/reading-diagnose").text.split())
        self.assertIn("flow to a Focus, followed in Changes, because no pump setting fixes them.",
                      article)

    def test_kb_article_unknown_slug_is_404(self):
        self.assertEqual(self.client.get("/api/kb/no-such-article").status_code, 404)

    def test_kb_article_rejects_non_slug_paths(self):
        # the slug charset ([a-z0-9-]) can't escape docs/kb: dotted / cased /
        # traversal attempts never resolve to a file outside the directory.
        for bad in ("Start-Here", "start_here", "..%2F..%2Fsecret", "start.here"):
            self.assertEqual(self.client.get(f"/api/kb/{bad}").status_code, 404,
                             f"{bad!r} should 404")

    def test_pump_settings_includes_fetched_at(self):
        # #99: Changes shows when the detected pump settings were captured
        # ("Captured <fetch>") — the endpoint must surface the snapshot's
        # capture time. "On pump since" names the server's confirming read (#431).
        r = self.client.get("/api/pump-settings")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["configured"])
        self.assertIn("fetched_at", body)
        self.assertTrue(body["fetched_at"])

    def test_status_with_no_fetch_yet(self):
        r = self.client.get("/api/status")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIsNone(body["last_attempt_at"])
        self.assertIsNone(body["last_success_at"])

    def test_status_includes_cgm_day_bounds(self):
        # _seed inserts CGM for 2026-06-01 through 2026-06-05
        r = self.client.get("/api/status")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["earliest_data_day"], "2026-06-01")
        self.assertEqual(body["latest_data_day"], "2026-06-05")

    def test_status_counts_days_with_glucose(self):
        # #425: _seed records glucose on 2026-06-01 through 06-05. 06-06 and
        # 06-08 stay empty (gap days), 06-07 holds only a sensor HIGH — stored
        # with no glucose value — and 06-09 holds glucose. Neither the gaps nor
        # the glucose-less day is counted.
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm([
                {"EventDateTime": "2026-06-07T10:00:00", "Readings (CGM / BGM)": None, "Description": "EGV"},
                {"EventDateTime": "2026-06-09T10:00:00", "Readings (CGM / BGM)": 130, "Description": "EGV"},
            ])
        r = self.client.get("/api/status")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["data_day_count"], 6)
        self.assertEqual(body["earliest_data_day"], "2026-06-01")
        self.assertEqual(body["latest_data_day"], "2026-06-09")

    def test_status_includes_input_revision(self):
        # #414 1.3: the status endpoint's revision must be the live store's own,
        # not a stale or hardcoded value — cross-check it directly against Store.
        with Store.open(self.tmp.name) as store:
            expected = store.input_data_revision()

        r = self.client.get("/api/status")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["input_revision"], expected)

    def test_credentials_unconfigured_by_default(self):
        r = self.client.get("/api/credentials")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertFalse(body["configured"])
        self.assertIsNone(body["email"])

    def test_set_then_get_credentials_round_trips_email_not_password(self):
        r = self.client.post("/api/credentials", json={
            "email": "me@example.com", "password": "hunter2", "region": "US",
        })
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["configured"])

        r = self.client.get("/api/credentials")
        body = r.json()
        self.assertTrue(body["configured"])
        self.assertEqual(body["email"], "me@example.com")
        self.assertEqual(body["region"], "US")
        self.assertNotIn("password", body)

    def test_credentials_undecryptable_row_reads_as_unconfigured(self):
        # A key file that no longer opens the stored row answers like every
        # other unavailable case, rather than a bare 500 on the shell's first
        # request of every page load (#351).
        from cryptography.fernet import Fernet
        from ciq_autotune import credentials
        from ciq_autotune.api import create_app

        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "undecryptable.db")
            key_path = os.path.join(tmp, "secret.key")
            _seed(db_path)
            with Store.open(db_path) as store:
                credentials.save_credentials(store, "me@example.com", "hunter2", "US",
                                             key_path=key_path)
            with open(key_path, "wb") as key_file:
                key_file.write(Fernet.generate_key())

            app = create_app(db_path=db_path, token=None, key_path=key_path,
                             enable_fetch_loop=False)
            client = TestClient(app, raise_server_exceptions=False)
            r = client.get("/api/credentials")

        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertFalse(body["configured"])
        self.assertIsNone(body["email"])

    def test_pump_settings_returns_active_profile(self):
        r = self.client.get("/api/pump-settings")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["configured"])
        self.assertEqual(body["active_idp"], 4)
        profile = body["profile"]
        self.assertEqual(profile["idp"], 4)
        self.assertEqual(profile["dia_hours"], 5.0)
        self.assertEqual(profile["max_bolus"], 15.0)
        self.assertEqual(len(profile["segments"]), 1)
        self.assertEqual(profile["segments"][0], {
            "start_min": 0, "basal_rate": 0.6, "isf": 30, "carb_ratio": 6.0, "target_bg": 110,
        })
        self.assertEqual(body["other_profile_count"], 0)

    def test_pump_settings_counts_other_profiles(self):
        from ciq_autotune.settings import parse_pump_settings
        pad = [{"startTime": 0, "basalRate": 0, "isf": 0, "carbRatio": 0, "targetBg": 0}] * 15
        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot("2026-06-06 09:00:00", parse_pump_settings({
                "profiles": {"activeIdp": 4, "profile": [
                    {"name": "4", "idp": 4, "insulinDuration": 300, "carbEntry": 1,
                     "maxBolus": 15000, "tDependentSegs": [
                         {"startTime": 0, "basalRate": 600, "isf": 30, "carbRatio": 6000,
                          "targetBg": 110}] + pad},
                    {"name": "Exercise", "idp": 5, "insulinDuration": 300, "carbEntry": 1,
                     "maxBolus": 15000, "tDependentSegs": [
                         {"startTime": 0, "basalRate": 400, "isf": 40, "carbRatio": 8000,
                          "targetBg": 130}] + pad},
                ]}, "cgmSettings": {}}))
        r = self.client.get("/api/pump-settings")
        self.assertEqual(r.json()["other_profile_count"], 1)

    def test_pump_settings_answers_the_latest_capture_among_many(self):
        # The endpoint reads only the newest capture, not every snapshot: with a
        # long history of older captures on another active profile, the answer is
        # the newest capture's, the one the full snapshot list ends on.
        from ciq_autotune.settings import parse_pump_settings
        pad = [{"startTime": 0, "basalRate": 0, "isf": 0, "carbRatio": 0, "targetBg": 0}] * 15

        def raw(name, idp, active, basal):
            return parse_pump_settings({
                "profiles": {"activeIdp": active, "profile": [
                    {"name": name, "idp": idp, "insulinDuration": 300, "carbEntry": 1,
                     "maxBolus": 15000, "tDependentSegs": [
                         {"startTime": 0, "basalRate": basal, "isf": 30, "carbRatio": 6000,
                          "targetBg": 110}] + pad},
                    {"name": "Other", "idp": 9, "insulinDuration": 300, "carbEntry": 1,
                     "maxBolus": 15000, "tDependentSegs": [
                         {"startTime": 0, "basalRate": 100, "isf": 40, "carbRatio": 8000,
                          "targetBg": 130}] + pad},
                ]}, "cgmSettings": {}})

        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot("2026-09-01 09:00:00", raw("Newest", 4, 4, 900))
            for hour in range(40):
                store.upsert_settings_snapshot(
                    f"2026-08-{1 + hour // 24:02d} {hour % 24:02d}:00:00", raw("Older", 5, 9, 100 + hour))
            expected = store.settings_snapshots()[-1]
        body = self.client.get("/api/pump-settings").json()
        self.assertEqual(body["fetched_at"], expected.captured_at.isoformat())
        self.assertEqual(body["active_idp"], 4)
        self.assertEqual(body["profile"]["name"], "Newest")
        self.assertEqual(body["profile"]["segments"][0]["basal_rate"], 0.9)
        self.assertEqual(body["other_profile_count"], 1)

    def test_pump_settings_unconfigured_with_no_snapshot(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as empty_db:
            from ciq_autotune.api import create_app
            client = TestClient(create_app(db_path=empty_db.name, token=None,
                                           enable_fetch_loop=False))
            r = client.get("/api/pump-settings")
            self.assertEqual(r.status_code, 200)
            self.assertFalse(r.json()["configured"])

    def test_report_endpoint_returns_rendered_text(self):
        r = self.client.get("/api/report", params={"window": 30})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("Control-IQ Autotune", body["text"])
        self.assertIn("BASAL", body["text"])

    def test_timeline_endpoint_returns_events_in_window(self):
        r = self.client.get("/api/timeline", params={
            "start": "2026-06-03T00:00:00", "end": "2026-06-04T00:00:00",
        })
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["start"], "2026-06-03 00:00:00")
        self.assertEqual(body["end"], "2026-06-04 00:00:00")
        self.assertEqual(len(body["cgm"]), 72)
        self.assertEqual(len(body["basal"]), 72)

    def test_timeline_endpoint_requires_start_and_end(self):
        r = self.client.get("/api/timeline")
        self.assertEqual(r.status_code, 422)

    def test_scenarios_endpoint_returns_ranked_payload(self):
        r = self.client.get("/api/scenarios", params={"window": 30})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        # The scenario-payload contract (#70 §5): its own schema version and the
        # ranked-pattern shape. The seed's flat 120 mg/dL never leaves range, so no
        # pattern surfaces — but the envelope must still be well-formed.
        self.assertIn("schema_version", body)
        self.assertIn("patterns", body)
        self.assertIn("low_confidence", body)
        self.assertIn("episodes", body)
        self.assertEqual(body["patterns"], [])

    def test_exposures_population_read_is_gone(self):
        # #500: the browsable exposure population was the Diagnose evidence-drill's
        # feed and went with it. Nothing in the app asks for it any more.
        self.assertEqual(self.client.get("/exposures").status_code, 404)
        # ...while the reads that survived still answer, so this fails loudly if the
        # app stopped serving rather than if one route was correctly dropped.
        self.assertEqual(self.client.get("/api/scenarios", params={"window": 30}).status_code, 200)

    def test_the_plan_draft_routes_are_gone(self):
        # #518: the app stages no Plan; a Done records one from the served action.
        self.assertEqual(self.client.get("/api/plan").status_code, 404)
        self.assertEqual(self.client.put("/api/plan", json={"items": []}).status_code, 404)
        self.assertEqual(self.client.get("/api/plan/history").status_code, 200)

    def test_a_recorded_plan_holds_one_family_across_rows(self):
        for items in (
            [{"type": "basal", "key": 0}, {"type": "basal", "key": 1}],
            [{"type": "isf", "key": 0}, {"type": "isf", "key": 540}],
            [{"type": "ic", "key": 0}, {"type": "ic", "key": 540}],
            [{"type": "target", "key": 0}, {"type": "target", "key": 540}],
            [],
        ):
            with self.subTest(items=items), Store.open(self.tmp.name) as store:
                store.save_plan_draft(items, "2026-01-01 00:00:00")

    def test_a_recorded_plan_refuses_mixed_non_tuning_and_incomplete_block_items(self):
        prov = {"block_start_min": 720, "block_end_min": 900, "block_member_start_mins": [720, 780]}
        for items, message in (
            ([{"type": "basal", "key": 0}, {"type": "isf", "key": 540}], "mixes tuning families"),
            ([{"type": "behavior", "key": "late-meal"}], "unsupported tuning family"),
            ([{"type": "ic", "start_min": 720, "value": 9.5, "ic_block_provenance": prov}], "block"),
        ):
            with self.subTest(items=items), Store.open(self.tmp.name) as store:
                with self.assertRaisesRegex(ValueError, message):
                    store.save_plan_draft(items, "2026-01-01 00:00:00")
                self.assertIsNone(store.get_plan_draft())

    def test_done_without_a_durable_request_is_refused(self):
        self.assertEqual(self.client.post("/api/plan/apply").status_code, 422)
        self.assertEqual(self.client.post("/api/plan/apply", json={"subject": "setting:basal_rate"}).status_code, 422)

    def test_two_dones_in_the_same_second_return_409_not_500(self):
        self.client = _guidance_client(self, "basal-and-carb-ratio-lower")
        with patch("ciq_autotune.api.wall_clock_now", return_value=datetime(2026, 1, 1)):
            self.assertEqual(_done(self.client, "setting:basal_rate").status_code, 200)
            self.assertEqual(_done(self.client, "setting:carb_ratio").status_code, 409)

    def test_done_records_the_served_action_into_history(self):
        self.client = _guidance_client(self, "basal-raise")
        action = _candidate(self.client, "basal_rate")["action"]
        r = _done(self.client, "setting:basal_rate")
        self.assertEqual(r.status_code, 200)
        items = [{"type": "basal", "start_min": a["start_min"], "value": a["recommended"]} for a in action]
        self.assertEqual(r.json()["items"], items)
        self.assertIsNotNone(r.json()["applied_at"])
        history = self.client.get("/api/plan/history").json()["history"]
        self.assertEqual([row["items"] for row in history], [items])

    def test_a_carb_ratio_done_records_its_block_provenance(self):
        self.client = _guidance_client(self, "ic-raise")
        action = _candidate(self.client, "carb_ratio")["action"][0]
        provenance = {"block_start_min": action["start_min"], "block_end_min": action["end_min"],
                      "block_member_start_mins": action["member_start_mins"]}
        items = [{"type": "ic", "start_min": start, "value": action["recommended"],
                  "ic_block_provenance": provenance} for start in action["member_start_mins"]]
        r = _done(self.client, "setting:carb_ratio")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["items"], items)
        self.assertEqual(self.client.get("/api/plan/history").json()["history"][0]["items"], items)


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class DurableArtifactApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed(self.tmp.name)

    def tearDown(self):
        for suffix in ("", "-wal", "-shm"):
            try:
                os.unlink(sidecar_path(self.tmp.name) + suffix)
            except FileNotFoundError:
                pass
        self.tmp.close()

    def test_same_fixed_key_serves_labeled_prior_only_while_recomputing(self):
        """A public fixed route keeps its exact predecessor visible during a rebuild."""
        from ciq_autotune.api import create_app
        import ciq_autotune.api as api_mod
        app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        client = TestClient(app)
        first = client.get("/api/explore/time-of-day")
        self.assertEqual(first.status_code, 200)
        with sqlite3.connect(sidecar_path(self.tmp.name)) as sidecar:
            prior_revision, prior_covers_to = sidecar.execute(
                "SELECT revision,covers_to FROM artifacts").fetchone()
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm([{"EventDateTime": "2026-07-16 00:00:00", "Readings (CGM / BGM)": 110}])
        app.state.result_cache.bump()
        entered, release = threading.Event(), threading.Event()
        real = api_mod.build_time_of_day_windows
        def blocked(store, **kwargs):
            entered.set()
            self.assertTrue(release.wait(3))
            return real(store, **kwargs)
        with patch.object(api_mod, "build_time_of_day_windows", side_effect=blocked):
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(client.get, "/api/explore/time-of-day")
                self.assertTrue(entered.wait(3))
                stale = client.get("/api/explore/time-of-day")
                self.assertEqual(stale.status_code, 200)
                self.assertEqual(stale.json()["input_data_age"], {
                    "revision": prior_revision,
                    "covers_to": prior_covers_to,
                    "newest_covers_to": "2026-07-16 00:00:00",
                })
                release.set()
                self.assertEqual(future.result(timeout=3).status_code, 200)
        fresh = client.get("/api/explore/time-of-day")
        self.assertNotIn("input_data_age", fresh.json())

    def test_fetch_after_revision_check_recomputes_before_unlabeled_publish(self):
        """The cache publication lock closes the final revision-check race."""
        from ciq_autotune.api import create_app
        import ciq_autotune.api as api_mod
        app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        client = TestClient(app)
        real_get = app.state.result_cache.get_or_compute
        real_build = api_mod.build_time_of_day_windows
        builds = []
        crossed = False

        def counting_build(store, **kwargs):
            builds.append(store.input_data_revision())
            return real_build(store, **kwargs)

        def crossed_get(key, build, **kwargs):
            def cross_after_revision_check():
                nonlocal crossed
                result = build()
                if not crossed:
                    crossed = True
                    with Store.open(self.tmp.name) as writer:
                        writer.upsert_cgm([{
                            "EventDateTime": "2026-07-16 00:00:00",
                            "Readings (CGM / BGM)": 110,
                        }])
                    app.state.result_cache.bump()
                return result
            return real_get(key, cross_after_revision_check, **kwargs)

        with patch.object(api_mod, "build_time_of_day_windows", side_effect=counting_build), \
             patch.object(app.state.result_cache, "get_or_compute", side_effect=crossed_get):
            response = client.get("/api/explore/time-of-day")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("input_data_age", response.json())
        self.assertEqual(len(builds), 2)
        self.assertEqual(builds[1], builds[0] + 1)

    def test_findings_maps_exhausted_artifact_retries_to_generation_409(self):
        from ciq_autotune.api import create_app
        import ciq_autotune.derived_artifacts as artifacts
        app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        client = TestClient(app, raise_server_exceptions=False)

        with patch.object(artifacts, "_load_or_compute_once",
                          return_value=artifacts._REVISION_CHANGED):
            response = client.get("/api/diagnose/findings")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"],
                         "analysis_generation_mismatch")

    def test_fixed_registry_is_acquired_before_entering_result_cache(self):
        """A reader arriving before the cache flight exists still stale-serves."""
        from ciq_autotune.api import create_app
        app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        client = TestClient(app)
        self.assertEqual(client.get("/api/explore/time-of-day").status_code, 200)
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm([{"EventDateTime": "2026-07-16 00:00:00",
                               "Readings (CGM / BGM)": 110}])
        app.state.result_cache.bump()
        entered, release = threading.Event(), threading.Event()
        real_get = app.state.result_cache.get_or_compute
        calls = 0
        calls_lock = threading.Lock()

        def paused_get(key, build, **kwargs):
            nonlocal calls
            with calls_lock:
                calls += 1
                call = calls
            if call != 1:
                raise AssertionError("a same-key observer entered ResultCache")
            entered.set()
            self.assertTrue(release.wait(3))
            return real_get(key, build, **kwargs)

        with patch.object(app.state.result_cache, "get_or_compute", side_effect=paused_get):
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(client.get, "/api/explore/time-of-day")
                self.assertTrue(entered.wait(3))
                try:
                    stale = client.get("/api/explore/time-of-day")
                    self.assertEqual(stale.status_code, 200)
                    self.assertIn("input_data_age", stale.json())
                    self.assertEqual(calls, 1)
                finally:
                    release.set()
                self.assertEqual(future.result(timeout=3).status_code, 200)

    def test_stale_age_omits_unknown_newest_horizon(self):
        """The public age envelope has no nullable optional field."""
        from ciq_autotune.api import create_app
        import ciq_autotune.api as api_mod
        app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        client = TestClient(app)
        self.assertEqual(client.get("/api/explore/time-of-day").status_code, 200)
        with sqlite3.connect(sidecar_path(self.tmp.name)) as sidecar:
            prior_revision, prior_covers_to = sidecar.execute(
                "SELECT revision,covers_to FROM artifacts").fetchone()
        with sqlite3.connect(self.tmp.name) as primary:
            primary.execute("DELETE FROM cgm_readings")
            primary.execute("DELETE FROM basal_events")
            # A write to recorded data advances both revisions (ADR 538).
            primary.execute(
                "UPDATE input_data_revision SET revision = revision + 1 WHERE id = 1")
            primary.execute(
                "UPDATE recorded_data_revision SET revision = revision + 1 WHERE id = 1")
        app.state.result_cache.bump()
        entered, release = threading.Event(), threading.Event()
        real = api_mod.build_time_of_day_windows

        def blocked(store, **kwargs):
            entered.set()
            self.assertTrue(release.wait(3))
            return real(store, **kwargs)

        with patch.object(api_mod, "build_time_of_day_windows", side_effect=blocked):
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(client.get, "/api/explore/time-of-day")
                self.assertTrue(entered.wait(3))
                try:
                    stale = client.get("/api/explore/time-of-day")
                    self.assertEqual(stale.status_code, 200)
                    self.assertEqual(stale.json()["input_data_age"], {
                        "revision": prior_revision,
                        "covers_to": prior_covers_to,
                    })
                finally:
                    release.set()
                self.assertEqual(future.result(timeout=3).status_code, 200)

    def test_fixed_registry_does_not_stale_serve_a_hot_cache_hit(self):
        """A registered caller is not a recompute until its builder starts."""
        from ciq_autotune.api import create_app
        app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        client = TestClient(app)
        self.assertEqual(client.get("/api/explore/time-of-day").status_code, 200)
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm([{"EventDateTime": "2026-07-16 00:00:00",
                               "Readings (CGM / BGM)": 110}])
        app.state.result_cache.bump()
        current = client.get("/api/explore/time-of-day")
        self.assertEqual(current.status_code, 200)
        self.assertNotIn("input_data_age", current.json())
        entered, release = threading.Event(), threading.Event()
        real_get = app.state.result_cache.get_or_compute
        calls = 0
        calls_lock = threading.Lock()

        def paused_get(key, build, **kwargs):
            nonlocal calls
            with calls_lock:
                calls += 1
                call = calls
            if call == 1:
                entered.set()
                self.assertTrue(release.wait(3))
            return real_get(key, build, **kwargs)

        with patch.object(app.state.result_cache, "get_or_compute", side_effect=paused_get):
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(client.get, "/api/explore/time-of-day")
                self.assertTrue(entered.wait(3))
                observed = client.get("/api/explore/time-of-day")
                self.assertEqual(observed.status_code, 200)
                self.assertEqual(observed.json(), current.json())
                self.assertNotIn("input_data_age", observed.json())
                release.set()
                self.assertEqual(future.result(timeout=3).json(), current.json())


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class OverviewInstantTest(unittest.TestCase):
    """The Overview answers at once at every window, a write and a restart included (#566)."""

    _DAYS = (14, 30, 90)
    _OVERVIEW = tuple(
        [("/api/outcomes", {"window": days}) for days in _DAYS]
        + [("/api/explore/time-of-day", {"days": days}) for days in _DAYS]
        + [("/api/analyze", {"window": days}) for days in _DAYS]
        + [("/api/explore/meal-size", {"days": days}) for days in _DAYS])

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed(self.tmp.name)

    def tearDown(self):
        for suffix in ("", "-wal", "-shm"):
            try:
                os.unlink(sidecar_path(self.tmp.name) + suffix)
            except FileNotFoundError:
                pass
        self.tmp.close()

    def _app(self):
        from ciq_autotune.api import create_app
        return create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)

    def test_after_a_write_every_window_answers_at_once_from_its_predecessor(self):
        """Each window's profile and Meal size is served, labeled, while each is computed once."""
        import ciq_autotune.api as api_mod
        app = self._app()
        # No warm roster: only the reads ask for their results to be computed again.
        app.state.recompute_roster = lambda: ()
        real = api_mod.build_time_of_day_windows
        builds = []
        entered, release = threading.Event(), threading.Event()

        def blocked(store, **kwargs):
            builds.append(1)
            if len(builds) > 1:
                entered.set()
                self.assertTrue(release.wait(5))
            return real(store, **kwargs)

        paths = ("/api/explore/time-of-day", "/api/explore/meal-size")

        def read(client, path, days):
            return client.get(path, params={"days": days})

        with patch.object(api_mod, "build_time_of_day_windows", side_effect=blocked):
            with TestClient(app) as client:
                before = {(path, days): read(client, path, days).json()
                          for path in paths for days in self._DAYS}
                for body in before.values():
                    self.assertNotIn("input_data_age", body)
                self.assertEqual(client.post("/api/carbs", json={
                    "t": "2026-06-05 06:00:00", "grams": 20, "certainty": "exact"}).status_code, 200)
                served = {}
                with ThreadPoolExecutor(max_workers=3) as pool:
                    try:
                        for path in paths:
                            futures = {days: pool.submit(read, client, path, days)
                                       for days in self._DAYS}
                            served.update({(path, days): future.result(timeout=3)
                                           for days, future in futures.items()})
                            # The worker is computing the profiles, so Meal size waits behind them.
                            self.assertTrue(entered.wait(3), "the warm worker computes the new profile")
                    finally:
                        release.set()
                for key, response in served.items():
                    self.assertEqual(response.status_code, 200)
                    body = response.json()
                    self.assertIn("input_data_age", body, key)
                    self.assertEqual({k: v for k, v in body.items() if k != "input_data_age"},
                                     before[key])
                deadline = time.monotonic() + 5
                while any("input_data_age" in read(client, path, 14).json() for path in paths):
                    self.assertLess(time.monotonic(), deadline, "the new results never landed")
                    time.sleep(0.02)
                for path in paths:
                    for days in self._DAYS:
                        self.assertNotIn("input_data_age", read(client, path, days).json())
        self.assertEqual(len(builds), 2, "one profile compute before the write, one after it")

    def test_the_worker_computes_the_lightest_waiting_result_first(self):
        """A Meal size a read waits on is computed before an analysis asked for earlier."""
        import ciq_autotune.api as api_mod
        app = self._app()
        app.state.recompute_roster = lambda: ()
        order = []
        entered, release = threading.Event(), threading.Event()
        real_profile = api_mod.build_time_of_day_windows
        real_analyze = api_mod.analyze
        real_meal = api_mod.build_meal_size_windows

        profiles = []

        def profile(store, **kwargs):
            order.append("profile")
            profiles.append(1)
            if len(profiles) > 1:
                entered.set()
                self.assertTrue(release.wait(5))
            return real_profile(store, **kwargs)

        def analysis(*args, **kwargs):
            order.append("analyze")
            return real_analyze(*args, **kwargs)

        def meal(store, **kwargs):
            order.append("meal-size")
            return real_meal(store, **kwargs)

        with patch.object(api_mod, "build_time_of_day_windows", side_effect=profile), \
             patch.object(api_mod, "analyze", side_effect=analysis), \
             patch.object(api_mod, "build_meal_size_windows", side_effect=meal):
            with TestClient(app) as client:
                reads = (("/api/explore/time-of-day", {"days": 14}),
                         ("/api/analyze", {"window": 14}),
                         ("/api/explore/meal-size", {"days": 14}))
                for path, params in reads:
                    self.assertEqual(client.get(path, params=params).status_code, 200)
                order.clear()
                self.assertEqual(client.post("/api/carbs", json={
                    "t": "2026-06-05 06:00:00", "grams": 20, "certainty": "exact"}).status_code, 200)
                try:
                    # The worker takes the profile, and holds it while the others wait.
                    self.assertIn("input_data_age", client.get(reads[0][0], params=reads[0][1]).json())
                    self.assertTrue(entered.wait(3))
                    for path, params in reads[1:]:
                        self.assertIn("input_data_age", client.get(path, params=params).json(), path)
                finally:
                    release.set()
                deadline = time.monotonic() + 10
                while any("input_data_age" in client.get(path, params=params).json()
                          for path, params in reads):
                    self.assertLess(time.monotonic(), deadline, "the new results never landed")
                    time.sleep(0.05)
        self.assertEqual(order, ["profile", "meal-size", "analyze"])

    def test_a_restart_answers_every_window_without_computing(self):
        """Outcomes, profiles, analyses and Meal size at every window survive a restart."""
        first = TestClient(self._app())
        served = {}
        for path, params in self._OVERVIEW:
            response = first.get(path, params=params)
            self.assertEqual(response.status_code, 200, path)
            served[(path, tuple(params.items()))] = response.json()
        import ciq_autotune.api as api_mod
        import ciq_autotune.outcomes as outcomes_mod
        builds = []
        def counting(real):
            return lambda *args, **kwargs: builds.append(real) or real(*args, **kwargs)
        with patch.object(api_mod, "analyze", counting(api_mod.analyze)), \
             patch.object(outcomes_mod, "summarize_outcomes", counting(outcomes_mod.summarize_outcomes)), \
             patch.object(api_mod, "build_time_of_day_windows",
                          counting(api_mod.build_time_of_day_windows)), \
             patch.object(api_mod, "build_meal_size_windows", counting(api_mod.build_meal_size_windows)):
            restarted = TestClient(self._app())
            for path, params in self._OVERVIEW:
                response = restarted.get(path, params=params)
                self.assertEqual(response.status_code, 200, path)
                self.assertEqual(response.json(), served[(path, tuple(params.items()))], path)
        self.assertEqual(builds, [])

    def test_the_warm_pass_starts_with_the_overviews_lighter_reads(self):
        labels = [label for label, _ in self._app().state.recompute_roster()]
        self.assertEqual(labels[:5], ["explore-time-of-day", "meal-size",
                                      "outcomes-14", "outcomes-30", "outcomes-90"])
        for days in self._DAYS:
            self.assertIn("analyze" if days == 30 else f"analyze-{days}", labels)


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class CarbCrudTest(unittest.TestCase):
    """#126: plain CRUD onto the #125 carb_entries table."""

    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed(self.tmp.name)
        self.client = TestClient(create_app(db_path=self.tmp.name, token=None,
                                            enable_fetch_loop=False))

    def tearDown(self):
        self.tmp.close()

    def test_list_starts_empty(self):
        r = self.client.get("/api/carbs")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"carb_entries": []})

    def test_create_returns_id_bearing_entry(self):
        r = self.client.post("/api/carbs", json={
            "t": "2026-06-03 10:05:00", "grams": 8, "certainty": "exact",
            "source": "manual", "note": "candy"})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIsInstance(body["id"], int)
        self.assertEqual(body["grams"], 8)
        self.assertEqual(body["certainty"], "exact")
        self.assertEqual(body["source"], "manual")
        # It now lists.
        listed = self.client.get("/api/carbs").json()["carb_entries"]
        self.assertEqual([e["id"] for e in listed], [body["id"]])

    def test_create_unknown_allows_null_grams(self):
        r = self.client.post("/api/carbs", json={
            "t": "2026-06-03 22:10:00", "grams": None, "certainty": "unknown"})
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.json()["grams"])

    def test_create_rejects_grams_null_when_not_unknown(self):
        # The CarbEntry invariant surfaces as a 400, not a 500.
        r = self.client.post("/api/carbs", json={
            "t": "2026-06-03 10:00:00", "grams": None, "certainty": "exact"})
        self.assertEqual(r.status_code, 400)

    def test_create_rejects_bad_certainty(self):
        r = self.client.post("/api/carbs", json={
            "t": "2026-06-03 10:00:00", "grams": 5, "certainty": "guesstimate"})
        self.assertEqual(r.status_code, 400)

    def test_patch_merges_and_preserves_source(self):
        cid = self.client.post("/api/carbs", json={
            "t": "2026-06-03 10:00:00", "grams": 8, "certainty": "estimate",
            "source": "manual"}).json()["id"]
        r = self.client.patch(f"/api/carbs/{cid}", json={"grams": 12, "certainty": "exact"})
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["grams"], 12)
        self.assertEqual(body["certainty"], "exact")
        self.assertEqual(body["source"], "manual")  # untouched by the partial edit

    def test_patch_unknown_entry_404(self):
        self.assertEqual(self.client.patch("/api/carbs/9999", json={"grams": 5}).status_code, 404)

    def test_delete_removes_entry(self):
        cid = self.client.post("/api/carbs", json={
            "t": "2026-06-03 10:00:00", "grams": 8, "certainty": "exact"}).json()["id"]
        r = self.client.delete(f"/api/carbs/{cid}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"deleted": 1})
        self.assertEqual(self.client.get("/api/carbs").json()["carb_entries"], [])

    def test_delete_unknown_entry_404(self):
        self.assertEqual(self.client.delete("/api/carbs/9999").status_code, 404)

    def test_list_is_windowed(self):
        self.client.post("/api/carbs", json={
            "t": "2026-06-01 10:00:00", "grams": 5, "certainty": "exact"})
        self.client.post("/api/carbs", json={
            "t": "2026-06-03 10:00:00", "grams": 8, "certainty": "exact"})
        r = self.client.get("/api/carbs", params={"start": "2026-06-02T00:00:00"})
        rows = r.json()["carb_entries"]
        self.assertEqual([e["grams"] for e in rows], [8])


def _seed_prompts(path):
    """A DB with one sub-70 low and one unannounced (no-bolus) rise on the last day.

    Yields exactly two live prompts from ``GET /prompts``: a ``low`` at the 03:15
    nadir and a ``missed-meal`` at the 08:30 rise onset."""
    day = datetime(2026, 6, 5)
    bg_at = {}
    # flat 120 baseline across the day (5-min cadence, 00:00–10:00)
    for k in range(121):
        bg_at[day + timedelta(minutes=5 * k)] = 120.0
    # a clear sub-70 dip around 03:00–03:30
    dip = {"03:00": 95, "03:05": 80, "03:10": 68, "03:15": 55,
           "03:20": 66, "03:25": 82, "03:30": 100}
    # a steady unannounced rise from a flat 110 baseline, no bolus behind it
    rise = {"08:00": 110, "08:05": 110, "08:10": 110, "08:15": 110,
            "08:20": 110, "08:25": 110, "08:30": 110, "08:35": 130,
            "08:40": 160, "08:45": 195, "08:50": 230, "08:55": 255, "09:00": 270}
    for hhmm, v in {**dip, **rise}.items():
        h, m = (int(x) for x in hhmm.split(":"))
        bg_at[day.replace(hour=h, minute=m)] = float(v)

    with Store.open(path) as store:
        cgm = [{"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                "Readings (CGM / BGM)": v, "Description": "EGV"}
               for t, v in sorted(bg_at.items())]
        store.upsert_cgm(cgm)


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class PromptQueueTest(unittest.TestCase):
    """#128: the live-derived carb-log prompt review queue."""

    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed_prompts(self.tmp.name)
        self.client = TestClient(create_app(db_path=self.tmp.name, token=None,
                                            enable_fetch_loop=False))

    def tearDown(self):
        self.tmp.close()

    def test_lists_the_two_live_prompts(self):
        r = self.client.get("/api/prompts")
        self.assertEqual(r.status_code, 200)
        prompts = r.json()
        detectors = sorted(p["detector"] for p in prompts)
        self.assertEqual(detectors, ["low", "missed-meal"])
        for p in prompts:
            self.assertIn("anchor_t", p)
            self.assertIn("key_bg", p)
            self.assertTrue(p["cgm"])          # carries its ±2h context

    def test_serves_the_time_of_each_prompts_reading(self):
        # #529: Day's Rises draw each rise's peak at its time, so the server serves
        # when key_bg was read: the peak for a rise (after its 08:55 onset), the
        # nadir for a low (its own anchor). The frontend derives neither.
        prompts = {p["detector"]: p for p in self.client.get("/api/prompts").json()}
        rise, low = prompts["missed-meal"], prompts["low"]
        self.assertEqual((rise["anchor_t"], rise["key_t"], rise["key_bg"]),
                         ("2026-06-05 08:55:00", "2026-06-05 09:00:00", 270.0))
        self.assertEqual((low["anchor_t"], low["key_t"], low["key_bg"]),
                         ("2026-06-05 03:15:00", "2026-06-05 03:15:00", 55.0))
        for p in (rise, low):
            self.assertIn({"t": p["key_t"], "bg": p["key_bg"]}, p["cgm"])

    def test_every_answer_to_a_rise_is_recorded_data(self):
        # #538, #529: an answer to a rise is an exclusion the analysis reads, so
        # answering, revising to carbs and clearing it each advance the
        # recorded-data revision and the 30-day analysis is computed again.
        import ciq_autotune.api as api_mod
        rise = next(p for p in self.client.get("/api/prompts").json()
                    if p["detector"] == "missed-meal")
        builds = []

        def counting(*args, **kwargs):
            builds.append(1)
            return real(*args, **kwargs)

        real = api_mod.analyze
        with patch.object(api_mod, "analyze", counting):
            self.assertEqual(self.client.get("/api/analyze").status_code, 200)
            for method, payload in (
                ("POST", {"answer": "no"}),
                ("POST", {"answer": "carbs", "entry": {"grams": 20, "certainty": "exact"}}),
                ("DELETE", {}),
            ):
                with Store.open(self.tmp.name) as store:
                    before = store.recorded_data_revision()
                response = self.client.request(method, "/api/prompts/answer", json={
                    "detector": "missed-meal", "anchor_t": rise["anchor_t"], **payload})
                self.assertEqual(response.status_code, 200, response.text)
                with Store.open(self.tmp.name) as store:
                    self.assertGreater(store.recorded_data_revision(), before, payload)
                built = len(builds)
                self.assertEqual(self.client.get("/api/analyze").status_code, 200)
                self.assertEqual(len(builds), built + 1, payload)

    def test_answer_no_resolves_the_prompt(self):
        low = next(p for p in self.client.get("/api/prompts").json() if p["detector"] == "low")
        self.assertIsNone(low["answer"])       # pending before answering
        r = self.client.post("/api/prompts/answer", json={
            "detector": "low", "anchor_t": low["anchor_t"], "answer": "no"})
        self.assertEqual(r.status_code, 200)
        # It stays in the queue as a faded ✓ (reviseable), now tagged with its answer.
        again = next(p for p in self.client.get("/api/prompts").json()
                     if p["anchor_t"] == low["anchor_t"])
        self.assertEqual(again["answer"], "no")

    def test_answer_false_low_is_accepted_and_persists(self):
        # #381: the low prompt's fourth answer flags the excursion as a sensor
        # artifact. It stores only the answer (no carb entry) on the same write path
        # as 'no' / 'not-sure', and the token persists in prompt_responses.
        low = next(p for p in self.client.get("/api/prompts").json() if p["detector"] == "low")
        r = self.client.post("/api/prompts/answer", json={
            "detector": "low", "anchor_t": low["anchor_t"], "answer": "false-low"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["answer"], "false-low")
        self.assertNotIn("carb_entry_id", r.json())    # no carb entry minted
        again = next(p for p in self.client.get("/api/prompts").json()
                     if p["anchor_t"] == low["anchor_t"])
        self.assertEqual(again["answer"], "false-low")

    def test_answer_carbs_creates_entry_and_response_atomically(self):
        mm = next(p for p in self.client.get("/api/prompts").json()
                  if p["detector"] == "missed-meal")
        r = self.client.post("/api/prompts/answer", json={
            "detector": "missed-meal", "anchor_t": mm["anchor_t"], "answer": "carbs",
            "entry": {"grams": 30, "certainty": "estimate"}})
        self.assertEqual(r.status_code, 200)
        self.assertIn("carb_entry_id", r.json())
        # The carb entry exists, pinned to the anchor, tagged rise-prompt.
        carbs = self.client.get("/api/carbs").json()["carb_entries"]
        self.assertEqual(len(carbs), 1)
        self.assertEqual(carbs[0]["source"], "rise-prompt")
        self.assertEqual(carbs[0]["t"], mm["anchor_t"])
        self.assertEqual(carbs[0]["grams"], 30)
        # And the prompt is now tagged 'carbs' in the queue (faded ✓).
        again = next(p for p in self.client.get("/api/prompts").json()
                     if p["anchor_t"] == mm["anchor_t"])
        self.assertEqual(again["answer"], "carbs")

    def test_carbs_answer_ignores_client_source_and_time(self):
        # Even if the client echoes a bogus source/time, the server pins both.
        mm = next(p for p in self.client.get("/api/prompts").json()
                  if p["detector"] == "missed-meal")
        self.client.post("/api/prompts/answer", json={
            "detector": "missed-meal", "anchor_t": mm["anchor_t"], "answer": "carbs",
            "entry": {"grams": 12, "certainty": "exact",
                      "source": "manual", "t": "2020-01-01 00:00:00"}})
        carb = self.client.get("/api/carbs").json()["carb_entries"][0]
        self.assertEqual(carb["source"], "rise-prompt")
        self.assertEqual(carb["t"], mm["anchor_t"])

    def test_clear_answer_resurrects_the_prompt(self):
        low = next(p for p in self.client.get("/api/prompts").json() if p["detector"] == "low")
        self.client.post("/api/prompts/answer", json={
            "detector": "low", "anchor_t": low["anchor_t"], "answer": "no"})
        r = self.client.request("DELETE", "/api/prompts/answer", json={
            "detector": "low", "anchor_t": low["anchor_t"]})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"cleared": 1})
        # It is pending again (answer cleared back to null).
        again = next(p for p in self.client.get("/api/prompts").json()
                     if p["anchor_t"] == low["anchor_t"])
        self.assertIsNone(again["answer"])

    def test_clearing_a_carbs_answer_deletes_the_entry(self):
        mm = next(p for p in self.client.get("/api/prompts").json()
                  if p["detector"] == "missed-meal")
        self.client.post("/api/prompts/answer", json={
            "detector": "missed-meal", "anchor_t": mm["anchor_t"], "answer": "carbs",
            "entry": {"grams": 20, "certainty": "estimate"}})
        self.client.request("DELETE", "/api/prompts/answer", json={
            "detector": "missed-meal", "anchor_t": mm["anchor_t"]})
        # The prompt-sourced carb entry cascaded away with the response, and the
        # prompt is pending again.
        self.assertEqual(self.client.get("/api/carbs").json()["carb_entries"], [])
        again = next(p for p in self.client.get("/api/prompts").json()
                     if p["anchor_t"] == mm["anchor_t"])
        self.assertIsNone(again["answer"])

    def test_bad_detector_is_400(self):
        r = self.client.post("/api/prompts/answer", json={
            "detector": "banana", "anchor_t": "2026-06-05 03:15:00", "answer": "no"})
        self.assertEqual(r.status_code, 400)

    def test_bad_answer_is_400(self):
        r = self.client.post("/api/prompts/answer", json={
            "detector": "low", "anchor_t": "2026-06-05 03:15:00", "answer": "maybe"})
        self.assertEqual(r.status_code, 400)

    def test_scanner_catches_the_leaked_annotation(self):
        # #353: the guard must fire on the exact text a patient was seeing, so the
        # regression below has teeth. This is the leak, reproduced verbatim.
        leaked = {"tail": {"tuning": [{"annotation":
                  "meal-owned lows recur — I:C nudged one ≤20% step weaker "
                  "(harm layer, ADR 0038)"}]}}
        self.assertEqual(_find_adr_refs(leaked), ["ADR 0038"])

    def test_harm_layer_scanner_catches_a_leaked_annotation(self):
        leaked = {"tail": {"tuning": [{"annotation":
                  "correction-owned lows recur — ISF nudged one ≤20% step weaker "
                  "(harm layer)"}]}}
        self.assertEqual(_find_harm_layer_refs(leaked), ["harm layer"])

    def test_public_payloads_carry_no_internal_references(self):
        # #353, #390: no patient-facing response may expose internal terminology,
        # nested strings included. Walk the representative read endpoints.
        window = {"window": 30}
        payloads = [
            self.client.get("/api/analyze", params=window),
            self.client.get("/api/scenarios", params=window),
            self.client.get("/api/outcomes", params=window),
            self.client.get("/api/model-view", params={"date": "2026-06-03"}),
            self.client.get("/api/catalog"),
            self.client.get("/api/report", params=window),
        ]
        for r in payloads:
            self.assertEqual(r.status_code, 200)
            body = r.json()
            self.assertEqual(_find_adr_refs(body), [],
                             f"ADR reference leaked into {r.request.url}")
            self.assertEqual(_find_harm_layer_refs(body), [],
                             f"harm-layer reference leaked into {r.request.url}")


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class ApiAuthTest(unittest.TestCase):
    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed(self.tmp.name)
        self.client = TestClient(create_app(db_path=self.tmp.name, token="s3cret",
                                            enable_fetch_loop=False))

    def tearDown(self):
        self.tmp.close()

    def test_rejects_missing_token(self):
        self.assertEqual(self.client.get("/api/analyze").status_code, 401)

    def test_rejects_wrong_token(self):
        r = self.client.get("/api/analyze", headers={"Authorization": "Bearer nope"})
        self.assertEqual(r.status_code, 401)

    def test_accepts_correct_token(self):
        r = self.client.get("/api/analyze", headers={"Authorization": "Bearer s3cret"})
        self.assertEqual(r.status_code, 200)

    def test_kb_article_is_token_gated(self):
        # #269: the KB markdown endpoint honors the same bearer gate as the rest.
        self.assertEqual(self.client.get("/api/kb/start-here").status_code, 401)
        r = self.client.get("/api/kb/start-here",
                            headers={"Authorization": "Bearer s3cret"})
        self.assertEqual(r.status_code, 200)

    def test_credentials_get_requires_token(self):
        self.assertEqual(self.client.get("/api/credentials").status_code, 401)

    def test_credentials_post_requires_token(self):
        r = self.client.post("/api/credentials", json={
            "email": "me@example.com", "password": "x", "region": "US",
        })
        self.assertEqual(r.status_code, 401)

    def test_status_requires_token(self):
        self.assertEqual(self.client.get("/api/status").status_code, 401)

    def test_pump_settings_requires_token(self):
        self.assertEqual(self.client.get("/api/pump-settings").status_code, 401)

    def test_report_requires_token(self):
        self.assertEqual(self.client.get("/api/report").status_code, 401)

    def test_timeline_requires_token(self):
        r = self.client.get("/api/timeline", params={
            "start": "2026-06-03T00:00:00", "end": "2026-06-04T00:00:00",
        })
        self.assertEqual(r.status_code, 401)

    def test_scenarios_requires_token(self):
        self.assertEqual(self.client.get("/api/scenarios").status_code, 401)

    def test_apply_plan_requires_token(self):
        self.assertEqual(self.client.post("/api/plan/apply").status_code, 401)

    def test_carbs_list_requires_token(self):
        self.assertEqual(self.client.get("/api/carbs").status_code, 401)

    def test_carbs_create_requires_token(self):
        r = self.client.post("/api/carbs", json={
            "t": "2026-06-03 10:00:00", "grams": 8, "certainty": "exact"})
        self.assertEqual(r.status_code, 401)

    def test_carbs_delete_requires_token(self):
        self.assertEqual(self.client.delete("/api/carbs/1").status_code, 401)

    def test_plan_history_requires_token(self):
        self.assertEqual(self.client.get("/api/plan/history").status_code, 401)

    def test_root_does_not_require_token(self):
        # No login screen (#10): the shell itself must load unauthenticated.
        r = self.client.get("/", headers={"Authorization": "Bearer nope"})
        self.assertEqual(r.status_code, 200)


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class ApiEnvironmentCompatibilityTest(unittest.TestCase):
    _NAMES = (
        "HARMONIC_DB", "HARMONIC_API_TOKEN", "HARMONIC_SECRET_KEY",
        "HARMONIC_NO_FETCH", "CIQ_DB", "CIQ_API_TOKEN", "CIQ_SECRET_KEY",
        "CIQ_NO_FETCH",
    )

    def setUp(self):
        self.saved = {name: os.environ.get(name) for name in self._NAMES}
        for name in self._NAMES:
            os.environ.pop(name, None)

    def tearDown(self):
        for name, value in self.saved.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value

    def test_direct_create_app_honors_legacy_environment_values(self):
        from ciq_autotune.api import create_app

        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "legacy.db")
            key_path = os.path.join(tmp, "legacy.key")
            _seed(db_path)
            os.environ.update({
                "CIQ_DB": db_path,
                "CIQ_API_TOKEN": "legacy-token",
                "CIQ_SECRET_KEY": key_path,
                "CIQ_NO_FETCH": "1",
            })

            app = create_app()
            with patch("ciq_autotune.fetch_loop.run_fetch_once") as mock_once:
                with TestClient(app) as client:
                    response = client.get(
                        "/api/pump-settings",
                        headers={"Authorization": "Bearer legacy-token"},
                    )
                    self.assertEqual(response.status_code, 200)
                    self.assertTrue(response.json()["configured"])
                    saved = client.post(
                        "/api/credentials",
                        headers={"Authorization": "Bearer legacy-token"},
                        json={"email": "legacy@example.com", "password": "pw", "region": "US"},
                    )
                    self.assertEqual(saved.status_code, 200)
                mock_once.assert_not_called()
            self.assertTrue(os.path.exists(key_path))

    def test_canonical_environment_values_win_over_legacy_values(self):
        from ciq_autotune.api import create_app

        with tempfile.TemporaryDirectory() as tmp:
            harmonic_db = os.path.join(tmp, "harmonic.db")
            legacy_db = os.path.join(tmp, "legacy.db")
            harmonic_key = os.path.join(tmp, "harmonic.key")
            legacy_key = os.path.join(tmp, "legacy.key")
            _seed(harmonic_db)
            os.environ.update({
                "HARMONIC_DB": harmonic_db,
                "HARMONIC_API_TOKEN": "harmonic-token",
                "HARMONIC_SECRET_KEY": harmonic_key,
                "HARMONIC_NO_FETCH": "1",
                "CIQ_DB": legacy_db,
                "CIQ_API_TOKEN": "legacy-token",
                "CIQ_SECRET_KEY": legacy_key,
                "CIQ_NO_FETCH": "0",
            })

            app = create_app()
            with patch("ciq_autotune.fetch_loop.run_fetch_once") as mock_once:
                with TestClient(app) as client:
                    response = client.get(
                        "/api/pump-settings",
                        headers={"Authorization": "Bearer harmonic-token"},
                    )
                    self.assertEqual(response.status_code, 200)
                    self.assertTrue(response.json()["configured"])
                    self.assertEqual(
                        client.get(
                            "/api/pump-settings",
                            headers={"Authorization": "Bearer legacy-token"},
                        ).status_code,
                        401,
                    )
                    saved = client.post(
                        "/api/credentials",
                        headers={"Authorization": "Bearer harmonic-token"},
                        json={"email": "harmonic@example.com", "password": "pw", "region": "US"},
                    )
                    self.assertEqual(saved.status_code, 200)
                mock_once.assert_not_called()
            self.assertTrue(os.path.exists(harmonic_key))
            self.assertFalse(os.path.exists(legacy_key))

    def test_create_app_starts_fetch_loop_by_default(self):
        """The normal container path must fetch unless NO_FETCH opts out."""
        from ciq_autotune.api import create_app

        names = (
            "HARMONIC_DB", "HARMONIC_API_TOKEN", "HARMONIC_SECRET_KEY",
            "HARMONIC_NO_FETCH", "CIQ_DB", "CIQ_API_TOKEN", "CIQ_SECRET_KEY",
            "CIQ_NO_FETCH",
        )
        saved = {name: os.environ.get(name) for name in names}
        try:
            for name in names:
                os.environ.pop(name, None)
            with tempfile.NamedTemporaryFile(suffix=".db") as db:
                _seed(db.name)
                app = create_app(db_path=db.name, token=None)
                with patch("ciq_autotune.fetch_loop.run_fetch_once", return_value=None) as mock_once:
                    with TestClient(app) as client:
                        self.assertEqual(client.get("/api/health").status_code, 200)
                        time.sleep(0.2)
                    mock_once.assert_called()
        finally:
            for name, value in saved.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class FetchLoopWiringTest(unittest.TestCase):
    """create_app's enable_fetch_loop flag actually controls whether the
    lifespan starts the background loop (the live loop itself is covered by
    test_fetch_loop.py without going through the app)."""

    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed(self.tmp.name)
        self.app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=True)

    def tearDown(self):
        self.tmp.close()

    def test_enabled_loop_starts_and_stops_cleanly(self):
        import time
        from unittest.mock import patch

        with patch("ciq_autotune.fetch_loop.run_fetch_once") as mock_once:
            with TestClient(self.app) as client:
                r = client.get("/api/health")
                self.assertEqual(r.status_code, 200)
                time.sleep(0.2)  # let the backgrounded asyncio.to_thread call land
            # Lifespan shutdown must not hang or raise; the loop got at least
            # one immediate fetch in before the context exited.
            mock_once.assert_called()

    def test_loop_is_wired_to_the_worker_signal_not_inline_warming(self):
        import asyncio
        from unittest.mock import patch

        seen = {}

        async def _never():
            await asyncio.sleep(3600)

        def fake_loop(db_path, *, key_path=None, on_write=None, **kwargs):
            seen["on_write"] = on_write
            return _never()

        with patch("ciq_autotune.fetch_loop.run_fetch_loop", fake_loop):
            with TestClient(self.app) as client:
                self.assertEqual(client.get("/api/health").status_code, 200)
        self.assertIs(seen.get("on_write"), self.app.state.signal_recompute)

    def test_disabled_loop_does_not_call_fetch(self):
        from unittest.mock import patch
        from ciq_autotune.api import create_app

        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            _seed(db.name)
            app = create_app(db_path=db.name, token=None, enable_fetch_loop=False)
            with patch("ciq_autotune.fetch_loop.run_fetch_once") as mock_once:
                with TestClient(app) as client:
                    r = client.get("/api/health")
                    self.assertEqual(r.status_code, 200)
                mock_once.assert_not_called()


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class ServeEnableFetchLoopForwardingTest(unittest.TestCase):
    """serve() forwards enable_fetch_loop to create_app."""

    def test_serve_no_fetch_loop_does_not_start_loop(self):
        from unittest.mock import patch, MagicMock
        from ciq_autotune.api import serve

        with patch("ciq_autotune.api.create_app") as mock_create_app, \
             patch("uvicorn.run"):
            mock_create_app.return_value = MagicMock()
            serve(enable_fetch_loop=False)
            mock_create_app.assert_called_once()
            _, kwargs = mock_create_app.call_args
            self.assertFalse(kwargs.get("enable_fetch_loop", True))

    def test_serve_default_enables_fetch_loop(self):
        from unittest.mock import patch, MagicMock
        from ciq_autotune.api import serve

        with patch("ciq_autotune.api.create_app") as mock_create_app, \
             patch("uvicorn.run"):
            mock_create_app.return_value = MagicMock()
            serve(enable_fetch_loop=True)
            _, kwargs = mock_create_app.call_args
            self.assertTrue(kwargs.get("enable_fetch_loop", True))


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class CacheInvalidationTest(unittest.TestCase):
    """#267: the result cache answers repeat reads, and a write invalidates it —
    with the one exception carved out by #427, saving a Plan draft, which no cached
    compute reads.

    Correctness is the contract: after a write, the read reflects it. The
    once-per-version contract is observed via a monkeypatched counter on the
    underlying builder (``ciq_autotune.api.analyze``) — never the cache's internals.
    """

    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed(self.tmp.name)
        self.client = TestClient(create_app(db_path=self.tmp.name, token=None,
                                            enable_fetch_loop=False))

    def tearDown(self):
        self.tmp.close()

    def test_carb_write_invalidates_analyze_recomputes_once_per_version(self):
        import ciq_autotune.api as api_mod
        real_analyze = api_mod.analyze
        calls = []

        def counting_analyze(*args, **kwargs):
            calls.append(1)
            return real_analyze(*args, **kwargs)

        with patch.object(api_mod, "analyze", counting_analyze):
            self.client.get("/api/analyze", params={"window": 30})   # miss → compute
            self.client.get("/api/analyze", params={"window": 30})   # hit → no compute
            self.assertEqual(len(calls), 1)

            r = self.client.post("/api/carbs", json={
                "t": "2026-06-03 10:05:00", "grams": 8, "certainty": "exact"})
            self.assertEqual(r.status_code, 200)

            self.client.get("/api/analyze", params={"window": 30})   # bumped → recompute
            self.assertEqual(len(calls), 2)  # exactly one recompute per data version

    def test_done_keeps_the_default_analysis_and_the_outcomes(self):
        # #518, #522, #538: a Done is a write to follow-up state alone, so it keeps
        # every result that reads only recorded data, the default analysis among
        # them, while it still invalidates the cache.
        import ciq_autotune.api as api_mod
        self.client = _guidance_client(self, "basal-raise")
        self.client.get("/api/guidance")  # warm the independently computed source
        import ciq_autotune.outcomes as outcomes_mod
        real_analyze, real_outcomes = api_mod.analyze, outcomes_mod.summarize_outcomes
        calls = {"analyze": 0, "outcomes": 0}

        def counting(name, real):
            def run(*args, **kwargs):
                calls[name] += 1
                return real(*args, **kwargs)
            return run

        with patch.object(api_mod, "analyze", counting("analyze", real_analyze)), \
                patch.object(outcomes_mod, "summarize_outcomes", counting("outcomes", real_outcomes)):
            self.client.get("/api/analyze", params={"window": 30})   # miss → compute
            self.client.get("/api/outcomes", params={"window": 14})
            self.client.get("/api/analyze", params={"window": 30})   # hit → no compute
            self.assertEqual(calls, {"analyze": 1, "outcomes": 1})
            version = self.client.app.state.result_cache.version
            r = _done(self.client, "setting:basal_rate")
            self.assertEqual(r.status_code, 200)
            self.assertEqual(self.client.app.state.result_cache.version, version + 1)
            self.client.get("/api/analyze", params={"window": 30})   # kept → hit
            self.client.get("/api/outcomes", params={"window": 14})  # kept → hit
            self.assertEqual(calls, {"analyze": 1, "outcomes": 1})

    def test_focus_pin_invalidates_what_reads_follow_up_state(self):
        # #427, #538: a Focus pin invalidates the cache like every other write; the
        # Trial roster, which reads the Focus, is read again, and the analysis,
        # which reads only recorded data, is kept.
        import ciq_autotune.api as api_mod
        import ciq_autotune.watched_change as watched_mod
        self.client = _guidance_client(self, "behavioral-missed-meal")
        self.client.get("/api/guidance")  # warm the independently computed source
        calls = {"analyze": 0, "trials": 0}

        def counting(name, real):
            def run(*args, **kwargs):
                calls[name] += 1
                return real(*args, **kwargs)
            return run

        with patch.object(api_mod, "analyze", counting("analyze", api_mod.analyze)), \
             patch.object(watched_mod, "review_trials",
                          counting("trials", watched_mod.review_trials)):
            self.client.get("/api/analyze", params={"window": 30})   # miss → compute
            self.client.get("/api/verify/trials")
            self.client.get("/api/analyze", params={"window": 30})   # hit → no compute
            self.client.get("/api/verify/trials")
            self.assertEqual(calls, {"analyze": 1, "trials": 1})
            version = self.client.app.state.result_cache.version
            r = self.client.post("/api/focus", json={"lever": "missed_meal"})
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(self.client.app.state.result_cache.version, version + 1)
            self.client.get("/api/analyze", params={"window": 30})   # kept → hit
            focuses = self.client.get("/api/verify/trials").json()["focuses"]
            self.assertEqual(calls, {"analyze": 1, "trials": 2})
            self.assertEqual([row["lever"] for row in focuses], ["missed_meal"])


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class CachePreWarmTest(unittest.TestCase):
    """#424: after the hourly fetch writes, the app clears the cache and then
    pre-warms the fixed shapes the initial Diagnose load asks for, so the first
    visitor after a fetch lands warm instead of paying the cold recompute.

    Observed through the public surface: the warm hook the fetch loop calls, then
    plain GETs, counting how often the underlying builders actually run.
    """

    #: The builders behind the landing set, patched to count recomputes.
    _BUILDERS = (
        ("analyze", "ciq_autotune.api", "analyze"),
        ("outcomes-trend", "ciq_autotune.outcomes_trend", "trend_watched_change"),
        ("scenarios", "ciq_autotune.analyzers.scenario", "build_scenarios"),
        ("exposures", "ciq_autotune.api", "build_exposures"),
        ("explore-time-of-day", "ciq_autotune.api", "build_time_of_day_windows"),
        ("meal-size", "ciq_autotune.api", "build_meal_size_windows"),
        ("outcomes", "ciq_autotune.outcomes", "summarize_outcomes"),
        ("finding-case-file", "ciq_autotune.api", "prepare_finding_cases"),
        ("trials", "ciq_autotune.watched_change", "review_trials"),
        ("day-navigator", "ciq_autotune.day_navigator", "build_day_navigator"),
        ("model-view", "ciq_autotune.analyzers.scenario", "build_model_view"),
        ("timeline", "ciq_autotune.timeline", "timeline"),
    )

    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed(self.tmp.name)
        self.app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp.close()

    @contextlib.contextmanager
    def _counting_builders(self):
        """Count every real build, per builder, for the duration of the block."""
        import importlib

        counts = {}
        with contextlib.ExitStack() as stack:
            for label, module_name, attr in self._BUILDERS:
                counts[label] = 0
                module = importlib.import_module(module_name)
                real = getattr(module, attr)

                def counting(*args, _label=label, _real=real, **kwargs):
                    counts[_label] += 1
                    return _real(*args, **kwargs)

                stack.enter_context(patch.object(module, attr, counting))
            yield counts

    def _get_landing_set(self):
        """What the app's five tabs read (frontend/ui/app/live.js), in its order."""
        for path, params in (
            # Queue and Changes.
            ("/api/diagnose/findings", {}),
            ("/api/guidance", {}),
            ("/api/analyze", {}),
            ("/api/verify/trials", {}),
            ("/api/focus", {}),
            ("/api/diagnose/finding-case-file-preparation", {}),
            # The Overview: outcomes, the glucose profile and the analysis behind its
            # correction-factor estimate, at each window it switches to.
            ("/api/outcomes", {"window": 14}),
            ("/api/outcomes", {"window": 30}),
            ("/api/outcomes", {"window": 90}),
            ("/api/explore/time-of-day", {"days": 14}),
            ("/api/explore/time-of-day", {"days": 30}),
            ("/api/explore/time-of-day", {"days": 90}),
            ("/api/analyze", {"window": 14}),
            ("/api/analyze", {"window": 90}),
            # The Overview's Meal size card, at each window.
            ("/api/explore/meal-size", {"days": 14}),
            ("/api/explore/meal-size", {"days": 30}),
            ("/api/explore/meal-size", {"days": 90}),
            # The Day screen: its navigator, then the latest day and the one before.
            ("/api/day-navigator", {}),
            ("/api/timeline", {"start": "2026-06-05T00:00:00", "end": "2026-06-06T00:00:00"}),
            ("/api/model-view", {"date": "2026-06-05"}),
            ("/api/timeline", {"start": "2026-06-04T00:00:00", "end": "2026-06-05T00:00:00"}),
            ("/api/model-view", {"date": "2026-06-04"}),
        ):
            r = self.client.get(path, params=params)
            self.assertEqual(r.status_code, 200, path)

    def _warmed_keys(self):
        cache = self.app.state.result_cache
        with cache._lock:
            return tuple(cache._map) + tuple(cache._preparations)

    @contextlib.contextmanager
    def _run_worker(self):
        """Signal the lifespan worker and wait for its real final warm shape."""
        complete = threading.Event()
        roster = list(self.app.state.recompute_roster())
        label, warm = roster[-1]

        def final_shape():
            try:
                return warm()
            finally:
                complete.set()

        roster[-1] = (label, final_shape)
        self.app.state.recompute_roster = lambda: tuple(roster)

        async def no_delay():
            return None

        with TestClient(self.app) as client:
            self.client = client
            self.app.state.recompute_pace = no_delay
            self.app.state.signal_recompute()
            self.assertTrue(complete.wait(5), "worker did not finish the warm roster")
            yield

    def test_worker_paces_between_marker_shapes_without_a_trailing_pace(self):
        trace, complete = [], threading.Event()

        def a():
            trace.append("A")

        def b():
            trace.append("B")
            complete.set()

        async def pace():
            trace.append("pace")

        self.app.state.recompute_roster = lambda: (("A", a), ("B", b))
        self.app.state.recompute_pace = pace
        with TestClient(self.app):
            self.app.state.signal_recompute()
            self.assertTrue(complete.wait(3))
        self.assertEqual(trace, ["A", "pace", "B"])

    def test_worker_supersede_abandons_the_old_set_at_the_next_boundary(self):
        trace, entered, release, complete = [], threading.Event(), threading.Event(), threading.Event()

        def a():
            trace.append("A")
            if len(trace) == 1:
                entered.set()
                self.assertTrue(release.wait(3))

        def b():
            trace.append("B")
            complete.set()

        async def pace():
            trace.append("pace")

        self.app.state.recompute_roster = lambda: (("A", a), ("B", b))
        self.app.state.recompute_pace = pace
        with TestClient(self.app):
            self.app.state.signal_recompute()
            self.assertTrue(entered.wait(3))
            self.app.state.signal_recompute()
            release.set()
            self.assertTrue(complete.wait(3))
        self.assertEqual(trace, ["A", "A", "pace", "B"])

    def test_worker_supersede_leaves_an_old_fixed_shape_unpublished(self):
        """A crossed worker result neither fills the public cache nor persists."""
        import ciq_autotune.api as api_mod
        import ciq_autotune.derived_artifacts as artifacts

        key = ("analyze", 30, False, True)
        entered, release, completed = threading.Event(), threading.Event(), threading.Event()
        label, warm = next(item for item in self.app.state.recompute_roster()
                           if item[0] == "analyze-pooled")

        def old_shape():
            try:
                return warm()
            finally:
                completed.set()

        rosters = iter((((label, old_shape),), ()))
        self.app.state.recompute_roster = lambda: next(rosters)
        real = api_mod.analyze
        builds = []

        def blocked_analyze(*args, **kwargs):
            builds.append(1)
            if len(builds) == 1:
                entered.set()
                self.assertTrue(release.wait(3))
            return real(*args, **kwargs)

        with patch.object(artifacts, "_MAX_SNAPSHOT_ATTEMPTS", 1), \
             patch.object(api_mod, "analyze", side_effect=blocked_analyze):
            with TestClient(self.app) as client:
                self.app.state.signal_recompute()
                self.assertTrue(entered.wait(3))
                with Store.open(self.tmp.name) as store:
                    store.upsert_cgm([{"EventDateTime": "2026-06-06 00:00:00",
                                       "Readings (CGM / BGM)": 115}])
                self.app.state.signal_recompute()
                release.set()
                self.assertTrue(completed.wait(3))
                self.assertFalse(self.app.state.result_cache.contains(key))
                before_read = len(builds)
                response = client.get("/api/analyze", params={"window": 30, "pool": True})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(builds), before_read + 1)
        self.assertIsNone(load_latest_prior(self.tmp.name, key, shape_marker="analyze-v1"))

    def test_shutdown_waits_for_a_running_shape_and_starts_no_next_shape(self):
        trace, entered, release, finished = [], threading.Event(), threading.Event(), threading.Event()

        def a():
            trace.append("A")
            entered.set()
            self.assertTrue(release.wait(3))
            finished.set()

        def b():
            trace.append("B")

        self.app.state.recompute_roster = lambda: (("A", a), ("B", b))
        with TestClient(self.app):
            self.app.state.signal_recompute()
            self.assertTrue(entered.wait(3))
            started = time.monotonic()
            threading.Timer(0.15, release.set).start()
        self.assertEqual(trace, ["A"])
        self.assertTrue(finished.is_set())
        self.assertGreaterEqual(time.monotonic() - started, 0.1)

    def test_shutdown_contains_a_failing_in_flight_shape(self):
        entered, release = threading.Event(), threading.Event()

        def failing_shape():
            entered.set()
            self.assertTrue(release.wait(3))
            raise RuntimeError("shutdown shape failed")

        self.app.state.recompute_roster = lambda: (("failing", failing_shape),)
        with TestClient(self.app):
            self.app.state.signal_recompute()
            self.assertTrue(entered.wait(3))
            threading.Timer(0.05, release.set).start()

    def test_worker_failure_still_paces_before_the_next_shape(self):
        trace, complete = [], threading.Event()

        def a():
            trace.append("A")
            raise RuntimeError("A failed")

        def b():
            trace.append("B")
            complete.set()

        async def pace():
            trace.append("pace")

        self.app.state.recompute_roster = lambda: (("A", a), ("B", b))
        self.app.state.recompute_pace = pace
        with TestClient(self.app):
            self.app.state.signal_recompute()
            self.assertTrue(complete.wait(3))
        self.assertEqual(trace, ["A", "pace", "B"])

    def test_fetch_thread_signal_uses_loop_call_soon_threadsafe(self):
        calls = []
        self.app.state.recompute_roster = lambda: ()
        with TestClient(self.app):
            real = self.app.state.recompute_loop.call_soon_threadsafe

            def recording(callback):
                calls.append((threading.current_thread(), callback))
                real(callback)

            with patch.object(self.app.state.recompute_loop,
                              "call_soon_threadsafe", side_effect=recording):
                with ThreadPoolExecutor(max_workers=1) as pool:
                    pool.submit(self.app.state.signal_recompute).result()
            self.assertEqual(len(calls), 1)
            self.assertIsNot(calls[0][0], threading.current_thread())
            self.assertIs(calls[0][1].__self__, self.app.state.recompute_event)

    def test_worker_fixed_shape_stale_serves_through_the_public_endpoint(self):
        import ciq_autotune.api as api_mod

        entered, release, completed = threading.Event(), threading.Event(), threading.Event()
        with TestClient(self.app) as client:
            self.assertEqual(client.get("/api/explore/time-of-day").status_code, 200)
            with Store.open(self.tmp.name) as store:
                store.upsert_cgm([{"EventDateTime": "2026-06-06 00:00:00",
                                   "Readings (CGM / BGM)": 115}])
            label, warm = next(item for item in self.app.state.recompute_roster()
                               if item[0] == "explore-time-of-day")

            def worker_shape():
                try:
                    return warm()
                finally:
                    completed.set()

            self.app.state.recompute_roster = lambda: ((label, worker_shape),)
            real = api_mod.build_time_of_day_windows

            def blocked(*args, **kwargs):
                entered.set()
                self.assertTrue(release.wait(3))
                return real(*args, **kwargs)

            with patch.object(api_mod, "build_time_of_day_windows", side_effect=blocked):
                self.app.state.signal_recompute()
                self.assertTrue(entered.wait(3))
                stale = client.get("/api/explore/time-of-day")
                self.assertEqual(stale.status_code, 200)
                self.assertIn("input_data_age", stale.json())
                release.set()
                self.assertTrue(completed.wait(3))
            fresh = client.get("/api/explore/time-of-day")
        self.assertEqual(fresh.status_code, 200)
        self.assertNotIn("input_data_age", fresh.json())

    def test_worker_finding_case_shape_uses_its_endpoint_adapter(self):
        import ciq_autotune.api as api_mod

        entered, release, completed, calls = (threading.Event(), threading.Event(),
                                              threading.Event(), [])
        label, warm = next(item for item in self.app.state.recompute_roster()
                           if item[0] == "finding-case-file")

        def worker_shape():
            try:
                return warm()
            finally:
                completed.set()

        self.app.state.recompute_roster = lambda: ((label, worker_shape),)
        real = api_mod.prepare_finding_cases

        def blocked_prepare(*args, **kwargs):
            calls.append((args, kwargs))
            entered.set()
            self.assertTrue(release.wait(3))
            return real(*args, **kwargs)

        with patch.object(api_mod, "prepare_finding_cases",
                          side_effect=blocked_prepare):
            with TestClient(self.app) as client:
                self.app.state.signal_recompute()
                self.assertTrue(entered.wait(3))
                self.assertEqual(self.app.state.fixed_in_flight_keys(), ())
                with ThreadPoolExecutor(max_workers=1) as pool:
                    request = pool.submit(client.get,
                                          "/api/diagnose/finding-case-file-preparation")
                    self.assertFalse(request.done())
                    release.set()
                    self.assertEqual(request.result(timeout=3).status_code, 200)
                self.assertTrue(completed.wait(3))
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1]["query"].start_min, None)
        self.assertEqual(calls[0][1]["query"].end_min, None)

    def test_worker_and_direct_fixed_endpoint_keep_identical_payload_bytes(self):
        import ciq_autotune.api as api_mod

        def staging_verdicts(value):
            verdicts = []
            if isinstance(value, dict):
                if "safety_status" in value or "asserts_move" in value:
                    verdicts.append((value.get("safety_status"), value.get("asserts_move")))
                for child in value.values():
                    verdicts.extend(staging_verdicts(child))
            elif isinstance(value, list):
                for child in value:
                    verdicts.extend(staging_verdicts(child))
            return verdicts

        completed = threading.Event()
        label, warm = next(item for item in self.app.state.recompute_roster()
                           if item[0] == "analyze-pooled")

        def worker_shape():
            try:
                return warm()
            finally:
                completed.set()

        self.app.state.recompute_roster = lambda: ((label, worker_shape),)
        real = api_mod.analyze
        builds = []
        # Both fresh builds carry a wall-clock ``generated_at``. Freeze that input so
        # this remains a byte-for-byte adapter test rather than a scheduler-speed test.
        with patch("ciq_autotune.analyze.wall_clock_now", return_value=datetime(2026, 6, 30, 12, 0)), \
             patch.object(api_mod, "analyze", side_effect=lambda *args, **kwargs:
                          builds.append(1) or real(*args, **kwargs)):
            with TestClient(self.app) as client:
                direct = client.get("/api/analyze", params={"window": 30, "pool": True})
                self.assertEqual(direct.status_code, 200)
                # This value-identical write advances the input revision without changing
                # the synthetic analysis, so the worker must compute rather than reopen
                # the first response's durable artifact.
                with Store.open(self.tmp.name) as store:
                    store.upsert_cgm([{"EventDateTime": "2026-06-01 00:00:00",
                                       "Readings (CGM / BGM)": 120,
                                       "Description": "EGV"}])
                self.app.state.signal_recompute()
                self.assertTrue(completed.wait(3))
                worker_warm = client.get("/api/analyze", params={"window": 30, "pool": True})
        self.assertEqual(len(builds), 2)
        self.assertEqual(worker_warm.content, direct.content)
        worker_verdicts = staging_verdicts(worker_warm.json())
        self.assertTrue(worker_verdicts)
        self.assertEqual(worker_verdicts, staging_verdicts(direct.json()))

    def test_warm_pass_leaves_the_landing_set_answering_without_recompute(self):
        with self._counting_builders() as counts:
            with self._run_worker():
                after_warm = dict(counts)
            # Exactly what the app reads and nothing else: the analysis at the
            # default window (pooled and not) and at the Overview's other two, and no
            # retired desk drill-down. Findings consumers share the canonical pooled
            # analysis, scenario report, and exposure feed.
            self.assertEqual(after_warm, {"analyze": 4,
                                          "outcomes-trend": 0, "scenarios": 1,
                                          "exposures": 1,
                                          # One pass for all three windows (#566).
                                          "explore-time-of-day": 1, "meal-size": 1,
                                          "outcomes": 3,
                                          "finding-case-file": 1, "trials": 1,
                                          "day-navigator": 1, "model-view": 2,
                                          "timeline": 2})
            expected_keys = (
                ("analyze", 30, False, False), ("analyze", 30, False, True),
                ("analyze", 14, False, False), ("analyze", 90, False, False),
                ("findings-history-snapshot", 30),
                ("explore-time-of-day",),
                ("outcomes", 14), ("outcomes", 30), ("outcomes", 90),
                ("meal-size",),
                ("scenarios", 30), ("exposures",),
                ("finding-case-file",),
                ("day-navigator", None),
                ("model-view", "2026-06-05"), ("model-view", "2026-06-04"),
            )
            warmed = self._warmed_keys()
            for key in expected_keys:
                self.assertIn(key, warmed)
            # ...and the visitor's own requests all hit it.
            self._get_landing_set()
            self.assertEqual(counts, after_warm)

    def test_exposure_read_uses_the_surviving_fixed_shape(self):
        """The exposure feed owns one fixed preparation, independent of case files."""
        with self._counting_builders() as counts:
            self.assertEqual(self.client.get("/api/explore/exposures").status_code, 200)
            self.assertEqual(self.client.get("/api/explore/exposures").status_code, 200)
            self.assertEqual(counts["exposures"], 1)

    def test_concurrent_exposure_reads_single_flight_the_fixed_shape(self):
        """Two public reads reaching the cold key cannot build two exposure payloads."""
        import ciq_autotune.api as api_mod

        real_build = api_mod.build_exposures
        entered = threading.Event()
        release = threading.Event()
        calls = 0
        calls_lock = threading.Lock()

        def counting_build(*args, **kwargs):
            nonlocal calls
            with calls_lock:
                calls += 1
            entered.set()
            self.assertTrue(release.wait(3), "test did not release preparation")
            return real_build(*args, **kwargs)

        with patch.object(api_mod, "build_exposures", counting_build):
            with ThreadPoolExecutor(max_workers=2) as pool:
                first = pool.submit(self.client.get, "/api/explore/exposures")
                self.assertTrue(entered.wait(1), "the first public read did not prepare")
                second = pool.submit(self.client.get, "/api/explore/exposures")
                # The first build stays deliberately in flight while the second
                # request reaches the same cache key. A duplicate build is visible
                # before either request is allowed to complete.
                time.sleep(0.05)
                self.assertEqual(calls, 1)
                release.set()
                self.assertEqual(first.result().status_code, 200)
                self.assertEqual(second.result().status_code, 200)
        self.assertEqual(calls, 1)

    def test_warm_pass_invalidates_first_so_it_never_serves_pre_fetch_results(self):
        with self._counting_builders() as counts:
            with self._run_worker():
                self._get_landing_set()
                self.assertEqual(counts["scenarios"], 1)

    def test_drill_downs_and_other_windows_stay_lazy(self):
        with self._counting_builders() as counts:
            with self._run_worker():
                after_warm = dict(counts)
                self.assertEqual(self.client.get("/api/analyze", params={"window": 60}).status_code, 200)
                self.assertGreater(counts["analyze"], after_warm["analyze"])
                # Day/month drill-downs are unbounded in key space and are never warmed.
                self.assertEqual(self.client.get("/api/day-navigator",
                                                 params={"month": "2026-06"}).status_code, 200)
                self.assertEqual(self.client.get("/api/model-view",
                                                 params={"date": "2026-06-03"}).status_code, 200)

    def test_one_failing_shape_is_contained_and_the_rest_still_warm(self):
        # The witness must be a shape the warm pass reaches *after* the failing one,
        # or containment isn't what's being proved. The Trial roster warms before
        # the Overview and the Day screen, so a blown-up roster leaves later shapes
        # to observe.
        import ciq_autotune.watched_change as watched_mod

        def boom(*args, **kwargs):
            raise RuntimeError("trial roster blew up")

        with self._counting_builders() as counts:
            with patch.object(watched_mod, "review_trials", boom):
                with self._run_worker():
                    self.assertEqual(counts["trials"], 0)
                    self.assertEqual(counts["outcomes"], 3)
                    self.assertEqual(counts["model-view"], 2)
            self.assertEqual(self.client.get("/api/verify/trials").status_code, 200)
            self.assertEqual(counts["trials"], 1)

    def _marker_roster(self):
        ran = threading.Event()
        self.app.state.recompute_roster = lambda: (("marker", ran.set),)
        return ran

    def test_a_write_from_the_app_starts_the_warm_pass(self):
        """#522: a write re-warms in the background, not only a fetch."""
        ran = self._marker_roster()
        with TestClient(self.app) as client:
            self.assertFalse(ran.wait(0.2), "nothing was written yet")
            logged = client.post("/api/carbs", json={
                "t": "2026-06-03 10:05:00", "grams": 8, "certainty": "exact"})
            self.assertEqual(logged.status_code, 200)
            self.assertTrue(ran.wait(5), "the write did not start the warm pass")

    def test_warm_on_start_warms_before_any_fetch_or_write(self):
        from ciq_autotune.api import create_app
        self.app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False,
                              warm_on_start=True)
        ran = self._marker_roster()
        with TestClient(self.app):
            self.assertTrue(ran.wait(5), "the app did not warm on start")

    def test_timeline_is_cached_until_a_write(self):
        with self._counting_builders() as counts:
            day = {"start": "2026-06-03T00:00:00", "end": "2026-06-04T00:00:00"}
            first = self.client.get("/api/timeline", params=day)
            again = self.client.get("/api/timeline", params=day)
            self.assertEqual(first.json(), again.json())
            self.assertEqual(counts["timeline"], 1)
            self.client.post("/api/carbs", json={
                "t": "2026-06-03 10:05:00", "grams": 8, "certainty": "exact"})
            self.assertEqual(self.client.get("/api/timeline", params=day).status_code, 200)
            self.assertEqual(counts["timeline"], 2)

    def test_saving_credentials_keeps_every_cached_result(self):
        """#522: no cached result reads the credentials."""
        with self._counting_builders() as counts:
            self.client.get("/api/outcomes", params={"window": 14})
            saved = self.client.post("/api/credentials", json={
                "email": "me@example.com", "password": "hunter2", "region": "US"})
            self.assertEqual(saved.status_code, 200)
            self.client.get("/api/outcomes", params={"window": 14})
            self.assertEqual(counts["outcomes"], 1)

    def test_every_api_request_logs_its_duration_and_cache_outcome(self):
        with self.assertLogs("harmonic.requests", "INFO") as logged:
            self.client.get("/api/outcomes", params={"window": 14})
            self.client.get("/api/outcomes", params={"window": 14})
            self.client.get("/api/nowhere")
        self.assertEqual(len(logged.records), 3)
        cold, warm, missing = (record.getMessage() for record in logged.records)
        self.assertRegex(cold, r"^GET /api/outcomes\?window=14 200 \d+ ms cache hit=0 miss=1 derived=0$")
        self.assertRegex(warm, r"^GET /api/outcomes\?window=14 200 \d+ ms cache hit=1 miss=0 derived=0$")
        self.assertRegex(missing, r"^GET /api/nowhere 404 \d+ ms")


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class ApiPatternSignOffTest(unittest.TestCase):
    """Sign-off on a cell that *is* ready: it persists, invalidates the cache, and moves
    the cell out of the ready queue. Uses a dedicated seed that clears the bar."""

    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed_ready_cell(self.tmp.name)
        self.app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp.close()

    def test_ready_cell_can_be_approved_and_persists_and_bumps(self):
        from ciq_autotune.result_cache import ResultCache
        # The seed clears low__full__dow-6 into the ready queue.
        before = self.client.get("/api/pattern-sweep").json()
        self.assertIn("low__full__dow-6", before["ready_for_review"])

        with patch.object(ResultCache, "bump", autospec=True) as bump:
            approve = self.client.post("/api/pattern-sweep/approve",
                                       json={"cell_id": "low__full__dow-6"})
        self.assertEqual(approve.status_code, 200)
        self.assertEqual(approve.json()["decision"], "approved")
        # The write path invalidates the cache (#267): a forgotten bump is a bug.
        self.assertGreaterEqual(bump.call_count, 1)
        # The decision persists, scoped to the current era.
        era = approve.json()["era_start"]
        with Store.open(self.tmp.name) as store:
            reviews = store.pattern_reviews(era)
        self.assertEqual(reviews["low__full__dow-6"]["decision"], "approved")

    def test_a_sign_off_leaves_follow_up_admission_reconciled(self):
        # #557: a sign-off advanced the input revision and never reconciled, so
        # admission read unavailable until the next fetch.
        from ciq_autotune.watched_change import reconcile_ingested_follow_up
        with Store.open(self.tmp.name) as store:
            reconcile_ingested_follow_up(store)
        self.assertEqual(self.client.get("/api/plan/history").json()["admission"]["state"], "available")
        approve = self.client.post("/api/pattern-sweep/approve", json={"cell_id": "low__full__dow-6"})
        self.assertEqual(approve.status_code, 200, approve.text)
        self.assertEqual(self.client.get("/api/plan/history").json()["admission"]["state"], "available")


if __name__ == "__main__":
    unittest.main()
