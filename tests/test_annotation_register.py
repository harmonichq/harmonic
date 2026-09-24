"""The engine's own sentences follow the canonical user-copy register (#536).

`SlotEstimate.annotation` and `SegmentEstimate.annotation` are not internal notes:
the Settings audit evidence pane prints them verbatim, and the CLI and the Markdown
report print them too. So they are bound by `DESIGN.md`'s voice and user-copy
register just like any string the surface owns.

The carb-ratio analyzer's block and history annotations and its Findings' text reach
the desk the same way, so they are bound by the same register.

The catalogs below ask the real analyzers for every sentence they can emit, so a
copy regression in any analyzer fails here rather than hiding behind a literal.
They lived in `scripts/gen_annotation_fixtures.py` until ADR 416 retired v1 and
with it the browser fixture that generator wrote; this is now their one home.
"""

from __future__ import annotations

import re
import unittest
from datetime import date, datetime, timedelta

from ciq_autotune.analyze import analyze
from ciq_autotune.analyzers.basal import _annotation_for
from ciq_autotune.analyzers.ic import IcConfig, _history_annotation, analyze_ic
from ciq_autotune.analyzers.ic import _recommend as _ic_recommend
from ciq_autotune.analyzers.isf import IsfChannels, IsfConfig, _recommend
from ciq_autotune.events import CarbEntry, CgmReading
from ciq_autotune.harm import HarmArm, HarmConfig, PrintedLow
from ciq_autotune.render import render_text
from ciq_autotune.report import markdown_report
from ciq_autotune.result import (
    AnalysisResult,
    DataQuality,
    SlotEstimate,
    Span,
)
from ciq_autotune.safety import Status
from ciq_autotune.settings import Snapshot, parse_pump_settings
from ciq_autotune.uncertainty import Estimate
from tests.test_analyzer_ic import (
    IC_6,
    _FakeAnalyzeStore,
    _raw_settings,
    cgm_run,
    ciq_corr,
    corr,
    meal,
    user_corr,
)
from tests.test_ic_blocks import blocks_for, by_id
from tests.test_ic_blocks import meal as block_meal

_CFG = IsfConfig()


def _est(value, lo, hi, n=200):
    return Estimate(value=value, lo=lo, hi=hi, n=n, method="bootstrap-ols-isf")


def _ch(*, night_median=None, fits=None, corr_low_days=0, rescue_days=0,
        covered_days=30, rescue_observed=True):
    pairs = [(date(2026, 6, i + 1), v) for i, v in enumerate(fits or [])]
    if night_median is None and pairs:
        vals = sorted(v for _, v in pairs)
        m = len(vals) // 2
        night_median = vals[m] if len(vals) % 2 else (vals[m - 1] + vals[m]) / 2
    return IsfChannels(night_fits=pairs, night_median=night_median,
                       corr_low_days=corr_low_days, rescue_days=rescue_days,
                       covered_days=covered_days, rescue_observed=rescue_observed)


def basal_annotations() -> dict:
    """Every basal status's sentence, keyed by the status string the API emits."""
    return {status.value: _annotation_for(status) for status in Status}


