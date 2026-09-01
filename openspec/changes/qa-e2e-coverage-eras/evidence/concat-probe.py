#!/usr/bin/env python3
"""Probe concatenating one shifted coverage era ahead of the QA showcase."""

from __future__ import annotations

import sqlite3
import sys
import tempfile
import time
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


EARLIER_SHIFT = timedelta(days=120)
TABLES = ("basal_events", "bolus_events", "cgm_readings", "profile_settings")


def _case(name: str):
    return next(case for case in QA_CASES if case.name == name)


def _stamp(value) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S")


def _copy_shifted_setting_recommendation(source: Store, target: Store) -> None:
    seq_nums = [
        row["seq_num"]
        for row in source.conn.execute("SELECT seq_num FROM basal_events ORDER BY t")
    ]
    target.upsert_basal([
        {
            "seq_num": seq_num,
            "time": _stamp(event.t - EARLIER_SHIFT),
            "delivery_type": event.delivery_type,
            "duration_mins": event.duration_mins,
            "basal_rate": event.basal_rate,
            "profile_basal_rate": event.profile_basal_rate,
        }
        for seq_num, event in zip(seq_nums, source.basal_events(), strict=True)
    ])
    target.upsert_cgm([
        {
            "EventDateTime": _stamp(reading.t - EARLIER_SHIFT),
            "Readings (CGM / BGM)": reading.bg,
            "Description": reading.type,
        }
        for reading in source.cgm_readings()
    ])
    for snapshot in source.settings_snapshots():
        target.upsert_settings_snapshot(
            _stamp(snapshot.captured_at - EARLIER_SHIFT), snapshot.settings
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


def _finish_database(path: Path) -> None:
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA journal_mode = DELETE")
        conn.execute("VACUUM")


def _build_concatenated(path: Path) -> dict[str, object]:
    setting = _case("setting-recommendation")
    showcase = _case("showcase")
    source_path = path.with_name(f"{path.stem}-setting.sqlite")
    showcase_path = path.with_name(f"{path.stem}-showcase.sqlite")

    with Store.open(str(source_path)) as source:
        materialize_case(source, setting)
        earlier_counts = _counts(source)
        earlier_seq = {
            table: _seq_nums(source, table)
            for table in ("basal_events", "bolus_events")
        }
        with Store.open(str(path)) as combined:
            _copy_shifted_setting_recommendation(source, combined)
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
    return {
        "earlier_counts": earlier_counts,
        "showcase_counts": showcase_counts,
        "expected_counts": expected_counts,
        "combined_counts": combined_counts,
        "isolated_ic": _ic_projection_ids(isolated_execution),
        "combined_ic": _ic_projection_ids(combined_execution),
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


def _measure_focused_suite(directory: Path) -> float:
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
        print(f"isolated showcase I:C projection ids: {facts['isolated_ic']}")
        print(f"concatenated showcase I:C projection ids: {facts['combined_ic']}")
        print(f"seq_num overlap: {facts['seq_overlap']}")

        regenerated = directory / "regenerated.sqlite"
        started = time.perf_counter()
        _build_concatenated(regenerated)
        logical_match = _logical_dump(database) == _logical_dump(regenerated)
        drift_seconds = time.perf_counter() - started
        focused_seconds = _measure_focused_suite(directory)
        single_seconds = _measure_single_case(directory)
        size_mib = database.stat().st_size / (1024 * 1024)

        print("budget measurements:")
        print(f"  database_size_mib={size_mib:.2f} limit_mib=25")
        print(
            f"  logical_drift_check_seconds={drift_seconds:.2f} "
            f"limit_seconds=30 logical_match={logical_match}"
        )
        print(f"  focused_qa_suite_seconds={focused_seconds:.2f} limit_seconds=90")
        print(f"  single_isolated_case_seconds={single_seconds:.2f} limit_seconds=15")


if __name__ == "__main__":
    main()
