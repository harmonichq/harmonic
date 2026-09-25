"""#468 probe: every day of the committed QA showcase, served as /api/model-view
serves it, for the Node probe that runs the shipped Episode Log over each day.
Synthetic inputs only: the committed showcase store, opened read-only.

Run from the repo root:
  uv run python docs/scope/468-reader-text.probe.py "$TMPDIR/468-days.json"
  node docs/scope/468-reader-text.probe.mjs "$TMPDIR/468-days.json"
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ciq_autotune.analyzers.scenario import build_model_view  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402

with Store.open_readonly(str(ROOT / "mockups/qa-e2e.synthetic/harmonic.sqlite")) as store:
    times = store.conn.execute("SELECT MIN(t), MAX(t) FROM cgm_readings").fetchone()
    first, last = (datetime.fromisoformat(t).date() for t in times)
    days, day = [], first
    while day <= last:
        days.append(build_model_view(store, day))
        day += timedelta(days=1)
Path(sys.argv[1]).write_text(json.dumps(days, default=str))
print(f"{len(days)} days, {days[0]['date']} to {days[-1]['date']}")
