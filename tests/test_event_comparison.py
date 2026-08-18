"""Public-contract tests for Diagnose event comparisons."""

import json
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from runpy import run_path
from types import SimpleNamespace
from unittest.mock import patch

import ciq_autotune.event_comparison as event_comparison

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

from ciq_autotune.event_comparison import (
    ComparisonQuery,
    prepare_event_comparisons,
)
from ciq_autotune.events import CarbEntry
from ciq_autotune.store import Store


def _families(meal):
    empty = {"occurrences": []}
    return {
        "window": {"start": "2026-07-13", "end": "2026-08-11"},
        "exposures": {
            "meals": {"occurrences": [meal]},
            "lows": empty,
            "highs": empty,
            "correction_clusters": empty,
        },
    }


def _families_many(meals):
    payload = _families(meals[0] if meals else None)
    payload["exposures"]["meals"]["occurrences"] = meals
    return payload


def _low_families(low):
    empty = {"occurrences": []}
    return {
        "window": {"start": "2026-07-13", "end": "2026-08-11"},
        "exposures": {
            "meals": empty,
            "lows": {"occurrences": [low]},
            "highs": empty,
            "correction_clusters": empty,
        },
    }


def _projection_evidence_producer():
    script = Path(__file__).parents[1] / ".claude/qa/gen_issue_677_capture.py"
    return run_path(str(script))["project_evidence"]


class _Store:
    def __init__(self, bolus):
        self._bolus = bolus

    def basal_events(self):
        return []

    def bolus_events(self):
        return self._bolus

    def carb_entries(self):
        return []

    def cgm_readings(self):
        return []


