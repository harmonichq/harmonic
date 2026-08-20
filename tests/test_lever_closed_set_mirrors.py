"""The JavaScript transcriptions of the Lever closed set must match Python (#63).

Two frontend files hand-copy a per-Lever map out of `analyzers/scenario/levers.py`:

* `mockups/findings-projection.mirror.mjs` copies `_OUTCOME_KIND`, because the
  browser gates answer `/diagnose/findings` from that mirror and outcome-anchoring
  decides which window a finding is a member of (decision record 735 holds the
  mirror identical to the server, and this is the part of it no fixture reaches).
* `frontend/kb.js` copies the Lever roster as `LEVER_META`, the Guide mini-queue's
  facsimile weights.

Neither copy is reached by a `--check`. The mirror's deep-compare only exercises the
levers the frozen fixture happens to contain, so a *wrong* outcome kind for a lever
absent from that fixture passes every gate today and silently re-anchors that
finding's window the day it appears. `rankMiniQueue` is worse: it falls back to a
generic weight for an unknown lever, so a missing entry never fails at all — it just
ranks the lever by a default nobody chose.

So the closed set is pinned here, at the authority, for EVERY member rather than for
whichever one was added last. Adding a Lever fails this test until both
transcriptions learn it.
"""

import pathlib
import re
import unittest

from ciq_autotune.analyzers.scenario.levers import _OUTCOME_KIND, Lever

_ROOT = pathlib.Path(__file__).resolve().parents[1]


def _js_object(source: str, name: str) -> dict:
    """The `key: 'value'` pairs of a named JS object literal, as a dict.

    Deliberately a text read, not an import: these files are the artifact under
    test, and running them would prove they parse, not that they agree.
    """
    start = source.index(f"const {name} = {{")
    body = source[start:source.index("};", start)]
    return dict(re.findall(r"(\w+)\s*:\s*'([^']*)'", body))


def _js_object_keys(source: str, name: str) -> set:
    """The keys of a named JS object whose values are themselves object literals.

    Matched on the `{` that opens each value, NOT on line starts: a line-anchored
    pattern sees only the first key on a packed line, so reformatting the file to two
    entries per line would quietly shrink what this compares instead of failing.
    """
    start = source.index(f"const {name} = {{")
    body = source[start:source.index("};", start)]
    return set(re.findall(r"(\w+)\s*:\s*\{", body))


class OutcomeKindMirrorTest(unittest.TestCase):
    def test_the_projection_mirror_transcribes_every_outcome_kind(self):
        source = (_ROOT / "mockups" / "findings-projection.mirror.mjs").read_text()
        mirrored = _js_object(source, "OUTCOME_KIND")
        self.assertEqual(
            mirrored,
            {lever.value: kind for lever, kind in _OUTCOME_KIND.items()},
            "mockups/findings-projection.mirror.mjs OUTCOME_KIND has drifted from "
            "levers._OUTCOME_KIND — the browser gates would anchor a finding in the "
            "wrong window",
        )


class GuideLeverRosterTest(unittest.TestCase):
    def test_the_guide_facsimile_carries_every_lever(self):
        source = (_ROOT / "frontend" / "kb.js").read_text()
        self.assertEqual(
            _js_object_keys(source, "LEVER_META"),
            {lever.value for lever in Lever},
            "frontend/kb.js LEVER_META is missing a Lever, and rankMiniQueue's "
            "fallback means nothing else will say so",
        )


if __name__ == "__main__":
    unittest.main()
