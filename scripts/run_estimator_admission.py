#!/usr/bin/env python3
"""Run the committed synthetic admission bar for a named I:C estimator."""

from __future__ import annotations

import argparse
from copy import deepcopy
import json

from ciq_autotune.admission import run_synthetic_bar
from ciq_autotune.analyzers.ic import analyze_ic_blocks
from ciq_autotune.analyzers.ic_regression import analyze_ic_blocks_fuzzy

if __package__:
    from .gen_estimator_truth import chained_run_sets, known_ratio_sets, placebo_sets
else:
    from gen_estimator_truth import chained_run_sets, known_ratio_sets, placebo_sets


def run_bar(name: str) -> dict:
    chained = deepcopy(chained_run_sets())
    if name == "incumbent":
        estimator = analyze_ic_blocks
        for truth_set in chained:
            truth_set["gated"] = False
    elif name == "candidate":
        estimator = analyze_ic_blocks_fuzzy
    else:
        raise ValueError(f"unknown estimator: {name}")
    return run_synthetic_bar(
        estimator,
        known_sets=known_ratio_sets() + chained,
        placebo_sets=placebo_sets(),
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("estimator", choices=("incumbent", "candidate"))
    args = parser.parse_args()
    report = run_bar(args.estimator)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["recovery_passed"] and report["placebo_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