# One entry per reachable `_recommend` branch. The `direction` each case is expected
# to produce is asserted here, so a case that quietly stops reaching its branch
# fails instead of silently checking yesterday's sentence.
_ISF_CASES = [
    ("no_baseline_no_data", None, _est(None, None, None, 0), _ch(), False, None),
    ("no_baseline_measured", None, _est(40.0, 32.0, 48.0), _ch(night_median=40.0),
     False, None),
    ("no_measurement", 36.0, _est(None, None, None, 0), _ch(), False, None),
    ("weaken_no_target", 36.0, _est(30.0, 26.0, 40.0),
     _ch(night_median=30.0, corr_low_days=4), False, "weaken"),
    ("weaken_easing", 36.0, _est(42.0, 36.5, 48.0),
     _ch(night_median=45.0, corr_low_days=4), False, "weaken"),
    ("weaken_easing_disagreeing_measurement", 36.0, _est(28.0, 24.0, 32.0),
     _ch(night_median=45.0, corr_low_days=4), False, "weaken"),
    ("confirmed", 36.0, _est(40.0, 32.0, 48.0),
     _ch(night_median=40.0, corr_low_days=1), False, None),
    ("held_after_a_low", 36.0, _est(24.0, 18.0, 30.0),
     _ch(fits=[24.0, 25.0, 23.0], corr_low_days=1), False, None),
    ("held_rescue_log_incomplete", 36.0, _est(24.0, 18.0, 30.0),
     _ch(fits=[24.0, 25.0, 23.0], rescue_observed=False), False, None),
    ("collecting_range_too_wide", 36.0, _est(60.0, 45.0, 110.0),
     _ch(fits=[60.0, 58.0, 62.0]), False, None),
    ("strengthen", 36.0, _est(28.0, 25.0, 31.0),
     _ch(fits=[28.0, 27.0, 29.0, 26.0, 28.5]), True, "strengthen"),
    ("watching_not_yet_held", 36.0, _est(28.0, 25.0, 31.0),
     _ch(fits=[28.0, 27.0, 29.0, 26.0, 28.5]), False, None),
]


def isf_annotations() -> dict:
    """Every correction-strength sentence `_recommend` can return, by branch."""
    out = {}
    for name, programmed, est, ch, prior, want_direction in _ISF_CASES:
        _rec, ann, direction, _priced = _recommend(
            programmed, est, ch, _CFG, prior_strengthen_signal=prior)
        if direction != want_direction:
            raise AssertionError(
                f"{name}: expected direction {want_direction!r}, got {direction!r} — "
                "the case no longer reaches the branch it was built for")
        out[name] = ann
    return out


# One entry per carb-ratio `_recommend` branch, with where its recommendation must
# land against the programmed ratio, so a case that stops reaching its branch fails.
_IC_RECOMMEND_CASES = [
    ("no_estimate", 6.0, None, "none"),
    ("no_programmed_value", None, 5.0, "measured"),
    ("under_covered", 6.0, 5.0, "tighter"),
    ("over_covered", 6.0, 7.0, "looser"),
    ("matches", 6.0, 6.0, "same"),
]


def _ic_landing(programmed, measured, rec):
    if rec is None:
        return "none"
    if programmed is None:
        return "measured" if rec == round(measured, 1) else "moved"
    return "tighter" if rec < programmed else "looser" if rec > programmed else "same"


def _ic_rows_from_store(boluses, *, cgm_from, cgm_bg=110):
    """The whole analysis's carb-ratio rows, CGM covering each noon meal's read."""
    cgm = [CgmReading(cgm_from, 110)]
    for day in (5, 6, 7):
        cgm.extend(cgm_run(day, 12, cgm_bg))
    snapshot = Snapshot(
        datetime(2026, 6, 7, 18, 0),
        parse_pump_settings(_raw_settings(isf=50, cr_mu=6000)),
    )
    return analyze(
        _FakeAnalyzeStore(basal=[], cgm=cgm, bolus=boluses, snapshots=[snapshot]),
        window_days=30,
        now=datetime(2026, 6, 8),
        harm_config=None,
    ).ic


def _first_ic_row(events, segments):
    rows, _findings = analyze_ic(events, segments)
    return rows[0]


def _knife_edge_meals(noon_bg):
    # A tiny 09:00 carb bolus leaves prior meal action at noon that makes the
    # bracket cross the programmed ratio under 0% vs 100% credit.
    return [m for day in (5, 6, 7)
            for m in (meal(day, 9, 5, 2.5, bg=110),
                      meal(day, 12, 60, 60 / 6.1, bg=noon_bg))]


