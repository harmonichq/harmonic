"""The Diagnose findings queue as a SERVER-OWNED window projection (#730).

The workstation's level 1 is one ranked findings queue (lock terms 34–45). Given an
explicit clock window — a pressed preset or a drawn brace — the queue re-scopes in
place, and *that scoping is decided here*, not in the browser: the caller sends a
window and receives the window's rows, already classified, merged, anchored, counted
and ordered. The frontend renders them verbatim and composes nothing (term 40).

Five registers, assigned by one mechanical rule and stamped on every row as
``register``:

* ``assert`` — a parameter whose backend evidence asserts a direction
  (``SlotEstimate.asserts_move`` for basal, ``IcBlock.asserts_move`` for I:C, and
  the ISF analyzer's own ``evidence.direction`` for ISF). ISF stageability is a
  separate explicit verdict carried beside this register. Contiguous asserting
  basal slots sharing a direction are ONE row named by its span (term 13).
* ``held`` — a parameter with a number but no assertion, carrying its hold reason
  transcribed **verbatim** from the analyzer (``safety_status`` / ``held_reason``).
  Contiguous held slots sharing a lean merge the same way.
* ``blind`` — a basal span with zero clean days, with the analyzer's own reason.
* ``finding`` — one row per behavioral finding NAME (term 35), carrying each family
  appearance's own window-local ``n of m`` denominators.
* ``history`` — an analyzer-published active past-setting measurement. It is
  non-actionable and carries the catalog's lifecycle, identity, support, and runs.

Under an explicit window all five registers can appear; the GLOBAL (24 h) queue
contains asserting current parameters plus active history — a quiet current
parameter is never listed (term 38).

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
priority desc, then unpriced asserting rows, then unpriced findings by count, then the
demoted held and blind registers. A Pattern admitted through its setting shares that
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
from datetime import datetime
from typing import Dict, List, Optional, Sequence, Tuple

from .analyzers.ic import BLOCK_WINDOW_DAYS
from .ic_history import decode_history_id
# `_chips_for` (#61) asks each lever what kind of anchor its consequence lands
# on. The sequence marker requires explicit witness membership while retaining
# the habit causes' highs/meals display chips.
from .analyzers.scenario.levers import Exposure, Lever, exposure, outcome_kind, title
from .analyzers.scenario.evidence_population import policy_for
from .analyzers.scenario.outcome_patterns import (
    _ROSTER, build_outcome_patterns, credited_claims, outcome_window_population,
    starts_in_harm_band,
)
from .harm import HarmConfig
from .safety import Status
from .window_membership import DAY_MINUTES, WindowQuery, outcome_minute

SCHEMA = "diagnose-findings-v2"


class UnknownHistorySelection(KeyError):
    """A canonical selection absent from the analyzer-published catalog."""

_SLOT_MINUTES = 30
# The Harm signal's overnight band, which the harm-band Pattern's counts cover.
_HARM_CONFIG = HarmConfig()

# The basal verdicts that WITHHOLD a move: the analyzer had something to say and
# declined to name a direction from it. `NO_CHANGE` is deliberately not among them —
# a slot whose delivery sits inside the noise floor of its programmed rate is quiet,
# and quiet is quiet (ledger D22): it is never listed, in any window.
_HELD_STATUSES = frozenset({str(Status.INSUFFICIENT), str(Status.HARM_GATED),
                            str(Status.NO_BASELINE)})
# No suggestion at all — the model saw no clean day in this slot.
_BLIND_STATUS = str(Status.NO_DATA)

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

# The one place the unexplained-highs sentence is written (#63). The operator-confirmed
# wording is "N highs had no cause detected by the app"; the ONLY thing that varies is
# the noun's number, because a surface that prints "1 highs" is a defect and inflecting
# a noun is not rewording a confirmed sentence. The count is substituted HERE,
# server-side, and the frontend renders the finished sentence verbatim — the same rule
# every other line on this surface follows (term 40). Highs-only scope is explicit in
# the words because the queue above it holds every family, and a bare "N had no cause"
# would read as a claim about all of them. "highs" is the family noun `_FAMILY_NOUN`
# already spells; the domain term for one of them is Occurrence, never "event"
# (CONTEXT.md).
UNCAUSED_HIGHS_COPY = "{n} {noun} had no cause detected by the app"

# The exposure family a queue row's denominator is counted in, and the noun it is
# counted with (term 16: every denominator names its own noun). Keyed by the family
# names `explore_exposures` emits.
_FAMILY_NOUN = {
    "lows": "lows",
    "highs": "highs",
    "meals": "meals",
    "correction_clusters": "correction clusters",
}

# Register order in the queue: asserting and counted rows share the ranked head,
# held and blind follow in the demoted register (term 38).
_REGISTER_RANK = {"assert": 0, "finding": 0, "held": 1, "blind": 2, "history": 3}

# ADR 0019 §2's closed five-state anchor taxonomy, the verdict band's own vocabulary
# (ADR 41). The frontend only labels these; it never derives membership or counts.
FINDING_VERDICTS = ("fired", "outranked", "near_miss", "no_data", "clean")
DIAGNOSE_SOURCE_WINDOW_DAYS = 30
PATTERN_SUBJECTS = frozenset(f"pattern:{key}" for key, *_ in _ROSTER)


def pattern_rate_family(pattern: dict) -> Exposure | None:
    """Return the one Exposure family the Pattern producer prices against."""
    family = next((row[5] for row in _ROSTER if row[0] == pattern.get("key")), None)
    return Exposure(family) if family in {item.value for item in Exposure} else None


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
    source = ((exposures.get("exposures") or {}).get(family.value) or {}) if family else {}
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
        self, query: WindowQuery, selected_id: Optional[str] = None, *,
        analysis_generation: str = "standalone:0",
    ) -> dict:
        rows = self._parameter_rows(query, scoped=query.scoped)
        rows += self._finding_rows(query)
        rows += self._history_rows(query)
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
                    for field in ("n", "k", "rate", "wilson", "readiness",
                                  "rate_producer", "overlap_counts", "harm_low_overlap")
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
        counts = {name: 0 for name in ("assert", "held", "blind", "finding", "history")}
        chip_counts = {name: 0 for name in ("highs", "lows", "meals", "corrections")}
        for row in rows:
            if row.get("claimed_by"):
                continue
            counts[row["register"]] += 1
            for chip in row["chips"]:
                chip_counts[chip] += 1
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
            "selection": self._selection(query, selected_id),
            # Keyed by the register name each row carries, so a count and a row can
            # never be read as two different vocabularies.
            "counts": counts,
            "chip_counts": chip_counts,
            "uncaused_highs": self._uncaused_highs(),
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

    def _selection(self, query: WindowQuery, selected_id: Optional[str]) -> Optional[dict]:
        if selected_id is None:
            return None
        decode_history_id(selected_id)
        history = next(
            (row for row in self._analysis.get("ic_history") or []
             if row.get("id") == selected_id),
            None,
        )
        if history is None:
            raise UnknownHistorySelection(selected_id)
        lifecycle = history["lifecycle"]
        messages = {
            "aged_out": "Past-setting evidence aged out of the 90-day window.",
            "unavailable": (
                "Past-setting evidence no longer maps to one current program block."
            ),
        }
        if lifecycle == "active":
            in_scope = (not query.scoped or query.overlaps(
                history["block_start_min"], history["block_end_min"]))
            disposition = "present" if in_scope else "out_of_scope"
            message = (None if in_scope else
                       "Past-setting evidence is outside the selected window.")
        else:
            disposition = lifecycle
            message = messages[lifecycle]
        return {"id": selected_id, "disposition": disposition, "message": message}

    def guidance(self, *, active_watch=None, preferences=(),
                 analysis_generation: str = "standalone:0") -> dict:
        """Build unfiltered guidance from this projection's coherent owner inputs."""
        from .guidance import build_guidance
        return build_guidance(
            analysis=self._analysis, exposures=self._exposures, scenarios=self._scenarios,
            preferences=preferences, active_watch=active_watch,
            generation=analysis_generation,
            window={"days": self._analysis.get("window_days"),
                    **(self._exposures.get("window") or {})},
        )

    def _history_rows(self, query: WindowQuery) -> List[dict]:
        """Active analyzer-published past-setting measurements in this clock scope."""
        rows = []
        for history in self._analysis.get("ic_history") or []:
            if history.get("lifecycle") != "active":
                continue
            start_min = history["block_start_min"]
            end_min = history["block_end_min"]
            if query.scoped and not query.overlaps(start_min, end_min):
                continue
            label = history["label"]
            rows.append(_row(
                id=history["id"], register="history", kind="setting",
                parameter="carb_ratio",
                title=f"Carb ratio {label}. Past setting.",
                label=label,
                span={"start_min": start_min, "end_min": end_min,
                      "label": _span_label(start_min, end_min)},
                past_setting=history["past_setting"],
                programmed_now=history["programmed_now"],
                estimate=history["estimate"], support=history["support"],
                regime_end=history.get("regime_end"),
                run_ids=[run["run_id"] for run in history.get("runs") or []],
                annotation=history.get("annotation"),
            ))
        return rows

    def _uncaused_highs(self) -> dict:
        """The whole-window count of highs the engine explained nothing about, and the
        finished sentence that reports it (#63).

        **Deliberately not scoped by the query.** Every other number on this surface
        answers "in this window", and this one answers "in the findings window" — the
        30 days the queue was built over. A clock scope narrows which rows are shown;
        it does not change how many highs went unexplained, and re-counting it per
        window would let an empty scope read as "0 highs had no cause", which is the
        opposite of what happened.

        Read straight off the exposures feed, which counts it episode-wise and leaves
        out every High an over-treated low's rebound owns (ADR 422,
        :func:`~.explore_exposures.build_exposures`); nothing is re-derived here, the
        same way no row's membership is. ``text`` is ``None`` at zero so the surface
        has one thing to test and no threshold of its own — a count with nothing to
        report publishes no sentence.
        """
        highs = (self._exposures.get("exposures") or {}).get("highs") or {}
        n = highs.get("uncaused") or 0
        text = (UNCAUSED_HIGHS_COPY.format(n=n, noun="high" if n == 1 else "highs")
                if n else None)
        return {"count": n, "text": text}

    # --- parameters: asserting / held / blind ---------------------------------

    def _parameter_rows(self, query: WindowQuery, *, scoped: bool) -> List[dict]:
        rows = self._basal_rows(query) + self._ic_rows(query) + self._isf_rows()
        if not scoped:
            # The global queue is asserting-only: a quiet parameter is never listed
            # and never named (term 38).
            rows = [row for row in rows if row["register"] == "assert"]
        return rows

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
        spans: List[Tuple[Tuple[str, Optional[str]], List[dict]]] = []
        for slot in slots:
            key = _basal_key(slot)
            if key is None:  # quiet: never listed, and it breaks any run it sits in
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
            register, direction = key
            head = span[0]
            single = len(span) == 1
            label = _span_label(start_min, end_min)
            rows.append(_row(
                id=f"basal:{start_min}-{end_min}",
                register=register,
                kind="setting",
                parameter="basal_rate",
                title=_title(f"Basal {label}", register, direction),
                label=label,
                priority=(self._lever_priority("basal_rate")
                          if register == "assert" else None),
                span={"start_min": start_min, "end_min": end_min, "label": label},
                direction=direction if register == "assert" else None,
                lean=direction if register == "held" else None,
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
                # Verbatim, both of them: the cap() verdict string and the
                # analyzer's own sentence. Neither is rewritten here.
                reason=head.get("safety_status") if register != "assert" else None,
                annotation=head.get("annotation"),
            ))
        return rows

    def _ic_rows(self, query: WindowQuery) -> List[dict]:
        rows = []
        for block in self._analysis.get("ic_blocks") or []:
            start_min, end_min = block["start_min"], block["end_min"]
            if not query.overlaps(start_min, end_min):
                continue
            asserts = bool(block.get("asserts_move"))
            estimate = block.get("estimate") or {}
            # `held_reason` IS the I:C hold predicate (#523): the analyzer sets it
            # exactly when a numeric block's band excludes the programmed value and a
            # gate withheld the move. A block whose band agrees, or that is still
            # collecting, is quiet — never re-derived here from the band.
            if not asserts and not block.get("held_reason"):
                continue
            register = "assert" if asserts else "held"
            label = _span_label(start_min, end_min)
            direction = (block.get("direction") if asserts
                         else _lean(block.get("current"), estimate.get("value")))
            rows.append(_row(
                id=f"ic:{block['block_id']}",
                register=register,
                kind="setting",
                parameter="carb_ratio",
                title=_title(f"Carb ratio {label}", register, direction),
                label=block.get("label"),
                priority=(self._lever_priority("carb_ratio") if asserts else None),
                span={"start_min": start_min, "end_min": end_min, "label": label},
                direction=direction if asserts else None,
                lean=direction if not asserts else None,
                current=block.get("current_values", [None])[0]
                if block.get("current_values") else None,
                recommended=block.get("recommended"),
                estimate=estimate,
                support={"n": block.get("n_runs"), "noun": "meal runs",
                         "run_days": BLOCK_WINDOW_DAYS},
                reason=(block.get("held_reason") or block.get("annotation")
                        if not asserts else None),
                annotation=block.get("annotation"),
            ))
        return rows

    def _isf_rows(self) -> List[dict]:
        """ISF is one value for the whole day (term 31), so it meets every window.

        Its register decision is the analyzer's own ``evidence.direction`` — never
        re-derived from the band and the programmed value. Its independent staging
        decision is copied from ``asserts_move``.

        Unlike basal, a no-direction ISF with a number is HELD rather than quiet: the
        parameter is one row for the whole day and its analyzer always says in words
        why it is not moving (a band spanning the programmed value included), where a
        basal slot inside its noise floor has nothing to say and there are 47 more of
        them. Term 31's amendment expects exactly this row under an explicit window.
        """
        rows = []
        for row in self._analysis.get("isf") or []:
            evidence = row.get("evidence") or {}
            direction = evidence.get("direction")
            estimate = row.get("estimate") or {}
            if direction is None and estimate.get("value") is None:
                continue
            register = "assert" if direction is not None else "held"
            rows.append(_row(
                id="isf",
                register=register,
                kind="setting",
                parameter="isf",
                title=_title("Correction factor", register, direction),
                label=row.get("label"),
                priority=(self._lever_priority("isf")
                          if row.get("asserts_move") is True else None),
                span=None,
                direction=direction,
                asserts_move=row.get("asserts_move"),
                lean=None,
                current=row.get("current"),
                recommended=row.get("recommended"),
                estimate=estimate,
                support={"n": len(evidence.get("night_fits") or []),
                         "noun": "fasting nights",
                         "run_days": self._analysis.get("window_days")},
                reason=row.get("annotation") if direction is None else None,
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
        all_occurrences: Dict[str, List[dict]] = {}
        for family, payload in families.items():
            all_occurrences[family] = list(payload.get("occurrences") or [])
            kept = [
                occurrence for occurrence in all_occurrences[family]
                if query.contains(outcome_minute(occurrence, self._exposures))
            ]
            in_window[family] = kept

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
        patterns = {
            row.get("lever"): row
            for row in ((self._scenarios.get("patterns") or [])
                        + (self._scenarios.get("low_confidence") or []))
        }
        rows = []
        for lever, entry in by_lever.items():
            policy = policy_for(lever)
            recurrence_account = policy.projected_recurrence_account(
                lever, in_window, all_occurrences, patterns.get(lever) or {},
            )
            if recurrence_account is not None:
                occurrence_ids, denominator = recurrence_account
                entry["appearances"] = [{
                    "family": policy.recurrence_noun,
                    "noun": policy.recurrence_noun,
                    "n": len(occurrence_ids),
                    "m": denominator,
                }]
                # This lever's recurrence identity is the eligible meal event, not
                # each high episode it can produce.  The policy-owned groups retain
                # their member episodes in the scenario payload; this served row
                # counts the same occurrences its denominator and case file use.
                entry["episodes"] = occurrence_ids
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
        for lever in self._exposures.get("sequence_evidence") or {}:
            if lever not in patterns:
                continue
            population = sequence_population(self._exposures, lever, query)
            claimed = [item for item in population if item["attributed"]]
            if not claimed:
                continue
            counts = {state: sum(item["verdict"] == state for item in population)
                      for state in FINDING_VERDICTS}
            response = ((self._exposures.get("sequence_evidence") or {}).get(lever) or {}).get("response")
            rows.append(_row(
                id=f"finding:{lever}", register="finding", kind="habit", lever=lever,
                title=title(Lever(lever)), priority=priced.get(lever),
                appearances=[{"family": "sequences", "noun": "sequences",
                              "n": len(claimed), "m": len(population)}],
                episodes=len(claimed), evidence=population,
                verdict_counts=counts, verdict_counts_by_family={"sequences": counts},
                event_chart={"lever": lever, "window": query.to_dict()},
                response_headline=("Glucose during high-carb eating"
                                   if response["period"] == "in_sequence"
                                   else "Glucose after high-carb eating") if response is not None else None,
            ))
        return rows


def sequence_population(exposures: dict, lever: str, query: WindowQuery) -> List[dict]:
    """Project the producer's eligible identities and witnessed episode matches.

    A sequence counts once even when several episodes match. References have no
    outcome witness and remain in the whole-source population only. Clock-scoped
    rosters include exactly the sequences with a witnessed match in that window.
    Losing matches still meet this row's criteria; only winners are attributed.
    """
    evidence = (exposures.get("sequence_evidence") or {}).get(lever) or {}
    matches = {}
    for occurrence in evidence.get("occurrences") or ():
        minute = outcome_minute({**occurrence, "cause_lever": lever}, exposures)
        if minute is not None and (not query.scoped or query.contains(minute)):
            matches.setdefault(occurrence["id"], []).append(occurrence)
    result = []
    for record in evidence.get("population") or ():
        episodes = matches.get(record["id"], [])
        if query.scoped and not episodes:
            continue
        winners = [episode for episode in episodes if episode["attributed"]]
        result.append({
            "id": record["id"], "sequence": deepcopy(record),
            "episodes": deepcopy(episodes), "attributed": bool(winners),
            "outcome_minute": (winners or episodes)[0]["outcome_minute"] if episodes else None,
            "verdict": "fired" if episodes else "clean",
        })
    return result


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


def _basal_key(slot: dict) -> Optional[Tuple[str, Optional[str]]]:
    """A slot's ``(register, direction)`` — the pair contiguous slots merge on — or
    ``None`` for a quiet slot, which is no row at all.

    Asserting is read first, so a zero-clean-day slot the harm layer moved down reads
    as the move it is rather than as blind.
    """
    if slot.get("asserts_move"):
        return "assert", slot.get("direction")
    status = slot.get("safety_status")
    if status == _BLIND_STATUS:
        return "blind", None
    if status in _HELD_STATUSES:
        lean = _lean(slot.get("current"), (slot.get("estimate") or {}).get("value"))
        if lean == "lower" and ((slot.get("evidence") or {}).get("harm")
                                or {}).get("nudged"):
            # ADR 465: recurring lows held a step down too small to take; the
            # served sentence names the lows, so the title names no lean.
            lean = None
        return "held", lean
    return None


def _lean(current: Optional[float], value: Optional[float]) -> Optional[str]:
    """Which way a held estimate sits against the programmed value.

    A lean is not a direction: nothing asserts here, and the queue prints it as
    "leaning raise" (term 14). It is computed on the server for the same reason the
    direction is — the frontend derives neither (#273/#465). A held basal slot the
    recurring lows nudged drops a "lower" lean (``_basal_key``, ADR 465): its
    served sentence already names the lows, and it never reads "leaning lower".
    """
    if current is None or value is None or value == current:
        return None
    return "raise" if value > current else "lower"


def _title(name: str, register: str, direction: Optional[str]) -> str:
    if direction is None:
        return name
    if register == "held":
        return f"{name} · leaning {direction}"
    return f"{name} · {direction}"


# --- headlines: one served sentence per row (#306 ADR "Every findings row carries
# one served headline") -----------------------------------------------------------
#
# Templates are the operator's, ruled in the attended round of 2026-09-03 and
# recorded under `## Headline templates` in `design.md`. A slot names only a
# served row field — every family's, correction factor included: the ISF
# rest-window evidence is never a source. Nothing here recounts raw records or
# re-derives a direction, floor, threshold or priority; a held or blind
# sentence reads the served hold reason verbatim.

_BASAL_BLIND_HEADLINE = (
    "No steady nights delivered against the programmed rate here, "
    "so nothing to say either way."
)

_HELD_AT_CURRENT_SUFFIX = "; held at current"

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
    """A basal direction or lean, spelled as the headline's own vocabulary."""
    return None if word is None else {"raise": "above", "lower": "below"}[word]


def _sentence(text: str) -> str:
    """A served analyzer fragment (lowercase-initial user copy), capitalized to
    open a new sentence — the fragment itself is never reworded (#306 ADR: "a
    held's sentence reads the served hold reason verbatim")."""
    return text[:1].upper() + text[1:] if text else text


def _basal_headline(row: dict) -> str:
    if row["register"] == "blind":
        # Rate-free for single and merged rows alike: a blind row has no
        # delivered value to set against it.
        return _BASAL_BLIND_HEADLINE
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
    # row's own served direction or lean and the steady-night count.
    if row["register"] == "assert":
        word = _below_above(row.get("direction"))
        return (f"{annotation}. Delivered {word} the programmed rate across "
                f"{support_n} steady nights.")
    lean = row.get("lean")
    if lean is None:
        # The held estimate sits at the programmed rate, or is absent: nothing
        # to lean the sentence on but the count.
        return f"{annotation}. {support_n} steady nights delivered so far."
    word = _below_above(lean)
    return (f"{annotation}. Delivered {word} the programmed rate across "
            f"{support_n} steady nights.")


def _isf_headline(row: dict) -> str:
    """Correction factor's headline: every slot is a row field (`support.n`,
    `current`, `estimate.value`, `annotation`, `reason`) — the ISF rest-window
    evidence is never a source, so this reads only the row, like every other
    family."""
    support_n = (row.get("support") or {}).get("n")
    current = _fmt_precision(row.get("current"))
    if row["register"] == "assert":
        estimate_value = _fmt_precision((row.get("estimate") or {}).get("value"))
        annotation = _sentence(row.get("annotation") or "")
        return (f"{annotation}. Measured 1 U : {estimate_value} mg/dL across "
                f"{support_n} fasting nights against 1 U : {current} mg/dL "
                f"programmed.")
    reason = row.get("reason") or ""
    if current is None:
        return f"No direction is called: {reason}. {support_n} fasting nights measured."
    return (f"No direction is called: {reason}. {support_n} fasting nights "
            f"measured against 1 U : {current} mg/dL programmed.")


def _ic_headline(row: dict) -> str:
    support_n = (row.get("support") or {}).get("n")
    current = _fmt_precision(row.get("current"))
    estimate_value = _fmt_precision((row.get("estimate") or {}).get("value"))
    against_current = f" against {current} programmed" if current is not None else ""
    if row["register"] == "assert":
        annotation = _sentence(row.get("annotation") or "")
        return (f"{annotation}. Measured {estimate_value} g/U across "
                f"{support_n} meal runs{against_current}.")
    reason = (row.get("reason") or "").removesuffix(_HELD_AT_CURRENT_SUFFIX)
    return (f"Held at current: {reason}. Measured {estimate_value} g/U across "
            f"{support_n} meal runs{against_current}.")


def _finding_headline(row: dict) -> str:
    # `_finding_rows` never publishes a row without one: `by_lever[lever]` is
    # only created in the same iteration that appends its first appearance
    # (`findings_projection.py`'s `_finding_rows`), and the recurrence branch
    # replaces the list with exactly one element, never empties it.
    if row.get("response_headline") is not None:
        return row["response_headline"]
    appearance = row["appearances"][0]
    verdict = ("Ranks among this window's findings" if row.get("tier") in _RANKING_TIERS
               else "Not ranked in this window yet")
    return (f"{verdict}. Showed up in {appearance['n']} of {appearance['m']} "
            f"{appearance['noun']} in this window.")


def _history_headline(row: dict) -> str:
    estimate_value = _fmt_precision((row.get("estimate") or {}).get("value"))
    support = row.get("support")
    past_setting = _fmt_precision(row.get("past_setting"))
    programmed_now = _fmt_precision(row.get("programmed_now"))
    regime_end = row.get("regime_end")
    regime_end_date = regime_end.split("T")[0] if regime_end else regime_end
    return (f"Past setting, no change suggested. Measured {estimate_value} g/U "
            f"across {support} meal runs while {past_setting} was programmed, "
            f"until {regime_end_date}. Programmed now: {programmed_now}.")


def _pattern_noun(pattern: dict) -> str:
    """The noun a Pattern's own k-of-n count is denominated in — shared by
    ``headline`` and the count sentence so the two can never name a different
    noun for the same row."""
    if pattern["rate_producer"] == "harm_band_source_nights":
        return "nights"
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
    if row["register"] == "history":
        return _history_headline(row)
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
# The frontend's own Pattern word constant (`PATTERN_COPY` in
# frontend/diagnose-findings-queue.js) still exists as of this commit — this
# table is its backend replacement, not yet its deletion, which belongs to the
# rail work that reads served words instead (#413 tasks 3.3).

_PATTERN_OUTCOME = {
    "highs_after_meals": "ran high",
    "lows_after_meals": "ran low",
    "highs_after_treating_lows": "rebounded high",
    "lows_after_correcting_highs": "followed a correction",
    "overnight_lows_no_iob": "ran low overnight",
}

_CAUSE_OUTCOME = {
    # Closed over the code-derived cross product (coordinator decision, #413 review
    # round 2): every `Lever` member (levers.py) x every family a Cause appearance
    # can be filed under — the four exposure families `explore_exposures._FAMILY_FOR_KIND`
    # names (lows / meals / highs / correction_clusters), plus a lever's own
    # recurrence/sequence family when `evidence_population.policy_for(lever)` (or,
    # for the two sequence levers, `_finding_rows`'s dedicated sequence branch)
    # restricts it there in code. Never widened or narrowed from fixture output.
    #
    # carb_undercount, late_bolus, meal_over_delivery, over_treated_low,
    # correction_stacking, correction_on_iob and missed_meal all have
    # `recurrence_family is not None` (an "ordinary" or ordinary-shaped policy), so
    # `_finding_rows` never overrides their appearances — each can be filed under
    # any of the four exposure families and gets one entry per family.
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
    # meal_bolus_short: `evidence_population._POLICIES[Lever.MEAL_BOLUS_SHORT]` sets
    # `recurrence_family=None`, so `_finding_rows`'s override unconditionally
    # replaces its appearances with the one `recurrence_noun` family ("meals") —
    # never any of the four exposure families.
    ("meal_bolus_short", "meals"): "needed a correction after",
    # high_carb_sequence / repeat_eating: `model_view._is_driver` excludes every
    # `SEQUENCE_LEVERS` member from ever being attributed on an exposure-family
    # anchor, so `_finding_rows`'s dedicated sequence branch is their only source
    # of appearances, always filed under the one hardcoded "sequences" family.
    ("high_carb_sequence", "sequences"): "ran less in range",
    ("repeat_eating", "sequences"): "ran less in range",
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
    own gating so the two fields never disagree about which rows carry counts.

    In a scoped window the harm-band Pattern keeps its whole-band counts, so its
    outcome names the band rather than the window (ADR 467 decision 3)."""
    pattern = row["pattern"]
    if pattern.get("count_status") or pattern["admission_route"] == "none":
        return None
    noun = _pattern_noun(pattern)
    key = pattern["key"]
    if key not in _PATTERN_OUTCOME:
        raise ValueError(f"no outcome word for pattern {key!r}")
    outcome = _PATTERN_OUTCOME[key]
    if (pattern["rate_producer"] == "harm_band_source_nights"
            and row["window_scope"] == "window"):
        outcome = (f"ran low between {_hhmm(_HARM_CONFIG.overnight_start_min)} "
                   f"and {_hhmm(_HARM_CONFIG.overnight_end_min)}")
    return [_count_sentence(pattern["k"], pattern["n"], noun, outcome)]


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
    "overnight_lows_no_iob": ("lows",),
}


def _chips_for(row: dict) -> List[str]:
    """The filter chips a serialized queue row belongs under."""
    if row["register"] in ("held", "blind", "history"):
        return []
    if row["register"] == "assert":
        return list(_SETTINGS_CHIPS[(row["parameter"], row["direction"])])
    if row["kind"] == "pattern":
        return list(_PATTERN_CHIPS[row["pattern"]["key"]])

    chips = []
    kind = outcome_kind(row["lever"])
    if kind == "sequence":
        return ["highs", "meals"]
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
        "lean": None, "current": None, "recommended": None, "estimate": None,
        "support": None, "reason": None, "annotation": None, "members": None,
        "lever": None, "appearances": None, "episodes": None,
        "evidence": None, "verdict_counts": None, "verdict_counts_by_family": None,
        "chips": None, "window_scope": None, "count_sentences": None, "fold_sentences": None,
        "past_setting": None, "programmed_now": None, "regime_end": None,
        "run_ids": None, "event_chart": None,
        "pattern": None, "pattern_chart": None, "claimed_by": None,
        "anchored_by": None, "rank_note": None,
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
    Priority. The harm-band Pattern anchors only to such a row whose span starts
    inside the Harm signal's overnight band, by the rule that admitted it
    (``starts_in_harm_band``), never beneath a daytime basal row.
    With none served (a scoped window without the setting's row) the Pattern keeps
    its own ranked position. Its own ``priority`` stays the roster's price (ADR 391).
    """
    for pattern_row in pattern_rows:
        pattern = pattern_row["pattern"]
        if pattern["admission_route"] != "setting_staging":
            continue
        member = next(item for item in pattern["members"] if item["kind"] == "setting")
        parameter = member["subject"].removeprefix("setting:")
        in_band = pattern["rate_producer"] == "harm_band_source_nights"
        anchors = [row for row in rows
                   if row["register"] == "assert" and row["parameter"] == parameter
                   and row["priority"] is not None
                   and (not in_band or starts_in_harm_band(row["span"]))]
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
    unpriced asserting rows, then unpriced findings by count desc, then the demoted
    held and blind registers in clock order (terms 22 / 38). A row anchored to a
    setting, or claimed by a Pattern, sorts directly after its parent, recursively,
    so a claimed cause follows its anchored Pattern. Every tie falls through to a
    stable, data-derived key so two runs of the same window always return the same
    list."""
    span = row.get("span") or {}
    history_recency = 0.0
    if row["register"] == "history" and row.get("regime_end"):
        try:
            history_recency = datetime.fromisoformat(row["regime_end"]).timestamp()
        except ValueError:
            pass
    key = (
        _REGISTER_RANK[row["register"]],
        0 if row["priority"] is not None else 1 if row["register"] == "assert" else 2,
        -(row["priority"] or 0),
        -(row["episodes"] or 0),
        span.get("start_min", DAY_MINUTES),
        -history_recency,
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
