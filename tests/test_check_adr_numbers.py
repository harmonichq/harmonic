"""Tests for scripts/check_adr_numbers.py.

Runs the checker against a temporary directory, so no real ADR files are
touched.

Regression: the old sequential scheme let two concurrent branches each pick
"the next free number" off a stale base and silently produce, e.g.,
0039-foo.md + 0039-bar.md.  The new scheme keys identity on (issue, slug),
so two ADRs from issue #152 with distinct slugs PASS while any duplicate
(issue, slug) or duplicate legacy NNNN prefix FAILS.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

# scripts/ is not a package; add it to sys.path for a direct import.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import check_adr_numbers  # noqa: E402


def _adr(directory: Path, name: str, heading: str) -> None:
    (directory / name).write_text(
        f"{heading}\n\n- Status: Accepted\n\n## Context\n\nContent.\n",
        encoding="utf-8",
    )


class _Base(unittest.TestCase):
    def setUp(self) -> None:
        self._td = tempfile.TemporaryDirectory()
        self.d = Path(self._td.name)
        self._orig = check_adr_numbers.ADR_DIR
        check_adr_numbers.ADR_DIR = self.d

    def tearDown(self) -> None:
        check_adr_numbers.ADR_DIR = self._orig
        self._td.cleanup()


class TestAbsentDir(unittest.TestCase):
    """The public tree ships this script but nothing under docs/adr/ (Harmonic
    cutover Phase 1.7) — a repository with no decisions recorded yet is legal.
    _Base.setUp always installs a real temp dir, so this branch needs its own
    fixture that never creates one."""

    def setUp(self) -> None:
        self._orig = check_adr_numbers.ADR_DIR
        with tempfile.TemporaryDirectory() as td:
            # The directory is deleted again immediately below — setUp only
            # needs a path guaranteed not to exist.
            self.missing = Path(td) / "adr"
        check_adr_numbers.ADR_DIR = self.missing

    def tearDown(self) -> None:
        check_adr_numbers.ADR_DIR = self._orig

    def test_absent_dir_passes(self) -> None:
        self.assertFalse(self.missing.exists())
        self.assertEqual(check_adr_numbers.main(), 0)


class TestNewScheme(_Base):
    def test_single_file_passes(self) -> None:
        _adr(
            self.d,
            "adr-152-model-view-data-contract.md",
            "# ADR 152 — Model-view data contract",
        )
        self.assertEqual(check_adr_numbers.main(), 0)

    def test_same_issue_different_slugs_passes(self) -> None:
        """#152 spawning two ADRs with distinct slugs must pass — this is the
        key improvement over the old sequential scheme."""
        _adr(
            self.d,
            "adr-152-model-view-data-contract.md",
            "# ADR 152 — Model-view data contract",
        )
        _adr(
            self.d,
            "adr-152-silence-reasons-are-a-closed-verdict-taxonomy.md",
            "# ADR 152 — Silence reasons",
        )
        self.assertEqual(check_adr_numbers.main(), 0)

    def test_heading_issue_mismatch_fails(self) -> None:
        _adr(
            self.d,
            "adr-152-model-view-data-contract.md",
            "# ADR 99 — Wrong issue number in heading",
        )
        self.assertNotEqual(check_adr_numbers.main(), 0)

    def test_multiple_distinct_issues_passes(self) -> None:
        _adr(
            self.d,
            "adr-152-model-view-data-contract.md",
            "# ADR 152 — Model-view data contract",
        )
        _adr(self.d, "adr-267-in-process-result-cache.md", "# ADR 267 — Result cache")
        self.assertEqual(check_adr_numbers.main(), 0)


class TestLegacyScheme(_Base):
    def test_single_legacy_file_passes(self) -> None:
        _adr(
            self.d,
            "0001-parameter-tuning-strategy.md",
            "# ADR 0001 — Parameter tuning strategy",
        )
        self.assertEqual(check_adr_numbers.main(), 0)

    def test_legacy_duplicate_prefix_fails(self) -> None:
        """Two legacy files with the same NNNN prefix reproduce the old collision."""
        _adr(
            self.d,
            "0039-isf-ic-measure-compare-split.md",
            "# ADR 0039 — ISF/I:C measure",
        )
        _adr(
            self.d,
            "0039-harm-layer-basal-arm-implementation.md",
            "# ADR 0039 — Harm layer",
        )
        self.assertNotEqual(check_adr_numbers.main(), 0)

    def test_legacy_heading_mismatch_fails(self) -> None:
        _adr(
            self.d,
            "0001-parameter-tuning-strategy.md",
            "# ADR 0002 — Wrong heading number",
        )
        self.assertNotEqual(check_adr_numbers.main(), 0)


class TestMixedScheme(_Base):
    def test_legacy_and_new_coexist(self) -> None:
        _adr(
            self.d,
            "0001-parameter-tuning-strategy.md",
            "# ADR 0001 — Parameter tuning strategy",
        )
        _adr(
            self.d,
            "adr-152-model-view-data-contract.md",
            "# ADR 152 — Model-view data contract",
        )
        self.assertEqual(check_adr_numbers.main(), 0)

    def test_malformed_filename_fails(self) -> None:
        _adr(self.d, "README.md", "# Not an ADR")
        self.assertNotEqual(check_adr_numbers.main(), 0)


if __name__ == "__main__":
    unittest.main()
