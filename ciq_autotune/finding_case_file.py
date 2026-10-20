"""Snapshot-bound preparation and projection for Diagnose Finding case files."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta
from hashlib import sha256
import time
import uuid

from .analyzers.classifiers import classify_correction_stacking
from .analyzers.meals import group_meals
from .analyzers.scenario.engine import _effective_isf, low_prompt_answers
from .analyzers.scenario.levers import Exposure, Lever, exposure, outcome_kind, title
from .analyzers.scenario.outcome_patterns import credited_claims, outcome_window_population
from .analyzers.scenario.evidence_population import policy_for
from .analyzers.scenario.evaluation import evaluate
from .analyzers.scenario.model_view import _build_episode_view
from .analyzers.scenario import opportunities
from .analyzers.scenario_config import ScenarioConfig
from . import event_comparison, findings_projection, outcomes_trend
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
    occurrence_id: str | None = None
    # Why the row was judged (ADR 432): the anchor's recorded classifier verdicts as
    # the model view serializes them, the lever that drove its episode at this anchor,
    # and the attributed narrative text of the claim that put it in its case file.
    recorded: tuple = ()
    driver: str | None = None
    claim_text: str = ""

    @property
    def id(self):
        if self.occurrence_id is not None:
            return self.occurrence_id
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
    exposures: dict | None = None
    scenarios: dict | None = None
    pattern_exposures: dict | None = None
    # The readings the analyzer judged: the window's CGM without false-low spans.
    judged_cgm: tuple = ()
    # The recorded-data revision of the snapshot it was prepared from (#581).
    revision: int | None = None

    def _roster(self, lever):
        return tuple(
            row for row in self.members[lever]
            if self.query.contains(_minute(row.outcome_t))
        )

    def _authoritative_row(self, finding_id):
        return next((row for row in self.findings["rows"] if row.get("id") == finding_id), None)

    def _arc_outcomes(self, anchors, lever):
        """Each meal anchor's Post-meal arc reading in the direction ``lever`` judges.

        ADR 432: the Arc peak for a high outcome, the Arc nadir for a low one, read by
        the Outcomes trend over the readings the analyzer judged and truncated at the
        next meal's first bolus among the window's boluses, never at a top-up (ADR 470).
        """
        kind = _ARC_READINGS[outcome_kind(lever)]
        truncators = [meal.t for meal in group_meals(_window_bolus(
            self.bolus, self.cgm, self.basal, self.source_window_days))]
        arcs = outcomes_trend.meal_arcs(anchors, self.judged_cgm, ctx_meal_times=truncators)
        return [_arc_outcome(kind, anchor, arc) for anchor, arc in zip(anchors, arcs)]

    def _outcomes(self, roster, lever):
        """The served outcome of every meal and low row; any other row has none.

        A meal reads its Post-meal arc (ADR 432). A low reads its own drawn trace,
        from the anchor to the comparison window's far edge, in the direction
        ``lever`` judges: the rebound's peak for a high outcome, the nadir for a low
        one (ADR 520).
        """
        meals = [member for member in roster if member.opportunity.family is Exposure.MEALS]
        outcomes = dict(zip((member.id for member in meals), self._arc_outcomes(
            [member.opportunity.anchor_t for member in meals], lever,
        ))) if meals else {}
        lows = [member for member in roster if member.opportunity.family is Exposure.LOWS]
        if lows:
            kind = _ARC_READINGS[outcome_kind(lever)]
            after = timedelta(minutes=policy_for(lever).comparison_window[1])
            for member in lows:
                anchor = member.opportunity.anchor_t
                outcomes[member.id] = _glucose_outcome(
                    kind, anchor, [row for row in self.cgm
                                   if anchor <= row.t <= anchor + after and row.bg is not None])
        return outcomes

    def _pattern(self, finding_id):
        """The Pattern a case file is asked for: its chart-bearing row's, or one
        served as its one habit, which has no row of its own and is read from the
        findings answer's roster (ADR 520). The same chartability predicate decides
        both."""
        row = self._authoritative_row(finding_id)
        if row is not None:
            return row["pattern"] if row.get("kind") == "pattern" and row.get("pattern_chart") else None
        pattern = next((item for item in self.findings["outcome_patterns"]
                        if item["subject"] == finding_id
                        and item["collapse"] == "collapse_to_member"), None)
        if pattern is None or not findings_projection.pattern_chartable(
                pattern, self.pattern_exposures or self.exposures or {}):
            return None
        return pattern

    def case(self, finding_id, alignment, occ, *, lever=None):
        """Project a Finding claim or a claim-free lever/window case file.

        Lever requests retain the same roster and event inputs, but do not borrow
        a Finding's attribution equation merely to make a case-shaped response.
        """
        if finding_id and finding_id.startswith("pattern:"):
            return self._pattern_case(finding_id, alignment, occ)
        finding_keyed = finding_id is not None
        if finding_keyed:
            lever = Lever(finding_id.removeprefix("finding:"))
        elif not isinstance(lever, Lever):
            return None
        if ((finding_keyed and finding_id != f"finding:{lever.value}")
                or lever in self.withheld):
            return None
        row = self._authoritative_row(finding_id) if finding_keyed else None
        if finding_keyed and row is None:
            return None
        roster = self._roster(lever)
        policy = policy_for(lever)
        claimed_ids = (self.associations[lever].intersection(member.id for member in roster)
                       if finding_keyed else frozenset())
        if (finding_keyed and not claimed_ids
                and (lever is not Lever.MISSED_MEAL or row.get("episodes") != 0)):
            return None
        counts = {
            key: sum(member.verdict == key for member in roster)
            for key in findings_projection.FINDING_VERDICTS
        }
        if (len(roster) != sum(counts.values()) or len(claimed_ids) > counts["fired"]
                or (finding_keyed and row.get("episodes") != len(claimed_ids))):
            raise InconsistentProjection("inconsistent_projection")
        pattern = self.recurrence.get(lever)
        if (finding_keyed and not self.query.scoped and pattern is not None
                and pattern != (len(claimed_ids), len(roster))):
            raise InconsistentProjection("inconsistent_projection")
        projection = (
            _clock(roster, claimed_ids)
            if alignment == "clock"
            else _event(lever, roster, claimed_ids, self.cgm, self.bolus,
                        self.source_window_days, self.basal)
        )
        outcomes = self._outcomes(roster, lever)
        facts = {member.id: (*_anchor_dose(member.opportunity), outcomes.get(member.id))
                 for member in roster}
        selection, cohort_of = _select_roster_occurrence(
            occ, alignment, projection, roster, lever, facts,
            lambda member: _habit_reason(member, lever, member.id in claimed_ids),
            self.cgm, self.basal, self.bolus, self.carbs,
        )
        if (selection["state"] == "unavailable" and alignment == "event"
                and occ in cohort_of):
            announced = next((row for row in _completed_carb_boluses(
                self.bolus, self.cgm, self.basal, self.source_window_days,
            ) if _opaque("m_", row.seq_num) == occ), None)
            if announced is not None:
                [outcome] = self._arc_outcomes([announced.t], lever)
                selection = {"state": "selected", "requested_id": occ,
                             "detail": _announced_detail(announced, outcome, self.cgm,
                                                         self.bolus)}
                selection["detail"]["comparison_cohort"] = cohort_of[occ]
        occurrences = (
            [_missed_occurrence(member, member.id in claimed_ids, self.cgm, facts[member.id])
             for member in roster]
            if lever is Lever.MISSED_MEAL
            else [_occurrence(member, facts[member.id]) for member in roster]
        )
        return {
            "schema": CASE_SCHEMA, "projection_id": self.projection_id,
            "finding": {"id": finding_id, "lever": lever.value, "title": title(lever)},
            "window": self.query.to_dict(), "family": policy.recurrence_noun,
            "population": policy.recurrence_noun,
            "cross_population": policy.cross_population,
            "summary": {"claimed": len(claimed_ids), "denominator": len(roster),
                        "noun": _population_noun(policy)},
            "verdict_counts": counts, "occurrences": occurrences,
            "projection": projection, "selection": selection,
            **({"traces": self._habit_traces(lever, roster, claimed_ids)}
               if finding_keyed and lever in _HABIT_TRACE_CHART else {}),
        }

    def _habit_traces(self, lever, roster, claimed_ids):
        """A standalone habit's card chart (ADR 528), in the Pattern card's shape (ADR
        523): the episodes the habit claims and Typical, its event comparison's own
        Matched and comparison cohorts, each aligned where that comparison aligns it,
        over the habit's comparison window."""
        window = policy_for(lever).comparison_window
        cohorts = _event_cohorts(lever, roster, claimed_ids, self.cgm, self.bolus,
                                 self.source_window_days, self.basal)
        return {"anchor": _HABIT_TRACE_CHART[lever], "window_min": list(window),
                "pattern": _trace_cohort([t for _id, t in cohorts.matched], self.cgm, window,
                                         episodes=True),
                "typical": _trace_cohort([t for _id, t in cohorts.comparison], self.cgm, window,
                                         episodes=False)}

    def _pattern_case(self, finding_id, alignment, occ):
        """Expose one Pattern's already-built Exposure population.

        Pattern policy remains in ``outcome_patterns``.  This only aligns the
        existing opportunity roster and member associations for the case-file
        transport consumed by the evidence chart.
        """
        pattern = self._pattern(finding_id)
        if pattern is None:
            return None
        family = findings_projection.pattern_rate_family(pattern)
        source = ((self.pattern_exposures or self.exposures or {}).get("exposures") or {}).get(family.value) or {}
        source_rows = tuple(source.get("occurrences") or ())
        rate_levers = [
            subject.removeprefix("habit:") for subject in pattern["rate_levers"]
        ]
        # The habit members this Pattern judges in its own rate family.
        habits = [
            lever for lever in (Lever(member["subject"].removeprefix("habit:"))
                                for member in pattern["members"] if member["kind"] == "habit")
            if policy_for(lever).recurrence_family is family
        ]
        population_lever = next(
            Lever(subject.removeprefix("habit:"))
            for subject in pattern["rate_levers"]
            if exposure(Lever(subject.removeprefix("habit:"))) is family
        )
        claims_by_identity = credited_claims(
            self.pattern_exposures or self.exposures or {}, family.value, rate_levers,
        )
        claimed_identities = set(claims_by_identity)
        claimant_of = {}
        doses = {}
        corrections = {}
        precedence = {"fired": 4, "near_miss": 3, "outranked": 2, "no_data": 1, "clean": 0}
        pattern_roster = []
        remaining_claims = set(claimed_identities)
        for index, candidate in enumerate(source_rows):
            identity = candidate.get("t")
            t = datetime.strptime(candidate["t"], FMT)
            occurrence_id = _opaque("o_", family.value, identity, candidate["t"], index)
            doses[occurrence_id] = (candidate.get("insulin"), candidate.get("carbs"))
            corrections[occurrence_id] = candidate.get("corrections") or {}
            claimant = claims_by_identity.get(identity)
            if claimant is not None and identity in remaining_claims:
                claimant_of[occurrence_id] = claimant
                remaining_claims.remove(identity)
            else:
                claimant = None
            recorded = tuple(candidate.get("verdicts") or ())
            driver = candidate.get("cause_lever")
            verdict = ("fired" if claimant is not None else max(
                _pattern_verdicts(recorded, driver, None, habits).values(),
                default="clean", key=precedence.get,
            ))
            opportunity = opportunities.Opportunity(
                family=family, source_key=(identity, index), anchor_t=t,
                anchor_kind=candidate.get("kind") or _event_anchor(family)[0],
                anchor_bg=candidate.get("bg"),
            )
            pattern_roster.append(Member(
                opportunity, t, verdict, occurrence_id, recorded=recorded, driver=driver,
                claim_text=((candidate.get("text") or "")
                            if claimant is not None and driver == claimant else ""),
            ))
        pattern_roster = tuple(pattern_roster)
        claimed_ids = frozenset(claimant_of)
        counts = {key: sum(member.verdict == key for member in pattern_roster)
                  for key in findings_projection.FINDING_VERDICTS}
        projection = (_clock(pattern_roster, claimed_ids) if alignment == "clock"
                      else _event(population_lever, pattern_roster, claimed_ids, self.cgm,
                                  self.bolus, self.source_window_days, self.basal))
        outcomes = self._outcomes(pattern_roster, population_lever)
        facts = {member.id: (*doses[member.id], outcomes.get(member.id))
                 for member in pattern_roster}
        selection, _ = _select_roster_occurrence(
            occ, alignment, projection, pattern_roster, population_lever, facts,
            lambda member: _pattern_reason(member, claimant_of.get(member.id), habits),
            self.cgm, self.basal, self.bolus, self.carbs,
        )
        occurrences = [(_occurrence(member, facts[member.id])
                        | {"member": (f"habit:{claimant_of[member.id]}"
                                      if member.id in claimant_of else "clean")})
                       for member in pattern_roster]
        return {
            "schema": CASE_SCHEMA, "projection_id": self.projection_id,
            "finding": {"id": finding_id, "lever": pattern["key"],
                        "subject": finding_id, "title": pattern["title"]},
            "window": self.query.to_dict(), "family": policy_for(population_lever).recurrence_noun,
            "population": policy_for(population_lever).recurrence_noun,
            "cross_population": False,
            "summary": {"claimed": len(claimed_ids), "denominator": len(pattern_roster),
                        "noun": _population_noun(policy_for(population_lever))},
            "verdict_counts": counts, "occurrences": occurrences,
            "projection": projection,
            "selection": selection,
            "traces": self._pattern_traces(
                pattern["key"], pattern_roster, claimed_ids,
                {member_id: corrections[member_id].get(lever)
                 for member_id, lever in claimant_of.items()},
                projection if alignment == "event" else _event(
                    population_lever, pattern_roster, claimed_ids, self.cgm, self.bolus,
                    self.source_window_days, self.basal),
            ),
        }

    def _pattern_traces(self, key, roster, claimed_ids, correction_of, event):
        """The Pattern card's trace chart (ADR 523): the Pattern's episodes and Typical,
        the comparison episodes, each aligned at its start event over the Pattern's
        window.

        A meal Pattern starts at the meal's bolus, against its event comparison's
        meals. Lows after correcting highs starts at the correction each low it counts
        followed, against every other lone correction in the window. Highs after
        treating lows starts at the low's nadir, against every other low.
        """
        anchor, window = _TRACE_CHART[key]
        claimed = [member for member in roster if member.id in claimed_ids]
        if anchor == "bolus":
            comparison = set(next(cohort for cohort in event["cohorts"]
                                  if cohort["key"] == "comparison")["occurrence_ids"])
            own = [member.opportunity.anchor_t for member in claimed]
            typical = [member.opportunity.anchor_t for member in roster
                       if member.id in comparison]
        elif anchor == "nadir":
            own = [member.opportunity.anchor_t for member in claimed]
            typical = [member.opportunity.anchor_t for member in roster
                       if member.id not in claimed_ids]
        else:
            own = sorted({datetime.strptime(correction_of[member.id], FMT) for member in claimed
                          if correction_of.get(member.id) is not None})
            lone = opportunities.lone_corrections(
                _window_bolus(self.bolus, self.cgm, self.basal, self.source_window_days),
                scenario_config=ScenarioConfig())
            typical = [row.t for row in lone if row.t not in set(own)
                       and self.query.contains(_minute(row.t))]
        return {"anchor": anchor, "window_min": list(window),
                "pattern": _trace_cohort(own, self.cgm, window, episodes=True),
                "typical": _trace_cohort(typical, self.cgm, window, episodes=False)}


