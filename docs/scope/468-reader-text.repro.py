"""#468 reproduction, item 4: an event case file's comparison group serves no
verdict-band state, so its count differs from the band's Does not meet whenever
a meal has no data. Synthetic inputs only: the case-file tests' own manufactured
Highs after meals case.

Run from the repo root: uv run python docs/scope/468-reader-text.repro.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from tests.test_finding_case_file import _pattern_meal_case  # noqa: E402

for states in (("claimed", "calm", "no_data"),
               ("claimed", "claimed", "claimed", "near_miss", "no_data", "calm")):
    case = _pattern_meal_case(states)
    print(f"meals {states}")
    print(f"  verdict band {case['verdict_counts']}")
    for cohort in case["projection"]["cohorts"]:
        verdicts = sorted({row["verdict"] for row in case["occurrences"]
                           if row["id"] in cohort["occurrence_ids"]})
        print(f"  cohort {cohort['name']!r}: routed {cohort['routed_count']}, "
              f"band_verdict {cohort['band_verdict']!r}, member verdicts {verdicts}, "
              f"served keys {sorted(k for k in cohort if k.startswith('band'))}")
