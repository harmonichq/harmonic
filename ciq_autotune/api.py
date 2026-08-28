"""FastAPI HTTP surface (the ``api`` extra) — S1.

A thin renderer over the same :class:`~ciq_autotune.result.AnalysisResult` the CLI
prints (ROADMAP §5): ``GET /api/analyze`` returns its JSON, ``POST /api/fetch`` triggers a
live pull. The result schema *is* the contract a frontend builds on, so the API
adds no analysis of its own.

It also serves the frontend SPA (``frontend/index.html``) at ``/`` and its explicit
page paths, alongside the ``/api`` routes on the same port — there is no separate frontend server and
no login screen (#10): the SPA shell itself loads unauthenticated, then makes
bearer-token-gated API calls.

Single-user posture (ROADMAP S1): bind localhost and gate on one static bearer
token from ``HARMONIC_API_TOKEN``. If no token is set the API stays open — fine on a
loopback bind, but set a token before exposing it anywhere.

FastAPI is imported lazily inside :func:`create_app`, exactly like the ``sync``
extra in :mod:`~ciq_autotune.sync`, so importing this module never forces the
extra on a core-only install.
"""

from __future__ import annotations

import logging
import re
import sqlite3
import threading
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from . import credentials
from .analyze import analyze
from .analyzers.scenario.levers import Lever
from .config import resolve_runtime_configuration
from .explore_exposures import build_exposures
from .basal_night_evidence import (
    IncompleteBasalNightEvidence,
    UnknownBasalSlot,
    dump_basal_night_evidence,
    prepare_basal_night_evidence,
    rebuild_basal_night_evidence,
)
from .explore_time_of_day import build_time_of_day
from .events import CarbEntry, parse_t
from .model import ModelConfig
from . import findings_projection as findings_projection_module
from .findings_projection import UnknownHistorySelection, prepare_findings_projection
from .finding_case_file import (
    prepare as prepare_finding_cases,
    wrap as wrap_finding_cases,
)
from .ic_history import InvalidIcHistoryId, InvalidIcRunId
from .ic_history_events import (
    HistoryAgedOut,
    HistoryUnavailable,
    UnknownHistoryId,
    UnknownHistoryRunId,
    prepare_ic_history_events,
)
from .ic_block_evidence import UnknownIcBlockId, prepare_ic_block_evidence
from .isf_rest_window_evidence import prepare_isf_rest_window_evidence
from .window_membership import WindowQuery
from .result import SCHEMA_VERSION
from .result_cache import ResultCache
from .derived_artifacts import (
    discard_artifact, dump_findings, dump_ic_history,
    dump_ic_block_evidence, FixedResult, InputRevisionChanged, is_sidecar_rebuilt,
    load_latest_prior, load_or_compute,
    rebuild_findings, rebuild_ic_history,
    rebuild_ic_block_evidence,
)
from .store import Store

logger = logging.getLogger(__name__)

DEFAULT_DB = "tconnect-data/ciq.db"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
RECOMPUTE_PACE_SECONDS = 0.1

_FRONTEND_INDEX = Path(__file__).resolve().parent.parent / "frontend" / "index.html"
SPA_PAGES = ("day", "diagnose", "verify", "plan", "settings", "guide")

# #269 Guide-KB: the authored how-tos live as markdown here, served raw by
# ``/api/kb/{slug}``. ``slug`` is restricted to this charset so a request can
# never escape the directory (no dots, no slashes) into the wider filesystem.
_KB_DIR = Path(__file__).resolve().parent.parent / "docs" / "kb"
_KB_SLUG_RE = re.compile(r"[a-z0-9-]+")


def _latest_instant(store) -> Optional[datetime]:
    """The most recent data instant in ``store`` — the ``now`` trial detection uses
    (mirrors ``summarize_trend``'s default so the pin guard sees the same anchor)."""
    times = ([e.t for e in store.basal_events()]
             + [r.t for r in store.cgm_readings()]
             + [b.t for b in store.bolus_events()])
    return max(times) if times else None


