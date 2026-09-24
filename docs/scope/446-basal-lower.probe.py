"""#446 premise probe: basal-lower serves a stageable basal action with nothing watched.

S166's first half needs it. The committed generator emits the synthetic case
store into a temporary directory, and the store is reconciled the way
`frontend/replay-cases.mjs` does before it serves a story. The answers come
through FastAPI's in-process test client: no port, no fetch loop, no real data.
Run from the repo root: uv run python docs/scope/446-basal-lower.probe.py
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

db = Path(tempfile.mkdtemp(prefix="446-basal-lower-")) / "case.sqlite"
subprocess.run([sys.executable, "scripts/gen_qa_e2e_db.py", "--case", "basal-lower", "--out", str(db)],
               cwd=REPO, check=True, capture_output=True)
with Store.open(str(db)) as store:
    reconcile_ingested_follow_up(store)
client = TestClient(create_app(db_path=str(db), token="", enable_fetch_loop=False))

guidance = client.get("/api/guidance").json()
selected = guidance["selected"] or {}
action = selected.get("action")
print(json.dumps({
    "disposition": guidance["disposition"],
    "active_kind": guidance["admission"].get("active_kind"),
    "selected": selected.get("subject"),
    "stageable_action": [[row.get("parameter"), row.get("start_min")] for row in action]
    if isinstance(action, list) else action,
}))