# The Pattern card's trace chart, per Pattern (ADR 523): what each episode is
# aligned at, and the minutes drawn either side of it.
_TRACE_CHART = {
    "highs_after_meals": ("bolus", (-30, 240)),
    "lows_after_meals": ("bolus", (-30, 240)),
    "highs_after_treating_lows": ("nadir", (0, 180)),
    "lows_after_correcting_highs": ("correction", (0, 240)),
}
# A standalone habit's card chart (ADR 528): what its episodes are aligned at. Only
# a habit no Pattern owns is queued as its own card, so each such habit has one, and
# only those. A missed meal is aligned at the meal's start: each rise at its detected
# onset, each meal bolused for at its bolus.
_HABIT_TRACE_CHART = {
    Lever.MISSED_MEAL: "meal_start",
}
# Up to this many Pattern episodes are served one by one; more are served as their
# median and band alone.
_TRACE_EPISODES = 8
# A 5-minute bin is served, with its median and 25-75 band, only from this many
# readings.
_TRACE_BIN_READINGS = 3
# An episode is drawn only with a reading this soon after its window opens: one
# that starts in a CGM gap is left off, never drawn from part-way.
_TRACE_LEAD_MIN = 10


def _trace_cohort(anchors, cgm, window, *, episodes):
    """One cohort of the trace chart: its drawn anchors, their 5-minute median and
    25-75 band in each bin that has enough readings (a bin without is not served),
    and, for the Pattern, each episode's readings when there are few."""
    start = window[0]
    drawn = []
    for anchor in anchors:
        trace = _comparison_trace(anchor.strftime(FMT), anchor, cgm, window)
        if any(start <= point["minute"] <= start + _TRACE_LEAD_MIN
               for point in trace["trace"]["cgm"]):
            drawn.append(trace)
    bands = event_comparison.project_cohort("traces", drawn, window)["points"]
    cohort = {
        "anchors": [trace["id"] for trace in drawn],
        "points": [{field: point[field] for field in ("minute", "n", "median", "p25", "p75")}
                   for point in bands if point["n"] >= _TRACE_BIN_READINGS],
    }
    if episodes:
        cohort["episodes"] = ([[{"minute": point["minute"], "bg": point["bg"]}
                                for point in trace["trace"]["cgm"]] for trace in drawn]
                              if len(drawn) <= _TRACE_EPISODES else None)
    return cohort


