"""#451 reproduction: guidance serves a setting concern under the tuning lever's
engine title. Synthetic inputs only: every case is a committed manufactured QA
case, materialized into a temporary store.

Run from the repo root: uv run python docs/scope/451-setting-concern-labels.repro.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ciq_autotune.guidance import COMPARISON_VERSION, build_guidance  # noqa: E402
from tests.test_guidance import _qa  # noqa: E402

# Every setting concern guidance serves, per manufactured case.
for case, subject in (("isf-strengthen", "setting:isf"), ("isf-held", "setting:isf"),
                      ("ic-lower", "setting:carb_ratio"), ("ic-held", "setting:carb_ratio"),
                      ("basal-lower", "setting:basal_rate")):
    result, _ = _qa(case)
    row = next(row for row in result["candidates"] if row["subject"] == subject)
    print(f"{case}: {subject} title={row['title']!r} units={row['units']!r}")

# A Pattern whose chosen member is a setting carries that setting's action rows,
# but serves no units of its own, so Changes prints the value bare.
result, _ = _qa("isf-strengthen")
selected = result["selected"]
print(f"isf-strengthen selected: {selected['subject']} units={selected['units']!r} "
      f"action[0]={selected['action'][0]['parameter']} {selected['action'][0]['recommended']}")

# A set-aside setting preference this read no longer carries is served with no title,
# so Changes' set-aside list falls back to printing the subject id. basal-lower
# serves no correction-factor concern, so its preference comes back absent.
preference = {"subject": "setting:isf", "decided_at": "2026-01-01 00:00:00", "reason": None,
              "comparison_version": COMPARISON_VERSION,
              "state": {"kind": "setting", "action": [], "seriousness": []}}
_, execution = _qa("basal-lower")
absent = build_guidance(analysis=execution.analysis, exposures=execution.exposures,
                        scenarios=execution.scenarios, preferences=[preference])
row = next(row for row in absent["candidates"] if row["subject"] == "setting:isf")
print(f"basal-lower set-aside setting:isf: absent={row.get('absent', False)} title={row['title']!r}")
