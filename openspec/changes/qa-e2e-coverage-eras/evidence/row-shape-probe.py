#!/usr/bin/env python3
"""Freeze serialized analyzer-row shapes for the QA E2E coverage contract."""

from __future__ import annotations

import json
import sys
import tempfile
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO_ROOT))

from ciq_autotune.analyzers.ic import BLOCK_WINDOW_DAYS
from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES, WINDOW_DAYS, execute_case, materialize_case


def _showcase_case():
    return next(case for case in QA_CASES if case.name == "showcase")


def _extend_dense_background(store: Store) -> None:
    """Extend showcase to the same 91-inclusive-day span as span-probe.py."""
    existing_first = min(row.t for row in store.cgm_readings()).date()
    extra_days = BLOCK_WINDOW_DAYS + 1 - WINDOW_DAYS
    first = existing_first - timedelta(days=extra_days)
    cgm: list[dict] = []
    basal: list[dict] = []
    bolus: list[dict] = []
    for offset in range(extra_days):
        current = first + timedelta(days=offset)
        cgm.extend(
            {
                "EventDateTime": _stamp(current, minute),
                "Readings (CGM / BGM)": 120.0,
                "Description": "Synthetic EGV",
            }
            for minute in range(0, 24 * 60, 5)
        )
        basal.extend(
            {
                "seq" "_num": 100_000 + offset * 288 + minute // 5,
                "time": _stamp(current, minute),
                "delivery_type": "algorithmDelivery",
                "duration_mins": 5,
                "basal_rate": 0.48 if 180 <= minute < 240 else 0.6,
                "profile_basal_rate": 0.6,
            }
            for minute in range(0, 24 * 60, 5)
        )
        bolus.append({
            "seq" "_num": 50_000 + offset,
            "request_time": f"{current.isoformat()} 08:00:00",
            "description": "Synthetic meal bolus",
            "completion": "Completed",
            "insulin": 4.0,
            "requested_insulin": 4.0,
            "carbs": 48.0,
            "carb_ratio": 12.0,
        })
    store.upsert_cgm(cgm)
    store.upsert_basal(basal)
    store.upsert_bolus(bolus)


def _stamp(current: date, minute: int) -> str:
    return f"{current.isoformat()} {minute // 60:02d}:{minute % 60:02d}:00"


def _histogram(values: list[tuple]) -> list[dict]:
    counts = Counter(values)
    return [
        {"values": list(values), "count": count}
        for values, count in sorted(counts.items(), key=lambda item: repr(item[0]))
    ]


def _print_shapes(name: str, analysis: dict) -> None:
    basal = analysis["basal"]
    isf = analysis["isf"]
    ic = analysis["ic_blocks"]
    print(f"{name} basal row keys: {json.dumps(sorted(basal[0]))}")
    print(
        f"{name} basal safety_status histogram: "
        f"{json.dumps(_histogram([(row.get('safety_status'),) for row in basal]), sort_keys=True)}"
    )
    print(f"{name} ISF row keys: {json.dumps(sorted(isf[0]))}")
    print(
        f"{name} ISF direction/asserts_move histogram: "
        f"{json.dumps(_histogram([(row['evidence'].get('direction'), row.get('asserts_move')) for row in isf]), sort_keys=True)}"
    )
    print(f"{name} I:C row keys: {json.dumps(sorted(ic[0]))}")
    print(
        f"{name} I:C state/direction/held_reason/asserts_move/days_observed-presence histogram: "
        f"{json.dumps(_histogram([(row.get('state'), row.get('direction'), row.get('held_reason'), row.get('asserts_move'), 'days_observed' in row) for row in ic]), sort_keys=True)}"
    )


def main() -> None:
    with tempfile.TemporaryDirectory() as raw_directory:
        directory = Path(raw_directory)
        with Store.open(str(directory / "showcase.sqlite")) as store:
            materialize_case(store, _showcase_case())
            short_analysis = execute_case(store).analysis
        with Store.open(str(directory / "long-span.sqlite")) as store:
            materialize_case(store, _showcase_case())
            _extend_dense_background(store)
            long_analysis = execute_case(store).analysis

    _print_shapes("30-day showcase", short_analysis)
    _print_shapes("91-day showcase", long_analysis)


if __name__ == "__main__":
    main()
