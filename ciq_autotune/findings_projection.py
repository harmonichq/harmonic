"""The Diagnose findings queue as a SERVER-OWNED window projection (#730).

The workstation's level 1 is one ranked findings queue (lock terms 34–45). Given an
explicit clock window — a pressed preset or a drawn brace — the queue re-scopes in
place, and *that scoping is decided here*, not in the browser: the caller sends a
window and receives the window's rows, already classified, merged, anchored, counted
and ordered. The frontend renders them verbatim and composes nothing (term 40).

Two registers, assigned by one mechanical rule and stamped on every row as
``register``:

* ``assert`` — a parameter whose backend evidence asserts a direction
  (``SlotEstimate.asserts_move`` for basal, ``IcBlock.asserts_move`` for I:C, and
  the ISF analyzer's own ``evidence.direction`` for ISF). ISF stageability is a
  separate explicit verdict carried beside this register. Contiguous asserting
  basal slots sharing a direction are ONE row named by its span (term 13).
* ``finding`` — one row per behavioral finding NAME (term 35), carrying each family
  appearance's own window-local ``n of m`` denominators. A Pattern row is one too.

A parameter that asserts no direction is never listed, in any window (term 38). The
desk's held, blind and past-setting rows left with the desk (ADR 531).

**Window membership is OUTCOME-anchored** (term 39 / ledger D34). A finding sits in
the window where its *consequence* landed, never where its trigger crossed a
threshold: over-treated low belongs to the window holding the rebound, so a window
drawn over the low block itself excludes it. Each lever declares the anchor kind its
consequence lands on (:func:`~ciq_autotune.analyzers.scenario.levers.outcome_kind`);
an occurrence attributed to that lever re-anchors to its episode's latest anchor of
that kind. Nothing is re-anchored in storage — the exposures feed keeps its own
timestamps and this happens at projection time only.

Numerator and denominator are anchored the SAME way, which is what keeps ``n <= m``:
if a low's outcome moved out of the window, that low leaves both this finding's count
and its family's denominator, so a window can never read "3 of 0 lows".

The projection composes no scores. Priority is read from the two places that already
ship it — scenario ``Pattern.priority`` for behaviors, ``tuning_levers[]`` for
settings — and rows are ordered as one urgency ranking (ADR 469): priced rows by
priority desc, then unpriced asserting rows, then unpriced findings by count. A Pattern admitted through its setting shares that
setting's position (``anchored_by``) and sorts directly after it, as a claimed cause
sorts after its Pattern; the tiers are bands of that one order, and ``rank_note`` says
where a row's rank does not come from what it prints.

It reads the published payload dicts (``/api/analyze``, ``/api/explore/exposures``,
``/api/scenarios``), not analyzer internals, so a fixture generator can drive the very
same public interface the API serves.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from .analyzers.ic import BLOCK_WINDOW_DAYS
# `_chips_for` (#61) asks each lever what kind of anchor its consequence lands on.
from .analyzers.scenario.levers import Exposure, Lever, exposure, outcome_kind, title
from .analyzers.scenario.outcome_patterns import (
    _ROSTER, build_outcome_patterns, credited_claims, outcome_window_population,
)
from .window_membership import DAY_MINUTES, WindowQuery, outcome_minute

SCHEMA = "diagnose-findings-v3"

_SLOT_MINUTES = 30

# Case-file event charts use the Finding lever and the server-owned clock window.
# The mapping remains here with the projection that publishes the coordinate; it
# no longer borrows the retired standalone comparison route vocabulary.
_EVENT_CHART_FAMILIES = {
    "carb_undercount": "meals",
    "late_bolus": "meals",
    "meal_over_delivery": "meals",
    "missed_meal": "highs",
    "over_treated_low": "lows",
    "correction_on_iob": "lows",
    # Correction stacking is counted in correction clusters, never in lows. The
    # retired standalone route filed it under its "lows" VIEW; carrying that view
    # name over as a family published `null` for every correction-stacking
    # Finding, leaving the queue no By-event path into a case the server serves.
    "correction_stacking": "correction_clusters",
}


def event_chart_coordinate(lever: str, query: WindowQuery, families: Sequence[str]):
    if _EVENT_CHART_FAMILIES.get(lever) not in families:
        return None
    return {"lever": lever, "window": query.to_dict()}

# The exposure family a queue row's denominator is counted in, and the noun it is
# counted with (term 16: every denominator names its own noun). Keyed by the family
# names `explore_exposures` emits.
_FAMILY_NOUN = {
    "lows": "lows",
    "highs": "highs",
    "meals": "meals",
    "correction_clusters": "correction clusters",
}

# ADR 0019 §2's closed five-state anchor taxonomy, the verdict band's own vocabulary
# (ADR 41). The frontend only labels these; it never derives membership or counts.
FINDING_VERDICTS = ("fired", "outranked", "near_miss", "no_data", "clean")
DIAGNOSE_SOURCE_WINDOW_DAYS = 30
PATTERN_SUBJECTS = frozenset(f"pattern:{key}" for key, *_ in _ROSTER)


def pattern_rate_family(pattern: dict) -> Exposure:
    """Return the one Exposure family the Pattern producer prices against."""
    return Exposure(next(row[5] for row in _ROSTER if row[0] == pattern.get("key")))


def pattern_chartable(pattern: dict, exposures: dict) -> bool:
    """One server predicate for whether a Pattern owns inspectable evidence.

    It decides the Pattern row's chart coordinate and, through it, its case file.
    It never decides whether a scoped window serves the Pattern: the scoped
    roster's producer owns that (ADR 467).
    """
    family = pattern_rate_family(pattern)
    has_admitted_habit = any(
        member.get("kind") == "habit" and member.get("admitted")
        for member in pattern.get("members") or ()
    )
    source = (exposures.get("exposures") or {}).get(family.value) or {}
    return has_admitted_habit and (source.get("n") or 0) > 0


def _hhmm(minute: int) -> str:
    """``330`` -> ``"05:30"``; the day's far edge prints as ``24:00``, not ``00:00``."""
    if minute == DAY_MINUTES:
        return "24:00"
    return f"{minute // 60:02d}:{minute % 60:02d}"


