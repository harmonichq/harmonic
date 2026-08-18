"""Pre-empted (masked) lows — the #172 coaching count (ADR 0012).

The scenario engine anchors on CGM shape: a **Lever** needs an **Episode**, which
needs an **Anchor**, and a drop arrested *before* it prints a low has no nadir
anchor at all (a drop stopped at 95 is deliberately a non-excursion). So when the
user eats fast carbs to arrest a post-bolus drop early — a **Rescue carb** — the
low is *masked*: it leaves no CGM trace, only a ``source='manual'`` **Carb log**
entry. This module turns that entry into a **count** the Patterns view can show,
attributed at I:C or ISF by the bolus that ran the drop.

The hard lines (ADR 0012), enforced structurally here:

* **A count, never a rate.** :func:`compute_preempted_lows` returns a
  :class:`~...payload.PreemptedLows` with no denominator — a rate over rescues
  inverts ADR 0008's under-logging honesty (a forgotten rescue reads as a clean day
  and buries the pattern). This function is *incapable* of dividing.
* **Only the masked subset.** ``source='manual'`` is necessary but not sufficient:
  a manual entry whose surrounding CGM reached a printed (near-)low nadir is a
  hand-logged printed-low *treatment* (ADR 0011 Coverage), owned by the low levers —
  excluded. ``rise-prompt`` / ``low-prompt`` are excluded outright.
* **One IOB curve, coaching only.** Attribution reuses the ``insulin`` module's
  bolus-only exponential model (peak/DIA off :class:`~ciq_autotune.model.ModelConfig`);
  no second curve is built. The result routes *attention* — it never feeds
  basal/ISF/I:C estimation (a rescue is a censored observation; ADR 0012 §4).

Pure function of event lists (no store), so it is fully unit-testable.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Sequence

from ...events import BolusEvent, CarbEntry, CgmReading
from ...insulin import ACCOUNTING_DIA_MIN, BolusIob
from ...model import ModelConfig
from ..scenario_config import ScenarioConfig
from .payload import PreemptedLows

# Back-compat re-exports: the printed-low proximity window and the attributability
# floor now live on ``ScenarioConfig`` (``preempted_printed_low_window_min`` /
# ``preempted_attributability_floor_u`` — the live values the functions read). Kept
# here as module aliases because the pre-empted-low tests import them. The proximity
# "near" test reuses the engine's own low-anchor line (``anchor_near_low_mgdl``, 75).
PRINTED_LOW_WINDOW_MIN = ScenarioConfig().preempted_printed_low_window_min
ATTRIBUTABILITY_FLOOR_U = ScenarioConfig().preempted_attributability_floor_u


@dataclass(frozen=True)
class PreemptedLowEntry:
    """One manual carb entry that passed the pre-empted-low gate.

    ``bucket`` is ``"ic"``, ``"isf"``, or ``None`` for unattributed. The owning
    bolus fields are carried for consumers that need to key a gate to the setting
    row that owned the drop; the aggregate payload below still exposes only counts.
    """

    entry: CarbEntry
    bucket: Optional[str]
    bolus_t: Optional[datetime] = None
    residual_u: float = 0.0


def _is_manual(entry: CarbEntry) -> bool:
    return entry.source == "manual"


def _printed_low_near(
    entry: CarbEntry, cgm: Sequence[CgmReading],
    *, scenario_config: ScenarioConfig = ScenarioConfig(),
) -> bool:
    """True iff the CGM reached a printed (near-)low (≤ ``gate_low_mgdl``) near ``entry``.

    Such an entry is a hand-logged printed-low *treatment*, not a pre-empted low —
    the low the engine would have anchored anyway (ADR 0011 Coverage). Excluded.
    """
    window_min = scenario_config.preempted_printed_low_window_min
    low_mgdl = scenario_config.anchor_near_low_mgdl
    lo = entry.t - timedelta(minutes=window_min)
    hi = entry.t + timedelta(minutes=window_min)
    return any(
        r.bg is not None and r.bg <= low_mgdl and lo <= r.t <= hi
        for r in cgm
    )


def is_preempted_low_entry(
    entry: CarbEntry,
    cgm_readings: Sequence[CgmReading],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> bool:
    """True iff ``entry`` is in the pre-empted-low subset (ADR 0012).

    Source alone is not enough: a manual carb logged on a printed low is a low
    treatment, and prompt-sourced rows are answers to printed prompts. The masked
    rescue signal is only a manual row with no printed near-low nearby.
    """
    return _is_manual(entry) and not _printed_low_near(
        entry, cgm_readings, scenario_config=scenario_config
    )


def _residual(bolus: BolusEvent, at: datetime, peak: float, dia: float) -> float:
    """Residual bolus IOB (U) this bolus still carries at instant ``at``.

    Reuses the sanctioned bolus-only :class:`~ciq_autotune.insulin.BolusIob` curve
    over the single bolus — **not** a second, hand-rolled curve — so an extended
    (square/dual-wave) bolus's residual is spread across its ``extended_duration``
    exactly as everywhere else, and a standard bolus stays a point mass. A None /
    non-positive dose contributes nothing (BolusIob skips it → 0).
    """
    return BolusIob([bolus], peak, dia).at(at)


def _attribute_entry(
    rescue_t: datetime,
    boluses: Sequence[BolusEvent],
    config: ModelConfig,
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> tuple[Optional[str], Optional[BolusEvent], float]:
    """Attribute a pre-empted low to its preceding bolus, if one clears the floor.

    The candidate set is boluses delivered at-or-before the rescue, within DIA, whose
    own residual bolus IOB clears :data:`ATTRIBUTABILITY_FLOOR_U`. The **most recent**
    such bolus attributes it: ``carbs > 0`` → a **meal** → I:C; else a **correction**
    → ISF (classification keys off the delivered row's carbs, not the anchor meal
    floor). No candidate → no live bolus IOB → ``None`` (unattributed).
    """
    peak, dia = config.insulin_peak_min, ACCOUNTING_DIA_MIN
    floor_u = scenario_config.preempted_attributability_floor_u
    candidates = [
        (b, _residual(b, rescue_t, peak, dia)) for b in boluses
        if b.t <= rescue_t
        and (rescue_t - b.t).total_seconds() / 60.0 <= dia
    ]
    candidates = [(b, residual) for b, residual in candidates if residual > floor_u]
    if not candidates:
        return None, None, 0.0
    preceding, residual = max(candidates, key=lambda p: p[0].t)
    bucket = "ic" if (preceding.carbs and preceding.carbs > 0) else "isf"
    return bucket, preceding, residual


def _attribute(
    rescue_t: datetime,
    boluses: Sequence[BolusEvent],
    config: ModelConfig,
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Optional[str]:
    """Bucket a pre-empted low by its preceding bolus: ``"ic"`` / ``"isf"`` / ``None``."""
    bucket, _, _ = _attribute_entry(
        rescue_t, boluses, config, scenario_config=scenario_config)
    return bucket


def preempted_low_entries(
    carb_entries: Sequence[CarbEntry],
    bolus_events: Sequence[BolusEvent],
    cgm_readings: Sequence[CgmReading],
    *,
    config: ModelConfig = ModelConfig(),
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> list[PreemptedLowEntry]:
    """Return the per-entry pre-empted-low facts behind the aggregate count.

    This is the same gate as :func:`compute_preempted_lows`: manual entries only,
    no printed near-low nearby, and residual-bolus attribution. It exists so an
    owning analyzer can apply a safety gate without re-deriving or double-counting
    the aggregate scenario signal.
    """
    out: list[PreemptedLowEntry] = []
    for entry in carb_entries:
        if not is_preempted_low_entry(
            entry, cgm_readings, scenario_config=scenario_config
        ):
            continue
        bucket, bolus, residual = _attribute_entry(
            entry.t, bolus_events, config, scenario_config=scenario_config)
        out.append(PreemptedLowEntry(
            entry=entry,
            bucket=bucket,
            bolus_t=bolus.t if bolus is not None else None,
            residual_u=round(residual, 3),
        ))
    return out


def compute_preempted_lows(
    carb_entries: Sequence[CarbEntry],
    bolus_events: Sequence[BolusEvent],
    cgm_readings: Sequence[CgmReading],
    *,
    config: ModelConfig = ModelConfig(),
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> PreemptedLows:
    """The #172 pre-empted-low count over the window (ADR 0012).

    Filters the Carb log to its **pre-empted subset** — ``source='manual'`` entries
    with no printed (near-)low nadir nearby — and counts them, bucketing each by the
    bolus that ran the drop (I:C / ISF / unattributed). Returns a
    :class:`~...payload.PreemptedLows` count-object; never a rate.
    """
    ic = isf = unattributed = 0
    for entry in preempted_low_entries(
        carb_entries, bolus_events, cgm_readings,
        config=config, scenario_config=scenario_config,
    ):
        bucket = entry.bucket
        if bucket == "ic":
            ic += 1
        elif bucket == "isf":
            isf += 1
        else:
            unattributed += 1
    return PreemptedLows(
        total=ic + isf + unattributed,
        ic=ic,
        isf=isf,
        unattributed=unattributed,
        floor_u=scenario_config.preempted_attributability_floor_u,
    )
