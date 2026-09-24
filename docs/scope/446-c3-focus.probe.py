"""#446 premise probe: c3-focus serves a watched Focus that a draft can be saved beside.

S168 needs it. It also shows that the trend's watched change, which Diagnose's
return reads, is the Focus. The committed generator emits the synthetic case
store into a temporary directory, reconciled as `frontend/replay-cases.mjs`
does. The answers come through FastAPI's in-process test client: no port, no
fetch loop, no real data.
Run from the repo root: uv run python docs/scope/446-c3-focus.probe.py
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

db = Path(tempfile.mkdtemp(prefix="446-c3-focus-")) / "case.sqlite"
subprocess.run([sys.executable, "scripts/gen_qa_e2e_db.py", "--case", "c3-focus", "--out", str(db)],
               cwd=REPO, check=True, capture_output=True)
with Store.open(str(db)) as store:
    reconcile_ingested_follow_up(store)
client = TestClient(create_app(db_path=str(db), token="", enable_fetch_loop=False))

guidance = client.get("/api/guidance").json()
print("before:", json.dumps({"disposition": guidance["disposition"],
                             "active_kind": guidance["admission"].get("active_kind")}))
segment = client.get("/api/pump-settings").json()["profile"]["segments"][0]
saved = client.put("/api/plan", json={"items": [
    {"type": "basal", "start_min": segment["start_min"], "value": segment["basal_rate"]}]})
print("draft saved while watched:", saved.status_code)
guidance = client.get("/api/guidance").json()
print("after draft:", json.dumps({"disposition": guidance["disposition"],
                                  "served_draft_items": len((guidance.get("draft") or {}).get("items") or [])}))
trend = client.get("/api/outcomes/trend", params={"window": 30}).json()
print("trend watched_change kind:", (trend.get("watched_change") or {}).get("kind"))
