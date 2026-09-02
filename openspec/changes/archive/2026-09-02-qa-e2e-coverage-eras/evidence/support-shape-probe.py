#!/usr/bin/env python3
"""Freeze serialized support-field names for the QA E2E expectation contract."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO_ROOT))

from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES, execute_case, materialize_case


def main() -> None:
    showcase = next(case for case in QA_CASES if case.name == "showcase")
    with tempfile.TemporaryDirectory() as raw_directory:
        with Store.open(str(Path(raw_directory) / "showcase.sqlite")) as store:
            materialize_case(store, showcase)
            analysis = execute_case(store).analysis

    basal = analysis["basal"][0]
    isf = analysis["isf"][0]
    ic = analysis["ic_blocks"][0]
    support = {
        "basal": {"evidence": ["directional_support_count"]},
        "isf": {"evidence": ["n_steps"]},
        "ic": {
            "top_level": ["n_runs"],
            "evidence.eligibility": ["effective_run_count"],
        },
    }
    values = {
        "basal.directional_support_count": basal["evidence"]["directional_support_count"],
        "isf.n_steps": isf["evidence"]["n_steps"],
        "ic.n_runs": ic["n_runs"],
        "ic.effective_run_count": ic["evidence"]["eligibility"]["effective_run_count"],
    }
    print(f"support field names: {json.dumps(support, sort_keys=True)}")
    print(f"showcase support values: {json.dumps(values, sort_keys=True)}")


if __name__ == "__main__":
    main()
