"""Generate the synthetic aggregate eating-sequence report fixture (#275)."""

import argparse
import json
import sys
from collections import Counter
from datetime import timedelta
from hashlib import sha256
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ciq_autotune.analyzers.eating_sequence_config import EatingSequenceConfig
from ciq_autotune.analyzers.eating_sequences import build_report, report_dict, build_sequences, evaluate_sequences
from tests.eating_sequence_streams import repeat_eating_stream, sequence_episode_stream
from tests.test_findings_projection import seed_sequence_store
from ciq_autotune import finding_case_file
from ciq_autotune.events import CarbEntry
from ciq_autotune.store import Store
from ciq_autotune.analyze import analyze
from ciq_autotune.analyzers.scenario import build_scenarios
from ciq_autotune.explore_exposures import build_exposures
from ciq_autotune.findings_projection import prepare_findings_projection
from ciq_autotune.window_membership import WindowQuery


OUT = ROOT / "frontend/__fixtures__/eating-sequence-report.json"


def payload() -> dict:
    """Build a populated report from the shared manufactured stream."""
    boluses, cgm, carb_log, _ = repeat_eating_stream()
    end = cgm[-1].t
    report = build_report(
        boluses, cgm, carb_log,
        window_start=end - timedelta(days=30), window_end=end,
        config=EatingSequenceConfig(),
    )
    return {
        "_generated_by": "scripts/gen_eating_sequence_fixtures.py",
        "_note": "SYNTHETIC. Fixed invented eating sequences; no personal data.",
        **report_dict(report),
    }


FINDINGS_OUT = ROOT / "mockups/eating-sequence-findings.synthetic/payload.json"


def products(lever, *, covered=False, competitor="mild", multi=False, thin=None, null_period=False,
             during=False, varied_duration=False):
    """Manufacture source events, then call the same public served producers."""
    bolus, cgm, log, basal = sequence_episode_stream(
        "repeat_eating" if lever == "both" else lever,
        covered=covered, competitor=competitor, multi=multi, during=during,
        varied_duration=varied_duration)
    sequences = build_sequences(bolus, config=EatingSequenceConfig())
    if lever == "both":
        # Lower single-window excursions keep their high-carb price below the
        # repeat cohort's price: both can own disjoint sequences.
        single_ends = [sequence.end for sequence in sequences[72:]]
        cgm = [replace(reading, bg=230) if any(
            end + timedelta(minutes=60) <= reading.t < end + timedelta(minutes=85)
            for end in single_ends) else reading for reading in cgm]
    if thin is not None:
        evaluation = evaluate_sequences(bolus, cgm, log, window_start=cgm[0].t,
                                        window_end=cgm[-1].t, config=EatingSequenceConfig())
        cohort = [row for row in evaluation.populations[lever] if row.candidate == thin]
        log = [CarbEntry(row.sequence.end + timedelta(minutes=1), 17.3, "exact", "manual",
                         created_at=row.sequence.end + timedelta(minutes=1)) for row in cohort[7:]]
    if null_period:
        cgm = [reading for reading in cgm if not any(
            sequence.start <= reading.t < sequence.end + timedelta(minutes=5)
            for sequence in sequences)]
    with Store.open(":memory:") as store:
        seed_sequence_store(store, bolus, cgm, log)
        projection = prepare_findings_projection(
            analysis=analyze(store, window_days=30, pool_agreeing_basal_regimes=True).to_dict(),
            scenarios=build_scenarios(store, window_days=30).to_dict(),
            exposures=build_exposures(store, window_days=30),
        )
    return projection, (bolus, cgm, log, basal)


def findings_payload():
    """Freeze public Python transports, never hand-set findings or ownership."""
    states = {}
    for lever in ("high_carb_sequence", "repeat_eating", "both"):
        for name, options in (
            ("covered", {"covered": True}),
            ("empty", {}),
            ("thin_candidate", {"covered": True, "thin": True}),
            ("thin_reference", {"covered": True, "thin": False}),
            ("losing", {"competitor": "severe"}),
            ("multiple", {"multi": True}),
            ("in_sequence", {"during": True}),
            ("limited", {"during": True, "varied_duration": True}),
            ("null_period", {"null_period": True}),
        ):
            if (lever == "both" and name != "covered") or (
                    name in {"in_sequence", "limited"} and lever != "high_carb_sequence"):
                continue
            key = f"{lever}_{name}"
            projection, (bolus, cgm, log, _) = products(lever, **options)
            # FindingsProjection has no public accessors for its three source payloads.
            # Freeze only the transport capture clock; all judgments remain producer-owned.
            projection._analysis["generated_at"] = cgm[-1].t.strftime("%Y-%m-%d %H:%M:%S")
            with Store.open(":memory:") as store:
                seed_sequence_store(store, bolus, cgm, log)
                windows = {}
                # The stories boot Overnight, then inspect 24 h; S157 returns Overnight.
                occurrences = projection._exposures.get("sequence_evidence", {}).get(lever, {}).get("occurrences", [])
                witness = next((r["outcome_minute"] for r in occurrences if r["attributed"]), None)
                queries = {"global": WindowQuery.whole_day(),
                           "0-360": WindowQuery.clock(0, 360)}
                for window_key, query in queries.items():
                    prepared = finding_case_file.prepare(
                        store, query=query, version=0, analysis=projection._analysis,
                        exposures=projection._exposures, scenarios=projection._scenarios,
                        analysis_generation="synthetic-342:0",
                    )
                    prepared.projection_id = "fp_" + sha256(f"{key}:{window_key}".encode()).hexdigest()[:32]
                    wrapped = finding_case_file.wrap(prepared)
                    cases = {}
                    for row in wrapped["rendered_rows"]:
                        if not row.get("case_header"):
                            continue
                        # Preserve every roster selection the public endpoint serves.
                        event = prepared.case(row["id"], "event", None)
                        if event is None:
                            continue
                        cases[row["id"]] = {
                            "event": event,
                            "clock": prepared.case(row["id"], "clock", None),
                            "selections": (
                                {occurrence["id"]: prepared.case(
                                    row["id"], "event", occurrence["id"])["selection"]
                                 for occurrence in event["occurrences"]}
                                if event["family"] == "sequences" else {}
                            ),
                        }
                    windows[window_key] = {"preparation": wrapped, "cases": cases}
                states[key] = {
                    "lever": lever, "witness_minute": witness,
                    "windows": windows,
                }
    return {"_generated_by": "scripts/gen_eating_sequence_fixtures.py",
            "_note": "SYNTHETIC. Manufactured event streams through public Python producers; no personal data.",
            "states": states}


