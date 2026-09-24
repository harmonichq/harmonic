"""#430 triage premises: what the record door's two reads serve on synthetic stores.

Run from the repository root (in process, no server, no port, scratch copies only):

    PYTHONPATH=. uv run python openspec/changes/open-record-comparison/premises.py 2>/dev/null

For every retained Trial and Focus record on each named case store (and on a
scratch copy of the committed showcase, reconciled once), it prints whether the
record has a saved ending, asserts that the default (Original) read serves no
reassessment, and prints the retained read's availability and clock-bin shape.
Counts and served codes only; no record-level values.
"""
import shutil
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from ciq_autotune.api import create_app
from ciq_autotune.store import Store
from ciq_autotune.watched_change import reconcile_ingested_follow_up
from scripts.qa_e2e_cases import QA_CASES, materialize_case

CASES = ("c3-trial", "c3-history", "edit-chain", "c4-missing", "c4-history")
SHOWCASE = Path("mockups/qa-e2e.synthetic/harmonic.sqlite")


def bins(comparison, side):
    view = (comparison.get("views") or {}).get(side) or {}
    return {row["t"] for row in view.get("clock", []) if row.get("n", 0) > 0}


def report(label, path):
    client = TestClient(create_app(db_path=str(path), token="", enable_fetch_loop=False))
    roster = client.get("/api/verify/trials").json()
    for kind, rows in (("trial", roster["trials"]), ("focus", roster["focuses"])):
        for index, row in enumerate(rows):
            ended = bool((row.get("ending") or {}).get("kind"))
            params = {"kind": kind, "selected": row["id"]}
            original = client.get("/api/verify/trials", params=params).json()["selected"]
            assert original["reassessment"] is None, "the Original read serves no reassessment"
            if ended:
                comparison = original["original"]["ending"].get("assessment") or {}
                source = "saved"
            else:
                retained = client.get("/api/verify/trials", params={**params, "assessment": "retained"})
                comparison = retained.json()["selected"]["reassessment"]["comparison"]
                source = "retained"
            availability = comparison.get("availability") or {
                "state": comparison.get("state"), "reason": comparison.get("reason")}
            before, after = bins(comparison, "before"), bins(comparison, "after")
            print(f"{label} {kind}[{index}] ended={ended} {source}={availability.get('state')}/"
                  f"{availability.get('reason')} views={'views' in comparison and bool(comparison['views'])} "
                  f"periods={sorted((comparison.get('periods') or {}).keys())} before_bins={len(before)} "
                  f"after_bins={len(after)} paired={len(before & after)} "
                  f"outcomes={len(comparison.get('outcomes') or [])}")


def main():
    with tempfile.TemporaryDirectory() as scratch:
        for name in CASES:
            path = Path(scratch) / f"{name}.sqlite"
            with Store.open(str(path)) as store:
                materialize_case(store, next(case for case in QA_CASES if case.name == name))
            report(name, path)
        path = Path(scratch) / "showcase.sqlite"
        shutil.copyfile(SHOWCASE, path)
        with Store.open(str(path)) as store:
            reconcile_ingested_follow_up(store)
        report("showcase-reconciled", path)


if __name__ == "__main__":
    main()