def prepare(store, *, query, version, analysis, exposures, scenarios,
            analysis_generation="standalone:0"):
    """Materialize queue, opportunities, attribution, and traces in one read snapshot."""
    store.conn.execute("BEGIN")
    try:
        revision = store.recorded_data_revision()
        basal = tuple(store.basal_events())
        cgm = tuple(store.cgm_readings())
        bolus = tuple(store.bolus_events())
        carbs = tuple(store.carb_entries())
        prompt_responses = tuple(store.prompt_responses())
        window_days = findings_projection.DIAGNOSE_SOURCE_WINDOW_DAYS
        projection = findings_projection.prepare_findings_projection(
            analysis=analysis, exposures=exposures, scenarios=scenarios,
        )
        findings = projection.project(query, analysis_generation=analysis_generation)
        pattern_exposures, _patterns = outcome_window_population(
            analysis, exposures, scenarios, query,
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
                         source_window_days=window_days, exposures=deepcopy(exposures),
                         scenarios=deepcopy(scenarios),
                         pattern_exposures=deepcopy(pattern_exposures),
                         judged_cgm=tuple(drop_readings(cgm, spans_from_records(
                             false_low_span_records(cgm, prompt_responses)))),
                         revision=revision)


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
    answers = low_prompt_answers(store, start, end)
    isf = _effective_isf(bolus, basal, cgm, store.settings_snapshots(), start, end)
    evaluated = evaluate(
        filtered_bolus, filtered_cgm, filtered_basal, isf=isf,
        scenario_config=config, low_answers=answers,
        window_start=start, window_end=end, bound_classifier_context=False,
    )
    opportunity_families = evaluated.families
    by_family = {family: {item.source_key: item for item in rows}
                 for family, rows in opportunity_families.items()}
    states = {lever: {} for lever in Lever}
    outcomes = {lever: {} for lever in Lever}
    associations = {lever: set() for lever in Lever}
    provenance = {lever: [] for lever in Lever}
    withheld = set()
    # The Member reason carrier (ADR 432), keyed like ``by_family``; claim texts are
    # keyed by the served identity the association was recorded under.
    recorded = {family: {} for family in Exposure}
    drivers = {family: {} for family in Exposure}
    claim_texts = {lever: {} for lever in Lever}
    # The one opportunity each attributed episode's claim is associated with, as the
    # engine counts it and the exposure feed serves it (#550).
    claims = {row.episode_id: row for row in evaluated.attributed}
    for index, evaluated_episode in enumerate(evaluated.episodes):
        episode = evaluated_episode.anchors
        attr = evaluated_episode.attribution
        view = _build_episode_view(index, episode, filtered_cgm, filtered_bolus,
                                   filtered_basal, isf=isf, scenario_config=config,
                                   low_answers=answers, evaluated=evaluated_episode)
        ordered = sorted(episode.anchors, key=lambda anchor: anchor.t)
        for source, row in zip(ordered, view["anchors"]):
            family, key = opportunities.canonical_anchor_key(source)
            if family is None or key not in by_family[family]:
                continue
            cause = attr.lever.value if source is attr.driver_anchor and attr.lever else None
            occurrence = {"verdicts": row["verdicts"], "cause_lever": cause}
            recorded[family][key] = tuple(row["verdicts"])
            drivers[family][key] = cause
            for lever in Lever:
                if exposure(lever) is family:
                    states[lever][key] = findings_projection._occurrence_verdict(
                        occurrence, lever.value,
                    )
        if attr.lever is None:
            continue
        # An attribution that names a lever always leads with its driver's step.
        claim_text = view["steps"][0]["text"]
        claim = claims[evaluated_episode.id]
        if claim.anchor_t is None:
            withheld.add(attr.lever)
            continue
        family, key = claim.driver_family, claim.driver_source_key
        item = by_family[family][key]
        landing_kind = outcome_kind(attr.lever)
        landings = [anchor.t for anchor in episode.anchors if anchor.kind.value == landing_kind]
        outcome_t = max(landings) if landings else item.anchor_t
        opportunity_id = _opaque("o_", family.value, *item.source_key)
        associations[attr.lever].add(opportunity_id)
        claim_texts[attr.lever].setdefault(opportunity_id, claim_text)
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
        own = {"classifier": Lever.CORRECTION_STACKING.value, "matched": verdict.matched,
               "detail": verdict.detail, "evidence_tier": verdict.evidence_tier.value,
               "silence_reason": getattr(verdict.silence_reason, "value", verdict.silence_reason)}
        recorded[Exposure.CORRECTION_CLUSTERS][item.source_key] = (own,)
        occurrence = {"verdicts": [own], "cause_lever": None}
        if item.source_key not in outcomes[Lever.CORRECTION_STACKING]:
            states[Lever.CORRECTION_STACKING][item.source_key] = (
                findings_projection._occurrence_verdict(
                    occurrence, Lever.CORRECTION_STACKING.value,
                )
            )

    members = {}
    for lever in Lever:
        family = policy_for(lever).recurrence_family
        members[lever] = tuple(Member(item, outcomes[lever].get(key, item.anchor_t),
                                     states[lever].get(key, "clean"),
                                     recorded=recorded[family].get(key, ()),
                                     driver=drivers[family].get(key),
                                     claim_text=claim_texts[lever].get(
                                         _opaque("o_", family.value, *key), ""))
                               for key, item in by_family[family].items())
    return (members, {lever: frozenset(ids) for lever, ids in associations.items()},
            {lever: tuple(rows) for lever, rows in provenance.items()}, frozenset(withheld))