def _span_label(start_min: int, end_min: int) -> str:
    """A parameter row's own name for its extent: one slot reads as its start."""
    if (start_min + _SLOT_MINUTES) % DAY_MINUTES == end_min % DAY_MINUTES:
        return _hhmm(start_min)
    return f"{_hhmm(start_min)} to {_hhmm(end_min)}"


@dataclass(frozen=True)
class FindingsProjection:
    """One window's worth of analysis, with all queue policy behind ``project``.

    Holds the three published payloads it projects from — the ``/api/analyze`` result,
    the ``/api/explore/exposures`` feed and the ``/api/scenarios`` report — so the same
    public interface serves the API and the fixture generator.
    """

    _analysis: dict
    _exposures: dict
    _scenarios: dict
    _outcome_patterns: list[dict]

    @property
    def history_catalog(self) -> Tuple[dict, ...]:
        """The analyzer-published history catalog this snapshot projects."""
        return tuple(self._analysis.get("ic_history") or [])

    def project(
        self, query: WindowQuery, *, analysis_generation: str = "standalone:0",
    ) -> dict:
        rows = self._parameter_rows(query)
        rows += self._finding_rows(query)
        if query.scoped:
            pattern_exposures, scoped_patterns = outcome_window_population(
                self._analysis, self._exposures, self._scenarios, query,
            )
            scoped_by_key = {pattern["key"]: pattern for pattern in scoped_patterns}
            outcome_patterns = []
            for prepared in self._outcome_patterns:
                scoped = scoped_by_key.get(prepared.get("key"))
                if scoped is None:
                    continue
                outcome_patterns.append(deepcopy(prepared) | {
                    field: deepcopy(scoped[field])
                    for field in ("n", "k", "rate", "wilson", "wide", "readiness",
                                  "rate_producer")
                    if field in scoped
                })
        else:
            pattern_exposures = self._exposures
            outcome_patterns = self._outcome_patterns
        pattern_rows, pattern_by_subject = self._pattern_rows(
            rows, query, outcome_patterns, pattern_exposures,
        )
        rows += pattern_rows
        by_id = {row["id"]: row for row in rows}
        _stamp_anchors(pattern_rows, rows, by_id)
        rows.sort(key=lambda row: _sort_key(row, by_id))
        _assign_tiers(rows, by_id)
        _stamp_rank_notes(rows, query, self._analysis.get("window_days"))
        for row in rows:
            row["headline"] = _headline_for(row)
            row["count_sentences"] = _count_sentences_for(row)
        for row in rows:
            if row.get("claimed_by"):
                row["fold_sentences"] = _fold_sentences(
                    row, pattern_by_subject[row["claimed_by"]], pattern_exposures,
                )
        # A Pattern with one admitted habit is served as that habit's row, which
        # carries the Pattern's own count (ADR 520). A window whose habit claims
        # nothing serves no row for it to ride on.
        for pattern in outcome_patterns:
            if pattern.get("collapse") != "collapse_to_member":
                continue
            member = by_id.get(f"finding:{pattern['action'].removeprefix('habit:')}")
            if member is not None:
                member["served_as"] = _served_as(pattern, pattern_exposures)
        return {
            "schema": SCHEMA,
            "analysis_generation": analysis_generation,
            "window": query.to_dict(),
            "findings_window": {
                "days": self._analysis.get("window_days"),
                **(self._exposures.get("window") or {}),
            },
            "rows": rows,
            # The prepared roster is the Pattern producer's output, not a second
            # Findings-policy pass.  Keep it additive while the shipped queue
            # continues to render its existing setting and Lever rows.
            "outcome_patterns": deepcopy(outcome_patterns),
        }

    def _pattern_rows(self, rows: List[dict], query: WindowQuery,
                      outcome_patterns: list[dict] | None = None,
                      pattern_exposures: dict | None = None):
        """Place the prepared roster in the queue without re-deciding its policy.

        A scoped roster arrives membership-filtered, so every ``remain_pattern``
        Pattern in it is served; chartability decides only ``pattern_chart``.
        """
        by_id = {row["id"]: row for row in rows}
        pattern_rows, pattern_by_subject = [], {}
        outcome_patterns = self._outcome_patterns if outcome_patterns is None else outcome_patterns
        pattern_exposures = self._exposures if pattern_exposures is None else pattern_exposures
        for pattern in outcome_patterns:
            # Partial rosters occur in the producer-isolation tests; they remain
            # additive evidence, but are not renderable Pattern contracts.
            if pattern.get("collapse") != "remain_pattern":
                continue
            subject = pattern["subject"]
            subjects = dict.fromkeys([
                *(pattern.get("rate_levers") or ()),
                *(member["subject"] for member in pattern.get("members") or ()
                  if member["kind"] == "habit"),
            ])
            for lever in subjects:
                row = by_id.get(f"finding:{lever.removeprefix('habit:')}")
                if row is not None:
                    row["claimed_by"] = subject
            pattern_row = _row(
                id=subject, register="finding", kind="pattern", title=pattern["title"],
                priority=(pattern["settled_price"]
                          if pattern["admission_route"] != "none" else None),
                episodes=None, pattern=deepcopy(pattern),
                window_scope="window" if query.scoped else "whole_day",
                pattern_chart=({"key": pattern["key"], "window": query.to_dict()}
                               if pattern_chartable(pattern, pattern_exposures) else None),
            )
            pattern_rows.append(pattern_row)
            pattern_by_subject[subject] = pattern_row
        return pattern_rows, pattern_by_subject

    def guidance(self, *, active_watch=None, preferences=(), acknowledgments=None,
                 analysis_generation: str = "standalone:0") -> dict:
        """Build unfiltered guidance from this projection's coherent owner inputs."""
        from .guidance import build_guidance
        return build_guidance(
            analysis=self._analysis, exposures=self._exposures, scenarios=self._scenarios,
            preferences=preferences, acknowledgments=acknowledgments, active_watch=active_watch,
            generation=analysis_generation,
            window={"days": self._analysis.get("window_days"),
                    **(self._exposures.get("window") or {})},
        )

    # --- parameters: asserting only -------------------------------------------

    def _parameter_rows(self, query: WindowQuery) -> List[dict]:
        """Every window is asserting-only: a parameter that names no direction is
        never listed and never named (term 38)."""
        return self._basal_rows(query) + self._ic_rows(query) + self._isf_rows()

    def _lever_priority(self, parameter: str) -> Optional[int]:
        for lever in self._analysis.get("tuning_levers") or []:
            if lever.get("parameter") == parameter:
                return lever.get("priority")
        return None

    def _basal_rows(self, query: WindowQuery) -> List[dict]:
        """Merge the 48 slots into spans, then keep the spans overlapping the window.

        Spans are merged over the WHOLE day before filtering, never clipped to the
        window: a run of asserting slots is one item that stages whole (term 13), so
        the row names the run it really is.

        Not :func:`~ciq_autotune.analyzers.tuning_priority._basal_blocks` — that
        grouping bridges a one-slot gap to price a headline, which would put a
        non-asserting slot inside a row that claims to move everything it spans.
        """
        slots = sorted(self._analysis.get("basal") or [], key=lambda s: s["slot"])
        spans: List[Tuple[Optional[Tuple[Optional[str]]], List[dict]]] = []
        for slot in slots:
            # A slot's direction, the key contiguous asserting slots merge on, or
            # None for a slot that asserts nothing: no row, and it breaks any run.
            key = (slot.get("direction"),) if slot.get("asserts_move") else None
            if key is None:
                spans.append((key, [slot]))
                continue
            if (spans and spans[-1][0] == key
                    and spans[-1][1][-1]["slot"] + 1 == slot["slot"]):
                spans[-1][1].append(slot)
            else:
                spans.append((key, [slot]))

        rows = []
        for key, span in spans:
            if key is None:
                continue
            start_min = span[0]["slot"] * _SLOT_MINUTES
            end_min = (span[-1]["slot"] + 1) * _SLOT_MINUTES
            if not query.overlaps(start_min, end_min):
                continue
            (direction,) = key
            head = span[0]
            single = len(span) == 1
            label = _span_label(start_min, end_min)
            rows.append(_row(
                id=f"basal:{start_min}-{end_min}",
                register="assert",
                kind="setting",
                parameter="basal_rate",
                title=_title(f"Basal {label}", direction),
                label=label,
                priority=self._lever_priority("basal_rate"),
                span={"start_min": start_min, "end_min": end_min, "label": label},
                direction=direction,
                # A merged run names no single programmed rate, so its numbers stay on
                # its members rather than becoming an invented span average.
                current=head.get("current") if single else None,
                recommended=head.get("recommended") if single else None,
                estimate=head.get("estimate") if single else None,
                members=[{"start_min": s["slot"] * _SLOT_MINUTES,
                          "current": s.get("current"),
                          "recommended": s.get("recommended"),
                          "estimate": s.get("estimate"),
                          "days": s.get("days")} for s in span],
                # The weakest slot governs how well-supported the whole run is.
                support={"n": min(s.get("days") or 0 for s in span),
                         "noun": "nights of steady data",
                         "run_days": self._analysis.get("window_days")},
                # Verbatim: the analyzer's own sentence, never rewritten here.
                annotation=head.get("annotation"),
            ))
        return rows

    def _ic_rows(self, query: WindowQuery) -> List[dict]:
        rows = []
        for block in self._analysis.get("ic_blocks") or []:
            start_min, end_min = block["start_min"], block["end_min"]
            if not query.overlaps(start_min, end_min):
                continue
            # `ic_asserts_move`'s stamp is the one verdict a block lists on; a
            # block it withholds is never listed, in any window.
            if not block.get("asserts_move"):
                continue
            label = _span_label(start_min, end_min)
            direction = block.get("direction")
            current = (block.get("current_values") or [None])[0]
            rows.append(_row(
                id=f"ic:{block['block_id']}",
                register="assert",
                kind="setting",
                parameter="carb_ratio",
                title=_title(f"Carb ratio {label}", direction),
                label=block.get("label"),
                priority=self._lever_priority("carb_ratio"),
                span={"start_min": start_min, "end_min": end_min, "label": label},
                direction=direction,
                current=current,
                recommended=block.get("recommended"),
                estimate=block.get("estimate") or {},
                # A block is single-valued, so it is its own one member: the same
                # shape a basal run's slots are served in, read the same way.
                members=[{"start_min": start_min, "current": current,
                          "recommended": block.get("recommended"),
                          "estimate": block.get("estimate")}],
                support={"n": block.get("n_runs"), "noun": "meal runs",
                         "run_days": BLOCK_WINDOW_DAYS},
                annotation=block.get("annotation"),
            ))
        return rows

    def _isf_rows(self) -> List[dict]:
        """ISF is one value for the whole day (term 31), so it meets every window.

        Its register decision is the analyzer's own ``evidence.direction`` — never
        re-derived from the band and the programmed value. Its independent staging
        decision is copied from ``asserts_move``. A row with no direction is never
        listed.
        """
        rows = []
        for row in self._analysis.get("isf") or []:
            evidence = row.get("evidence") or {}
            direction = evidence.get("direction")
            if direction is None:
                continue
            rows.append(_row(
                id="isf",
                register="assert",
                kind="setting",
                parameter="isf",
                title=_title("Correction factor", direction),
                label=row.get("label"),
                priority=(self._lever_priority("isf")
                          if row.get("asserts_move") is True else None),
                span=None,
                direction=direction,
                asserts_move=row.get("asserts_move"),
                current=row.get("current"),
                recommended=row.get("recommended"),
                estimate=row.get("estimate") or {},
                support={"n": len(evidence.get("night_fits") or []),
                         "noun": "fasting nights",
                         "run_days": self._analysis.get("window_days")},
                annotation=row.get("annotation"),
            ))
        return rows

    # --- findings: outcome-anchored membership + window-local denominators -----

    def _finding_rows(self, query: WindowQuery) -> List[dict]:
        families = (self._exposures.get("exposures") or {})
        # Every occurrence, re-anchored to its finding's outcome, kept only where
        # that outcome lands inside the window. The family denominator is filtered
        # by the same anchor, so it can never be smaller than what it denominates.
        in_window: Dict[str, List[dict]] = {}
        for family, payload in families.items():
            in_window[family] = [
                occurrence for occurrence in payload.get("occurrences") or []
                if query.contains(outcome_minute(occurrence, self._exposures))
            ]

        by_lever: Dict[str, dict] = {}
        for family, occurrences in in_window.items():
            denominator = len(occurrences)
            counted: Dict[str, List[dict]] = {}
            for occurrence in occurrences:
                lever = occurrence.get("cause_lever")
                if lever is None:
                    continue
                counted.setdefault(lever, []).append(occurrence)
            for lever, hits in counted.items():
                entry = by_lever.setdefault(lever, {
                    "title": hits[0].get("cause_title"),
                    "appearances": [],
                    "episodes": set(),
                    # The families this lever actually claims occurrences in — the
                    # evidence block and its verdict band are drawn over exactly
                    # these families' in-window occurrences, never just the hits.
                    "families": [],
                })
                entry["appearances"].append({
                    "family": family,
                    "noun": _FAMILY_NOUN.get(family, family),
                    "n": len(hits),
                    "m": denominator,
                })
                entry["episodes"].update(hit.get("ep_id") for hit in hits)
                entry["families"].append(family)

        priced = _pattern_priorities(self._scenarios)
        rows = []
        for lever, entry in by_lever.items():
            entry["appearances"].sort(key=lambda a: a["family"])
            evidence, verdict_counts, verdict_counts_by_family = _lever_evidence(
                lever, entry["families"], in_window,
            )
            rows.append(_row(
                id=f"finding:{lever}",
                register="finding",
                kind="habit",
                lever=lever,
                title=entry["title"],
                priority=priced.get(lever),
                appearances=entry["appearances"],
                # Episodes, not occurrences: one episode showing up in two families
                # is one thing that happened, and the count that orders the unpriced
                # tail must say so.
                episodes=len(entry["episodes"]),
                # ADR 41: every in-window occurrence this finding's band counts,
                # carrying the event id(s) and clock key the canvas joins on, plus
                # its five-state verdict *relative to this lever* — never dropped
                # just because it wasn't the one that fired (item 3).
                evidence=evidence,
                # Kept for compatibility (a single-family lever's total IS its one
                # family's count); a multi-family lever's band must key off
                # `verdict_counts_by_family` instead (finding 1) so the band and the
                # roster it scopes share one denominator.
                verdict_counts=verdict_counts,
                verdict_counts_by_family=verdict_counts_by_family,
                event_chart=event_chart_coordinate(lever, query, entry["families"]),
            ))
        return rows


