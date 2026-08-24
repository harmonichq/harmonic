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

The shape list and its order come from the SPA's own cold arrival: `loadAll` runs
the backtest and the standard analysis, then Diagnose's `loadAudit` runs the other
six (`frontend/index.html`). The two warm-set-only shapes at the end are not part of
that arrival; they are here because the hourly pre-warm computes them (`api.py`
`invalidate_and_warm`), so their cost is measurable drift rather than user-facing
latency.

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


def _backtest(store):
    """`/api/backtest` (holdout 2): the SPA's first heavy read."""
    from ciq_autotune.backtest import backtest

    backtest(store.basal_events(), store.cgm_readings(), store.bolus_events(),
             store.pump_events(), holdout_days=2)


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


def _event_comparison_preparation(store):
    """The shared source/classifier preparation.

    `/api/explore/exposures` returns this preparation's `exposure_payload`, so the
    exposures feed the cold arrival asks for and the "event-comparison" shape the
    hourly warm pass computes are one and the same read.
    """
    from ciq_autotune.event_comparison import prepare_event_comparisons

    prepare_event_comparisons(store)


def _findings_case_preparation(store):
    """`/api/diagnose/finding-case-file-preparation` for the unscoped 24h queue.

    `prepare` builds the findings projection (analysis + exposures + scenarios) and
    the case population; `wrap` renders every finding's clock case, which is what
    the endpoint returns.
    """
    from ciq_autotune.finding_case_file import prepare, wrap
    from ciq_autotune.window_membership import WindowQuery

    wrap(prepare(store, query=WindowQuery.whole_day(), version=0))


def _outcomes_trend(store, *, window: int):
    """`/api/outcomes/trend`: Diagnose asks for 30, the hourly warm pass warms 14."""
    from ciq_autotune.outcomes_trend import summarize_trend

    summarize_trend(store, window_days=window).to_dict()


# Cold-arrival shapes in the order the SPA requests them, then the warm-set-only ones.
SHAPES = (
    ("backtest", "cold", _backtest),
    ("analyze", "cold", lambda store: _analyze(store, pool=False)),
    ("analyze-pooled", "cold", lambda store: _analyze(store, pool=True)),
    ("scenarios", "cold", _scenarios),
    ("explore-time-of-day", "cold", _time_of_day),
    ("exposures", "cold", _event_comparison_preparation),
    ("findings-case-preparation", "cold", _findings_case_preparation),
    ("outcomes-trend-30", "cold", lambda store: _outcomes_trend(store, window=30)),
    ("outcomes-trend-14", "warm-only", lambda store: _outcomes_trend(store, window=14)),
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
                        help="run only this shape (repeatable); default is every cold shape")
    parser.add_argument("--profile", action="append", default=[],
                        help="also print this shape's cProfile leaders (repeatable)")
    parser.add_argument("--top", type=int, default=25,
                        help="how many profile lines to print (default 25)")
    parser.add_argument("--warm-only", action="store_true",
                        help="include the shapes only the hourly pre-warm computes")
    args = parser.parse_args(argv)

    known = {name for name, _stage, _run in SHAPES}
    unknown = (set(args.shape) | set(args.profile)) - known
    if unknown:
        parser.error(f"unknown shape(s): {', '.join(sorted(unknown))}; "
                     f"known: {', '.join(sorted(known))}")

    selected = [(name, stage, run) for name, stage, run in SHAPES
                if (name in args.shape if args.shape
                    else stage == "cold" or args.warm_only)]

    total = 0.0
    for name, stage, run in selected:
        top = args.top if name in args.profile else 0
        try:
            elapsed, profile_text = run_shape(args.db, run, profile_top=top)
        except Exception as error:  # a shape that cannot run is reported, not hidden
            print(f"{name:<28} FAILED  {type(error).__name__}: {error}", flush=True)
            continue
        if stage == "cold":
            total += elapsed
        print(f"{name:<28} {elapsed:8.2f}s  ({stage})", flush=True)
        if profile_text:
            print(profile_text, flush=True)
    print(f"{'cold arrival, serialized':<28} {total:8.2f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
