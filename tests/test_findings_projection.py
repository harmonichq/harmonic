"""The Diagnose findings queue's server-owned window projection (#730).

Everything here goes through the public interface — ``FindingsProjection.project``
and ``GET /diagnose/findings`` — over the committed generator's own inputs, so a test
can never encode a verdict the engines did not produce (the #273/#465 lesson: the
fixture that hand-sets the predicate under test stays green while the product is
wrong).
"""

import importlib.util
import json
import pathlib
import random
import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

from ciq_autotune.analyzers.isf import analyze_isf
from ciq_autotune.analyzers.scenario.levers import Lever, outcome_kind
from ciq_autotune.analyzers.scenario.outcome_patterns import _ROSTER, outcome_window_population
from ciq_autotune.analyzers.tuning_priority import build_tuning_levers
from ciq_autotune.explore_exposures import _FAMILY_FOR_KIND
from ciq_autotune.findings_projection import (
    _CAUSE_OUTCOME,
    _EVENT_CHART_FAMILIES,
    _headline_for,
    _PATTERN_CHIPS,
    _PATTERN_OUTCOME,
    _chips_for,
    _row as projection_row,
    FindingsProjection,
    PATTERN_SUBJECTS,
    WindowQuery,
    pattern_chartable,
    prepare_findings_projection,
)
from ciq_autotune.event_comparison import FACTOR_LABELS
from ciq_autotune.events import BolusEvent
from ciq_autotune.harm import HarmArm, HarmConfig, PrintedLow
from ciq_autotune.safety import Status
from ciq_autotune.store import Store
from ciq_autotune.ic_history import (
    HistoryIdentity, RunIdentity, encode_history_id, encode_run_id,
)
from ciq_autotune.result import IcHistory, IcHistoryRunRecord
from ciq_autotune.uncertainty import Estimate
from ciq_autotune.window_membership import DAY_MINUTES
from ciq_autotune.analyzers.basal import analyze_basal
from tests.test_analyzer_isf import ISF_36, rw, synth_night
from tests.test_harm_basal_arm import _build

_GEN_PATH = (pathlib.Path(__file__).resolve().parents[1]
             / "scripts" / "gen_findings_projection_fixtures.py")
_spec = importlib.util.spec_from_file_location("gen_findings_projection_fixtures",
                                               _GEN_PATH)
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)

LOW_BLOCK = (12 * 60, 14 * 60)
REBOUND = (14 * 60, 16 * 60)
MORNING = (4 * 60 + 30, 8 * 60)
AFTERNOON = (14 * 60, 21 * 60)


def _titles(rows, register):
    return [row["title"] for row in rows if row["register"] == register]


def _row(rows, title):
    return next(row for row in rows if row["title"] == title)


def _direction_only_isf_analysis(base_analysis=None):
    rng = random.Random(7)
    plans = [[(1, 0, 3.0)], [(2, 0, 4.0), (4, 0, 2.0)], [(1, 30, 5.0)],
             [(3, 0, 3.5)], [(0, 30, 2.0), (3, 30, 4.0)], [(2, 0, 6.0)],
             [(1, 0, 3.0), (4, 30, 2.5)], [(2, 30, 5.0)]]
    bolus, basal, cgm, windows = [], [], [], []
    for index, plan in enumerate(plans):
        b, ba, c = synth_night(index + 1, 58.0, plan, noise_sd=1.0, rng=rng)
        bolus += b
        basal += ba
        cgm += c
        windows += rw(index + 1)
    bolus += [
        BolusEvent(t=datetime(2026, 6, day, hour), insulin=2.0, bg=220.0)
        for day in range(1, 31) for hour in (9, 12, 15, 18)
    ]
    lows = [PrintedLow(datetime(2026, 6, day, 3), 55.0, 1.2, HarmArm.ISF)
            for day in (1, 5, 9, 13)]
    segments = analyze_isf(
        bolus, basal, cgm, ISF_36, rest_windows=windows,
        harm_config=HarmConfig(), harm_lows=lows, window_days=30,
    )
    lever = next(lever for lever in build_tuning_levers(
        [], segments, [], slot_minutes=30, robust_daily_insulin_u=42.0,
    ) if lever.parameter == "isf")
    analysis = dict(base_analysis or {"window_days": 30})
    analysis["isf"] = [segment.to_dict() for segment in segments]
    analysis["tuning_levers"] = [
        *[item for item in analysis.get("tuning_levers", [])
          if item["parameter"] != "isf"],
        lever.to_dict(),
    ]
    return analysis, segments[0], lever


def _with_history(projection, *, lifecycle="active", start_min=420,
                  end_min=720, regime_end="2026-08-01T12:00:00", runs=None,
                  past_setting=5.0,
                  annotation="Analyzer-owned history conclusion."):
    history = IcHistory(
        history_id=encode_history_id(
            HistoryIdentity(start_min, end_min, past_setting)),
        block_start_min=start_min, block_end_min=end_min, label="Breakfast",
        past_setting=past_setting,
        programmed_now=None if lifecycle == "unavailable" else 6.0,
        estimate=(None if lifecycle != "active" else
                  Estimate(value=4.6, lo=4.4, hi=4.8, n=3, method="clustered")),
        support=3 if lifecycle == "active" else None,
        annotation=annotation if lifecycle == "active" else None,
        lifecycle=lifecycle, regime_end=regime_end, runs=list(runs or []),
    )
    analysis = dict(projection._analysis)
    analysis["ic_history"] = [*(analysis.get("ic_history") or []), history.to_dict()]
    return FindingsProjection(analysis, projection._exposures, projection._scenarios,
                              projection._outcome_patterns), history


class HistoryRowsTest(unittest.TestCase):
    def test_active_history_is_a_non_actionable_noted_row_in_v2(self):
        projection, history = _with_history(gen.empty_projection())

        result = projection.project(
            WindowQuery.whole_day(), analysis_generation="fixture-process:0")
        row = next(row for row in result["rows"] if row["id"] == history.history_id)

        self.assertEqual(result["schema"], "diagnose-findings-v2")
        self.assertEqual(result["analysis_generation"], "fixture-process:0")
        self.assertEqual(result["counts"]["history"], 1)
        self.assertEqual((row["register"], row["kind"], row["parameter"]),
                         ("history", "setting", "carb_ratio"))
        self.assertEqual((row["priority"], row["tier"], row["chips"]),
                         (None, "noted", []))
        self.assertEqual((row["past_setting"], row["programmed_now"], row["support"]),
                         (5.0, 6.0, 3))
        self.assertEqual(row["annotation"], history.annotation)
        for field in ("recommended", "direction", "lean"):
            self.assertIsNone(row[field])

    def test_selection_dispositions_come_from_the_catalog_lifecycle(self):
        active, active_row = _with_history(gen.empty_projection())
        aged, aged_row = _with_history(active, lifecycle="aged_out", start_min=720,
                                       end_min=900)
        unavailable, unavailable_row = _with_history(
            aged, lifecycle="unavailable", start_min=900, end_min=1080)

        self.assertIsNone(unavailable.project(WindowQuery.whole_day())["selection"])
        cases = (
            (active_row.history_id, WindowQuery.whole_day(), "present", None),
            (active_row.history_id, WindowQuery.clock(0, 300), "out_of_scope",
             "Past-setting evidence is outside the selected window."),
            (aged_row.history_id, WindowQuery.whole_day(), "aged_out",
             "Past-setting evidence aged out of the 90-day window."),
            (unavailable_row.history_id, WindowQuery.whole_day(), "unavailable",
             "Past-setting evidence no longer maps to one current program block."),
        )
        for selected_id, query, disposition, message in cases:
            with self.subTest(disposition=disposition):
                self.assertEqual(
                    unavailable.project(query, selected_id)["selection"],
                    {"id": selected_id, "disposition": disposition,
                     "message": message},
                )

    def test_history_scope_and_order_are_server_owned(self):
        projection, older = _with_history(
            gen.empty_projection(), regime_end="2026-07-01T12:00:00",
            past_setting=5.0)
        projection, newer = _with_history(
            projection, regime_end="2026-08-01T12:00:00", past_setting=5.5)
        projection, later_block = _with_history(
            projection, start_min=900, end_min=1080,
            regime_end="2026-08-10T12:00:00", past_setting=6.5)

        global_history = [row for row in projection.project(
            WindowQuery.whole_day())["rows"] if row["register"] == "history"]
        scoped_history = [row for row in projection.project(
            WindowQuery.clock(400, 500))["rows"] if row["register"] == "history"]

        self.assertEqual([row["id"] for row in global_history],
                         [newer.history_id, older.history_id, later_block.history_id])
        self.assertEqual([row["id"] for row in scoped_history],
                         [newer.history_id, older.history_id])

        mixed = gen.projection().project(WindowQuery.clock(270, 480))["rows"]
        history_at = next(i for i, row in enumerate(mixed)
                          if row["register"] == "history")
        demoted = [i for i, row in enumerate(mixed)
                   if row["register"] in ("held", "blind")]
        self.assertTrue(demoted)
        self.assertGreater(history_at, max(demoted))


class OutcomeAnchoredMembershipTest(unittest.TestCase):
    """Term 39 / D34: a finding sits where its consequence landed, never where its
    trigger crossed a threshold."""

    def setUp(self):
        self.projection = gen.projection()
        self.exposures = gen.exposures()["exposures"]

    def _lows_occurrence(self):
        return next(o for o in self.exposures["lows"]["occurrences"]
                    if o["cause_lever"] == Lever.OVER_TREATED_LOW.value)

    def test_the_trigger_really_does_sit_inside_the_low_window(self):
        # The premise of the next test: anchoring on the stored occurrence time —
        # what the frontend used to do — WOULD put this finding in the low window.
        stamp = self._lows_occurrence()["t"]
        trigger = int(stamp[11:13]) * 60 + int(stamp[14:16])
        self.assertTrue(LOW_BLOCK[0] <= trigger < LOW_BLOCK[1],
                        f"the low fires at {stamp}, inside the drawn low block")

    def test_a_window_over_the_low_block_excludes_over_treated_low(self):
        rows = self.projection.project(WindowQuery.clock(*LOW_BLOCK))["rows"]
        self.assertNotIn("Over-treated low", _titles(rows, "finding"))

    def test_the_window_over_the_rebound_includes_it(self):
        rows = self.projection.project(WindowQuery.clock(*REBOUND))["rows"]
        self.assertIn("Over-treated low", _titles(rows, "finding"))

    def test_trigger_anchoring_would_fail_this(self):
        # The falsification: strip the per-lever outcome declaration and the
        # projection falls back to each occurrence's own instant — trigger
        # anchoring — which puts the finding right back in the low block. This test
        # is what stops the anchoring rule from being quietly removed.
        from unittest.mock import patch

        import ciq_autotune.window_membership as module

        next(
            occurrence
            for occurrence in self.projection._exposures["exposures"]["lows"]["occurrences"]
            if occurrence["cause_lever"] == Lever.OVER_TREATED_LOW.value
        ).pop("outcome_minute")
        with patch.object(module, "outcome_kind", lambda lever: None):
            rows = self.projection.project(WindowQuery.clock(*LOW_BLOCK))["rows"]
        self.assertIn("Over-treated low", _titles(rows, "finding"))

    def test_the_rebound_is_where_the_high_anchor_sits_not_the_low(self):
        fired = self._lows_occurrence()
        rebound = next(o for o in self.exposures["highs"]["occurrences"]
                       if o["ep_id"] == fired["ep_id"])
        self.assertEqual(rebound["ep_id"], fired["ep_id"])
        minute = int(rebound["t"][11:13]) * 60 + int(rebound["t"][14:16])
        self.assertTrue(REBOUND[0] <= minute < REBOUND[1])

    def test_every_lever_declares_where_its_consequence_lands(self):
        # The closed set stays closed: a new lever has to answer the anchoring
        # question rather than silently falling back to its trigger.
        for lever in Lever:
            self.assertIn(outcome_kind(lever), {"low", "high", "meal", "correction"},
                          f"{lever.value} declares no outcome anchor")

    def test_a_family_denominator_never_undercounts_what_it_denominates(self):
        for bounds in (None, LOW_BLOCK, REBOUND, MORNING, AFTERNOON, (22 * 60, 2 * 60)):
            query = (WindowQuery.whole_day() if bounds is None
                     else WindowQuery.clock(*bounds))
            for row in self.projection.project(query)["rows"]:
                for appearance in row["appearances"] or []:
                    self.assertLessEqual(appearance["n"], appearance["m"],
                                         f"{row['title']} in {bounds}")