# Silence reasons that keep an occurrence "calm" for a lever whose classifier
# looked and had nothing to flag (ADR 0019 §2's `_CALM_REASONS`, mirrored here
# because this module reads the published `verdicts[]` contract, not the
# model-view internals that own the enum).
_CALM_SILENCE_REASONS = frozenset({
    None, "no_trigger", "owned_by_announced_meal", "stayed_in_range",
})
_NO_DATA_SILENCE_REASON = "insufficient_data"


def _occurrence_verdict(occurrence: dict, lever: str) -> str:
    """This finding's own, ROW-RELATIVE verdict on one occurrence (ADR 41, item 2).

    Read off the occurrence's own lever's classifier verdict — never the
    anchor's overall ``state``, which is precedence-collapsed across every
    classifier that looked at the anchor and says nothing about THIS lever.
    Owner ruling (ADR 41, design.md): "the server has rule fired" — a row's own lever matching is
    ``fired`` (Meets criteria) whether or not it also won the episode's
    attribution; ``outranked`` is reserved for an occurrence where this lever's
    classifier never matched anything and some OTHER lever drove the episode.

    * this lever's classifier matched → ``fired`` (row-relative: it fired
      whether or not it drove the episode).
    * this lever's classifier ran and came back a loud near-miss → ``near_miss``.
    * this lever's classifier ran but the window was too sparse → ``no_data``.
    * this lever's classifier ran, came back calm, and no lever drove the
      episode → ``clean``.
    * this lever's classifier ran, came back calm, and another lever drove
      the episode → ``outranked``.
    * this lever's classifier produced NO verdict entry at all for this
      occurrence (``verdicts`` carries nothing under ``lever``) — it was
      never evaluated, which is not the same fact as evaluated-and-calm.
      ``clean`` would assert a criterion failed that nothing ever judged, so
      this reads ``no_data`` instead, unless another lever demonstrably drove
      the episode (``outranked`` — something is known to have happened here,
      just not attributed to this lever).
    """
    own = next(
        (v for v in occurrence.get("verdicts") or [] if v.get("classifier") == lever),
        None,
    )
    if own is None:
        return "outranked" if occurrence.get("cause_lever") else "no_data"
    if own.get("matched"):
        return "fired"
    reason = own.get("silence_reason")
    if reason == _NO_DATA_SILENCE_REASON:
        return "no_data"
    if reason not in _CALM_SILENCE_REASONS:
        return "near_miss"
    return "outranked" if occurrence.get("cause_lever") else "clean"


