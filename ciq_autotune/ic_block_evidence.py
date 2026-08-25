"""Read-only current I:C-block meal-run evidence.

Preparation receives the active analyzer payload, retains its published run roster,
and reads CGM only over the analyzer-owned display bounds.  Projection copies those
facts through; it never forms runs, re-counts support, or changes a block verdict.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Tuple


SCHEMA = "diagnose-carb-ratio-block-evidence-v1"


class UnknownIcBlockId(KeyError):
    """The requested current block is absent from the fixed analysis."""


class InconsistentIcBlockEvidence(RuntimeError):
    """The analyzer payload omitted a fact this projection must copy."""


@dataclass(frozen=True)
class IcBlockEvidenceProjection:
    _blocks: Tuple[dict, ...]
    _series: Dict[int, Tuple[dict, ...]]

    def project(self, block_id: int, *, analysis_generation: str = "standalone:0") -> dict:
        block = next((row for row in self._blocks if row.get("block_id") == block_id), None)
        if block is None:
            raise UnknownIcBlockId(block_id)
        try:
            evidence = block["evidence"]
            runs = list(evidence["runs"])
            examined_runs = evidence["n_runs_touching"]
            excluded_runs = evidence["n_runs_excluded"]
            effective_support = evidence["eligibility"]["effective_run_count"]
        except (KeyError, TypeError) as error:
            raise InconsistentIcBlockEvidence("current block evidence is incomplete") from error
        return {
            "schema": SCHEMA,
            "analysis_generation": analysis_generation,
            "block": {
                "block_id": block["block_id"], "start_min": block["start_min"],
                "end_min": block["end_min"], "label": block["label"],
                "state": block["state"], "asserts_move": block["asserts_move"],
                # This is the analyzer's published support, not a roster-derived count.
                "support": block["n_runs"],
                "effective_support": effective_support,
                "examined_runs": examined_runs,
                "excluded_runs": excluded_runs,
            },
            "runs": runs,
            "series": list(self._series.get(block_id, ())),
        }


def prepare_ic_block_evidence(store, analysis: dict) -> IcBlockEvidenceProjection:
    """Prepare exact current-block CGM series from analyzer-published run metadata."""
    try:
        blocks = tuple(analysis["ic_blocks"])
        runs = [run for block in blocks for run in block["evidence"]["runs"]]
    except (KeyError, TypeError) as error:
        raise InconsistentIcBlockEvidence("current block evidence is incomplete") from error
    if runs:
        starts = [datetime.fromisoformat(run["t"]) for run in runs]
        read_start = min(start + timedelta(minutes=run["cgm_start_min"])
                         for start, run in zip(starts, runs))
        read_end = max(start + timedelta(minutes=run["cgm_end_min"])
                       for start, run in zip(starts, runs)) + timedelta(microseconds=1)
        readings = store.cgm_readings(read_start, read_end)
    else:
        readings = []

    series: Dict[int, Tuple[dict, ...]] = {}
    for block in blocks:
        rows = []
        for run in block["evidence"]["runs"]:
            start = datetime.fromisoformat(run["t"])
            lower = start + timedelta(minutes=run["cgm_start_min"])
            upper = start + timedelta(minutes=run["cgm_end_min"])
            rows.append({
                "run_id": run["run_id"],
                "points": [
                    {"minute": (reading.t - start).total_seconds() / 60.0,
                     "bg": reading.bg}
                    for reading in readings if lower <= reading.t <= upper
                ],
            })
        series[block["block_id"]] = tuple(rows)
    return IcBlockEvidenceProjection(blocks, series)