class CountSentenceTest(unittest.TestCase):
    """#413: the served count sentence beside ``headline``, from one closed
    outcome table — a new field, never a rebuild of ``headline`` (#413 ADR "The
    backend serves the count sentence")."""

    def setUp(self):
        self.projection = gen.projection()

    def test_every_pattern_key_has_exactly_one_outcome_entry(self):
        roster_keys = {row[0] for row in _ROSTER}
        self.assertEqual(set(_PATTERN_OUTCOME), roster_keys)

    def test_the_two_meals_patterns_serve_different_outcomes(self):
        # highs_after_meals and lows_after_meals are both counted in meals and
        # must not share a word: a family cannot be the key.
        self.assertNotEqual(_PATTERN_OUTCOME["highs_after_meals"],
                            _PATTERN_OUTCOME["lows_after_meals"])

    def test_a_two_family_cause_serves_two_sentences_agreeing_with_its_appearances(self):
        rows = self.projection.project(WindowQuery.whole_day())["rows"]
        row = next(r for r in rows if r.get("lever") == "carb_undercount")
        self.assertEqual(len(row["appearances"]), 2)
        self.assertEqual(len(row["count_sentences"]), 2)
        for appearance, sentence in zip(row["appearances"], row["count_sentences"]):
            self.assertEqual(sentence["count"], appearance["n"])
            self.assertEqual(sentence["denominator"], appearance["m"])
            self.assertEqual(sentence["noun"], appearance["noun"])
            outcome = _CAUSE_OUTCOME[(row["lever"], appearance["family"])]
            self.assertEqual(sentence["outcome"], outcome)
            self.assertEqual(
                sentence["sentence"],
                f"{appearance['n']} of {appearance['m']} {appearance['noun']} {outcome}",
            )

    def test_the_outcome_table_covers_the_code_derived_cross_product_exactly(self):
        """``_CAUSE_OUTCOME``'s keys equal every ``Lever`` member x every family a
        Cause appearance can be filed under — both sets read from code, never
        from fixture output (coordinator decision, #413 review round 2).

        The four exposure families come from ``explore_exposures._FAMILY_FOR_KIND``.
        Every lever's policy sets ``recurrence_family`` to an exposure (ADR 499), so
        `_finding_rows` can file its appearances under any of the four exposure
        families and each needs its own entry.
        """
        expected = set()
        for lever in Lever:
            expected.update((lever.value, family) for family in _FAMILY_FOR_KIND.values())
        self.assertEqual(set(_CAUSE_OUTCOME), expected)

    def test_headline_is_computed_independently_of_count_sentences(self):
        # `_headline_for` never reads `count_sentences`: recomputing it with the
        # field forced to `None` must reproduce the exact same served headline.
        rows = self.projection.project(WindowQuery.whole_day())["rows"]
        for row in rows:
            self.assertEqual(
                row["headline"], _headline_for({**row, "count_sentences": None}),
                row["title"])


class GroundedWindowTest(unittest.TestCase):
    """The 2026-08-17-shaped reading, window by window."""

    def setUp(self):
        self.projection = gen.projection()

    def test_the_morning_window_asserts_one_slot_and_holds_the_next(self):
        rows = self.projection.project(WindowQuery.clock(*MORNING))["rows"]
        self.assertEqual(_titles(rows, "assert"), ["Basal 05:30 · raise"])
        held = _row(rows, "Basal 06:30 · leaning raise")
        self.assertEqual(held["register"], "held")
        self.assertEqual(held["reason"], str(Status.INSUFFICIENT))
        self.assertEqual(held["reason"], "insufficient evidence")

    def test_the_afternoon_window_shows_the_blind_stretch_and_a_held_isf(self):
        rows = self.projection.project(WindowQuery.clock(*AFTERNOON))["rows"]
        blind = _row(rows, "Basal 19:30 to 21:00")
        self.assertEqual(blind["register"], "blind")
        self.assertEqual(blind["reason"], str(Status.NO_DATA))
        self.assertEqual(blind["support"]["n"], 0)
        isf = _row(rows, "Correction factor")
        self.assertEqual(isf["register"], "held")
        self.assertIsNone(isf["direction"])
        self.assertIs(isf["asserts_move"], False)

    def test_a_held_reason_is_the_analyzers_own_string(self):
        # Byte-identical, both flavors: the queue transcribes, it never rewords.
        analysis = self.projection._analysis
        rows = self.projection.project(WindowQuery.clock(*AFTERNOON))["rows"]
        self.assertEqual(_row(rows, "Correction factor")["reason"],
                         analysis["isf"][0]["annotation"])
        blind_slot = next(s for s in analysis["basal"] if s["slot"] == 39)
        self.assertEqual(_row(rows, "Basal 19:30 to 21:00")["reason"],
                         blind_slot["safety_status"])

    def test_isf_register_stays_direction_derived_but_rank_follows_stageability(self):
        analysis, segment, lever = _direction_only_isf_analysis()
        self.assertEqual(segment.evidence["direction"], "weaken")
        self.assertIs(segment.asserts_move, False)
        self.assertGreater(lever.priority, 0)

        projection = FindingsProjection(
            _analysis=analysis,
            _exposures={"exposures": {}},
            _scenarios={"patterns": [], "low_confidence": []},
            _outcome_patterns=[],
        )
        row = projection.project(WindowQuery.whole_day())["rows"][0]

        self.assertEqual(row["register"], "assert")
        self.assertEqual(row["direction"], "weaken")
        self.assertIsNone(row["priority"])
        self.assertEqual(row["tier"], "noted")
        self.assertIs(row["asserts_move"], False)

    def test_direction_only_isf_follows_every_actionable_or_priced_row(self):
        base = gen.projection()
        analysis, _segment, _lever = _direction_only_isf_analysis(base._analysis)
        projection = FindingsProjection(analysis, base._exposures, base._scenarios,
                                        base._outcome_patterns)

        rows = projection.project(WindowQuery.whole_day())["rows"]
        isf_index = next(index for index, row in enumerate(rows)
                         if row["parameter"] == "isf")
        ranked = [index for index, row in enumerate(rows)
                  if (row["kind"] == "setting" and row["asserts_move"] is True)
                  or (row["register"] == "finding" and row["priority"] is not None)]

        self.assertTrue(ranked)
        self.assertTrue(all(index < isf_index for index in ranked))

    def test_a_window_can_hold_nothing_at_all(self):
        empty = gen.empty_projection().project(WindowQuery.clock(*MORNING))
        self.assertEqual(empty["rows"], [])
        self.assertEqual(empty["counts"],
                         {"assert": 0, "held": 0, "blind": 0, "finding": 0,
                          "history": 0})
        self.assertEqual(empty["chip_counts"],
                         {"highs": 0, "lows": 0, "meals": 0, "corrections": 0})

    def test_a_recurring_lows_hold_names_the_lows_and_no_lean(self):
        # ADR 465 decision 3: 03:00's steady nights deliver 0.71 against 0.72
        # with lows there on two nights, so the slot holds. Its row names the
        # setting alone and opens with the recurring-lows hold sentence.
        basal, cgm = _build(rate=0.71, programmed=0.72, low_nights=(20, 21))
        slots = analyze_basal(basal, cgm, [], [], harm_config=HarmConfig())
        projection = FindingsProjection(
            _analysis={"window_days": 30,
                       "basal": [slot.to_dict() for slot in slots]},
            _exposures={"exposures": {}},
            _scenarios={"patterns": [], "low_confidence": []},
            _outcome_patterns=[],
        )
        rows = projection.project(WindowQuery.clock(180, 240))["rows"]
        self.assertEqual(
            [row["title"] for row in rows if row["title"].startswith("Basal 03:00")],
            ["Basal 03:00"])
        row = _row(rows, "Basal 03:00")
        self.assertEqual(row["register"], "held")
        self.assertIsNone(row["priority"])
        self.assertTrue(row["headline"].startswith(
            "Lows keep happening overnight, but the step down is smaller than "
            "the smallest change worth making, so the rate stays as it is."))

    def test_a_window_wrapping_midnight_reaches_both_sides_of_it(self):
        rows = self.projection.project(WindowQuery.clock(22 * 60, 2 * 60))["rows"]
        self.assertIn("Basal 00:30 to 01:30 · raise", _titles(rows, "assert"))
        self.assertIn("Carb ratio 12:00 to 24:00 · lower", _titles(rows, "assert"))


class SpanMergingTest(unittest.TestCase):
    def setUp(self):
        self.projection = gen.projection()

    def test_contiguous_asserting_slots_are_one_span(self):
        rows = self.projection.project(WindowQuery.whole_day())["rows"]
        self.assertIn("Basal 00:30 to 01:30 · raise", _titles(rows, "assert"))
        span = _row(rows, "Basal 00:30 to 01:30 · raise")["span"]
        self.assertEqual((span["start_min"], span["end_min"]), (30, 90))

    def test_contiguous_held_slots_with_one_lean_are_one_span(self):
        rows = self.projection.project(WindowQuery.clock(*LOW_BLOCK))["rows"]
        held = _titles(rows, "held")
        self.assertIn("Basal 12:30 to 14:00 · leaning lower", held)
        self.assertEqual(len([t for t in held if t.startswith("Basal")]), 1)

    def test_a_span_never_mixes_directions(self):
        # Two adjacent held slots leaning opposite ways stay two rows.
        analysis = dict(gen.analysis())
        slots = {row["slot"]: row for row in analysis["basal"]}
        slots[20] = gen._slot(20, current=1.10, value=0.95, lo=0.80, hi=1.15,
                              n=18, supported=0).to_dict()
        slots[21] = gen._slot(21, current=0.90, value=1.15, lo=0.85, hi=1.40,
                              n=18, supported=0).to_dict()
        analysis["basal"] = [slots[index] for index in sorted(slots)]
        rows = FindingsProjection(
            _analysis=analysis, _exposures=gen.exposures(), _scenarios=gen.scenarios(),
            _outcome_patterns=[],
        ).project(WindowQuery.clock(10 * 60, 11 * 60))["rows"]
        self.assertEqual(
            [row["lean"] for row in rows if row["title"].startswith("Basal")],
            ["lower", "raise"])

    def test_the_span_a_row_names_is_the_whole_run_not_the_visible_part(self):
        # A run is one item that stages whole (term 13), so a window that clips it
        # still names the run it really is.
        rows = self.projection.project(WindowQuery.clock(60, 75))["rows"]
        self.assertIn("Basal 00:30 to 01:30 · raise", _titles(rows, "assert"))


class ChipProjectionTest(unittest.TestCase):
    """The server publishes chip membership; the browser only reads these lists."""

    def setUp(self):
        self.projection = gen.projection()

    def test_analyzer_built_windows_chip_findings_by_their_outcomes_and_contexts(self):
        rebound = self.projection.project(WindowQuery.clock(*REBOUND))
        self.assertEqual(_row(rebound["rows"], "Over-treated low")["chips"], ["highs"])

        afternoon = self.projection.project(WindowQuery.clock(*AFTERNOON))
        self.assertEqual(_row(afternoon["rows"], "Over-treated low")["chips"], ["highs"])
        self.assertEqual(_row(afternoon["rows"], "Correction stacking")["chips"],
                         ["lows", "corrections"])
        self.assertEqual(afternoon["chip_counts"], {
            "highs": 3, "lows": 2, "meals": 2, "corrections": 1,
        })

        global_counts = self.projection.project(WindowQuery.whole_day())["chip_counts"]
        self.assertTrue(all(global_counts[chip] > 0
                            for chip in ("highs", "lows", "meals", "corrections")),
                        global_counts)

        raise_case = gen.payload()["settings_cases"]["carb_ratio_raise"]
        self.assertEqual(_row(raise_case["rows"], "Carb ratio 00:00 to 12:00 · raise")["chips"],
                         ["lows"])

    def test_episode_levers_chip_by_their_closed_outcome_kind(self):
        levers = list(Lever)
        occurrences = []
        for index, lever in enumerate(levers):
            occurrences.append({
                "t": f"2026-08-17 {index:02d}:00:00", "date": "2026-08-17",
                "kind": "high", "cause_lever": lever.value,
                "cause_title": lever.value, "ep_id": lever.value,
                "verdicts": [],
            })
        projection = FindingsProjection(
            _analysis={"window_days": 30},
            _exposures={"exposures": {"highs": {"occurrences": occurrences}}},
            _scenarios={"patterns": [], "low_confidence": []},
            _outcome_patterns=[],
        )
        # The window is derived from the lever count, never a literal: each occurrence
        # sits at hour `index`, so a hard-coded span silently drops the newest lever
        # off its end the day one is added — which is precisely what the closed set
        # exists to catch.
        rows = projection.project(WindowQuery.clock(0, len(levers) * 60))["rows"]
        self.assertEqual(len(rows), len(levers))
        for row in rows:
            expected = "highs" if outcome_kind(row["lever"]) == "high" else "lows"
            self.assertEqual(row["chips"], [expected], row["lever"])