def _banded_meals(bg):
    return [meal(5, 12, 60, 12.0, bg=bg), meal(6, 12, 60, 10.0, bg=bg),
            meal(7, 12, 60, 60 / 7, bg=bg)]


def _ic_segment_cases():
    """(name, row, hold reason, prior-insulin exclusions, start-high cross-reference).

    A too-few-meals hold can never carry the cross-reference: it needs a measured
    ratio, which only exists once no more meals are needed."""
    return [
        ("too_few_meals", _first_ic_row([meal(d, 12, 60, 10.0) for d in (1, 2)], IC_6),
         "insufficient_supported_meals", False, False),
        ("too_few_meals_after_prior_insulin", _ic_rows_from_store(
            [meal(day, 12, 60, 12.0, bg=110, pump_iob=0.4 if day == 5 else None)
             for day in (5, 6, 7)],
            cgm_from=datetime(2026, 6, 5, 12))[0],
         "insufficient_supported_meals", True, False),
        ("sensitivity_includes_programmed", _ic_rows_from_store(
            _knife_edge_meals(110), cgm_from=datetime(2026, 6, 4))[0],
         "sensitivity_includes_programmed", False, False),
        ("sensitivity_includes_programmed_start_high", _ic_rows_from_store(
            _knife_edge_meals(160), cgm_from=datetime(2026, 6, 4), cgm_bg=160)[0],
         "sensitivity_includes_programmed", False, True),
        ("band_includes_programmed", _ic_rows_from_store(
            _banded_meals(110), cgm_from=datetime(2026, 6, 4))[0],
         "supported_band_includes_programmed", False, False),
        ("band_includes_programmed_start_high", _ic_rows_from_store(
            _banded_meals(160), cgm_from=datetime(2026, 6, 4))[0],
         "supported_band_includes_programmed", False, True),
        ("over_covered_start_high", _first_ic_row(
            [meal(d, 12, 60, 10.0, bg=155.0) for d in (1, 2, 3, 4)], [(0, 5.0)]),
         None, False, True),
    ]


# The block cases reuse the block tests' fixtures: a 00:00 block programmed at 5.0.
_BLOCK_SEGMENTS = [(0, 5.0), (720, 6.0)]
_HARM_SEGMENTS = [(0, 5.0), (720, 5.0), (1080, 4.0)]


def _block(events, segments=_BLOCK_SEGMENTS, **kw):
    return by_id(blocks_for(segments, events, **kw)[0])[0]


def _ic_block_cases():
    """(name, block, state, held) for every `_block_annotation` state and hold."""
    tighter = [block_meal(d, 9, 60, 15.0, ratio=5.0) for d in range(12)]
    chained = [m for d in range(8)
               for m in (block_meal(d, 11, 60, 12.0), block_meal(d, 13, 60, 12.0))]
    evening = block_meal(3, 19, 40, 8.0, ratio=4.0)
    low = PrintedLow(t=evening.t + timedelta(hours=2), bg=58.0, iob_u=2.1,
                     arm=HarmArm.IC, dominant_bolus_t=evening.t,
                     attribution_reason="meal-bolus")
    rescue = CarbEntry(t=tighter[2].t + timedelta(hours=2), grams=16.0,
                       certainty="estimate", source="manual")
    return [
        ("collecting", _block([block_meal(d, 9, 60, 15.0) for d in range(30)],
                              observed_days=34), "collecting", False),
        ("below_floor", _block([block_meal(d, 9, 60, 15.0) for d in range(4)]),
         "below-floor", False),
        ("unmeasured_alone", _block(chained), "unmeasured-alone", False),
        ("numeric_tighter", _block(tighter), "numeric", False),
        ("numeric_looser",
         _block([block_meal(d, 9, 60, 10.0, ratio=5.0) for d in range(12)]),
         "numeric", False),
        ("numeric_settled",
         _block([block_meal(d, 9, 60, 12.0, ratio=5.0) for d in range(12)]),
         "numeric", False),
        ("held_regime_bracket",
         _block([block_meal(d, 9, 60, 15.0, ratio=6.0) for d in range(12)]),
         "numeric", True),
        ("held_meal_owned_low",
         _block(tighter + [evening], _HARM_SEGMENTS, harm_config=HarmConfig(),
                harm_lows=[low]),
         "numeric", True),
        ("held_pre_empted_low",
         _block(tighter, _HARM_SEGMENTS, carb_entries=[rescue]), "numeric", True),
    ]


