"""FastAPI HTTP surface (the ``api`` extra) — S1.

A thin renderer over the same :class:`~ciq_autotune.result.AnalysisResult` the CLI
prints (ROADMAP §5): ``GET /api/analyze`` returns its JSON. The result schema *is*
the contract a frontend builds on, so the API adds no analysis of its own. The
live pull has no route: the hourly loop and the ``harmonic fetch`` command are its
only callers (#417).

It also serves the one built browser shell (``frontend/dist/index.html``) at ``/``
and its explicit page paths, alongside the ``/api`` routes on the same port — there is
no separate frontend server and no login screen (#10): the shell itself loads
unauthenticated, then makes bearer-token-gated API calls.

Single-user posture (ROADMAP S1): bind localhost and gate on one static bearer
token from ``HARMONIC_API_TOKEN``. If no token is set the API stays open — fine on a
loopback bind, but set a token before exposing it anywhere.

FastAPI is imported lazily inside :func:`create_app`, exactly like the ``sync``
extra in :mod:`~ciq_autotune.sync`, so importing this module never forces the
extra on a core-only install.
"""

from __future__ import annotations

import contextvars
import json
import logging
import re
import sqlite3
import threading
import time
from collections import OrderedDict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from . import credentials
from .analyze import analyze
from .analyzers.scenario.levers import Lever
from .config import resolve_runtime_configuration
from .explore_exposures import build_exposures
from .explore_time_of_day import DATA_DAYS as TIME_OF_DAY_DAYS
from .explore_time_of_day import DEFAULT_DATA_DAYS as TIME_OF_DAY_DEFAULT_DAYS
from .explore_time_of_day import build_time_of_day_windows
from .meal_size import build_meal_size_windows
from .events import CarbEntry, parse_t
from . import findings_projection as findings_projection_module
from .findings_projection import prepare_findings_projection
from .finding_case_file import (
    prepare as prepare_finding_cases,
    wrap as wrap_finding_cases,
)
from .window_membership import WindowQuery
from .result import SCHEMA_VERSION
from .result_cache import ResultCache, open_tally
from .safety import _MIN_SUPPORTED_NIGHTS
from .derived_artifacts import (
    discard_artifact, dump_findings, FixedResult, InputRevisionChanged,
    is_sidecar_rebuilt, load_latest_prior, load_or_compute, rebuild_findings,
)
from .store import Store, wall_clock_now
from .guidance import baseline_for, is_preference_subject

logger = logging.getLogger(__name__)

# One line per API request — path, status, milliseconds, and how its cached reads
# were answered — so a slow screen can be read off the server log. Nothing else
# configures logging under ``serve``, so it carries its own handler.
request_log = logging.getLogger("harmonic.requests")
if not request_log.handlers:
    _request_handler = logging.StreamHandler()
    _request_handler.setFormatter(logging.Formatter("%(asctime)s %(message)s"))
    request_log.addHandler(_request_handler)
    request_log.setLevel(logging.INFO)
    request_log.propagate = False

DEFAULT_DB = "tconnect-data/ciq.db"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
RECOMPUTE_PACE_SECONDS = 0.1

# True inside a warm-worker shape: a warm shape computes its fixed result, never
# answers from a predecessor (#566).
_WARMING: "contextvars.ContextVar[bool]" = contextvars.ContextVar("warming", default=False)


# The fixed results that cost seconds, not tens of seconds, lightest first: the warm
# pass and the reads waiting on a predecessor's replacement both take them first.
_LIGHTEST = ("explore-time-of-day", "meal-size", "outcomes")


def _warming_call(warm):
    """Run one warm shape as the warm worker: its fixed reads compute (#566)."""
    _WARMING.set(True)
    return warm()

_FRONTEND_BUILD_COMMAND = "npm ci && npm run build"

# The app is the only browser shell (ADR 416, #495), built ahead of time and
# served with its five tabs as page paths — the Queue at the root page, each
# other tab at its own path — and its fingerprinted assets under one prefix.
# That closed set is what keeps a file on disk from ever shadowing an API route
# or the shell, and it is mirrored by the browser router
# (frontend/tab-routing.js). Every retired address — the desk's Diagnose, the
# whole `/v2` prefix and v1's own page paths — answers 404, never a redirect.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
_FRONTEND_INDEX = _FRONTEND_DIST / "index.html"
_FRONTEND_ASSETS = _FRONTEND_DIST / "assets"
PAGE = "/"
ASSETS = "/assets"
TABS = ("queue", "changes", "overview", "day", "settings")
TAB_PAGES = (PAGE, *(f"{PAGE}{tab}" for tab in TABS[1:]))

# #269 Guide-KB: the authored how-tos live as markdown here, served raw by
# ``/api/kb/{slug}``. ``slug`` is restricted to this charset so a request can
# never escape the directory (no dots, no slashes) into the wider filesystem.
_KB_DIR = Path(__file__).resolve().parent.parent / "docs" / "kb"
_KB_SLUG_RE = re.compile(r"[a-z0-9-]+")

# ADR 450: a refused durable Plan, Trial, Focus or later-conclusion write names
# its reason in a sentence, served beside its code as every other coded refusal
# here already is. The keys are every code a lifecycle write can raise, plus the
# handler's default; an unknown code is served as its own message.
_RECONCILE_REFUSED = "Harmonic's change records could not be reconciled, so nothing was recorded."
_REFUSAL_MESSAGES = {
    "request_identity_mismatch": "This request was already recorded for a different change.",
    "late_conclusion_mismatch": "A different later conclusion is already recorded for this Trial.",
    "stale_input_revision": "New pump or sensor data arrived since this page was read.",
    "stale_source": "The findings changed since this page was read.",
    "ineligible_source": "This finding is not offering an action from the current read.",
    "occupied_admission": "Another change is already being watched.",
    "missing_source_profile": "No pump profile has been read to record this Done against.",
    "nonpending_plan": "This Done is no longer waiting for the pump.",
    "nonactive_subject": "This change is no longer the one being watched.",
    "immature_trial": "This Trial is still maturing.",
    "trial_not_expired": "This Trial did not expire unreviewed, so it takes no later conclusion.",
    "transaction_aborted": "The save stopped partway, so nothing was recorded.",
    "legacy_ending_unavailable": ("This earlier Focus ended before Harmonic saved endings, "
                                  "so no ending can be recorded for it now."),
    "unknown_request_subject": "This change has no record to save against, so nothing was recorded.",
    "transaction_required": _RECONCILE_REFUSED,
    "orphan_base_record": _RECONCILE_REFUSED,
    "base_record_mismatch": _RECONCILE_REFUSED,
    "invalid_reconciliation_identity": _RECONCILE_REFUSED,
    "invalid_frontier_trial": _RECONCILE_REFUSED,
    "lifecycle_conflict": "Another change was recorded at the same time, so nothing was saved.",
}


def _analysis_payload(result) -> dict:
    """Render the analysis with its backend-owned basal support floor."""
    return {**result.to_dict(), "basal_support_floor": _MIN_SUPPORTED_NIGHTS}


# Every cached result whose builder reads only recorded data — readings,
# deliveries, boluses, carbs, prompt answers, settings captures and pump events —
# and never follow-up state (#522, ADR 538). The fixed ones among them are keyed
# by the recorded-data revision, which a follow-up write does not advance. The
# Trial roster, the watched change and the pattern sweep read follow-up state,
# and are deliberately absent.
_RECORDED_DATA_RESULTS = frozenset((
    "analyze", "scenarios", "exposures", "explore-time-of-day", "meal-size",
    "findings-history-snapshot", "outcomes", "day-navigator", "model-view",
    "timeline", "catalog",
))


