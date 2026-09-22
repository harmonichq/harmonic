"""The engine's own sentences follow the canonical user-copy register (#536).

`SlotEstimate.annotation` and `SegmentEstimate.annotation` are not internal notes:
the Settings audit evidence pane prints them verbatim, and the CLI and the Markdown
report print them too. So they are bound by `DESIGN.md`'s voice and user-copy
register just like any string the surface owns.

The catalogs below ask the real analyzers for every sentence they can emit, so a
copy regression in either analyzer fails here rather than hiding behind a literal.
They lived in `scripts/gen_annotation_fixtures.py` until ADR 416 retired v1 and
with it the browser fixture that generator wrote; this is now their one home.
"""

from __future__ import annotations

import re
import unittest
from datetime import date

from ciq_autotune.analyzers.basal import _annotation_for
from ciq_autotune.analyzers.isf import IsfChannels, IsfConfig, _recommend
from ciq_autotune.render import render_text
from ciq_autotune.report import markdown_report
from ciq_autotune.result import (
    AnalysisResult,
    DataQuality,
    SlotEstimate,
    Span,
)
from ciq_autotune.safety import Status
from ciq_autotune.uncertainty import Estimate

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

# The register, as rules a sentence can be checked against. Every one of these is a
# numbered rule in `DESIGN.md`'s "Voice and user-copy register".
BANNED = [
    (re.compile(r"—"), "prose em dash"),
    (re.compile(r"\basserts?\b|\bpooled\b|fitted relationship", re.I), "engine jargon"),
    (re.compile(r"\bCI\b"), "engine jargon (CI)"),
    (re.compile(r"\bclean\b", re.I), '"clean"'),
    (re.compile(r"\bISF\b", re.I), 'user-facing "ISF"'),
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