class PublicProducerPopulationProjectionTest(unittest.TestCase):
    def test_public_correction_stacking_producer_claims_the_lows_it_reaches(self):
        from ciq_autotune import finding_case_file
        from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns
        from scripts.qa_e2e_cases import QA_CASES, execute_case, materialize_case

        case = next(item for item in QA_CASES
                    if item.name == "behavioral-correction-stacking")
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                materialize_case(store, case)
                execution = execute_case(store, case)
                exposures = execution.exposures
                scenarios = execution.scenarios
                outcome_patterns = build_outcome_patterns(
                    execution.analysis, exposures, scenarios,
                )
                prepared = finding_case_file.prepare(
                    store, query=WindowQuery.whole_day(), version=0,
                    analysis=execution.analysis, exposures=exposures,
                    scenarios=scenarios,
                )
                pattern_case = prepared.case(
                    "pattern:lows_after_correcting_highs", "event", None,
                )

        lows = exposures["exposures"]["lows"]
        clusters = exposures["exposures"]["correction_clusters"]
        pattern = next(
            item for item in outcome_patterns
            if item["key"] == "lows_after_correcting_highs"
        )

        self.assertEqual((pattern["k"], pattern["n"]), (2, 2))
        self.assertEqual(
            sum("correction_stacking" in item["attributed_levers"]
                for item in lows["occurrences"]),
            2,
        )
        # The correction factor is no member (ADR 499), so the one admitted habit
        # carries the Pattern: it collapses to that member, and its case file is
        # the Pattern's own population, the lows the habit's corrections reached
        # (ADR 520).
        self.assertEqual(
            [(item["subject"], item["admitted"]) for item in pattern["members"]],
            [("habit:correction_stacking", True)],
        )
        self.assertEqual(pattern["collapse"], "collapse_to_member")
        self.assertEqual(pattern_case["summary"],
                         {"claimed": 2, "denominator": 2, "noun": "lows"})
        self.assertEqual([item["member"] for item in pattern_case["occurrences"]],
                         ["habit:correction_stacking"] * 2)
        self.assertEqual((clusters["n"], clusters["attributed"]), (8, 2))
        self.assertEqual(
            sum(item["cause_lever"] == "correction_stacking"
                for item in clusters["occurrences"]),
            2,
        )

    def test_settings_direction_mapping_is_published_through_each_row_builder(self):
        cases = (
            ("basal_rate", "raise", "highs"),
            ("basal_rate", "lower", "lows"),
            ("carb_ratio", "raise", "lows"),
            ("carb_ratio", "lower", "highs"),
            ("isf", "strengthen", "highs"),
            ("isf", "weaken", "lows"),
        )
        for parameter, direction, chip in cases:
            with self.subTest(parameter=parameter, direction=direction):
                analysis = {"window_days": 30, "basal": [], "ic_blocks": [], "isf": []}
                if parameter == "basal_rate":
                    analysis["basal"] = [{
                        "slot": 0, "asserts_move": True, "direction": direction,
                        "current": 1.0, "recommended": 1.1,
                        "estimate": {"value": 1.1}, "days": 8,
                    }]
                elif parameter == "carb_ratio":
                    analysis["ic_blocks"] = [{
                        "block_id": 0, "start_min": 0, "end_min": 60,
                        "asserts_move": True, "direction": direction,
                        "current_values": [5.0], "recommended": 6.0,
                        "estimate": {"value": 6.0}, "n_runs": 8,
                    }]
                else:
                    analysis["isf"] = [{
                        "current": 40.0, "recommended": 35.0,
                        "estimate": {"value": 35.0},
                        "evidence": {"direction": direction, "night_fits": []},
                    }]
                projection = FindingsProjection(
                    _analysis=analysis, _exposures={"exposures": {}},
                    _scenarios={"patterns": [], "low_confidence": []},
                    _outcome_patterns=[],
                )
                row = projection.project(WindowQuery.whole_day())["rows"][0]
                self.assertEqual(row["chips"], [chip])
                self.assertEqual(row["window_scope"],
                                 "whole_day" if parameter == "isf" else "window")


class EventChartProjectionTest(unittest.TestCase):
    def test_canonical_factors_publish_their_coordinates_when_the_family_is_present(self):
        # The families come from the projection's OWN mapping, not the retired
        # standalone route's VIEW_CONFIG: that route filed correction stacking
        # under its "lows" view, while the exposure it is counted in is
        # correction clusters. Reading the view names here is what let the
        # mismatch publish `null` for a whole lever unnoticed.
        exposures = {}
        expected = {}
        by_family: dict[str, list[str]] = {}
        for lever, family in _EVENT_CHART_FAMILIES.items():
            by_family.setdefault(family, []).append(lever)
        for hour, (family, levers) in enumerate(by_family.items()):
            occurrences = []
            for offset, factor in enumerate(levers):
                occurrences.append({
                    "t": f"2026-08-17 {hour * 6 + offset:02d}:00:00",
                    "date": "2026-08-17",
                    "kind": family,
                    "cause_lever": factor,
                    "cause_title": FACTOR_LABELS.get(factor, factor),
                    "ep_id": factor,
                    "verdicts": [],
                })
                expected[factor] = {
                    "lever": factor,
                    "window": WindowQuery.whole_day().to_dict(),
                }
            exposures[family] = {"occurrences": occurrences}

        rows = FindingsProjection(
            _analysis={"window_days": 30},
            _exposures={"exposures": exposures},
            _scenarios={"patterns": [], "low_confidence": []},
            _outcome_patterns=[],
        ).project(WindowQuery.whole_day())["rows"]

        self.assertEqual(
            {row["lever"]: row["event_chart"] for row in rows},
            expected,
        )

    def test_ineligible_findings_and_settings_publish_explicit_null(self):
        settings = [
            row for row in gen.projection().project(WindowQuery.whole_day())["rows"]
            if row["register"] != "finding"
        ]
        unsupported = FindingsProjection(
            _analysis={"window_days": 30},
            _exposures={"exposures": {"highs": {"occurrences": [{
                "t": "2026-08-17 09:00:00",
                "date": "2026-08-17",
                "kind": "highs",
                "cause_lever": "missed_meal",
                "cause_title": "Missed / unannounced meal",
                "ep_id": "missed-meal",
                "verdicts": [],
            }]}}},
            _scenarios={"patterns": [], "low_confidence": []},
            _outcome_patterns=[],
        ).project(WindowQuery.whole_day())["rows"][0]

        self.assertTrue(all("event_chart" in row for row in settings))
        self.assertTrue(all(row["event_chart"] is None for row in settings))
        self.assertEqual(unsupported["event_chart"], {
            "lever": "missed_meal",
            "window": WindowQuery.whole_day().to_dict(),
        })

    def test_a_compatible_factor_without_its_event_family_publishes_null(self):
        projection = FindingsProjection(
            _analysis={"window_days": 30},
            _exposures={"exposures": {"highs": {"occurrences": [{
                "t": "2026-08-17 09:00:00",
                "date": "2026-08-17",
                "kind": "highs",
                "cause_lever": "late_bolus",
                "cause_title": "Late bolus",
                "ep_id": "late-bolus-high-only",
                "verdicts": [],
            }]}}},
            _scenarios={"patterns": [], "low_confidence": []},
            _outcome_patterns=[],
        )

        row = projection.project(WindowQuery.whole_day())["rows"][0]
        self.assertIsNone(row["event_chart"])


class QueueOrderTest(unittest.TestCase):
    def setUp(self):
        self.projection = gen.projection()
        self.global_rows = self.projection.project(WindowQuery.whole_day())["rows"]

    def test_the_global_queue_is_asserting_only(self):
        self.assertEqual(
            {row["register"] for row in self.global_rows},
            {"assert", "finding", "history"})
        quiet = [row for row in self.global_rows if row["register"] in ("held", "blind")]
        self.assertEqual(quiet, [])

    def test_priced_rows_lead_in_server_priority_order_then_counted_rows(self):
        ranked = [row for row in self.global_rows if not row.get("claimed_by")]
        priced = [row["priority"] for row in ranked
                  if row["priority"] is not None]
        self.assertEqual(priced, sorted(priced, reverse=True))
        tail = [row for row in ranked if row["priority"] is None]
        self.assertTrue(all(row["priority"] is None for row in tail))
        counts = [row["episodes"] or 0 for row in tail]
        self.assertEqual(counts, sorted(counts, reverse=True))

    def test_a_setting_admitted_pattern_sits_in_its_settings_position(self):
        """ADR 469 decisions 1–3: one Priority fills one ranked position."""
        rows = self.global_rows
        ids = [row["id"] for row in rows]
        by_id = {row["id"]: row for row in rows}
        # ic:720 is a strengthening move, so only highs after meals sits with it;
        # lows after meals is not staged by it (ADR 530).
        anchors = {
            "pattern:highs_after_meals": "ic:720",
        }
        for pattern, anchor in anchors.items():
            with self.subTest(pattern=pattern):
                row = by_id[pattern]
                self.assertEqual(row.get("anchored_by"), anchor)
                self.assertEqual(row.get("rank_note"), "Ranked with its setting")
                self.assertEqual(row["tier"], by_id[anchor]["tier"])
                between = rows[ids.index(anchor) + 1:ids.index(pattern)]
                self.assertTrue(all(
                    item.get("anchored_by") == anchor
                    or by_id.get(item.get("claimed_by"), {}).get("anchored_by") == anchor
                    for item in between
                ), [item["id"] for item in between])
        self.assertEqual(ids[ids.index("pattern:highs_after_meals") + 1], "finding:carb_undercount")
        top_level = [row["tier"] for row in rows if row["claimed_by"] is None]
        self.assertLess(
            max(index for index, tier in enumerate(top_level) if tier == "next_in_line"),
            min(index for index, tier in enumerate(top_level) if tier == "worth_a_look"),
        )
        for row in rows:
            if row["id"] not in anchors:
                self.assertIsNone(row.get("anchored_by"), row["id"])
                self.assertIsNone(row.get("rank_note"), row["id"])

    def test_a_scoped_window_says_its_rank_comes_from_all_30_days(self):
        rows = {row["id"]: row for row in
                self.projection.project(WindowQuery.clock(*AFTERNOON))["rows"]}
        self.assertEqual(rows["finding:over_treated_low"].get("rank_note"), "Ranked on all 30 days")
        self.assertIsNone(rows["ic:720"].get("rank_note"))

    def test_a_pattern_whose_setting_is_outside_the_window_ranks_alone(self):
        rows = {row["id"]: row for row in
                self.projection.project(WindowQuery.clock(6 * 60, 11 * 60))["rows"]}
        highs = rows["pattern:highs_after_meals"]
        self.assertIsNone(highs.get("anchored_by"))
        self.assertEqual(highs.get("rank_note"), "Ranked on all 30 days")

    def test_an_asserting_row_that_cannot_stage_sorts_before_unranked_findings(self):
        rows = FindingsProjection(
            _analysis=gen.analysis(isf=gen.direction_only_isf_rows()),
            _exposures=gen.exposures(), _scenarios=gen.scenarios(), _outcome_patterns=[],
        ).project(WindowQuery.whole_day())["rows"]
        ids = [row["id"] for row in rows]
        by_id = {row["id"]: row for row in rows}
        for cause in ("finding:correction_on_iob", "finding:correction_stacking"):
            with self.subTest(cause=cause):
                self.assertIsNone(by_id[cause]["priority"])
                self.assertEqual(by_id[cause]["episodes"], 1)
                self.assertIsNone(by_id["isf"]["priority"])
                self.assertLess(ids.index("isf"), ids.index(cause))

    def test_the_order_is_the_servers_own_priorities_not_a_re_derivation(self):
        levers = {lever["parameter"]: lever["priority"]
                  for lever in self.projection._analysis["tuning_levers"]}
        patterns = {p["lever"]: p["priority"]
                    for p in self.projection._scenarios["patterns"]}
        for row in self.global_rows:
            if row["register"] == "assert":
                self.assertEqual(row["priority"], levers[row["parameter"]])
            elif row["kind"] == "pattern":
                self.assertEqual(row["priority"],
                                 row["pattern"]["settled_price"]
                                 if row["pattern"]["admission_route"] != "none" else None)
            elif row["priority"] is not None:
                self.assertEqual(row["priority"], patterns[row["lever"]])

    def test_held_and_blind_follow_the_ranked_head(self):
        rows = self.projection.project(WindowQuery.clock(*AFTERNOON))["rows"]
        order = {"assert": 0, "finding": 0, "held": 1, "blind": 2}
        ranks = [order[row["register"]] for row in rows]
        self.assertEqual(ranks, sorted(ranks))


