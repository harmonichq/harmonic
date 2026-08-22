"""Snapshot-bound preparation and projection for Diagnose Finding case files."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta
from hashlib import sha256
import math
import time
import uuid

from .analyzers.classifiers import classify_correction_stacking
from .analyzers.scenario.anchors import Anchor, AnchorKind, collect_anchors
from .analyzers.scenario.attribute import attribute, split_caused_over_treatments
from .analyzers.scenario.engine import _effective_isf, low_prompt_answers
from .analyzers.scenario.levers import Exposure, Lever, exposure, outcome_kind, title
from .analyzers.scenario.model_view import _CONTEXT_PAD_MIN, _build_episode_view
from .analyzers.scenario import opportunities
from .analyzers.scenario.segment import segment, split_double_humps, split_low_rebounds
from .analyzers.scenario_config import ScenarioConfig
from . import event_comparison, findings_projection
from .false_low import drop_readings, false_low_span_records, spans_from_records
from .result_cache import PREPARATION_LEASE_SECONDS
from .window_membership import WindowQuery

PREPARATION_SCHEMA = "diagnose-finding-case-file-preparation-v1"
CASE_SCHEMA = "diagnose-finding-case-file-v1"
FMT = "%Y-%m-%d %H:%M:%S"


class InconsistentProjection(RuntimeError):
    """The retained population cannot satisfy ADR 79's closed equations."""


def _slice(rows, start, end):
    return [row for row in rows if start <= row.t <= end]


def _opaque(prefix, *stable_key):
    material = "\x1f".join(map(str, stable_key)).encode()
    return prefix + sha256(material).hexdigest()[:32]


def _minute(t: datetime) -> int:
    return t.hour * 60 + t.minute


@dataclass(frozen=True)
class Member:
    opportunity: opportunities.Opportunity
    outcome_t: datetime
    verdict: str

    @property
    def id(self):
        return _opaque("o_", self.opportunity.family.value, *self.opportunity.source_key)


@dataclass(frozen=True)
class Association:
    opportunity_id: str
    outcome_t: datetime
    rebound_nadir_t: datetime | None = None
    correction_pair: tuple[int, int] | None = None


@dataclass
class PreparedCases:
    projection_id: str
    version: int
    query: WindowQuery
    findings: dict
    recurrence: dict[Lever, tuple[int, int]]
    members: dict[Lever, tuple[Member, ...]]
    associations: dict[Lever, frozenset[str]]
    attribution_provenance: dict[Lever, tuple[Association, ...]]
    withheld: frozenset[Lever]
    cgm: tuple
    basal: tuple
    bolus: tuple
    carbs: tuple
    lease_until: float
    source_window_days: int = findings_projection.DIAGNOSE_SOURCE_WINDOW_DAYS
    pins: int = 0

    def _roster(self, lever):
        return tuple(
            row for row in self.members[lever]
            if self.query.contains(_minute(row.outcome_t))
        )

    def _authoritative_row(self, finding_id):
        return next((row for row in self.findings["rows"] if row.get("id") == finding_id), None)

    def case(self, finding_id, alignment, occ):
        lever = Lever(finding_id.removeprefix("finding:"))
        if finding_id != f"finding:{lever.value}" or lever in self.withheld:
            return None
        row = self._authoritative_row(finding_id)
        if row is None:
            return None
        roster = self._roster(lever)
        claimed_ids = self.associations[lever].intersection(member.id for member in roster)
        if not claimed_ids:
            return None
        counts = {
            key: sum(member.verdict == key for member in roster)
            for key in findings_projection.FINDING_VERDICTS
        }
        if (len(roster) != sum(counts.values()) or len(claimed_ids) > counts["fired"]
                or row.get("episodes") != len(claimed_ids)):
            raise InconsistentProjection("inconsistent_projection")
        pattern = self.recurrence.get(lever)
        if (not self.query.scoped and pattern is not None
                and pattern != (len(claimed_ids), len(roster))):
            raise InconsistentProjection("inconsistent_projection")
        projection = (
            _clock(roster, claimed_ids)
            if alignment == "clock"
            else _event(lever, roster, self.cgm)
        )
        selection = {"state": "none", "requested_id": None, "detail": None}
        if occ is not None:
            selected = next((member for member in roster if member.id == occ), None)
            selection = {"state": "unavailable", "requested_id": occ, "detail": None}
            if selected is not None:
                selection = {"state": "selected", "requested_id": occ,
                             "detail": _detail(
                                 selected, lever, self.cgm, self.basal,
                                 self.bolus, self.carbs,
                             )}
        return {
            "schema": CASE_SCHEMA, "projection_id": self.projection_id,
            "finding": {"id": finding_id, "lever": lever.value, "title": title(lever)},
            "window": self.query.to_dict(), "family": exposure(lever).value,
            "summary": {"claimed": len(claimed_ids), "denominator": len(roster),
                        "noun": _noun(exposure(lever))},
            "verdict_counts": counts, "occurrences": [_occurrence(member) for member in roster],
            "projection": projection, "selection": selection,
        }