def _carb_counting_meals():
    events = []
    for d, carbs, dose, cor in ((1, 20, 10.0, 0.0), (2, 80, 10.0, 0.0),
                                (3, 30, 12.0, 3.0), (4, 90, 9.0, 0.0),
                                (5, 25, 11.0, 4.0), (6, 85, 8.0, 0.0)):
        events.append(meal(d, 12, carbs, dose))
        if cor:
            events.append(corr(d, 14, 0, cor))
    return events


def _corrected_meals(user_u, ciq_u):
    return [m for d in (1, 2, 3, 4)
            for m in (meal(d, 12, 60, 10.0), user_corr(d, 13, 0, user_u),
                      ciq_corr(d, 13, 30, ciq_u))]


def ic_annotations() -> dict:
    """Every carb-ratio sentence the analyzer serves on a row, by branch."""
    out = {}
    for name, programmed, measured, want in _IC_RECOMMEND_CASES:
        rec, ann = _ic_recommend(programmed, measured, IcConfig())
        if _ic_landing(programmed, measured, rec) != want:
            raise AssertionError(
                f"{name}: expected a {want} recommendation, got {rec!r} — "
                "the case no longer reaches the branch it was built for")
        out[f"recommend {name}"] = ann
    for name, row, hold, excluded, xref in _ic_segment_cases():
        prior = row.evidence["prior_meal_action"]
        reached = (prior["hold_reason"],
                   bool(prior["contaminated_meals"] + prior["unknown_meals"]),
                   "meals start high" in row.annotation)
        if reached != (hold, excluded, xref):
            raise AssertionError(
                f"{name}: expected {(hold, excluded, xref)!r}, got {reached!r} — "
                "the case no longer reaches the branch it was built for")
        out[f"segment {name}"] = row.annotation
    owned, _findings = analyze_ic([meal(d, 12, 60, 10.0) for d in (1, 2)],
                                  [(0, 6.0), (720, 6.0)])
    for row in owned:
        if row.evidence["block_id"] != 0:
            raise AssertionError("both segments must read with the one all-day block")
        out[f"segment read with its block at {row.label}"] = row.annotation
    for name, block, state, held in _ic_block_cases():
        if (block.state, block.held_reason is not None) != (state, held):
            raise AssertionError(
                f"{name}: expected {(state, held)!r}, got "
                f"{(block.state, block.held_reason is not None)!r} — "
                "the case no longer reaches the branch it was built for")
        out[f"block {name}"] = block.annotation
    for name, support, band in (("runs_with_range", 3, (5.5, 6.5)),
                                ("one_run_with_range", 1, (5.5, 6.5)),
                                ("no_range", 3, (None, None))):
        estimate = Estimate(value=6.0, lo=band[0], hi=band[1], n=support,
                            method="pooled-ratio")
        out[f"history {name}"] = _history_annotation(5.0, estimate, support)
    return out