def wrap(prepared):
    """The preparation the app reads: its identity, coordinates and case headers.

    It serves no copy of the findings rows (ADR 547): the Queue reads them from
    the findings answer, and the app reads only ``projection_id`` from here.
    """
    headers, withheld = {}, []
    for row in prepared.findings["rows"]:
        if row.get("register") != "finding":
            continue
        finding_id = row["id"]
        try:
            case = prepared.case(finding_id, "clock", None)
        except InconsistentProjection:
            # ADR 488: one case whose retained producers disagree is withheld by
            # name, never served at either count; the store's other cases stand.
            withheld.append({"finding_id": finding_id,
                             "code": "inconsistent_projection",
                             "message": "Case population is inconsistent."})
            continue
        if case is None:
            if row.get("kind") != "pattern":
                withheld.append({"finding_id": finding_id,
                                 "code": "uninspectable_attribution",
                                 "message": "Canonical association is unavailable."})
            continue
        chart_key = "pattern_chart" if row.get("kind") == "pattern" else "event_chart"
        headers[finding_id] = {
            "finding_id": finding_id, "lever": case["finding"]["lever"],
            "title": case["finding"]["title"], "family": case["family"],
            # A prepared case IS its own event-chart coordinate: the case
            # file projects an event comparison for every lever it holds.
            # Gating this on the queue projection's family map published
            # `null` for a case the server serves — correction stacking is
            # counted in correction clusters, not the lows that map names —
            # leaving the reader no By-event path into it.
            chart_key: (deepcopy(row["pattern_chart"])
                        if chart_key == "pattern_chart" else
                        {"lever": case["finding"]["lever"],
                         "window": prepared.query.to_dict()}),
            "summary": case["summary"], "verdict_counts": case["verdict_counts"],
            "inspectability": "ready"}
    return {"schema": PREPARATION_SCHEMA, "projection_id": prepared.projection_id,
            "coordinates": {
                "source_window_days": prepared.source_window_days,
                "window": prepared.query.to_dict(),
            },
            "behavioral_case_headers": headers, "withheld_findings": withheld}


