"""Fail closed if an executable consumer still names the retired QA store."""

from __future__ import annotations

import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
RETIRED_PATTERN = re.compile(
    "revise" + "-e2e|revise" + "_e2e|gen_" + "revise" + "_e2e_db"
)
# The closed executable surface: every file under these roots, plus only the
# executable JavaScript under mockups/ (its markdown and JSON are historical
# evidence, not consumers). docs/ and openspec/ are decision history and are
# deliberately outside the scan.
EXECUTABLE_FILES = ("AGENTS.md",)
EXECUTABLE_ROOTS = (".claude", ".github", "harness", "scripts", "tests", "frontend")
EXECUTABLE_MOCKUP_SUFFIX = ".mjs"
SKIPPED_DIRS = {".git", "node_modules", "__pycache__", ".venv"}


def _surface() -> list[Path]:
    files = [REPO_ROOT / name for name in EXECUTABLE_FILES]
    for root in EXECUTABLE_ROOTS:
        base = REPO_ROOT / root
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.is_file() and not (set(path.relative_to(REPO_ROOT).parts) & SKIPPED_DIRS):
                files.append(path)
    for path in (REPO_ROOT / "mockups").rglob("*" + EXECUTABLE_MOCKUP_SUFFIX):
        if path.is_file():
            files.append(path)
    return files


def retired_name_hits() -> list[str]:
    hits = []
    for path in _surface():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for number, line in enumerate(text.splitlines(), start=1):
            if RETIRED_PATTERN.search(line):
                hits.append(f"{path.relative_to(REPO_ROOT)}:{number}: {line.strip()}")
    return hits


class RetiredReviseE2ETest(unittest.TestCase):
    def test_closed_executable_surface_has_no_retired_name(self) -> None:
        hits = retired_name_hits()
        self.assertEqual(hits, [], "\n".join(hits))

    def test_scan_sees_a_planted_retired_name(self) -> None:
        # The scan is only evidence if it can see a hit: this file names the
        # pattern in pieces, so plant one whole and confirm it is found.
        planted = "revise" + "-e2e"
        self.assertIsNotNone(RETIRED_PATTERN.search(f"serve --db mockups/{planted}.synthetic/x"))

    def test_retired_generator_is_absent(self) -> None:
        generator = REPO_ROOT / "scripts" / ("gen_" + "revise" + "_e2e_db.py")
        self.assertFalse(generator.exists())

    def test_retired_fixture_directory_is_absent(self) -> None:
        fixture = REPO_ROOT / "mockups" / ("revise" + "-e2e.synthetic")
        self.assertFalse(fixture.exists())


if __name__ == "__main__":
    unittest.main()