def _reads_only_recorded_data(key) -> bool:
    """Whether a cached result reads only recorded data, never follow-up state."""
    return key[0] in _RECORDED_DATA_RESULTS


def create_app(db_path: Optional[str] = None, token: Optional[str] = None,
               key_path: Optional[str] = None, enable_fetch_loop: Optional[bool] = None,
               analysis_incarnation: Optional[str] = None, warm_on_start: bool = False):
    """Build the FastAPI app. ``db_path`` / ``token`` default to the
    canonical ``HARMONIC_DB`` / ``HARMONIC_API_TOKEN`` env vars. Their legacy
    ``CIQ_*`` spellings remain deprecated fallbacks. ``key_path`` (the Fernet
    key for encrypted credentials) defaults to ``credentials.DEFAULT_KEY_PATH``.

    ``enable_fetch_loop`` starts the hourly background fetch loop (see
    :mod:`~ciq_autotune.fetch_loop`) for the lifetime of the app; tests building
    an app for request assertions should pass ``False`` to avoid a stray live
    fetch attempt.

    ``warm_on_start`` runs the warm pass once the app starts, so a restart is warm
    before its first fetch lands — or when that fetch commits nothing (#522).
    ``serve`` turns it on; an app built for request assertions leaves it off.
    """
    try:
        import asyncio
        import contextlib

        from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request
        from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
        from fastapi.staticfiles import StaticFiles
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
    # One in-process result cache for this app's lifetime (#267).  Construct it
    # before the guarded data migration so a completed rewrite invalidates every
    # subsequently served shape.
    cache = ResultCache(incarnation=analysis_incarnation)
    migrated_patterns = False
    # Writable application startup owns analysis-backed migration; history and
    # ordinary CLI connections only apply the schema stamp in Store.__init__.
    with Store.open(db_path) as store:
        if store.pattern_migration_pending():
            try:
                from .analyzers.scenario import build_scenarios
                window_days = findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS
                analysis = analyze(
                    store, window_days=window_days, ignore_setting_changes=False,
                    pool_agreeing_basal_regimes=True,
                    carb_entries=store.carb_entries(),
                    prompt_responses=store.prompt_responses(),
                ).to_dict()
                exposures = build_exposures(store, window_days=window_days)
                scenarios = build_scenarios(store, window_days=window_days).to_dict()
                migrated_patterns = store.migrate_pattern_subjects(
                    analysis, exposures, scenarios,
                )
            except Exception:
                logger.exception("Pattern subject migration remains pending")
        # A prior local write can leave the frontier behind the durable input
        # revision (for example, a carb-log write before #404). Recover through
        # the existing transactional reconciler; GET handlers remain read-only
        # and this does not invent a Focus admission.
        frontier = store.follow_up_frontier()
        if frontier and frontier["reconciled_input_revision"] != store.input_data_revision():
            from .watched_change import reconcile_ingested_follow_up
            reconcile_ingested_follow_up(store)
    if migrated_patterns:
        cache.bump()
    if not _FRONTEND_INDEX.is_file():
        logger.error("Frontend build is missing; run %s", _FRONTEND_BUILD_COMMAND)

    class _FrontendAssets(StaticFiles):
        """Serve assets that appear after an in-place frontend build."""

        async def check_config(self):
            if Path(self.directory).is_dir():
                await super().check_config()

        async def get_response(self, path, scope):
            if not Path(self.directory).is_dir():
                return PlainTextResponse("Not Found", status_code=404)
            return await super().get_response(path, scope)

    @contextlib.asynccontextmanager
    async def lifespan(app: "FastAPI"):
        loop = asyncio.get_running_loop()
        event = asyncio.Event()
        app.state.recompute_event = event
        app.state.recompute_loop = loop
        app.state.recompute_task = asyncio.create_task(recompute_worker(event))
        if warm_on_start:
            warm_due.set()
            event.set()
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
    app.state.result_cache = cache

    # The warm worker owes a full roster pass: every write and the start set it.
    warm_due = threading.Event()
    # The fixed results a read answered from their predecessor, each computed by the
    # warm worker before its next shape, in the order they were asked for (#566).
    refreshes: "OrderedDict[tuple, object]" = OrderedDict()
    refreshes_lock = threading.Lock()

    def invalidate(keep=None) -> None:
        """Bump the cache after a write, then start the warm pass in the background.

        Without a running lifespan (an ASGI server started with it off) there is no
        warm worker, and the next read computes as it always did."""
        cache.bump(keep=keep)
        warm_due.set()
        loop = getattr(app.state, "recompute_loop", None)
        if loop is not None:
            loop.call_soon_threadsafe(app.state.recompute_event.set)

    def worker_running() -> bool:
        task = getattr(app.state, "recompute_task", None)
        return task is not None and not task.done()

    def request_refresh(key, run) -> None:
        """Ask the warm worker to compute ``key`` before its next shape (#566)."""
        with refreshes_lock:
            refreshes.setdefault(key, run)
        app.state.recompute_loop.call_soon_threadsafe(app.state.recompute_event.set)

    def follow_up_written() -> None:
        """Invalidate after a write to follow-up state alone (#522, ADR 538).

        A guidance preference, a Focus, a Trial or Plan lifecycle step, and the
        follow-up reconcile each write only follow-up tables — the preference, the
        Focus and follow-up records, the frontier, the Plan history — and advance
        the input revision but not the recorded-data revision. The results kept
        here read none of that (``_RECORDED_DATA_RESULTS``), and the fixed ones
        among them still match the derived-results file. What reads follow-up
        state — the guidance's composition, the Trial roster, the watched change —
        is dropped or keyed by the input revision, and case-file preparations are
        dropped."""
        invalidate(keep=_reads_only_recorded_data)
    app.state.finding_case_file_before_commit = None
    fixed_flights: dict[tuple, None] = {}
    fixed_flights_lock = threading.Lock()

    def current_fixed_result(result: FixedResult, *, reads_follow_up=False) -> bool:
        """Validate a fresh envelope while ResultCache holds its publish lock."""
        if result.revision is None or result.input_data_age is not None:
            return False
        with Store.open_queryonly(db_path) as current:
            return result.revision == (current.input_data_revision() if reads_follow_up
                                       else current.recorded_data_revision())

    def fixed(key, marker, compute, *, dump=None, rebuild=None, serve_stale=True,
              reads_follow_up=False):
        """Return one exact fixed result, or a labeled exact predecessor in flight.

        A result is keyed by the recorded-data revision unless ``reads_follow_up``
        says its compute reads follow-up state, which keys it by the input
        revision instead (ADR 538).

        After a write, a read whose result is not yet computed answers at once from
        its predecessor, labeled with how far that predecessor's data reaches
        (``input_data_age``), and the warm worker computes the current result next,
        once (#566). A second read while one computes is answered the same way. With
        no warm worker running, the first read computes, and a warm shape always
        computes."""
        with fixed_flights_lock:
            owner = key not in fixed_flights
            if owner:
                fixed_flights[key] = None
        def build():
            return load_or_compute(db_path, key, compute, shape_marker=marker,
                                   dump=dump, rebuild=rebuild, with_age=True,
                                   reads_follow_up=reads_follow_up)
        try:
            deferred = owner and worker_running()
            if (serve_stale and not _WARMING.get() and (deferred or not owner)
                    and not cache.contains(key)):
                prior = load_latest_prior(db_path, key, shape_marker=marker, rebuild=rebuild,
                                          reads_follow_up=reads_follow_up)
                if prior is not None:
                    if deferred:
                        request_refresh(key, lambda: fixed(
                            key, marker, compute, dump=dump, rebuild=rebuild,
                            serve_stale=serve_stale, reads_follow_up=reads_follow_up))
                    return prior
            return cache.get_or_compute(key, build, validate=lambda result: current_fixed_result(
                result, reads_follow_up=reads_follow_up))
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
        """The shared pooled analysis every findings consumer reads."""
        def build(store):
            return _analysis_payload(analyze(
                store, window_days=window, ignore_setting_changes=False,
                pool_agreeing_basal_regimes=True, carb_entries=store.carb_entries(),
                prompt_responses=store.prompt_responses(),
            ))
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

    def findings_snapshot(window: int):
        """One coherent findings preparation per cache version.

        The heavy read is the preparation (the analysis, the exposures feed and the
        scenario report for one findings window); projecting a clock window out of it
        is pure dict work, so the cache key covers the only parameter that changes
        what is read. Like every other heavy read it answers from the cache until a
        write bumps it. Its key and marker keep their ``history`` names (ADR 547):
        the derived-results file deletes an older row only under the same key and
        marker, so a renamed key would strand the last snapshot an install wrote.
        """
        key = ("findings-history-snapshot", window)
        def compute():
            analysis, exposures, scenarios = findings_products(window)
            return prepare_findings_projection(
                analysis=analysis, exposures=exposures, scenarios=scenarios,
            )
        def build_snapshot():
            try:
                return load_or_compute(
                    db_path, key, compute, shape_marker="findings-history-v1",
                    dump=dump_findings, rebuild=rebuild_findings, with_age=True)
            except InputRevisionChanged as error:
                raise ResultCache.GenerationChanged(
                    "input data changed during findings snapshot") from error
        generation, result = cache.stable_read(
            key, build_snapshot, validate=current_fixed_result)
        return generation, result.value

    def guidance_payload():
        """Compose source guidance and the read-only lifecycle verdict at one revision."""
        from .watched_change import active_watched_change, follow_up_admission, setting_acknowledgments
        for _ in range(3):
            with Store.open_queryonly(db_path) as store:
                revision = store.input_data_revision()
                now = store.latest_data_instant() or datetime.now()
                admission = follow_up_admission(store, now=now)
                watch = active_watched_change(store, (), (), (), now=now)
                acknowledgments = setting_acknowledgments(store)
                preferences = store.guidance_preferences()
            try:
                generation, findings = findings_snapshot(findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS)
            except ResultCache.GenerationChanged:
                continue
            with Store.open_queryonly(db_path) as store:
                if store.input_data_revision() != revision:
                    continue
            payload = findings.guidance(
                active_watch=watch.to_dict() if watch is not None else None,
                preferences=preferences, acknowledgments=acknowledgments,
                analysis_generation=f"guidance:{generation}:r{revision}")
            payload.update(input_revision=revision, admission=admission)
            if admission["state"] == "unavailable":
                payload.update(disposition="unavailable", selected=None, unavailable=admission["reason"])
            return payload
        raise ResultCache.GenerationChanged("guidance inputs changed during every snapshot")

    def guidance_or_unavailable():
        try:
            return guidance_payload()
        except Exception as error:
            logger.exception("guidance source unavailable")
            raise HTTPException(status_code=503, detail="guidance is unavailable") from error

    def _case_error(status, code, message):
        return JSONResponse(
            status_code=status,
            content={"detail": {"code": code, "message": message}},
        )

    def _case_params(request):
        allowed = {"projection_id", "finding_id", "lever", "alignment", "occ"}
        params = request.query_params
        if any(key not in allowed or len(params.getlist(key)) != 1 for key in params):
            raise ValueError("unknown or repeated query parameter")
        pid = params.get("projection_id")
        finding = params.get("finding_id")
        lever = params.get("lever")
        alignment = params.get("alignment")
        occ = params.get("occ")
        valid_findings = {f"finding:{lever.value}" for lever in Lever}
        valid_findings |= findings_projection_module.PATTERN_SUBJECTS
        if (not isinstance(pid, str) or not re.fullmatch(r"fp_[0-9a-f]{32}", pid)
                or ((finding is None) == (lever is None))
                or (finding is not None and finding not in valid_findings)
                or (lever is not None and lever not in {item.value for item in Lever})
                or alignment not in {"clock", "event"}
                or (occ is not None and not re.fullmatch(r"[om]_[0-9a-f]{32}", occ))):
            raise ValueError("malformed case-file coordinate")
        return pid, finding, lever, alignment, occ

    def _prepared_cases():
        """The whole-day case-file preparation, the one the app reads (ADR 547)."""
        key = ("finding-case-file",)
        query = WindowQuery.whole_day()
        def build(version):
            with Store.open_queryonly(db_path) as store:
                analysis, exposures, scenarios = findings_products(
                    findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS,
                )
                return prepare_finding_cases(
                    store, query=query, version=version, analysis=analysis,
                    exposures=exposures, scenarios=scenarios,
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
    def built_shell():
        # A missing build fails closed — 503 naming the build command — rather
        # than serving a blank or partial page, and it never hides the API.
        if not _FRONTEND_INDEX.is_file():
            return PlainTextResponse(
                f"Frontend build is missing; run {_FRONTEND_BUILD_COMMAND}.",
                status_code=503,
            )
        return FileResponse(_FRONTEND_INDEX)

    def index():
        return built_shell()

    for _page in TAB_PAGES:
        app.add_api_route(_page, index, methods=["GET"])

    # The shell has one stable URL, so it revalidates on every load. Vite
    # fingerprints assets, so they can stay immutable until their names change.
    @app.middleware("http")
    async def _request_duration(request, call_next):
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)
        tally = open_tally()
        started = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            request_log.info(
                "%s %s%s %d %d ms cache hit=%d miss=%d derived=%d", request.method, path,
                f"?{request.url.query}" if request.url.query else "", status, round((time.perf_counter() - started) * 1000),
                tally["hit"], tally["miss"], tally["derived"])

    @app.middleware("http")
    async def _frontend_no_store(request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path in TAB_PAGES:
            response.headers["Cache-Control"] = "no-cache"
        elif path.startswith(f"{ASSETS}/") and response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response

    # One prefix-scoped build directory route serves the shell's fingerprinted
    # assets; it can claim no page or API path outside its own prefix.
    app.mount(ASSETS, _FrontendAssets(directory=_FRONTEND_ASSETS, check_dir=False),
              name="frontend-assets")

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
                return _analysis_payload(analyze(
                    store, window_days=window, ignore_setting_changes=ignore_changes,
                    pool_agreeing_basal_regimes=pool, carb_entries=store.carb_entries(),
                    prompt_responses=store.prompt_responses()))

        key = ("analyze", window, ignore_changes, pool)
        if window == 30 and not ignore_changes and pool:
            return fixed_response(
                canonical_pooled_analysis(window),
                lambda value: {**value, "basal_support_floor": _MIN_SUPPORTED_NIGHTS},
            )
        # Every window the Overview switches between is a fixed result (#566), so a
        # restart keeps it and a write leaves its predecessor to serve.
        if window in TIME_OF_DAY_DAYS and not ignore_changes and not pool:
            return fixed_response(fixed(key, "analyze-v1", lambda store: _analysis_payload(analyze(
                store, window_days=window, ignore_setting_changes=ignore_changes,
                pool_agreeing_basal_regimes=pool, carb_entries=store.carb_entries(),
                prompt_responses=store.prompt_responses()))),
                lambda value: {**value, "basal_support_floor": _MIN_SUPPORTED_NIGHTS})
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
                    latest = store.latest_data_instant()
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

        # Each window the Overview switches between is a fixed result (#566).
        if window in TIME_OF_DAY_DAYS:
            return fixed_response(fixed(
                ("outcomes", window), "outcomes-v1",
                lambda store: summarize_outcomes(store, window_days=window).to_dict()))
        return cache.get_or_compute(("outcomes", window), compute)

    @app.get("/api/outcomes/trend")
    def outcomes_trend_endpoint(_: None = Depends(require_token)) -> dict:
        """The one active watched change (#244) that Diagnose's watch dock reports:
        ``{"watched_change": …}``, a Trial or Focus view or ``null``, at the Outcomes
        trend's own anchor (#447). The trend's rolling-window series are the CLI
        ``outcomes-trend``'s; no desk surface reads them, so this neither computes nor
        serves them. The watched change does not depend on a window (#18), so the
        route takes none, and its cache and warm key carry none."""
        from .outcomes_trend import trend_watched_change

        def watched(store) -> dict:
            view = trend_watched_change(store)
            return {"watched_change": view.to_dict() if view is not None else None}

        # The watched change reads follow-up state (the Focus, the Trial records),
        # so it is keyed by the input revision every write advances (ADR 538).
        return fixed_response(fixed(("outcomes-trend",), "outcomes-trend-watched-change-v1",
                                    watched, reads_follow_up=True))

    @app.get("/api/verify/trials")
    def verify_trials_endpoint(selected: Optional[str] = None, kind: str = "trial",
                               assessment: str = "original",
                               _: None = Depends(require_token)) -> dict:
        from .watched_change import review_trials
        if kind not in ("trial", "focus") or assessment not in ("original", "retained", "current"):
            raise HTTPException(status_code=422, detail="invalid history kind or assessment mode")
        if selected is None and assessment != "original":
            raise HTTPException(status_code=422, detail="reassessment requires a selection")
        if kind == "focus" and selected is not None and not selected.isdecimal():
            raise HTTPException(status_code=404, detail="unknown follow-up identity")
        from .follow_up_comparison import capture_comparison_context
        identity = int(selected) if kind == "focus" and selected is not None else selected
        for _ in range(3):
            with Store.open_queryonly(db_path) as store:
                # Key and compute share one SQLite snapshot. A crossed write must
                # retry with a new connection, not recompute inside the old snapshot.
                store.conn.execute("BEGIN")
                revision = store.input_data_revision()
                now = store.latest_data_instant() or datetime.now()
                record = store.follow_up_record(kind, identity) if identity is not None else None
                retained = record.get("comparison_context") if record else None
                current = (capture_comparison_context(store, at=now, input_revision=revision)
                           if assessment != "original" else None)
                context = json.dumps((retained, current), sort_keys=True)
                key = ("verify-trials", kind, identity, assessment, revision, context)

                def unchanged(result):
                    with Store.open_queryonly(db_path) as latest:
                        return result["input_revision"] == revision == latest.input_data_revision()

                try:
                    return cache.get_or_compute(key, lambda: review_trials(
                        store, now=now, selected=identity, kind=kind, assessment=assessment),
                        validate=unchanged, attempts=1)
                except ResultCache.GenerationChanged:
                    continue
                except KeyError:
                    raise HTTPException(status_code=404, detail="unknown follow-up identity")
        raise HTTPException(status_code=503, detail="history inputs changed during every snapshot")

    @app.get("/api/explore/time-of-day")
    def explore_time_of_day_endpoint(days: int = TIME_OF_DAY_DEFAULT_DAYS,
                                     _: None = Depends(require_token)) -> dict:
        """The time-of-day evidence feed (#578) over the last 14, 30 or 90 days.
        All three windows are one fixed result, computed in one pass over the
        history they share (#566), and each read serves its own window."""
        if days not in TIME_OF_DAY_DAYS:
            raise HTTPException(status_code=400,
                                detail=f"days must be one of {list(TIME_OF_DAY_DAYS)}")
        return fixed_response(fixed(("explore-time-of-day",), "time-of-day-v2",
                                    build_time_of_day_windows),
                              lambda windows: windows[str(days)])

    @app.get("/api/explore/meal-size")
    def explore_meal_size_endpoint(days: int = TIME_OF_DAY_DEFAULT_DAYS,
                                   _: None = Depends(require_token)) -> dict:
        """The Overview's Meal size card (#501, ADR 501): the climb after each
        counted meal of the last 14, 30 or 90 days (#565), by size, and each
        size's medians. It reads only recorded data, and its three windows are one
        fixed result, measured in one pass (#566); each read serves its own window."""
        if days not in TIME_OF_DAY_DAYS:
            raise HTTPException(status_code=400,
                                detail=f"days must be one of {list(TIME_OF_DAY_DAYS)}")
        return fixed_response(fixed(("meal-size",), "meal-size-v3", build_meal_size_windows),
                              lambda windows: windows[str(days)])

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
        window: int = findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS,
        _: None = Depends(require_token),
    ) -> dict:
        """The whole-day findings queue (#730), the one window the Queue reads.

        Everything the queue shows — register, merged spans, outcome anchoring,
        denominators, order — is decided behind :meth:`FindingsProjection.project`.
        """
        try:
            generation, snapshot = findings_snapshot(window)
            return recover_sidecar_projection(
                ("findings-history-snapshot", window), "findings-history-v1", snapshot,
                lambda findings: findings.project(
                    WindowQuery.whole_day(), analysis_generation=generation),
                lambda: findings_snapshot(window)[1])
        except ResultCache.GenerationChanged as error:
            raise HTTPException(status_code=409, detail={
                "code": "analysis_generation_mismatch",
                "message": "Evidence changed. Refresh findings.",
            }) from error

    @app.get("/api/guidance")
    def guidance_endpoint(_: None = Depends(require_token)) -> dict:
        """The fixed-window backend-owned next-priority guidance read."""
        return guidance_or_unavailable()

    @app.put("/api/guidance/preferences/{subject:path}")
    def set_guidance_preference_endpoint(subject: str, payload: dict = Body(...),
                                         _: None = Depends(require_token)) -> dict:
        from .watched_change import reconcile_ingested_follow_up
        generation, reason = payload.get("generation"), payload.get("reason")
        if not isinstance(generation, str):
            raise HTTPException(status_code=400, detail="generation is required")
        if reason is not None and not isinstance(reason, str):
            raise HTTPException(status_code=400, detail="reason must be a string")
        current = guidance_or_unavailable()
        if generation != current["analysis_generation"]:
            raise HTTPException(status_code=409, detail="guidance changed; read it again")
        candidate = next((row for row in current["candidates"] if row["subject"] == subject), None)
        if candidate is None or candidate.get("absent"):
            raise HTTPException(status_code=404, detail="unknown current guidance subject")
        baseline = baseline_for(candidate)
        with Store.open(db_path) as store:
            try:
                store.save_guidance_preference(
                    subject, decided_at=wall_clock_now().strftime("%Y-%m-%d %H:%M:%S"),
                    reason=reason, expected_revision=current["input_revision"], **baseline)
            except ValueError as error:
                raise HTTPException(status_code=409, detail=str(error)) from error
            reconcile_ingested_follow_up(store)
        follow_up_written()
        return {"subject": subject, "set_aside": True}

    @app.delete("/api/guidance/preferences/{subject:path}")
    def restore_guidance_preference_endpoint(subject: str,
                                             _: None = Depends(require_token)) -> dict:
        from .watched_change import reconcile_ingested_follow_up
        with Store.open(db_path) as store:
            stored = any(row["subject"] == subject
                         for row in store.guidance_preferences())
            if not stored and not is_preference_subject(subject):
                raise HTTPException(status_code=404,
                                    detail="unknown guidance subject")
            restored = store.restore_guidance_preference(subject)
            if restored:
                reconcile_ingested_follow_up(store)
        if restored:
            follow_up_written()
        return {"subject": subject, "set_aside": False}

    @app.get("/api/diagnose/finding-case-file-preparation")
    def finding_case_file_preparation(request: Request, _: None = Depends(require_token)):
        if request.query_params:
            return _case_error(400, "invalid_request", "the preparation takes no parameters")
        try:
            prepared, reason = _prepared_cases()
            if reason == "capacity":
                return _case_error(503, "preparation_capacity", "All preparations are leased.")
            if reason == "changed":
                return _case_error(503, "preparation_changed", "Data changed during preparation.")
            return wrap_finding_cases(prepared)
        except Exception:
            logger.exception("Finding case-file preparation was inconsistent")
            return _case_error(500, "inconsistent_projection", "Case population is inconsistent.")

    @app.get("/api/diagnose/finding-case-file")
    def finding_case_file(request: Request, _: None = Depends(require_token)):
        try:
            projection_id, finding_id, lever, alignment, occ = _case_params(request)
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
        from .watched_change import reconcile_ingested_follow_up
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
            # The sign-off advances the input revision, which leaves the
            # follow-up frontier behind until something reconciles it (#557).
            reconcile_ingested_follow_up(store)
        invalidate()  # a sign-off changes the ready-for-review queue (#267)
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
        from .watched_change import reconcile_ingested_follow_up
        with Store.open(db_path) as store:
            credentials.save_credentials(store, email, password, region, key_path=key_path)
            # The save advances the input revision, which leaves the follow-up
            # frontier behind until something reconciles it (#557).
            reconcile_ingested_follow_up(store)
        # No cached result reads the credentials: only the fetch's login and the
        # uncached credentials read do. The reconcile writes follow-up state alone.
        follow_up_written()
        return {"configured": True}

    @app.get("/api/status")
    def status_endpoint(_: None = Depends(require_token)) -> dict:
        with Store.open(db_path) as store:
            status = store.fetch_status()
            earliest_day, latest_day = store.cgm_day_bounds()
            data_day_count = store.cgm_data_day_count()
            input_revision = store.input_data_revision()
        base = status or {"last_attempt_at": None, "last_success_at": None,
                          "last_error": None, "last_error_label": None, "last_written": None}
        if base["last_error"] is not None and base["last_error_label"] is None:
            # A failure recorded before fetches were labelled.
            from .fetch_loop import UNKNOWN
            base = {**base, "last_error_label": UNKNOWN}
        return {**base, "earliest_data_day": earliest_day, "latest_data_day": latest_day,
                "data_day_count": data_day_count, "input_revision": input_revision}

    @app.get("/api/pump-settings")
    def pump_settings_endpoint(_: None = Depends(require_token)) -> dict:
        with Store.open(db_path) as store:
            latest = store.latest_settings_snapshot()
        if latest is None:
            return {"configured": False}
        settings = latest.settings
        active = settings.active()
        if active is None:
            return {"configured": False}
        return {
            "configured": True,
            # #99: the capture time of this snapshot — Changes shows it as the
            # detected settings' "Captured <fetch>". A confirmed Plan's "On pump
            # since" names the server's confirming read instead (#431).
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

        def compute() -> dict:
            with Store.open(db_path) as store:
                return build_timeline(store, start, end)

        # It reads only stored rows, never the clock, so every write's bump keeps it current.
        return cache.get_or_compute(("timeline", start.isoformat(), end.isoformat()), compute)

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

    def reconcile_carb_write(store) -> None:
        """Finish a carb/prompt write against the current Follow-up frontier."""
        from .watched_change import reconcile_ingested_follow_up
        reconcile_ingested_follow_up(store)

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
        committed = False
        try:
            with Store.open(db_path) as store:
                new_id = store.upsert_carb_entry(entry)
                committed = True
                reconcile_carb_write(store)
                result = store.get_carb_entry(new_id)
        finally:
            if committed:
                invalidate()  # a committed write stays invalidated if reconcile fails
        return result

    @app.patch("/api/carbs/{entry_id}")
    def update_carb_endpoint(entry_id: int, payload: dict = Body(...),
                             _: None = Depends(require_token)) -> dict:
        committed = False
        try:
            with Store.open(db_path) as store:
                existing = store.get_carb_entry(entry_id)
                if existing is None:
                    raise HTTPException(status_code=404, detail="carb entry not found")
                # PATCH is a partial merge over the stored row (source/created_at are
                # preserved unless explicitly overridden), re-validated as a whole.
                entry = _carb_entry_from_payload({**existing, **payload})
                store.upsert_carb_entry(entry, id=entry_id)
                committed = True
                reconcile_carb_write(store)
                result = store.get_carb_entry(entry_id)
        finally:
            if committed:
                invalidate()
        return result

    @app.delete("/api/carbs/{entry_id}")
    def delete_carb_endpoint(entry_id: int,
                             _: None = Depends(require_token)) -> dict:
        # Deleting a prompt-sourced entry cascades its prompt_responses row away
        # (the #125 store rule) so the sourcing prompt resurrects.
        committed = False
        try:
            with Store.open(db_path) as store:
                n = store.delete_carb_entry(entry_id)
                committed = bool(n)
                if n:
                    reconcile_carb_write(store)
        finally:
            if committed:
                invalidate()
        if n == 0:
            raise HTTPException(status_code=404, detail="carb entry not found")
        return {"deleted": n}

    # --- carb-log prompt review queue (#128) -------------------------------
    # Prompts are derived LIVE over the last 7 days (no stored prompt rows): the
    # `missed-meal` classifier's matched rises that no over-treated low's rebound
    # owns (an owned rise is explained by its low, ADR 448) + every sub-70 low,
    # minus anything already answered in prompt_responses. Answering 'carbs'
    # creates the carb entry AND the response row in ONE transaction (never one
    # without the other), so the delete-resurrects invariant holds. No bulk-answer
    # path exists.

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

        committed = False
        try:
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
                committed = True
                reconcile_carb_write(store)
        finally:
            if committed:
                invalidate()  # an answered prompt changes the carb-exclusion set (#267)
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
        committed = False
        try:
            with Store.open(db_path) as store:
                n = store.clear_prompt_response(detector=detector, anchor_t=anchor_t)
                committed = bool(n)
                if n:
                    reconcile_carb_write(store)
        finally:
            if committed:
                invalidate()
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

    def follow_up_read(store):
        from .watched_change import follow_up_admission
        return {"input_revision": store.input_data_revision(),
                "admission": follow_up_admission(store, now=store.latest_data_instant() or datetime.now())}

    def durable_request(payload, *, creation=False, required=False):
        payload = payload or {}
        fields = {"request_id", "input_revision", "subject", "analysis_generation"}
        durable = "request_id" in payload
        if not durable:
            if required or fields.intersection(payload):
                raise HTTPException(status_code=422, detail="complete durable request required")
            return False
        needed = {"request_id", "input_revision"}
        if creation:
            needed |= {"subject", "analysis_generation"}
        if (not needed <= payload.keys() or type(payload.get("input_revision")) is not int
                or any(not isinstance(payload.get(key), str) or not payload[key].strip()
                       or len(payload[key]) > 512 for key in needed - {"input_revision"})):
            raise HTTPException(status_code=422, detail="invalid durable request fields")
        for key in ("conclusion", "reason"):
            if payload.get(key) is not None and (not isinstance(payload[key], str) or len(payload[key]) > 4096):
                raise HTTPException(status_code=422, detail=f"invalid {key}")
        return True

    def lifecycle(operation, kind, identity, payload, *, durable, mutate, creation=False,
                  reconcile=True):
        from .store import FollowUpConflict, FocusAlreadyActive
        if reconcile:
            from .watched_change import read_follow_up_history, reconcile_follow_up

        def retry(store):
            if not durable:
                return None
            receipt = store.follow_up_request(payload["request_id"])
            if receipt is None:
                return None
            if (receipt["operation"] != operation or receipt["kind"] != kind
                    or (identity is not None and receipt["id"] != identity)):
                raise FollowUpConflict("request_identity_mismatch", store.input_data_revision())
            if operation == "pin":
                from .watched_change import focus_subject
                expected = (f"pattern:{payload['pattern_key']}" if payload.get("pattern_key")
                            else "habit:" + str(payload.get("lever")))
                actual = focus_subject(receipt["result"]["record"])
                if actual != expected:
                    raise FollowUpConflict("request_identity_mismatch", store.input_data_revision())
                scope = (receipt["result"]["record"].get("decision_context") or {}).get("outcome_window")
                if scope != payload.get("outcome_window"):
                    raise FollowUpConflict("request_identity_mismatch", store.input_data_revision())
            if operation == "apply" and payload["subject"] not in receipt["result"]["record"]["decision_context"]["subjects"]:
                raise FollowUpConflict("request_identity_mismatch", store.input_data_revision())
            if (operation == "conclude"
                    and receipt["result"]["record"]["late_conclusion"]["conclusion"]
                    != payload["conclusion"]):
                raise FollowUpConflict("request_identity_mismatch", store.input_data_revision())
            return receipt["result"]

        def terminal(store):
            record = store.follow_up_record(kind, identity) if identity is not None else None
            if record and durable:
                if operation == "withdraw" and record["withdrawal"].get("state") == "available":
                    return record
                if operation in ("finish", "resolve") and "kind" in record["ending"]:
                    return record
                if operation == "conclude" and record.get("late_conclusion", {}).get("state") == "available":
                    if record["late_conclusion"]["conclusion"] != payload["conclusion"]:
                        raise FollowUpConflict("late_conclusion_mismatch", store.input_data_revision())
                    return record
            return None

        try:
            with Store.open_queryonly(db_path) as store:
                saved = retry(store)
                if saved is not None:
                    return saved
                ended = terminal(store)
            source = guidance_or_unavailable() if creation and ended is None else None
            with Store.open(db_path) as store:
                before = store.input_data_revision()
                # The reconcile's history is read before the writer is reserved
                # and stands if nothing commits first (#576).
                history = read_follow_up_history(store) if reconcile and ended is None else None
                with store.follow_up_transaction():
                    # A write that does not reconcile carries a frontier that was
                    # current forward, since it changes nothing a reconcile reads,
                    # and leaves one that was behind for the next reconcile (#557).
                    frontier = store.follow_up_frontier()
                    carried = (not reconcile and frontier is not None
                               and frontier["reconciled_input_revision"] == store.input_data_revision())
                    saved = retry(store)
                    if saved is not None:
                        return saved
                    ended = terminal(store)
                    if ended is not None:
                        record = ended
                    else:
                        if durable and payload["input_revision"] != store.input_data_revision():
                            raise FollowUpConflict("stale_input_revision", store.input_data_revision())
                        if source is not None and source["input_revision"] != store.input_data_revision():
                            raise FollowUpConflict("stale_source", store.input_data_revision())
                        now = store.latest_data_instant() or datetime.now()
                        recorded_at = wall_clock_now(after=store.latest_server_stamp())
                        admission = (reconcile_follow_up(store, now=now, recorded_at=recorded_at,
                                                         history=history)
                                     if reconcile else None)
                        record = mutate(store, admission, source, now, recorded_at)
                    # Saving a new retry receipt is itself a durable write. Reserve
                    # its revision before capturing the returned common verdict.
                    revision = store.input_data_revision()
                    if durable and revision == before:
                        revision += 1
                    frontier = store.follow_up_frontier()
                    if (reconcile or carried) and frontier is not None:
                        store.advance_follow_up_frontier(frontier["trial_id"], frontier["detected_at"],
                                                         reconciled_input_revision=store.input_data_revision())
                    result = {**{key: record[key] for key in (
                        ("applied_at", "items") if kind == "plan" else
                        ("id", "lever", "pinned_at", "status") if kind == "focus" else ("id",))},
                        "record": record, **follow_up_read(store)}
                    result["input_revision"] = revision
                    if durable:
                        store.save_follow_up_request(payload["request_id"], operation=operation,
                                                     kind=kind, id=record["id"], result=result)
                changed = store.input_data_revision() != before
            if changed:
                follow_up_written()
            return result
        except (FollowUpConflict, FocusAlreadyActive, sqlite3.IntegrityError) as error:
            with Store.open_queryonly(db_path) as store:
                current = follow_up_read(store)
            code = getattr(error, "reason", "lifecycle_conflict")
            detail = {"code": code, "message": _REFUSAL_MESSAGES.get(code, code), **current}
            raise HTTPException(status_code=409, detail=detail if durable else str(error))
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error))

    def source_context(source, candidate, recorded_at, *, outcome_window=None):
        from .guidance import COMPARISON_VERSION
        actions = candidate["action"] if isinstance(candidate.get("action"), list) else []
        return {"version": "386:1", "state": "available",
                "captured_at": recorded_at.strftime("%Y-%m-%d %H:%M:%S"),
                "input_revision": source["input_revision"], "analysis_generation": source["analysis_generation"],
                "action": candidate["action"], "explanation": candidate["title"] or "Supported setting change",
                "source_window": candidate["source_window"], "policy": COMPARISON_VERSION,
                "subjects": [candidate["subject"]], "occurrences": candidate["occurrence_ids"],
                "settings": [{"value": action["recommended"], "unit": action["units"]}
                             for action in actions],
                "support": candidate["support"], "unknowns": candidate["unknowns"],
                **({"outcome_window": outcome_window} if outcome_window is not None else {})}

    def selected_source(store, source, payload, subject, durable):
        from .store import FollowUpConflict
        if durable and (payload["subject"] != subject or payload["analysis_generation"] != source["analysis_generation"]):
            raise FollowUpConflict("stale_source", store.input_data_revision())
        candidate = next((row for row in source["candidates"] if row["subject"] == subject), None)
        if candidate is None or not candidate.get("action") or candidate.get("preference", {}).get("set_aside"):
            raise FollowUpConflict("ineligible_source", store.input_data_revision())
        return candidate

    @app.post("/api/plan/apply")
    def apply_plan_endpoint(payload: Optional[dict] = Body(None), _: None = Depends(require_token)) -> dict:
        """Done on a Queue Setting card (ADR 518): record that the person
        programmed the subject's served suggestion into the pump. The items are
        the candidate's own action rows, and the decision waits for the pump."""
        from dataclasses import asdict
        from .guidance import done_items, plan_deliverable
        from .store import FollowUpConflict
        payload = payload or {}
        durable_request(payload, creation=True, required=True)

        def apply(store, admission, source, now, at):
            candidate = selected_source(store, source, payload, payload["subject"], True)
            if (candidate["kind"] != "setting" or not candidate["admitted"]
                    or (candidate.get("acknowledgment") or {}).get("state") == "waiting"):
                raise FollowUpConflict("ineligible_source", store.input_data_revision())
            snapshot = store.latest_settings_snapshot()
            profile = snapshot.settings.active() if snapshot else None
            if profile is None:
                raise FollowUpConflict("missing_source_profile", store.input_data_revision())
            # Store records a Plan from its one staging row, in this transaction.
            stamp = at.strftime("%Y-%m-%d %H:%M:%S")
            store.save_plan_draft(done_items(candidate), stamp)
            applied = store.apply_plan(stamp)
            segments = [asdict(segment) for segment in profile.segments]
            return store.save_follow_up_record({"kind": "plan", "id": applied["applied_at"], "version": "386:1",
                **applied, "decision_context": source_context(source, candidate, at),
                "deliverable": {"version": "386:1", "state": "available",
                                "source_snapshot": snapshot.captured_at.strftime("%Y-%m-%d %H:%M:%S"),
                                "source_profile": asdict(profile), "rows": plan_deliverable(segments, applied["items"])}})
        return lifecycle("apply", "plan", None, payload, durable=True, mutate=apply, creation=True)

    @app.get("/api/plan/history")
    def plan_history_endpoint(_: None = Depends(require_token)) -> dict:
        from .guidance import subject_title
        from .watched_change import with_plan_verdicts

        def named(record):
            # Each recorded subject's served name, computed on read and never
            # stored (ADR 451). Only an available context records subjects.
            context = record["decision_context"]
            if context["state"] != "available":
                return record
            titles = [subject_title(subject) for subject in context["subjects"]]
            return {**record, "decision_context": {**context, "subject_titles": titles}}

        with Store.open_queryonly(db_path) as store:
            store.conn.execute("BEGIN")
            return {"history": [named(record) for record in
                                with_plan_verdicts(store, store.follow_up_records("plan"))],
                    **follow_up_read(store)}

    @app.post("/api/plan/history/withdraw")
    def withdraw_plan_endpoint(payload: dict = Body(...), _: None = Depends(require_token)) -> dict:
        """Undo a Done (ADR 518): withdraw an acknowledgment still waiting for the pump."""
        from .store import FollowUpConflict
        from .watched_change import open_plans
        durable_request(payload, required=True)
        identity = payload.get("applied_at")
        if not isinstance(identity, str) or not identity:
            raise HTTPException(status_code=422, detail="applied_at required")
        def withdraw(store, admission, source, now, at):
            record = store.follow_up_record("plan", identity)
            if record is None:
                raise HTTPException(status_code=404, detail="unknown Plan")
            if identity not in {plan["id"] for plan in open_plans(store).values()}:
                raise FollowUpConflict("nonpending_plan", store.input_data_revision())
            return store.save_follow_up_record({**record, "withdrawal": {
                "version": "386:1", "state": "available", "withdrawn_at": at.strftime("%Y-%m-%d %H:%M:%S"),
                "reason": payload.get("reason")}})
        return lifecycle("withdraw", "plan", identity, payload, durable=True, mutate=withdraw)

    def _pinnable_pattern_member(row):
        from .watched_change import is_pinnable
        if (row.get("kind") != "pattern"
                or row["readiness"]["verdict"] != "ready"
                or row.get("action") is None):
            return None
        return next((
            member for member in row["members"]
            if member["kind"] == "habit"
            and is_pinnable(member["subject"].split(":", 1)[1], row["pattern_key"])
        ), None)

    @app.get("/api/focus")
    def list_focus_endpoint(_: None = Depends(require_token)) -> dict:
        from .watched_change import focus_subject, pinnable_levers
        guidance = guidance_or_unavailable()
        patterns = [row for row in guidance["candidates"]
                    if _pinnable_pattern_member(row) is not None]
        with Store.open_queryonly(db_path) as store:
            store.conn.execute("BEGIN")
            # Each Focus is served under its own key (ADR 528), a record from before
            # habits had one included.
            return {"focuses": [{**record, "subject": focus_subject(record)}
                                for record in store.follow_up_records("focus")],
                    "pinnable": sorted(pinnable_levers()),
                    "pinnable_patterns": [{"key": row["pattern_key"], "subject": row["subject"],
                                           "readiness": row["readiness"]} for row in patterns],
                    **follow_up_read(store)}

    @app.post("/api/focus")
    def pin_focus_endpoint(payload: dict = Body(...), _: None = Depends(require_token)) -> dict:
        from .store import FollowUpConflict
        from .watched_change import is_pinnable
        from .follow_up_comparison import capture_comparison_context
        durable = durable_request(payload, creation=True)
        lever, pattern_key = payload.get("lever"), payload.get("pattern_key")
        scope = payload.get("outcome_window")
        if pattern_key is not None:
            if not isinstance(pattern_key, str):
                raise HTTPException(status_code=422, detail="pattern_key must be a string")
            current = guidance_or_unavailable()
            pattern = next((row for row in current["candidates"]
                            if row.get("subject") == f"pattern:{pattern_key}"), None)
            if pattern is None:
                raise HTTPException(status_code=400, detail="Pattern Focus is not ready")
            member = _pinnable_pattern_member(pattern)
            if member is None:
                raise HTTPException(status_code=400, detail="Pattern Focus is not pinnable")
            lever = member["subject"].split(":", 1)[1]
        if not isinstance(lever, str):
            raise HTTPException(status_code=422, detail="lever required")
        if not is_pinnable(lever, pattern_key):
            raise HTTPException(status_code=400, detail=f"{lever!r} is not a pinnable behavioral lever")
        if pattern_key is not None:
            from .window_membership import WindowQuery
            if not isinstance(scope, dict) or set(scope) != {"start_min", "end_min"}:
                raise HTTPException(status_code=422, detail="Pattern Focus requires an outcome window")
            try:
                scope = WindowQuery.clock(scope["start_min"], scope["end_min"]).to_dict()
            except ValueError as error:
                raise HTTPException(status_code=422, detail=str(error)) from error
            scope = {key: scope[key] for key in ("start_min", "end_min")}
            # Scope admission uses the same producer-owned Pattern population
            # the Diagnose case showed. The global guidance row still supplies
            # copy and the durable source generation; it cannot waive a scoped
            # readiness verdict or derive membership in this endpoint.
            try:
                generation, findings = findings_snapshot(
                    findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS)
                scoped = findings.project(
                    WindowQuery.clock(scope["start_min"], scope["end_min"]),
                    analysis_generation=generation,
                )
                # A Pattern may intentionally collapse to its served habit row
                # in the reading queue. Admission still belongs to the scoped
                # Pattern producer, whose roster survives that presentation.
                scoped_pattern = next((row for row in scoped["outcome_patterns"]
                                       if row.get("key") == pattern_key), None)
            except ResultCache.GenerationChanged as error:
                raise HTTPException(status_code=409, detail="Pattern evidence changed. Refresh findings.") from error
            if (scoped_pattern is None
                    or scoped_pattern.get("readiness", {}).get("verdict") != "ready"):
                raise HTTPException(status_code=409, detail="Pattern Focus is not ready in this outcome window")
        def pin(store, admission, source, now, at):
            if not admission["focus_pin"]["available"]:
                raise FollowUpConflict("occupied_admission", store.input_data_revision())
            subject = f"pattern:{pattern_key}" if pattern_key else "habit:" + lever
            if pattern_key is None:
                candidate = next((row for row in source["candidates"]
                                  if row.get("kind") == "pattern" and any(
                                      member["subject"] == subject
                                      for member in row["members"])), None)
                if candidate is None:
                    candidate = selected_source(store, source, payload, subject, durable)
            else:
                candidate = selected_source(store, source, payload, subject, durable)
                if candidate["readiness"]["verdict"] != "ready":
                    raise FollowUpConflict("ineligible_source", store.input_data_revision())
            focus = store.pin_focus(lever, at.strftime("%Y-%m-%d %H:%M:%S"), pattern_key)
            # A Focus keeps its own key (ADR 528): its Pattern's, or a standalone habit's.
            return store.save_follow_up_record({"kind": "focus", "id": focus["id"], "version": "386:1", **focus,
                "subject": subject,
                "decision_context": source_context(source, candidate, at, outcome_window=scope),
                "comparison_context": capture_comparison_context(store, at=at, input_revision=store.input_data_revision())})
        return lifecycle("pin", "focus", None, payload, durable=durable, mutate=pin, creation=True)

    def finish_follow_up(kind, identity, payload, durable):
        from .store import FollowUpConflict
        from .watched_change import capture_ending
        def finish(store, admission, source, now, at):
            record = store.follow_up_record(kind, identity)
            if record is None:
                raise HTTPException(status_code=404, detail="unknown follow-up identity")
            if kind == "focus" and record["status"] != "active" and not durable:
                raise HTTPException(status_code=404, detail="no active focus with that id")
            if admission["state"] != "available" or admission["active_kind"] != kind or admission["active_id"] != identity:
                raise FollowUpConflict("nonactive_subject", store.input_data_revision())
            if kind == "trial" and not admission["can_finish_trial"]:
                raise FollowUpConflict("immature_trial", store.input_data_revision())
            return capture_ending(store, record, kind="manual" if kind == "focus" else "user_finished",
                                  effective_at=at, recorded_at=at, data_cutoff=now,
                                  conclusion=payload.get("conclusion"))
        return lifecycle("resolve" if kind == "focus" else "finish", kind, identity, payload,
                         durable=durable, mutate=finish)

    @app.post("/api/focus/{focus_id}/resolve")
    def resolve_focus_endpoint(focus_id: int, payload: Optional[dict] = Body(None),
                               _: None = Depends(require_token)) -> dict:
        payload = payload or {}
        return finish_follow_up("focus", focus_id, payload, durable_request(payload))

    @app.post("/api/verify/trials/{trial_id}/finish")
    def finish_trial_endpoint(trial_id: str, payload: dict = Body(...),
                              _: None = Depends(require_token)) -> dict:
        return finish_follow_up("trial", trial_id, payload, durable_request(payload, required=True))

    @app.post("/api/verify/trials/{trial_id}/conclusion")
    def conclude_trial_endpoint(trial_id: str, payload: dict = Body(...),
                                _: None = Depends(require_token)) -> dict:
        from .store import FollowUpConflict
        durable_request(payload, required=True)
        if not isinstance(payload.get("conclusion"), str) or not payload["conclusion"].strip():
            raise HTTPException(status_code=422, detail="late conclusion requires text")
        def conclude(store, admission, source, now, at):
            record = store.follow_up_record("trial", trial_id)
            if record is None:
                raise HTTPException(status_code=404, detail="unknown follow-up identity")
            if record["ending"].get("kind") != "expired_unreviewed":
                raise FollowUpConflict("trial_not_expired", store.input_data_revision())
            return store.save_follow_up_record({**record, "late_conclusion": {
                "version": "386:1", "state": "available",
                "recorded_at": at.strftime("%Y-%m-%d %H:%M:%S"),
                "conclusion": payload["conclusion"],
            }})
        return lifecycle("conclude", "trial", trial_id, payload, durable=True, mutate=conclude,
                         reconcile=False)

    def signal_recompute() -> None:
        """Invalidate after a fetch and notify the lifespan-owned worker.

        ``run_fetch_loop`` invokes this from its fetch thread.  It deliberately
        does no compute there: one event coalesces writes while the worker is
        running and the loop remains free to serve requests between shapes.
        """
        invalidate()

    async def default_recompute_pace() -> None:
        await asyncio.sleep(RECOMPUTE_PACE_SECONDS)

    def warm_roster():
        """What the app's five tabs read, lightest screen first (#522, #566).

        The Overview's profiles, Meal size and outcomes first — a few seconds for
        every window it switches between — then the Queue and Changes — the
        findings and guidance snapshot under them all, the analysis, the case
        files, the Trial roster — then the Overview's other two analyses, the
        heaviest shapes, then the Day screen's navigator and its latest two days.
        After a write each of them answers from its predecessor until it is warm,
        and one a read is waiting on is computed next. Nothing the app does not
        read is warmed: on the home server, a warm shape it never reads is CPU
        taken from the visitor."""
        def latest_days():
            with Store.open_queryonly(db_path) as store:
                last = store.cgm_day_bounds()[1]
            if last is None:
                return ()
            day = datetime.strptime(last, "%Y-%m-%d")
            return (day, day - timedelta(days=1))

        def warm_day(index):
            def warm():
                days = latest_days()
                if index < len(days):
                    day = days[index]
                    model_view_endpoint(date=day.strftime("%Y-%m-%d"))
                    timeline_endpoint(start=day, end=day + timedelta(days=1))
            return warm

        return (
            # The Overview's lighter reads, at every window it switches between: its
            # glucose profiles and its Meal size card (each one shape for all three
            # windows) and its outcomes.
            ("explore-time-of-day", lambda: explore_time_of_day_endpoint(days=TIME_OF_DAY_DEFAULT_DAYS)),
            ("meal-size", lambda: explore_meal_size_endpoint(days=TIME_OF_DAY_DEFAULT_DAYS)),
            *((f"outcomes-{days}", lambda days=days: outcomes_endpoint(window=days))
              for days in TIME_OF_DAY_DAYS),
            # The snapshot's first input, warmed as its own shape.
            ("analyze-pooled", lambda: analyze_endpoint(window=30, ignore_changes=False, pool=True)),
            ("findings-history", lambda: findings_snapshot(
                findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS)),
            # The Queue's analysis, and the Overview's at 30 days.
            ("analyze", lambda: analyze_endpoint(window=30, ignore_changes=False, pool=False)),
            ("finding-case-file", lambda: finding_case_file_preparation(
                Request({"type": "http", "query_string": b""}))),
            ("verify-trials", lambda: verify_trials_endpoint()),
            # The analysis behind the Overview's ISF and basal cards at its other windows.
            *((f"analyze-{days}", lambda days=days: analyze_endpoint(
                window=days, ignore_changes=False, pool=False))
              for days in TIME_OF_DAY_DAYS if days != 30),
            ("day-navigator", lambda: day_navigator_endpoint()),
            ("day-latest", warm_day(0)),
            ("day-before-latest", warm_day(1)),
        )

    async def run_shape(label, warm) -> None:
        """Run one warm shape in a worker thread, containing its failure."""
        shape_task = asyncio.create_task(asyncio.to_thread(_warming_call, warm))
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

    async def run_refreshes() -> None:
        """Compute every fixed result a read answered from its predecessor (#566),
        the lightest kind first, as the roster runs them, and in the order asked
        within a kind: a Meal size waits behind no analysis."""
        def weight(key):
            return _LIGHTEST.index(key[0]) if key[0] in _LIGHTEST else len(_LIGHTEST)
        while True:
            with refreshes_lock:
                if not refreshes:
                    return
                key = min(refreshes, key=weight)
                run = refreshes.pop(key)
            await run_shape(f"refresh {key[0]}", run)

    async def recompute_worker(event) -> None:
        """Run one complete warm shape at a time until shutdown.

        A newer cache version abandons the old set at its next shape boundary;
        the still-set event then causes one fresh complete roster, not a backlog.
        A result a read is waiting on is computed before the next shape (#566).
        """
        while True:
            await event.wait()
            while True:
                event.clear()
                await run_refreshes()
                if not warm_due.is_set():
                    if event.is_set():
                        continue
                    break
                warm_due.clear()
                revision = cache.version
                roster = app.state.recompute_roster()
                for index, (label, warm) in enumerate(roster):
                    await run_refreshes()
                    if cache.version != revision:
                        warm_due.set()  # superseded: one fresh complete roster
                        break
                    await run_shape(label, warm)
                    if cache.version != revision:
                        warm_due.set()
                        break
                    if index + 1 < len(roster):
                        await app.state.recompute_pace()

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
                           enable_fetch_loop=enable_fetch_loop, warm_on_start=True),
                host=host, port=port)