class PatternProjectionTest(unittest.TestCase):
    def test_public_pattern_subjects_match_the_closed_roster(self):
        self.assertEqual(PATTERN_SUBJECTS, {f"pattern:{key}" for key, *_ in _ROSTER})

    def setUp(self):
        self.projection = gen.projection()
        self.result = self.projection.project(WindowQuery.whole_day())

    def test_a_thin_window_does_not_make_a_staged_pattern_uncertain(self):
        """ADR 485: precision alone never makes a Pattern Uncertain. A Pattern the
        carb-ratio staging admits holds at its low end even on a one-meal window."""
        def highs_after_meals(query):
            return next(pattern for pattern in self.projection.project(query)["outcome_patterns"]
                        if pattern["key"] == "highs_after_meals")

        whole = highs_after_meals(WindowQuery.whole_day())
        scoped = highs_after_meals(WindowQuery.clock(720, 840))
        self.assertEqual((whole["k"], whole["n"], whole["wide"]), (1, 3, False))
        self.assertEqual(scoped["admission_route"], "setting_staging")
        self.assertEqual((scoped["k"], scoped["n"], scoped["wide"]), (0, 1, False))

    def test_chartability_reads_admitted_members_and_rate_family_not_claimed_rows(self):
        projection = FindingsProjection(
            _analysis=self.projection._analysis,
            _exposures=self.projection._exposures,
            _scenarios={},
            _outcome_patterns=self.projection._outcome_patterns,
        )
        result, _ = projection._pattern_rows([], WindowQuery.whole_day())
        pattern = next(row for row in result
                       if row["id"] == "pattern:highs_after_meals")

        self.assertFalse(any(row.get("claimed_by") == pattern["id"] for row in result))
        self.assertIsNotNone(pattern["pattern_chart"])

        empty_exposures = json.loads(json.dumps(self.projection._exposures))
        empty_exposures["exposures"]["meals"].update(n=0, occurrences=[])
        empty, _ = FindingsProjection(
            _analysis=self.projection._analysis, _exposures=empty_exposures,
            _scenarios={}, _outcome_patterns=self.projection._outcome_patterns,
        )._pattern_rows([], WindowQuery.whole_day())
        pattern = next(row for row in empty
                       if row["id"] == "pattern:highs_after_meals")
        self.assertIsNone(pattern["pattern_chart"])

    def test_patterns_and_claimed_rate_levers_share_the_scoped_population(self):
        pattern = next(row for row in self.result["rows"]
                       if row["id"] == "pattern:highs_after_meals")
        index = self.result["rows"].index(pattern)
        member = self.result["rows"][index + 1]

        self.assertEqual(member["id"], "finding:carb_undercount")
        self.assertEqual(member["claimed_by"], pattern["id"])
        self.assertEqual(pattern["pattern_chart"], {
            "key": "highs_after_meals", "window": WindowQuery.whole_day().to_dict(),
        })
        self.assertIsNone(pattern["event_chart"])

        rows_by_id = {row["id"]: row for row in self.result["rows"]}
        for pattern_row in (row for row in self.result["rows"]
                            if row["kind"] == "pattern"):
            claimed = []
            for lever in pattern_row["pattern"]["rate_levers"]:
                finding = rows_by_id.get(f"finding:{lever.removeprefix('habit:')}")
                if finding is not None:
                    self.assertEqual(finding["claimed_by"], pattern_row["id"])
                    claimed.append(finding)
            if claimed:
                positions = sorted(self.result["rows"].index(row) for row in claimed)
                self.assertEqual(positions, list(range(
                    self.result["rows"].index(pattern_row) + 1,
                    self.result["rows"].index(pattern_row) + 1 + len(claimed),
                )))

        query = WindowQuery.clock(*AFTERNOON)
        scoped = self.projection.project(query)
        scoped_exposures, _roster = outcome_window_population(
            self.projection._analysis, self.projection._exposures,
            self.projection._scenarios, query,
        )
        scoped_patterns = [row for row in scoped["rows"] if row["kind"] == "pattern"]
        self.assertTrue(scoped_patterns)
        for pattern_row in scoped_patterns:
            self.assertEqual(pattern_row["window_scope"], "window")
            # Chartability decides the chart coordinate alone, never membership
            # (ADR 467 decision 2).
            self.assertEqual(
                pattern_row["pattern_chart"],
                {"key": pattern_row["pattern"]["key"], "window": query.to_dict()}
                if pattern_chartable(pattern_row["pattern"], scoped_exposures) else None,
            )
            self.assertLessEqual(pattern_row["pattern"]["k"], pattern_row["pattern"]["n"])
        served = {row["id"] for row in scoped_patterns}
        for row in scoped["rows"]:
            if row.get("claimed_by"):
                self.assertIn(row["claimed_by"], served)

    def test_claimed_members_add_nothing_to_counts_or_chip_counts(self):
        rows = [row for row in self.result["rows"] if not row.get("claimed_by")]
        expected_counts = {name: 0 for name in self.result["counts"]}
        expected_chips = {name: 0 for name in self.result["chip_counts"]}
        for row in rows:
            expected_counts[row["register"]] += 1
            for chip in row["chips"]:
                expected_chips[chip] += 1
        self.assertEqual(self.result["counts"], expected_counts)
        self.assertEqual(self.result["chip_counts"], expected_chips)

    def test_collapse_member_passes_through_and_unadmitted_pattern_is_title_only(self):
        ids = {row["id"] for row in self.result["rows"]}
        self.assertNotIn("pattern:highs_after_treating_lows", ids)
        collapsed_member = next(row for row in self.result["rows"]
                                if row["id"] == "finding:over_treated_low")
        self.assertIsNone(collapsed_member["claimed_by"])

        unadmitted = next(row for row in self.result["rows"]
                          if row["id"] == "pattern:lows_after_correcting_highs")
        self.assertIsNone(unadmitted["priority"])
        self.assertEqual(unadmitted["headline"], unadmitted["title"])
        self.assertIsNone(unadmitted["pattern_chart"])

    def test_memberless_patterns_keep_their_count_without_a_chart(self):
        from ciq_autotune.analyzers.scenario.levers import title
        from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns

        root = pathlib.Path(__file__).resolve().parents[1]
        browser = json.loads((root / "frontend" / "__fixtures__"
                              / "findings-projection.json").read_text())
        exposures = json.loads((root / "mockups" / "diagnose-workstation.synthetic"
                                / "payload.json").read_text())["exposures"]
        # A memberless Pattern with k > 0: one unclaimed meal re-marked as claimed by
        # Meal over-delivery, in the shape the producer serves (that verdict matched
        # with its sentence as the row's text, every other judged classifier calm).
        lever = Lever.MEAL_OVER_DELIVERY
        meals = exposures["exposures"]["meals"]
        meal = next(row for row in meals["occurrences"] if not row["attributed"])
        text = "Synthetic over-delivery narrative: the meal bolus carried glucose low."
        meal.update(attributed=True, attributed_levers=[lever.value], cause_lever=lever.value,
                    cause_title=title(lever), state="fired", text=text)
        for verdict in meal["verdicts"]:
            own = verdict["classifier"] == lever.value
            verdict.update(
                matched=own, evidence_tier="inferred" if own else "observed",
                silence_reason=None if own else "no_trigger",
                detail=text if own else (f"Synthetic {title(Lever(verdict['classifier'])).lower()}"
                                         " judgment: this Occurrence did not meet the criteria."))
        meals.update(attributed=meals["attributed"] + 1, clean=meals["clean"] - 1,
                     uncaused=meals["uncaused"] - 1, levers=[*meals["levers"], lever.value],
                     by_cause={**meals["by_cause"], title(lever): 1})
        inputs = browser["browser_inputs"]
        pattern = next(row for row in build_outcome_patterns(
            inputs["analysis"], exposures, inputs["scenarios"]) if row["key"] == "lows_after_meals")
        self.assertGreater(pattern["k"], 0)
        self.assertFalse(any(member["kind"] == "habit" for member in pattern["members"]))

    def test_count_status_has_an_explicit_headline_and_no_blank_rate(self):
        source = next(row for row in self.projection._outcome_patterns
                      if row["key"] == "highs_after_meals")
        inconsistent = json.loads(json.dumps(source))
        inconsistent.update(k=4, n=3, rate=None, wilson=None,
                            count_status={"status": "inconsistent_counts", "k": 4, "n": 3})
        projection = FindingsProjection(
            _analysis=self.projection._analysis, _exposures=self.projection._exposures,
            _scenarios=self.projection._scenarios, _outcome_patterns=[inconsistent],
        )
        row = next(row for row in projection.project(WindowQuery.whole_day())["rows"]
                   if row["kind"] == "pattern")
        self.assertEqual(row["headline"], "Highs after meals: counts under review")

    def test_pattern_headlines_name_their_roster_owned_recurrence_population(self):
        roster = json.loads(json.dumps(self.projection._outcome_patterns))
        for pattern in roster:
            pattern["collapse"] = "remain_pattern"
            if pattern["admission_route"] == "none":
                pattern["admission_route"] = "habit_threshold"
        projection = FindingsProjection(
            _analysis=self.projection._analysis, _exposures=self.projection._exposures,
            _scenarios=self.projection._scenarios, _outcome_patterns=roster,
        )
        rows = {row["pattern"]["key"]: row
                for row in projection.project(WindowQuery.whole_day())["rows"]
                if row["kind"] == "pattern"}

        nouns = {
            "highs_after_meals": "meals",
            "lows_after_meals": "meals",
            "highs_after_treating_lows": "lows",
            "lows_after_correcting_highs": "lows",
        }
        for key, noun in nouns.items():
            pattern = rows[key]["pattern"]
            self.assertEqual(
                rows[key]["headline"],
                f"{pattern['title']} in {pattern['k']} of {pattern['n']} {noun}",
            )

    def test_closed_pattern_chips_equal_the_union_of_their_member_chips(self):
        member_rows = {
            "carb_undercount": ["meals"], "late_bolus": ["meals"],
            "meal_over_delivery": ["meals"], "over_treated_low": ["lows"],
            "correction_on_iob": ["lows"],
            "correction_stacking": ["correction_clusters"],
        }
        for key, _title, members, _rate_levers, _setting, _family in _ROSTER:
            with self.subTest(key=key):
                union = []
                for lever in members:
                    chips = _chips_for(projection_row(
                        register="finding", kind="habit", lever=lever,
                        appearances=[{"family": family} for family in member_rows[lever]],
                    ))
                    union.extend(chip for chip in chips if chip not in union)
                self.assertEqual(list(_PATTERN_CHIPS[key]), union)

    def test_stacking_finding_keeps_its_correction_cluster_population(self):
        row = next(row for row in self.result["rows"]
                   if row["id"] == "finding:correction_stacking")

        self.assertEqual(row["appearances"], [{
            "family": "correction_clusters", "noun": "correction clusters",
            "n": 1, "m": 1,
        }])
        self.assertEqual(row["verdict_counts_by_family"], {
            "correction_clusters": {
                "fired": 1, "outranked": 0, "near_miss": 0,
                "no_data": 0, "clean": 0,
            },
        })


class ScopedPatternMembershipTest(unittest.TestCase):
    """#467: a scoped window serves a Pattern when its outcomes land in it, whether or
    not it owns a chart (ADR 467)."""

    def test_the_explicit_whole_day_scope_folds_causes_under_served_patterns(self):
        projection = gen.projection()
        whole = {row["id"]: row for row in projection.project(WindowQuery.whole_day())["rows"]}
        scoped = projection.project(WindowQuery.clock(0, DAY_MINUTES))["rows"]
        by_id = {row["id"]: row for row in scoped}
        self.assertIn("pattern:lows_after_meals", by_id)
        self.assertIn("pattern:lows_after_correcting_highs", by_id)
        for lever in ("correction_stacking", "correction_on_iob"):
            with self.subTest(lever=lever):
                self.assertEqual(by_id[f"finding:{lever}"]["claimed_by"],
                                 "pattern:lows_after_correcting_highs")
                self.assertEqual(whole[f"finding:{lever}"]["claimed_by"],
                                 "pattern:lows_after_correcting_highs")
        served = {row["id"] for row in scoped if row["kind"] == "pattern"}
        for row in scoped:
            if row.get("claimed_by"):
                self.assertIn(row["claimed_by"], served)