def ic_finding_sentences() -> dict:
    """Every summary and occurrence detail of the carb-ratio analyzer's Findings."""
    cases = [
        ("carb-counting", _carb_counting_meals(), lambda f: True),
        ("meals-start-high", [meal(d, 12, 60, 10.0, bg=155.0) for d in (1, 2, 3, 4)],
         lambda f: True),
        ("post-meal-correction-burden", _corrected_meals(3.0, 1.0),
         lambda f: f.evidence["user_u"] >= f.evidence["ciq_u"]),
        ("post-meal-correction-burden", _corrected_meals(1.0, 3.0),
         lambda f: f.evidence["user_u"] < f.evidence["ciq_u"]),
    ]
    out = {}
    for index, (detector, events, reached) in enumerate(cases):
        _, findings = analyze_ic(events, IC_6)
        found = [f for f in findings if f.detector == detector]
        if len(found) != 1 or not reached(found[0]) or not found[0].occurrences:
            raise AssertionError(
                f"{detector} case {index}: the case no longer reaches the Finding "
                "it was built for")
        out[f"{detector} {index} summary"] = found[0].summary
        for n, occurrence in enumerate(found[0].occurrences):
            out[f"{detector} {index} occurrence {n}"] = occurrence.detail
    return out


# The register, as rules a sentence can be checked against. Every one of these is a
# numbered rule in `DESIGN.md`'s "Voice and user-copy register".
BANNED = [
    (re.compile(r"—"), "prose em dash"),
    (re.compile(r"\basserts?\b|\bpooled\b|fitted relationship", re.I), "engine jargon"),
    (re.compile(r"\bCI\b"), "engine jargon (CI)"),
    (re.compile(r"\bclean\b", re.I), '"clean"'),
    (re.compile(r"\bISF\b", re.I), 'user-facing "ISF"'),
    (re.compile(r"\bI:C\b"), 'user-facing "I:C"'),
    (re.compile(r"\bslots?\b", re.I), 'user-facing "slot"'),
]


class RegisterTest(unittest.TestCase):
    def _check(self, where, sentence):
        self.assertTrue(sentence, f"{where}: empty annotation")
        for pattern, why in BANNED:
            self.assertIsNone(pattern.search(sentence),
                              f"{where} breaks the register ({why}): {sentence!r}")

    def test_every_basal_status_annotation_is_in_register(self):
        catalog = basal_annotations()
        self.assertEqual(len(catalog), len(Status),
                         "every status must carry a sentence")
        for status in Status:
            with self.subTest(status=status.value):
                self._check(f"basal {status.value}", _annotation_for(status))

    def test_every_correction_strength_branch_is_in_register(self):
        for branch, sentence in isf_annotations().items():
            with self.subTest(branch=branch):
                self._check(f"correction strength {branch}", sentence)

    def test_every_carb_ratio_branch_is_in_register(self):
        for branch, sentence in ic_annotations().items():
            with self.subTest(branch=branch):
                self._check(f"carb ratio {branch}", sentence)

    def test_every_carb_ratio_finding_sentence_is_in_register(self):
        for where, sentence in ic_finding_sentences().items():
            with self.subTest(where=where):
                self._check(f"carb ratio {where}", sentence)


class HeldSlotPrintsInRegisterTest(unittest.TestCase):
    """The held-for-safety sentence never renders in Settings audit (the pane
    substitutes its own held wording), but the CLI and the Markdown report print it
    verbatim — so it is checked where it actually reaches a reader."""

    def setUp(self):
        held = _annotation_for(Status.HARM_GATED)
        self.sentence = held
        self.result = AnalysisResult(
            schema_version=1,
            generated_at="2026-08-03 09:00:00",
            window_days=30,
            span=Span(start="2026-07-04 00:00:00", end="2026-08-03 09:00:00"),
            epochs=[],
            data_quality=DataQuality(counts={"cgm_readings": 8000}, notes=[]),
            basal=[SlotEstimate(
                6, "03:00", 0.65,
                Estimate(0.72, 0.68, 0.79, 12, 0.8, "bootstrap-median"),
                0.65, held, 12)],
            isf=[], ic=[], behavioral=[],
        )

    def test_cli_prints_the_held_sentence(self):
        self.assertIn(self.sentence, render_text(self.result))

    def test_markdown_report_prints_the_held_sentence(self):
        self.assertIn(self.sentence, markdown_report(self.result))


if __name__ == "__main__":
    unittest.main()