def queue_answers(prepared):
    """What the Queue reads from ``prepared``, as plain data a restart keeps (#581):
    its preparation and each finding's and Pattern's event-aligned case file, the
    coordinate the app reads, or ``None`` where it has no inspectable member. A finding whose
    retained producers disagree is named in ``inconsistent`` (ADR 488)."""
    cases, inconsistent = {}, []
    # Every finding's row, and every Pattern, a collapsed one too: the Queue reads
    # a Pattern's case file under its own subject (ADR 528).
    subjects = [row["id"] for row in prepared.findings["rows"] if row.get("register") == "finding"]
    subjects += [f"pattern:{pattern['key']}" for pattern in prepared.findings["outcome_patterns"]]
    for subject in dict.fromkeys(subjects):
        try:
            cases[subject] = prepared.case(subject, "event", None)
        except InconsistentProjection:
            inconsistent.append(subject)
    return {"preparation": wrap(prepared), "cases": cases, "inconsistent": inconsistent}


def _noun(family):
    return "correction clusters" if family is Exposure.CORRECTION_CLUSTERS else family.value


def _population_noun(policy):
    return _noun(policy.recurrence_family)


_CASE_ANCHORS = {
    Exposure.CORRECTION_CLUSTERS: ("second_correction", "Second correction"),
    Exposure.HIGHS: ("high_peak", "High peak"),
}


def _event_anchor(family):
    legacy = event_comparison.VIEW_CONFIG.get(family.value)
    if legacy is not None:
        return legacy["anchor_kind"], legacy["anchor_label"]
    return _CASE_ANCHORS[family]


_ARC_READINGS = {"high": "peak", "low": "nadir"}


def _arc_outcome(kind, anchor, arc):
    """A served outcome reading off one meal's ``outcomes_trend.MealArc``, or none."""
    value, t = (arc.peak, arc.peak_t) if kind == "peak" else (arc.nadir, arc.nadir_t)
    if value is None:
        return None
    return {"kind": kind, "bg": value, "t": t.strftime(FMT),
            "minute": round((t - anchor).total_seconds() / 60, 1)}


def _glucose_outcome(kind, anchor, readings):
    """The served outcome off a glucose anchor's own readings: the first highest
    (``peak``) or lowest (``nadir``) of them, in the meal outcome's shape, or none."""
    if not readings:
        return None
    pick = max if kind == "peak" else min
    row = pick(readings, key=lambda reading: reading.bg)
    return {"kind": kind, "bg": row.bg, "t": row.t.strftime(FMT),
            "minute": round((row.t - anchor).total_seconds() / 60, 1)}


def _anchor_dose(opportunity):
    """A roster opportunity's anchor bolus dose and carbs (ADR 432): a meal's summed
    dose and carbs over its members (ADR 470), a correction cluster's second
    correction without carbs, and neither for a glucose anchor."""
    if opportunity.family is Exposure.MEALS:
        return opportunity.meal.insulin, opportunity.meal.carbs
    if opportunity.family is Exposure.CORRECTION_CLUSTERS:
        return opportunity.members[1].insulin, None
    return None, None