def compact_findings_payload(body):
    """Intern repeated JSON values without changing any served value."""
    counts = Counter()

    def identity(value):
        return json.dumps(value, sort_keys=True, separators=(",", ":"))

    def count(value):
        if isinstance(value, (dict, list, str)):
            key = identity(value)
            # The two served windows repeat many short, structured case headers.
            # Intern them as well as the larger case files: expansion restores the
            # same public producer output, while the committed synthetic transport
            # remains below its fixed fixture-size budget.
            if len(key) > 16:
                counts[key] += 1
        if isinstance(value, (dict, list)):
            for child in value.values() if isinstance(value, dict) else value:
                count(child)

    count(body["states"])
    shared, indices, shapes = [], {}, {}

    def pack(value):
        if not isinstance(value, (dict, list, str)):
            return value
        key = identity(value)
        if counts[key] > 1:
            if key not in indices:
                packed = walk(value)
                indices[key] = len(shared)
                shared.append(packed)
            return ["$ref", indices[key]]
        return walk(value)

    def walk(value):
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            keys = tuple(sorted(value))
            children = [pack(value[key]) for key in keys]
            # Repeated object field names dominate observation and roster rows.
            # Share the field layout as well as identical values; no value is dropped.
            if len(identity(keys)) > 30:
                if keys not in shapes:
                    shapes[keys] = len(shared)
                    shared.append(list(keys))
                return ["$ref", shapes[keys], children]
            return dict(zip(keys, children))
        return [pack(child) for child in value]

    states = pack(body["states"])
    # Parent interning can leave a child reference used only once. Inline those
    # children and renumber the retained table instead of paying for both forms.
    uses = Counter()

    def references(value):
        if isinstance(value, list):
            if value and value[0] == "$ref":
                uses[value[1]] += 1
            for child in value:
                references(child)
        elif isinstance(value, dict):
            for child in value.values():
                references(child)

    references(states)
    for value in shared:
        references(value)
    retained, remap = [], {}

    def trim(value):
        if isinstance(value, list):
            if value and value[0] == "$ref":
                index = value[1]
                if len(value) == 2 and uses[index] == 1:
                    return trim(shared[index])
                if index not in remap:
                    packed = trim(shared[index])
                    remap[index] = len(retained)
                    retained.append(packed)
                return ["$ref", remap[index], *([trim(value[2])] if len(value) == 3 else [])]
            return [trim(child) for child in value]
        if isinstance(value, dict):
            return {key: trim(child) for key, child in value.items()}
        return value

    states = trim(states)
    return {**body, "states": states, "shared": retained}


def expand_findings_payload(body):
    """Restore independent transports for producer equality tests."""
    def expand(value):
        if isinstance(value, list):
            if value and value[0] == "$ref":
                referenced = body["shared"][value[1]]
                if len(value) == 3:
                    return dict(zip(referenced, map(expand, value[2])))
                return expand(referenced)
            return [expand(child) for child in value]
        if isinstance(value, dict):
            return {key: expand(child) for key, child in value.items()}
        return value

    return {key: expand(value) for key, value in body.items() if key != "shared"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    stale = False
    for path, body in ((OUT, payload()), (FINDINGS_OUT, compact_findings_payload(findings_payload()))):
        if path == FINDINGS_OUT:
            rendered = json.dumps(body, separators=(",", ":"), sort_keys=True) + "\n"
        else:
            rendered = json.dumps(body, indent=1, sort_keys=True) + "\n"
        if args.check:
            if (path.read_text() if path.exists() else "") != rendered:
                print(f"stale fixture: {path} — rerun scripts/gen_eating_sequence_fixtures.py")
                stale = True
            else:
                print(f"eating-sequence fixture current ({path})")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(rendered)
            print(f"wrote {path}")
    return int(stale)


if __name__ == "__main__":
    raise SystemExit(main())
