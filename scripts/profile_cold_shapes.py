#!/usr/bin/env python3
"""Time the computations a cold Diagnose arrival runs, against a snapshot (#82).

Every expensive Diagnose result lives only in the in-process `ResultCache`, so a
restart makes all of them cold even when the database has not changed (#82). The
persistence design that fixes that has to target the dominant costs, and the only
honest way to find them is to measure them on a real-shaped database.

This harness runs each cold-arrival shape once, one at a time, and prints its wall
time. `--profile <shape>` additionally prints that shape's cProfile leaders, which
is what names the dominant scans.

    uv run python scripts/profile_cold_shapes.py --db <snapshot>
    uv run python scripts/profile_cold_shapes.py --db <snapshot> --profile findings-case-preparation

The shape list and its order are the cold arrival the retired v1 page measured,
kept as the fixed profiling order so runs stay comparable across the ADR 416
cutover.

**Snapshot discipline.** The database is opened with `Store.open_readonly`, whose
`immutable=1` mode asserts nothing else is writing the file: point this at a copy
taken with `sqlite3 <db> ".backup <dest>"`, never at the live database a `serve` is
writing. Nothing here writes, fetches, or prints a record — timings and function
names only, because CI logs are public.
"""

from __future__ import annotations

import argparse
import cProfile
import io
import pstats
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ciq_autotune.store import Store  # noqa: E402

DIAGNOSE_WINDOW_DAYS = 30


def _analyze(store, *, pool: bool):
    """`/api/analyze`: unpooled for the landing read, pooled for Diagnose (ADR 0032)."""
    from ciq_autotune.analyze import analyze

    analyze(store, window_days=DIAGNOSE_WINDOW_DAYS, ignore_setting_changes=False,
            pool_agreeing_basal_regimes=pool, carb_entries=store.carb_entries(),
            prompt_responses=store.prompt_responses()).to_dict()


def _scenarios(store):
    """`/api/scenarios`."""
    from ciq_autotune.analyzers.scenario import build_scenarios

    build_scenarios(store, window_days=DIAGNOSE_WINDOW_DAYS).to_dict()


def _time_of_day(store):
    """`/api/explore/time-of-day`."""
    from ciq_autotune.explore_time_of_day import build_time_of_day

    build_time_of_day(store)


def _exposures(store):
    """`/api/explore/exposures`, independent of retired comparison projections."""
    from ciq_autotune.explore_exposures import build_exposures

    build_exposures(store, window_days=DIAGNOSE_WINDOW_DAYS)


def _findings_case_preparation(store):
    """`/api/diagnose/finding-case-file-preparation` for the unscoped 24h queue.

    `prepare` builds the findings projection (analysis + exposures + scenarios) and
    the case population; `wrap` renders every finding's clock case, which is what
    the endpoint returns.
    """
    from ciq_autotune.finding_case_file import prepare, wrap
    from ciq_autotune.window_membership import WindowQuery

    wrap(prepare(store, query=WindowQuery.whole_day(), version=0))


def _outcomes_trend(store):
    """`/api/outcomes/trend`: the one watched change, with no window (#447)."""
    from ciq_autotune.outcomes_trend import trend_watched_change

    trend_watched_change(store)


# Cold-arrival shapes in the order the SPA requests them.
SHAPES = (
    ("analyze", lambda store: _analyze(store, pool=False)),
    ("analyze-pooled", lambda store: _analyze(store, pool=True)),
    ("scenarios", _scenarios),
    ("explore-time-of-day", _time_of_day),
    ("exposures", _exposures),
    ("findings-case-preparation", _findings_case_preparation),
    ("outcomes-trend", _outcomes_trend),
)


def run_shape(db_path: str, shape, *, profile_top: int = 0) -> tuple[float, str]:
    """Run one shape against its own read-only connection, as its endpoint does.

    Each endpoint opens its own `Store` per request, so a fresh connection per shape
    is the honest cold measurement: no page cache warmed inside SQLite's connection,
    no rows carried between shapes.
    """
    profiler = cProfile.Profile() if profile_top else None
    with Store.open_readonly(db_path) as store:
        started = time.perf_counter()
        if profiler is not None:
            profiler.enable()
        shape(store)
        if profiler is not None:
            profiler.disable()
        elapsed = time.perf_counter() - started
    if profiler is None:
        return elapsed, ""
    buffer = io.StringIO()
    pstats.Stats(profiler, stream=buffer).sort_stats("cumulative").print_stats(profile_top)
    return elapsed, buffer.getvalue()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--db", required=True,
                        help="a snapshot COPY (sqlite3 '.backup'), never the live database")
    parser.add_argument("--shape", action="append", default=[],
                        help="run only this shape (repeatable); default is every shape")
    parser.add_argument("--profile", action="append", default=[],
                        help="also print this shape's cProfile leaders (repeatable)")
    parser.add_argument("--top", type=int, default=25,
                        help="how many profile lines to print (default 25)")
    args = parser.parse_args(argv)

    known = {name for name, _run in SHAPES}
    unknown = (set(args.shape) | set(args.profile)) - known
    if unknown:
        parser.error(f"unknown shape(s): {', '.join(sorted(unknown))}; "
                     f"known: {', '.join(sorted(known))}")

    selected = [(name, run) for name, run in SHAPES
                if not args.shape or name in args.shape]

    total = 0.0
    for name, run in selected:
        top = args.top if name in args.profile else 0
        try:
            elapsed, profile_text = run_shape(args.db, run, profile_top=top)
        except Exception as error:  # a shape that cannot run is reported, not hidden
            print(f"{name:<28} FAILED  {type(error).__name__}: {error}", flush=True)
            continue
        total += elapsed
        print(f"{name:<28} {elapsed:8.2f}s", flush=True)
        if profile_text:
            print(profile_text, flush=True)
    print(f"{'cold arrival, serialized':<28} {total:8.2f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
