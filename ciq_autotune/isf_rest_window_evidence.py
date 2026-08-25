"""Cached, read-only rest-window evidence for the fasting ISF estimate.

This preparation deliberately reuses the ISF analyzer's rest-window detector and
fasting-step filter.  It copies their qualifying population into a transport shape;
it does not form windows, infer support, or make an ISF recommendation.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Tuple

from .analyzers.isf import IsfConfig, prepare_fasting_evidence
from .false_low import drop_readings, false_low_spans
from .rescue_evidence import eligible_carb_entries

SCHEMA = "diagnose-isf-rest-window-evidence-v1"


@dataclass(frozen=True)
class IsfRestWindowEvidence:
    windows: Tuple[dict, ...]
    steps: Tuple[dict, ...]
    finding: dict

    def project(self) -> dict:
        qualifying_window_ids = {step["window_id"] for step in self.steps}
        return {
            "schema": SCHEMA,
            "windows": list(self.windows),
            "steps": list(self.steps),
            "counts": {
                "detected_windows": len(self.windows),
                "qualifying_windows": len(qualifying_window_ids),
                "qualifying_steps": len(self.steps),
            },
            # This is copied from the analyzer row; evidence never decides whether
            # an ISF finding stages.
            "finding": self.finding,
        }


def prepare_isf_rest_window_evidence(store, analysis: dict, *, window_days: int) -> IsfRestWindowEvidence:
    """Retain the analyzer's complete qualifying fasting-step population.

    The fixed Diagnose window is bounded exactly like ``analyze``: its horizon is
    the newest basal/CGM instant and its manual-carb stream is eligible at that
    horizon.  The analyzer remains the only owner of rest membership and step
    qualification.
    """
    now = store.latest_cgm_or_basal_timestamp() or datetime.now()
    start = now - timedelta(days=window_days)
    # Match analyze()'s ISF input exactly: false-low answers remove the whole
    # flagged excursion before either rest-window detection or step qualification.
    cgm = drop_readings(
        store.cgm_readings(start, now),
        false_low_spans(store.cgm_readings(), getattr(store, "prompt_responses", lambda: [])()),
    )
    bolus = store.bolus_events(start, now)
    basal = store.basal_events(start, now)
    carbs = eligible_carb_entries(store.carb_entries(start, now), now)
    cfg = IsfConfig()
    fasting_evidence = prepare_fasting_evidence(bolus, basal, cgm, cfg, carb_entries=carbs)
    rest_windows = fasting_evidence.rest_windows
    qualifying = fasting_evidence.steps
    windows = tuple(
        {"id": f"rest:{window.date.isoformat()}", "date": window.date.isoformat(),
         "start": window.start.isoformat(), "end": window.end.isoformat()}
        for window in rest_windows
    )
    steps = tuple(
        {"t": step.t.isoformat(), "insulin_acted": round(step.insulin_acted, 4),
         "dbg": round(step.dbg, 2), "window_id": f"rest:{step.cluster.isoformat()}"}
        for step in qualifying
    )
    row = next((row for row in analysis.get("isf", []) if row.get("parameter") == "isf"), {})
    finding = {
        "asserts_move": row.get("asserts_move"),
        "direction": (row.get("evidence") or {}).get("direction"),
        "safety_status": row.get("safety_status"),
    }
    return IsfRestWindowEvidence(windows, steps, finding)
