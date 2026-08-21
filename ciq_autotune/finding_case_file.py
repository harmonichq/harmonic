"""One snapshot-bound population for Diagnose Finding case files (ADR 79)."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta
from hashlib import sha256
import time
import uuid

from .analyzers.scenario.anchors import AnchorKind, collect_anchors
from .analyzers.scenario.attribute import attribute, split_caused_over_treatments
from .analyzers.scenario.engine import _effective_isf, low_prompt_answers
from .analyzers.scenario.levers import Exposure, Lever, exposure, title
from .analyzers.scenario.model_view import _CONTEXT_PAD_MIN, _build_episode_view, _is_driver
from .analyzers.scenario.opportunities import Opportunity, build_opportunities
from .analyzers.scenario.segment import segment, split_double_humps, split_low_rebounds
from .analyzers.scenario_config import ScenarioConfig
from .false_low import drop_readings, false_low_span_records, spans_from_records
from .findings_projection import _occurrence_verdict, prepare_findings_projection
from .window_membership import WindowQuery

PREPARATION_SCHEMA = "diagnose-finding-case-file-preparation-v1"
CASE_SCHEMA = "diagnose-finding-case-file-v1"
VERDICTS = ("fired", "outranked", "near_miss", "no_data", "clean")
FMT = "%Y-%m-%d %H:%M:%S"


def _slice(rows, start, end):
    return [row for row in rows if start <= row.t <= end]


def _opaque(prefix, *values):
    return prefix + sha256("\x1f".join(map(str, values)).encode()).hexdigest()[:32]


@dataclass(frozen=True)
class Member:
    opportunity: Opportunity
    outcome_t: datetime
    verdict: str

    @property
    def id(self):
        return _opaque("o_", self.opportunity.family.value, *self.opportunity.source_key)


@dataclass
class PreparedCases:
    projection_id: str
    version: int
    query: WindowQuery
    findings: dict
    members: dict[Lever, tuple[Member, ...]]
    associations: dict[Lever, frozenset[str]]
    cgm: tuple
    basal: tuple
    bolus: tuple
    lease_until: float
    pins: int = 0

    def _roster(self, lever):
        return tuple(member for member in self.members[lever]
                     if self.query.contains(member.outcome_t.hour * 60 + member.outcome_t.minute))

    def case(self, finding_id, alignment, occ):
        try:
            lever = Lever(finding_id.removeprefix("finding:"))
        except ValueError:
            return None
        if finding_id != f"finding:{lever.value}" or lever not in self.members:
            return None
        roster = self._roster(lever)
        claimed = {member.id for member in roster} & self.associations[lever]
        if not claimed:
            return None
        counts = {key: sum(member.verdict == key for member in roster) for key in VERDICTS}
        if len(roster) != sum(counts.values()) or len(claimed) > counts["fired"]:
            raise ValueError("inconsistent_projection")
        occurrences = [_occurrence(member) for member in roster]
        projection = _clock(roster, claimed) if alignment == "clock" else _event(lever)
        selection = {"state": "none", "requested_id": None, "detail": None}
        if occ is not None:
            selected = next((member for member in roster if member.id == occ), None)
            selection = {"state": "unavailable", "requested_id": occ, "detail": None}
            if selected is not None:
                selection = {"state": "selected", "requested_id": occ,
                             "detail": _detail(selected, self.cgm, self.bolus)}
        return {"schema": CASE_SCHEMA, "projection_id": self.projection_id,
                "finding": {"id": finding_id, "lever": lever.value, "title": title(lever)},
                "window": self.query.to_dict(), "family": exposure(lever).value,
                "summary": {"claimed": len(claimed), "denominator": len(roster), "noun": _noun(exposure(lever))},
                "verdict_counts": counts, "occurrences": occurrences,
                "projection": projection, "selection": selection}


def prepare(store, *, query: WindowQuery, version: int) -> PreparedCases:
    """Read all inputs and attribution provenance in one SQLite read transaction."""
    store.conn.execute("BEGIN")
    try:
        basal, cgm, bolus = store.basal_events(), store.cgm_readings(), store.bolus_events()
        findings = prepare_findings_projection(store).project(query)
        members, associations = _members(store, basal, cgm, bolus)
    finally:
        store.conn.rollback()
    return PreparedCases("fp_" + uuid.uuid4().hex, version, query, findings, members,
                         associations, tuple(cgm), tuple(basal), tuple(bolus), time.monotonic() + 60)


def _members(store, basal, cgm, bolus):
    config = ScenarioConfig()
    opportunities = build_opportunities(bolus, cgm, basal, scenario_config=config)
    by_family = {family: {item.source_key: item for item in rows} for family, rows in opportunities.items()}
    states = {lever: {} for lever in Lever}
    associations = {lever: set() for lever in Lever}
    times = [item.t for item in basal] + [item.t for item in cgm]
    if not times:
        return {lever: () for lever in Lever}, {lever: frozenset() for lever in Lever}
    now, start = max(times), max(times) - timedelta(days=30)
    filtered_cgm = drop_readings(_slice(cgm, start, now), spans_from_records(false_low_span_records(cgm, store.prompt_responses())))
    filtered_bolus, filtered_basal = _slice(bolus, start, now), _slice(basal, start, now)
    answers = low_prompt_answers(store, start, now)
    isf = _effective_isf(bolus, basal, cgm, store.settings_snapshots(), start, now)
    anchors = collect_anchors(filtered_bolus, filtered_cgm, filtered_basal, scenario_config=config)
    episodes = split_caused_over_treatments(split_low_rebounds(split_double_humps(segment(anchors, scenario_config=config), filtered_cgm, scenario_config=config), filtered_cgm, scenario_config=config), filtered_cgm, filtered_bolus, filtered_basal, isf=isf, scenario_config=config, low_answers=answers)
    for index, episode in enumerate(episodes):
        lo, hi = episode.start - timedelta(minutes=_CONTEXT_PAD_MIN), episode.end + timedelta(minutes=_CONTEXT_PAD_MIN)
        attr = attribute(episode, _slice(filtered_cgm, lo, hi), _slice(filtered_bolus, lo, hi), _slice(filtered_basal, lo, hi), isf=isf, scenario_config=config, low_answers=answers)
        view = _build_episode_view(index, episode, filtered_cgm, filtered_bolus, filtered_basal, isf=isf, scenario_config=config, low_answers=answers)
        views = {(row["kind"], row["t"]): row for row in view["anchors"]}
        for anchor in episode.anchors:
            family, key = _opportunity_key(anchor, attr, by_family)
            if family is None or key is None or key not in by_family[family]:
                continue
            item = by_family[family][key]
            row = views.get((anchor.kind.value, anchor.t.strftime(FMT)))
            if row is None:
                continue
            for lever in Lever:
                if exposure(lever) is not family:
                    continue
                occurrence = {"verdicts": row["verdicts"], "cause_lever": attr.lever.value if attr.lever else None}
                states[lever][key] = (attr.trigger_t if attr.lever is Lever.OVER_TREATED_LOW and anchor.rebound_nadir_t else anchor.t,
                                      _occurrence_verdict(occurrence, lever.value))
            if attr.lever is not None and _is_driver(anchor, attr):
                assoc_family, assoc_key = _association_key(anchor, attr, by_family)
                if assoc_family is not exposure(attr.lever) or assoc_key not in by_family.get(assoc_family, {}):
                    # The central ADR 79 safety rule: do not invent an identity.
                    associations[attr.lever].add("__uninspectable__")
                else:
                    associations[attr.lever].add(_opaque("o_", assoc_family.value, *assoc_key))
    result = {}
    for lever in Lever:
        family = exposure(lever)
        rows = []
        for key, item in by_family[family].items():
            outcome_t, verdict = states[lever].get(key, (item.anchor_t, "clean"))
            rows.append(Member(item, outcome_t, verdict))
        result[lever] = tuple(rows)
        if "__uninspectable__" in associations[lever]:
            result.pop(lever, None)
            associations[lever] = set()
    return result, {lever: frozenset(values) for lever, values in associations.items() if lever in result}


def _opportunity_key(anchor, attr, by_family):
    if anchor.kind is AnchorKind.MEAL and anchor.bolus:
        return Exposure.MEALS, (anchor.bolus.seq_num,)
    if anchor.kind is AnchorKind.LOW:
        candidate = next((key for key, item in by_family[Exposure.LOWS].items() if item.anchor_t == anchor.t), None)
        return Exposure.LOWS, candidate
    if anchor.kind is AnchorKind.HIGH:
        candidate = next((key for key, item in by_family[Exposure.HIGHS].items() if item.anchor_t == anchor.t), None)
        return Exposure.HIGHS, candidate
    if anchor.kind is AnchorKind.CORRECTION and anchor.bolus:
        # Pair verdicts are populated by the exact classifier provenance below.
        return Exposure.CORRECTION_CLUSTERS, None
    return None, None


def _association_key(anchor, attr, by_family):
    family = exposure(attr.lever)
    if attr.lever is Lever.OVER_TREATED_LOW and anchor.rebound_nadir_t is not None:
        key = next((key for key, item in by_family[Exposure.LOWS].items() if item.anchor_t == anchor.rebound_nadir_t), None)
        return Exposure.LOWS, key
    if family is Exposure.CORRECTION_CLUSTERS:
        # The classifier now publishes the winning pair in its provenance.  The
        # attribution API does not retain it, so absence is intentionally withheld.
        return family, None
    return _opportunity_key(anchor, attr, by_family)


def wrap(prepared):
    rendered, headers, withheld = [], {}, []
    for row in prepared.findings["rows"]:
        if row.get("register") != "finding":
            rendered.append(deepcopy(row)); continue
        finding_id = row["id"]
        try: probe = prepared.case(finding_id, "clock", None)
        except ValueError: probe = None
        if probe is None:
            withheld.append({"finding_id": finding_id, "code": "uninspectable_attribution", "message": "Canonical association is unavailable."}); continue
        changed, header = deepcopy(row), {"finding_id": finding_id, "lever": probe["finding"]["lever"], "title": probe["finding"]["title"], "family": probe["family"], "summary": probe["summary"], "verdict_counts": probe["verdict_counts"], "inspectability": "ready"}
        changed.update({"appearances": [{"family": probe["family"], "noun": probe["summary"]["noun"], "n": probe["summary"]["claimed"], "m": probe["summary"]["denominator"]}], "episodes": probe["summary"]["claimed"], "evidence": [{"id": item["id"], "verdict": item["verdict"]} for item in probe["occurrences"]], "verdict_counts": probe["verdict_counts"], "verdict_counts_by_family": {probe["family"]: probe["verdict_counts"]}, "case_header": header})
        rendered.append(changed); headers[finding_id] = header
    return {"schema": PREPARATION_SCHEMA, "projection_id": prepared.projection_id, "coordinates": {"source_window_days": 30, "window": prepared.query.to_dict()}, "findings": deepcopy(prepared.findings), "rendered_rows": rendered, "behavioral_case_headers": headers, "withheld_findings": withheld}


def _noun(family): return "correction clusters" if family is Exposure.CORRECTION_CLUSTERS else family.value
def _occurrence(member): return {"id": member.id, "date": member.opportunity.anchor_t.date().isoformat(), "anchor": {"t": member.opportunity.anchor_t.strftime(FMT), "kind": member.opportunity.anchor_kind, "label": {"meal": "Completed carb bolus", "low": "Low excursion", "high": "High peak", "correction": "Second correction"}[member.opportunity.anchor_kind], "bg": member.opportunity.anchor_bg}, "verdict": member.verdict}
def _clock(roster, claimed):
    buckets = [{"start_min": i * 120, "end_min": (i + 1) * 120, "n": 0, "occurrence_ids": []} for i in range(12)]
    for member in roster:
        if member.id in claimed:
            bucket = buckets[(member.outcome_t.hour * 60 + member.outcome_t.minute) // 120]; bucket["n"] += 1; bucket["occurrence_ids"].append(member.id)
    return {"alignment": "clock", "anchor": None, "window_min": None, "cohorts": [], "clock": {"bucket_hours": 2, "total": len(claimed), "peak_bucket_index": max(range(12), key=lambda i: buckets[i]["n"]), "buckets": buckets}}
def _event(lever):
    family = exposure(lever); windows = {Exposure.MEALS: [-60, 300], Exposure.LOWS: [-300, 120], Exposure.CORRECTION_CLUSTERS: None, Exposure.HIGHS: None}
    return {"alignment": "event", "anchor": {"kind": family.value, "label": family.value}, "window_min": windows[family], "cohorts": [], "clock": None}
def _detail(member, cgm, bolus):
    item = member.opportunity; lo, hi = item.anchor_t - timedelta(minutes=300), item.anchor_t + timedelta(minutes=300)
    return _occurrence(member) | {"glucose": [{"t": row.t.strftime(FMT), "bg": row.bg} for row in cgm if lo <= row.t <= hi], "markers": [], "source_corrections": [{"seq_num": row.seq_num, "t": row.t.strftime(FMT), "insulin": row.insulin} for row in item.members] if item.family is Exposure.CORRECTION_CLUSTERS else [], "day_target": None}
