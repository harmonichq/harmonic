"""Cached projection of analyzer-owned fasting ISF evidence."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

SCHEMA = "diagnose-isf-rest-window-evidence-v1"


@dataclass(frozen=True)
class IsfRestWindowEvidence:
    windows: Tuple[dict, ...]
    steps: Tuple[dict, ...]
    counts: dict
    finding: dict

    def project(self) -> dict:
        return {"schema": SCHEMA, "windows": list(self.windows), "steps": list(self.steps),
                "counts": self.counts, "finding": self.finding}


def prepare_isf_rest_window_evidence(analysis: dict) -> IsfRestWindowEvidence:
    """Copy published analyzer evidence plus its retained step-to-window mapping."""
    row = next(row for row in analysis["isf"] if row["parameter"] == "isf")
    evidence = row.get("evidence") or {}
    published_windows = tuple(evidence.get("rest_windows") or ())
    steps = tuple(analysis.get("_isf_rest_window_steps") or ())
    counts = {"detected_windows": len(published_windows),
              "qualifying_windows": row.get("estimate", {}).get("n_clusters", 0),
              "qualifying_steps": evidence.get("n_steps", 0)}
    if counts["qualifying_steps"] != len(steps):
        raise ValueError("retained fasting steps disagree with analyzer evidence")
    if counts["qualifying_windows"] != len({step["window_id"] for step in steps}):
        raise ValueError("retained fasting windows disagree with analyzer evidence")
    windows = tuple({"id": f"rest:{window['date']}", **window} for window in published_windows)
    return IsfRestWindowEvidence(
        windows, steps, counts,
        {"asserts_move": row.get("asserts_move"), "direction": evidence.get("direction")},
    )
