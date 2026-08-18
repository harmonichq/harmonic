"""Scenario engine (#70, layer 3) — episodes, levers, patterns, ranked payload.

Consumes the layer-2 instance classifiers
(:mod:`ciq_autotune.analyzers.classifiers`) and the raw timeline to assemble
**episodes**, attribute a single **lever** per episode (root-cause-by-time, the
dedup), group episodes into **patterns**, score them with #58 ``Confidence`` at
episode level, and emit the ranked payload #64 renders.

Public API:

* :func:`~.engine.build_scenarios` — store-facing entry (the API calls this).
* :func:`~.engine.assemble` — the pure engine core (event lists → payload).
* :func:`~.guide.build_catalog` — the #157 Guide / ``/api/catalog`` payload.
* :class:`~.payload.ScenarioReport` / :class:`~.payload.Pattern` /
  :class:`~.payload.Episode` / :class:`~.payload.Step` — the payload contract.
* :class:`~.levers.Lever` — the closed lever taxonomy.
"""

from __future__ import annotations

from .engine import assemble, build_scenarios, low_prompt_answers, tally_attributions
from .attribute import LowPromptAnswer
from .guide import build_catalog
from .model_view import assemble_model_view, build_model_view
from .levers import LEVER_EXPOSURE, Exposure, Lever
from .payload import (
    SCENARIO_SCHEMA_VERSION,
    Episode,
    Pattern,
    PreemptedLows,
    ScenarioReport,
    Step,
)
from .preempted import compute_preempted_lows

__all__ = [
    "assemble",
    "build_scenarios",
    "build_catalog",
    "assemble_model_view",
    "build_model_view",
    "compute_preempted_lows",
    "low_prompt_answers",
    "LowPromptAnswer",
    "tally_attributions",
    "LEVER_EXPOSURE",
    "Exposure",
    "Lever",
    "SCENARIO_SCHEMA_VERSION",
    "Episode",
    "Pattern",
    "PreemptedLows",
    "ScenarioReport",
    "Step",
]