def _occurrence(member, facts):
    """One roster row; ``facts`` is its anchor dose, carbs and served outcome."""
    _, label = _event_anchor(member.opportunity.family)
    insulin, carbs, outcome = facts
    return {"id": member.id, "date": member.opportunity.anchor_t.date().isoformat(),
            "anchor": {"t": member.opportunity.anchor_t.strftime(FMT),
                       "kind": member.opportunity.anchor_kind, "label": label,
                       "bg": member.opportunity.anchor_bg,
                       "insulin": insulin, "carbs": carbs},
            "verdict": member.verdict, "outcome": outcome}


def _rise_onset_anchor(member, cgm):
    onset = member.opportunity.reach_start or member.opportunity.anchor_t
    reading = next((row for row in cgm if row.t == onset and row.bg is not None), None)
    if reading is None:
        raise InconsistentProjection("missing rise-onset EGV")
    return {"t": onset.strftime(FMT), "kind": "detected_rise_onset",
            "label": "Detected rise onset", "bg": reading.bg,
            "insulin": None, "carbs": None}


def _missed_occurrence(member, attributed, cgm, facts):
    return _occurrence(member, facts) | {
        "attributed": attributed,
        "comparison_anchor": _rise_onset_anchor(member, cgm) if attributed else None,
    }


def _cause(lever, text):
    return {"lever": lever, "title": title(Lever(lever)), "text": text}


def _habit_entry(member, lever, verdict, *, mapped=False):
    """One judged habit on a selected row, at exactly the verdict its roster assigned.

    It carries the classifier's recorded sentence at this anchor only where that
    recorded verdict, read with the anchor's episode driver, gives ``verdict`` — or
    gives fired, for an entry an unclaimed Pattern row ``mapped`` to outranked — so a
    row fired by association never shows a sentence that says otherwise.
    """
    own = next((item for item in member.recorded if item.get("classifier") == lever), None)
    reads = findings_projection._occurrence_verdict(
        {"verdicts": member.recorded, "cause_lever": member.driver}, lever,
    )
    agrees = reads == verdict or (mapped and (reads, verdict) == ("fired", "outranked"))
    return {"lever": lever, "title": title(Lever(lever)), "verdict": verdict,
            "detail": own.get("detail") if own is not None and agrees else None}


def _served_once(cause, habits):
    """A reason that serves each sentence once (ADR 454): on a claimed row, the
    claimant's entry carries no sentence when its recorded sentence is the cause's
    text, so that sentence is served as the cause's text alone."""
    if cause is not None:
        habits = [entry | {"detail": None}
                  if entry["lever"] == cause["lever"] and entry["detail"] == cause["text"]
                  else entry for entry in habits]
    return {"cause": cause, "habits": habits}


def _habit_reason(member, lever, claimed):
    """A single-habit row's reason: the case lever as its cause exactly when this case
    file claims the row, and its one judged habit at the row's own verdict."""
    return _served_once(_cause(lever.value, member.claim_text) if claimed else None,
                        [_habit_entry(member, lever.value, member.verdict)])


def _pattern_verdicts(recorded, driver, claimant, habits):
    """Each habit member's verdict on one Pattern row, as that roster assigns it.

    A claimed row's claimant is fired and every other habit keeps its row-relative
    state; an unclaimed row maps each fired state to outranked, because no rate lever
    claimed it. The row's own verdict and its selected reason both read this.
    """
    occurrence = {"verdicts": recorded, "cause_lever": driver}
    states = {lever.value: findings_projection._occurrence_verdict(occurrence, lever.value)
              for lever in habits}
    if claimant is not None:
        return {lever: "fired" if lever == claimant else state
                for lever, state in states.items()}
    return {lever: "outranked" if state == "fired" else state
            for lever, state in states.items()}


def _pattern_reason(member, claimant, habits):
    verdicts = _pattern_verdicts(member.recorded, member.driver, claimant, habits)
    return _served_once(_cause(claimant, member.claim_text) if claimant is not None else None,
                        [_habit_entry(member, lever, verdict, mapped=claimant is None)
                         for lever, verdict in verdicts.items()])


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
    before, after = policy_for(lever).comparison_window
    return (member.opportunity.anchor_t + timedelta(minutes=before),
            member.opportunity.anchor_t + timedelta(minutes=after))


def _trace(member, lever, cgm):
    lo, hi = _trace_bounds(member, lever)
    anchor = member.opportunity.anchor_t
    return {"id": member.id, "trace": {"cgm": [
        {"t": row.t.strftime(FMT),
         "minute": round((row.t - anchor).total_seconds() / 60, 1), "bg": row.bg}
        for row in cgm if lo <= row.t <= hi and row.bg is not None]}}


def _comparison_trace(occurrence_id, anchor, cgm, window):
    before, after = window
    lo = anchor + timedelta(minutes=before)
    hi = anchor + timedelta(minutes=after)
    return {"id": occurrence_id, "trace": {"cgm": [
        {"t": row.t.strftime(FMT),
         "minute": round((row.t - anchor).total_seconds() / 60, 1), "bg": row.bg}
        for row in cgm if lo <= row.t <= hi and row.bg is not None
    ]}}


def _window_bolus(bolus, cgm, basal, source_window_days):
    """The boluses inside the source window the retained population was built over."""
    times = [row.t for row in basal] + [row.t for row in cgm]
    if not times:
        return ()
    end = max(times)
    start = end - timedelta(days=source_window_days)
    return tuple(row for row in bolus if start <= row.t <= end)


def _completed_carb_boluses(bolus, cgm, basal, source_window_days):
    return event_comparison.completed_carb_boluses(
        _window_bolus(bolus, cgm, basal, source_window_days))


def _comparison_anchor(member, lever):
    """Return the sole chart anchor for a member of this lever's matched line."""
    if policy_for(lever).cross_population:
        return member.opportunity.reach_start or member.opportunity.anchor_t
    return member.opportunity.anchor_t


