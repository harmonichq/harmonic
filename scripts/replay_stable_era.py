#!/usr/bin/env python3
"""Run the stable-era I:C estimator replay against a local SQLite snapshot."""

from __future__ import annotations

import argparse
import importlib
import sys
from datetime import datetime

from ciq_autotune.analyzers.ic import analyze_ic_blocks
from ciq_autotune.replay import ReplayWindow, WindowRefused, run_replay
from ciq_autotune.store import Store


def _timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _candidate(value: str):
    if value == "incumbent":
        return analyze_ic_blocks
    module_name, separator, name = value.partition(":")
    if not separator or not module_name or not name:
        raise argparse.ArgumentTypeError("candidate must be 'incumbent' or module:callable")
    candidate = getattr(importlib.import_module(module_name), name, None)
    if not callable(candidate):
        raise argparse.ArgumentTypeError("candidate must name a callable")
    return candidate


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", help="local SQLite snapshot to open read-only")
    parser.add_argument("--block", type=int, required=True, dest="block_id")
    parser.add_argument("--window-start", type=_timestamp, required=True)
    parser.add_argument("--window-end", type=_timestamp, required=True)
    parser.add_argument("--step-days", type=int, default=7)
    parser.add_argument("--candidate", type=_candidate, default=analyze_ic_blocks)
    args = parser.parse_args()
    store = Store.open_readonly(args.snapshot)
    try:
        report = run_replay(
            store, args.candidate, block_id=args.block_id,
            window=ReplayWindow(args.window_start, args.window_end),
            step_days=args.step_days,
        )
    except WindowRefused as exc:
        print(str(exc), file=sys.stderr)
        return 2
    finally:
        store.close()
    print(report.render())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
