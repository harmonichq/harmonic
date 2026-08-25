"""Fixed-window basal-night evidence projection (#143).

This module only copies facts stamped by :func:`analyze_basal`.  In particular it
does not classify windows, form nights, or infer a direction from the roster.
"""

from __future__ import annotations

from dataclasses import dataclass


SCHEMA = "diagnose-basal-night-evidence-v1"


class UnknownBasalSlot(KeyError):
    """A requested clock slot was not published by the fixed-window analysis."""


@dataclass(frozen=True)
class BasalNightEvidence:
    """One fixed analysis payload, projected by the requested basal slot."""

    _basal: tuple[dict, ...]

    def project(self, slot: int, *, analysis_generation: str) -> dict:
        row = next((row for row in self._basal if row.get("slot") == slot), None)
        if row is None:
            raise UnknownBasalSlot(slot)
        evidence = row.get("evidence") or {}
        roster = evidence.get("night_roster") or []
        return {
            "schema": SCHEMA,
            "analysis_generation": analysis_generation,
            "slot": slot,
            "asserts_move": row.get("asserts_move"),
            "safety_status": row.get("safety_status"),
            "roster_count": len(roster),
            "directional_support_count": evidence.get("directional_support_count"),
            "excluded_night_count": evidence.get("excluded_night_count"),
            "nights": roster,
        }


def prepare_basal_night_evidence(analysis: dict) -> BasalNightEvidence:
    """Freeze one analyzer-published basal roster set for a fixed source window."""
    return BasalNightEvidence(tuple(analysis.get("basal") or ()))


def dump_basal_night_evidence(value: BasalNightEvidence) -> dict:
    """Plain durable-artifact form for one fixed analyzer payload."""
    return {"basal": list(value._basal)}


def rebuild_basal_night_evidence(value: dict) -> BasalNightEvidence:
    """Restore the fixed preparation without re-running analysis."""
    return BasalNightEvidence(tuple(value["basal"]))