def _lever_evidence(
    lever: str, families: Sequence[str], in_window: Dict[str, List[dict]],
) -> Tuple[List[dict], Dict[str, int], Dict[str, Dict[str, int]]]:
    """The evidence rows and verdict-band counts one finding row publishes.

    Drawn over every in-window occurrence of every family this lever claims a hit
    in — not just its hits — so the band's ``outranked``/``near_miss``/``no_data``/
    ``clean`` counts (which the frontend may not derive) have something to count.

    Returns the evidence list, the total counts (kept for compatibility — a row
    that claims one family still wants one number), and the SAME counts broken
    out per family (finding 1): a multi-family lever's roster and its band must
    share one denominator, which only the family it is currently framing on can
    give it.
    """
    counts = {category: 0 for category in FINDING_VERDICTS}
    counts_by_family: Dict[str, Dict[str, int]] = {}
    evidence = []
    # Sorted, not first-seen: the family a lever hits first is an accident of the
    # exposures dict's own key order, and `appearances` already sorts alphabetically
    # for the same reason (a stable answer independent of that order).
    for family in sorted(set(families)):
        family_counts = {category: 0 for category in FINDING_VERDICTS}
        for occurrence in in_window.get(family, []):
            category = _occurrence_verdict(occurrence, lever)
            counts[category] += 1
            family_counts[category] += 1
            evidence.append({
                "ep_id": occurrence.get("ep_id"),
                "t": occurrence.get("t"),
                "date": occurrence.get("date"),
                "family": family,
                "kind": occurrence.get("kind"),
                "verdict": category,
            })
        counts_by_family[family] = family_counts
    return evidence, counts, counts_by_family