def prepare(store, *, query, version, selected_id=None, analysis_generation="standalone:0"):
    """Materialize queue, opportunities, attribution, and traces in one read snapshot."""
    store.conn.execute("BEGIN")
    try:
        basal = tuple(store.basal_events())
        cgm = tuple(store.cgm_readings())
        bolus = tuple(store.bolus_events())
        carbs = tuple(store.carb_entries())
        window_days = findings_projection.DIAGNOSE_SOURCE_WINDOW_DAYS
        projection = findings_projection.prepare_findings_projection(
            store, window_days=window_days,
        )
        findings = projection.project(
            query, selected_id, analysis_generation=analysis_generation,
        )
        recurrence = {
            Lever(row["lever"]): (row["confidence"]["k"], row["confidence"]["n"])
            for row in ((projection._scenarios.get("patterns") or [])
                        + (projection._scenarios.get("low_confidence") or []))
        }
        members, associations, provenance, withheld = _population(
            store, basal, cgm, bolus, window_days=window_days,
        )
    finally:
        store.conn.rollback()
    return PreparedCases("fp_" + uuid.uuid4().hex, version, query, findings, recurrence,
                         members, associations, provenance, withheld, cgm, basal, bolus, carbs,
                         time.monotonic() + PREPARATION_LEASE_SECONDS,
                         source_window_days=window_days)