class FoldSentenceTest(unittest.TestCase):
    """#424: every row folded under a Pattern serves ``fold_sentences`` — its credited
    share of the Pattern's own count first, then its count sentences on any other
    family set apart as outside that count — from the Pattern producer's one credit
    rule over the same window population (ADR 424)."""

    @staticmethod
    def _execution(name):
        from scripts.qa_e2e_cases import QA_CASES, execute_case, materialize_case

        case = next(item for item in QA_CASES if item.name == name)
        with Store.open(":memory:") as store:
            materialize_case(store, case)
            return case, execute_case(store, case)

    @staticmethod
    def _outside(row):
        return [sentence | {"scope": "outside"} for sentence in row["count_sentences"]]

    def test_a_cause_counted_in_another_family_leads_with_its_share_of_the_pattern(self):
        """One extra scenario Pattern for Correction on IOB is injected, the way the
        findings-projection generator injects its out-of-family member. Cut 6 (ADR
        499) removed the correction-factor member that kept Lows after correcting
        highs from collapsing onto Correction stacking alone; a second admitted habit
        keeps it a Pattern, so the stacking cause still folds beneath it."""
        from ciq_autotune.analyzers.scenario.levers import recommendation
        from ciq_autotune.analyzers.scenario.payload import Pattern
        from ciq_autotune.uncertainty import Confidence

        _case, execution = self._execution("behavioral-correction-stacking")
        extra = Lever.CORRECTION_ON_IOB
        scenarios = {**execution.scenarios, "patterns": [
            *execution.scenarios["patterns"],
            Pattern(lever=extra, confidence=Confidence(n=40, k=5, effect=0.3), rank=5,
                    recommendation=recommendation(extra), hero_episode="ep1",
                    occurrences=["ep1"], admission_basis="low_confidence").to_dict(),
        ]}
        rows = {row["id"]: row for row in prepare_findings_projection(
            analysis=execution.analysis, exposures=execution.exposures, scenarios=scenarios,
        ).project(WindowQuery.whole_day())["rows"]}
        pattern = rows["pattern:lows_after_correcting_highs"]
        cause = rows["finding:correction_stacking"]

        self.assertEqual(cause["claimed_by"], pattern["id"])
        self.assertEqual([item["sentence"] for item in pattern["count_sentences"]],
                         ["2 of 2 lows followed a correction"])
        clusters = {"sentence": "2 of 8 correction clusters went low", "count": 2,
                    "denominator": 8, "noun": "correction clusters", "outcome": "went low"}
        self.assertEqual(cause.get("fold_sentences"), [
            {"sentence": "2 of 2 lows followed stacked corrections", "count": 2,
             "denominator": 2, "noun": "lows", "outcome": "followed stacked corrections",
             "scope": "pattern"},
            clusters | {"scope": "outside"},
        ])
        # The cause's own count and the Pattern's count stay as served.
        self.assertEqual(cause["count_sentences"], [clusters])
        self.assertEqual(cause["appearances"], [{
            "family": "correction_clusters", "noun": "correction clusters", "n": 2, "m": 8,
        }])
        self.assertEqual(
            [(item["subject"], item["admitted"]) for item in pattern["pattern"]["members"]],
            [("habit:correction_stacking", True), ("habit:correction_on_iob", True)],
        )
        self.assertEqual((pattern["pattern"]["k"], pattern["pattern"]["n"],
                          pattern["pattern"]["collapse"]), (2, 2, "remain_pattern"))

    def test_two_causes_shares_add_up_to_their_pattern(self):
        case, execution = self._execution("behavioral-carb-undercount")
        whole_day = execution.findings["whole_day"]
        pattern = next(row for row in whole_day["rows"]
                       if row["id"] == "pattern:highs_after_meals")
        causes = [row for row in whole_day["rows"] if row.get("claimed_by") == pattern["id"]]

        self.assertEqual([row["id"] for row in causes],
                         ["finding:carb_undercount", "finding:late_bolus"])
        shares = [(row.get("fold_sentences") or [{}])[0] for row in causes]
        self.assertEqual(
            [(item.get("scope"), item.get("count"), item.get("denominator"), item.get("noun"))
             for item in shares],
            [("pattern", 2, 6, "meals"), ("pattern", 1, 6, "meals")],
        )
        self.assertEqual(sum(item["count"] for item in shares), pattern["pattern"]["k"])
        self.assertEqual(pattern["pattern"]["k"], 3)
        # Each cause counts only in meals, so nothing of either is outside the count.
        self.assertEqual([len(row["fold_sentences"]) for row in causes], [1, 1])
        self.assertEqual([[item["sentence"] for item in row["count_sentences"]]
                          for row in causes],
                         [["2 of 6 meals ran high"], ["1 of 6 meals ran high"]])
        self.assertEqual(tuple(whole_day["outcome_patterns"]),
                         case.expectation.outcome_patterns)

    def test_a_two_family_rate_lever_sets_its_other_family_outside_the_count(self):
        rows = {row["id"]: row
                for row in gen.projection().project(WindowQuery.whole_day())["rows"]}
        pattern = rows["pattern:highs_after_meals"]
        cause = rows["finding:carb_undercount"]

        self.assertEqual(cause["claimed_by"], pattern["id"])
        self.assertEqual(
            [(item["scope"], item["sentence"]) for item in cause.get("fold_sentences") or []],
            [("pattern", "1 of 3 meals ran high"),
             ("outside", "2 of 4 highs followed an undercounted meal")],
        )
        self.assertEqual([item["sentence"] for item in cause["count_sentences"]],
                         ["2 of 4 highs followed an undercounted meal",
                          "1 of 3 meals ran high"])

    def test_a_pattern_serving_no_count_credits_no_share(self):
        rows = {row["id"]: row
                for row in gen.projection().project(WindowQuery.whole_day())["rows"]}
        pattern = rows["pattern:lows_after_correcting_highs"]

        self.assertEqual(pattern["pattern"]["admission_route"], "none")
        self.assertEqual((pattern["pattern"]["k"], pattern["pattern"]["n"]), (1, 5))
        self.assertIsNone(pattern["count_sentences"])
        for lever in ("correction_on_iob", "correction_stacking"):
            cause = rows[f"finding:{lever}"]
            self.assertEqual(cause["claimed_by"], pattern["id"], lever)
            self.assertEqual(cause.get("fold_sentences"), self._outside(cause), lever)

    def test_a_pattern_whose_counts_are_under_review_credits_no_share(self):
        source = gen.projection()
        roster = json.loads(json.dumps(source._outcome_patterns))
        pattern = next(row for row in roster if row["key"] == "highs_after_meals")
        pattern.update(k=4, n=3, rate=None, wilson=None,
                       count_status={"status": "inconsistent_counts", "k": 4, "n": 3})
        rows = FindingsProjection(
            _analysis=source._analysis, _exposures=source._exposures,
            _scenarios=source._scenarios, _outcome_patterns=roster,
        ).project(WindowQuery.whole_day())["rows"]
        cause = next(row for row in rows if row["id"] == "finding:carb_undercount")

        self.assertEqual(cause["claimed_by"], "pattern:highs_after_meals")
        self.assertEqual(cause.get("fold_sentences"), self._outside(cause))

    def test_only_folded_rows_serve_fold_sentences(self):
        for window, bounds in gen.WINDOWS.items():
            query = WindowQuery.whole_day() if bounds is None else WindowQuery.clock(*bounds)
            for row in gen.projection().project(query)["rows"]:
                with self.subTest(window=window, row=row["id"]):
                    self.assertIn("fold_sentences", row)
                    if not row["claimed_by"]:
                        self.assertIsNone(row["fold_sentences"])


class WindowQueryTest(unittest.TestCase):
    def test_a_window_must_span_some_part_of_the_day(self):
        with self.assertRaises(ValueError):
            WindowQuery.clock(600, 600)

    def test_bounds_are_minutes_on_the_clock(self):
        with self.assertRaises(ValueError):
            WindowQuery.clock(-30, 600)
        with self.assertRaises(ValueError):
            WindowQuery.clock(0, 1441)

    def test_the_whole_day_is_not_a_window(self):
        self.assertFalse(WindowQuery.whole_day().scoped)
        self.assertIsNone(WindowQuery.whole_day().to_dict()["label"])
        self.assertEqual(WindowQuery.clock(270, 480).to_dict()["label"], "04:30–08:00")


