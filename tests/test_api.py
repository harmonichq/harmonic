"""HTTP API tests (needs the api extra; skipped if FastAPI isn't installed).

The API is a thin renderer over AnalysisResult, so the tests assert it serves the
same versioned JSON and enforces the single-user static token — not the analysis
itself (that is covered by the analyzer/facade tests).
"""

import contextlib
import json
import os
import sqlite3
from concurrent.futures import ThreadPoolExecutor
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta
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
from ciq_autotune.derived_artifacts import (
    DERIVED_ARTIFACT_STORE_SCHEMA_VERSION,
    _canonical,
    _digest,
    load_latest_prior,
    sidecar_path,
    source_fingerprint,
)
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

    def test_root_serves_frontend(self):
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers["content-type"], "text/html; charset=utf-8")

    def test_serves_scenario_chart_js_as_javascript(self):
        # #100: sibling ESM asset must load with a JS MIME type or the module
        # graph fails in the browser.
        r = self.client.get("/assets/scenario-chart.js")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("text/javascript"))

    def test_every_index_module_import_is_served_as_javascript(self):
        # #332: index.html imports each ``/assets/*.js`` module as an ES module. If any
        # one has no serving route the browser gets a 404 (application/json), blocks
        # the module, and the WHOLE SPA fails to mount (raw ``{{ }}`` mustaches).
        # The per-file tests above miss new modules; this derives the list from the
        # actual imports so a forgotten route fails here instead of only in prod.
        import re as _re
        from pathlib import Path
        index = (Path(__file__).resolve().parent.parent
                 / "frontend" / "index.html").read_text()
        modules = sorted(set(_re.findall(r"""["']/assets/([a-z0-9-]+\.js)["']""", index)))
        self.assertIn("day-hero-chart.js", modules)  # guards the regex itself
        for mod in modules:
            if mod == "diagnose-event-comparison.js":
                continue  # chunk 3 owns the retained import-path migration
            r = self.client.get("/assets/" + mod)
            self.assertEqual(r.status_code, 200, f"{mod} import has no serving route")
            self.assertTrue(r.headers["content-type"].startswith("text/javascript"),
                            f"{mod} not served as JavaScript")

    def test_serves_model_view_log_js_as_javascript(self):
        # #152: the model-view's pure module is a sibling ESM asset and must load
        # with a JS MIME type or the SPA silently fails to mount (bits #99/#95).
        r = self.client.get("/assets/model-view-log.js")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("text/javascript"))

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

    def test_model_view_rejects_bad_date(self):
        r = self.client.get("/api/model-view", params={"date": "06/03/2026"})
        self.assertEqual(r.status_code, 400)

    def test_serves_plan_js_as_javascript(self):
        # #99: the Plan deliverable's pure module is a sibling ESM asset and
        # must load with a JS MIME type or the module graph fails in the browser.
        r = self.client.get("/assets/plan.js")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("text/javascript"))

    def test_serves_settling_js_as_javascript(self):
        # #95: the settling helpers are a sibling ESM asset; without this route
        # the import 404s and the whole SPA fails to mount (raw mustaches).
        r = self.client.get("/assets/settling.js")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("text/javascript"))

    def test_serves_carb_log_js_as_javascript(self):
        # #99/#95 gotcha: every frontend/*.js needs its own route or the SPA
        # module graph fails to load.
        r = self.client.get("/assets/carb-log.js")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("text/javascript"))

    def test_serves_daily_nav_js_as_javascript(self):
        # #136: the day-picker nav's pure helpers are a sibling ESM asset; without
        # this route the import 404s and the whole SPA fails to mount.
        r = self.client.get("/assets/daily-nav.js")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("text/javascript"))

    def test_serves_guide_js_as_javascript(self):
        # #157: the Guide tab's pure render helpers are a sibling ESM asset;
        # without this route the import 404s and the whole SPA fails to mount.
        r = self.client.get("/assets/guide.js")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("text/javascript"))

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

    def test_kb_article_unknown_slug_is_404(self):
        self.assertEqual(self.client.get("/api/kb/no-such-article").status_code, 404)

    def test_kb_article_rejects_non_slug_paths(self):
        # the slug charset ([a-z0-9-]) can't escape docs/kb: dotted / cased /
        # traversal attempts never resolve to a file outside the directory.
        for bad in ("Start-Here", "start_here", "..%2F..%2Fsecret", "start.here"):
            self.assertEqual(self.client.get(f"/api/kb/{bad}").status_code, 404,
                             f"{bad!r} should 404")

    def test_pump_settings_includes_fetched_at(self):
        # #99: Confirmation-B shows "on pump as of <fetch>" — the endpoint
        # must surface the snapshot's capture time.
        r = self.client.get("/api/pump-settings")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertTrue(body["configured"])
        self.assertIn("fetched_at", body)
        self.assertTrue(body["fetched_at"])

    def test_serves_scenario_css(self):
        r = self.client.get("/assets/scenario.css")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("text/css"))

    def test_serves_diagnose_workstation_assets(self):
        css = self.client.get("/assets/diagnose-workstation.css")
        self.assertEqual(css.status_code, 200)
        self.assertTrue(css.headers["content-type"].startswith("text/css"))
        chart = self.client.get("/assets/diagnose-workstation-chart.js")
        self.assertEqual(chart.status_code, 200)
        self.assertTrue(chart.headers["content-type"].startswith("text/javascript"))

    def test_serves_diagnose_event_comparison_assets_used_by_diagnose(self):
        js = self.client.get("/assets/diagnose-event-comparison.js")
        self.assertEqual(js.status_code, 200)
        self.assertTrue(js.headers["content-type"].startswith("text/javascript"))
        css = self.client.get("/assets/diagnose-event-comparison.css")
        self.assertEqual(css.status_code, 200)
        self.assertTrue(css.headers["content-type"].startswith("text/css"))

    def test_serves_the_app_icon_the_page_asks_for(self):
        # The index links ./assets/favicon.svg; without its own route the tab falls back
        # to a 404 and the browser shows a blank page icon.
        r = self.client.get("/assets/favicon.svg")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("image/svg+xml"))
        # ...and it must actually parse. A browser drops a malformed icon silently
        # (a stray "--" inside a comment is enough), leaving the blank page icon.
        root = ElementTree.fromstring(r.text)
        self.assertTrue(root.tag.endswith("svg"))

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

    def test_plan_starts_empty(self):
        r = self.client.get("/api/plan")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"items": [], "updated_at": None})

    def test_put_then_get_plan_round_trips(self):
        items = [{"type": "basal", "key": 0, "label": "00:00", "value": 0.7}]
        r = self.client.put("/api/plan", json={"items": items})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["items"], items)

        r = self.client.get("/api/plan")
        self.assertEqual(r.json()["items"], items)
        self.assertIsNotNone(r.json()["updated_at"])

    def test_put_plan_allows_one_family_across_multiple_rows(self):
        for items in (
            [{"type": "basal", "key": 0}, {"type": "basal", "key": 1}],
            [{"type": "isf", "key": 0}, {"type": "isf", "key": 540}],
            [{"type": "ic", "key": 0}, {"type": "ic", "key": 540}],
            [{"type": "target", "key": 0}, {"type": "target", "key": 540}],
            [],
        ):
            with self.subTest(items=items):
                r = self.client.put("/api/plan", json={"items": items})
                self.assertEqual(r.status_code, 200)
                self.assertEqual(r.json()["items"], items)

    def test_put_plan_rejects_mixed_family_items(self):
        items = [{"type": "basal", "key": 0}, {"type": "isf", "key": 540}]
        r = self.client.put("/api/plan", json={"items": items})
        self.assertEqual(r.status_code, 400)
        self.assertIn("mixes tuning families", r.json()["detail"])
        self.assertEqual(self.client.get("/api/plan").json()["items"], [])

    def test_put_plan_rejects_non_tuning_items(self):
        r = self.client.put("/api/plan", json={"items": [{"type": "behavior", "key": "late-meal"}]})
        self.assertEqual(r.status_code, 400)
        self.assertIn("unsupported tuning family", r.json()["detail"])

    def test_put_plan_overwrites_previous_draft(self):
        self.client.put("/api/plan", json={"items": [{"type": "basal", "key": 0}]})
        self.client.put("/api/plan", json={"items": [{"type": "isf", "key": 540}]})
        self.assertEqual(self.client.get("/api/plan").json()["items"], [{"type": "isf", "key": 540}])

    def test_apply_with_no_draft_returns_400(self):
        r = self.client.post("/api/plan/apply")
        self.assertEqual(r.status_code, 400)

    def test_applying_twice_in_the_same_second_returns_409_not_500(self):
        from unittest.mock import patch

        # Freeze the clock so two applies collide on plan_history's
        # applied_at primary key (e.g. two browser tabs applying at once).
        with patch("ciq_autotune.api.datetime") as mock_dt:
            mock_dt.now.return_value.strftime.return_value = "2026-01-01 00:00:00"

            self.client.put("/api/plan", json={"items": [{"type": "basal", "key": 0}]})
            r = self.client.post("/api/plan/apply")
            self.assertEqual(r.status_code, 200)

            self.client.put("/api/plan", json={"items": [{"type": "basal", "key": 0}]})
            r = self.client.post("/api/plan/apply")
            self.assertEqual(r.status_code, 409)

    def test_apply_snapshots_into_history_and_clears_draft(self):
        items = [{"type": "isf", "key": 540, "value": 32}]
        self.client.put("/api/plan", json={"items": items})

        r = self.client.post("/api/plan/apply")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["items"], items)
        self.assertIsNotNone(r.json()["applied_at"])

        self.assertEqual(self.client.get("/api/plan").json()["items"], [])

        history = self.client.get("/api/plan/history").json()["history"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["items"], items)

    def test_ic_block_provenance_round_trips_through_draft_and_apply_history(self):
        # #581: an annotated I:C block group is preserved unchanged through the
        # HTTP draft save, the HTTP apply, and plan history.
        prov = {
            "block_start_min": 720, "block_end_min": 900,
            "block_member_start_mins": [720, 780],
        }
        items = [
            {"type": "ic", "start_min": 720, "value": 9.5, "ic_block_provenance": prov},
            {"type": "ic", "start_min": 780, "value": 9.5, "ic_block_provenance": prov},
        ]
        r = self.client.put("/api/plan", json={"items": items})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["items"], items)
        self.assertEqual(self.client.get("/api/plan").json()["items"], items)

        r = self.client.post("/api/plan/apply")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["items"], items)

        history = self.client.get("/api/plan/history").json()["history"]
        self.assertEqual(history[0]["items"], items)

    def test_put_plan_rejects_incomplete_ic_block_group(self):
        prov = {
            "block_start_min": 720, "block_end_min": 900,
            "block_member_start_mins": [720, 780],
        }
        items = [{"type": "ic", "start_min": 720, "value": 9.5, "ic_block_provenance": prov}]
        r = self.client.put("/api/plan", json={"items": items})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.get("/api/plan").json()["items"], [])


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

    def test_isf_steps_are_durable_but_not_public_findings_data(self):
        """The shared analyzer adjunct survives both sidecars, not projections."""
        from ciq_autotune.api import create_app
        client = TestClient(create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False))
        self.assertEqual(client.get("/api/analyze", params={"pool": True}).status_code, 200)
        findings = client.get("/api/diagnose/findings")
        self.assertEqual(findings.status_code, 200)
        with sqlite3.connect(sidecar_path(self.tmp.name)) as sidecar:
            payloads = dict(sidecar.execute(
                "SELECT coordinates, payload FROM artifacts WHERE coordinates IN (?, ?)",
                (_canonical(("analyze", 30, False, True)),
                 _canonical(("findings-history-snapshot", 30))),
            ).fetchall())
        self.assertIn("_isf_rest_window_steps",
                      json.loads(payloads[_canonical(("analyze", 30, False, True))]))
        self.assertIn("_isf_rest_window_steps", json.loads(
            payloads[_canonical(("findings-history-snapshot", 30))]
        )["findings"]["analysis"])
        self.assertNotIn("_isf_rest_window_steps", findings.text)

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
        real = api_mod.build_time_of_day
        def blocked(store):
            entered.set()
            self.assertTrue(release.wait(3))
            return real(store)
        with patch.object(api_mod, "build_time_of_day", side_effect=blocked):
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
        real_build = api_mod.build_time_of_day
        builds = []
        crossed = False

        def counting_build(store):
            builds.append(store.input_data_revision())
            return real_build(store)

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

        with patch.object(api_mod, "build_time_of_day", side_effect=counting_build), \
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
            primary.execute(
                "UPDATE input_data_revision SET revision = revision + 1 WHERE id = 1")
        app.state.result_cache.bump()
        entered, release = threading.Event(), threading.Event()
        real = api_mod.build_time_of_day

        def blocked(store):
            entered.set()
            self.assertTrue(release.wait(3))
            return real(store)

        with patch.object(api_mod, "build_time_of_day", side_effect=blocked):
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

    def test_serves_prompt_queue_js_as_javascript(self):
        r = self.client.get("/assets/prompt-queue.js")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("text/javascript"))

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
            self.client.get("/api/backtest", params=window),
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

    def test_finding_case_file_validation_js_is_public_javascript(self):
        r = self.client.get("/assets/finding-case-file-validation.js")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("text/javascript"))

    def test_fetch_requires_token_before_any_pull(self):
        # Wrong token must 401 before the route ever attempts a live fetch.
        self.assertEqual(self.client.post("/api/fetch").status_code, 401)

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

    def test_get_plan_requires_token(self):
        self.assertEqual(self.client.get("/api/plan").status_code, 401)

    def test_put_plan_requires_token(self):
        r = self.client.put("/api/plan", json={"items": []})
        self.assertEqual(r.status_code, 401)

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

    def test_history_events_authenticates_before_query_validation(self):
        path = "/api/diagnose/carb-ratio-history/events"
        self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.client.get(
            path, headers={"Authorization": "Bearer wrong"},
            params={"history_id": "malformed"}).status_code, 401)
        authenticated = self.client.get(
            path, headers={"Authorization": "Bearer s3cret"})
        self.assertEqual(authenticated.status_code, 400)
        self.assertEqual(authenticated.json()["detail"]["code"], "invalid_history_id")

    def test_root_does_not_require_token(self):
        # No login screen (#10): the SPA shell itself must load unauthenticated.
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

    def test_plan_draft_save_does_not_invalidate_cache(self):
        # #427: saving a draft must NOT clear heavy analysis results.
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
            r = self.client.put("/api/plan", json={"items": [{"type": "basal", "note": "x"}]})
            self.assertEqual(r.status_code, 200)
            self.client.get("/api/analyze", params={"window": 30})   # draft save → still a hit
            self.assertEqual(len(calls), 1, "draft save must not clear the cache")

    def test_plan_apply_invalidates_cache(self):
        # #427: applying a Plan still forces recomputation (it writes setting history).
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
            self.client.put("/api/plan", json={"items": [{"type": "isf", "key": 540, "value": 32}]})
            r = self.client.post("/api/plan/apply")
            self.assertEqual(r.status_code, 200)
            self.client.get("/api/analyze", params={"window": 30})   # bumped → recompute
            self.assertEqual(len(calls), 2, "plan apply must clear the cache")

    def test_focus_pin_invalidates_cache(self):
        # #427: the draft-save carve-out is the ONLY one — a Focus pin still clears.
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
            r = self.client.post("/api/focus", json={"lever": "late_bolus"})
            self.assertEqual(r.status_code, 200, r.text)
            self.client.get("/api/analyze", params={"window": 30})   # bumped → recompute
            self.assertEqual(len(calls), 2, "a focus pin must clear the cache")


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class FetchEndpointCacheInvalidationTest(unittest.TestCase):
    """#146: the pull commits window by window, so a fetch that failed part-way
    still leaves rows in the store. What decides invalidation is whether anything
    was committed, not whether the pull returned.

    Observed on the cache's public ``version``: the endpoint's error paths return
    no body to read the invalidation through, and the app is built with
    ``enable_fetch_loop=False``, so nothing else bumps between two readings.
    """

    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed(self.tmp.name)
        self.app = create_app(db_path=self.tmp.name, token=None,
                              enable_fetch_loop=False)

    def tearDown(self):
        self.tmp.close()

    @staticmethod
    def _commits_then_raises(error):
        """A window's upserts land through the real Store, then a later one fails."""
        def pull(store, **kwargs):
            store.upsert_basal([{"seq_num": 987654, "time": "2026-06-04 00:00:00",
                                 "delivery_type": "algorithmDelivery",
                                 "duration_mins": 5, "basal_rate": 0.8,
                                 "profile_basal_rate": 0.6}])
            raise error
        return pull

    def _post_fetch(self, side_effect, *, raise_server_exceptions=False):
        """POST /api/fetch with the pull replaced; returns (response, version delta)."""
        client = TestClient(self.app, raise_server_exceptions=raise_server_exceptions)
        before = self.app.state.result_cache.version
        with patch("ciq_autotune.sync.pull_from_tconnect", side_effect=side_effect):
            r = client.post("/api/fetch")
        return r, self.app.state.result_cache.version - before

    def _partial(self):
        from ciq_autotune.sync import PartialFetchError
        return PartialFetchError(RuntimeError("network blip"),
                                 written={"basal_events": 1},
                                 windows_completed=2, windows_total=5,
                                 failed_window=("2026-02-01", "2026-03-03"))

    def test_partial_fetch_that_committed_invalidates_and_answers_503(self):
        r, bumped = self._post_fetch(self._commits_then_raises(self._partial()))
        self.assertEqual(r.status_code, 503)
        self.assertIn("2 of 5 windows", r.json()["detail"])
        self.assertEqual(bumped, 1)

    def test_partial_fetch_that_committed_nothing_does_not_invalidate(self):
        r, bumped = self._post_fetch(self._partial())
        self.assertEqual(r.status_code, 503)
        self.assertEqual(bumped, 0)

    def test_runtime_error_after_a_committed_write_invalidates(self):
        r, bumped = self._post_fetch(
            self._commits_then_raises(RuntimeError("network blip")))
        self.assertEqual(r.status_code, 503)
        self.assertEqual(bumped, 1)

    def test_runtime_error_that_committed_nothing_does_not_invalidate(self):
        r, bumped = self._post_fetch(RuntimeError("no creds"))
        self.assertEqual(r.status_code, 503)
        self.assertEqual(bumped, 0)

    def test_other_failure_invalidates_but_keeps_propagating(self):
        # An ingest bug (a KeyError out of events_to_rows, a TimezoneNotConfigured)
        # must not start reading as a vendor outage just because the handler now
        # catches everything to invalidate. It still escapes the endpoint.
        before = self.app.state.result_cache.version
        client = TestClient(self.app, raise_server_exceptions=True)
        with patch("ciq_autotune.sync.pull_from_tconnect",
                   side_effect=self._commits_then_raises(KeyError("carbAmount"))):
            with self.assertRaises(KeyError):
                client.post("/api/fetch")
        self.assertEqual(self.app.state.result_cache.version - before, 1)


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
        ("backtest", "ciq_autotune.backtest", "backtest"),
        ("outcomes-trend", "ciq_autotune.outcomes_trend", "summarize_trend"),
        ("scenarios", "ciq_autotune.analyzers.scenario", "build_scenarios"),
        ("exposures", "ciq_autotune.api", "build_exposures"),
        ("explore-time-of-day", "ciq_autotune.api", "build_time_of_day"),
        ("isf-rest-window-evidence", "ciq_autotune.api", "prepare_isf_rest_window_evidence"),
        ("finding-case-file", "ciq_autotune.api", "prepare_finding_cases"),
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
        """Exactly what the browser asks for on the initial Diagnose load."""
        for path, params in (
            ("/api/analyze", {"window": 30, "ignore_changes": False, "pool": False}),
            ("/api/backtest", {"holdout_days": 2}),
            ("/api/outcomes/trend", {"window": 30}),
            ("/api/analyze", {"window": 30, "ignore_changes": False, "pool": True}),
            ("/api/scenarios", {"window": 30}),
            ("/api/explore/time-of-day", {}),
            ("/api/explore/exposures", {}),
            ("/api/diagnose/isf-rest-window-evidence", {}),
            ("/api/diagnose/findings", {}),
            ("/api/diagnose/finding-case-file-preparation", {}),
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
            real = api_mod.build_time_of_day

            def blocked(*args, **kwargs):
                entered.set()
                self.assertTrue(release.wait(3))
                return real(*args, **kwargs)

            with patch.object(api_mod, "build_time_of_day", side_effect=blocked):
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
        with patch("ciq_autotune.analyze.datetime") as analysis_datetime, \
             patch.object(api_mod, "analyze", side_effect=lambda *args, **kwargs:
                          builds.append(1) or real(*args, **kwargs)):
            analysis_datetime.now.return_value = datetime(2026, 6, 30, 12, 0)
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
            # Exactly the landing shapes and nothing else — both /api/analyze modes
            # included. Findings consumers share the canonical pooled analysis,
            # scenario report, and exposure feed.
            self.assertEqual(after_warm, {"analyze": 2, "backtest": 1,
                                          "outcomes-trend": 1, "scenarios": 1,
                                          "exposures": 1,
                                          "explore-time-of-day": 1,
                                          "isf-rest-window-evidence": 1,
                                          "finding-case-file": 1})
            expected_keys = (
                ("analyze", 30, False, False), ("backtest", 2),
                ("outcomes-trend", 30), ("explore-time-of-day",),
                ("analyze", 30, False, True), ("scenarios", 30),
                ("exposures",),
                ("isf-rest-window-evidence", 30),
                ("finding-case-file", None, None, None),
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
                self.assertEqual(self.client.get("/api/analyze", params={"window": 90}).status_code, 200)
                self.assertGreater(counts["analyze"], after_warm["analyze"])
                # Day/month drill-downs are unbounded in key space and are never warmed.
                self.assertEqual(self.client.get("/api/day-navigator",
                                                 params={"month": "2026-06"}).status_code, 200)
                self.assertEqual(self.client.get("/api/model-view",
                                                 params={"date": "2026-06-03"}).status_code, 200)

    def test_one_failing_shape_is_contained_and_the_rest_still_warm(self):
        # The witness must be a shape the warm pass reaches *after* the failing one,
        # or containment isn't what's being proved. Backtest warms second, the
        # finding-case preparation last, so a blown-up backtest leaves later
        # shapes to observe.
        import ciq_autotune.backtest as backtest_mod

        def boom(*args, **kwargs):
            raise RuntimeError("backtest blew up")

        with self._counting_builders() as counts:
            with patch.object(backtest_mod, "backtest", boom):
                with self._run_worker():
                    self.assertEqual(counts["backtest"], 0)
                    self.assertEqual(counts["outcomes-trend"], 1)
                    self.assertEqual(counts["analyze"], 2)
                    self.assertEqual(counts["scenarios"], 1)
            self.assertEqual(self.client.get("/api/backtest",
                                             params={"holdout_days": 2}).status_code, 200)
            self.assertEqual(counts["backtest"], 1)


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


if __name__ == "__main__":
    unittest.main()
