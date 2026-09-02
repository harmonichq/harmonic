#!/usr/bin/env python3
"""Probe how isolated QA-store span controls I:C analyzer state."""

from __future__ import annotations

import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO_ROOT))

from ciq_autotune.analyze import _BOLUS_LEADIN, analyze
from ciq_autotune.analyzers.ic import BLOCK_WINDOW_DAYS
from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES, WINDOW_DAYS, materialize_case


def _showcase_case():
    return next(case for case in QA_CASES if case.name == "showcase")


def _extend_dense_background(store: Store) -> None:
    """Extend showcase backward to the I:C span using its dense recipe."""
    existing_first = min(row.t for row in store.cgm_readings()).date()
    required_days = BLOCK_WINDOW_DAYS + _BOLUS_LEADIN.days
    extra_days = required_days - WINDOW_DAYS
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
        bolus.extend(({
            "seq" "_num": 50_000 + offset,
            "request_time": f"{current.isoformat()} 08:00:00",
            "description": "Synthetic meal bolus",
            "completion": "Completed",
            "insulin": 4.0,
            "requested_insulin": 4.0,
            "carbs": 48.0,
            "carb_ratio": 12.0,
        },))
    store.upsert_cgm(cgm)
    store.upsert_basal(basal)
    store.upsert_bolus(bolus)


def _stamp(current: date, minute: int) -> str:
    return f"{current.isoformat()} {minute // 60:02d}:{minute % 60:02d}:00"


def _analyze(store: Store) -> dict:
    return analyze(
        store,
        window_days=WINDOW_DAYS,
        pool_agreeing_basal_regimes=True,
        carb_entries=store.carb_entries(),
        prompt_responses=store.prompt_responses(),
    ).to_dict()


def _print_span(name: str, result: dict) -> None:
    blocks = result["ic_blocks"]
    observed_days = sorted({
        row.get("days_observed", BLOCK_WINDOW_DAYS) for row in blocks
    })
    states = [(row["label"], row["state"]) for row in blocks]
    print(f"{name} observed_days: {observed_days}")
    print(f"{name} I:C states: {states}")


def main() -> None:
    with tempfile.TemporaryDirectory() as raw_directory:
        directory = Path(raw_directory)
        with Store.open(str(directory / "showcase.sqlite")) as store:
            materialize_case(store, _showcase_case())
            short_result = _analyze(store)
        with Store.open(str(directory / "long-span.sqlite")) as store:
            materialize_case(store, _showcase_case())
            _extend_dense_background(store)
            long_result = _analyze(store)

    _print_span("30-day showcase", short_result)
    print(f"30-day showcase ISF row count: {len(short_result['isf'])}")
    _print_span("long-span showcase", long_result)


if __name__ == "__main__":
    main()
