"""Diagnose workstation's recent anchor-level exposure feed."""

from __future__ import annotations

from datetime import datetime, timedelta

from .analyzers.scenario.anchors import AnchorKind
from .analyzers.scenario.evaluation import evaluate
from .analyzers.scenario.engine import low_prompt_answers
from .analyzers.scenario.levers import Exposure, Lever, outcome_kind, title
from .analyzers.scenario.model_view import _build_episode_view, _fmt, stacking_reached_low
from .analyzers.scenario.opportunities import canonical_anchor_key
from .analyzers.scenario_config import ScenarioConfig
from .false_low import drop_readings, false_low_span_records, spans_from_records
from .settings import IsfSource


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


def _opportunity_identities(families):
    """Return the recurrence opportunity an episode anchor is, or ``None``.

    A glucose or meal anchor is its canonical opportunity when that opportunity is
    in its family's population. A correction is the pair it closes: the pair is
    anchored at its second dose, as the engine anchors it.
    """
    keys = {family: {item.source_key for item in items} for family, items in families.items()}
    pair_of = {item.members[1].seq_num: item.source_key
               for item in families[Exposure.CORRECTION_CLUSTERS]}

    def member_of(anchor):
        if anchor.kind is AnchorKind.CORRECTION:
            key = pair_of.get(anchor.bolus.seq_num)
            return None if key is None else (Exposure.CORRECTION_CLUSTERS, key)
        family, key = canonical_anchor_key(anchor)
        return (family, key) if family is not None and key in keys[family] else None

    return member_of


def _stamp_claim_severity(target: dict, lever: str, severity: float) -> None:
    """Keep beside a claim the severity of the episode it came from (ADR 593): the
    largest when one lever claims an occurrence from more than one episode, as the
    engine takes a policy Occurrence's worst episode. Rounded as the scenario
    payload serves an episode's severity."""
    claims = target.setdefault("claim_severity", {})
    severity = round(severity, 2)
    claims[lever] = max(claims.get(lever, severity), severity)