def _title(name: str, direction: Optional[str]) -> str:
    return name if direction is None else f"{name} · {direction}"


# --- headlines: one served sentence per row (#306 ADR "Every findings row carries
# one served headline") -----------------------------------------------------------
#
# Templates are the operator's, ruled in the attended round of 2026-09-03 and
# recorded under `## Headline templates` in `design.md`. A slot names only a
# served row field — every family's, correction factor included: the ISF
# rest-window evidence is never a source. Nothing here recounts raw records or
# re-derives a direction, floor, threshold or priority.

# The ranked-queue tiers whose event-comparison rows earn the "ranks among this
# window's findings" verdict (ADR 41's closed tier vocabulary, banded by ADR 469:
# the leading run of priced asserting rows is `next_in_line`, every other priced
# row is `worth_a_look`; only `noted` sits below the line). The sentence states only the published
# rank, never a recurrence frequency the analyzer does not publish.
_RANKING_TIERS = frozenset({"next_in_line", "worth_a_look"})


def _fmt_uh(value: Optional[float]) -> Optional[str]:
    """Basal prints in U/h, always to two decimals (CONTEXT.md)."""
    return None if value is None else f"{value:.2f}"


def _fmt_precision(value: Optional[float]) -> Optional[str]:
    """mg/dL and g/U print as a whole number when the served value is whole, and
    to one decimal otherwise (`40`, `12`, but `24.0` for a served `23.9974`)."""
    if value is None:
        return None
    return str(int(value)) if float(value).is_integer() else f"{value:.1f}"


def _below_above(word: Optional[str]) -> Optional[str]:
    """A basal direction, spelled as the headline's own vocabulary."""
    return None if word is None else {"raise": "above", "lower": "below"}[word]


def _sentence(text: str) -> str:
    """A served analyzer fragment (lowercase-initial user copy), capitalized to
    open a new sentence — the fragment itself is never reworded (#306 ADR)."""
    return text[:1].upper() + text[1:] if text else text


def _basal_headline(row: dict) -> str:
    support_n = (row.get("support") or {}).get("n")
    annotation = _sentence(row.get("annotation") or "")
    current = row.get("current")
    estimate_value = (row.get("estimate") or {}).get("value")
    if current is not None and estimate_value is not None:
        return (f"{annotation}. Delivered {_fmt_uh(estimate_value)} U/h across "
                f"{support_n} steady nights against {_fmt_uh(current)} "
                f"programmed.")
    # A merged run names no single programmed rate, and a slot with no
    # delivered estimate (a harm-forced move on zero clean nights) has
    # nothing to set against the programmed rate either — both read only the
    # row's own served direction and the steady-night count.
    word = _below_above(row.get("direction"))
    return (f"{annotation}. Delivered {word} the programmed rate across "
            f"{support_n} steady nights.")


def _isf_headline(row: dict) -> str:
    """Correction factor's headline: every slot is a row field (`support.n`,
    `current`, `estimate.value`, `annotation`) — the ISF rest-window evidence is
    never a source, so this reads only the row, like every other family."""
    support_n = (row.get("support") or {}).get("n")
    current = _fmt_precision(row.get("current"))
    estimate_value = _fmt_precision((row.get("estimate") or {}).get("value"))
    annotation = _sentence(row.get("annotation") or "")
    return (f"{annotation}. Measured 1 U : {estimate_value} mg/dL across "
            f"{support_n} fasting nights against 1 U : {current} mg/dL "
            f"programmed.")


