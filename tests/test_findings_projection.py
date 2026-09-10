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
from dataclasses import replace
from datetime import datetime, timedelta
from unittest.mock import patch

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

from ciq_autotune.analyzers.isf import analyze_isf
from ciq_autotune.analyzers.scenario.levers import Lever, outcome_kind
from ciq_autotune.analyzers.scenario.evidence_population import policy_for
from ciq_autotune.analyzers.scenario.outcome_patterns import _ROSTER
from ciq_autotune.analyzers.tuning_priority import build_tuning_levers
from ciq_autotune.findings_projection import (
    _EVENT_CHART_FAMILIES,
    _PATTERN_CHIPS,
    _chips_for,
    _row as projection_row,
    FindingsProjection,
    PATTERN_SUBJECTS,
    WindowQuery,
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
from tests.test_analyzer_isf import ISF_36, rw, synth_night

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
            self.assertIn(outcome_kind(lever), {"low", "high", "meal", "correction", "sequence"},
                          f"{lever.value} declares no outcome anchor")

    def test_a_family_denominator_never_undercounts_what_it_denominates(self):
        for bounds in (None, LOW_BLOCK, REBOUND, MORNING, AFTERNOON, (22 * 60, 2 * 60)):
            query = (WindowQuery.whole_day() if bounds is None
                     else WindowQuery.clock(*bounds))
            for row in self.projection.project(query)["rows"]:
                for appearance in row["appearances"] or []:
                    self.assertLessEqual(appearance["n"], appearance["m"],
                                         f"{row['title']} in {bounds}")


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
        isf = _row(rows, "ISF")
        self.assertEqual(isf["register"], "held")
        self.assertIsNone(isf["direction"])
        self.assertIs(isf["asserts_move"], False)

    def test_a_held_reason_is_the_analyzers_own_string(self):
        # Byte-identical, both flavors: the queue transcribes, it never rewords.
        analysis = self.projection._analysis
        rows = self.projection.project(WindowQuery.clock(*AFTERNOON))["rows"]
        self.assertEqual(_row(rows, "ISF")["reason"], analysis["isf"][0]["annotation"])
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

    def test_a_window_wrapping_midnight_reaches_both_sides_of_it(self):
        rows = self.projection.project(WindowQuery.clock(22 * 60, 2 * 60))["rows"]
        self.assertIn("Basal 00:30 to 01:30 · raise", _titles(rows, "assert"))
        self.assertIn("I:C 12:00 to 24:00 · lower", _titles(rows, "assert"))


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
            "highs": 2, "lows": 1, "meals": 0, "corrections": 1,
        })

        global_counts = self.projection.project(WindowQuery.whole_day())["chip_counts"]
        self.assertTrue(all(global_counts[chip] > 0
                            for chip in ("highs", "lows", "meals", "corrections")),
                        global_counts)

        raise_case = gen.payload()["settings_cases"]["carb_ratio_raise"]
        self.assertEqual(_row(raise_case["rows"], "I:C 00:00 to 12:00 · raise")["chips"],
                         ["lows"])

    def test_episode_levers_chip_by_their_closed_outcome_kind(self):
        levers = [lever for lever in Lever if policy_for(lever).recurrence_noun != "sequences"]
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
            if row["lever"] == Lever.MEAL_BOLUS_SHORT.value:
                self.assertEqual(row["chips"], ["highs", "meals"], row["lever"])
            else:
                self.assertEqual(row["chips"], [expected], row["lever"])


