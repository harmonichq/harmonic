"""#467 reproduction: a scoped window drops Patterns whose outcomes land in it.

Synthetic data only. Run from the repository root:

    uv run python docs/scope/467-scoped-pattern-membership.repro.py

Part 1 runs the QA case `basal-recurring-low-lower` through the store and the
public projection. Part 2 runs the findings-projection fixture generator's own
projection. Each window prints the Pattern rows the queue serves, the Patterns
the scoped roster (`outcome_patterns`) carries beside them, and any rate-lever
Cause row left unfolded although its Pattern is in the roster.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from ciq_autotune.findings_projection import WindowQuery  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402


def _label(bounds):
    if bounds is None:
        return "whole day"
    start, end = bounds
    return f"{start // 60:02d}:{start % 60:02d}-{end // 60:02d}:{end % 60:02d}"


def _report(prepared, windows):
    for bounds in windows:
        query = WindowQuery.whole_day() if bounds is None else WindowQuery.clock(*bounds)
        body = prepared.project(query, analysis_generation="repro:0")
        rows = {row["id"]: row for row in body["rows"]}
        served = [row for row in body["rows"] if row["kind"] == "pattern"]
        roster = [pattern["key"] for pattern in body["outcome_patterns"]
                  if pattern.get("collapse") == "remain_pattern"]
        print(f"  {_label(bounds)}")
        print(f"    roster (remain_pattern): {roster}")
        for row in served:
            pattern = row["pattern"]
            print(f"    served {row['id']}: k {pattern['k']} n {pattern['n']}, "
                  f"route {pattern['admission_route']}, priority {row['priority']}, "
                  f"scope {row['window_scope']}, chart {row['pattern_chart'] is not None}")
        dropped = [key for key in roster if f"pattern:{key}" not in rows]
        print(f"    in roster, not served: {dropped}")
        for pattern in body["outcome_patterns"]:
            if pattern["key"] not in dropped:
                continue
            for subject in pattern.get("rate_levers") or ():
                row = rows.get(f"finding:{subject.removeprefix('habit:')}")
                if row is not None:
                    print(f"      rate lever {row['id']} served unfolded, "
                          f"claimed_by {row['claimed_by']}")


def qa_case():
    from qa_e2e_cases import QA_CASES, execute_case, materialize_case
    from ciq_autotune.findings_projection import prepare_findings_projection

    case = next(case for case in QA_CASES if case.name == "basal-recurring-low-lower")
    with tempfile.TemporaryDirectory() as scratch:
        store = Store.open(Path(scratch) / "case.sqlite")
        materialize_case(store, case)
        execution = execute_case(store, case)
        store.close()
    prepared = prepare_findings_projection(
        analysis=execution.analysis, exposures=execution.exposures,
        scenarios=execution.scenarios,
    )
    print("1. QA case basal-recurring-low-lower")
    _report(prepared, (None, (0, 360), (120, 300), (180, 240), (840, 1260), (0, 1440)))


def fixture():
    from gen_findings_projection_fixtures import projection

    print("2. The findings-projection fixture generator's projection")
    _report(projection(), (None, (0, 1440), (0, 360), (360, 660), (660, 840),
                           (840, 1260)))


if __name__ == "__main__":
    qa_case()
    fixture()