def _comparison_window(lever, roster):
    return policy_for(lever).comparison_window


# The verdict band's printed order: its three segments, then its residue.
_BAND_ORDER = ("fired", "near_miss", "clean", "outranked", "no_data")


@dataclass(frozen=True)
class _EventCohorts:
    """The event comparison's three cohorts, each member as ``(id, aligned at)``."""
    matched: tuple
    near: tuple
    comparison: tuple
    # The roster verdicts a same-population comparison holds; none cross-population.
    held: frozenset


def _event_cohorts(lever, roster, claimed_ids, cgm, bolus, source_window_days, basal=()):
    """Who is in each of ADR 180's three event cohorts, and the time each is aligned at.

    The event comparison and a habit's trace chart (ADR 528) both read it, so the
    chart's episodes and Typical are the comparison's own Matched and comparison
    cohorts.
    """
    policy = policy_for(lever)
    matched = ([member for member in roster if member.id in claimed_ids]
               if policy.cross_population else
               [member for member in roster if member.verdict == "fired"])
    near = [member for member in roster if member.verdict == "near_miss"]
    matched_ids = {member.id for member in matched}
    near = [member for member in near if member.id not in matched_ids]
    comparison_population = policy.comparison_population(roster, bolus)
    if policy.cross_population:
        times = [row.t for row in basal] + [row.t for row in cgm]
        end = max(times) if times else None
        start = end - timedelta(days=source_window_days) if end is not None else None
        comparison = tuple(
            (_opaque("m_", row.seq_num), row.t) for row in comparison_population
            if start is not None and start <= row.t <= end
        )
        held = frozenset()
    else:
        near_ids = {item.id for item in near}
        members = [member for member in comparison_population
                   if member.id not in matched_ids and member.id not in near_ids]
        comparison = tuple((member.id, member.opportunity.anchor_t) for member in members)
        held = frozenset(member.verdict for member in members)
    return _EventCohorts(
        matched=tuple((member.id, _comparison_anchor(member, lever)) for member in matched),
        near=tuple((member.id, _comparison_anchor(member, lever)) for member in near),
        comparison=comparison, held=held,
    )


def _event(lever, roster, claimed_ids, cgm, bolus, source_window_days, basal=()):
    """Build ADR 180's one server-owned three-cohort event comparison.

    Verdict accounting remains on the case file; this builder deliberately uses
    only the requested lever's matched and nearly-matched statuses.  Other
    lever claims therefore remain ordinary comparison members.
    """
    window = _comparison_window(lever, roster)
    policy = policy_for(lever)
    cohorts = _event_cohorts(lever, roster, claimed_ids, cgm, bolus, source_window_days, basal)
    comparison_traces = [_comparison_trace(occurrence_id, t, cgm, window)
                         for occurrence_id, t in cohorts.comparison]
    matched_traces = [_comparison_trace(occurrence_id, t, cgm, window)
                      for occurrence_id, t in cohorts.matched]
    near_traces = [_comparison_trace(occurrence_id, t, cgm, window)
                   for occurrence_id, t in cohorts.near]
    matched_cohort = event_comparison.project_cohort("matched", matched_traces, window)
    near_cohort = event_comparison.project_cohort("nearly_matched", near_traces, window)
    comparison_cohort = event_comparison.project_cohort("comparison", comparison_traces, window)
    matched_cohort["name"] = "Matched"
    near_cohort["name"] = "Nearly matched"
    comparison_cohort["name"] = policy.comparison_name
    # ADR 424: a cohort names the verdict-band state it holds exactly, or none.
    # A cross-population Matched cohort is only the attributed Meets criteria
    # Occurrences, so it names none.
    matched_cohort["band_verdict"] = None if policy.cross_population else "fired"
    near_cohort["band_verdict"] = "near_miss"
    comparison_cohort["band_verdict"] = None
    # ADR 468: beside it, every cohort serves the band states it holds, in the
    # band's order. A same-population comparison is the roster less its Meets
    # criteria and Borderline Occurrences, so it holds exactly its members'
    # verdicts; a cross-population comparison holds no roster Occurrence.
    for cohort in (matched_cohort, near_cohort, comparison_cohort):
        cohort["band_states"] = ([cohort["band_verdict"]] if cohort["band_verdict"] else
                                 [state for state in _BAND_ORDER
                                  if cohort is comparison_cohort and state in cohorts.held])
    if policy.cross_population:
        matched_cohort["anchor"] = {"kind": "detected_rise_onset", "label": "Detected rise onset"}
        near_cohort["anchor"] = {"kind": "detected_rise_onset", "label": "Detected rise onset"}
        comparison_cohort["anchor"] = {"kind": "completed_carb_bolus", "label": "Completed carb bolus"}
        anchor = {"kind": "cohort_specific_meal_start", "label": "Meal start"}
    else:
        kind, label = _event_anchor(policy.recurrence_family)
        for cohort in (matched_cohort, near_cohort, comparison_cohort):
            cohort["anchor"] = {"kind": kind, "label": label}
        anchor = {"kind": kind, "label": label}
    # ADR 424: the roster Occurrences in none of the three cohorts. Zero when the
    # comparison is drawn from the case file's own population, which the cohorts
    # then partition; only a cross-population comparison leaves any outside it.
    cohort_ids = {occurrence_id
                  for cohort in (matched_cohort, near_cohort, comparison_cohort)
                  for occurrence_id in cohort["occurrence_ids"]}
    outside_comparison = sum(member.id not in cohort_ids for member in roster)
    return {"alignment": "event", "anchor": anchor, "window_min": list(window),
            "cohorts": [matched_cohort, near_cohort, comparison_cohort],
            "counts": {"matched": len(cohorts.matched), "nearly_matched": len(cohorts.near),
                       "comparison": len(comparison_traces),
                       "outside_comparison": outside_comparison},
            "comparison": {"name": policy.comparison_name,
                           "state": ("unavailable" if comparison_cohort["support"] == "withheld"
                                     else "available")},
            "clock": None}


