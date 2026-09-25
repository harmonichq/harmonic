"""#467 spike: a scoped window serves a Pattern when its outcomes land in it.

Synthetic data only. Run from the repository root:

    uv run python docs/scope/467-scoped-pattern-membership.spike.py          # windows
    uv run python docs/scope/467-scoped-pattern-membership.spike.py --qa     # every QA case

The rule ADR 467 records, applied by patching the two functions it changes:

* ``outcome_window_population`` returns, for a scoped query, only the Patterns
  whose outcomes land in the window: a Pattern whose ``n`` is above zero, and,
  for the harm-band Pattern (whose ``n`` counts band nights whatever the
  window), only when the window overlaps its 00:00-06:00 band.
* ``_pattern_rows`` serves every ``remain_pattern`` Pattern of that roster;
  ``pattern_chartable`` decides only the chart coordinate.

The band sentence (task 60) is not spiked here: it is a served string.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "docs" / "scope"))

import ciq_autotune.analyzers.scenario.outcome_patterns as producer  # noqa: E402
import ciq_autotune.findings_projection as projection_module  # noqa: E402
from ciq_autotune.harm import HarmConfig  # noqa: E402

_BAND = (HarmConfig().overnight_start_min, HarmConfig().overnight_end_min)
_original_population = producer.outcome_window_population


def pattern_in_window(pattern: dict, query) -> bool:
    if not (pattern.get("n") or 0) > 0:
        return False
    if pattern["rate_producer"] == "harm_band_source_nights":
        return query.overlaps(*_BAND)
    return True


def outcome_window_population(analysis, exposures, scenarios, query):
    population, roster = _original_population(analysis, exposures, scenarios, query)
    if query.scoped:
        roster = [pattern for pattern in roster if pattern_in_window(pattern, query)]
    return population, roster


def _pattern_rows(self, rows, query, outcome_patterns=None, pattern_exposures=None):
    """``FindingsProjection._pattern_rows`` with its scoped chartability gate removed:
    every remain_pattern Pattern of the membership-filtered roster is served, and
    ``pattern_chartable`` decides only the chart coordinate."""
    from copy import deepcopy
    from ciq_autotune.findings_projection import _row, pattern_chartable

    by_id = {row["id"]: row for row in rows}
    pattern_rows, pattern_by_subject = [], {}
    outcome_patterns = self._outcome_patterns if outcome_patterns is None else outcome_patterns
    pattern_exposures = self._exposures if pattern_exposures is None else pattern_exposures
    for pattern in outcome_patterns:
        if pattern.get("collapse") != "remain_pattern":
            continue
        subject = pattern["subject"]
        subjects = dict.fromkeys([
            *(pattern.get("rate_levers") or ()),
            *(member["subject"] for member in pattern.get("members") or ()
              if member["kind"] == "habit"),
        ])
        for lever in subjects:
            row = by_id.get(f"finding:{lever.removeprefix('habit:')}")
            if row is not None:
                row["claimed_by"] = subject
        pattern_row = _row(
            id=subject, register="finding", kind="pattern", title=pattern["title"],
            priority=(pattern["settled_price"]
                      if pattern["admission_route"] != "none" else None),
            episodes=None, pattern=deepcopy(pattern),
            window_scope="window" if query.scoped else "whole_day",
            pattern_chart=({"key": pattern["key"], "window": query.to_dict()}
                           if pattern_chartable(pattern, pattern_exposures) else None),
        )
        pattern_rows.append(pattern_row)
        pattern_by_subject[subject] = pattern_row
    return pattern_rows, pattern_by_subject


def install():
    producer.outcome_window_population = outcome_window_population
    projection_module.outcome_window_population = outcome_window_population
    projection_module.FindingsProjection._pattern_rows = _pattern_rows


def qa_cases():
    import tempfile
    from qa_e2e_cases import QA_CASES, assert_expectation, execute_case, materialize_case
    from ciq_autotune.store import Store

    moved, served = [], []
    for case in QA_CASES:
        with tempfile.TemporaryDirectory() as scratch:
            store = Store.open(Path(scratch) / "case.sqlite")
            materialize_case(store, case)
            execution = execute_case(store, case)
            store.close()
        for window, body in execution.findings.items():
            if window == "whole_day":
                continue
            keys = [row["id"] for row in body["rows"] if row["kind"] == "pattern"]
            if keys:
                served.append((case.name, window, keys))
        try:
            assert_expectation(case, execution)
        except AssertionError as error:
            moved.append((case.name, str(error)[:200]))
    print(f"QA cases: {len(QA_CASES)}; scoped windows now serving a Pattern: {len(served)}")
    for name, window, keys in served:
        print(f"  {name} {window}: {keys}")
    print(f"QA expectations that move: {len(moved)}")
    for name, error in moved:
        print(f"  {name}: {error}")


if __name__ == "__main__":
    install()
    if "--qa" in sys.argv:
        qa_cases()
    else:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "repro", ROOT / "docs" / "scope" / "467-scoped-pattern-membership.repro.py")
        repro = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(repro)
        repro.qa_case()
        repro.fixture()
