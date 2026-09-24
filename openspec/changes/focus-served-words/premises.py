"""#449/#450 triage premises: what the Focus reads serve on synthetic stores.

Run from the repository root (in process, no server, no port, scratch copies only):

    PYTHONPATH=. uv run python openspec/changes/focus-served-words/premises.py 2>/dev/null

For every Focus record on each named case store it prints the served lever,
Pattern key, nameplate title and whether a behavior name (`lever_title`) is
served, then the codes the desk prints from the comparison it shows: the saved
ending's assessment for an ended record, the retained read otherwise. Codes and
counts only; no record-level values.
"""
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from ciq_autotune.api import create_app
from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES, materialize_case

CASES = ("c3-focus", "c3-preempted", "c4-history")


def codes(comparison):
    availability = comparison.get("availability") or {
        "state": comparison.get("state"), "reason": comparison.get("reason")}
    adherence = comparison.get("adherence") or {}
    readiness = comparison.get("readiness") or {}
    arms = [adherence.get(side) or {} for side in ("before", "after")]
    return {
        "availability": f"{availability.get('state')}/{availability.get('reason')}",
        "adherence": sorted({(arm.get("availability") or {}).get("reason") or "-" for arm in arms}) if adherence else None,
        "harm": sorted({(arm.get("harm_availability") or {}).get("reason") or "-" for arm in arms}) if adherence else None,
        "readiness": sorted({f"{arm.get('verdict', '-')}/{arm.get('reason') or '-'}"
                             for arm in readiness.values()}) if readiness else None,
        "assessment": (comparison.get("assessment") or {}).get("state") if isinstance(comparison.get("assessment"), dict) else None,
    }


def report(label, path):
    client = TestClient(create_app(db_path=str(path), token="", enable_fetch_loop=False))
    roster = client.get("/api/verify/trials").json()
    admission = roster["admission"]
    print(f"{label} admission={admission['state']}/{admission['reason']} "
          f"focus_pin={admission['focus_pin']['reason']}")
    for index, row in enumerate(roster["focuses"]):
        params = {"kind": "focus", "selected": row["id"]}
        detail = client.get("/api/verify/trials", params=params).json()["selected"]
        ending = (detail["original"].get("ending") or {})
        if ending.get("kind"):
            comparison, source = ending.get("assessment") or {}, f"saved({ending['kind']})"
        else:
            retained = client.get("/api/verify/trials", params={**params, "assessment": "retained"})
            comparison, source = retained.json()["selected"]["reassessment"]["comparison"], "retained"
        context = detail["original"].get("context") or {}
        print(f"  focus[{index}] lever={detail['lever']} pattern={row.get('pattern_key')} "
              f"title={detail['title']!r} lever_title="
              f"{detail['lever_title']!r}" if "lever_title" in detail else
              f"  focus[{index}] lever={detail['lever']} pattern={row.get('pattern_key')} "
              f"title={detail['title']!r} lever_title=<not served>")
        print(f"    context={context.get('state')}/{context.get('reason')} {source} {codes(comparison)}")


def main():
    with tempfile.TemporaryDirectory() as scratch:
        for name in CASES:
            path = Path(scratch) / f"{name}.sqlite"
            with Store.open(str(path)) as store:
                materialize_case(store, next(case for case in QA_CASES if case.name == name))
            report(name, path)


if __name__ == "__main__":
    main()