class MealBolusShortPopulationProjectionTest(unittest.TestCase):
    def test_one_off_keeps_its_attributed_meal_occurrence_below_the_pattern_gate(self):
        from tests.test_meal_bolus_short_attribution import (
            UNDERDOSED_BOLUS, UNDERDOSED_CGM, _projection, _seed,
        )

        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                _seed(store, UNDERDOSED_BOLUS, UNDERDOSED_CGM)
                projection = _projection(store)
                rows = projection.project(WindowQuery.whole_day())["rows"]
                scoped_rows = projection.project(WindowQuery.clock(810, 900))["rows"]

        row = next(
            item for item in rows
            if item["lever"] == Lever.MEAL_BOLUS_SHORT.value
        )
        self.assertEqual(row["appearances"], [{
            "family": "meals", "noun": "meals", "n": 1, "m": 1,
        }])
        self.assertEqual(row["episodes"], 1)
        scoped = next(
            item for item in scoped_rows
            if item["lever"] == Lever.MEAL_BOLUS_SHORT.value
        )
        self.assertEqual(scoped["appearances"], [{
            "family": "meals", "noun": "meals", "n": 1, "m": 1,
        }])
        self.assertEqual(scoped["episodes"], 1)

    def test_two_highs_from_one_meal_count_as_one_served_meal_occurrence(self):
        from tests.test_meal_bolus_short_attribution import (
            DOUBLE_HIGH_BOLUS, DOUBLE_HIGH_CGM, _projection, _seed, next_day,
        )
        from ciq_autotune import finding_case_file
        from ciq_autotune.analyze import analyze
        from ciq_autotune.analyzers.scenario import build_scenarios
        from ciq_autotune.explore_exposures import build_exposures

        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                bolus = DOUBLE_HIGH_BOLUS + next_day(DOUBLE_HIGH_BOLUS)
                cgm = DOUBLE_HIGH_CGM + next_day(DOUBLE_HIGH_CGM)
                _seed(store, bolus, cgm)
                rows = _projection(store).project(WindowQuery.whole_day())["rows"]
                prepared = finding_case_file.prepare(
                    store, query=WindowQuery.whole_day(), version=0,
                    analysis=analyze(
                        store, pool_agreeing_basal_regimes=True,
                        carb_entries=store.carb_entries(),
                        prompt_responses=store.prompt_responses(),
                    ).to_dict(),
                    exposures=build_exposures(store), scenarios=build_scenarios(store).to_dict(),
                )

        row = next(item for item in rows if item["lever"] == Lever.MEAL_BOLUS_SHORT.value)
        self.assertEqual(row["appearances"], [{
            "family": "meals", "noun": "meals", "n": 2, "m": 2,
        }])
        self.assertEqual(row["episodes"], 2)
        case = prepared.case("finding:meal_bolus_short", "event", None)
        self.assertIsNotNone(case)

    def test_public_producers_dedup_meal_bolus_short_against_carb_undercount(self):
        from ciq_autotune.analyzers.scenario import build_scenarios
        from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns
        from ciq_autotune.explore_exposures import build_exposures
        from tests.test_meal_bolus_short_attribution import (
            LATE_SECOND_MEAL_BOLUS, LATE_SECOND_MEAL_CGM, _seed, next_day,
        )

        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                _seed(
                    store,
                    LATE_SECOND_MEAL_BOLUS + next_day(LATE_SECOND_MEAL_BOLUS),
                    LATE_SECOND_MEAL_CGM + next_day(LATE_SECOND_MEAL_CGM),
                )
                with (
                    patch("ciq_autotune.explore_exposures._effective_isf", return_value=45.0),
                    patch("ciq_autotune.analyzers.scenario.engine._effective_isf", return_value=45.0),
                ):
                    exposures = build_exposures(store)
                    scenarios = build_scenarios(store).to_dict()

        outcome_patterns = build_outcome_patterns({}, exposures, scenarios)
        pattern = next(item for item in outcome_patterns
                       if item["key"] == "highs_after_meals")
        meals = exposures["exposures"]["meals"]["occurrences"]
        shared = [item for item in meals if {
            "carb_undercount", "meal_bolus_short",
        }.issubset(item["attributed_levers"])]
        self.assertEqual(len(shared), 2)
        self.assertEqual((pattern["k"], pattern["n"]), (4, 4))
        self.assertNotIn("habit:meal_bolus_short",
                         {member["subject"] for member in pattern["members"]})
        self.assertNotEqual(pattern["action"], "habit:meal_bolus_short")
        self.assertIsNone(next(item for item in scenarios["patterns"]
                               if item["lever"] == "meal_bolus_short")
                          ["guidance"]["action_id"])

    def test_public_meal_bolus_short_row_is_claimed_by_its_pattern(self):
        from ciq_autotune import finding_case_file
        from ciq_autotune.analyzers.scenario import build_scenarios
        from ciq_autotune.analyzers.scenario.outcome_patterns import build_outcome_patterns
        from ciq_autotune.explore_exposures import build_exposures
        from tests.test_meal_bolus_short_attribution import (
            LATE_SECOND_MEAL_BOLUS, LATE_SECOND_MEAL_CGM, _seed, next_day,
        )
        from tests.test_scenario_engine import cgm_flat, cgm_ramp

        short_bolus = [
            replace(LATE_SECOND_MEAL_BOLUS[0], carbs=100, carb_ratio=5),
            LATE_SECOND_MEAL_BOLUS[1],
            replace(LATE_SECOND_MEAL_BOLUS[2], carbs=100, carb_ratio=5),
        ]
        other_cgm = []
        other_bolus = []
        for day in (14, 15):
            other_cgm.extend(
                cgm_flat(day, 5, 40, 120, 30)
                + cgm_ramp(day, 6, 10, 120, 2, 60)
                + cgm_ramp(day, 7, 10, 360, -2, 60)
                + cgm_flat(day, 20, 30, 120, 30)
                + cgm_ramp(day, 21, 0, 120, 2, 60)
                + cgm_ramp(day, 22, 0, 360, -2, 60)
            )
            other_bolus.extend([
                BolusEvent(datetime(2026, 6, day, 6, 40), completion="Completed",
                           insulin=20, carbs=100, carb_ratio=5),
                BolusEvent(datetime(2026, 6, day, 21), completion="Completed",
                           insulin=3, carbs=30, carb_ratio=10),
            ])

        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            with Store.open(database.name) as store:
                _seed(
                    store,
                    short_bolus + next_day(short_bolus) + other_bolus,
                    LATE_SECOND_MEAL_CGM + next_day(LATE_SECOND_MEAL_CGM) + other_cgm,
                )
                with (
                    patch("ciq_autotune.explore_exposures._effective_isf", return_value=45.0),
                    patch("ciq_autotune.analyzers.scenario.engine._effective_isf", return_value=45.0),
                    patch("ciq_autotune.finding_case_file._effective_isf", return_value=45.0),
                ):
                    exposures = build_exposures(store)
                    scenarios = build_scenarios(store).to_dict()
                    case = finding_case_file.prepare(
                        store, query=WindowQuery.whole_day(), version=0,
                        analysis={"window_days": 30}, exposures=exposures,
                        scenarios=scenarios,
                    ).case("pattern:highs_after_meals", "event", None)
                outcome_patterns = build_outcome_patterns({}, exposures, scenarios)
                projection = FindingsProjection(
                    _analysis={"window_days": 30}, _exposures=exposures,
                    _scenarios=scenarios, _outcome_patterns=outcome_patterns,
                ).project(WindowQuery.whole_day())

        pattern = next(item for item in outcome_patterns
                       if item["key"] == "highs_after_meals")
        row = next(item for item in projection["rows"]
                   if item.get("lever") == Lever.MEAL_BOLUS_SHORT.value)

        self.assertEqual((pattern["k"], pattern["n"]), (6, 8))
        self.assertEqual(row["claimed_by"], "pattern:highs_after_meals")
        self.assertEqual(
            sum("meal_bolus_short" in item["attributed_levers"]
                for item in exposures["exposures"]["meals"]["occurrences"]),
            2,
        )
        self.assertEqual(
            [item["member"] for item in case["occurrences"]].count(
                "habit:meal_bolus_short"
            ),
            2,
        )
        self.assertEqual(projection["counts"]["finding"], sum(
            item["register"] == "finding" and not item.get("claimed_by")
            for item in projection["rows"]
        ))

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
        self.assertEqual(pattern_case["family"], pattern_case["population"])
        self.assertEqual(pattern_case["summary"], {
            "claimed": 2, "denominator": 2, "noun": "lows",
        })
        self.assertEqual(
            {item["member"] for item in pattern_case["occurrences"]},
            {"habit:correction_stacking"},
        )
        self.assertEqual(pattern_case["projection"]["window_min"], [-60, 120])
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

    def test_the_sorted_queue_publishes_its_three_closed_ranking_tiers(self):
        """The public projection names rank without inventing a headline (#41).

        Tiers are assigned only after this queue's server-owned sort: priorities
        decide which rows lead, but no first asserting row receives a stronger
        claim than the rest.
        """
        scoped_rows = self.projection.project(WindowQuery.clock(*AFTERNOON))["rows"]
        rows = self.global_rows + scoped_rows
        allowed = {"next_in_line", "worth_a_look", "noted"}
        self.assertEqual({row["tier"] for row in rows}, allowed)
        self.assertEqual(
            {row["tier"] for row in rows if row["register"] == "assert"},
            {"next_in_line"},
        )
        self.assertTrue(all(
            row["tier"] == "noted" if row["priority"] is None
            else (row["tier"] == "next_in_line" if row["register"] == "assert"
                  else row["tier"] == "worth_a_look")
            for row in rows
        ))

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

    def test_patterns_are_whole_day_only_and_claimed_rate_levers_follow_their_parent(self):
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

        scoped = self.projection.project(WindowQuery.clock(*AFTERNOON))
        self.assertFalse(any(row["kind"] == "pattern" for row in scoped["rows"]))
        self.assertFalse(any(row.get("claimed_by") for row in scoped["rows"]))

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
        browser = json.loads((pathlib.Path(__file__).resolve().parents[1]
                              / "frontend" / "__fixtures__"
                              / "findings-projection.json").read_text())
        pattern = next(row for row in browser["browser_outcome_patterns"]
                       if row["key"] == "lows_after_meals")
        self.assertGreater(pattern["k"], 0)
        self.assertFalse(any(member["kind"] == "habit" for member in pattern["members"]))

        overnight = next(row for row in self.result["rows"]
                         if row["id"] == "pattern:overnight_lows_no_iob")
        self.assertEqual(overnight["chips"], ["lows"])
        self.assertIsNone(overnight["pattern_chart"])

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
            "overnight_lows_no_iob": "nights",
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
            "high_carb_sequence": ["sequences"], "repeat_eating": ["sequences"],
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
                if key == "overnight_lows_no_iob":
                    union = ["lows"]
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
                         ["pattern"] * 5)
        self.assertEqual(
            [pattern["key"] for pattern in result["outcome_patterns"]],
            ["highs_after_meals", "lows_after_meals", "highs_after_treating_lows",
             "lows_after_correcting_highs", "overnight_lows_no_iob"],
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
        self.assertEqual(rebound["ep_id"], fired["ep_id"])


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
            "annotation": "meals look slightly over-covered relative to programmed I:C",
        }]}
        row = self._project(analysis)[0]
        self.assertEqual(
            row["headline"],
            "Meals look slightly over-covered relative to programmed I:C. "
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
                    "annotation": "meals look slightly over-covered relative to programmed I:C"}
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
                    "annotation": "meals look slightly over-covered relative to programmed I:C"}
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
                "Meals look slightly over-covered relative to programmed I:C.",
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

    def test_missing_sequence_witness_has_no_trigger_fallback(self):
        from ciq_autotune.window_membership import outcome_minute
        with patch("ciq_autotune.window_membership.outcome_kind", return_value="sequence"):
            for extra in ({}, {"outcome_minute": None}):
                self.assertIsNone(outcome_minute(
                    {"cause_lever": "high_carb_sequence", "t": "2026-08-01 12:00:00", **extra}, {}))

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