def _population(
    store, basal, cgm, bolus, *,
    window_days=None,
):
    config = ScenarioConfig()
    if window_days is None:
        window_days = findings_projection.DIAGNOSE_SOURCE_WINDOW_DAYS
    times = [row.t for row in basal] + [row.t for row in cgm]
    if not times:
        return ({lever: () for lever in Lever},
                {lever: frozenset() for lever in Lever},
                {lever: () for lever in Lever}, frozenset())
    end = max(times)
    start = end - timedelta(days=window_days)
    filtered_cgm = drop_readings(_slice(cgm, start, end), spans_from_records(
        false_low_span_records(cgm, store.prompt_responses())))
    filtered_bolus = _slice(bolus, start, end)
    filtered_basal = _slice(basal, start, end)
    opportunity_families = opportunities.build_opportunities(
        filtered_bolus, filtered_cgm, filtered_basal, scenario_config=config,
    )
    by_family = {family: {item.source_key: item for item in rows}
                 for family, rows in opportunity_families.items()}
    states = {lever: {} for lever in Lever}
    outcomes = {lever: {} for lever in Lever}
    associations = {lever: set() for lever in Lever}
    provenance = {lever: [] for lever in Lever}
    withheld = set()
    answers = low_prompt_answers(store, start, end)
    isf = _effective_isf(bolus, basal, cgm, store.settings_snapshots(), start, end)
    anchors = collect_anchors(filtered_bolus, filtered_cgm, filtered_basal,
                              scenario_config=config)
    episodes = split_caused_over_treatments(split_low_rebounds(split_double_humps(
        segment(anchors, scenario_config=config), filtered_cgm, scenario_config=config),
        filtered_cgm, scenario_config=config), filtered_cgm, filtered_bolus,
        filtered_basal, isf=isf, scenario_config=config, low_answers=answers)

    for index, episode in enumerate(episodes):
        lo = episode.start - timedelta(minutes=_CONTEXT_PAD_MIN)
        hi = episode.end + timedelta(minutes=_CONTEXT_PAD_MIN)
        attr = attribute(episode, _slice(filtered_cgm, lo, hi),
                         _slice(filtered_bolus, lo, hi), _slice(filtered_basal, lo, hi),
                         isf=isf, scenario_config=config, low_answers=answers)
        view = _build_episode_view(index, episode, filtered_cgm, filtered_bolus,
                                   filtered_basal, isf=isf, scenario_config=config,
                                   low_answers=answers)
        ordered = sorted(episode.anchors, key=lambda anchor: (anchor.t, _anchor_seq(anchor)))
        for source, row in zip(ordered, view["anchors"]):
            family, key = opportunities.canonical_anchor_key(source)
            if family is None or key not in by_family[family]:
                continue
            cause = attr.lever.value if source is attr.driver_anchor and attr.lever else None
            occurrence = {"verdicts": row["verdicts"], "cause_lever": cause}
            for lever in Lever:
                if exposure(lever) is family:
                    states[lever][key] = findings_projection._occurrence_verdict(
                        occurrence, lever.value,
                    )
        if attr.lever is None:
            continue
        association = _association(attr, episode, by_family)
        if association is None:
            withheld.add(attr.lever)
            continue
        family, key, outcome_t = association
        item = by_family[family][key]
        opportunity_id = _opaque("o_", family.value, *item.source_key)
        associations[attr.lever].add(opportunity_id)
        provenance[attr.lever].append(Association(
            opportunity_id=opportunity_id,
            outcome_t=outcome_t,
            rebound_nadir_t=(attr.driver_anchor.rebound_nadir_t
                             if attr.driver_anchor is not None else None),
            correction_pair=attr.correction_pair,
        ))
        outcomes[attr.lever][key] = outcome_t
        states[attr.lever][key] = "fired"

    for item in opportunity_families[Exposure.CORRECTION_CLUSTERS]:
        verdict = classify_correction_stacking(item.members, filtered_cgm, filtered_basal,
                                               scenario_config=config,
                                               iob_boluses=filtered_bolus)
        occurrence = {"verdicts": [{"classifier": Lever.CORRECTION_STACKING.value,
                                     "matched": verdict.matched,
                                     "silence_reason": getattr(verdict.silence_reason,
                                                               "value", verdict.silence_reason)}],
                      "cause_lever": None}
        if item.source_key not in outcomes[Lever.CORRECTION_STACKING]:
            states[Lever.CORRECTION_STACKING][item.source_key] = (
                findings_projection._occurrence_verdict(
                    occurrence, Lever.CORRECTION_STACKING.value,
                )
            )

    members = {}
    for lever in Lever:
        family = exposure(lever)
        members[lever] = tuple(Member(item, outcomes[lever].get(key, item.anchor_t),
                                     states[lever].get(key, "clean"))
                               for key, item in by_family[family].items())
    return (members, {lever: frozenset(ids) for lever, ids in associations.items()},
            {lever: tuple(rows) for lever, rows in provenance.items()}, frozenset(withheld))


def _anchor_seq(anchor):
    return anchor.bolus.seq_num if anchor.bolus is not None else -1


def _association(attr, episode, by_family):
    family = exposure(attr.lever)
    driver = attr.driver_anchor
    if family is Exposure.CORRECTION_CLUSTERS:
        key = attr.correction_pair
    elif (attr.lever is Lever.OVER_TREATED_LOW and driver is not None
          and driver.kind is AnchorKind.HIGH and driver.rebound_nadir_t is not None):
        matches = [key for key, item in by_family[Exposure.LOWS].items()
                   if item.anchor_t == driver.rebound_nadir_t]
        if len(matches) != 1:
            return None
        family, key = Exposure.LOWS, matches[0]
    else:
        driver_family, key = (
            opportunities.canonical_anchor_key(driver)
            if driver is not None else (None, None)
        )
        if driver_family is not family:
            return None
    if key not in by_family.get(family, {}):
        return None
    landing_kind = outcome_kind(attr.lever)
    landings = [anchor.t for anchor in episode.anchors if anchor.kind.value == landing_kind]
    return family, key, max(landings) if landings else by_family[family][key].anchor_t