class PreparedFromStoreTest(unittest.TestCase):
    def test_preparation_builds_the_pattern_roster_once_and_publishes_it_verbatim(self):
        roster = [{"key": "published-by-pattern-producer"}]
        with patch("ciq_autotune.findings_projection.build_outcome_patterns",
                   return_value=roster) as build:
            projection = prepare_findings_projection(
                analysis={"window_days": 30}, exposures={}, scenarios={},
            )

        build.assert_called_once_with({"window_days": 30}, {}, {})
        result = projection.project(WindowQuery.whole_day())
        self.assertEqual(result["outcome_patterns"], roster)
        self.assertIsNot(result["outcome_patterns"], roster)
        self.assertIsNot(result["outcome_patterns"],
                         projection.project(WindowQuery.clock(0, 60))["outcome_patterns"])
        self.assertEqual(result["rows"], [])

    def test_prepared_projection_preserves_an_inconsistent_pattern_roster(self):
        roster = [{"key": "highs_after_meals", "k": 4, "n": 3,
                   "rate": None, "wilson": None,
                   "count_status": {"status": "inconsistent_counts", "k": 4, "n": 3}}]
        with patch("ciq_autotune.findings_projection.build_outcome_patterns",
                   return_value=roster):
            projection = prepare_findings_projection(
                analysis={"window_days": 30}, exposures={}, scenarios={},
            )

        self.assertEqual(projection.project(WindowQuery.whole_day())["outcome_patterns"],
                         roster)

    def test_an_empty_store_projects_an_empty_queue(self):
        projection = prepare_findings_projection(
            analysis={"window_days": 30}, exposures={}, scenarios={},
        )
        result = projection.project(WindowQuery.whole_day())
        self.assertEqual([row["kind"] for row in result["rows"]],
                         ["pattern"] * 4)
        self.assertEqual(
            [pattern["key"] for pattern in result["outcome_patterns"]],
            ["highs_after_meals", "lows_after_meals", "highs_after_treating_lows",
             "lows_after_correcting_highs"],
        )
        self.assertEqual(result["window"]["scoped"], False)
        self.assertEqual(result["findings_window"]["days"], 30)


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class FindingsEndpointTest(unittest.TestCase):
    def setUp(self):
        from ciq_autotune.api import create_app
        from tests.test_api import _seed

        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed(self.tmp.name)
        self.client = TestClient(create_app(db_path=self.tmp.name, token=None,
                                            enable_fetch_loop=False,
                                            analysis_incarnation="findings-http"))

    def tearDown(self):
        from ciq_autotune.derived_artifacts import sidecar_path
        pathlib.Path(sidecar_path(self.tmp.name)).unlink(missing_ok=True)
        self.tmp.close()

    def test_the_global_queue_answers_without_a_window(self):
        r = self.client.get("/api/diagnose/findings")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["schema"], "diagnose-findings-v2")
        self.assertEqual(body["analysis_generation"], "findings-http:0")
        self.assertFalse(body["window"]["scoped"])

    def test_a_clock_window_scopes_it(self):
        r = self.client.get("/api/diagnose/findings",
                            params={"start_min": 270, "end_min": 480})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["window"]["label"], "04:30–08:00")

    def test_half_a_window_is_a_bad_request(self):
        r = self.client.get("/api/diagnose/findings", params={"start_min": 270})
        self.assertEqual(r.status_code, 400)

    def test_a_zero_width_window_is_a_bad_request(self):
        r = self.client.get("/api/diagnose/findings",
                            params={"start_min": 600, "end_min": 600})
        self.assertEqual(r.status_code, 400)

    def test_the_route_default_reads_the_canonical_source_window(self):
        import ciq_autotune.api as api_mod
        from unittest.mock import patch

        real = api_mod.prepare_findings_projection
        analyses = []

        def capture(*args, **kwargs):
            analyses.append(kwargs["analysis"])
            return real(*args, **kwargs)

        with patch.object(
            api_mod.findings_projection_module,
            "DIAGNOSE_SOURCE_WINDOW_DAYS",
            17,
        ), patch.object(api_mod, "prepare_findings_projection", capture):
            client = TestClient(api_mod.create_app(
                db_path=self.tmp.name, token=None, enable_fetch_loop=False,
            ))
            response = client.get("/api/diagnose/findings")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([value["window_days"] for value in analyses], [17])
        self.assertEqual(response.json()["findings_window"]["days"], 17)

    def test_it_answers_from_the_cache_and_a_write_invalidates_it(self):
        import ciq_autotune.api as api_mod
        from unittest.mock import patch

        real = api_mod.prepare_findings_projection
        calls = []

        def counting(*args, **kwargs):
            calls.append(1)
            return real(*args, **kwargs)

        with patch.object(api_mod, "prepare_findings_projection", counting):
            self.client.get("/api/diagnose/findings")                       # miss
            self.client.get("/api/diagnose/findings",
                            params={"start_min": 270, "end_min": 480})  # same read
            self.assertEqual(len(calls), 1)

            r = self.client.post("/api/carbs", json={
                "t": "2026-06-03 10:05:00", "grams": 8, "certainty": "exact"})
            self.assertEqual(r.status_code, 200)

            self.client.get("/api/diagnose/findings")                       # bumped
            self.assertEqual(len(calls), 2)

    def test_selected_history_codec_and_catalog_errors_are_public(self):
        malformed = self.client.get(
            "/api/diagnose/findings", params={"selected_id": "ich1_not-canonical"})
        unknown = self.client.get("/api/diagnose/findings", params={
            "selected_id": encode_history_id(HistoryIdentity(420, 720, 7.0))})

        self.assertEqual((malformed.status_code, malformed.json()["detail"]["code"]),
                         (400, "invalid_history_id"))
        self.assertEqual((unknown.status_code, unknown.json()["detail"]["code"]),
                         (404, "history_not_found"))

    def test_selected_history_present_and_out_of_scope_bodies_are_public(self):
        import ciq_autotune.api as api_mod
        from unittest.mock import patch

        projection, history = _with_history(
            gen.empty_projection(),
            annotation="Exact analyzer-owned copy; do not rewrite this sentence.")
        with patch.object(api_mod, "prepare_findings_projection",
                          lambda *args, **kwargs: projection):
            present = self.client.get("/api/diagnose/findings", params={
                "selected_id": history.history_id,
            })
            out_of_scope = self.client.get("/api/diagnose/findings", params={
                "start_min": 0, "end_min": 300,
                "selected_id": history.history_id,
            })

        self.assertEqual(present.status_code, 200)
        self.assertEqual(present.json()["selection"], {
            "id": history.history_id, "disposition": "present", "message": None,
        })
        present_row = next(row for row in present.json()["rows"]
                           if row["id"] == history.history_id)
        self.assertEqual(present_row["annotation"], history.annotation)
        self.assertEqual(out_of_scope.status_code, 200)
        self.assertEqual(out_of_scope.json()["selection"], {
            "id": history.history_id,
            "disposition": "out_of_scope",
            "message": "Past-setting evidence is outside the selected window.",
        })

    def test_history_events_validate_generation_and_both_identity_codecs(self):
        generation = self.client.get("/api/diagnose/findings").json()[
            "analysis_generation"]
        unknown_id = encode_history_id(HistoryIdentity(420, 720, 7.0))

        missing_generation = self.client.get(
            "/api/diagnose/carb-ratio-history/events", params={"history_id": unknown_id})
        malformed_run = self.client.get(
            "/api/diagnose/carb-ratio-history/events", params={
                "history_id": unknown_id,
                "analysis_generation": generation,
                "selected_run_id": "icr1_not-canonical",
            })
        unknown = self.client.get(
            "/api/diagnose/carb-ratio-history/events", params={
                "history_id": unknown_id,
                "analysis_generation": generation,
            })

        self.assertEqual(
            (missing_generation.status_code,
             missing_generation.json()["detail"]["code"]),
            (400, "analysis_generation_required"))
        self.assertEqual(
            (malformed_run.status_code, malformed_run.json()["detail"]["code"]),
            (400, "invalid_history_run_id"))
        self.assertEqual(
            (unknown.status_code, unknown.json()["detail"]["code"]),
            (404, "history_not_found"))

    def test_active_history_events_share_generation_and_exact_membership(self):
        import ciq_autotune.api as api_mod
        from unittest.mock import patch

        meal = datetime(2026, 6, 3, 0, 10)
        run = IcHistoryRunRecord(
            run_id=encode_run_id(RunIdentity(meal)),
            first_member_at=meal.isoformat(), last_member_at=meal.isoformat(),
            member_offsets_min=[0.0], cgm_start_min=-10.0,
            cgm_end_min=20.0, outcome_min=15.0,
        )
        projection, history = _with_history(gen.empty_projection(), runs=[run])
        with patch.object(api_mod, "prepare_findings_projection",
                          lambda *args, **kwargs: projection):
            findings = self.client.get(
                "/api/diagnose/findings", params={"selected_id": history.history_id}).json()
            response = self.client.get(
                "/api/diagnose/carb-ratio-history/events", params={
                    "history_id": history.history_id,
                    "analysis_generation": findings["analysis_generation"],
                    "selected_run_id": run.run_id,
                })

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["analysis_generation"], findings["analysis_generation"])
        self.assertEqual(body["run_ids"], [run.run_id])
        self.assertEqual(body["selected_run_id"], run.run_id)
        self.assertEqual(body["series"][0]["run_id"], run.run_id)

    def test_history_events_reject_generation_change_and_nonmember(self):
        import ciq_autotune.api as api_mod
        from unittest.mock import patch

        meal = datetime(2026, 6, 3, 0, 10)
        run = IcHistoryRunRecord(
            run_id=encode_run_id(RunIdentity(meal)),
            first_member_at=meal.isoformat(), last_member_at=meal.isoformat(),
            member_offsets_min=[0.0], cgm_start_min=-10.0,
            cgm_end_min=20.0, outcome_min=15.0,
        )
        projection, history = _with_history(gen.empty_projection(), runs=[run])
        with patch.object(api_mod, "prepare_findings_projection",
                          lambda *args, **kwargs: projection):
            generation = self.client.get("/api/diagnose/findings").json()["analysis_generation"]
            nonmember = self.client.get(
                "/api/diagnose/carb-ratio-history/events", params={
                    "history_id": history.history_id,
                    "analysis_generation": generation,
                    "selected_run_id": encode_run_id(
                        RunIdentity(meal + timedelta(days=1))),
                })
            self.client.post("/api/carbs", json={
                "t": "2026-06-03 10:05:00", "grams": 8, "certainty": "exact"})
            stale = self.client.get(
                "/api/diagnose/carb-ratio-history/events", params={
                    "history_id": history.history_id,
                    "analysis_generation": generation,
                })

        self.assertEqual((nonmember.status_code, nonmember.json()["detail"]["code"]),
                         (404, "history_run_not_found"))
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()["detail"], {
            "code": "analysis_generation_mismatch",
            "message": "Evidence changed. Refresh findings.",
        })

    def test_history_events_publish_distinct_retirement_outcomes(self):
        import ciq_autotune.api as api_mod
        from ciq_autotune.api import create_app
        from unittest.mock import patch

        cases = (
            ("aged_out", "history_aged_out",
             "Past-setting evidence aged out of the 90-day window."),
            ("unavailable", "history_unavailable",
             "Past-setting evidence no longer maps to one current program block."),
        )
        for lifecycle, code, message in cases:
            with self.subTest(lifecycle=lifecycle):
                # Each mocked projection is an artificial source state. Real
                # stores advance their durable revision between states.
                from ciq_autotune.derived_artifacts import sidecar_path
                pathlib.Path(sidecar_path(self.tmp.name)).unlink(missing_ok=True)
                projection, history = _with_history(
                    gen.empty_projection(), lifecycle=lifecycle)
                client = TestClient(create_app(
                    db_path=self.tmp.name, token=None, enable_fetch_loop=False,
                    analysis_incarnation=f"retirement-{lifecycle}"))
                with patch.object(api_mod, "prepare_findings_projection",
                                  lambda *args, **kwargs: projection):
                    generation = client.get("/api/diagnose/findings", params={
                        "selected_id": history.history_id}).json()["analysis_generation"]
                    response = client.get(
                        "/api/diagnose/carb-ratio-history/events", params={
                            "history_id": history.history_id,
                            "analysis_generation": generation,
                        })
                self.assertEqual(response.status_code, 410)
                self.assertEqual(response.json()["detail"],
                                 {"code": code, "message": message})

    def test_retired_behavioral_event_comparison_route_is_not_served(self):
        response = self.client.get(
            "/api/diagnose/event-comparison", params={"view": "meals"})
        self.assertEqual(response.status_code, 404)

    def test_process_restart_rejects_a_prior_generation(self):
        from ciq_autotune.api import create_app

        first = TestClient(create_app(
            db_path=self.tmp.name, token=None, enable_fetch_loop=False,
            analysis_incarnation="before-restart"))
        restarted = TestClient(create_app(
            db_path=self.tmp.name, token=None, enable_fetch_loop=False,
            analysis_incarnation="after-restart"))
        old_generation = first.get("/api/diagnose/findings").json()["analysis_generation"]
        response = restarted.get(
            "/api/diagnose/carb-ratio-history/events", params={
                "history_id": encode_history_id(HistoryIdentity(420, 720, 7.0)),
                "analysis_generation": old_generation,
            })
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"],
                         "analysis_generation_mismatch")

    def test_bump_during_preparation_retries_before_labeling_the_response(self):
        import ciq_autotune.api as api_mod
        from ciq_autotune.api import create_app
        from unittest.mock import patch

        app = create_app(
            db_path=self.tmp.name, token=None, enable_fetch_loop=False,
            analysis_incarnation="crossed-read")
        client = TestClient(app)
        real = api_mod.prepare_findings_projection
        calls = []

        def crossed(*args, **kwargs):
            calls.append(1)
            result = real(*args, **kwargs)
            if len(calls) == 1:
                app.state.result_cache.bump()
            return result

        with patch.object(api_mod, "prepare_findings_projection", crossed):
            response = client.get("/api/diagnose/findings")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["analysis_generation"], "crossed-read:1")
        self.assertEqual(len(calls), 1)


class FindingEvidenceBlockTest(unittest.TestCase):
    """ADR 41: the verdict band's split is the engine's own closed five-state
    taxonomy, published per finding row so the frontend composes nothing."""

    def setUp(self):
        self.exposures = gen.exposures()["exposures"]
        self.projection = gen.projection()
        self.rows = self.projection.project(WindowQuery.whole_day())["rows"]
        self.row = _row(self.rows, "Over-treated low")

    def test_a_near_miss_or_outranked_occurrence_carries_its_category_and_event_id(self):
        outranked = [e for e in self.row["evidence"] if e["verdict"] == "outranked"]
        self.assertTrue(outranked, "the fixture's over-treated low claims a family "
                                    "another episode also fired in")
        entry = outranked[0]
        self.assertIn("ep_id", entry)
        self.assertIsNotNone(entry["ep_id"])
        self.assertIn("t", entry)
        self.assertIn("date", entry)

    def test_verdict_counts_carries_all_five_categories_zeros_included(self):
        self.assertEqual(set(self.row["verdict_counts"]),
                         {"fired", "outranked", "near_miss", "no_data", "clean"})

    def test_verdict_counts_sums_to_the_appearances_denominator(self):
        total_m = sum(a["m"] for a in self.row["appearances"])
        self.assertEqual(sum(self.row["verdict_counts"].values()), total_m)
        self.assertEqual(len(self.row["evidence"]), total_m)

    def test_fired_count_is_at_least_the_appearances_numerator(self):
        # `appearances.n` counts only occurrences this row's lever WON
        # attribution on; `verdict_counts["fired"]` (finding 2) is broader —
        # row-relative, it also counts an occurrence where this lever's own
        # classifier matched but a DIFFERENT, earlier lever drove the episode
        # (ep11 below), so `fired >= n`, not `fired == n`. Equality is exactly
        # the pre-fix invariant this row-relative rule deliberately breaks.
        total_n = sum(a["n"] for a in self.row["appearances"])
        self.assertGreaterEqual(self.row["verdict_counts"]["fired"], total_n)

    def test_a_shared_calm_judgment_is_outranked_by_the_competing_lever(self):
        occurrence = next(
            o for o in self.exposures["lows"]["occurrences"]
            if o["cause_lever"] == "correction_on_iob"
        )
        self.assertEqual(occurrence["cause_lever"], "correction_on_iob")
        own = next(v for v in occurrence["verdicts"]
                   if v["classifier"] == "over_treated_low")
        self.assertFalse(own["matched"])
        self.assertEqual(own["silence_reason"], "no_trigger")
        entry = next(e for e in self.row["evidence"]
                     if e["ep_id"] == occurrence["ep_id"] and e["t"] == occurrence["t"])
        self.assertEqual(entry["verdict"], "outranked")

    def test_an_occurrence_another_lever_actually_fired_is_outranked_here_not_fired(self):
        # An anchor that IS an episode's own driver reads "fired" at the anchor
        # level (ADR 0019 §2) — but if that lever isn't THIS row's lever, this
        # row must not claim it: it is claimed by another factor.
        other_fired = [e for e in self.row["evidence"]
                       if e["verdict"] == "outranked"
                       and any(o.get("ep_id") == e["ep_id"] and o.get("state") == "fired"
                               for family in self.exposures.values()
                               for o in family["occurrences"])]
        self.assertTrue(other_fired)

    def test_this_levers_own_classifier_matching_reads_fired_row_relative(self):
        # Finding 2: a row's own lever matching its own classifier is `fired`
        # (Meets criteria) whether or not it also drove the episode's
        # attribution — never re-derived from the anchor-level `state`.
        own_matches = [
            o for family in self.exposures.values() for o in family["occurrences"]
            if any(v["classifier"] == "over_treated_low" and v["matched"]
                   for v in o["verdicts"])
        ]
        self.assertTrue(own_matches)
        for occ in own_matches:
            entry = next(e for e in self.row["evidence"] if e["ep_id"] == occ["ep_id"]
                         and e["t"] == occ["t"])
            self.assertEqual(entry["verdict"], "fired")

    def test_all_five_verdict_categories_are_exercised_somewhere_nonzero(self):
        # The public Over-treated-low row gets every row-relative state from
        # analyzer-produced judgments, including a calm classifier read.
        counts = self.row["verdict_counts"]
        for category in ("fired", "outranked", "near_miss", "no_data", "clean"):
            self.assertGreater(counts[category], 0, category)

    def test_all_verdict_counts_reconcile_to_the_evidence_roster(self):
        counts = self.row["verdict_counts"]
        self.assertEqual(sum(counts.values()), len(self.row["evidence"]))
        self.assertEqual(
            {entry["verdict"] for entry in self.row["evidence"]}, set(counts),
        )

    def test_an_explicit_calm_verdict_reads_clean(self):
        # The mirror image of the above: a lever whose classifier DOES emit
        # an explicit non-match (a real matched=False verdict with a calm
        # silence reason) reads `clean`, not `no_data`.
        row = _row(self.rows, "Carb undercount")
        calm_occ = next(
            o for o in self.exposures["meals"]["occurrences"]
            if any(v["classifier"] == "carb_undercount" and not v["matched"]
                   and v["silence_reason"] in (None, "no_trigger") for v in o["verdicts"])
        )
        entry = next(e for e in row["evidence"] if e["ep_id"] == calm_occ["ep_id"]
                     and e["t"] == calm_occ["t"])
        self.assertEqual(entry["verdict"], "clean")

    def test_verdict_counts_by_family_shares_a_denominator_with_the_roster(self):
        # Finding 1: the band and the roster it scopes must agree on "N of M"
        # for the SAME family, not the row's cross-family total.
        by_family = self.row["verdict_counts_by_family"]
        self.assertEqual(set(by_family), {"lows"})
        for family, counts in by_family.items():
            family_m = sum(1 for e in self.row["evidence"] if e["family"] == family)
            self.assertEqual(sum(counts.values()), family_m)
        total = self.row["verdict_counts"]
        summed = {category: sum(counts[category] for counts in by_family.values())
                  for category in total}
        self.assertEqual(summed, total)

    def test_linked_rebound_does_not_inject_a_second_low_verdict(self):
        fired = next(o for o in self.exposures["lows"]["occurrences"]
                     if o["cause_lever"] == "over_treated_low")
        fired_rows = [e for e in self.row["evidence"] if e["ep_id"] == fired["ep_id"]]
        self.assertEqual(len(fired_rows), 1)
        self.assertEqual(fired_rows[0]["family"], "lows")

    def test_served_occurrence_sentences_join_no_clauses_with_an_em_dash(self):
        # ADR 451: an Occurrence's served sentence and every classifier's detail
        # beside it print in the desk's Occurrence facts, so none joins its
        # clauses with an em dash (DESIGN.md, Voice and user-copy register, rule 1).
        from ciq_autotune.explore_exposures import build_exposures

        cgm, bolus = gen._over_treated_fixture_events()
        produced = build_exposures(gen._ScenarioFixtureStore(cgm, bolus))["exposures"]
        occurrences = [occ for family in produced.values() for occ in family["occurrences"]]
        sentences = [occ["text"] for occ in occurrences if occ["text"]] + [
            verdict["detail"] for occ in occurrences for verdict in occ["verdicts"]]
        # The population reaches an attributed low, its rebound and the context gate.
        self.assertTrue(any("over-treated" in text for text in sentences))
        self.assertTrue(any("from-flat meal climb" in text for text in sentences))
        for text in sentences:
            self.assertNotIn("—", text)

    def test_cross_family_episode_pair_is_emitted_by_the_real_producer(self):
        from ciq_autotune.explore_exposures import build_exposures

        cgm, bolus = gen._over_treated_fixture_events()
        produced = build_exposures(gen._ScenarioFixtureStore(cgm, bolus))["exposures"]
        fired = next(o for o in self.exposures["lows"]["occurrences"]
                     if o["cause_lever"] == "over_treated_low")
        rebound = next(o for o in self.exposures["highs"]["occurrences"]
                       if o["ep_id"] == fired["ep_id"])

        self.assertIn(fired, produced["lows"]["occurrences"])
        self.assertIn(rebound, produced["highs"]["occurrences"])
        # The generator reads its six selected occurrences back from the frozen
        # fixture and never runs this producer, so each is held equal to it here:
        # every served sentence included, the outranked low's correction-on-IOB
        # detail among them (ADR 451). The frozen slice never carried
        # `outcome_minute` for five of the six, so it is left out of the match.
        def unstamped(occurrence):
            return {key: value for key, value in occurrence.items()
                    if key != "outcome_minute"}

        selected = gen._real_over_treated_low_occurrences()
        self.assertEqual(set(selected), {"fired", "rebound", "near_miss", "clean",
                                         "no_data", "outranked"})
        for name, item in selected.items():
            family = "highs" if name == "rebound" else "lows"
            with self.subTest(occurrence=name):
                live = [unstamped(occ) for occ in produced[family]["occurrences"]
                        if occ["ep_id"] == item["ep_id"] and occ["t"] == item["t"]]
                self.assertEqual(live, [unstamped(item)])
        self.assertEqual(rebound["ep_id"], fired["ep_id"])
        self.assertEqual(fired["t"], "2026-08-13 13:55:00")
        self.assertEqual(rebound["t"], "2026-08-13 14:35:00")
        self.assertEqual(fired["outcome_minute"], 14 * 60 + 35)