def _detail_markers(anchor, lo, hi, basal, bolus, carbs):
    markers = [{"kind": "bolus", "t": row.t.strftime(FMT),
                "minute": round((row.t - anchor).total_seconds() / 60, 1),
                "seq_num": row.seq_num, "insulin": row.insulin, "carbs": row.carbs}
               for row in bolus if lo <= row.t <= hi]
    markers.extend({"kind": "rescue_carb", "t": row.t.strftime(FMT),
                    "minute": round((row.t - anchor).total_seconds() / 60, 1),
                    "grams": row.grams, "certainty": row.certainty}
                   for row in carbs if lo <= row.t <= hi)
    markers.extend({
        "kind": "suspend", "t": row.t.strftime(FMT),
        "minute": round((row.t - anchor).total_seconds() / 60, 1),
        "delivery_type": row.delivery_type, "basal_rate": row.basal_rate,
        "profile_basal_rate": row.profile_basal_rate,
    } for row in basal if lo <= row.t <= hi and row.basal_rate == 0)
    return markers


def _missed_detail(member, facts, reason, cgm, basal, bolus, carbs):
    # The rise onset carries no bolus; only the row's outcome carries over.
    _, _, outcome = facts
    anchor = member.opportunity.reach_start or member.opportunity.anchor_t
    before, after = policy_for(Lever.MISSED_MEAL).comparison_window
    lo = anchor + timedelta(minutes=before)
    hi = anchor + timedelta(minutes=after)
    trace = _comparison_trace(
        member.id, anchor, cgm, policy_for(Lever.MISSED_MEAL).comparison_window,
    )["trace"]["cgm"]
    return {"id": member.id, "date": anchor.date().isoformat(),
            "anchor": _rise_onset_anchor(member, cgm),
            "verdict": member.verdict, "outcome": outcome, "glucose": trace,
            "markers": _detail_markers(anchor, lo, hi, basal, bolus, carbs),
            "source_corrections": [], "day_target": {"date": anchor.date().isoformat()},
            "reason": reason}


def _announced_detail(row, outcome, cgm, bolus):
    anchor = row.t
    trace = _comparison_trace(
        _opaque("m_", row.seq_num), anchor, cgm,
        policy_for(Lever.MISSED_MEAL).comparison_window,
    )["trace"]["cgm"]
    return {"id": _opaque("m_", row.seq_num), "date": anchor.date().isoformat(),
            # A meal anchor serves its bolus and no glucose: the pump's own
            # calculator reading is not one the analyzer computed for the meal.
            "anchor": {"t": anchor.strftime(FMT), "kind": "completed_carb_bolus",
                       "label": "Completed carb bolus", "bg": None,
                       "insulin": row.insulin, "carbs": row.carbs},
            "verdict": "comparison", "outcome": outcome, "glucose": trace,
            "markers": [{"kind": "bolus", "t": dose.t.strftime(FMT),
                         "minute": round((dose.t - anchor).total_seconds() / 60, 1),
                         "seq_num": dose.seq_num, "insulin": dose.insulin, "carbs": dose.carbs}
                        for dose in bolus if anchor - timedelta(minutes=60) <= dose.t
                        <= anchor + timedelta(minutes=300)],
            "source_corrections": [], "day_target": {"date": anchor.date().isoformat()},
            # A comparison meal is judged by no habit, so nothing claims it.
            "reason": {"cause": None, "habits": []}}


def _detail(member, lever, facts, reason, cgm, basal, bolus, carbs):
    lo, hi = _trace_bounds(member, lever)
    anchor = member.opportunity.anchor_t
    markers = _detail_markers(anchor, lo, hi, basal, bolus, carbs)
    source = ([{"seq_num": row.seq_num, "t": row.t.strftime(FMT),
                "insulin": row.insulin} for row in member.opportunity.members]
              if member.opportunity.family is Exposure.CORRECTION_CLUSTERS else [])
    return _occurrence(member, facts) | {
        "glucose": _trace(member, lever, cgm)["trace"]["cgm"],
        "markers": markers, "source_corrections": source,
        "day_target": {"date": anchor.date().isoformat()}, "reason": reason,
    }


def _select_roster_occurrence(occ, alignment, projection, roster, lever, facts, reason,
                              cgm, basal, bolus, carbs):
    """Resolve one requested row; ``facts`` maps each row id to its anchor dose,
    carbs and outcome, and ``reason`` builds the selected row's served reason."""
    cohort_of = {
        occurrence_id: cohort["key"]
        for cohort in projection["cohorts"]
        for occurrence_id in cohort["occurrence_ids"]
    }
    active_ids = cohort_of.keys() if alignment == "event" else {
        member.id for member in roster
    }
    selection = {"state": "none", "requested_id": None, "detail": None}
    if occ is None:
        return selection, cohort_of
    selected = next((member for member in roster if member.id == occ), None)
    selection = {"state": "unavailable", "requested_id": occ, "detail": None}
    if selected is None or selected.id not in active_ids:
        return selection, cohort_of
    detail = (_missed_detail(selected, facts[selected.id], reason(selected),
                             cgm, basal, bolus, carbs)
              if lever is Lever.MISSED_MEAL and alignment == "event"
              else _detail(selected, lever, facts[selected.id], reason(selected),
                           cgm, basal, bolus, carbs))
    if alignment == "event":
        detail["comparison_cohort"] = cohort_of[occ]
    return {"state": "selected", "requested_id": occ, "detail": detail}, cohort_of
