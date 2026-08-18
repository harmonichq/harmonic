#!/usr/bin/env python3
"""Generate local v2 Meals and Lows projection evidence from one snapshot.

Run against a local database snapshot (see ``DB_PATH`` below). The historical
v1 capture remains a locked mock input; this producer writes only the literal
server projections from ADR 678.
"""

from __future__ import annotations

import json
from pathlib import Path

from ciq_autotune.event_comparison import ComparisonQuery, prepare_event_comparisons
from ciq_autotune.store import Store


ROOT = Path(__file__).resolve().parents[2]
MEALS_OUT_PATH = ROOT / "tconnect-data/issue-677-meals.projection.json"
LOWS_OUT_PATH = ROOT / "tconnect-data/issue-677-lows.projection.json"
DB_PATH = ROOT / "tconnect-data/ciq.db"


def project_evidence(store) -> tuple[dict, dict]:
    """Project the two settled views through ADR 678's public interface."""
    preparation = prepare_event_comparisons(store)
    return (
        preparation.project(ComparisonQuery.meals()),
        preparation.project(ComparisonQuery.lows()),
    )


def main() -> None:
    with Store.open_readonly(str(DB_PATH)) as store:
        meals, lows = project_evidence(store)

    for path, projection in ((MEALS_OUT_PATH, meals), (LOWS_OUT_PATH, lows)):
        path.write_text(json.dumps(projection, separators=(",", ":")))
    print(
        "wrote", MEALS_OUT_PATH, "· occurrences", len(meals["occurrences"]),
        "\nwritten", LOWS_OUT_PATH, "· occurrences", len(lows["occurrences"]),
    )


if __name__ == "__main__":
    main()
