#!/usr/bin/env python3
"""Probe a carb-bearing coverage era concatenated ahead of the QA showcase."""

from __future__ import annotations

import sqlite3
import sys
import tempfile
import time
from dataclasses import replace
from datetime import timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO_ROOT))

from ciq_autotune.store import Store
from scripts.qa_e2e_cases import (
    QA_CASES,
    assert_expectation,
    execute_case,
    materialize_case,
)


EARLIER_SHIFT = timedelta(days=150)
EARLIER_SEQ_OFFSET = 100_000
EARLIER_RATIO = 14.0
TABLES = ("basal_events", "bolus_events", "cgm_readings", "profile_settings")


def _case(name: str):
    return next(case for case in QA_CASES if case.name == name)


def _stamp(value) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S")


def _settings_at_ratio(settings, ratio: float):
    profiles = tuple(
        replace(
            profile,
            segments=tuple(replace(segment, carb_ratio=ratio) for segment in profile.segments),
        )
        for profile in settings.profiles
    )
    return replace(settings, profiles=profiles)


def _copy_shifted_carb_overlay(source: Store, target: Store) -> None:
    target.upsert_cgm([
        {
            "EventDateTime": _stamp(reading.t - EARLIER_SHIFT),
            "Readings (CGM / BGM)": reading.bg,
            "Description": reading.type,
        }
        for reading in source.cgm_readings()
    ])
    target.upsert_bolus([
        {
            "seq_num": event.seq_num + EARLIER_SEQ_OFFSET,
            "request_time": _stamp(event.t - EARLIER_SHIFT),
            "description": event.description,
            "completion": event.completion,
            "insulin": event.insulin,
            "requested_insulin": event.requested_insulin,
            "carbs": event.carbs,
            "carb_ratio": EARLIER_RATIO,
        }
        for event in source.bolus_events()
        if event.carbs is not None
    ])
    first_snapshot = source.settings_snapshots()[0]
    target.upsert_settings_snapshot(
        _stamp(first_snapshot.captured_at - EARLIER_SHIFT),
        _settings_at_ratio(first_snapshot.settings, EARLIER_RATIO),
    )


def _counts(store: Store) -> dict[str, int]:
    all_counts = store.counts()
    return {table: all_counts[table] for table in TABLES}


def _seq_nums(store: Store, table: str) -> set[str]:
    return {
        row["seq_num"]
        for row in store.conn.execute(f"SELECT seq_num FROM {table}")
    }


def _ic_projection_ids(execution) -> dict[str, list[str]]:
    rows = [
        row
        for row in execution.findings["rows"]
        if row.get("parameter") == "carb_ratio"
    ]
    return {
        register: sorted(row["id"] for row in rows if row["register"] == register)
        for register in ("assert", "held", "history")
    }


def _ic_catalog(execution) -> dict[str, str]:
    return {
        row["id"]: row["lifecycle"]
        for row in execution.analysis["ic_history"]
    }


def _finish_database(path: Path) -> None:
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA journal_mode = DELETE")
        conn.execute("VACUUM")


