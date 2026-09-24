"""#447 in-process reproduction on the manufactured `c3-trial` QA case (synthetic only).

The case switches a basal slot at midnight and carries data well past fourteen
days, so the Trial's bounded period (change → change + 14 days) spans 15 dates.
This reads, through the public routes and without binding a port, the two
payloads that feed the two printers:

* the dock: `/api/outcomes/trend?window=30` → `watched_change` (Diagnose reads
  exactly this, `frontend/diagnose.js`);
* Changes: `/api/verify/trials?kind=trial&selected=<active id>` → `selected`
  (the follow-up reads exactly this, `frontend/follow-up.js`).

Both are built by `watched_change._retained_trial` → `_maturing`, so the served
count is one number. The node half renders both printers over these payloads.

Run from the repository root:
  PYTHONPATH=. uv run python docs/scope/447-day-count.repro.py <out.json>
  node docs/scope/447-day-count.repro.mjs <out.json>
"""
import json
import sys
import tempfile

from fastapi.testclient import TestClient

from ciq_autotune.api import create_app
from ciq_autotune.store import Store
from scripts.qa_e2e_cases import QA_CASES, materialize_case


def main(out):
    d = tempfile.mkdtemp()
    path = d + "/synthetic.sqlite"
    with Store.open(path) as store:
        materialize_case(store, next(c for c in QA_CASES if c.name == "c3-trial"))
    client = TestClient(create_app(db_path=path, token="", key_path=d + "/secret.key",
                                   enable_fetch_loop=False))
    watched = client.get("/api/outcomes/trend", params={"window": 30}).json()["watched_change"]
    roster = client.get("/api/verify/trials", params={"kind": "trial"}).json()
    active = roster["admission"]["active_id"]
    selected = client.get("/api/verify/trials",
                          params={"kind": "trial", "selected": active}).json()["selected"]
    result = {
        "dock": {"kind": watched["kind"], "parameter": watched["parameter"],
                 "slot": watched["slot"], "before": watched["before"],
                 "after": watched["after"], "changed_at": watched["changed_at"],
                 "maturing": watched["maturing"]},
        "changes": {"state": selected["state"], "maturing": selected["maturing"],
                    "readiness": selected["readiness"],
                    "trial_period": selected["trial_period"]},
    }
    print(json.dumps(result, indent=1))
    with open(out, "w") as f:
        json.dump(result, f, indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
