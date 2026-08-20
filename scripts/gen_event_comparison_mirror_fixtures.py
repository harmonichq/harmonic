#!/usr/bin/env python3
"""Freeze event-comparison's Python projection for its fixture-only JS mirror.

The browser replays cannot run Python, so ``project.mjs`` transcribes the
committed capture.  This generator runs the real projection method over that
same capture and freezes a deliberately varied coordinate set beside it.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ciq_autotune.event_comparison import (  # noqa: E402
    ComparisonQuery,
    EventComparisonPreparation,
)
from ciq_autotune.window_membership import WindowQuery  # noqa: E402

CAPTURE = ROOT / "mockups" / "diagnose-event-comparison.synthetic" / "capture.json"
OUT = ROOT / "frontend" / "__fixtures__" / "event-comparison-mirror.json"

WINDOWS = {
    "meals_default": ComparisonQuery.meals(),
    "lows_default": ComparisonQuery.lows(),
    "midday": ComparisonQuery.meals(window=WindowQuery.clock(12 * 60, 16 * 60)),
    "wrapping": ComparisonQuery.lows(window=WindowQuery.clock(22 * 60, 2 * 60)),
    "withheld": ComparisonQuery.meals(window=WindowQuery.clock(6 * 60, 8 * 60)),
    "selection": ComparisonQuery.meals(occurrence_id="meals-synthetic-2"),
}


def prepared() -> EventComparisonPreparation:
    capture = json.loads(CAPTURE.read_text())
    return EventComparisonPreparation(
        _exposures={"window": capture["source_window"]},
        _catalog={name: view["occurrences"] for name, view in capture["views"].items()},
    )


def payload() -> dict:
    projection = prepared()
    return {
        "_generated_by": "scripts/gen_event_comparison_mirror_fixtures.py",
        "_note": ("SYNTHETIC. The answers are EventComparisonPreparation.project "
                  "over the committed synthetic capture; project.mjs is held to them."),
        "windows": {name: projection.project(query) for name, query in WINDOWS.items()},
    }


def main() -> int:
    args = argparse.ArgumentParser()
    args.add_argument("--check", action="store_true")
    check = args.parse_args().check
    text = json.dumps(payload(), indent=1, sort_keys=True) + "\n"
    if check:
        if not OUT.exists() or OUT.read_text() != text:
            print(f"stale fixture: {OUT} — rerun scripts/gen_event_comparison_mirror_fixtures.py")
            return 1
        print(f"event-comparison mirror fixtures current ({OUT})")
        return 0
    OUT.write_text(text)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
