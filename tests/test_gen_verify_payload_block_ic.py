"""#660: the synthetic Verify-fixture generator must admit its slot-scoped I:C
scenario through the ADR 581 block-corroborated path, not the legacy general-arc
fallback.

Drives the committed generator's own ``_seed`` (imported from
``.claude/qa/gen_verify_payload.py``) through the public ``review_trials``
interface — nothing here hand-sets a Trial's shape (the #273 lesson).
"""

import importlib.util
import pathlib
import tempfile
import unittest

from ciq_autotune.store import Store
from ciq_autotune.watched_change import review_trials

_GEN_PATH = (pathlib.Path(__file__).resolve().parents[1]
             / ".claude" / "qa" / "gen_verify_payload.py")

_spec = importlib.util.spec_from_file_location("gen_verify_payload", _GEN_PATH)
gen_verify_payload = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen_verify_payload)


class SyntheticSlotScopedIcTrialTest(unittest.TestCase):
    """The generator's IC_SLOT_SWITCH scenario must be block-corroborated."""

    def test_slot_scoped_trial_is_block_corroborated(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(pathlib.Path(tmp) / "synthetic.db")
            gen_verify_payload._seed(path)
            with Store.open(path) as store:
                roster = review_trials(
                    store, now=gen_verify_payload.NOW,
                    window_days=gen_verify_payload.WINDOW)
                block_trial = next(
                    t for t in roster["trials"] if t["slot"] == "12:00")
                detail = review_trials(
                    store, now=gen_verify_payload.NOW,
                    window_days=gen_verify_payload.WINDOW,
                    selected=block_trial["id"])["selected"]

        # (a) the id carries the block end-minute suffix per _review_id.
        self.assertTrue(block_trial["id"].endswith("-900"),
                         f"expected an end-minute-suffixed id, got {block_trial['id']!r}")

        # (b) the selected arc evidence is read off the captured 14-meal block
        # cohort, not the legacy general-arc fallback's 42-meal all-day cohort.
        # Dropping `block=trial.block` from the `_trial_evidence` call at
        # watched_change.py:1114-1115 silently widens this to n_peak/n_nadir ==
        # 42 and peak == 182.0, while the id, the limits, and meal_arcs.block
        # all stay unchanged — this is the only assertion here that catches it.
        arc_evidence = next(e for e in detail["evidence"] if e["key"] == "arc")
        self.assertEqual(arc_evidence["before"]["n_peak"], 14)
        self.assertEqual(arc_evidence["before"]["n_nadir"], 14)
        self.assertEqual(arc_evidence["trial"]["n_peak"], 14)
        self.assertEqual(arc_evidence["trial"]["n_nadir"], 14)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
