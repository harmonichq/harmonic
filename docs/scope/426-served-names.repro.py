"""#426 reproduction: served payloads carry ids but no names. Synthetic inputs only.

Run from the repo root: uv run python docs/scope/426-served-names.repro.py
"""
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ciq_autotune.analyzers.scenario.levers import Lever, title  # noqa: E402
from ciq_autotune.analyzers.scenario.model_view import assemble_model_view  # noqa: E402
from ciq_autotune.guidance import _pattern_candidate  # noqa: E402
from tests.test_scenario_engine import ISF, cgm_flat, cgm_ramp, meal  # noqa: E402

# The model read: an attributed episode serves its Lever key and no name.
cgm = cgm_flat(16, 10, 0, 100, 120) + cgm_ramp(16, 12, 0, 100, 1.2, 180) + cgm_flat(16, 15, 5, 120, 120)
day = assemble_model_view([meal(16, 12, 0, carbs=20.0, dose=2.0)], cgm, [], target=date(2026, 6, 16), isf=ISF)
fired = next(ep for ep in day["episodes"] if ep["lever"] is not None)
print("episode keys:", sorted(key for key in fired if key != "anchors"))
print("lever_title served:", "lever_title" in fired, "| name source covers", len(list(Lever)), "levers:",
      all(title(lever) for lever in Lever))

# The guidance read: a Pattern's members and action carry ids only.
fixture = json.loads((ROOT / "frontend/__fixtures__/findings-projection.json").read_text())
pattern = next(p for p in fixture["browser_outcome_patterns"] if p["key"] == "highs_after_meals")
candidate = _pattern_candidate(pattern, {})
print("member keys:", sorted(candidate["members"][0]), "| action:", candidate["action"])