def _ic_headline(row: dict) -> str:
    support_n = (row.get("support") or {}).get("n")
    current = _fmt_precision(row.get("current"))
    estimate_value = _fmt_precision((row.get("estimate") or {}).get("value"))
    against_current = f" against {current} programmed" if current is not None else ""
    annotation = _sentence(row.get("annotation") or "")
    return (f"{annotation}. Measured {estimate_value} g/U across "
            f"{support_n} meal runs{against_current}.")


def _finding_headline(row: dict) -> str:
    # `_finding_rows` never publishes a row without one: `by_lever[lever]` is
    # only created in the same iteration that appends its first appearance
    # (`findings_projection.py`'s `_finding_rows`).
    appearance = row["appearances"][0]
    verdict = ("Ranks among this window's findings" if row.get("tier") in _RANKING_TIERS
               else "Not ranked in this window yet")
    return (f"{verdict}. Showed up in {appearance['n']} of {appearance['m']} "
            f"{appearance['noun']} in this window.")


def _pattern_noun(pattern: dict) -> str:
    """The noun a Pattern's own k-of-n count is denominated in — shared by
    ``headline`` and the count sentence so the two can never name a different
    noun for the same row."""
    return _FAMILY_NOUN[pattern_rate_family(pattern).value]


def _headline_for(row: dict) -> str:
    """The one served sentence for this row's own family and register."""
    if row["kind"] == "pattern":
        pattern = row["pattern"]
        if pattern.get("count_status"):
            return f"{row['title']}: counts under review"
        if pattern["admission_route"] == "none":
            return row["title"]
        noun = _pattern_noun(pattern)
        return f"{row['title']} in {pattern['k']} of {pattern['n']} {noun}"
    if row["kind"] == "habit":
        return _finding_headline(row)
    parameter = row["parameter"]
    if parameter == "basal_rate":
        return _basal_headline(row)
    if parameter == "isf":
        return _isf_headline(row)
    if parameter == "carb_ratio":
        return _ic_headline(row)
    raise ValueError(f"no headline template for parameter {parameter!r}")  # pragma: no cover


# --- count sentences: "N of M noun outcome" (#413 design lock, 2026-09-14:
# "n of d noun outcome on every row, causes included, from served words") -----
#
# One closed outcome table per row kind, keyed the way the design ADR requires: a
# Pattern by its own served key, a Cause by the lever AND the family the appearance
# is counted in — never by family alone, because two Patterns (and two Causes) can
# share a family and end in opposite words (highs_after_meals / lows_after_meals
# both count in meals; carb_undercount counted in meals ends "ran high", while the
# same lever counted in highs describes what the high followed). An unrecognized
# key is a defect, never a silent blank: a Pattern key or lever-and-family pair
# added later without an entry here fails this module's tests and cannot merge.

_PATTERN_OUTCOME = {
    "highs_after_meals": "ran high",
    "lows_after_meals": "ran low",
    "highs_after_treating_lows": "rebounded high",
    "lows_after_correcting_highs": "followed a correction",
}

_CAUSE_OUTCOME = {
    # Closed over the code-derived cross product (coordinator decision, #413 review
    # round 2): every `Lever` member (levers.py) x every family a Cause appearance
    # can be filed under — the four exposure families `explore_exposures._FAMILY_FOR_KIND`
    # names (lows / meals / highs / correction_clusters). Never widened or narrowed
    # from fixture output.
    ("carb_undercount", "meals"): "ran high",
    ("carb_undercount", "highs"): "followed an undercounted meal",
    ("carb_undercount", "lows"): "followed an undercounted meal",
    ("carb_undercount", "correction_clusters"): "followed an undercounted meal",
    ("late_bolus", "meals"): "ran high",
    ("late_bolus", "highs"): "followed a late bolus",
    ("late_bolus", "lows"): "followed a late bolus",
    ("late_bolus", "correction_clusters"): "followed a late bolus",
    ("meal_over_delivery", "meals"): "ran low",
    ("meal_over_delivery", "lows"): "followed a strong meal dose",
    ("meal_over_delivery", "highs"): "followed a strong meal dose",
    ("meal_over_delivery", "correction_clusters"): "followed a strong meal dose",
    ("over_treated_low", "lows"): "rebounded high",
    ("over_treated_low", "highs"): "followed an over-treated low",
    ("over_treated_low", "meals"): "followed an over-treated low",
    ("over_treated_low", "correction_clusters"): "followed an over-treated low",
    ("correction_stacking", "correction_clusters"): "went low",
    ("correction_stacking", "lows"): "followed stacked corrections",
    ("correction_stacking", "meals"): "followed stacked corrections",
    ("correction_stacking", "highs"): "followed stacked corrections",
    ("correction_on_iob", "lows"): "followed a correction on active insulin",
    ("correction_on_iob", "correction_clusters"): "followed a correction on active insulin",
    ("correction_on_iob", "meals"): "followed a correction on active insulin",
    ("correction_on_iob", "highs"): "followed a correction on active insulin",
    ("missed_meal", "highs"): "had no bolus nearby",
    ("missed_meal", "meals"): "had no bolus nearby",
    ("missed_meal", "lows"): "had no bolus nearby",
    ("missed_meal", "correction_clusters"): "had no bolus nearby",
}


def _count_sentence(count: int, denominator: int, noun: str, outcome: str) -> dict:
    return {
        "sentence": f"{count} of {denominator} {noun} {outcome}",
        "count": count,
        "denominator": denominator,
        "noun": noun,
        "outcome": outcome,
    }