class HeadlineTest(unittest.TestCase):
    """#306 ADR "Every findings row carries one served headline": every row
    published from ``FindingsProjection.project`` carries a composed sentence
    built only from the row's own served fields (or, for correction factor, the
    ISF rest-window evidence used purely as a coherence check).
    """

    def _project(self, analysis, *, exposures=None, scenarios=None, window=None):
        # A scoped window, never `whole_day()`: the unscoped GLOBAL queue is
        # asserting-only (term 38) and would silently drop every held/blind
        # fixture this test builds.
        projection = FindingsProjection(
            _analysis=analysis,
            _exposures=exposures or {"exposures": {}},
            _scenarios=scenarios or {"patterns": [], "low_confidence": []},
            _outcome_patterns=[],
        )
        return projection.project(window or WindowQuery.clock(1, DAY_MINUTES))["rows"]

    # --- basal --------------------------------------------------------------

    def test_basal_assert_single_slot_headline(self):
        analysis = {"window_days": 30, "basal": [{
            "slot": 0, "asserts_move": True, "direction": "lower",
            "current": 0.60, "recommended": 0.48,
            "estimate": {"value": 0.48}, "days": 30,
            "annotation": "one cautious step down is supported at this time",
        }], "isf": [], "ic_blocks": []}
        row = self._project(analysis)[0]
        self.assertEqual(
            row["headline"],
            "One cautious step down is supported at this time. Delivered "
            "0.48 U/h across 30 steady nights against 0.60 programmed.")

    def test_basal_assert_merged_headline_names_no_single_rate(self):
        slot = lambda index, days: {
            "slot": index, "asserts_move": True, "direction": "raise",
            "current": 0.80, "recommended": 1.1, "estimate": {"value": 1.1},
            "days": days,
            "annotation": "a step up, limited to 20% above the set rate",
        }
        analysis = {"window_days": 30, "basal": [slot(10, 21), slot(11, 19)],
                    "isf": [], "ic_blocks": []}
        row = self._project(analysis)[0]
        self.assertIsNone(row["current"])
        self.assertEqual(
            row["headline"],
            "A step up, limited to 20% above the set rate. Delivered above "
            "the programmed rate across 19 steady nights.")
        self.assertNotIn("0.8", row["headline"])
        self.assertNotIn("1.1", row["headline"])

    def test_basal_held_single_slot_headline(self):
        analysis = {"window_days": 30, "basal": [{
            "slot": 0, "asserts_move": False,
            "safety_status": str(Status.INSUFFICIENT),
            "current": 0.60, "recommended": 0.48,
            "estimate": {"value": 0.48}, "days": 7,
            "annotation": "not enough nights of steady data yet to point one way",
        }], "isf": [], "ic_blocks": []}
        row = self._project(analysis)[0]
        self.assertEqual(row["register"], "held")
        self.assertEqual(
            row["headline"],
            "Not enough nights of steady data yet to point one way. "
            "Delivered 0.48 U/h across 7 steady nights against 0.60 "
            "programmed.")

    def test_basal_held_merged_with_lean_headline(self):
        slot = lambda index: {
            "slot": index, "asserts_move": False,
            "safety_status": str(Status.INSUFFICIENT),
            "current": 1.10, "recommended": 0.95, "estimate": {"value": 0.95},
            "days": 18,
            "annotation": "not enough nights of steady data yet to point one way",
        }
        analysis = {"window_days": 30, "basal": [slot(25), slot(26)],
                    "isf": [], "ic_blocks": []}
        row = self._project(analysis)[0]
        self.assertIsNone(row["current"])
        self.assertEqual(row["lean"], "lower")
        self.assertEqual(
            row["headline"],
            "Not enough nights of steady data yet to point one way. "
            "Delivered below the programmed rate across 18 steady nights.")

    def test_basal_held_merged_with_no_lean_states_only_the_count(self):
        slot = lambda index: {
            "slot": index, "asserts_move": False,
            "safety_status": str(Status.NO_BASELINE),
            "current": None, "recommended": 1.0, "estimate": {"value": 1.0},
            "days": 10,
            "annotation": "no set rate to step from, so only the measured range is shown",
        }
        analysis = {"window_days": 30, "basal": [slot(30), slot(31)],
                    "isf": [], "ic_blocks": []}
        row = self._project(analysis)[0]
        self.assertIsNone(row["lean"])
        self.assertEqual(
            row["headline"],
            "No set rate to step from, so only the measured range is "
            "shown. 10 steady nights delivered so far.")

    def test_basal_blind_headline_names_the_withheld_move_and_its_reason(self):
        analysis = {"window_days": 30, "basal": [{
            "slot": 0, "asserts_move": False,
            "safety_status": str(Status.NO_DATA),
            "current": 1.0, "recommended": None, "estimate": {"value": None},
            "days": 0, "annotation": "no nights of steady data at this time yet",
        }], "isf": [], "ic_blocks": []}
        row = self._project(analysis)[0]
        self.assertEqual(row["register"], "blind")
        self.assertEqual(
            row["headline"],
            "No steady nights delivered against the programmed rate here, "
            "so nothing to say either way.")

    # --- correction factor (ISF) --------------------------------------------

    def _isf_analysis(self, *, register):
        direction = "strengthen" if register == "assert" else None
        row = {
            "parameter": "isf", "current": 40.0, "recommended": 24.0,
            "estimate": {"value": 23.9974, "n_clusters": 1},
            "asserts_move": register == "assert",
            "evidence": {
                "direction": direction,
                "rest_windows": [{"date": "2026-06-01"}],
                "n_steps": 2,
            },
            "annotation": (
                "overnight you look more sensitive to insulin than the set "
                "value, so corrections can run a little stronger"
                if register == "assert" else
                "rescue-carb history doesn't cover this window"
            ),
        }
        # No `_isf_rest_window_steps`: the harness shape. `execute_case` and
        # `scripts/gen_findings_projection_fixtures.py` never stamp that key —
        # only the live `/api/analyze` path does (`ciq_autotune/api.py`'s
        # `canonical_pooled_analysis`) — and the ISF templates below read no
        # slot from it, so its absence must never change the served sentence.
        return {"window_days": 30, "basal": [], "ic_blocks": [], "isf": [row]}

    def test_correction_factor_assert_headline_with_no_retained_steps(self):
        row = self._project(self._isf_analysis(register="assert"))[0]
        self.assertEqual(row["register"], "assert")
        self.assertEqual(
            row["headline"],
            "Overnight you look more sensitive to insulin than the set "
            "value, so corrections can run a little stronger. Measured 1 U "
            ": 24.0 mg/dL across 0 fasting nights against 1 U : 40 mg/dL "
            "programmed.")

    def test_correction_factor_held_headline(self):
        row = self._project(self._isf_analysis(register="held"))[0]
        self.assertEqual(row["register"], "held")
        self.assertEqual(
            row["headline"],
            "No direction is called: rescue-carb history doesn't cover "
            "this window. 0 fasting nights measured against 1 U : 40 "
            "mg/dL programmed.")

    def test_correction_factor_held_headline_with_no_programmed_value(self):
        """No current, no "None" (must-prevent). ``analyzers/isf.py`` returns
        direction ``None`` with annotation "measured; no set value to compare"
        when the programmed value is ``None``; the served headline must drop
        the "against ... programmed" clause rather than print "None"."""
        analysis = self._isf_analysis(register="held")
        analysis["isf"][0]["current"] = None
        analysis["isf"][0]["annotation"] = "measured; no set value to compare"
        row = self._project(analysis)[0]
        self.assertEqual(row["register"], "held")
        self.assertNotIn("None", row["headline"])
        self.assertEqual(
            row["headline"],
            "No direction is called: measured; no set value to compare. "
            "0 fasting nights measured.")

    # --- carb ratio (I:C) ----------------------------------------------------

    def test_carb_ratio_assert_headline(self):
        analysis = {"window_days": 30, "basal": [], "isf": [], "ic_blocks": [{
            "block_id": 0, "start_min": 0, "end_min": 60, "label": "Breakfast",
            "asserts_move": True, "direction": "raise",
            "current_values": [10], "recommended": 12, "estimate": {"value": 12},
            "n_runs": 8,
            "annotation": ("meals look slightly over-covered relative to the "
                           "programmed carb ratio"),
        }]}
        row = self._project(analysis)[0]
        self.assertEqual(
            row["headline"],
            "Meals look slightly over-covered relative to the programmed carb ratio. "
            "Measured 12 g/U across 8 meal runs against 10 programmed.")

    def test_carb_ratio_held_headline_strips_the_held_at_current_tail(self):
        analysis = {"window_days": 30, "basal": [], "isf": [], "ic_blocks": [{
            "block_id": 0, "start_min": 0, "end_min": 60, "label": "Dinner",
            "asserts_move": False, "held_reason": "pre-empted low; held at current",
            "current_values": [10], "recommended": None, "estimate": {"value": 8},
            "n_runs": 8, "annotation": None,
        }]}
        row = self._project(analysis)[0]
        self.assertEqual(row["register"], "held")
        self.assertEqual(
            row["headline"],
            "Held at current: pre-empted low. Measured 8 g/U across 8 "
            "meal runs against 10 programmed.")

    def test_carb_ratio_held_headline_with_no_current_values(self):
        """No `current_values`, no "None" (must-prevent): the held sentence
        drops the "against ... programmed" clause rather than print "None"."""
        analysis = {"window_days": 30, "basal": [], "isf": [], "ic_blocks": [{
            "block_id": 0, "start_min": 0, "end_min": 60, "label": "Dinner",
            "asserts_move": False, "held_reason": "pre-empted low; held at current",
            "current_values": [], "recommended": None, "estimate": {"value": 8},
            "n_runs": 8, "annotation": None,
        }]}
        row = self._project(analysis)[0]
        self.assertEqual(row["register"], "held")
        self.assertNotIn("None", row["headline"])
        self.assertEqual(
            row["headline"],
            "Held at current: pre-empted low. Measured 8 g/U across 8 "
            "meal runs.")

    # --- event comparison (finding) ------------------------------------------

    def test_event_comparison_headline_ranks_and_does_not_rank(self):
        rows = gen.projection().project(WindowQuery.whole_day())["rows"]
        ranking = _row(rows, "Over-treated low")
        not_ranking = _row(rows, "Correction on active insulin")
        self.assertEqual(ranking["tier"], "worth_a_look")
        self.assertEqual(
            ranking["headline"],
            "Ranks among this window's findings. Showed up in 1 of 5 lows "
            "in this window.")
        self.assertEqual(not_ranking["tier"], "noted")
        self.assertEqual(
            not_ranking["headline"],
            "Not ranked in this window yet. Showed up in 1 of 5 lows in "
            "this window.")

    # --- past setting (history) -----------------------------------------------

    def test_past_setting_history_headline(self):
        projection, history = _with_history(
            gen.empty_projection(), regime_end="2026-08-01T12:00:00")
        rows = projection.project(WindowQuery.whole_day())["rows"]
        history_row = next(item for item in rows
                           if item["id"] == history.history_id)
        self.assertEqual(
            history_row["headline"],
            "Past setting, no change suggested. Measured 4.6 g/U across 3 "
            "meal runs while 5 was programmed, until 2026-08-01. "
            "Programmed now: 6.")

    # --- coverage + determinism ------------------------------------------------

    def test_nine_family_and_register_pairs_all_carry_a_non_empty_headline(self):
        basal_assert = {"slot": 0, "asserts_move": True, "direction": "lower",
                        "current": 0.60, "estimate": {"value": 0.48}, "days": 30,
                        "annotation": "one cautious step down is supported at this time"}
        basal_held = {"slot": 1, "asserts_move": False,
                      "safety_status": str(Status.INSUFFICIENT),
                      "current": 1.10, "estimate": {"value": 1.26}, "days": 21,
                      "annotation": "not enough nights of steady data yet to point one way"}
        basal_blind = {"slot": 2, "asserts_move": False,
                       "safety_status": str(Status.NO_DATA),
                       "current": 1.0, "estimate": {"value": None}, "days": 0,
                       "annotation": "no nights of steady data at this time yet"}
        ic_assert = {"block_id": 0, "start_min": 0, "end_min": 60, "label": "Breakfast",
                    "asserts_move": True, "direction": "raise",
                    "current_values": [10], "estimate": {"value": 12}, "n_runs": 8,
                    "annotation": ("meals look slightly over-covered relative to the "
                                   "programmed carb ratio")}
        ic_held = {"block_id": 1, "start_min": 720, "end_min": 780, "label": "Dinner",
                  "asserts_move": False, "held_reason": "pre-empted low; held at current",
                  "current_values": [10], "estimate": {"value": 8}, "n_runs": 8,
                  "annotation": None}
        analysis = {
            "window_days": 30,
            "basal": [basal_assert, basal_held, basal_blind],
            "ic_blocks": [ic_assert, ic_held],
            "isf": self._isf_analysis(register="assert")["isf"],
        }
        projection, _history = _with_history(
            FindingsProjection(_analysis=analysis, _exposures=gen.exposures(),
                               _scenarios=gen.scenarios(), _outcome_patterns=[]))
        rows = projection.project(WindowQuery.clock(1, DAY_MINUTES))["rows"]
        pairs = set()
        for row in rows:
            if row["kind"] == "habit":
                pairs.add(("finding", "habit"))
            else:
                pairs.add((row["register"], row.get("parameter") or row["kind"]))
        # ISF is one row for the whole day (term 31), so assert and held can never
        # coexist in one analysis; `('held', 'isf')` is covered by
        # `test_correction_factor_held_headline` instead. The other eight of the
        # nine family-and-register pairs are exercised together here.
        expected = {
            ("assert", "basal_rate"), ("held", "basal_rate"), ("blind", "basal_rate"),
            ("assert", "carb_ratio"), ("held", "carb_ratio"),
            ("assert", "isf"),
            ("finding", "habit"),
            ("history", "carb_ratio"),
        }
        self.assertTrue(expected.issubset(pairs), pairs)
        for row in rows:
            self.assertTrue(row["headline"], row)

    def test_every_headline_leads_with_its_verdict_sentence(self):
        # The nine family-and-register pairs' first sentence must BE the
        # expected verdict/hold/rank/past-setting sentence — this test builds
        # or reuses one row of every pair: basal assert/held/blind (3), carb
        # ratio assert/held (2), correction factor assert/held (2, from two
        # separate one-row-per-day analyses since assert and held can never
        # coexist in a single ISF analysis), the event-comparison finding
        # pair rendered both ways (2), and past setting/history (1).
        basal_assert = {"slot": 0, "asserts_move": True, "direction": "lower",
                        "current": 0.60, "estimate": {"value": 0.48}, "days": 30,
                        "annotation": "one cautious step down is supported at this time"}
        basal_held = {"slot": 1, "asserts_move": False,
                      "safety_status": str(Status.INSUFFICIENT),
                      "current": 1.10, "estimate": {"value": 1.26}, "days": 21,
                      "annotation": "not enough nights of steady data yet to point one way"}
        basal_blind = {"slot": 2, "asserts_move": False,
                       "safety_status": str(Status.NO_DATA),
                       "current": 1.0, "estimate": {"value": None}, "days": 0,
                       "annotation": "no nights of steady data at this time yet"}
        ic_assert = {"block_id": 0, "start_min": 0, "end_min": 60, "label": "Breakfast",
                    "asserts_move": True, "direction": "raise",
                    "current_values": [10], "estimate": {"value": 12}, "n_runs": 8,
                    "annotation": ("meals look slightly over-covered relative to the "
                                   "programmed carb ratio")}
        ic_held = {"block_id": 1, "start_min": 720, "end_min": 780, "label": "Dinner",
                  "asserts_move": False, "held_reason": "pre-empted low; held at current",
                  "current_values": [10], "estimate": {"value": 8}, "n_runs": 8,
                  "annotation": None}
        analysis = {
            "window_days": 30,
            "basal": [basal_assert, basal_held, basal_blind],
            "ic_blocks": [ic_assert, ic_held],
            "isf": self._isf_analysis(register="assert")["isf"],
        }
        projection, _history = _with_history(
            FindingsProjection(_analysis=analysis, _exposures=gen.exposures(),
                               _scenarios=gen.scenarios(), _outcome_patterns=[]))
        rows = projection.project(WindowQuery.clock(1, DAY_MINUTES))["rows"]
        isf_held_row = self._project(self._isf_analysis(register="held"))[0]
        finding_rows = gen.projection().project(WindowQuery.whole_day())["rows"]
        ranking = _row(finding_rows, "Over-treated low")
        not_ranking = _row(finding_rows, "Correction on active insulin")

        def first_sentence(headline):
            head, sep, _rest = headline.partition(". ")
            return head + "." if sep else head

        expected_by_key = {
            ("assert", "basal_rate"):
                "One cautious step down is supported at this time.",
            ("held", "basal_rate"):
                "Not enough nights of steady data yet to point one way.",
            ("blind", "basal_rate"):
                "No steady nights delivered against the programmed rate "
                "here, so nothing to say either way.",
            ("assert", "carb_ratio"):
                "Meals look slightly over-covered relative to the programmed carb ratio.",
            ("held", "carb_ratio"): "Held at current: pre-empted low.",
            ("assert", "isf"):
                "Overnight you look more sensitive to insulin than the set "
                "value, so corrections can run a little stronger.",
        }
        seen = set()
        for row in rows:
            key = (row["register"], row.get("parameter") or row["kind"])
            if key == ("history", "carb_ratio"):
                self.assertEqual(
                    first_sentence(row["headline"]),
                    "Past setting, no change suggested.")
                seen.add(key)
                continue
            if key not in expected_by_key:
                continue
            self.assertEqual(first_sentence(row["headline"]), expected_by_key[key])
            seen.add(key)
        self.assertEqual(seen, {*expected_by_key, ("history", "carb_ratio")})

        self.assertEqual(
            first_sentence(isf_held_row["headline"]),
            "No direction is called: rescue-carb history doesn't cover "
            "this window.")
        self.assertEqual(
            first_sentence(ranking["headline"]),
            "Ranks among this window's findings.")
        self.assertEqual(
            first_sentence(not_ranking["headline"]),
            "Not ranked in this window yet.")

        for row in [*rows, isf_held_row, ranking, not_ranking]:
            headline = row["headline"]
            head = first_sentence(headline)
            self.assertFalse(
                head.startswith("Delivered"),
                f"{row.get('register')}/{row.get('parameter') or row['kind']}: "
                f"{headline!r}")
            self.assertFalse(
                head.startswith("Measured"),
                f"{row.get('register')}/{row.get('parameter') or row['kind']}: "
                f"{headline!r}")

    def test_rerun_of_the_same_window_yields_the_same_headline(self):
        projection = gen.projection()
        first = projection.project(WindowQuery.whole_day())["rows"]
        second = projection.project(WindowQuery.whole_day())["rows"]
        self.assertEqual([row["headline"] for row in first],
                         [row["headline"] for row in second])

    def test_no_committed_fixture_headline_prints_the_string_none(self):
        """A blanket sweep over the committed fixture set: no served headline,
        in any window or case the generator built, ever prints the string
        "None" — the same must-prevent the two targeted tests above cover for
        a null-programmed-value ISF or carb-ratio held row, checked here
        against everything actually shipped."""
        fixture_path = (pathlib.Path(__file__).resolve().parents[1]
                         / "frontend" / "__fixtures__" / "findings-projection.json")
        fixture = json.loads(fixture_path.read_text())

        def headlines(node):
            if isinstance(node, dict):
                headline = node.get("headline")
                if isinstance(headline, str):
                    yield headline
                for value in node.values():
                    yield from headlines(value)
            elif isinstance(node, list):
                for item in node:
                    yield from headlines(item)

        found = list(headlines(fixture))
        self.assertGreater(len(found), 0)
        for headline in found:
            self.assertNotIn("None", headline)


