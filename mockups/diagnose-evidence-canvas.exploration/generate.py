#!/usr/bin/env python3
"""Generate the evidence-canvas exploration from committed workstation fixtures.

The approved reference mock for the evidence canvas renders one person's own pump
history, so it stays local-only. This generator rebuilds the same composition from
the committed Diagnose workstation synthetic fixture set, which is what makes the
design reviewable, diffable and regenerable in the open.

``index.html`` is generated; never hand-edit it. ``--check`` regenerates in memory
and byte-compares, so a fixture that moves without a regenerated exploration fails
CI instead of drifting silently.

    uv run python mockups/diagnose-evidence-canvas.exploration/generate.py
    uv run python mockups/diagnose-evidence-canvas.exploration/generate.py --check
"""
from __future__ import annotations

import argparse
import json
import pathlib
import random

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
FIXTURES = "mockups/diagnose-workstation.synthetic/"

# The two block-evidence cases carrying nine runs each. Chosen for render density
# alone — the lock evidence needs tiles with enough marks to judge — and saying
# nothing about which case a real evening or morning block resembles.
EVENING_CASE = "cross_midnight"
MORNING_CASE = "directional_only"


def read(name: str) -> dict:
    return json.loads((ROOT / name).read_text())


def isf_scatter(steps: list) -> list:
    """Rest-window steps as (insulin acted, delta BG) pairs, with a drawable y.

    The x values are the capture's own. The y values are invented under a fixed
    seed: the committed capture holds every synthetic reading at one glucose
    value, so its ``dbg`` is uniformly 0.0 and a scatter drawn from it collapses
    to a flat line under a slope-0 fit. These are marks for a design render, not
    a measurement — the README and the page's own sheet note both say so.
    """
    rng = random.Random(135)
    return [[s["insulin_acted"], 32 - 720 * s["insulin_acted"] + rng.gauss(0, 7)]
            for s in steps]


def fit(points: list) -> tuple:
    """Ordinary least squares over the drawn points, so the fit line matches them."""
    x_bar = sum(x for x, _ in points) / len(points)
    y_bar = sum(y for _, y in points) / len(points)
    slope = (sum((x - x_bar) * (y - y_bar) for x, y in points)
             / sum((x - x_bar) ** 2 for x, _ in points))
    return slope, y_bar - slope * x_bar


def payload() -> dict:
    app = read(FIXTURES + "payload.json")
    isf_capture = read(FIXTURES + "isf-rest-window-evidence.capture.json")
    ic_capture = read(FIXTURES + "ic-block-evidence.capture.json")

    pooled = app["evidence"]["pooled"]
    bins = [[b[k] for k in ("minute", "median", "p25", "p75", "p10", "p90", "n", "raw_n")]
            for b in pooled["bins"]]
    # Index 1 is a meal COUNT: the strip sizes each mark by it and sums it into the
    # etched "Meals" readout. Carbs there would print a carb total as a meal tally.
    meals = [[m["minute"], m["count"]] for m in pooled["meals"]]

    basal = [[s["label"], s["current"], s["estimate"]["value"],
              s["estimate"]["lo"], s["estimate"]["hi"], s["days"]]
             for s in app["analyze"]["basal"]]

    isf = app["analyze"]["isf"][0]
    points = isf_scatter(isf_capture["payload"]["steps"])
    slope, intercept = fit(points)
    # Same reason as the scatter: the capture's per-night fits cycle through three
    # values, which draws as a repeating sawtooth rather than a distribution.
    nights = [[str(i + 1), 42 + random.Random(420 + i).gauss(0, 12)]
              for i, _ in enumerate(isf["evidence"]["night_fits"])]

    blocks = {b["block_id"]: b for b in app["analyze"]["ic_blocks"]}

    def block(block_id: int, case: str) -> dict:
        evidence = ic_capture["cases"][case]
        return {
            "current": blocks[block_id]["current_values"][0],
            "scatter": [[int(r["t"][11:13]) * 60 + int(r["t"][14:16]),
                         r.get("true_ic", 0), not r["directional_only"], r["in_pool"]]
                        for r in evidence["runs"]],
            "series": [{"pts": [[p["minute"], p["bg"]] for p in s["points"]]}
                       for s in evidence["series"]],
        }

    days = app["evidence"]["window"]["data_days"]
    return {
        "strip": {"bins": bins, "meals": meals, "days": days},
        "basal": basal,
        "isf": {"pts": points, "nights": nights, "programmed": isf["current"],
                "slope": slope, "intercept": intercept},
        "ic660": block(660, EVENING_CASE),
        "ic420": block(420, MORNING_CASE),
        "window": {"days": days},
    }


def render() -> str:
    template = (HERE / "canvas.tpl.html").read_text()
    blob = json.dumps(payload(), sort_keys=True, separators=(",", ":"))
    return template.replace("/*__DATA__*/", "const D = " + blob + ";")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="fail if the committed exploration is stale")
    parser.add_argument("--out", type=pathlib.Path, default=HERE / "index.html")
    args = parser.parse_args()

    text = render()
    current = args.out.read_text() if args.out.exists() else ""
    if args.check:
        if current != text:
            print(f"stale generated exploration: {args.out} —"
                  f" rerun {HERE / 'generate.py'}")
            return 1
        print(f"evidence-canvas exploration current ({args.out})")
        return 0

    args.out.write_text(text)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
