"""Tests for scripts/check_adr_numbers.py.

Runs the checker against temporary directories, so no real decision record is
touched.

Two regressions are pinned here. The old sequential scheme let two concurrent
branches each pick "the next free number" off a stale base and silently produce
0039-foo.md + 0039-bar.md; identity keyed on the originating issue makes that
collision impossible, and two records from one issue with distinct titles still
pass. The second is the fork this guard was rewritten for (ADR 25): a record
written into a parallel docs/adr/ tree instead of the OpenSpec change that is
this repository's decision home.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

# scripts/ is not a package; add it to sys.path for a direct import.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import check_adr_numbers  # noqa: E402


class _Base(unittest.TestCase):
    def setUp(self) -> None:
        self._td = tempfile.TemporaryDirectory()
        self.d = Path(self._td.name)
        self._orig = (check_adr_numbers.CHANGES_DIR, check_adr_numbers.RETIRED_DIR,
                      check_adr_numbers.REPO_ROOT)
        check_adr_numbers.REPO_ROOT = self.d
        check_adr_numbers.CHANGES_DIR = self.d / "openspec" / "changes"
        check_adr_numbers.CHANGES_DIR.mkdir(parents=True)
        # Absent unless a test creates it — its absence is the passing state.
        check_adr_numbers.RETIRED_DIR = self.d / "docs" / "adr"

    def tearDown(self) -> None:
        (check_adr_numbers.CHANGES_DIR, check_adr_numbers.RETIRED_DIR,
         check_adr_numbers.REPO_ROOT) = self._orig
        self._td.cleanup()

    def design(self, change: str, *headings: str) -> None:
        directory = check_adr_numbers.CHANGES_DIR / change
        directory.mkdir(parents=True, exist_ok=True)
        body = f"# Design — {change}\n\n" + "".join(
            f"{heading}\n\n**Ruling.** Content.\n\n" for heading in headings
        )
        (directory / "design.md").write_text(body, encoding="utf-8")


class TestAbsentDir(unittest.TestCase):
    """A repository with no decisions recorded yet is legal — the public tree
    ships this guard and not the historical records."""

    def setUp(self) -> None:
        self._orig = check_adr_numbers.CHANGES_DIR
        with tempfile.TemporaryDirectory() as td:
            # Deleted again immediately — setUp only needs a path guaranteed
            # not to exist.
            self.missing = Path(td) / "changes"
        check_adr_numbers.CHANGES_DIR = self.missing

    def tearDown(self) -> None:
        check_adr_numbers.CHANGES_DIR = self._orig

    def test_absent_dir_passes(self) -> None:
        self.assertFalse(self.missing.exists())
        self.assertEqual(check_adr_numbers.main(), 0)


class TestRecords(_Base):
    def test_single_record_passes(self) -> None:
        self.design("model-view", "## ADR 152 — Model-view data contract")
        self.assertEqual(check_adr_numbers.main(), 0)

    def test_same_issue_different_titles_passes(self) -> None:
        """#152 spawning two records with distinct titles must pass — the whole
        point of keying identity on the issue rather than a counter."""
        self.design("model-view", "## ADR 152 — Model-view data contract",
                    "## ADR 152 — Silence reasons")
        self.assertEqual(check_adr_numbers.main(), 0)

    def test_two_changes_carrying_distinct_records_passes(self) -> None:
        self.design("model-view", "## ADR 152 — Model-view data contract")
        self.design("result-cache", "## ADR 267 — In-process result cache")
        self.assertEqual(check_adr_numbers.main(), 0)

    def test_same_identity_twice_fails(self) -> None:
        """The collision the scheme exists to prevent, in its new shape: one
        decision recorded in two changes."""
        self.design("model-view", "## ADR 152 — Model-view data contract")
        self.design("model-view-again", "## ADR 152 — Model-view data contract")
        self.assertNotEqual(check_adr_numbers.main(), 0)

    def test_heading_without_an_issue_fails(self) -> None:
        self.design("model-view", "## ADR — Model-view data contract")
        self.assertNotEqual(check_adr_numbers.main(), 0)

    def test_heading_without_a_title_fails(self) -> None:
        self.design("model-view", "## ADR 152")
        self.assertNotEqual(check_adr_numbers.main(), 0)

    def test_prose_and_other_headings_are_not_records(self) -> None:
        self.design("model-view", "## Context", "## ADR 152 — Model-view data contract")
        self.assertEqual(check_adr_numbers.main(), 0)


class TestRetiredTree(_Base):
    """docs/adr/ is not a second home; a record appearing there is the fork."""

    def test_record_under_docs_adr_fails(self) -> None:
        self.design("model-view", "## ADR 152 — Model-view data contract")
        check_adr_numbers.RETIRED_DIR.mkdir(parents=True)
        (check_adr_numbers.RETIRED_DIR / "adr-152-model-view.md").write_text(
            "# ADR 152 — Model-view data contract\n", encoding="utf-8")
        self.assertNotEqual(check_adr_numbers.main(), 0)

    def test_empty_docs_adr_dir_passes(self) -> None:
        """An empty directory holds no record, so there is nothing forked."""
        self.design("model-view", "## ADR 152 — Model-view data contract")
        check_adr_numbers.RETIRED_DIR.mkdir(parents=True)
        self.assertEqual(check_adr_numbers.main(), 0)


if __name__ == "__main__":
    unittest.main()