def _pattern_count_sentences(row: dict) -> Optional[List[dict]]:
    """A count-bearing Pattern's one served sentence, or ``None`` — counts under
    review and a Pattern with no admitted k/n serve none, matching ``_headline_for``'s
    own gating so the two fields never disagree about which rows carry counts."""
    pattern = row["pattern"]
    if pattern.get("count_status") or pattern["admission_route"] == "none":
        return None
    noun = _pattern_noun(pattern)
    key = pattern["key"]
    if key not in _PATTERN_OUTCOME:
        raise ValueError(f"no outcome word for pattern {key!r}")
    return [_count_sentence(pattern["k"], pattern["n"], noun, _PATTERN_OUTCOME[key])]


def _served_as(pattern: dict, exposures: dict) -> dict:
    """The Pattern a habit row is served as (ADR 520): its subject, its own count
    sentence, and each rate lever with a credit, its credited share of that count,
    in roster order.

    Both read ``credited_claims`` over ``exposures``, the population the Pattern's
    ``k`` and its case file are built from, so a Pattern served as its one habit is
    counted as the Pattern, never as that habit's own driver count: a rate lever the
    Pattern does not admit still claims the lows it reached. A Pattern that serves
    no count serves no shares.
    """
    sentences = _pattern_count_sentences({"pattern": pattern})
    shares = None
    if sentences is not None:
        levers = [subject.removeprefix("habit:") for subject in pattern["rate_levers"]]
        credits = list(credited_claims(
            exposures, pattern_rate_family(pattern).value, levers,
        ).values())
        shares = [{"subject": f"habit:{lever}", "title": title(Lever(lever)),
                   "count": credits.count(lever)}
                  for lever in levers if lever in credits]
    return {"subject": pattern["subject"], "count_sentences": sentences,
            "cause_counts": shares}


def _cause_count_sentences(row: dict) -> Optional[List[dict]]:
    """One sentence per served family appearance, in appearance order (already
    alphabetical — ``_finding_rows`` sorts ``appearances`` for the same reason)."""
    sentences = []
    for appearance in row["appearances"] or []:
        key = (row["lever"], appearance["family"])
        if key not in _CAUSE_OUTCOME:
            raise ValueError(f"no outcome word for lever/family {key!r}")
        sentences.append(_count_sentence(
            appearance["n"], appearance["m"], appearance["noun"], _CAUSE_OUTCOME[key],
        ))
    return sentences or None


def _count_sentences_for(row: dict) -> Optional[List[dict]]:
    """The served count sentences beside ``headline`` — a new field, never a rebuild
    of it (#413 ADR "The backend serves the count sentence")."""
    if row["kind"] == "pattern":
        return _pattern_count_sentences(row)
    if row["kind"] == "habit":
        return _cause_count_sentences(row)
    return None


def _fold_sentences(row: dict, pattern_row: dict, exposures: dict) -> List[dict]:
    """A folded cause's count sentences as its Pattern's fold reads them (ADR 424).

    Under a Pattern that serves a count, one of its rate levers leads with its
    credited share of that count, on the Pattern's own denominator and noun (scope
    ``pattern``); its sentences on any other family follow, outside the count. Every
    other fold sentence is outside: a cause that is not a rate lever adds nothing to
    the Pattern's count, and a Pattern that serves no count has no share to give.
    ``exposures`` is the population the Pattern's own count was built from.
    """
    pattern = pattern_row["pattern"]
    lever = row["lever"]
    by_family = list(zip((appearance["family"] for appearance in row["appearances"] or ()),
                         row["count_sentences"] or ()))
    if (pattern_row["count_sentences"] is None
            or f"habit:{lever}" not in pattern["rate_levers"]):
        return [sentence | {"scope": "outside"} for _family, sentence in by_family]
    family = pattern_rate_family(pattern).value
    credits = credited_claims(exposures, family, [
        subject.removeprefix("habit:") for subject in pattern["rate_levers"]
    ])
    share = _count_sentence(sum(claimant == lever for claimant in credits.values()),
                            pattern["n"], _pattern_noun(pattern),
                            _CAUSE_OUTCOME[(lever, family)])
    return [share | {"scope": "pattern"},
            *(sentence | {"scope": "outside"}
              for appearance_family, sentence in by_family if appearance_family != family)]


# Carb ratio is grams per unit, so raising it removes insulin and answers lows.
_SETTINGS_CHIPS = {
    ("basal_rate", "raise"): ("highs",),
    ("basal_rate", "lower"): ("lows",),
    ("carb_ratio", "raise"): ("lows",),
    ("carb_ratio", "lower"): ("highs",),
    ("isf", "strengthen"): ("highs",),
    ("isf", "weaken"): ("lows",),
}

_PATTERN_CHIPS = {
    "highs_after_meals": ("highs", "meals"),
    "lows_after_meals": ("lows", "meals"),
    "highs_after_treating_lows": ("highs",),
    "lows_after_correcting_highs": ("lows", "corrections"),
}


def _chips_for(row: dict) -> List[str]:
    """The filter chips a serialized queue row belongs under."""
    if row["register"] == "assert":
        return list(_SETTINGS_CHIPS[(row["parameter"], row["direction"])])
    if row["kind"] == "pattern":
        return list(_PATTERN_CHIPS[row["pattern"]["key"]])

    chips = []
    kind = outcome_kind(row["lever"])
    if kind == "high":
        chips.append("highs")
    elif kind == "low":
        chips.append("lows")
    families = {appearance["family"] for appearance in row["appearances"]}
    if "meals" in families:
        chips.append("meals")
    if "correction_clusters" in families:
        chips.append("corrections")
    return chips