def seed_sequence_store(store, bolus, cgm, log=()):
    """A manufactured programmed I:C keeps the parent Pattern above collapse."""
    from tests.test_meal_bolus_short_attribution import _seed
    from tests.test_outcomes_trend import _snapshot_with_ic
    _seed(store, bolus, cgm)
    store.upsert_settings_snapshot(bolus[0].t.strftime("%Y-%m-%d %H:%M:%S"),
                                   _snapshot_with_ic(10).settings)
    for entry in log:
        store.upsert_carb_entry(entry)


def sequence_products(lever, *, covered=False, competitor="mild", multi=False, thin=None, low=False):
    """Manufactured public-producer inputs; requires the c1 integration contract."""
    from ciq_autotune.store import Store
    from ciq_autotune.analyze import analyze
    from ciq_autotune.analyzers.scenario import build_scenarios
    from ciq_autotune.explore_exposures import build_exposures
    from ciq_autotune.analyzers.eating_sequences import evaluate_sequences
    from ciq_autotune.analyzers.eating_sequence_config import EatingSequenceConfig
    from ciq_autotune.events import CarbEntry
    from tests.eating_sequence_streams import sequence_episode_stream
    b, c, log, basal = sequence_episode_stream(lever, covered=covered,
                                               competitor=competitor, multi=multi)
    if low:
        initial = evaluate_sequences(b, c, log, window_start=c[0].t, window_end=c[-1].t,
                                     config=EatingSequenceConfig())
        nadirs = {reading.t for row in initial.populations[lever] if row.candidate
                  for reading in c
                  if row.sequence.end + timedelta(minutes=80) <= reading.t
                  < row.sequence.end + timedelta(minutes=90)}
        c = [replace(r, bg=55) if r.t in nadirs else r for r in c]
    if thin is not None:
        evaluation = evaluate_sequences(b, c, log, window_start=c[0].t, window_end=c[-1].t,
                                        config=EatingSequenceConfig())
        cohort = [r for r in evaluation.populations[lever] if r.candidate == thin]
        log = [CarbEntry(r.sequence.end + timedelta(minutes=1), 17.3, "exact", "manual")
               for r in cohort[7:]]
    with Store.open(":memory:") as store:
        seed_sequence_store(store, b, c, log)
        analysis = analyze(store, window_days=30, pool_agreeing_basal_regimes=True).to_dict()
        scenarios = build_scenarios(store, window_days=30).to_dict()
        exposures = build_exposures(store, window_days=30)
    projection = prepare_findings_projection(analysis=analysis, exposures=exposures, scenarios=scenarios)
    return projection, (b, c, log, basal)


