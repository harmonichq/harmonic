"""Diagnose workstation's recent anchor-level exposure feed."""

from __future__ import annotations

from datetime import datetime, timedelta

from .analyzers.scenario.attribute import attribute, split_caused_over_treatments
from .analyzers.scenario.engine import _effective_isf, low_prompt_answers
from .analyzers.scenario.levers import Lever, title
from .analyzers.scenario.evidence_population import policy_for
from .analyzers.scenario.model_view import _CONTEXT_PAD_MIN, _build_episode_view, _is_driver
from .analyzers.scenario.anchors import collect_anchors
from .analyzers.scenario.segment import segment, split_double_humps, split_low_rebounds
from .analyzers.scenario_config import ScenarioConfig
from .false_low import drop_readings, false_low_span_records, spans_from_records


_FAMILY_FOR_KIND = {
    "low": "lows",
    "meal": "meals",
    "high": "highs",
    "correction": "correction_clusters",
}


def _slice(events, start, end):
    return [event for event in events if start <= event.t <= end]


def _empty_family() -> dict:
    return {
        "n": 0,
        "attributed": 0,
        "clean": 0,
        # Occurrences whose EPISODE drew no lever at all — see ``build_exposures``.
        "uncaused": 0,
        "levers": [],
        "by_cause": {},
        "occurrences": [],
    }


def _exposure_verdict(verdict: dict) -> dict:
    """Keep the locked Explore verdict contract narrower than model-view detail."""
    return {
        key: verdict[key]
        for key in (
            "classifier",
            "matched",
            "detail",
            "evidence_tier",
            "silence_reason",
        )
    }


