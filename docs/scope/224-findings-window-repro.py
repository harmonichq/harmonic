"""Aggregate-only reproduction for issue #224 against a read-only snapshot.

This probe intentionally prints no event timestamps, glucose values, doses, or
identifiers. Row counts and window-level outcomes are the only snapshot-derived
values allowed to leave the process.
"""

from __future__ import annotations

import argparse
import traceback

from ciq_autotune.analyze import analyze
from ciq_autotune.analyzers.scenario import build_scenarios
from ciq_autotune.analyzers.scenario.levers import Lever
from ciq_autotune.explore_exposures import build_exposures
from ciq_autotune.finding_case_file import prepare, wrap
from ciq_autotune.findings_projection import DIAGNOSE_SOURCE_WINDOW_DAYS, FINDING_VERDICTS
from ciq_autotune.store import Store
from ciq_autotune.window_membership import WindowQuery


def _products(store):
    captured = []
    analysis = analyze(
        store,
        window_days=DIAGNOSE_SOURCE_WINDOW_DAYS,
        ignore_setting_changes=False,
        pool_agreeing_basal_regimes=True,
        carb_entries=store.carb_entries(),
        prompt_responses=store.prompt_responses(),
        isf_fasting_evidence_sink=captured.append,
    ).to_dict()
    if len(captured) != 1:
        raise RuntimeError("ISF analyzer did not retain one fasting evidence set")
    return (
        analysis,
        build_exposures(store, window_days=DIAGNOSE_SOURCE_WINDOW_DAYS),
        build_scenarios(store, window_days=DIAGNOSE_SOURCE_WINDOW_DAYS).to_dict(),
    )


def _consistency(prepared):
    mismatches = []
    for row in prepared.findings["rows"]:
        if row.get("register") != "finding":
            continue
        lever = Lever(row["id"].removeprefix("finding:"))
        roster = prepared._roster(lever)
        claimed = prepared.associations[lever].intersection(member.id for member in roster)
        counts = {
            key: sum(member.verdict == key for member in roster)
            for key in FINDING_VERDICTS
        }
        if (len(roster) != sum(counts.values())
                or len(claimed) > counts["fired"]
                or row.get("episodes") != len(claimed)):
            mismatches.append((lever.value, row.get("episodes"), len(claimed)))
    return mismatches


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot")
    args = parser.parse_args()

    with Store.open_readonly(args.snapshot) as store:
        analysis, exposures, scenarios = _products(store)
        for start in range(0, 1440, 240):
            end = (start + 240) % 1440
            label = f"{start // 60:02d}:00-{end // 60:02d}:00"
            try:
                prepared = prepare(
                    store,
                    query=WindowQuery.clock(start, end),
                    version=0,
                    analysis=analysis,
                    exposures=exposures,
                    scenarios=scenarios,
                    analysis_generation="scope-probe:0",
                )
                mismatches = _consistency(prepared)
                body = wrap(prepared)
                print(label, "ok", "rendered", len(body["rendered_rows"]),
                      "mismatches", mismatches)
            except Exception as error:
                frames = [(frame.name, frame.filename.rsplit("/", 1)[-1], frame.lineno)
                          for frame in traceback.extract_tb(error.__traceback__)]
                print(label, "FAILED", type(error).__name__, "frames", frames)


if __name__ == "__main__":
    main()
