"""The desk's Post-meal arc rows are held identical to the server's (#447).

``frontend/follow-up.js`` ``ARC_ROWS`` names the rows a Trial's served ``arc``
target leads its outcome table with, because a Trial's served rows carry no role.
The server owns that reading: a Focus whose target is ``arc`` serves exactly those
rows as ``mapped_outcome``. The frontend copy is a transcription held identical by
this test, never a second source of truth; if either side changes, this fails.
"""

import re
import unittest
from dataclasses import replace
from datetime import datetime
from pathlib import Path

from ciq_autotune.follow_up_comparison import capture_comparison_context, compare_follow_up
from tests.test_outcomes_trend import _FakeStore, _snapshot_with_ic
from tests.test_scenario_engine import cgm_ramp

FOLLOW_UP_JS = Path(__file__).resolve().parents[1] / "frontend" / "follow-up.js"


class ArcRowsMirrorTest(unittest.TestCase):
    def test_frontend_arc_rows_are_the_rows_the_server_maps_for_arc(self):
        declared = re.search(r"^const ARC_ROWS = \[([^\]]*)\];$", FOLLOW_UP_JS.read_text(), re.M)
        self.assertIsNotNone(declared, "frontend/follow-up.js no longer declares ARC_ROWS")
        frontend = re.findall(r"'([^']*)'", declared.group(1))

        store = _FakeStore(cgm=cgm_ramp(11, 15, 40, 180, 1.4, 140),
                           snaps=[replace(_snapshot_with_ic(10), captured_at=datetime(2026, 1, 1))])
        pin = datetime(2026, 6, 11, 16)
        record = {"kind": "focus", "id": 1, "lever": "late_bolus", "pinned_at": str(pin),
                  "status": "active", "ending": None,
                  "comparison_context": capture_comparison_context(store, at=pin, input_revision=1)}
        comparison = compare_follow_up(store, record=record, data_cutoff=datetime(2026, 6, 12),
                                       input_revision=2)["comparison"]
        self.assertEqual(comparison["target_metric"], "arc")
        served = [row["key"] for row in comparison["outcomes"] if row["role"] == "mapped_outcome"]
        self.assertEqual(frontend, served)


if __name__ == "__main__":
    unittest.main()
