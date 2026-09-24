"""#454 measurement (triage evidence, not a gate): what a regenerated workstation
exposure feed moves in the findings projection and the Pattern roster.

    git show origin/main:mockups/diagnose-workstation.synthetic/payload.json > "$T/base.json"
    uv run python docs/scope/454-row-shapes.measure.py "$T/base.json" \
        mockups/diagnose-workstation.synthetic/payload.json

Both payloads go through the real `prepare_findings_projection` and
`build_outcome_patterns` with the browser scenarios exactly as
`scripts/gen_findings_projection_fixtures.py` assembles them, in the whole day,
every `WINDOWS` entry and the drawn 12:00-15:00 window. It prints every family
tally, roster and row field that differs (row `evidence` lists excluded: they
carry the rows themselves), then whether each window's row order held.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts import gen_findings_projection_fixtures as g  # noqa: E402
from ciq_autotune.analyzers.scenario.levers import Lever, recommendation  # noqa: E402
from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns  # noqa: E402
from ciq_autotune.analyzers.scenario.payload import Pattern  # noqa: E402
from ciq_autotune.findings_projection import prepare_findings_projection  # noqa: E402
from ciq_autotune.window_membership import WindowQuery  # noqa: E402

PREPARED = g.projection()


def served(path):
    payload = json.loads(pathlib.Path(path).read_text())
    analysis = {**payload["analyze"], "tuning_levers": PREPARED._analysis["tuning_levers"]}
    exposures = json.loads(json.dumps(payload["exposures"]))
    scenarios = json.loads(json.dumps(PREPARED._scenarios))
    for lever, n, k, effect, rank, hero in ((Lever.LATE_BOLUS, 50, 7, 0.38, 3, "ep70"),
                                            (Lever.CORRECTION_ON_IOB, 45, 8, 0.35, 4, "ep90")):
        scenarios["patterns"].append(Pattern(
            lever=lever, confidence=g.Confidence(n=n, k=k, effect=effect), rank=rank,
            recommendation=recommendation(lever), hero_episode=hero, occurrences=[hero],
        ).to_dict())
    projection = prepare_findings_projection(
        analysis=analysis, exposures=exposures, scenarios=scenarios)
    windows = {}
    for name, bounds in [*g.WINDOWS.items(), ("drawn", (720, 900))]:
        query = WindowQuery.whole_day() if bounds is None else WindowQuery.clock(*bounds)
        windows[name] = projection.project(query, analysis_generation=g.ANALYSIS_GENERATION)
    tallies = {family: {key: value for key, value in body.items() if key != "occurrences"}
               for family, body in exposures["exposures"].items()}
    return tallies, build_outcome_patterns(analysis, exposures, scenarios), windows


def diff(left, right, path=""):
    if isinstance(left, dict) and isinstance(right, dict):
        for key in sorted(set(left) | set(right), key=str):
            if key not in left or key not in right:
                print("KEY", f"{path}.{key}", left.get(key, "<absent>"), "->",
                      right.get(key, "<absent>"))
            else:
                diff(left[key], right[key], f"{path}.{key}")
    elif isinstance(left, list) and isinstance(right, list):
        if len(left) != len(right):
            print("LEN", path, len(left), "->", len(right))
        for index, (a, b) in enumerate(zip(left, right)):
            diff(a, b, f"{path}[{index}]")
    elif left != right:
        print("VAL", path, repr(left)[:100], "->", repr(right)[:100])


base, branch = served(sys.argv[1]), served(sys.argv[2])
print("== family tallies")
diff(base[0], branch[0])
print("== Pattern roster")
diff(base[1], branch[1])
for name, before in base[2].items():
    after = branch[2][name]
    print(f"== window {name}: row order held",
          [r["id"] for r in before["rows"]] == [r["id"] for r in after["rows"]])
    strip = lambda rows: {r["id"]: {k: v for k, v in r.items() if k != "evidence"} for r in rows}
    diff(strip(before["rows"]), strip(after["rows"]))
    diff({k: v for k, v in before.items() if k != "rows"},
         {k: v for k, v in after.items() if k != "rows"}, "top")