class SequenceProducerProjectionTest(unittest.TestCase):
    def test_empty_and_covered_winners_keep_their_own_counts_and_nesting(self):
        for lever, expected_n in (("high_carb_sequence", 40), ("repeat_eating", 16)):
            for covered in (False, True):
                with self.subTest(lever=lever, covered=covered):
                    projection, _ = sequence_products(lever, covered=covered)
                    result = projection.project(WindowQuery.whole_day())
                    rows = {row["id"]: row for row in result["rows"]}
                    cause = rows[f"finding:{lever}"]
                    parent = rows["pattern:highs_after_meals"]
                    self.assertEqual(cause["episodes"], 8)
                    self.assertEqual(cause["appearances"], [{"family": "sequences", "noun": "sequences",
                                                           "n": 8, "m": expected_n}])
                    self.assertEqual(cause["chips"], ["highs", "meals"])
                    self.assertEqual(cause["claimed_by"], parent["id"])
                    member = next(m for m in parent["pattern"]["members"] if m["subject"] == f"habit:{lever}")
                    self.assertTrue(member["admitted"])
                    self.assertNotIn(f"habit:{lever}", parent["pattern"]["rate_levers"])
                    meals = projection._exposures["exposures"]["meals"]["occurrences"]
                    associated = [m for m in meals if f"habit:{lever}" in m.get("member_associations", [])]
                    self.assertEqual(bool(associated), covered)
                    self.assertEqual(parent["pattern"]["n"], len(meals))
                    self.assertTrue(all(lever not in m["attributed_levers"] for m in meals))

    def test_each_cohort_floor_withholds_the_served_finding(self):
        for lever in ("high_carb_sequence", "repeat_eating"):
            for candidate in (True, False):
                with self.subTest(lever=lever, candidate=candidate):
                    projection, _ = sequence_products(lever, covered=True, thin=candidate)
                    rows = projection.project(WindowQuery.whole_day())["rows"]
                    self.assertNotIn(f"finding:{lever}", {r["id"] for r in rows})

    def test_scoped_membership_uses_witness_with_source_price_and_no_parent(self):
        for lever in ("high_carb_sequence", "repeat_eating"):
            projection, _ = sequence_products(lever, multi=True)
            whole = projection.project(WindowQuery.whole_day())
            source = next(r for r in whole["rows"] if r["id"] == f"finding:{lever}")
            occurrence = next(e for e in projection._exposures["sequence_evidence"][lever]["occurrences"]
                              if e["attributed"])
            minute = occurrence["outcome_minute"]
            query = WindowQuery.clock(minute, (minute + 1) % 1440)
            scoped = projection.project(query)
            cause = next(r for r in scoped["rows"] if r["id"] == source["id"])
            self.assertEqual(cause["priority"], source["priority"])
            self.assertLessEqual(cause["episodes"], 8)
            self.assertGreater(cause["episodes"], 0)
            self.assertIsNone(cause["claimed_by"])
            self.assertFalse(any(r["kind"] == "pattern" for r in scoped["rows"]))
            for evidence in projection._exposures["sequence_evidence"][lever]["occurrences"]:
                evidence.pop("outcome_minute", None)
            self.assertNotIn(source["id"], {r["id"] for r in projection.project(query)["rows"]})

    def test_losing_sequence_matches_remain_evidence_without_ownership(self):
        from ciq_autotune.findings_projection import sequence_population
        for lever in ("high_carb_sequence", "repeat_eating"):
            projection, _ = sequence_products(lever, competitor="severe")
            roster = sequence_population(projection._exposures, lever, WindowQuery.whole_day())
            matched = [r for r in roster if r["verdict"] == "fired"]
            self.assertEqual(len(matched), 8)
            self.assertTrue(all(not r["attributed"] for r in matched))
            self.assertNotIn(f"finding:{lever}", {r["id"] for r in projection.project(WindowQuery.whole_day())["rows"]})

    def test_low_witness_uses_the_same_sequence_membership_as_highs(self):
        for lever in ("high_carb_sequence", "repeat_eating"):
            projection, (_, cgm, _, _) = sequence_products(lever, covered=True, low=True)
            episodes = projection._exposures["sequence_evidence"][lever]["occurrences"]
            low_minutes = {r.t.hour * 60 + r.t.minute for r in cgm if r.bg == 55}
            winners = [r for r in episodes if r["attributed"] and r["outcome_minute"] in low_minutes]
            self.assertTrue(winners)
            minute = winners[0]["outcome_minute"]
            rows = projection.project(WindowQuery.clock(minute, (minute + 1) % 1440))["rows"]
            cause = next(r for r in rows if r["id"] == f"finding:{lever}")
            self.assertGreater(cause["episodes"], 0)
            self.assertEqual(cause["chips"], ["highs", "meals"])