def wrap(prepared):
    rendered, headers, withheld = [], {}, []
    for row in prepared.findings["rows"]:
        if row.get("register") != "finding":
            rendered.append(deepcopy(row)); continue
        finding_id = row["id"]
        case = prepared.case(finding_id, "clock", None)
        if case is None:
            withheld.append({"finding_id": finding_id,
                             "code": "uninspectable_attribution",
                             "message": "Canonical association is unavailable."})
            continue
        header = {"finding_id": finding_id, "lever": case["finding"]["lever"],
                  "title": case["finding"]["title"], "family": case["family"],
                  "summary": case["summary"], "verdict_counts": case["verdict_counts"],
                  "inspectability": "ready"}
        changed = deepcopy(row)
        changed.update({"appearances": [{"family": case["family"],
                                         "noun": case["summary"]["noun"],
                                         "n": case["summary"]["claimed"],
                                         "m": case["summary"]["denominator"]}],
                        "episodes": case["summary"]["claimed"], "evidence": None,
                        "verdict_counts": case["verdict_counts"],
                        "verdict_counts_by_family": {case["family"]: case["verdict_counts"]},
                        "case_header": header})
        rendered.append(changed); headers[finding_id] = header
    return {"schema": PREPARATION_SCHEMA, "projection_id": prepared.projection_id,
            "coordinates": {
                "source_window_days": prepared.source_window_days,
                "window": prepared.query.to_dict(),
            },
            "findings": deepcopy(prepared.findings), "rendered_rows": rendered,
            "behavioral_case_headers": headers, "withheld_findings": withheld}


def _noun(family):
    return "correction clusters" if family is Exposure.CORRECTION_CLUSTERS else family.value


_CASE_ANCHORS = {
    Exposure.CORRECTION_CLUSTERS: ("second_correction", "Second correction"),
    Exposure.HIGHS: ("high_peak", "High peak"),
}


def _event_anchor(family):
    legacy = event_comparison.VIEW_CONFIG.get(family.value)
    if legacy is not None:
        return legacy["anchor_kind"], legacy["anchor_label"]
    return _CASE_ANCHORS[family]


def _occurrence(member):
    _, label = _event_anchor(member.opportunity.family)
    return {"id": member.id, "date": member.opportunity.anchor_t.date().isoformat(),
            "anchor": {"t": member.opportunity.anchor_t.strftime(FMT),
                       "kind": member.opportunity.anchor_kind, "label": label,
                       "bg": member.opportunity.anchor_bg}, "verdict": member.verdict}