class EventComparisonTest(unittest.TestCase):
    def test_only_preparation_exposes_the_comparison_projection_interface(self):
        self.assertFalse(hasattr(event_comparison, "build_event_comparison"))

    def test_preparation_projects_one_closed_meal_coordinate(self):
        occurrence = {
            "t": "2026-08-01 12:00:00", "date": "2026-08-01", "bg": 150,
            "worst_bg": 220, "label": "Meal", "ep_id": "ep-1",
            "cause_lever": None,
            "verdicts": [{
                "classifier": "carb_undercount", "matched": True,
                "detail": "matched", "evidence_tier": "observed",
                "silence_reason": "no_trigger",
            }],
        }
        stamp = datetime(2026, 8, 1, 12)
        bolus = SimpleNamespace(
            t=stamp, completion="Completed", insulin=3.0, carbs=38.0,
            carb_ratio=5.0, bg=None, seq_num=42,
        )
        reading = SimpleNamespace(t=stamp, bg=150)
        store = _Store([bolus])
        store.cgm_readings = lambda: [reading]
        store.settings_snapshots = lambda: []
        with (
            patch("ciq_autotune.explore_exposures.build_exposures",
                  return_value=_families(occurrence)),
            patch("ciq_autotune.event_comparison._effective_isf", return_value=None),
        ):
            preparation = prepare_event_comparisons(store)
            projection = preparation.project(ComparisonQuery.meals())

        self.assertEqual(projection["schema"], "diagnose-event-comparison-v2")
        self.assertEqual(projection["coordinates"]["view"], "meals")
        self.assertEqual(projection["population"], {
            "denominator": 1,
            "counts": {"fired": 1, "near_rule": 0, "neutral": 0,
                       "another_factor": 0, "excluded": 0},
        })
        self.assertEqual(projection["occurrences"][0]["identity"], {
            "id": "meals-42", "kind": "meal",
        })
        self.assertEqual(
            sum(projection["population"]["counts"].values()),
            projection["population"]["denominator"],
        )
        cohort = projection["cohorts"][0]
        self.assertEqual(set(cohort), {
            "key", "routed_count", "usable_count", "support",
            "occurrence_ids", "points",
        })
        self.assertEqual(cohort["support"], "withheld")
        self.assertTrue(all(point["median"] is None for point in cohort["points"]))
        unavailable = preparation.project(ComparisonQuery.meals(
            occurrence_id="stale-catalog-id",
        ))
        self.assertEqual(unavailable["selection"], {
            "state": "unavailable", "requested_id": "stale-catalog-id", "detail": None,
        })

    def test_projection_owns_half_bin_percentiles_and_selected_detail(self):
        first = {
            "t": "2026-08-01 12:00:00", "date": "2026-08-01", "bg": 100,
            "worst_bg": 200, "label": "Meal", "ep_id": "ep-1", "cause_lever": None,
            "verdicts": [{"classifier": "carb_undercount", "matched": True,
                          "detail": "matched", "evidence_tier": "observed",
                          "silence_reason": "no_trigger"}],
        }
        second = {**first, "t": "2026-08-01 13:00:00", "date": "2026-08-01",
                  "ep_id": "ep-2"}
        first_t, second_t = datetime(2026, 8, 1, 12), datetime(2026, 8, 1, 13)
        store = _Store([
            SimpleNamespace(t=first_t, completion="Completed", insulin=3.0, carbs=30.0,
                            carb_ratio=None, bg=None, seq_num=1),
            SimpleNamespace(t=second_t, completion="Completed", insulin=3.0, carbs=30.0,
                            carb_ratio=None, bg=None, seq_num=2),
        ])
        store.cgm_readings = lambda: [
            SimpleNamespace(t=first_t.replace(minute=2, second=30), bg=100),
            SimpleNamespace(t=second_t.replace(minute=2, second=30), bg=200),
        ]
        store.settings_snapshots = lambda: []
        no_carb = SimpleNamespace(silence_reason="no_trigger", implied_carbs=None,
                                  logged_carbs=None)
        no_late = SimpleNamespace(silence_reason="no_trigger", pre_bolus_slope=None)
        no_suspend = SimpleNamespace(matched=False, suspend_start=None, suspend_end=None,
                                     suspend_duration_min=None)
        with (
            patch("ciq_autotune.explore_exposures.build_exposures",
                  return_value=_families_many([first, second])),
            patch("ciq_autotune.event_comparison._effective_isf", return_value=None),
            patch("ciq_autotune.event_comparison.classify_carb_undercount",
                  return_value=no_carb),
            patch("ciq_autotune.event_comparison.classify_late_bolus", return_value=no_late),
            patch("ciq_autotune.event_comparison.classify_meal_owned_suspend",
                  return_value=no_suspend),
        ):
            preparation = prepare_event_comparisons(store)
            base = preparation.project(ComparisonQuery.meals())
            selected = preparation.project(ComparisonQuery.meals(occurrence_id="meals-1"))

        point = next(item for item in base["cohorts"][0]["points"] if item["minute"] == 5)
        self.assertEqual(point, {
            "minute": 5, "n": 2, "support": "limited",
            "median": 150.0, "p25": 125.0, "p75": 175.0,
        })
        self.assertEqual(base["cohorts"], selected["cohorts"])
        self.assertNotIn("glucose", base["occurrences"][0])
        detail = selected["selection"]["detail"]
        self.assertEqual(selected["selection"]["state"], "selected")
        self.assertEqual(detail["identity"], base["occurrences"][0]["identity"])
        self.assertEqual(detail["glucose"][0], {
            "t": "2026-08-01 12:02:30", "minute": 2.5, "bg": 100,
        })
        self.assertEqual(detail["markers"], [])

    def _fired_meal_cohort(self, reading_minutes):
        """Build one "fired" carb_undercount cohort from real occurrences.

        ``reading_minutes`` is a list with one entry per occurrence: the
        minute (relative to that occurrence's anchor) its single CGM reading
        lands at. Every occurrence is a distinct day/bolus/ep_id so each is a
        genuinely separate contributor, never a duplicate reading off one
        occurrence.
        """
        occurrences = []
        boluses = []
        readings = []
        for index, minute in enumerate(reading_minutes):
            day = index + 1
            anchor = datetime(2026, 8, day, 12, 0, 0)
            occurrences.append({
                "t": anchor.strftime("%Y-%m-%d %H:%M:%S"), "date": anchor.strftime("%Y-%m-%d"),
                "bg": 150, "worst_bg": 220, "label": "Meal", "ep_id": f"ep-{index}",
                "cause_lever": None,
                "verdicts": [{"classifier": "carb_undercount", "matched": True,
                              "detail": "matched", "evidence_tier": "observed",
                              "silence_reason": "no_trigger"}],
            })
            boluses.append(SimpleNamespace(
                t=anchor, completion="Completed", insulin=3.0, carbs=30.0,
                carb_ratio=None, bg=None, seq_num=index,
            ))
            readings.append(SimpleNamespace(
                t=anchor + timedelta(minutes=minute), bg=150,
            ))
        store = _Store(boluses)
        store.cgm_readings = lambda: readings
        store.settings_snapshots = lambda: []
        no_carb = SimpleNamespace(silence_reason="no_trigger", implied_carbs=None,
                                  logged_carbs=None)
        no_late = SimpleNamespace(silence_reason="no_trigger", pre_bolus_slope=None)
        no_suspend = SimpleNamespace(matched=False, suspend_start=None, suspend_end=None,
                                     suspend_duration_min=None)
        with (
            patch("ciq_autotune.explore_exposures.build_exposures",
                  return_value=_families_many(occurrences)),
            patch("ciq_autotune.event_comparison._effective_isf", return_value=None),
            patch("ciq_autotune.event_comparison.classify_carb_undercount",
                  return_value=no_carb),
            patch("ciq_autotune.event_comparison.classify_late_bolus", return_value=no_late),
            patch("ciq_autotune.event_comparison.classify_meal_owned_suspend",
                  return_value=no_suspend),
        ):
            preparation = prepare_event_comparisons(store)
            projection = preparation.project(ComparisonQuery.meals())
        return next(cohort for cohort in projection["cohorts"] if cohort["key"] == "fired")

    def test_cohort_and_point_support_reach_supported_at_five_contributors(self):
        """Five distinct fired occurrences sharing one bin clear "supported".

        Regression for the finding that no test ever asserted a "supported"
        value: every prior test only checked membership in the {supported,
        limited, withheld} set, which the "limited"/"withheld" branches also
        satisfy.
        """
        cohort = self._fired_meal_cohort([5, 5, 5, 5, 5])
        self.assertEqual(cohort["usable_count"], 5)
        self.assertEqual(cohort["support"], "supported")
        point = next(item for item in cohort["points"] if item["minute"] == 5)
        self.assertEqual(point["n"], 5)
        self.assertEqual(point["support"], "supported")

    def test_half_cohort_demotion_boundary_is_pinned_both_sides(self):
        """count * 2 >= usable_count is the supported/limited boundary.

        Twelve usable occurrences; only 5 of them reach the +100 minute point
        (5*2=10 < 12, demoted to "limited" despite n=5 clearing the raw >=5
        floor) while 6 reach the +120 minute point (6*2=12 >= 12, "supported").
        The remaining occurrence contributes to usable_count without landing
        on either point, so demotion is exercised, not incidentally skipped.
        """
        reading_minutes = [100] * 5 + [120] * 6 + [200]
        cohort = self._fired_meal_cohort(reading_minutes)
        self.assertEqual(cohort["usable_count"], 12)
        demoted = next(item for item in cohort["points"] if item["minute"] == 100)
        self.assertEqual(demoted["n"], 5)
        self.assertEqual(demoted["support"], "limited")
        passing = next(item for item in cohort["points"] if item["minute"] == 120)
        self.assertEqual(passing["n"], 6)
        self.assertEqual(passing["support"], "supported")

    def test_selected_low_projects_known_rescue_amounts_without_sources(self):
        anchor = datetime(2026, 8, 1, 12)
        low = {
            "t": anchor.strftime("%Y-%m-%d %H:%M:%S"), "date": "2026-08-01",
            "bg": 62, "worst_bg": 58, "label": "Low", "ep_id": "low-1",
            "cause_lever": None,
            "verdicts": [{
                "classifier": "over_treated_low", "matched": True,
                "detail": "matched", "evidence_tier": "observed",
                "silence_reason": "no_trigger",
            }],
        }
        store = _Store([])
        store.cgm_readings = lambda: [SimpleNamespace(t=anchor, bg=62)]
        store.settings_snapshots = lambda: []
        store.carb_entries = lambda: [
            SimpleNamespace(t=anchor, grams=8, certainty="exact", source="manual"),
            SimpleNamespace(t=anchor, grams=6, certainty="estimate", source="rise-prompt"),
            SimpleNamespace(t=anchor, grams=4, certainty="unknown", source="low-prompt"),
            SimpleNamespace(t=anchor, grams=None, certainty="unknown", source="manual"),
        ]
        with patch("ciq_autotune.explore_exposures.build_exposures",
                   return_value=_low_families(low)):
            preparation = prepare_event_comparisons(store)
            base = preparation.project(ComparisonQuery.lows())
            projection = preparation.project(ComparisonQuery.lows(
                occurrence_id=base["occurrences"][0]["identity"]["id"],
            ))

        detail = projection["selection"]["detail"]
        self.assertEqual(set(projection), {
            "schema", "coordinates", "population", "cohorts", "occurrences", "selection",
        })
        self.assertEqual(projection["coordinates"], {
            "view": "lows",
            "factor": "over_treated_low",
            "block": "all",
            "another": False,
            "source_window": {"start": "2026-07-13", "end": "2026-08-11"},
            "anchor": {"kind": "excursion_nadir", "label": "Low excursion"},
            "alignment_window_min": [-300, 120],
            "factor_options": [
                {"key": "over_treated_low", "label": "Over-treated low"},
                {"key": "correction_on_iob", "label": "Correction on active insulin"},
                {"key": "correction_stacking", "label": "Correction stacking"},
            ],
            "block_options": [
                {"key": "overnight", "label": "Overnight"},
                {"key": "morning", "label": "Morning"},
                {"key": "afternoon", "label": "Afternoon"},
                {"key": "evening", "label": "Evening"},
                {"key": "all", "label": "24 h"},
            ],
        })
        self.assertEqual(base["selection"], {"state": "none", "detail": None})
        self.assertEqual(set(projection["selection"]), {"state", "requested_id", "detail"})
        self.assertEqual(projection["selection"]["state"], "selected")
        self.assertEqual(projection["selection"]["requested_id"],
                         base["occurrences"][0]["identity"]["id"])
        self.assertEqual([cohort["key"] for cohort in projection["cohorts"]],
                         ["fired", "near_rule", "neutral"])
        for cohort in projection["cohorts"]:
            self.assertEqual(set(cohort), {
                "key", "routed_count", "usable_count", "support",
                "occurrence_ids", "points",
            })
            self.assertIn(cohort["support"], {"supported", "limited", "withheld"})
            for point in cohort["points"]:
                self.assertEqual(set(point), {"minute", "n", "support", "median", "p25", "p75"})
                self.assertIn(point["support"], {"supported", "limited", "withheld"})
                if point["support"] == "withheld":
                    self.assertEqual((point["median"], point["p25"], point["p75"]),
                                     (None, None, None))
        summary = base["occurrences"][0]
        self.assertEqual(set(summary), {"identity", "anchor", "verdict"})
        self.assertEqual(summary["identity"]["kind"], "low")
        self.assertEqual(summary["anchor"], {
            "kind": "excursion_nadir", "t": "2026-08-01 12:00:00",
            "date": "2026-08-01", "bg": 62, "worst_bg": 58,
            "label": "Low excursion",
        })
        self.assertEqual(set(summary["verdict"]), {
            "factor", "cohort", "provenance", "detail", "evidence_tier",
            "other_factors", "boundary_facts",
        })
        self.assertEqual(summary["verdict"]["evidence_tier"], "observed")
        self.assertEqual(set(detail), {
            "identity", "anchor", "verdict", "glucose", "markers", "day_target",
        })
        self.assertEqual(detail["identity"], summary["identity"])
        self.assertEqual(detail["anchor"], summary["anchor"])
        self.assertEqual(detail["verdict"], summary["verdict"])
        self.assertEqual(detail["glucose"], [{
            "t": "2026-08-01 12:00:00", "minute": 0.0, "bg": 62,
        }])
        self.assertEqual([marker["grams"] for marker in detail["markers"]], [8, 6, 4])
        self.assertEqual(detail["markers"], [
            {"kind": "rescue_carb", "t": "2026-08-01 12:00:00", "minute": 0.0,
             "grams": 8, "certainty": "exact"},
            {"kind": "rescue_carb", "t": "2026-08-01 12:00:00", "minute": 0.0,
             "grams": 6, "certainty": "estimate"},
            {"kind": "rescue_carb", "t": "2026-08-01 12:00:00", "minute": 0.0,
             "grams": 4, "certainty": "unknown"},
        ])
        self.assertEqual(detail["day_target"], {"date": "2026-08-01"})

    def test_temporary_store_dry_run_projects_phifree_meals_and_lows(self):
        """The evidence generator projects both views through the real store.

        This is deliberately a temporary Store rather than the light-weight fake
        above: the generator must exercise the public preparation/projection
        interface without a PHI capture or a compatibility builder.
        """
        meal_anchor = datetime(2026, 8, 1, 12)
        low_anchor = datetime(2026, 8, 1, 18)
        meal = {
            "t": meal_anchor.strftime("%Y-%m-%d %H:%M:%S"),
            "date": "2026-08-01", "bg": 150, "worst_bg": 220,
            "label": "Meal", "ep_id": "meal-1", "cause_lever": None,
            "verdicts": [{
                "classifier": "carb_undercount", "matched": True,
                "detail": "matched", "evidence_tier": "observed",
                "silence_reason": "no_trigger",
            }],
        }
        low = {
            "t": low_anchor.strftime("%Y-%m-%d %H:%M:%S"), "date": "2026-08-01",
            "bg": 62, "worst_bg": 58, "label": "Low", "ep_id": "low-1",
            "cause_lever": None,
            "verdicts": [{
                "classifier": "over_treated_low", "matched": True,
                "detail": "matched", "evidence_tier": "observed",
                "silence_reason": "no_trigger",
            }],
        }
        families = _families(meal)
        families["exposures"]["lows"] = {"occurrences": [low]}
        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            with Store.open(db.name) as store:
                store.upsert_cgm([
                    {
                        "EventDateTime": meal_anchor.strftime("%Y-%m-%dT%H:%M:%S"),
                        "Readings (CGM / BGM)": 150, "Description": "EGV",
                    },
                    {
                        "EventDateTime": low_anchor.strftime("%Y-%m-%dT%H:%M:%S"),
                        "Readings (CGM / BGM)": 62, "Description": "EGV",
                    },
                ])
                store.upsert_bolus([{
                    "seq_num": 1,
                    "request_time": meal_anchor.strftime("%Y-%m-%dT%H:%M:%S"),
                    "description": "Meal bolus", "completion": "Completed",
                    "insulin": 3.0, "carbs": 38.0,
                }])
                with patch("ciq_autotune.explore_exposures.build_exposures",
                           return_value=families), \
                     patch("ciq_autotune.event_comparison._effective_isf",
                           return_value=None):
                    meals, lows = _projection_evidence_producer()(store)

        self.assertEqual([meals["schema"], lows["schema"]], [
            "diagnose-event-comparison-v2", "diagnose-event-comparison-v2",
        ])
        self.assertEqual([meals["coordinates"]["view"], lows["coordinates"]["view"]],
                         ["meals", "lows"])
        self.assertEqual([meals["population"]["denominator"],
                          lows["population"]["denominator"]], [1, 1])
        self.assertTrue(meals["occurrences"])
        self.assertTrue(lows["occurrences"])

    def test_near_rule_reads_structured_classifier_fields_not_detail_copy(self):
        occurrence = {
            "t": "2026-08-01 12:00:00", "date": "2026-08-01", "bg": 150,
            "worst_bg": 220, "label": "Meal", "ep_id": "ep-1",
            "cause_lever": None, "verdicts": [],
        }
        bolus = SimpleNamespace(
            t=datetime(2026, 8, 1, 12), completion="Completed", insulin=3.0,
            carbs=38.0, carb_ratio=5.0, bg=None, seq_num=42,
        )
        carb = SimpleNamespace(
            silence_reason="under_threshold", implied_carbs=50.0,
            logged_carbs=38.0, detail="copy changed completely",
        )
        late = SimpleNamespace(
            silence_reason="no_trigger", pre_bolus_slope=0.9,
            detail="copy changed completely",
        )
        no_suspend = SimpleNamespace(
            matched=False, suspend_start=None, suspend_end=None,
            suspend_duration_min=None,
        )
        with (
            patch("ciq_autotune.explore_exposures.build_exposures",
                  return_value=_families(occurrence)),
            patch("ciq_autotune.event_comparison._effective_isf", return_value=40.0),
            patch("ciq_autotune.event_comparison.classify_carb_undercount",
                  return_value=carb),
            patch("ciq_autotune.event_comparison.classify_late_bolus",
                  return_value=late),
            patch("ciq_autotune.event_comparison.classify_meal_owned_suspend",
                  return_value=no_suspend),
        ):
            preparation = prepare_event_comparisons(_Store([bolus]))
            carb_projection = preparation.project(ComparisonQuery.meals())
            late_projection = preparation.project(ComparisonQuery.meals(
                factor="late_bolus",
            ))

        carb_facts = carb_projection["occurrences"][0]["verdict"]["boundary_facts"]
        late_facts = late_projection["occurrences"][0]["verdict"]["boundary_facts"]
        self.assertEqual(
            next(item["value"] for item in carb_facts if item["key"] == "implied_carbs_g"),
            50.0,
        )
        self.assertEqual(
            next(item["value"] for item in late_facts
                 if item["key"] == "pre_bolus_slope_mgdl_min"),
            0.9,
        )

    def test_low_another_factor_ignores_cross_family_episode_matches(self):
        occurrence = {
            "t": "2026-08-01 12:00:00", "date": "2026-08-01", "bg": 68,
            "worst_bg": 68, "label": "Low", "ep_id": "shared",
            "cause_lever": None,
            "verdicts": [{
                "classifier": "correction_on_iob", "matched": False,
                "detail": "no correction", "evidence_tier": "observed",
                "silence_reason": "no_trigger",
            }],
        }
        meal = {
            **occurrence, "label": "Meal", "cause_lever": "carb_undercount",
            "verdicts": [{
                "classifier": "carb_undercount", "matched": True,
                "detail": "meal factor", "evidence_tier": "inferred",
                "silence_reason": None,
            }],
        }
        payload = _families_many([meal])
        payload["exposures"]["lows"]["occurrences"] = [occurrence]
        no_rebound = SimpleNamespace(peak=100)
        with (
            patch("ciq_autotune.explore_exposures.build_exposures", return_value=payload),
            patch("ciq_autotune.event_comparison.guarded_rebound", return_value=no_rebound),
            patch("ciq_autotune.event_comparison.classify_correction_on_iob",
                  return_value=SimpleNamespace(matched=False)),
        ):
            result = prepare_event_comparisons(_Store([])).project(
                ComparisonQuery.lows(factor="correction_stacking")
            )

        low = result["occurrences"][0]
        self.assertNotEqual(
            low["verdict"]["cohort"], "another_factor"
        )

    def test_excluded_meal_is_hidden_from_roster_and_selection_is_unavailable(self):
        occurrence = {
            "t": "2026-08-01 12:00:00", "date": "2026-08-01", "bg": 150,
            "worst_bg": 220, "label": "Meal", "ep_id": "ep-1",
            "cause_lever": None,
            "verdicts": [{
                "classifier": "carb_undercount", "matched": False,
                "detail": "not a directional read", "evidence_tier": "observed",
                "silence_reason": "under_threshold",
            }],
        }
        bolus = SimpleNamespace(
            t=datetime(2026, 8, 1, 12), completion="Completed", insulin=3.0,
            carbs=38.0, carb_ratio=5.0, bg=None, seq_num=42,
        )
        no_carb_near = SimpleNamespace(
            silence_reason="no_trigger", implied_carbs=None, logged_carbs=None,
            detail="not near",
        )
        no_late_near = SimpleNamespace(
            silence_reason="no_trigger", pre_bolus_slope=None, detail="not near",
        )
        matched_suspend = SimpleNamespace(
            matched=True, suspend_start=None, suspend_end=None,
            suspend_duration_min=None,
        )
        with (
            patch("ciq_autotune.explore_exposures.build_exposures",
                  return_value=_families(occurrence)),
            patch("ciq_autotune.event_comparison._effective_isf", return_value=None),
            patch("ciq_autotune.event_comparison.classify_carb_undercount",
                  return_value=no_carb_near),
            patch("ciq_autotune.event_comparison.classify_late_bolus",
                  return_value=no_late_near),
            patch("ciq_autotune.event_comparison.classify_meal_owned_suspend",
                  return_value=matched_suspend),
        ):
            preparation = prepare_event_comparisons(_Store([bolus]))
            roster = preparation.project(ComparisonQuery.meals(
                factor="carb_undercount",
            ))
            selection = preparation.project(ComparisonQuery.meals(
                factor="carb_undercount", occurrence_id="meals-42",
            ))

        self.assertEqual(roster["population"], {
            "denominator": 1,
            "counts": {"fired": 0, "near_rule": 0, "neutral": 0,
                       "another_factor": 0, "excluded": 1},
        })
        self.assertEqual(
            [occurrence["identity"]["id"] for occurrence in roster["occurrences"]],
            [],
        )
        self.assertEqual(selection["selection"], {
            "state": "unavailable", "requested_id": "meals-42", "detail": None,
        })

    def test_builds_fixed_views_and_adr_679_meal_identity(self):
        stamp = datetime(2026, 8, 1, 12)
        occurrence = {
            "t": "2026-08-01 12:00:00",
            "date": "2026-08-01",
            "bg": 150,
            "worst_bg": 220,
            "label": "Meal",
            "ep_id": "ep-1",
            "cause_lever": "carb_undercount",
            "verdicts": [{
                "classifier": "carb_undercount",
                "matched": True,
                "detail": "Observed meal response",
                "evidence_tier": "observed",
                "silence_reason": "no_trigger",
            }],
        }
        bolus = SimpleNamespace(
            t=stamp, completion="Completed", insulin=3.0, carbs=30.0,
            bg=None, carb_ratio=None, seq_num=42,
        )
        no_suspend = SimpleNamespace(
            matched=False, suspend_start=None, suspend_end=None,
            suspend_duration_min=None,
        )
        with (
            patch("ciq_autotune.explore_exposures.build_exposures",
                  return_value=_families(occurrence)),
            patch("ciq_autotune.event_comparison.classify_meal_owned_suspend",
                  return_value=no_suspend),
            patch("ciq_autotune.event_comparison._effective_isf", return_value=None),
        ):
            preparation = prepare_event_comparisons(_Store([bolus]))
            payload = preparation.project(ComparisonQuery.meals())
            late = preparation.project(ComparisonQuery.meals(
                factor="late_bolus", another=True,
            ))

        self.assertEqual(payload["schema"], "diagnose-event-comparison-v2")
        meal = payload["occurrences"][0]
        self.assertEqual(meal["identity"], {"id": "meals-42", "kind": "meal"})
        self.assertEqual(meal["verdict"]["cohort"], "fired")
        self.assertEqual(
            late["occurrences"][0]["verdict"]["cohort"], "another_factor",
        )
        self.assertEqual(payload["coordinates"]["alignment_window_min"], [-60, 300])

    def test_incomplete_carb_bolus_is_not_a_comparison_meal(self):
        occurrence = {
            "t": "2026-08-01 12:00:00", "date": "2026-08-01", "bg": 150,
            "worst_bg": 220, "label": "Meal", "ep_id": "ep-1",
            "cause_lever": None, "verdicts": [],
        }
        bolus = SimpleNamespace(
            t=datetime(2026, 8, 1, 12), completion="Cancelled",
            insulin=3.0, carbs=30.0, seq_num=42,
        )
        with (
            patch("ciq_autotune.explore_exposures.build_exposures",
                  return_value=_families(occurrence)),
            patch("ciq_autotune.event_comparison._effective_isf", return_value=None),
        ):
            payload = prepare_event_comparisons(_Store([bolus])).project(
                ComparisonQuery.meals()
            )

        self.assertEqual(payload["occurrences"], [])

    def test_exact_timestamp_meals_use_stable_bolus_ordinals(self):
        source = {
            "t": "2026-08-01 12:00:00", "date": "2026-08-01", "bg": 150,
            "worst_bg": 220, "label": "Meal", "ep_id": "ep-1",
            "cause_lever": None, "verdicts": [{
                "classifier": "carb_undercount", "matched": True,
                "detail": "matched", "evidence_tier": "observed",
                "silence_reason": "no_trigger",
            }],
        }
        stamp = datetime(2026, 8, 1, 12)
        boluses = [
            SimpleNamespace(t=stamp, completion="Completed", insulin=2.0,
                            carbs=20.0, carb_ratio=None, seq_num=9),
            SimpleNamespace(t=stamp, completion="Completed", insulin=3.0,
                            carbs=30.0, carb_ratio=None, seq_num=10),
        ]
        no_suspend = SimpleNamespace(
            matched=False, suspend_start=None, suspend_end=None,
            suspend_duration_min=None,
        )
        with (
            patch("ciq_autotune.explore_exposures.build_exposures",
                  return_value=_families_many([source, dict(source)])),
            patch("ciq_autotune.event_comparison.classify_meal_owned_suspend",
                  return_value=no_suspend),
            patch("ciq_autotune.event_comparison._effective_isf", return_value=None),
        ):
            payload = prepare_event_comparisons(_Store(boluses)).project(
                ComparisonQuery.meals()
            )

        meals = payload["occurrences"]
        self.assertEqual([item["identity"]["id"] for item in meals],
                         ["meals-9", "meals-10"])

    def test_meal_ids_use_stored_seq_num_through_a_real_store(self):
        # #715: the meals-view id must be derived from the anchor bolus's real
        # seq_num, never a positional fallback. Use large seq_nums (way past any
        # occurrence's index+1) so a reintroduced positional id could never
        # accidentally coincide with the seq_num id and mask the bug.
        from ciq_autotune.store import Store

        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = f"{tmpdir}/ciq.db"
            store = Store.open(db_path)
            try:
                store.upsert_bolus([
                    {
                        "seq_num": 1432348,
                        "request_time": "2026-08-01 08:00:00",
                        "description": "meal",
                        "completion": "Completed",
                        "insulin": 2.0,
                        "requested_insulin": 2.0,
                        "carbs": 20.0,
                    },
                    {
                        "seq_num": 1432349,
                        "request_time": "2026-08-01 18:00:00",
                        "description": "meal",
                        "completion": "Completed",
                        "insulin": 3.0,
                        "requested_insulin": 3.0,
                        "carbs": 30.0,
                    },
                ])

                matched_meal = [{
                    "classifier": "carb_undercount", "matched": True,
                    "detail": "matched", "evidence_tier": "observed",
                    "silence_reason": "no_trigger",
                }]
                meal_1 = {
                    "t": "2026-08-01 08:00:00", "date": "2026-08-01", "bg": 150,
                    "worst_bg": 220, "label": "Meal", "ep_id": "ep-meal-1",
                    "cause_lever": None, "verdicts": matched_meal,
                }
                meal_2 = {
                    "t": "2026-08-01 18:00:00", "date": "2026-08-01", "bg": 150,
                    "worst_bg": 220, "label": "Meal", "ep_id": "ep-meal-2",
                    "cause_lever": None, "verdicts": list(matched_meal),
                }
                low_1 = {
                    "t": "2026-08-01 12:00:00", "date": "2026-08-01", "bg": 60,
                    "worst_bg": 55, "label": "Low", "ep_id": "ep-low-1",
                    "cause_lever": None, "verdicts": [{
                        "classifier": "over_treated_low", "matched": True,
                        "detail": "matched", "evidence_tier": "observed",
                        "silence_reason": "no_trigger",
                    }],
                }
                empty = {"occurrences": []}
                exposures_payload = {
                    "window": {"start": "2026-07-13", "end": "2026-08-11"},
                    "exposures": {
                        "meals": {"occurrences": [meal_1, meal_2]},
                        "lows": {"occurrences": [low_1]},
                        "highs": empty,
                        "correction_clusters": empty,
                    },
                }
                no_suspend = SimpleNamespace(
                    matched=False, suspend_start=None, suspend_end=None,
                    suspend_duration_min=None,
                )
                with (
                    patch("ciq_autotune.explore_exposures.build_exposures",
                          return_value=exposures_payload),
                    patch("ciq_autotune.event_comparison.classify_meal_owned_suspend",
                          return_value=no_suspend),
                    patch("ciq_autotune.event_comparison._effective_isf",
                          return_value=None),
                ):
                    preparation = prepare_event_comparisons(store)
                    meals = preparation.project(ComparisonQuery.meals())
                    lows = preparation.project(ComparisonQuery.lows())
            finally:
                store.conn.close()

        meal_ids = [item["identity"]["id"] for item in meals["occurrences"]]
        self.assertEqual(meal_ids, ["meals-1432348", "meals-1432349"])

        low_ids = {item["identity"]["id"] for item in lows["occurrences"]}
        self.assertEqual(low_ids, {"lows-1"})
        self.assertTrue(set(meal_ids).isdisjoint(low_ids))


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class EventComparisonRouteTest(unittest.TestCase):
    def test_route_projects_closed_coordinates_from_the_fixed_window(self):
        from ciq_autotune.api import create_app

        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            client = TestClient(
                create_app(db_path=db.name, token=None, enable_fetch_loop=False)
            )
            missing = client.get("/diagnose/event-comparison")
            good = client.get("/diagnose/event-comparison?view=meals")
            incompatible = client.get(
                "/diagnose/event-comparison?view=lows&factor=late_bolus"
            )
            bad = client.get("/diagnose/event-comparison?window=14")
            low = client.get(
                "/diagnose/event-comparison?view=lows&block=evening"
                "&another=1&occ=stale-catalog-id"
            )
            bad_block = client.get(
                "/diagnose/event-comparison?view=meals&block=midday"
            )
            bad_another = client.get(
                "/diagnose/event-comparison?view=meals&another=true"
            )
            empty_factor = client.get(
                "/diagnose/event-comparison?view=meals&factor="
            )

        self.assertEqual(missing.status_code, 400)
        self.assertEqual(good.status_code, 200, good.text)
        payload = good.json()
        self.assertEqual(payload["schema"], "diagnose-event-comparison-v2")
        self.assertEqual(payload["coordinates"]["view"], "meals")
        self.assertEqual(payload["coordinates"]["factor"], "carb_undercount")
        self.assertNotIn("exposures", payload)
        self.assertEqual(set(payload), {
            "schema", "coordinates", "population", "cohorts", "occurrences", "selection",
        })
        self.assertEqual(set(payload["coordinates"]), {
            "view", "factor", "block", "another", "source_window", "anchor",
            "alignment_window_min", "factor_options", "block_options",
        })
        self.assertEqual(payload["coordinates"], {
            "view": "meals", "factor": "carb_undercount", "block": "all",
            "another": False, "source_window": payload["coordinates"]["source_window"],
            "anchor": {"kind": "completed_carb_bolus", "label": "Completed carb bolus"},
            "alignment_window_min": [-60, 300],
            "factor_options": [
                {"key": "carb_undercount", "label": "Carb undercount"},
                {"key": "late_bolus", "label": "Late bolus"},
                {"key": "meal_over_delivery", "label": "Meal over-delivery"},
            ],
            "block_options": [
                {"key": "overnight", "label": "Overnight"},
                {"key": "morning", "label": "Morning"},
                {"key": "afternoon", "label": "Afternoon"},
                {"key": "evening", "label": "Evening"},
                {"key": "all", "label": "24 h"},
            ],
        })
        self.assertEqual(set(payload["population"]["counts"]), {
            "fired", "near_rule", "neutral", "another_factor", "excluded",
        })
        self.assertEqual([cohort["key"] for cohort in payload["cohorts"]],
                         ["fired", "near_rule", "neutral"])
        self.assertEqual(payload["selection"], {"state": "none", "detail": None})
        for cohort in payload["cohorts"]:
            self.assertEqual(set(cohort), {
                "key", "routed_count", "usable_count", "support",
                "occurrence_ids", "points",
            })
            self.assertIn(cohort["support"], {"supported", "limited", "withheld"})
            for point in cohort["points"]:
                self.assertEqual(set(point), {"minute", "n", "support", "median", "p25", "p75"})
                self.assertIn(point["support"], {"supported", "limited", "withheld"})
                if point["support"] == "withheld":
                    self.assertEqual((point["median"], point["p25"], point["p75"]),
                                     (None, None, None))
        self.assertEqual(low.status_code, 200, low.text)
        low_payload = low.json()
        self.assertEqual(low_payload["coordinates"]["another"], True)
        self.assertEqual([cohort["key"] for cohort in low_payload["cohorts"]],
                         ["fired", "near_rule", "neutral", "another_factor"])
        self.assertEqual(low_payload["selection"], {
            "state": "unavailable", "requested_id": "stale-catalog-id", "detail": None,
        })
        self.assertEqual(incompatible.status_code, 400)
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(bad_block.status_code, 400)
        self.assertEqual(bad_another.status_code, 400)
        self.assertEqual(empty_factor.status_code, 400)


if __name__ == "__main__":
    unittest.main()