if __name__ == "__main__":
    unittest.main()


class ExplicitOutcomeWitnessTest(unittest.TestCase):
    def test_explicit_witness_precedes_static_kind_for_both_directions(self):
        from ciq_autotune.window_membership import outcome_minute
        for minute in (30, 1380):
            occurrence = {"cause_lever": "carb_undercount", "ep_id": "episode",
                          "t": "2026-08-01 12:00:00", "outcome_minute": minute}
            self.assertEqual(outcome_minute(occurrence, {"exposures": {}}), minute)

    def test_fallback_uses_latest_timestamp_across_midnight_not_largest_clock_minute(self):
        from ciq_autotune.window_membership import outcome_minute

        occurrence = {
            "cause_lever": "over_treated_low", "ep_id": "overnight-rebound",
            "t": "2026-08-01 22:30:00",
        }
        exposures = {"exposures": {
            "lows": {"occurrences": [occurrence]},
            "highs": {"occurrences": [
                {"ep_id": "overnight-rebound", "kind": "high",
                 "t": "2026-08-01 23:30:00"},
                {"ep_id": "overnight-rebound", "kind": "high",
                 "t": "2026-08-02 00:30:00"},
            ]},
        }}

        self.assertEqual(outcome_minute(occurrence, exposures), 30)

    def test_habit_only_member_is_nested_without_becoming_a_rate_lever(self):
        projection = gen.projection()
        pattern = next(p for p in projection._outcome_patterns
                       if p["key"] == "highs_after_meals")
        pattern["members"].append({"kind": "habit", "subject": "habit:missed_meal"})
        source = projection_row(id="finding:missed_meal", register="finding", kind="habit",
                                lever="missed_meal", appearances=[], title="Missed meal")
        projection._pattern_rows([source], WindowQuery.whole_day())
        self.assertEqual(source["claimed_by"], "pattern:highs_after_meals")
        self.assertNotIn("habit:missed_meal", pattern["rate_levers"])


class LateBolusCauseRowTest(unittest.TestCase):
    """ADR 461: the Late bolus Cause row counts only meals that ran high."""

    def _cause(self, post_peak):
        from ciq_autotune.analyzers.scenario import build_scenarios
        from ciq_autotune.explore_exposures import build_exposures
        from ciq_autotune.store import Store
        from tests.test_outcome_patterns import write_late_meals

        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                write_late_meals(store, post_peak=post_peak)
                projection = prepare_findings_projection(
                    analysis={}, exposures=build_exposures(store),
                    scenarios=build_scenarios(store).to_dict(),
                ).project(WindowQuery.whole_day(), None)
        return next((r for r in projection["rows"] if r.get("id") == "finding:late_bolus"), None)

    def test_late_meals_that_stayed_in_range_serve_no_cause_row(self):
        self.assertIsNone(self._cause(165.0))

    def test_late_meals_that_ran_high_read_as_running_high(self):
        cause = self._cause(240.0)
        self.assertEqual([s["sentence"] for s in cause["count_sentences"]],
                         ["14 of 14 meals ran high"])
