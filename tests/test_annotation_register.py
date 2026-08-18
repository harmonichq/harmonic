"""The engine's own sentences follow the canonical user-copy register (#536).

`SlotEstimate.annotation` and `SegmentEstimate.annotation` are not internal notes:
the Settings audit evidence pane prints them verbatim, and the CLI and the Markdown
report print them too. So they are bound by `DESIGN.md`'s voice and user-copy
register just like any string the surface owns.

The catalogs under test are the ones the browser fixture is generated from
(`scripts/gen_annotation_fixtures.py`), so a sentence can never be register-clean in
the rendered gate while the engine still emits something else.
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))

from ciq_autotune.analyzers.basal import _annotation_for  # noqa: E402
from ciq_autotune.render import render_text  # noqa: E402
from ciq_autotune.report import markdown_report  # noqa: E402
from ciq_autotune.result import (  # noqa: E402
    AnalysisResult,
    DataQuality,
    SlotEstimate,
    Span,
)
from ciq_autotune.safety import Status  # noqa: E402
from ciq_autotune.uncertainty import Estimate  # noqa: E402

from gen_annotation_fixtures import (  # noqa: E402
    OUT,
    basal_annotations,
    isf_annotations,
    payload,
)

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

    def test_the_committed_browser_fixture_matches_the_analyzers(self):
        # The rendered gate reads this file; if it drifts, the gate proves the rule
        # for yesterday's copy while the engine ships something else.
        committed = json.loads(OUT.read_text())
        self.assertEqual(committed["basal"], payload()["basal"])
        self.assertEqual(committed["isf"], payload()["isf"])


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
