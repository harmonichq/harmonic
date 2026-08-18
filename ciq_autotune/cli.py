"""The command you type: ``harmonic``.

Subcommands:

    harmonic fetch    pull live data from t:connect (needs the sync extra)
    harmonic basal    print the suggested basal profile
    harmonic backtest score the suggestion on held-out days
    harmonic dia-sweep calibrate DIA: coverage vs. estimate-drift per DIA
    harmonic report   write a markdown advisory report
    harmonic outcomes outcome summary: glycemic metrics + derived clean rates
    harmonic outcomes-trend behavioral + glycemic scorecard across rolling windows

The DB defaults to ``tconnect-data/ciq.db`` — inside the already-gitignored
folder, so nothing personal escapes the repo.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import List, Optional

from . import report as report_mod
from . import sync as sync_mod
from .backtest import BacktestResult, backtest, dia_sweep, render_dia_sweep
from .model import ModelConfig
from .store import Store

DEFAULT_DB = "tconnect-data/ciq.db"


def _load_env(path: str = ".env") -> None:
    """Populate ``os.environ`` from a ``.env`` file for keys not already set.

    Our own config (``TIMEZONE_NAME``, ``HARMONIC_*``) is read from ``os.environ``,
    but tconnectsync parses ``.env`` into its own module namespace via
    ``dotenv_values`` and never exports it. So nothing ever put
    ``TIMEZONE_NAME`` into the process environment and every timestamp silently
    converted against the ``UTC`` default (dinner shows up at 3am). Load it here
    at startup — stdlib-only, and without clobbering vars the shell already set.
    """
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def main(argv: Optional[List[str]] = None) -> int:
    _load_env()
    parser = argparse.ArgumentParser(prog="harmonic", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_fetch = sub.add_parser("fetch", help="pull live data from t:connect into the store")
    p_fetch.add_argument("--db", default=DEFAULT_DB)
    p_fetch.add_argument("--days", type=int, metavar="N",
                         help="pull the last N days (ending today)")
    p_fetch.add_argument("--start", metavar="YYYY-MM-DD",
                         help="window start (use with --end instead of --days)")
    p_fetch.add_argument("--end", metavar="YYYY-MM-DD", help="window end")
    p_fetch.add_argument("--region", choices=["US", "EU"],
                         help="override TCONNECT_REGION from .env")

    p_basal = sub.add_parser("basal", help="suggest a basal profile from clean windows")
    p_basal.add_argument("--db", default=DEFAULT_DB)
    p_basal.add_argument("--window", type=int, default=30, metavar="DAYS",
                         help="analysis window (default 30); each slot is cut to its own basal setting epoch")
    p_basal.add_argument("--bolus-clear", type=float, metavar="U",
                         help="bolus IOB at/below which a minute counts as bolus-free")
    p_basal.add_argument("--insulin-peak", type=float, metavar="MIN",
                         help="time to peak insulin activity (default 75)")
    p_basal.add_argument("--insulin-dia", type=float, metavar="MIN",
                         help="duration of insulin action (default 180)")
    p_basal.add_argument("--bg-low", type=float)
    p_basal.add_argument("--bg-high", type=float)
    p_basal.add_argument("--flat-slope", type=float, metavar="MGDL_MIN")

    p_an = sub.add_parser("analyze", help="full model (basal/ISF/I:C/behavioral) over one result")
    p_an.add_argument("--db", default=DEFAULT_DB)
    p_an.add_argument("--window", type=int, default=30, metavar="DAYS",
                      help="analysis window (default 30); ISF/I:C use the full window; basal slots keep basal setting-epoch measurement cuts")
    p_an.add_argument("--ignore-changes", action="store_true",
                      help="preview: ignore basal setting-epoch measurement cuts and setting-change caveats")
    p_an.add_argument("--json", action="store_true", help="emit the AnalysisResult as JSON")

    p_bt = sub.add_parser("backtest", help="score the suggestion on held-out days")
    p_bt.add_argument("--db", default=DEFAULT_DB)
    p_bt.add_argument("--holdout", type=int, default=2, metavar="DAYS")

    p_dia = sub.add_parser(
        "dia-sweep",
        help="calibrate DIA: coverage gained vs. estimate-drift as functions of DIA")
    p_dia.add_argument("--db", default=DEFAULT_DB)
    p_dia.add_argument("--dia", type=float, nargs="+", metavar="MIN",
                       help="DIA values to sweep (default: 120..300 around the baseline)")
    p_dia.add_argument("--baseline", type=float, metavar="MIN",
                       help="reference DIA for drift (default: ModelConfig default, 180)")
    p_dia.add_argument("--min-days", type=int, default=5, metavar="N",
                       help="distinct clean days a slot needs to count as covered (default 5)")

    p_serve = sub.add_parser("serve", help="run the HTTP API (needs the api extra)")
    p_serve.add_argument("--db", default=DEFAULT_DB)
    p_serve.add_argument("--host", default="127.0.0.1", help="bind address (localhost by default)")
    p_serve.add_argument("--port", type=int, default=8765)
    p_serve.add_argument("--token", default=None,
                         help="static bearer token (else HARMONIC_API_TOKEN env)")
    p_serve.add_argument("--no-fetch", action="store_true",
                         help="skip the startup live-fetch (safe for scratch/synthetic DBs)")

    p_out = sub.add_parser(
        "outcomes",
        help="outcome summary: glycemic metrics + derived clean rates over a window")
    p_out.add_argument("--db", default=DEFAULT_DB)
    p_out.add_argument("--window", type=int, default=14, metavar="DAYS",
                       help="flat window (default 14; 30/90 typical)")
    p_out.add_argument("--json", action="store_true", help="emit the OutcomeSummary as JSON")

    p_trend = sub.add_parser(
        "outcomes-trend",
        help="outcomes trend: behavioral + glycemic scorecard across rolling windows")
    p_trend.add_argument("--db", default=DEFAULT_DB)
    p_trend.add_argument("--window", type=int, default=14, metavar="DAYS",
                         help="rolling window width (default 14)")
    p_trend.add_argument("--json", action="store_true", help="emit the OutcomesTrend as JSON")

    p_report = sub.add_parser("report", help="write a markdown advisory report")
    p_report.add_argument("--db", default=DEFAULT_DB)
    p_report.add_argument("--out", default="tconnect-data/report.md")
    p_report.add_argument("--window", type=int, default=30, metavar="DAYS",
                          help="analysis window (default 30); ISF/I:C use the full window; basal slots keep basal setting-epoch measurement cuts")
    p_report.add_argument("--holdout", type=int, default=2, metavar="DAYS")
    p_report.add_argument("--plot", action="store_true",
                          help="also write a why-plot PNG (needs matplotlib)")

    args = parser.parse_args(argv)

    if args.cmd == "fetch":
        return _cmd_fetch(args)
    if args.cmd == "basal":
        return _cmd_basal(args)
    if args.cmd == "analyze":
        return _cmd_analyze(args)
    if args.cmd == "serve":
        return _cmd_serve(args)
    if args.cmd == "backtest":
        return _cmd_backtest(args)
    if args.cmd == "dia-sweep":
        return _cmd_dia_sweep(args)
    if args.cmd == "report":
        return _cmd_report(args)
    if args.cmd == "outcomes":
        return _cmd_outcomes(args)
    if args.cmd == "outcomes-trend":
        return _cmd_outcomes_trend(args)
    parser.error("unknown command")  # unreachable (required=True)


def _cmd_outcomes(args) -> int:
    from .outcomes import markdown_outcomes, summarize_outcomes

    with Store.open(args.db) as store:
        summary = summarize_outcomes(store, window_days=args.window)
    print(summary.to_json(indent=2) if args.json else markdown_outcomes(summary))
    return 0


def _cmd_outcomes_trend(args) -> int:
    from .outcomes_trend import markdown_trend, summarize_trend

    with Store.open(args.db) as store:
        trend = summarize_trend(store, window_days=args.window)
    print(trend.to_json(indent=2) if args.json else markdown_trend(trend))
    return 0


def _cmd_analyze(args) -> int:
    from .analyze import analyze
    from .render import render_text

    with Store.open(args.db) as store:
        result = analyze(store, window_days=args.window,
                         ignore_setting_changes=args.ignore_changes,
                         carb_entries=store.carb_entries(),
                         prompt_responses=store.prompt_responses())
    print(result.to_json(indent=2) if args.json else render_text(result))
    return 0


def _cmd_serve(args) -> int:
    try:
        from .api import serve
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    print(f"Serving Harmonic API on http://{args.host}:{args.port} (db: {args.db})")
    serve(host=args.host, port=args.port, db_path=args.db, token=args.token,
          enable_fetch_loop=False if args.no_fetch else None)
    return 0


def _cmd_fetch(args) -> int:
    if args.days is not None:
        end = date.today()
        start = end - timedelta(days=args.days)
    elif args.start and args.end:
        start, end = args.start, args.end
    else:
        print("fetch needs either --days N or both --start and --end.", file=sys.stderr)
        return 2

    try:
        with Store.open(args.db) as store:
            written = sync_mod.pull_from_tconnect(
                store, start=start, end=end, region=args.region
            )
            counts = store.counts()
    except RuntimeError as e:
        print(f"Fetch failed: {e}", file=sys.stderr)
        return 1

    print(f"Pulled {start} -> {end}:")
    for table, n in written.items():
        print(f"  {table:<14} {n:>6} rows")
    print(f"\nStore: {args.db}")
    print("  " + "  ".join(f"{k}={v}" for k, v in counts.items()))
    return 0


def _cmd_basal(args) -> int:
    # Focused basal view over the same non-gating AnalysisResult as `analyze`:
    # every slot shows its estimate + CI (thin slots wide, never blanked — §8),
    # epoch-grounded per slot. No actionable/informational gate.
    from .analyze import analyze
    from .render import render_basal

    overrides = {}
    if args.bolus_clear is not None:
        overrides["bolus_clear_u"] = args.bolus_clear
    if args.insulin_peak is not None:
        overrides["insulin_peak_min"] = args.insulin_peak
    if args.insulin_dia is not None:
        overrides["insulin_dia_min"] = args.insulin_dia
    if args.bg_low is not None:
        overrides["bg_low"] = args.bg_low
    if args.bg_high is not None:
        overrides["bg_high"] = args.bg_high
    if args.flat_slope is not None:
        overrides["flat_slope_per_min"] = args.flat_slope
    cfg = ModelConfig(**overrides)

    with Store.open(args.db) as store:
        result = analyze(store, window_days=args.window, config=cfg,
                         carb_entries=store.carb_entries(),
                         prompt_responses=store.prompt_responses())
    print(render_basal(result))
    return 0


def _load(args) -> "tuple":
    """Read every stream the model/backtest need from the store."""
    with Store.open(args.db) as store:
        return (store.basal_events(), store.cgm_readings(),
                store.bolus_events(), store.pump_events())


def _cmd_backtest(args) -> int:
    basal, cgm, bolus, pump = _load(args)
    bt = backtest(basal, cgm, bolus, pump, holdout_days=args.holdout)
    print(render_backtest(bt))
    return 0


def _cmd_dia_sweep(args) -> int:
    basal, cgm, bolus, pump = _load(args)
    sweep = dia_sweep(
        basal, cgm, bolus, pump,
        dia_values=args.dia,
        baseline_dia_min=args.baseline,
        min_days=args.min_days,
    )
    print(render_dia_sweep(sweep))
    return 0


def _cmd_report(args) -> int:
    # Same non-gating AnalysisResult as `analyze`/`basal` (§8): the report used to
    # build its own gated ProfileSuggestion/Advisory, which blanked thin slots
    # instead of showing a wide CI. backtest() and write_why_plot() still need the
    # raw streams directly, alongside analyze()'s own read of the same tables.
    from .analyze import analyze

    with Store.open(args.db) as store:
        basal, cgm, bolus, pump = (store.basal_events(), store.cgm_readings(),
                                   store.bolus_events(), store.pump_events())
        result = analyze(store, window_days=args.window,
                         carb_entries=store.carb_entries(),
                         prompt_responses=store.prompt_responses())
    bt = backtest(basal, cgm, bolus, pump, holdout_days=args.holdout)
    md = report_mod.markdown_report(result, bt)
    with open(args.out, "w") as fh:
        fh.write(md)
    print(f"Wrote {args.out}")
    if args.plot:
        png = os.path.splitext(args.out)[0] + ".png"
        written = report_mod.write_why_plot(png, basal, cgm, bolus, pump)
        if written:
            print(f"Wrote {written}")
        else:
            print("Skipped plot: matplotlib not installed "
                  "(pip install harmonic[report]).", file=sys.stderr)
    return 0


def render_backtest(bt: BacktestResult) -> str:
    lines = [
        f"Backtest: held out {bt.holdout_days} day(s), trained on {bt.train_days}.",
        f"Scored against {bt.test_clean_minutes} clean held-out minute(s).",
    ]
    if bt.mae_suggested is not None:
        lines.append(f"Suggested-vs-delivered MAE = {bt.mae_suggested:.3f} U/h "
                     f"over {bt.n_suggested} minute(s).")
    if bt.n_matched == 0:
        lines.append("No head-to-head: not enough overlap of known-current and "
                     "suggested rates on held-out clean minutes. Collect more days, "
                     "or wire the live profile pull to fill in current rates.")
        return "\n".join(lines)
    lines += [
        f"On {bt.n_matched} matched minute(s):",
        f"  current   MAE = {bt.mae_current_matched:.3f} U/h",
        f"  suggested MAE = {bt.mae_suggested_matched:.3f} U/h",
    ]
    imp = bt.improvement
    verdict = "better" if imp > 0 else ("worse" if imp < 0 else "no different")
    lines.append(f"  -> suggestion is {verdict} by {abs(imp):.3f} U/h MAE.")
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