def _build_concatenated(path: Path) -> dict[str, object]:
    showcase = _case("showcase")
    source_path = path.with_name(f"{path.stem}-earlier.sqlite")
    showcase_path = path.with_name(f"{path.stem}-showcase.sqlite")

    with Store.open(str(source_path)) as source:
        materialize_case(source, showcase)
        source_bolus_seq = _seq_nums(source, "bolus_events")
        earlier_counts = {
            "basal_events": 0,
            "bolus_events": len([event for event in source.bolus_events() if event.carbs is not None]),
            "cgm_readings": len(source.cgm_readings()),
            "profile_settings": 1,
        }
        earlier_seq = {
            "basal_events": set(),
            "bolus_events": {seq + EARLIER_SEQ_OFFSET for seq in source_bolus_seq},
        }
        with Store.open(str(path)) as combined:
            _copy_shifted_carb_overlay(source, combined)
            materialize_case(combined, showcase)
            combined_counts = _counts(combined)
            combined_execution = execute_case(combined)

    with Store.open(str(showcase_path)) as isolated:
        materialize_case(isolated, showcase)
        showcase_counts = _counts(isolated)
        showcase_seq = {
            table: _seq_nums(isolated, table)
            for table in ("basal_events", "bolus_events")
        }
        isolated_execution = execute_case(isolated)

    _finish_database(path)
    expected_counts = {
        table: earlier_counts[table] + showcase_counts[table] for table in TABLES
    }
    isolated_catalog = _ic_catalog(isolated_execution)
    combined_catalog = _ic_catalog(combined_execution)
    return {
        "earlier_counts": earlier_counts,
        "showcase_counts": showcase_counts,
        "expected_counts": expected_counts,
        "combined_counts": combined_counts,
        "isolated_projection": _ic_projection_ids(isolated_execution),
        "combined_projection": _ic_projection_ids(combined_execution),
        "isolated_catalog": isolated_catalog,
        "combined_catalog": combined_catalog,
        "extra_catalog": {
            identity: lifecycle
            for identity, lifecycle in combined_catalog.items()
            if identity not in isolated_catalog
        },
        "seq_overlap": {
            table: sorted(earlier_seq[table] & showcase_seq[table])
            for table in ("basal_events", "bolus_events")
        },
    }


def _logical_dump(path: Path) -> str:
    with sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True) as conn:
        return "\n".join(
            line for line in conn.iterdump() if "input_data_revision" not in line
        )


def _measure_in_process_cases(directory: Path) -> float:
    started = time.perf_counter()
    for case in (_case("setting-recommendation"), _case("showcase")):
        with Store.open(str(directory / f"suite-{case.name}.sqlite")) as store:
            materialize_case(store, case)
            assert_expectation(case, execute_case(store))
    return time.perf_counter() - started


def _measure_single_case(directory: Path) -> float:
    started = time.perf_counter()
    case = _case("setting-recommendation")
    with Store.open(str(directory / "single-case.sqlite")) as store:
        materialize_case(store, case)
        assert_expectation(case, execute_case(store))
    return time.perf_counter() - started


def main() -> None:
    with tempfile.TemporaryDirectory() as raw_directory:
        directory = Path(raw_directory)
        database = directory / "concatenated.sqlite"
        facts = _build_concatenated(database)

        print("recipe row counts:")
        for table in TABLES:
            print(
                f"  {table}: combined={facts['combined_counts'][table]} "
                f"expected_sum={facts['expected_counts'][table]} "
                f"earlier={facts['earlier_counts'][table]} "
                f"showcase={facts['showcase_counts'][table]}"
            )
        print(f"isolated showcase I:C projection ids: {facts['isolated_projection']}")
        print(f"concatenated showcase I:C projection ids: {facts['combined_projection']}")
        print(f"isolated showcase full I:C catalog: {facts['isolated_catalog']}")
        print(f"concatenated showcase full I:C catalog: {facts['combined_catalog']}")
        print(f"extra full-catalog identities: {facts['extra_catalog']}")
        print(f"seq_num overlap: {facts['seq_overlap']}")

        regenerated = directory / "regenerated.sqlite"
        started = time.perf_counter()
        _build_concatenated(regenerated)
        logical_match = _logical_dump(database) == _logical_dump(regenerated)
        rebuild_seconds = time.perf_counter() - started
        in_process_seconds = _measure_in_process_cases(directory)
        single_seconds = _measure_single_case(directory)
        size_mib = database.stat().st_size / (1024 * 1024)

        print("probe measurements:")
        print(f"  database_size_mib={size_mib:.2f} appendix_comparable=True")
        print(
            f"  rebuild_plus_two_compositions_seconds={rebuild_seconds:.2f} "
            f"appendix_comparable=False logical_match={logical_match}"
        )
        print(
            f"  two_cases_in_process_seconds={in_process_seconds:.2f} "
            f"appendix_comparable=False"
        )
        print(
            f"  single_isolated_case_seconds={single_seconds:.2f} "
            f"appendix_comparable=True"
        )


if __name__ == "__main__":
    main()