def _clock(roster, claimed_ids):
    buckets = [{"start_min": i * 120, "end_min": (i + 1) * 120, "n": 0,
                "occurrence_ids": []} for i in range(12)]
    for member in roster:
        if member.id in claimed_ids:
            bucket = buckets[_minute(member.outcome_t) // 120]
            bucket["n"] += 1; bucket["occurrence_ids"].append(member.id)
    maximum = max(bucket["n"] for bucket in buckets)
    return {"alignment": "clock", "anchor": None, "window_min": None, "cohorts": [],
            "clock": {"bucket_hours": 2, "total": len(claimed_ids),
                      "peak_bucket_index": next(i for i, b in enumerate(buckets)
                                                if b["n"] == maximum),
                      "buckets": buckets}}


def _trace_bounds(member, lever):
    item, config = member.opportunity, ScenarioConfig()
    if item.family is Exposure.MEALS:
        before, after = event_comparison.VIEW_CONFIG["meals"]["window"]
        return (item.anchor_t + timedelta(minutes=before),
                item.anchor_t + timedelta(minutes=after))
    if item.family is Exposure.LOWS:
        before, after = event_comparison.VIEW_CONFIG["lows"]["window"]
        return (item.anchor_t + timedelta(minutes=before),
                item.anchor_t + timedelta(minutes=after))
    if item.family is Exposure.CORRECTION_CLUSTERS:
        before = max(config.stacking_window_min, config.stacking_slope_lookback_min,
                     config.gate_lookback_min)
        return item.anchor_t - timedelta(minutes=before), item.anchor_t + timedelta(
            minutes=config.stacking_low_lookahead_min)
    onset = item.reach_start or item.anchor_t
    if lever is Lever.MISSED_MEAL:
        before = max(config.missed_meal_slope_lookback_min,
                     config.missed_meal_digestion_lookback_min, config.gate_lookback_min)
        return onset - timedelta(minutes=before), max(onset, item.anchor_t)
    before = max(config.meal_bolus_short_slope_lookback_min,
                 config.meal_bolus_short_digestion_lookback_min, config.gate_lookback_min)
    return onset - timedelta(minutes=before), max(
        item.anchor_t, onset + timedelta(minutes=config.meal_bolus_short_correction_horizon_min))


def _trace(member, lever, cgm):
    lo, hi = _trace_bounds(member, lever)
    anchor = member.opportunity.anchor_t
    return {"id": member.id, "trace": {"cgm": [
        {"t": row.t.strftime(FMT),
         "minute": round((row.t - anchor).total_seconds() / 60, 1), "bg": row.bg}
        for row in cgm if lo <= row.t <= hi and row.bg is not None]}}


def _event(lever, roster, cgm):
    traces = [_trace(member, lever, cgm) for member in roster]
    bounds = [((lo - member.opportunity.anchor_t).total_seconds() / 60,
               (hi - member.opportunity.anchor_t).total_seconds() / 60)
              for member in roster for lo, hi in [_trace_bounds(member, lever)]]
    start = int(math.floor(min(row[0] for row in bounds) / 5) * 5)
    end = int(math.ceil(max(row[1] for row in bounds) / 5) * 5)
    by_id = {member.id: member for member in roster}
    cohorts = [
        event_comparison.project_cohort(
            key,
            [trace for trace in traces if by_id[trace["id"]].verdict == key],
            (start, end),
        )
        for key in findings_projection.FINDING_VERDICTS
    ]
    kind, label = _event_anchor(exposure(lever))
    return {"alignment": "event", "anchor": {"kind": kind, "label": label},
            "window_min": [start, end], "cohorts": cohorts, "clock": None}


def _detail(member, lever, cgm, basal, bolus, carbs):
    lo, hi = _trace_bounds(member, lever)
    anchor = member.opportunity.anchor_t
    markers = [{"kind": "bolus", "t": row.t.strftime(FMT),
                "minute": round((row.t - anchor).total_seconds() / 60, 1),
                "seq_num": row.seq_num, "insulin": row.insulin, "carbs": row.carbs}
               for row in bolus if lo <= row.t <= hi]
    markers.extend({"kind": "rescue_carb", "t": row.t.strftime(FMT),
                    "minute": round((row.t - anchor).total_seconds() / 60, 1),
                    "grams": row.grams, "certainty": row.certainty}
                   for row in carbs if lo <= row.t <= hi)
    markers.extend({
        "kind": "suspend",
        "t": row.t.strftime(FMT),
        "minute": round((row.t - anchor).total_seconds() / 60, 1),
        "delivery_type": row.delivery_type,
        "basal_rate": row.basal_rate,
        "profile_basal_rate": row.profile_basal_rate,
    } for row in basal if lo <= row.t <= hi and row.basal_rate == 0)
    source = ([{"seq_num": row.seq_num, "t": row.t.strftime(FMT),
                "insulin": row.insulin} for row in member.opportunity.members]
              if member.opportunity.family is Exposure.CORRECTION_CLUSTERS else [])
    return _occurrence(member) | {"glucose": _trace(member, lever, cgm)["trace"]["cgm"],
                                  "markers": markers, "source_corrections": source,
                                  "day_target": {"date": anchor.date().isoformat()}}
