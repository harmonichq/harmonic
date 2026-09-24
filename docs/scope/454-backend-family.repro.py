"""#454 reproduction, Python half (triage evidence, not a gate).

    uv run python docs/scope/454-backend-family.repro.py

Runs the real roster producer and the real Pattern case-file producer over the
committed browser-gate inputs (the workstation payload plus the projection
fixture's scenarios, exactly as `scripts/gen_findings_projection_fixtures.py`
assembles them), with one extra scenario Pattern per variant so the roster admits
an out-of-family habit member. Prints each roster's members and the habits the
selected first Occurrence's reason judges. On origin/main b03431d2 it prints:

    lows_after_correcting_highs members ['habit:correction_stacking', 'habit:correction_on_iob', 'setting:isf']
      reason habits ['correction_on_iob']
    highs_after_meals members ['habit:carb_undercount', 'habit:late_bolus', 'habit:high_carb_sequence', 'setting:carb_ratio']
      reason habits ['carb_undercount', 'late_bolus']
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts import gen_findings_projection_fixtures as g  # noqa: E402
from ciq_autotune.analyzers.scenario.levers import Lever, recommendation  # noqa: E402
from ciq_autotune.analyzers.scenario.payload import Pattern  # noqa: E402
from ciq_autotune.finding_case_file import PreparedCases  # noqa: E402
from ciq_autotune.findings_projection import prepare_findings_projection  # noqa: E402
from ciq_autotune.window_membership import WindowQuery  # noqa: E402


def scenario(lever, n, k, effect, rank, hero):
    return Pattern(lever=lever, confidence=g.Confidence(n=n, k=k, effect=effect), rank=rank,
                   recommendation=recommendation(lever), hero_episode=hero,
                   occurrences=[hero]).to_dict()


prepared = g.projection()
payload = json.loads((ROOT / "mockups/diagnose-workstation.synthetic/payload.json").read_text())
analysis = {**payload["analyze"], "tuning_levers": prepared._analysis["tuning_levers"]}
exposures = json.loads(json.dumps(payload["exposures"]))
base = json.loads(json.dumps(prepared._scenarios))
base["patterns"].extend([scenario(Lever.LATE_BOLUS, 50, 7, 0.38, 3, "ep70"),
                         scenario(Lever.CORRECTION_ON_IOB, 45, 8, 0.35, 4, "ep90")])

for extra, key in ((Lever.CORRECTION_STACKING, "lows_after_correcting_highs"),
                   (Lever.HIGH_CARB_SEQUENCE, "highs_after_meals")):
    scenarios = json.loads(json.dumps(base))
    scenarios["patterns"].append(scenario(extra, 40, 5, 0.3, 5, "ep1"))
    query = WindowQuery.whole_day()
    findings = prepare_findings_projection(
        analysis=analysis, exposures=exposures, scenarios=scenarios,
    ).project(query, analysis_generation=g.ANALYSIS_GENERATION)
    row = next(r for r in findings["rows"] if r["id"] == f"pattern:{key}")
    cases = PreparedCases(
        projection_id="fp_" + "2" * 32, version=0, query=query, findings=findings,
        recurrence={}, members={lever: () for lever in Lever},
        associations={lever: frozenset() for lever in Lever},
        attribution_provenance={lever: () for lever in Lever}, withheld=frozenset(),
        cgm=(), basal=(), bolus=(), carbs=(), lease_until=0, exposures=exposures,
    )
    clock = cases.case(f"pattern:{key}", "clock", None)
    selected = cases.case(f"pattern:{key}", "clock", clock["occurrences"][0]["id"])
    print(key, "members", [m["subject"] for m in row["pattern"]["members"]])
    print("  reason habits",
          [h["lever"] for h in selected["selection"]["detail"]["reason"]["habits"]])