def create_app(db_path: Optional[str] = None, token: Optional[str] = None,
               key_path: Optional[str] = None, enable_fetch_loop: Optional[bool] = None,
               analysis_incarnation: Optional[str] = None):
    """Build the FastAPI app. ``db_path`` / ``token`` default to the
    canonical ``HARMONIC_DB`` / ``HARMONIC_API_TOKEN`` env vars. Their legacy
    ``CIQ_*`` spellings remain deprecated fallbacks. ``key_path`` (the Fernet
    key for encrypted credentials) defaults to ``credentials.DEFAULT_KEY_PATH``.

    ``enable_fetch_loop`` starts the hourly background fetch loop (see
    :mod:`~ciq_autotune.fetch_loop`) for the lifetime of the app; tests building
    an app for request assertions should pass ``False`` to avoid a stray live
    fetch attempt.
    """
    try:
        import asyncio
        import contextlib

        from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request
        from fastapi.responses import FileResponse, JSONResponse
    except ImportError as e:  # pragma: no cover - depends on the optional extra
        raise RuntimeError(
            "The HTTP API needs the 'api' extra: `uv sync --extra api` "
            "(or `pip install harmonic[api]`)."
        ) from e

    configuration = resolve_runtime_configuration(DEFAULT_DB, credentials.DEFAULT_KEY_PATH)
    # ``from __future__ import annotations`` defers local FastAPI imports.  Publish
    # Request for FastAPI's signature resolver so these raw-query routes cannot
    # degrade into a default 422 validation error.
    globals()["Request"] = Request
    db_path = db_path or configuration.db_path
    token = token if token is not None else configuration.api_token
    key_path = key_path or configuration.secret_key_path
    if enable_fetch_loop is None:
        enable_fetch_loop = not configuration.no_fetch

    @contextlib.asynccontextmanager
    async def lifespan(app: "FastAPI"):
        loop = asyncio.get_running_loop()
        event = asyncio.Event()
        app.state.recompute_event = event
        app.state.recompute_loop = loop
        app.state.recompute_task = asyncio.create_task(recompute_worker(event))
        fetch_task = None
        if enable_fetch_loop:
            from .fetch_loop import run_fetch_loop
            fetch_task = asyncio.create_task(
                run_fetch_loop(db_path, key_path=key_path, on_write=signal_recompute))
        try:
            yield
        finally:
            if fetch_task is not None:
                fetch_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await fetch_task
            app.state.recompute_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await app.state.recompute_task

    app = FastAPI(title="Harmonic", version="0.1.0",
                  summary="Local, advisory tuning for Tandem pumps using Control-IQ® technology.",
                  openapi_url="/api/openapi.json", docs_url="/api/docs",
                  redoc_url="/api/redoc",
                  swagger_ui_oauth2_redirect_url="/api/docs/oauth2-redirect",
                  lifespan=lifespan)
    app.state.configuration = configuration

    # One in-process result cache for this app's lifetime (#267). The heavy read
    # endpoints answer from it until a write bumps it; every mutating endpoint and
    # the hourly fetch loop clear it. A per-app instance (not a module singleton)
    # keeps two-DB tests isolated. See ADR 0035.
    cache = ResultCache(incarnation=analysis_incarnation)
    app.state.result_cache = cache
    app.state.finding_case_file_before_commit = None
    fixed_flights: dict[tuple, None] = {}
    fixed_flights_lock = threading.Lock()

    def current_fixed_result(result: FixedResult) -> bool:
        """Validate a fresh envelope while ResultCache holds its publish lock."""
        if result.revision is None or result.input_data_age is not None:
            return False
        with Store.open_queryonly(db_path) as current:
            return current.input_data_revision() == result.revision

    def fixed(key, marker, compute, *, dump=None, rebuild=None, serve_stale=True):
        """Return one exact fixed result, or a labeled exact predecessor in flight."""
        with fixed_flights_lock:
            owner = key not in fixed_flights
            if owner:
                fixed_flights[key] = None
        if serve_stale and not owner and not cache.contains(key):
            prior = load_latest_prior(db_path, key, shape_marker=marker, rebuild=rebuild)
            if prior is not None:
                return prior
        def build():
            return load_or_compute(db_path, key, compute, shape_marker=marker,
                                   dump=dump, rebuild=rebuild, with_age=True)
        try:
            return cache.get_or_compute(key, build, validate=current_fixed_result)
        finally:
            if owner:
                with fixed_flights_lock:
                    fixed_flights.pop(key, None)

    def fixed_in_flight_keys():
        """Expose a stable snapshot of the fixed-shape registry."""
        with fixed_flights_lock:
            return tuple(fixed_flights)

    app.state.fixed_in_flight_keys = fixed_in_flight_keys

    def fixed_response(result: FixedResult, project=lambda value: value):
        """Project a fixed payload once, then atomically attach backend-owned age."""
        payload = project(result.value)
        if result.input_data_age is None:
            return payload
        age = {
            "revision": result.input_data_age.revision,
            "covers_to": result.input_data_age.covers_to,
        }
        if result.input_data_age.newest_covers_to is not None:
            age["newest_covers_to"] = result.input_data_age.newest_covers_to
        return {**payload, "input_data_age": age}

    def canonical_pooled_analysis(window: int, *, serve_stale=True):
        """The shared pooled analysis plus retained ISF step identities."""
        def build(store):
            captured = []
            payload = analyze(
                store, window_days=window, ignore_setting_changes=False,
                pool_agreeing_basal_regimes=True, carb_entries=store.carb_entries(),
                prompt_responses=store.prompt_responses(),
                isf_fasting_evidence_sink=captured.append,
            ).to_dict()
            if len(captured) != 1:
                raise ValueError("ISF analyzer did not retain fasting evidence")
            # The retained rows are an internal fixed-artifact adjunct: only the
            # ISF evidence projection reads them, and /api/analyze strips them.
            # They persist in analyze-v1 and, via dump_findings wholesale under
            # _analysis, in every retained findings-history-v1 revision (about
            # 150–200 KB per real 30-day revision); findings never reads the key.
            payload["_isf_rest_window_steps"] = [
                {"insulin_acted": round(step.insulin_acted, 4),
                 "dbg": round(step.dbg, 2),
                 "window_id": f"rest:{step.cluster.isoformat()}"}
                for step in captured[0].steps
            ]
            return payload
        return fixed(("analyze", window, False, True), "analyze-v1", build,
                     serve_stale=serve_stale)

    def findings_products(window):
        """The canonical payloads every 30-day findings consumer projects from."""
        if window != findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS:
            raise ValueError("findings requires its fixed source window")
        def build_canonical_scenarios(store):
            from .analyzers.scenario import build_scenarios
            return build_scenarios(store, window_days=window).to_dict()
        analysis = canonical_pooled_analysis(window, serve_stale=False).value
        scenarios = fixed(("scenarios", window), "scenarios-v1", build_canonical_scenarios,
                          serve_stale=False).value
        exposures = fixed(
            ("exposures",), "exposures-v1",
            lambda store: build_exposures(store, window_days=window),
            serve_stale=False,
        ).value
        return analysis, exposures, scenarios

    def basal_night_evidence_preparation(window):
        """One fixed analyzer-owned basal roster set per source window."""
        if window != findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS:
            raise ValueError("basal night evidence requires its fixed source window")
        return fixed(
            ("basal-night-evidence", window), "basal-night-evidence-v1",
            lambda store: prepare_basal_night_evidence(findings_products(window)[0]),
            dump=dump_basal_night_evidence, rebuild=rebuild_basal_night_evidence,
            serve_stale=False,
        )

    def recover_sidecar_projection(key, marker, value, project, reload):
        try:
            return fixed_response(value, project) if isinstance(value, FixedResult) else project(value)
        except Exception:
            rebuilt = value.value if isinstance(value, FixedResult) else value
            if not is_sidecar_rebuilt(rebuilt):
                raise
            cache.drop(key)
            discard_artifact(db_path, key, marker)
            replacement = reload()
            return (fixed_response(replacement, project)
                    if isinstance(replacement, FixedResult) else project(replacement))

    def history_snapshot(window: int):
        """One coherent findings + history-evidence preparation per cache version.

        The heavy read is the preparation (the analysis, the exposures feed and the
        scenario report for one findings window); projecting a clock window out of it
        is pure dict work, so the cache key covers the only parameter that changes
        what is read. Like every other heavy read it answers from the cache until a
        write bumps it.
        """
        key = ("findings-history-snapshot", window)
        def compute(store):
            analysis, exposures, scenarios = findings_products(window)
            findings = prepare_findings_projection(
                analysis=analysis, exposures=exposures, scenarios=scenarios,
            )
            return (findings, prepare_ic_history_events(store, findings))
        # Store both reconstructible preparations as one plain tuple payload.
        def dump_pair(pair):
            return {"findings": dump_findings(pair[0]), "events": dump_ic_history(pair[1])}
        def rebuild_pair(value):
            return (rebuild_findings(value["findings"]), rebuild_ic_history(value["events"]))
        def build_snapshot():
            try:
                return load_or_compute(
                    db_path, key, compute, shape_marker="findings-history-v1",
                    dump=dump_pair, rebuild=rebuild_pair, with_age=True)
            except InputRevisionChanged as error:
                raise ResultCache.GenerationChanged(
                    "input data changed during findings snapshot") from error
        generation, result = cache.stable_read(
            key, build_snapshot, validate=current_fixed_result)
        return generation, result.value

    def ic_block_evidence_preparation():
        """One current I:C meal-run preparation per cache generation."""
        key = ("ic-block-evidence-preparation",)
        def compute(store):
            analysis, _exposures, _scenarios = findings_products(
                findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS,
            )
            return prepare_ic_block_evidence(store, analysis)
        try:
            return fixed(key, "ic-block-evidence-v1", compute,
                         dump=dump_ic_block_evidence,
                         rebuild=rebuild_ic_block_evidence,
                         serve_stale=False)
        except InputRevisionChanged as error:
            raise ResultCache.GenerationChanged(
                "input data changed during I:C block evidence preparation") from error

    def ic_block_evidence_snapshot():
        """Publish one current-block preparation with its matching generation."""
        return cache.stable_read(
            ("ic-block-evidence-snapshot",), ic_block_evidence_preparation,
            validate=current_fixed_result,
        )
    def isf_rest_window_evidence_preparation(window: int):
        """One complete fasting-step population for the fixed Diagnose window."""
        key = ("isf-rest-window-evidence", window)
        def compute(store):
            analysis = canonical_pooled_analysis(window, serve_stale=False).value
            return prepare_isf_rest_window_evidence(analysis)
        return fixed(key, "isf-rest-window-evidence-v1", compute, serve_stale=False)

    def _case_error(status, code, message):
        return JSONResponse(
            status_code=status,
            content={"detail": {"code": code, "message": message}},
        )

    def _case_params(request, case=False):
        allowed = (
            {"projection_id", "finding_id", "lever", "alignment", "occ"}
            if case else {"start_min", "end_min", "selected_id", "lever"}
        )
        params = request.query_params
        if any(key not in allowed or len(params.getlist(key)) != 1 for key in params):
            raise ValueError("unknown or repeated query parameter")
        if case:
            pid = params.get("projection_id")
            finding = params.get("finding_id")
            lever = params.get("lever")
            alignment = params.get("alignment")
            occ = params.get("occ")
            valid_findings = {f"finding:{lever.value}" for lever in Lever}
            if (not isinstance(pid, str) or not re.fullmatch(r"fp_[0-9a-f]{32}", pid)
                    or ((finding is None) == (lever is None))
                    or (finding is not None and finding not in valid_findings)
                    or (lever is not None and lever not in {item.value for item in Lever})
                    or alignment not in {"clock", "event"}
                    or (occ is not None and not re.fullmatch(r"[om]_[0-9a-f]{32}", occ))):
                raise ValueError("malformed case-file coordinate")
            return pid, finding, lever, alignment, occ
        start, end = params.get("start_min"), params.get("end_min")
        selected_id = params.get("selected_id")
        lever = params.get("lever")
        if lever is not None and lever not in {item.value for item in Lever}:
            raise ValueError("malformed case-file lever")
        if (start is None) != (end is None):
            raise ValueError("a window needs both start_min and end_min, or neither")
        if start is None:
            return WindowQuery.whole_day(), selected_id, lever
        if not start.isdecimal() or not end.isdecimal():
            raise ValueError("window coordinates must be decimal minutes")
        return WindowQuery.clock(int(start), int(end)), selected_id, lever

    def _prepared_cases(query, selected_id):
        key = ("finding-case-file", query.start_min, query.end_min, selected_id)
        def build(version):
            with Store.open_queryonly(db_path) as store:
                analysis, exposures, scenarios = findings_products(
                    findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS,
                )
                return prepare_finding_cases(
                    store, query=query, version=version, analysis=analysis,
                    exposures=exposures, scenarios=scenarios, selected_id=selected_id,
                    analysis_generation=cache.generation_for_version(version),
                )
        def before_commit():
            hook = app.state.finding_case_file_before_commit
            if hook is not None:
                hook()
        return cache.get_or_build_preparation(
            key, build, before_commit=before_commit,
        )

    def require_token(authorization: str = Header(default="")) -> None:
        if token and authorization != f"Bearer {token}":
            raise HTTPException(status_code=401, detail="missing or invalid bearer token")

    # #94: these file routes carry no `-> FileResponse` return annotation, and
    # must not regain one. Two facts combine: this module's
    # ``from __future__ import annotations`` makes every annotation a string, and
    # ``FileResponse`` is imported inside this function (it belongs to the
    # optional ``api`` extra), so the name is absent from the module globals
    # FastAPI resolves those strings against. The annotation stays an unresolved
    # ForwardRef and building the schema raises PydanticUserError. Neither fact
    # alone does it, and the resolver can be fed by hand — ``globals()["Request"]``
    # above is that escape hatch — so this is a standing choice, not a language
    # rule: omitting the annotation is simply cheaper than publishing a name per
    # file route. That went unnoticed while nothing fetched the generated schema;
    # ADR 94 publishes it at ``/api/openapi.json``, and
    # ``tests/test_frontend_asset_routes.py`` fails the moment it stops
    # answering.
    @app.get("/")
    def index():
        return FileResponse(_FRONTEND_INDEX)

    for _page in SPA_PAGES:
        app.add_api_route(f"/{_page}", index, methods=["GET"])

    # The frontend has no build step and no fingerprinted filenames, and these
    # routes send no Cache-Control — so browsers heuristically cached the ES
    # modules off Last-Modified and a reloaded page kept running week-old code
    # while the server served fresh bytes (observed live: one URL, two bodies —
    # the module map's copy stale, a cache-busted import current). `no-cache`
    # forces revalidation on every load; the payloads are local files on a
    # local port, so the cost is nil and stale UI is the only thing spent.
    @app.middleware("http")
    async def _frontend_no_store(request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path == "/" or path.lstrip("/") in SPA_PAGES or path.startswith("/assets/"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    # Serve the frontend's sibling ES-module / stylesheet assets (#100). These
    # are explicit per-file routes (not a StaticFiles mount) so they can never
    # shadow an API route or the ``/`` index. No token, same as ``index``.
    # Content types are pinned because the module graph fails to load if the
    # browser rejects the .js MIME type.
    _FRONTEND_DIR = _FRONTEND_INDEX.parent

    @app.get("/assets/tab-routing.js")
    def tab_routing_js():
        return FileResponse(_FRONTEND_DIR / "tab-routing.js",
                            media_type="text/javascript")

    @app.get("/assets/scenario-chart.js")
    def scenario_chart_js():
        return FileResponse(_FRONTEND_DIR / "scenario-chart.js",
                            media_type="text/javascript")

    @app.get("/assets/chart-builders.js")
    def chart_builders_js():
        return FileResponse(_FRONTEND_DIR / "chart-builders.js",
                            media_type="text/javascript")

    @app.get("/assets/diagnose-workspaces.js")
    def diagnose_workspaces_js():
        return FileResponse(_FRONTEND_DIR / "diagnose-workspaces.js",
                            media_type="text/javascript")

    @app.get("/assets/diagnose-workstation-chart.js")
    def diagnose_workstation_chart_js():
        return FileResponse(_FRONTEND_DIR / "diagnose-workstation-chart.js",
                            media_type="text/javascript")

    @app.get("/assets/diagnose-workstation.js")
    def diagnose_workstation_js():
        return FileResponse(_FRONTEND_DIR / "diagnose-workstation.js",
                            media_type="text/javascript")

    @app.get("/assets/diagnose-event-comparison.js")
    def diagnose_event_comparison_js():
        return FileResponse(_FRONTEND_DIR / "diagnose-event-comparison.js",
                            media_type="text/javascript")

    @app.get("/assets/diagnose-workstation-data.js")
    def diagnose_workstation_data_js():
        return FileResponse(_FRONTEND_DIR / "diagnose-workstation-data.js",
                            media_type="text/javascript")

    @app.get("/assets/diagnose-evidence-charts.js")
    def diagnose_evidence_charts_js():
        return FileResponse(_FRONTEND_DIR / "diagnose-evidence-charts.js",
                            media_type="text/javascript")

    @app.get("/assets/diagnose-canvas-layout.js")
    def diagnose_canvas_layout_js():
        return FileResponse(_FRONTEND_DIR / "diagnose-canvas-layout.js",
                            media_type="text/javascript")

    @app.get("/assets/diagnose-canvas-state.js")
    def diagnose_canvas_state_js():
        return FileResponse(_FRONTEND_DIR / "diagnose-canvas-state.js",
                            media_type="text/javascript")

    @app.get("/assets/finding-case-file-validation.js")
    def finding_case_file_validation_js():
        return FileResponse(_FRONTEND_DIR / "finding-case-file-validation.js",
                            media_type="text/javascript")

    @app.get("/assets/diagnose-findings-queue.js")
    def diagnose_findings_queue_js():  # #735: the inspector's level 1
        return FileResponse(_FRONTEND_DIR / "diagnose-findings-queue.js",
                            media_type="text/javascript")

    @app.get("/assets/watched-change-dock.js")
    def watched_change_dock_js():  # #735: the inspector's floor
        return FileResponse(_FRONTEND_DIR / "watched-change-dock.js",
                            media_type="text/javascript")

    @app.get("/assets/data.js")
    def data_js():
        return FileResponse(_FRONTEND_DIR / "data.js",
                            media_type="text/javascript")

    @app.get("/assets/diagnose-data-age.js")
    def diagnose_data_age_js():
        return FileResponse(_FRONTEND_DIR / "diagnose-data-age.js",
                            media_type="text/javascript")

    @app.get("/assets/plan.js")
    def plan_js():
        return FileResponse(_FRONTEND_DIR / "plan.js",
                            media_type="text/javascript")

    @app.get("/assets/settling.js")
    def settling_js():
        return FileResponse(_FRONTEND_DIR / "settling.js",
                            media_type="text/javascript")

    @app.get("/assets/carb-log.js")
    def carb_log_js():
        return FileResponse(_FRONTEND_DIR / "carb-log.js",
                            media_type="text/javascript")

    @app.get("/assets/prompt-queue.js")
    def prompt_queue_js():
        return FileResponse(_FRONTEND_DIR / "prompt-queue.js",
                            media_type="text/javascript")

    @app.get("/assets/verify-workstation.js")
    def verify_workstation_js():
        return FileResponse(_FRONTEND_DIR / "verify-workstation.js",
                            media_type="text/javascript")

    @app.get("/assets/verify-workstation-chart.js")
    def verify_workstation_chart_js():
        return FileResponse(_FRONTEND_DIR / "verify-workstation-chart.js",
                            media_type="text/javascript")

    @app.get("/assets/verify-workstation-data.js")
    def verify_workstation_data_js():
        return FileResponse(_FRONTEND_DIR / "verify-workstation-data.js",
                            media_type="text/javascript")

    @app.get("/assets/verify-trial.js")
    def verify_trial_js():
        return FileResponse(_FRONTEND_DIR / "verify-trial.js",
                            media_type="text/javascript")

    @app.get("/assets/daily-nav.js")
    def daily_nav_js():
        return FileResponse(_FRONTEND_DIR / "daily-nav.js",
                            media_type="text/javascript")

    @app.get("/assets/guide.js")
    def guide_js():
        return FileResponse(_FRONTEND_DIR / "guide.js",
                            media_type="text/javascript")

    @app.get("/assets/kb.js")
    def kb_js():  # #269: Guide-KB shell + markdown render (vue-free)
        return FileResponse(_FRONTEND_DIR / "kb.js",
                            media_type="text/javascript")

    @app.get("/assets/model-view-log.js")
    def model_view_log_js():
        return FileResponse(_FRONTEND_DIR / "model-view-log.js",
                            media_type="text/javascript")

    @app.get("/assets/serial-gate.js")
    def serial_gate_js():
        return FileResponse(_FRONTEND_DIR / "serial-gate.js",
                            media_type="text/javascript")

    @app.get("/assets/day-chart.js")
    def day_chart_js():
        return FileResponse(_FRONTEND_DIR / "day-chart.js",
                            media_type="text/javascript")

    @app.get("/assets/day-hero-chart.js")
    def day_hero_chart_js():  # #332: mobile glucose-hero Day chart
        return FileResponse(_FRONTEND_DIR / "day-hero-chart.js",
                            media_type="text/javascript")

    @app.get("/assets/day-dose-focus.js")
    def day_dose_focus_js():  # #385: Day-chart insulin-lane dose-focus core
        return FileResponse(_FRONTEND_DIR / "day-dose-focus.js",
                            media_type="text/javascript")

    @app.get("/assets/nav-chart.js")
    def nav_chart_js():
        return FileResponse(_FRONTEND_DIR / "nav-chart.js",
                            media_type="text/javascript")

    @app.get("/assets/scenario.css")
    def scenario_css():
        return FileResponse(_FRONTEND_DIR / "scenario.css",
                            media_type="text/css")

    @app.get("/assets/shell.css")
    def shell_css():
        return FileResponse(_FRONTEND_DIR / "shell.css",
                            media_type="text/css")

    @app.get("/assets/diagnose-workstation.css")
    def diagnose_workstation_css():
        return FileResponse(_FRONTEND_DIR / "diagnose-workstation.css",
                            media_type="text/css")

    @app.get("/assets/diagnose-event-comparison.css")
    def diagnose_event_comparison_css():
        return FileResponse(_FRONTEND_DIR / "diagnose-event-comparison.css",
                            media_type="text/css")

    @app.get("/assets/verify-workstation.css")
    def verify_workstation_css():
        return FileResponse(_FRONTEND_DIR / "verify-workstation.css",
                            media_type="text/css")

    @app.get("/assets/theme.css")
    def theme_css():
        """The Harmonic theme's role rules (#736) — served last, loaded last."""
        return FileResponse(_FRONTEND_DIR / "theme.css",
                            media_type="text/css")

    @app.get("/assets/favicon.svg")
    def favicon_svg():
        return FileResponse(_FRONTEND_DIR / "favicon.svg",
                            media_type="image/svg+xml")

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok", "schema_version": SCHEMA_VERSION}

    @app.get("/api/analyze")
    def analyze_endpoint(window: int = 30, ignore_changes: bool = False,
                         pool: bool = False,
                         _: None = Depends(require_token)) -> dict:
        # ``pool`` (#85 / #246) pools a changed basal slot's pre-edit nights back into
        # its estimate *only when they agree* with post-edit data, recovering full-window
        # power for edits that merely matched need. The Diagnose queue (#246) renders in
        # this live+pooling mode so a lever ranks low only when a change is genuinely
        # settled, not merely because the profile was touched recently (ADR 0032).
        def compute() -> dict:
            with Store.open(db_path) as store:
                return analyze(store, window_days=window,
                               ignore_setting_changes=ignore_changes,
                               pool_agreeing_basal_regimes=pool,
                               carb_entries=store.carb_entries(),
                               prompt_responses=store.prompt_responses()).to_dict()

        key = ("analyze", window, ignore_changes, pool)
        if window == 30 and not ignore_changes:
            if pool:
                return fixed_response(
                    canonical_pooled_analysis(window),
                    lambda value: {key: item for key, item in value.items()
                                   if key != "_isf_rest_window_steps"},
                )
            return fixed_response(fixed(key, "analyze-v1", lambda store: analyze(
                store, window_days=window, ignore_setting_changes=ignore_changes,
                pool_agreeing_basal_regimes=pool, carb_entries=store.carb_entries(),
                prompt_responses=store.prompt_responses()).to_dict()))
        return cache.get_or_compute(key, compute)

    @app.get("/api/scenarios")
    def scenarios_endpoint(window: int = 30, _: None = Depends(require_token)) -> dict:
        """The ranked, episode-level scenario payload (#70): patterns faced by a
        hero episode, each scored with #58 Confidence, plus the referenced episodes
        with their step-through windows. Replaces the old aggregate-Finding
        behavioral cards; #64 renders it."""
        from .analyzers.scenario import build_scenarios

        def compute() -> dict:
            with Store.open(db_path) as store:
                return build_scenarios(store, window_days=window).to_dict()

        key = ("scenarios", window)
        return (fixed_response(fixed(key, "scenarios-v1", lambda store: build_scenarios(store, window_days=window).to_dict()))
                if window == 30 else cache.get_or_compute(key, compute))

    @app.get("/api/model-view")
    def model_view_endpoint(date: str, _: None = Depends(require_token)) -> dict:
        """The per-day model-view (#152 / ADR 0019): every anchor the engine saw on
        ``date`` (YYYY-MM-DD) and, for each, every classifier's verdict + its state
        (fired / outranked / near-miss / clean / no-data) — the debug/introspection
        feed that surfaces buried near-misses the coaching path collapses. A separate
        per-day GET, not a flag on ``/api/scenarios`` (different question, different shape)."""
        from .analyzers.scenario import build_model_view
        try:
            target = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

        def compute() -> dict:
            with Store.open(db_path) as store:
                return build_model_view(store, target)

        return cache.get_or_compute(("model-view", date), compute)

    @app.get("/api/day-navigator")
    def day_navigator_endpoint(month: Optional[str] = None,
                               _: None = Depends(require_token)) -> dict:
        """The Day surface's navigator feed (#248 / ADR 0030): per-day glycemic
        severity (lows / highs / TIR) + a downsampled glucose sparkline curve for
        every day in the calendar ``month`` (``YYYY-MM``, ± a week of pad so the
        Sun–Sat week ribbon and grid edges are covered). ``month`` defaults to the
        month of the latest day with data. The frontend applies the severity tint."""
        from .day_navigator import build_day_navigator

        def compute() -> dict:
            with Store.open(db_path) as store:
                resolved = month
                if resolved is None:
                    latest = _latest_instant(store)
                    resolved = latest.strftime("%Y-%m") if latest else datetime.now().strftime("%Y-%m")
                try:
                    datetime.strptime(resolved, "%Y-%m")
                except ValueError:
                    raise HTTPException(status_code=400, detail="month must be YYYY-MM")
                return build_day_navigator(store, resolved)

        # Keyed on the raw ``month`` param (``None`` included) — a write bumps the
        # cache, so a default-month resolution can never go stale within a version.
        return cache.get_or_compute(("day-navigator", month), compute)

    @app.get("/api/outcomes")
    def outcomes_endpoint(window: int = 14, _: None = Depends(require_token)) -> dict:
        """The outcome summary (#113): the 2019 consensus / AGP glycemic panel plus
        the derived per-exposure clean rates (ADR 0007), over one flat user-selected
        window (14 default; 30/90 via ``window``). A second versioned result, its own
        renderer — not a field on the AnalysisResult."""
        from .outcomes import summarize_outcomes

        def compute() -> dict:
            with Store.open(db_path) as store:
                return summarize_outcomes(store, window_days=window).to_dict()

        return cache.get_or_compute(("outcomes", window), compute)

    @app.get("/api/outcomes/trend")
    def outcomes_trend_endpoint(window: int = 14, _: None = Depends(require_token)) -> dict:
        """The Outcomes trend (#131): a behavioral + glycemic scorecard across rolling
        ``window``-day windows (oldest→newest, index-aligned), each behavior and metric
        emitting a series so the frontend can show movement. Behaviors use the fixed
        current-profile ISF and each meal's Dose-stamped I:C across all windows. A third
        versioned result, standalone like ``/api/outcomes`` — not a field on the
        AnalysisResult."""
        from .outcomes_trend import summarize_trend

        def compute() -> dict:
            with Store.open(db_path) as store:
                return summarize_trend(store, window_days=window).to_dict()

        key = ("outcomes-trend", window)
        return fixed_response(fixed(key, "outcomes-trend-v1", lambda store: summarize_trend(store, window_days=window).to_dict()))

    @app.get("/api/verify/trials")
    def verify_trials_endpoint(selected: Optional[str] = None,
                               _: None = Depends(require_token)) -> dict:
        """The bounded, side-effect-free Trial roster for Verify (ADR 579).

        The Trial's maturing window and watch horizon are fixed backend facts
        owned by the watched-change module (#18) — no caller window exists here.

        Answers from the ResultCache since #660: a selected Trial's detail now
        carries the paired per-period envelopes, which bin every CGM reading in
        both windows, so the workstation's three detail requests are as heavy as
        the other cached reads. An unknown id raises out of ``compute`` and is
        never cached.
        """
        from .watched_change import review_trials

        def compute() -> dict:
            with Store.open(db_path) as store:
                now = _latest_instant(store) or datetime.now()
                return review_trials(store, now=now, selected=selected)

        try:
            return cache.get_or_compute(("verify-trials", selected), compute)
        except KeyError:
            raise HTTPException(status_code=404, detail="unknown or expired Trial")

    @app.get("/api/explore/time-of-day")
    def explore_time_of_day_endpoint(_: None = Depends(require_token)) -> dict:
        """The fixed 30-day, time-of-day evidence feed for Explore (#578)."""
        def compute() -> dict:
            with Store.open(db_path) as store:
                return build_time_of_day(store)

        return fixed_response(fixed(("explore-time-of-day",), "time-of-day-v1",
                                    lambda store: build_time_of_day(store)))

    @app.get("/api/explore/exposures")
    def explore_exposures_endpoint(_: None = Depends(require_token)) -> dict:
        """The recent anchor-level exposure feed for Diagnose (#654)."""
        return fixed_response(fixed(
            ("exposures",), "exposures-v1",
            lambda store: build_exposures(
                store, window_days=findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS),
        ))

    @app.get("/api/diagnose/findings")
    def diagnose_findings_endpoint(
        start_min: Optional[int] = None, end_min: Optional[int] = None,
        window: int = findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS,
        selected_id: Optional[str] = None,
        _: None = Depends(require_token),
    ) -> dict:
        """The Diagnose findings queue for one clock window (#730).

        Omit both bounds for the global (24 h) queue; send both for a preset or a
        drawn brace. Everything the queue shows — register, merged spans, outcome
        anchoring, window-local denominators, order — is decided behind
        :meth:`FindingsProjection.project`; this route only picks the window.
        """
        if (start_min is None) != (end_min is None):
            raise HTTPException(
                status_code=400,
                detail="a window needs both start_min and end_min, or neither",
            )
        try:
            query = (WindowQuery.whole_day() if start_min is None
                     else WindowQuery.clock(start_min, end_min))
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        try:
            generation, snapshot = history_snapshot(window)
            return recover_sidecar_projection(
                ("findings-history-snapshot", window), "findings-history-v1", snapshot,
                lambda pair: pair[0].project(query, selected_id, analysis_generation=generation),
                lambda: history_snapshot(window)[1])
        except InvalidIcHistoryId as error:
            raise HTTPException(status_code=400, detail={
                "code": "invalid_history_id", "message": str(error)}) from error
        except UnknownHistorySelection as error:
            raise HTTPException(status_code=404, detail={
                "code": "history_not_found",
                "message": "Past-setting evidence was not found.",
            }) from error
        except ResultCache.GenerationChanged as error:
            raise HTTPException(status_code=409, detail={
                "code": "analysis_generation_mismatch",
                "message": "Evidence changed. Refresh findings.",
            }) from error

    @app.get("/api/diagnose/carb-ratio-block-evidence")
    def diagnose_ic_block_evidence_endpoint(
        block_id: Optional[str] = None,
        analysis_generation: Optional[str] = None,
        _: None = Depends(require_token),
    ) -> dict:
        """Exact current-block meal-run roster and analyzer-bounded CGM series."""
        if block_id is None or not block_id.isdecimal():
            raise HTTPException(status_code=400, detail={
                "code": "invalid_block_id", "message": "block_id must be a decimal minute"})
        if analysis_generation is None:
            raise HTTPException(status_code=400, detail={
                "code": "analysis_generation_required",
                "message": "analysis_generation is required"})
        try:
            generation, result = ic_block_evidence_snapshot()
            if analysis_generation != generation:
                raise HTTPException(status_code=409, detail={
                    "code": "analysis_generation_mismatch",
                    "message": "Evidence changed. Refresh findings.",
                })
            return fixed_response(result, lambda prepared: prepared.project(
                int(block_id), analysis_generation=generation,
            ))
        except UnknownIcBlockId as error:
            raise HTTPException(status_code=404, detail={
                "code": "block_not_found", "message": "Current I:C block was not found.",
            }) from error
        except ResultCache.GenerationChanged as error:
            raise HTTPException(status_code=409, detail={
                "code": "analysis_generation_mismatch",
                "message": "Evidence changed. Refresh findings.",
            }) from error
    @app.get("/api/diagnose/basal-night-evidence")
    def diagnose_basal_night_evidence_endpoint(
        slot: Optional[int] = None,
        window: int = findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS,
        _: None = Depends(require_token),
    ) -> dict:
        """Analyzer-owned nightly delivered-versus-programmed basal evidence."""
        n_slots = 24 * 60 // ModelConfig().slot_minutes
        if slot is None or not 0 <= slot < n_slots:
            raise HTTPException(status_code=400, detail="slot must name a basal clock slot")
        if window != findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS:
            raise HTTPException(status_code=400, detail=(
                "basal night evidence requires its fixed source window"))
        try:
            result = basal_night_evidence_preparation(window)
            return recover_sidecar_projection(
                ("basal-night-evidence", window), "basal-night-evidence-v1", result,
                lambda prepared: prepared.project(
                    slot, analysis_generation=cache.generation),
                lambda: basal_night_evidence_preparation(window),
            )
        except UnknownBasalSlot as error:
            raise HTTPException(status_code=404, detail="basal slot was not found") from error
        except IncompleteBasalNightEvidence as error:
            raise HTTPException(status_code=500, detail="basal night evidence is incomplete") from error

    @app.get("/api/diagnose/carb-ratio-history/events")
    def diagnose_ic_history_events_endpoint(
        history_id: Optional[str] = None,
        analysis_generation: Optional[str] = None,
        selected_run_id: Optional[str] = None,
        _: None = Depends(require_token),
    ) -> dict:
        """Exact 90-day event evidence for one active history catalog identity."""
        if history_id is None:
            raise HTTPException(status_code=400, detail={
                "code": "invalid_history_id", "message": "history_id is required"})
        if analysis_generation is None:
            raise HTTPException(status_code=400, detail={
                "code": "analysis_generation_required",
                "message": "analysis_generation is required"})
        try:
            generation, snapshot = history_snapshot(30)
            if analysis_generation != generation:
                raise HTTPException(status_code=409, detail={
                    "code": "analysis_generation_mismatch",
                    "message": "Evidence changed. Refresh findings.",
                })
            return recover_sidecar_projection(
                ("findings-history-snapshot", 30), "findings-history-v1", snapshot,
                lambda pair: pair[1].project(history_id, selected_run_id,
                                             analysis_generation=generation),
                lambda: history_snapshot(30)[1])
        except (InvalidIcHistoryId, InvalidIcRunId) as error:
            code = ("invalid_history_id" if isinstance(error, InvalidIcHistoryId)
                    else "invalid_history_run_id")
            raise HTTPException(status_code=400, detail={
                "code": code, "message": str(error)}) from error
        except UnknownHistoryId as error:
            raise HTTPException(status_code=404, detail={
                "code": "history_not_found",
                "message": "Past-setting evidence was not found.",
            }) from error
        except UnknownHistoryRunId as error:
            raise HTTPException(status_code=404, detail={
                "code": "history_run_not_found",
                "message": "Meal-run evidence is not a member of this history item.",
            }) from error
        except HistoryAgedOut as error:
            raise HTTPException(status_code=410, detail={
                "code": "history_aged_out",
                "message": "Past-setting evidence aged out of the 90-day window.",
            }) from error
        except HistoryUnavailable as error:
            raise HTTPException(status_code=410, detail={
                "code": "history_unavailable",
                "message": (
                    "Past-setting evidence no longer maps to one current program block."
                ),
            }) from error
        except ResultCache.GenerationChanged as error:
            raise HTTPException(status_code=409, detail={
                "code": "analysis_generation_mismatch",
                "message": "Evidence changed. Refresh findings.",
            }) from error

    @app.get("/api/diagnose/isf-rest-window-evidence")
    def diagnose_isf_rest_window_evidence_endpoint(
        window: int = findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS,
        _: None = Depends(require_token),
    ) -> dict:
        """Analyzer-owned rest windows and complete qualifying fasting steps."""
        if window != findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS:
            raise HTTPException(status_code=400, detail=(
                "ISF rest-window evidence requires the fixed "
                f"{findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS}-day window"))
        return fixed_response(
            isf_rest_window_evidence_preparation(window), lambda preparation: preparation.project())

    @app.get("/api/diagnose/finding-case-file-preparation")
    def finding_case_file_preparation(request: Request, _: None = Depends(require_token)):
        try:
            query, selected_id, _lever = _case_params(request)
        except ValueError as error:
            return _case_error(400, "invalid_request", str(error))
        try:
            prepared, reason = _prepared_cases(query, selected_id)
            if reason == "capacity":
                return _case_error(503, "preparation_capacity", "All preparations are leased.")
            if reason == "changed":
                return _case_error(503, "preparation_changed", "Data changed during preparation.")
            return wrap_finding_cases(prepared)
        except InvalidIcHistoryId as error:
            return _case_error(400, "invalid_history_id", str(error))
        except UnknownHistorySelection:
            return _case_error(404, "history_not_found", "Past-setting evidence was not found.")
        except Exception:
            logger.exception("Finding case-file preparation was inconsistent")
            return _case_error(500, "inconsistent_projection", "Case population is inconsistent.")

    @app.get("/api/diagnose/finding-case-file")
    def finding_case_file(request: Request, _: None = Depends(require_token)):
        try:
            projection_id, finding_id, lever, alignment, occ = _case_params(request, True)
        except ValueError as error:
            return _case_error(400, "invalid_request", str(error))
        prepared = cache.acquire_preparation(projection_id)
        if prepared is None:
            return _case_error(409, "stale_projection", "Preparation is unavailable.")
        try:
            result = prepared.case(finding_id, alignment, occ,
                                   lever=Lever(lever) if lever is not None else None)
            if result is None:
                return _case_error(
                    404, "finding_unavailable", "Finding has no inspectable member."
                )
            # JSONResponse renders ``body`` in its constructor, while the pin is held.
            response = JSONResponse(result)
            return response
        except Exception:
            logger.exception("Finding case-file projection was inconsistent")
            return _case_error(500, "inconsistent_projection", "Case population is inconsistent.")
        finally:
            cache.release_preparation(prepared)

    @app.get("/api/audit/dismissals")
    def audit_dismissals_endpoint(_: None = Depends(require_token)) -> dict:
        with Store.open(db_path) as store:
            return {"dismissals": store.audit_dismissals()}

    @app.post("/api/audit/dismissals")
    def dismiss_audit_item_endpoint(payload: dict = Body(...),
                                    _: None = Depends(require_token)) -> dict:
        item_id = payload.get("item_id")
        fingerprint = payload.get("evidence_fingerprint")
        if (not isinstance(item_id, str) or not re.fullmatch(r"[a-z0-9:_-]{1,160}", item_id)
                or not isinstance(fingerprint, str) or not fingerprint
                or len(fingerprint) > 250_000):
            raise HTTPException(
                status_code=400,
                detail="item_id and evidence_fingerprint are required",
            )
        try:
            with Store.open(db_path) as store:
                store.dismiss_audit_item(item_id, fingerprint)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        cache.bump()  # dismissal changes the Audit read (#586)
        return {"item_id": item_id, "evidence_fingerprint": fingerprint}

    @app.get("/api/pattern-sweep")
    def pattern_sweep_endpoint(_: None = Depends(require_token)) -> dict:
        """The pattern-sweep payload (#378): every generated candidate cell priced
        through one gate, the tracked-candidate set, and the ready-for-review queue.
        The only always-on user-facing string is the ``footnote``; a cleared cell ships
        as a card only after a human approves it below. Answers from the cache like the
        other heavy reads."""
        from .pattern_sweep import sweep_from_store

        def compute() -> dict:
            with Store.open(db_path) as store:
                return sweep_from_store(store)

        return cache.get_or_compute(("pattern-sweep",), compute)

    def _record_pattern_decision(payload: dict, decision: str) -> dict:
        from .pattern_sweep import sweep_from_store
        cell_id = payload.get("cell_id")
        if not cell_id:
            raise HTTPException(status_code=400, detail="cell_id is required")
        with Store.open(db_path) as store:
            # Sign-off only ever binds a cell that is *currently* awaiting review this
            # era. A tracked, killed, or unknown cell can't be pre-approved or
            # pre-dismissed — that would let a decision bypass the queue and later ship
            # (or bury) a card when the evidence changes. Deriving the era and the queue
            # from the same run the reader sees keeps the check honest.
            payload_now = sweep_from_store(store)
            if cell_id not in payload_now["ready_for_review"]:
                raise HTTPException(
                    status_code=409,
                    detail="cell is not currently ready for review")
            era_str = payload_now["era_start"] or ""
            store.record_pattern_review(cell_id=cell_id, era_start=era_str,
                                        decision=decision)
        cache.bump()  # a sign-off changes the ready-for-review queue (#267)
        return {"cell_id": cell_id, "era_start": era_str, "decision": decision}

    @app.post("/api/pattern-sweep/approve")
    def approve_pattern_endpoint(payload: dict = Body(...),
                                 _: None = Depends(require_token)) -> dict:
        """Sign off a cleared cell so it may ship as a card. Scoped to the current era."""
        return _record_pattern_decision(payload, "approved")

    @app.post("/api/pattern-sweep/dismiss")
    def dismiss_pattern_endpoint(payload: dict = Body(...),
                                 _: None = Depends(require_token)) -> dict:
        """Dismiss a cleared cell so it never ships this era."""
        return _record_pattern_decision(payload, "dismissed")

    @app.get("/api/catalog")
    def catalog_endpoint(_: None = Depends(require_token)) -> dict:
        """The #157 Guide / About payload: the type-level lever catalog (generated
        from ``levers._META``), the closed ``SilenceReason`` taxonomy (ADR 0009),
        the evidence tiers, the Anchor→Episode→Lever→Pattern pipeline, and one
        worked example. Static and DB-free — no analysis, no PHI — so it's a cheap
        lazy GET the Guide tab fetches on open."""
        from .analyzers.scenario import build_catalog
        return cache.get_or_compute(("catalog",), build_catalog)

    @app.get("/api/kb/{slug}")
    def kb_article_endpoint(slug: str, _: None = Depends(require_token)):
        """The #269 Guide-KB authored how-tos: the raw markdown of one article
        from ``docs/kb/<slug>.md``. The API stays dumb — it serves the markdown
        verbatim and the frontend renders it (``kb.js``); the generated "engine
        concepts" articles keep coming from ``/api/catalog`` so they can't drift
        from the taxonomy. PHI-free teaching copy, so it's a cheap lazy GET the
        article pane fetches on open. ``slug`` is restricted to ``[a-z0-9-]`` so
        it can't escape the KB directory."""
        from fastapi.responses import PlainTextResponse
        if not _KB_SLUG_RE.fullmatch(slug):
            raise HTTPException(status_code=404, detail="unknown article")
        path = _KB_DIR / f"{slug}.md"
        if not path.is_file():
            raise HTTPException(status_code=404, detail="unknown article")
        return PlainTextResponse(path.read_text(encoding="utf-8"),
                                 media_type="text/markdown")

    @app.post("/api/fetch")
    def fetch_endpoint(days: int = 120, _: None = Depends(require_token)) -> dict:
        from . import sync as sync_mod
        end = date.today()
        start = end - timedelta(days=days)
        with Store.open(db_path) as store:
            # The pull commits window by window, so a fetch that failed part-way
            # still leaves rows behind. Invalidate on what was committed — read
            # off the store's durable revision — rather than on whether the pull
            # returned (#146). A partial fetch is not a RuntimeError, so it used
            # to escape this handler entirely: it skipped the bump AND surfaced
            # as an unhandled 500. It now joins RuntimeError at 503, carrying how
            # far the pull got; every other failure keeps propagating as itself.
            baseline = store.input_data_revision()
            try:
                written = sync_mod.pull_from_tconnect(store, start=start, end=end,
                                                       key_path=key_path)
            except Exception as e:
                if store.input_data_revision() > baseline:
                    cache.bump()
                if isinstance(e, (RuntimeError, sync_mod.PartialFetchError)):
                    raise HTTPException(status_code=503, detail=str(e))
                raise
        cache.bump()  # a manual fetch is an out-of-loop write path (#267)
        return {"pulled": written, "window": {"start": str(start), "end": str(end)}}

    @app.get("/api/credentials")
    def get_credentials_endpoint(_: None = Depends(require_token)) -> dict:
        with Store.open(db_path) as store:
            creds = credentials.load_credentials(store, key_path=key_path)
        if creds is None:
            return {"configured": False, "email": None, "region": None}
        return {"configured": True, "email": creds.email, "region": creds.region}

    @app.post("/api/credentials")
    def set_credentials_endpoint(
        email: str = Body(...), password: str = Body(...), region: str = Body("US"),
        _: None = Depends(require_token),
    ) -> dict:
        with Store.open(db_path) as store:
            credentials.save_credentials(store, email, password, region, key_path=key_path)
        cache.bump()  # (#267)
        return {"configured": True}

    @app.get("/api/status")
    def status_endpoint(_: None = Depends(require_token)) -> dict:
        with Store.open(db_path) as store:
            status = store.fetch_status()
            earliest_day, latest_day = store.cgm_day_bounds()
        base = status or {"last_attempt_at": None, "last_success_at": None,
                          "last_error": None, "last_written": None}
        return {**base, "earliest_data_day": earliest_day, "latest_data_day": latest_day}

    @app.get("/api/pump-settings")
    def pump_settings_endpoint(_: None = Depends(require_token)) -> dict:
        with Store.open(db_path) as store:
            snaps = store.settings_snapshots()
        if not snaps:
            return {"configured": False}
        latest = snaps[-1]
        settings = latest.settings
        active = settings.active()
        if active is None:
            return {"configured": False}
        return {
            "configured": True,
            # #99: the capture time of this snapshot — Plan's Confirmation-B
            # shows "✓ on pump as of <fetch>" against it.
            "fetched_at": (
                latest.captured_at.isoformat()
                if hasattr(latest.captured_at, "isoformat")
                else str(latest.captured_at)
            ),
            "active_idp": settings.active_idp,
            "profile": {
                "idp": active.idp,
                "name": active.name,
                "dia_hours": active.dia_hours,
                "max_bolus": active.max_bolus,
                "carb_entry": active.carb_entry,
                "segments": [
                    {"start_min": s.start_min, "basal_rate": s.basal_rate,
                     "isf": s.isf, "carb_ratio": s.carb_ratio, "target_bg": s.target_bg}
                    for s in active.segments
                ],
            },
            "other_profile_count": len(settings.profiles) - 1,
        }

    @app.get("/api/timeline")
    def timeline_endpoint(start: datetime, end: datetime,
                          _: None = Depends(require_token)) -> dict:
        from .timeline import timeline as build_timeline
        with Store.open(db_path) as store:
            return build_timeline(store, start, end)

    # --- manual carb log (#126) --------------------------------------------
    # Plain CRUD onto carb_entries (the #125 store). Entries are captured and
    # rendered (as chart markers) before any analyzer consumes them — this slice
    # ships standalone. Everything from the quick-log sheet is source='manual'.

    def _carb_entry_from_payload(payload: dict) -> CarbEntry:
        """Validate an incoming carb payload into a :class:`CarbEntry`.

        The dataclass enforces the invariants (certainty/source vocab, and
        grams-null only when certainty='unknown'); a bad payload surfaces as a
        400, not a 500."""
        try:
            t = parse_t(payload["t"]) if isinstance(payload.get("t"), str) else payload["t"]
            created = payload.get("created_at")
            if isinstance(created, str):
                created = parse_t(created)
            grams = payload.get("grams")
            return CarbEntry(
                t=t,
                grams=None if grams is None else float(grams),
                certainty=payload["certainty"],
                source=payload.get("source", "manual"),
                note=payload.get("note"),
                created_at=created,
            )
        except (KeyError, TypeError, ValueError) as e:
            raise HTTPException(status_code=400, detail=f"invalid carb entry: {e}")

    @app.get("/api/carbs")
    def list_carbs_endpoint(start: Optional[datetime] = None,
                            end: Optional[datetime] = None,
                            _: None = Depends(require_token)) -> dict:
        fmt = "%Y-%m-%d %H:%M:%S"
        s = start.replace(tzinfo=None).strftime(fmt) if start else None
        e = end.replace(tzinfo=None).strftime(fmt) if end else None
        with Store.open(db_path) as store:
            return {"carb_entries": store.list_carb_entries(s, e)}

    @app.post("/api/carbs")
    def create_carb_endpoint(payload: dict = Body(...),
                             _: None = Depends(require_token)) -> dict:
        entry = _carb_entry_from_payload(payload)
        with Store.open(db_path) as store:
            new_id = store.upsert_carb_entry(entry)
            result = store.get_carb_entry(new_id)
        cache.bump()  # carb entries feed /api/analyze's fasting-ISF exclusion (#267)
        return result

    @app.patch("/api/carbs/{entry_id}")
    def update_carb_endpoint(entry_id: int, payload: dict = Body(...),
                             _: None = Depends(require_token)) -> dict:
        with Store.open(db_path) as store:
            existing = store.get_carb_entry(entry_id)
            if existing is None:
                raise HTTPException(status_code=404, detail="carb entry not found")
            # PATCH is a partial merge over the stored row (source/created_at are
            # preserved unless explicitly overridden), re-validated as a whole.
            entry = _carb_entry_from_payload({**existing, **payload})
            store.upsert_carb_entry(entry, id=entry_id)
            result = store.get_carb_entry(entry_id)
        cache.bump()  # (#267)
        return result

    @app.delete("/api/carbs/{entry_id}")
    def delete_carb_endpoint(entry_id: int,
                             _: None = Depends(require_token)) -> dict:
        # Deleting a prompt-sourced entry cascades its prompt_responses row away
        # (the #125 store rule) so the sourcing prompt resurrects.
        with Store.open(db_path) as store:
            n = store.delete_carb_entry(entry_id)
        if n == 0:
            raise HTTPException(status_code=404, detail="carb entry not found")
        cache.bump()  # (#267)
        return {"deleted": n}

    # --- carb-log prompt review queue (#128) -------------------------------
    # Prompts are derived LIVE over the last 7 days (no stored prompt rows): the
    # `missed-meal` classifier's matched rises + every sub-70 low, minus anything
    # already answered in prompt_responses. Answering 'carbs' creates the carb
    # entry AND the response row in ONE transaction (never one without the other),
    # so the delete-resurrects invariant holds. No bulk-answer path exists.

    _PROMPT_DETECTORS = ("missed-meal", "low")
    # ``false-low`` (#381) is a low-prompt-only answer: it records that the sub-70
    # excursion was never real (sensor noise / compression low) and invalidates the
    # whole excursion from tuning. Like ``no`` / ``not-sure`` it stores only the
    # answer (no carb entry), so it rides the same non-``carbs`` write path below.
    _PROMPT_ANSWERS = ("carbs", "no", "not-sure", "false-low")

    @app.get("/api/prompts")
    def list_prompts_endpoint(_: None = Depends(require_token)) -> list:
        from .pending_prompts import build_pending_prompts
        with Store.open(db_path) as store:
            prompts = build_pending_prompts(store)
        return [p.to_dict() for p in prompts]

    @app.post("/api/prompts/answer")
    def answer_prompt_endpoint(payload: dict = Body(...),
                               _: None = Depends(require_token)) -> dict:
        from .pending_prompts import SOURCE_BY_DETECTOR
        detector = payload.get("detector")
        answer = payload.get("answer")
        if detector not in _PROMPT_DETECTORS:
            raise HTTPException(status_code=400, detail=f"unknown detector {detector!r}")
        if answer not in _PROMPT_ANSWERS:
            raise HTTPException(status_code=400, detail=f"unknown answer {answer!r}")
        raw_anchor = payload.get("anchor_t")
        if raw_anchor is None:
            raise HTTPException(status_code=400, detail="anchor_t is required")
        anchor_t = parse_t(raw_anchor) if isinstance(raw_anchor, str) else raw_anchor

        with Store.open(db_path) as store:
            # Idempotent per (detector, anchor_t): clear any prior answer first so
            # re-answering (revise) never leaves a duplicate/stale response row.
            store.clear_prompt_response(detector=detector, anchor_t=anchor_t)
            if answer == "carbs":
                # The carbs answer's source and time are server-authoritative: the
                # entry is pinned to the anchor and tagged rise-prompt / low-prompt,
                # regardless of what the #126 sheet echoes back.
                entry_payload = dict(payload.get("entry") or {})
                entry_payload["t"] = anchor_t
                entry_payload["source"] = SOURCE_BY_DETECTOR[detector]
                entry = _carb_entry_from_payload(entry_payload)
                carb_id, resp_id = store.record_carb_entry_with_response(
                    entry, detector=detector, anchor_t=anchor_t, answer="carbs")
                result = {"answer": "carbs", "carb_entry_id": carb_id,
                          "prompt_response_id": resp_id}
            else:
                resp_id = store.record_prompt_response(
                    detector=detector, anchor_t=anchor_t, answer=answer)
                result = {"answer": answer, "prompt_response_id": resp_id}
        cache.bump()  # an answered prompt changes the carb-exclusion set (#267)
        return result

    @app.delete("/api/prompts/answer")
    def clear_prompt_endpoint(payload: dict = Body(...),
                              _: None = Depends(require_token)) -> dict:
        """Clear a prompt's answer so it resurrects (delete-resurrects, #128).

        The inverse of the POST: deletes the ``(detector, anchor_t)`` response —
        cascading its carb entry if the answer was ``carbs`` — so the pin returns to
        open. Not a bulk action: it clears exactly the one prompt named."""
        detector = payload.get("detector")
        if detector not in _PROMPT_DETECTORS:
            raise HTTPException(status_code=400, detail=f"unknown detector {detector!r}")
        raw_anchor = payload.get("anchor_t")
        if raw_anchor is None:
            raise HTTPException(status_code=400, detail="anchor_t is required")
        anchor_t = parse_t(raw_anchor) if isinstance(raw_anchor, str) else raw_anchor
        with Store.open(db_path) as store:
            n = store.clear_prompt_response(detector=detector, anchor_t=anchor_t)
        cache.bump()  # (#267)
        return {"cleared": n}

    @app.get("/api/report")
    def report_endpoint(window: int = 30, ignore_changes: bool = False,
                        _: None = Depends(require_token)) -> dict:
        from .render import render_text
        with Store.open(db_path) as store:
            result = analyze(store, window_days=window,
                             ignore_setting_changes=ignore_changes,
                             carb_entries=store.carb_entries(),
                             prompt_responses=store.prompt_responses())
        return {"text": render_text(result)}

    @app.get("/api/backtest")
    def backtest_endpoint(holdout_days: int = 2,
                          _: None = Depends(require_token)) -> dict:
        """Run the held-out backtest and return a JSON-serialisable result.

        Scores the suggested basal profile (trained on all days except the most
        recent ``holdout_days``) against what Control-IQ actually delivered on
        those held-out days — head-to-head with the current programmed profile.
        """
        from .backtest import backtest as run_backtest

        def compute() -> dict:
            with Store.open(db_path) as store:
                basal = store.basal_events()
                cgm = store.cgm_readings()
                bolus = store.bolus_events()
                pump = store.pump_events()
            bt = run_backtest(basal, cgm, bolus, pump, holdout_days=holdout_days)
            return {
                "holdout_days": bt.holdout_days,
                "train_days": bt.train_days,
                "test_clean_minutes": bt.test_clean_minutes,
                "mae_suggested": bt.mae_suggested,
                "n_suggested": bt.n_suggested,
                "mae_current": bt.mae_current,
                "n_current": bt.n_current,
                "mae_suggested_matched": bt.mae_suggested_matched,
                "mae_current_matched": bt.mae_current_matched,
                "n_matched": bt.n_matched,
                "improvement": bt.improvement,
            }

        key = ("backtest", holdout_days)
        def snapshot_compute(store):
            bt = run_backtest(store.basal_events(), store.cgm_readings(),
                              store.bolus_events(), store.pump_events(), holdout_days=holdout_days)
            return {"holdout_days": bt.holdout_days, "train_days": bt.train_days,
                    "test_clean_minutes": bt.test_clean_minutes, "mae_suggested": bt.mae_suggested,
                    "n_suggested": bt.n_suggested, "mae_current": bt.mae_current,
                    "n_current": bt.n_current, "mae_suggested_matched": bt.mae_suggested_matched,
                    "mae_current_matched": bt.mae_current_matched, "n_matched": bt.n_matched,
                    "improvement": bt.improvement}
        return (fixed_response(fixed(key, "backtest-v1", snapshot_compute)) if holdout_days == 2
                else cache.get_or_compute(key, compute))

    @app.get("/api/plan")
    def get_plan_endpoint(_: None = Depends(require_token)) -> dict:
        with Store.open(db_path) as store:
            draft = store.get_plan_draft()
        return draft or {"items": [], "updated_at": None}

    @app.put("/api/plan")
    def put_plan_endpoint(items: list = Body(..., embed=True),
                          _: None = Depends(require_token)) -> dict:
        updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with Store.open(db_path) as store:
            try:
                store.save_plan_draft(items, updated_at)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
        # No cache.bump(): plan_draft is a UX-only convenience that does not feed
        # any analysis computation — clearing heavy results here is pure waste (#427).
        return {"items": items, "updated_at": updated_at}

    @app.post("/api/plan/apply")
    def apply_plan_endpoint(_: None = Depends(require_token)) -> dict:
        applied_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with Store.open(db_path) as store:
            try:
                result = store.apply_plan(applied_at)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            except sqlite3.IntegrityError:
                # Two applies landed in the same wall-clock second (applied_at
                # is the plan_history primary key) — ask the client to retry.
                raise HTTPException(status_code=409, detail="a plan was just applied, try again")
        cache.bump()  # (#267)
        return result

    @app.get("/api/plan/history")
    def plan_history_endpoint(_: None = Depends(require_token)) -> dict:
        with Store.open(db_path) as store:
            return {"history": store.plan_history()}

    # --- Focus: pin / unpin / list a watched behavioral lever (#244) ----------

    @app.get("/api/focus")
    def list_focus_endpoint(_: None = Depends(require_token)) -> dict:
        """Every Focus ever pinned (active + closed), newest first, plus the pinnable
        universe so the client can offer only behavioral-flavored levers (ADR 0029)."""
        from .watched_change import pinnable_levers
        with Store.open(db_path) as store:
            return {"focuses": store.list_focuses(),
                    "pinnable": sorted(pinnable_levers())}

    @app.post("/api/focus")
    def pin_focus_endpoint(lever: str = Body(..., embed=True),
                           _: None = Depends(require_token)) -> dict:
        """Pin a behavioral lever as the active Focus.

        Enforces the one-active invariant at pin time (ADR 0029): rejected (409) while
        a Trial is live — a pump change is watched as a Trial, not a Focus — or while
        another Focus is already active. A non-behavioral (tuning) lever is a 400.
        """
        from .store import FocusAlreadyActive
        from .watched_change import is_pinnable, trial_is_active
        if not is_pinnable(lever):
            raise HTTPException(status_code=400,
                                detail=f"{lever!r} is not a pinnable behavioral lever")
        pinned_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with Store.open(db_path) as store:
            now = _latest_instant(store) or datetime.now()
            if trial_is_active(store, now=now):
                raise HTTPException(
                    status_code=409,
                    detail="a setting change is under trial — cannot pin a Focus")
            try:
                result = store.pin_focus(lever, pinned_at)
            except FocusAlreadyActive as e:
                raise HTTPException(status_code=409, detail=str(e))
        cache.bump()  # (#267)
        return result

    @app.post("/api/focus/{focus_id}/resolve")
    def resolve_focus_endpoint(focus_id: int,
                               _: None = Depends(require_token)) -> dict:
        """Unpin (resolve) an active Focus. 404 if there is no active Focus by that id."""
        with Store.open(db_path) as store:
            if not store.resolve_focus(focus_id, "resolved"):
                raise HTTPException(status_code=404, detail="no active focus with that id")
        cache.bump()  # (#267)
        return {"id": focus_id, "status": "resolved"}

    def signal_recompute() -> None:
        """Invalidate after a fetch and notify the lifespan-owned worker.

        ``run_fetch_loop`` invokes this from its fetch thread.  It deliberately
        does no compute there: one event coalesces writes while the worker is
        running and the loop remains free to serve requests between shapes.
        """
        cache.bump()
        app.state.recompute_loop.call_soon_threadsafe(app.state.recompute_event.set)

    async def default_recompute_pace() -> None:
        await asyncio.sleep(RECOMPUTE_PACE_SECONDS)

    def warm_roster():
        return (
            ("analyze", lambda: analyze_endpoint(window=30, ignore_changes=False, pool=False)),
            ("backtest", lambda: backtest_endpoint(holdout_days=2)),
            ("outcomes-trend", lambda: outcomes_trend_endpoint(window=30)),
            ("analyze-pooled", lambda: analyze_endpoint(window=30, ignore_changes=False, pool=True)),
            ("scenarios", lambda: scenarios_endpoint(window=30)),
            ("explore-time-of-day", explore_time_of_day_endpoint),
            ("exposures", explore_exposures_endpoint),
            ("ic-block-evidence-preparation", ic_block_evidence_preparation),
            ("basal-night-evidence", lambda: basal_night_evidence_preparation(
                findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS)),
            ("isf-rest-window-evidence", lambda: diagnose_isf_rest_window_evidence_endpoint()),
            ("finding-case-file", lambda: finding_case_file_preparation(
                Request({"type": "http", "query_string": b""}))),
        )

    async def recompute_worker(event) -> None:
        """Run one complete warm shape at a time until shutdown.

        A newer cache version abandons the old set at its next shape boundary;
        the still-set event then causes one fresh complete roster, not a backlog.
        """
        while True:
            await event.wait()
            while True:
                event.clear()
                revision = cache.version
                superseded = False
                roster = app.state.recompute_roster()
                for index, (label, warm) in enumerate(roster):
                    if cache.version != revision:
                        superseded = True
                        break
                    shape_task = asyncio.create_task(asyncio.to_thread(warm))
                    app.state.recompute_shape_task = shape_task
                    try:
                        await asyncio.shield(shape_task)
                    except asyncio.CancelledError:
                        try:
                            await shape_task
                        except Exception:
                            logger.warning("Cache pre-warm failed for %s", label,
                                           exc_info=True)
                        raise
                    except Exception:
                        logger.warning("Cache pre-warm failed for %s", label, exc_info=True)
                    finally:
                        app.state.recompute_shape_task = None
                    if cache.version != revision:
                        superseded = True
                        break
                    if index + 1 < len(roster):
                        await app.state.recompute_pace()
                if superseded:
                    continue
                if not event.is_set():
                    break

    # These are deliberately app-local seams: production keeps one explicit
    # pace, while lifecycle tests replace the roster and awaitable pace.
    app.state.recompute_roster = warm_roster
    app.state.recompute_pace = default_recompute_pace
    app.state.recompute_shape_task = None
    app.state.signal_recompute = signal_recompute

    return app


def serve(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT,
          db_path: Optional[str] = None, token: Optional[str] = None,
          enable_fetch_loop: Optional[bool] = None) -> None:
    """Run the API with uvicorn (localhost by default).

    Pass ``enable_fetch_loop=False`` to skip the startup live-fetch (safe for
    scratch or synthetic DBs where Tandem credentials are not available).
    """
    import uvicorn

    uvicorn.run(create_app(db_path=db_path, token=token,
                           enable_fetch_loop=enable_fetch_loop), host=host, port=port)