def build_exposures(store, *, window_days: int = 30) -> dict:
    """Return recent scenario anchors flattened for the Diagnose workstation.

    Three whole-window tallies come out beside each family's occurrence list, and
    ``clean`` and ``uncaused`` are **not** the same question (#63):

    * ``attributed`` — this occurrence is its episode's driver.
    * ``clean`` = ``n - attributed`` — this occurrence is not the driver. It says
      nothing about the episode: a high in a meal-driven episode is "clean" while its
      episode carries a lever, because the meal anchor drove it.
    * ``uncaused`` — this occurrence's EPISODE drew no lever anywhere, in any family.
      This is the only one of the three that answers "the app found no cause for this
      at all", which is why the Diagnose surface counts highs with it rather than with
      ``clean``. Measured on the 30-day calibration snapshot the two differ by seven:
      27 highs are not drivers, but only 20 sit in an episode with nothing attributed.

    An occurrence outranked by an earlier driver is therefore neither ``attributed``
    nor ``uncaused``: its match stayed diagnostic evidence, but its episode does have
    a cause.
    """
    basal = store.basal_events()
    cgm = store.cgm_readings()
    bolus = store.bolus_events()
    times = [event.t for event in basal] + [reading.t for reading in cgm]
    now = max(times) if times else datetime.now()
    start = now - timedelta(days=window_days)
    families = {name: _empty_family() for name in _FAMILY_FOR_KIND.values()}
    # Tallied in the anchor walk below rather than in the rollup: whether an episode
    # drew a lever is a fact about the ATTRIBUTION, and by rollup time only the
    # per-anchor driver flag survives on the occurrence.
    uncaused = {name: 0 for name in families}

    if not times:
        return {
            "window": {"start": start.date().isoformat(), "end": now.date().isoformat()},
            "exposures": families,
        }

    false_low_records = false_low_span_records(cgm, store.prompt_responses())
    window_cgm = drop_readings(_slice(cgm, start, now), spans_from_records(false_low_records))
    window_bolus = _slice(bolus, start, now)
    window_basal = _slice(basal, start, now)
    low_answers = low_prompt_answers(store, start, now)
    isf = _effective_isf(bolus, basal, cgm, store.settings_snapshots(), start, now)
    scenario_config = ScenarioConfig()

    anchors = collect_anchors(
        window_bolus, window_cgm, window_basal, scenario_config=scenario_config,
    )
    episodes = split_caused_over_treatments(
        split_low_rebounds(
            split_double_humps(
                segment(anchors, scenario_config=scenario_config), window_cgm,
                scenario_config=scenario_config,
            ),
            window_cgm, window_bolus, scenario_config=scenario_config,
        ),
        window_cgm, window_bolus, window_basal,
        isf=isf, scenario_config=scenario_config, low_answers=low_answers,
    )
    for index, episode_anchors in enumerate(episodes):
        context_start = episode_anchors.start - timedelta(minutes=_CONTEXT_PAD_MIN)
        context_end = episode_anchors.end + timedelta(minutes=_CONTEXT_PAD_MIN)
        attribution = attribute(
            episode_anchors,
            _slice(window_cgm, context_start, context_end),
            _slice(window_bolus, context_start, context_end),
            _slice(window_basal, context_start, context_end),
            isf=isf, scenario_config=scenario_config, low_answers=low_answers,
        )
        episode = _build_episode_view(
            index, episode_anchors, window_cgm, window_bolus, window_basal,
            isf=isf, scenario_config=scenario_config,
            low_answers=low_answers,
        )
        for source_anchor, anchor in zip(
            sorted(episode_anchors.anchors, key=lambda item: item.t), episode["anchors"],
        ):
            family = families.get(_FAMILY_FOR_KIND.get(anchor["kind"]))
            if family is None:
                continue
            attributed = _is_driver(source_anchor, attribution)
            if attribution.lever is None:
                uncaused[_FAMILY_FOR_KIND[anchor["kind"]]] += 1
            lever = episode["lever"] if attributed else None
            cause_occurrence_id = None
            if lever == Lever.MEAL_BOLUS_SHORT.value:
                policy = policy_for(lever)
                # The implicated meal is the one the classifier judged, and it judged
                # the rise ONSET (`attribution.trigger_t`), never the peak this anchor
                # sits at. A second eligible meal can land between the two, and keying
                # on the anchor then names a meal the classifier's digestion window had
                # excluded — a different occurrence from the one the engine grouped.
                cause_occurrence_id = policy.occurrence_for_episode(
                    episode["id"], window_bolus, attribution.trigger_t,
                    scenario_config=scenario_config,
                )
            cause_title = title(Lever(lever)) if lever is not None else None
            occurrence = {
                "t": anchor["t"],
                "date": anchor["t"][:10],
                "bg": anchor["bg"],
                "worst_bg": episode["worst_bg"],
                "kind": anchor["kind"],
                "label": anchor["label"],
                "state": anchor["state"],
                "attributed": attributed,
                "cause_lever": lever,
                "cause_title": cause_title,
                "text": episode["steps"][0]["text"] if attributed else "",
                "verdicts": [
                    _exposure_verdict(verdict) for verdict in anchor["verdicts"]
                ],
                "ep_id": episode["id"],
            }
            if cause_occurrence_id is not None:
                occurrence["cause_occurrence_id"] = cause_occurrence_id
            family["occurrences"].append(occurrence)

    for name, family in families.items():
        occurrences = family["occurrences"]
        family["n"] = len(occurrences)
        family["attributed"] = sum(item["attributed"] for item in occurrences)
        family["clean"] = family["n"] - family["attributed"]
        family["uncaused"] = uncaused[name]
        family["levers"] = list(dict.fromkeys(
            item["cause_lever"] for item in occurrences if item["cause_lever"] is not None
        ))
        for item in occurrences:
            if item["cause_title"] is not None:
                family["by_cause"][item["cause_title"]] = (
                    family["by_cause"].get(item["cause_title"], 0) + 1
                )
    return {
        "window": {"start": start.date().isoformat(), "end": now.date().isoformat()},
        "exposures": families,
    }