def _row(**fields) -> dict:
    """One queue row, with every key present on every row (absent reads as null)."""
    row = {
        "id": None, "register": None, "kind": None, "title": None, "priority": None,
        "tier": None, "headline": None,
        "parameter": None, "label": None, "span": None, "direction": None,
        "asserts_move": None,
        "current": None, "recommended": None, "estimate": None,
        "support": None, "annotation": None, "members": None,
        "lever": None, "appearances": None, "episodes": None,
        "evidence": None, "verdict_counts": None, "verdict_counts_by_family": None,
        "chips": None, "window_scope": None, "count_sentences": None, "fold_sentences": None,
        "event_chart": None,
        "pattern": None, "pattern_chart": None, "claimed_by": None,
        "anchored_by": None, "rank_note": None, "served_as": None,
    }
    row.update(fields)
    row["chips"] = _chips_for(row)
    if row["window_scope"] is None:
        row["window_scope"] = "whole_day" if row["parameter"] == "isf" else "window"
    return row


def _stamp_anchors(pattern_rows: Sequence[dict], rows: Sequence[dict],
                   by_id: Dict[str, dict]) -> None:
    """Seat each setting-admitted Pattern in its setting's position (ADR 469).

    Its anchor is the first served, priced, asserting row of its setting member's
    parameter in queue order; every such row carries the same parameter-level
    Priority. With none served (a scoped window without the setting's row) the Pattern keeps
    its own ranked position. Its own ``priority`` stays the roster's price (ADR 391).
    """
    for pattern_row in pattern_rows:
        pattern = pattern_row["pattern"]
        if pattern["admission_route"] != "setting_staging":
            continue
        member = next(item for item in pattern["members"] if item["kind"] == "setting")
        parameter = member["subject"].removeprefix("setting:")
        anchors = [row for row in rows
                   if row["register"] == "assert" and row["parameter"] == parameter
                   and row["priority"] is not None]
        if anchors:
            pattern_row["anchored_by"] = min(
                anchors, key=lambda row: _sort_key(row, by_id))["id"]


def _assign_tiers(rows: Sequence[dict], by_id: Dict[str, dict]) -> None:
    """Stamp the sorted queue's closed ranking vocabulary as bands of its one order.

    The leading run of priced, top-level asserting rows is ``next_in_line``; every
    later priced top-level row is ``worth_a_look``; an anchored Pattern takes its
    anchor's tier; a priced claimed cause is ``worth_a_look``; every unpriced row is
    ``noted`` (ADR 469). A caption where the tier changes therefore prints each tier
    word at most once, and the first tier is one leading run.
    """
    leading = True
    for row in rows:
        if row["priority"] is None:
            row["tier"] = "noted"
        elif row["claimed_by"]:
            row["tier"] = "worth_a_look"
        elif row["anchored_by"]:
            continue
        elif leading and row["register"] == "assert":
            row["tier"] = "next_in_line"
        else:
            leading = False
            row["tier"] = "worth_a_look"
    for row in rows:
        if row["anchored_by"]:
            row["tier"] = by_id[row["anchored_by"]]["tier"]


def _stamp_rank_notes(rows: Sequence[dict], query: WindowQuery,
                      days: Optional[int]) -> None:
    """Say where a row's rank does not come from the counts it prints (ADR 469).

    An anchored Pattern is "Ranked with its setting". In a scoped window a priced,
    top-level Pattern or Cause prints the window's counts but ranks on its 30-day
    Priority, so it says so; a setting row prints its whole span and says nothing.
    """
    for row in rows:
        if row["anchored_by"]:
            row["rank_note"] = "Ranked with its setting"
        elif (query.scoped and row["priority"] is not None and not row["claimed_by"]
              and row["kind"] in ("pattern", "habit")):
            row["rank_note"] = f"Ranked on all {days} days"


def _sort_key(row: dict, by_id: Optional[Dict[str, dict]] = None):
    """The queue's one urgency order (ADR 469): priced rows by priority desc, then
    unpriced asserting rows, then unpriced findings by count desc. A row anchored to
    a setting, or claimed by a Pattern, sorts directly after its parent, recursively,
    so a claimed cause follows its anchored Pattern. Every tie falls through to a
    stable, data-derived key so two runs of the same window always return the same
    list."""
    span = row.get("span") or {}
    key = (
        0 if row["priority"] is not None else 1 if row["register"] == "assert" else 2,
        -(row["priority"] or 0),
        -(row["episodes"] or 0),
        span.get("start_min", DAY_MINUTES),
        row["title"] or "",
    )
    parent = row.get("anchored_by") or row.get("claimed_by")
    if parent and by_id and parent in by_id:
        return _sort_key(by_id[parent], by_id) + (1, *key)
    return key + (0,)


def _pattern_priorities(scenarios: dict) -> Dict[str, int]:
    """Each lever's already-computed 0–100 priority, surfaced or low-confidence.

    Read, never recomputed: the unified priority ships on the scenario payload and on
    ``tuning_levers``, and the queue's whole job is to render the server's own order.
    """
    priced = {}
    for pattern in ((scenarios.get("patterns") or [])
                    + (scenarios.get("low_confidence") or [])):
        priced.setdefault(pattern["lever"], pattern.get("priority"))
    return priced


def prepare_findings_projection(*, analysis: dict, exposures: dict,
                                scenarios: dict) -> FindingsProjection:
    """Construct the findings projection from its three published payloads.

    Building those products belongs to the callers that own their fixed cache paths.
    This seam keeps queue policy here while letting each guarded consumer share one
    canonical analysis, exposure feed, and scenario report per cache generation.
    """
    outcome_patterns = build_outcome_patterns(analysis, exposures, scenarios)
    return FindingsProjection(_analysis=analysis, _exposures=exposures,
                              _scenarios=scenarios,
                              _outcome_patterns=outcome_patterns)
