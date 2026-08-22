"""Read-only event evidence for analyzer-published retired I:C history.

Preparation copies the catalog's exact active run membership and performs one CGM
read covering those analyzer-owned display bounds.  Projection validates selection
and shapes the response; neither stage forms meal runs, matches schedules, counts
support, or decides lifecycle.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple

from .analyzers.ic import BLOCK_WINDOW_DAYS
from .ic_history import decode_history_id, decode_run_id

SCHEMA = "diagnose-carb-ratio-history-events-v1"


class UnknownHistoryId(KeyError):
    """A canonical identity absent from the ever-publishable catalog."""


class UnknownHistoryRunId(KeyError):
    """A canonical run identity outside the selected active membership."""


class HistoryAgedOut(RuntimeError):
    """The catalog retained the identity after its 90-day estimate expired."""


class HistoryUnavailable(RuntimeError):
    """The catalog identity no longer maps to one current program block."""


@dataclass(frozen=True)
class IcHistoryEventProjection:
    _catalog: Tuple[dict, ...]
    _series: Dict[str, Tuple[dict, ...]]

    def project(
        self, history_id: str, selected_run_id: Optional[str] = None, *,
        analysis_generation: str = "standalone:0",
    ) -> dict:
        decode_history_id(history_id)
        if selected_run_id is not None:
            decode_run_id(selected_run_id)
        history = next((row for row in self._catalog if row.get("id") == history_id), None)
        if history is None:
            raise UnknownHistoryId(history_id)
        if history["lifecycle"] == "aged_out":
            raise HistoryAgedOut(history_id)
        if history["lifecycle"] == "unavailable":
            raise HistoryUnavailable(history_id)

        series = list(self._series.get(history_id, ()))
        run_ids = [run["run_id"] for run in history.get("runs") or []]
        if selected_run_id is not None and selected_run_id not in run_ids:
            raise UnknownHistoryRunId(selected_run_id)
        return {
            "schema": SCHEMA,
            "analysis_generation": analysis_generation,
            "history_id": history_id,
            "window_days": BLOCK_WINDOW_DAYS,
            "run_ids": run_ids,
            "selected_run_id": selected_run_id,
            "series": series,
        }


def prepare_ic_history_events(store, findings) -> IcHistoryEventProjection:
    """Prepare exact active run series from one findings catalog snapshot."""
    catalog = findings.history_catalog
    active_runs = [
        run
        for history in catalog if history.get("lifecycle") == "active"
        for run in history.get("runs") or []
    ]
    if active_runs:
        starts = [datetime.fromisoformat(run["first_member_at"]) for run in active_runs]
        read_start = min(
            start + timedelta(minutes=run["cgm_start_min"])
            for start, run in zip(starts, active_runs)
        )
        read_end = max(
            start + timedelta(minutes=run["cgm_end_min"])
            for start, run in zip(starts, active_runs)
        )
        readings = store.cgm_readings(read_start, read_end)
    else:
        readings = []

    series: Dict[str, Tuple[dict, ...]] = {}
    for history in catalog:
        if history.get("lifecycle") != "active":
            continue
        rows = []
        for run in history.get("runs") or []:
            meal_at = datetime.fromisoformat(run["first_member_at"])
            lower = meal_at + timedelta(minutes=run["cgm_start_min"])
            upper = meal_at + timedelta(minutes=run["cgm_end_min"])
            points = [
                {"minute": (reading.t - meal_at).total_seconds() / 60.0,
                 "bg": reading.bg}
                for reading in readings if lower <= reading.t <= upper
            ]
            rows.append({**run, "meal_at": run["first_member_at"], "points": points})
        series[history["id"]] = tuple(rows)
    return IcHistoryEventProjection(catalog, series)
