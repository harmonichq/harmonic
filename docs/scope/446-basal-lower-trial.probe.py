"""#446 premise probe: basal-lower reaches a watched Trial with a draft saved beside it.

S166 and S167 need it. The probe records the served basal action as a Plan and
advances the pump with the replay's own `frontend/replay-pump.py match`. It
then saves a draft while the Trial runs, and tries to record it. The committed
generator emits the synthetic case store into a temporary directory, reconciled
as `frontend/replay-cases.mjs` does. The answers come through FastAPI's
in-process test client: no port, no fetch loop, no real data.
Run from the repo root: uv run python docs/scope/446-basal-lower-trial.probe.py
"""
import json
import logging
import subprocess
import sys
import tempfile
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)
REPO = Path(__file__).resolve().parents[2]

from fastapi.testclient import TestClient  # noqa: E402
from ciq_autotune.api import create_app  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402
from ciq_autotune.watched_change import reconcile_ingested_follow_up  # noqa: E402

db = Path(tempfile.mkdtemp(prefix="446-basal-lower-trial-")) / "case.sqlite"
subprocess.run([sys.executable, "scripts/gen_qa_e2e_db.py", "--case", "basal-lower", "--out", str(db)],
               cwd=REPO, check=True, capture_output=True)
with Store.open(str(db)) as store:
    reconcile_ingested_follow_up(store)
client = TestClient(create_app(db_path=str(db), token="", enable_fetch_loop=False))

selected = client.get("/api/guidance").json()["selected"]
items = [{"type": "basal", "start_min": start, "value": row["recommended"]}
         for row in selected["action"] for start in (row.get("member_start_mins") or [row["start_min"]])]
print("draft", client.put("/api/plan", json={"items": items}).status_code,
      "apply", client.post("/api/plan/apply", json={}).status_code,
      "then", client.get("/api/guidance").json()["disposition"])

subprocess.run([sys.executable, "frontend/replay-pump.py", str(db), "match"],
               cwd=REPO, check=True, capture_output=True)
client = TestClient(create_app(db_path=str(db), token="", enable_fetch_loop=False))
guidance = client.get("/api/guidance").json()
print("after match:", json.dumps({"disposition": guidance["disposition"],
                                  "active_kind": guidance["admission"].get("active_kind"),
                                  "served_draft_items": len((guidance.get("draft") or {}).get("items") or [])}))

print("draft saved while watched:", client.put("/api/plan", json={"items": items}).status_code)
guidance = client.get("/api/guidance").json()
print("after draft:", json.dumps({"disposition": guidance["disposition"],
                                  "served_draft_items": len((guidance.get("draft") or {}).get("items") or [])}))
before = len(client.get("/api/plan/history").json()["history"])
refused = client.post("/api/plan/apply", json={})
print("record while watched:", refused.status_code, refused.json(),
      "history grew:", len(client.get("/api/plan/history").json()["history"]) != before)
