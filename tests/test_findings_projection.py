"""The Diagnose findings queue's server-owned window projection (#730).

Everything here goes through the public interface — ``FindingsProjection.project``
and ``GET /diagnose/findings`` — over the committed generator's own inputs, so a test
can never encode a verdict the engines did not produce (the #273/#465 lesson: the
fixture that hand-sets the predicate under test stays green while the product is
wrong).
"""

import importlib.util
import pathlib
import random
import tempfile
import unittest
from datetime import datetime, timedelta

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

from ciq_autotune.analyzers.isf import analyze_isf
from ciq_autotune.analyzers.scenario.levers import Lever, outcome_kind
from ciq_autotune.analyzers.tuning_priority import build_tuning_levers
from ciq_autotune.findings_projection import (
    _EVENT_CHART_FAMILIES,
    FindingsProjection,
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
    return FindingsProjection(analysis, projection._exposures, projection._scenarios), history


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
        projection = FindingsProjection(analysis, base._exposures, base._scenarios)

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

    def test_every_declared_lever_chips_by_its_closed_outcome_kind(self):
        occurrences = []
        for index, lever in enumerate(Lever):
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
        )
        # The window is derived from the lever count, never a literal: each occurrence
        # sits at hour `index`, so a hard-coded span silently drops the newest lever
        # off its end the day one is added — which is precisely what the closed set
        # exists to catch.
        rows = projection.project(WindowQuery.clock(0, len(Lever) * 60))["rows"]
        self.assertEqual(len(rows), len(Lever))
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
        priced = [row["priority"] for row in self.global_rows
                  if row["priority"] is not None]
        self.assertEqual(priced, sorted(priced, reverse=True))
        tail = self.global_rows[len(priced):]
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
            [row["tier"] for row in self.global_rows],
            ["next_in_line", "next_in_line", "next_in_line",
             "worth_a_look", "worth_a_look", "noted", "noted", "noted"],
        )
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
            elif row["priority"] is not None:
                self.assertEqual(row["priority"], patterns[row["lever"]])

    def test_held_and_blind_follow_the_ranked_head(self):
        rows = self.projection.project(WindowQuery.clock(*AFTERNOON))["rows"]
        order = {"assert": 0, "finding": 0, "held": 1, "blind": 2}
        ranks = [order[row["register"]] for row in rows]
        self.assertEqual(ranks, sorted(ranks))


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
    def test_an_empty_store_projects_an_empty_queue(self):
        projection = prepare_findings_projection(
            analysis={"window_days": 30}, exposures={}, scenarios={},
        )
        result = projection.project(WindowQuery.whole_day())
        self.assertEqual(result["rows"], [])
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
                               _scenarios=gen.scenarios()))
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
                               _scenarios=gen.scenarios()))
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


if __name__ == "__main__":
    unittest.main()