def build_exposures(store, *, window_days: int = 30) -> dict:
    """Return recent scenario anchors flattened for the Diagnose workstation.

    Each family's occurrences are its recurrence population (#550): one per
    opportunity the engine prices a habit over (meals, sub-70 lows, highs at or over
    250, correction pairs), never an anchor the episode walk adds outside them.
    Three whole-window tallies come out beside each family's occurrence list, and
    ``clean`` and ``uncaused`` are **not** the same question (#63):

    * ``attributed`` — an episode's claim is associated with this occurrence: the
      one opportunity the engine counts that claim on. Its first claim names
      ``cause_lever``.
    * ``attributed_levers`` — every lever this feed maps onto this opportunity: each
      claim associated with it, and the cross-family low reached by correction
      stacking. The primary driver fields stay unchanged.
    * ``claim_severity`` — beside every attributed lever, the severity of the episode
      its claim came from (ADR 593); absent on an occurrence nothing claims.
    * ``clean`` = ``n - attributed`` — no claim is associated with this occurrence.
      It says nothing about the episode: a high in a meal-driven episode is "clean"
      while its episode carries a lever, because the meal anchor drove it.
    * ``uncaused`` — this occurrence's EPISODE drew no lever anywhere, in any family.
      This is the only one of the three that answers "the app found no cause for this
      at all", which is why the Diagnose surface counts highs with it rather than with
      ``clean``. Measured on the 30-day calibration snapshot the two differ by seven:
      27 highs are not drivers, but only 20 sit in an episode with nothing attributed.
      One exception (ADR 422): a High an over-treated low's rebound owns is explained
      by that low, so it is never ``uncaused``, even when its own episode drew no
      lever. It stays a non-driver occurrence with no attributed lever.

    An occurrence outranked by another driver is therefore neither ``attributed``
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
    isf = IsfSource.from_snapshots(store.settings_snapshots())
    scenario_config = ScenarioConfig()

    evaluated = evaluate(window_bolus, window_cgm, window_basal, isf=isf,
                         scenario_config=scenario_config, low_answers=low_answers,
                         window_start=start, window_end=now, bound_classifier_context=False)
    # Each family lists its recurrence population and nothing else (#550): the
    # opportunities the engine prices a habit over, so an anchor the episode walk
    # adds outside them (a rebound's synthesized High, the first correction of the
    # window, which pairs with nothing) is no occurrence.
    member_of = _opportunity_identities(evaluated.families)
    # The one opportunity each attributed episode's claim is associated with.
    claims = {row.episode_id: row for row in evaluated.attributed if row.anchor_t is not None}
    by_identity = {}
    claimed = []
    # A classifier's padded context can reach an opportunity in another episode.
    # Cross-family attribution is therefore opportunistic: stamp a target only when
    # this feed also emitted that opportunity, and otherwise preserve the feed.
    target_attributions = []
    for index, evaluated_episode in enumerate(evaluated.episodes):
        episode_anchors = evaluated_episode.anchors
        attribution = evaluated_episode.attribution
        landing_kind = outcome_kind(attribution.lever)
        landing = max(
            (item for item in episode_anchors.anchors
             if item.kind.value == landing_kind),
            key=lambda item: item.t,
            default=None,
        )
        outcome_minute = (
            landing.t.hour * 60 + landing.t.minute if landing is not None else None
        )
        episode = _build_episode_view(
            index, episode_anchors, window_cgm, window_bolus, window_basal,
            isf=isf, scenario_config=scenario_config,
            low_answers=low_answers, evaluated=evaluated_episode,
        )
        reached_low = stacking_reached_low(episode_anchors.anchors, attribution)
        if reached_low is not None:
            target_attributions.append(
                ("lows", reached_low.t, attribution.lever.value,
                 outcome_minute, attribution.driver_anchor.t, evaluated_episode.severity)
            )
        retained = {id(item): verdicts for item, verdicts
                    in zip(episode_anchors.anchors, attribution.anchor_verdicts)}
        owned_highs = [high for high, _owner in attribution.owned_highs]
        for source_anchor, anchor in zip(
            sorted(episode_anchors.anchors, key=lambda item: item.t), episode["anchors"],
        ):
            identity = member_of(source_anchor)
            if identity is None:
                continue
            family_name = identity[0].value
            if attribution.lever is None and source_anchor not in owned_highs:
                uncaused[family_name] += 1
            occurrence = {
                "t": anchor["t"],
                "date": anchor["t"][:10],
                "bg": anchor["bg"],
                # The anchor bolus's dose and carbs, null on a glucose anchor: a
                # Pattern case file reads them here rather than matching a bolus.
                "insulin": anchor["insulin"],
                "carbs": anchor["carbs"],
                "worst_bg": episode["worst_bg"],
                "kind": anchor["kind"],
                "label": anchor["label"],
                "state": anchor["state"],
                "attributed": False,
                "attributed_levers": [],
                "cause_lever": None,
                "cause_title": None,
                "text": "",
                "verdicts": [
                    _exposure_verdict(verdict) for verdict in anchor["verdicts"]
                ],
                "ep_id": episode["id"],
            }
            families[family_name]["occurrences"].append(occurrence)
            by_identity[identity] = occurrence
        claim = claims.get(evaluated_episode.id)
        if claim is not None:
            lever = claim.lever.value
            # The correction a low this episode's correction habit claims followed:
            # its own verdict's judged dose (ADR 523).
            corrected = next((verdict.correction_t
                              for verdict in retained.get(id(attribution.driver_anchor), ())
                              if verdict.classifier == lever and verdict.matched
                              and verdict.correction_t is not None), None)
            claimed.append(((claim.driver_family, claim.driver_source_key), lever,
                            outcome_minute, episode["steps"][0]["text"], corrected,
                            evaluated_episode.severity))

    # A claim lands once the walk is done: an over-treated low claimed from its
    # rebound's High is the crash low, which an earlier episode emitted. The first
    # claim on an opportunity is its cause; every claim is one of its levers, and a
    # later one keeps where its own consequence landed.
    for identity, lever, outcome_minute, text, corrected, severity in claimed:
        target = by_identity[identity]
        target["attributed_levers"].append(lever)
        _stamp_claim_severity(target, lever, severity)
        if corrected is not None:
            target.setdefault("corrections", {})[lever] = _fmt(corrected)
        if target["cause_lever"] is not None:
            if outcome_minute is not None:
                target.setdefault("lever_outcome_minutes", {})[lever] = outcome_minute
            continue
        target.update(attributed=True, cause_lever=lever, cause_title=title(Lever(lever)),
                      text=text)
        if outcome_minute is not None:
            target["outcome_minute"] = outcome_minute

    for family_name, target_t, lever, outcome_minute, dose_t, severity in target_attributions:
        target = next(
            (
                item for item in families[family_name]["occurrences"]
                if datetime.fromisoformat(item["t"]) == target_t
            ),
            None,
        )
        if target is not None and lever not in target["attributed_levers"]:
            target["attributed_levers"].append(lever)
            _stamp_claim_severity(target, lever, severity)
            # A stacked pair reaches its low from the stacking dose, its driver.
            target.setdefault("corrections", {})[lever] = _fmt(dose_t)
            if outcome_minute is not None:
                target["outcome_minute"] = outcome_minute

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
