"""Fail closed if an executable consumer still names the retired QA store."""

from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
RETIRED_PATTERN = (
    "revise" + "-e2e|revise" + "_e2e|gen_" + "revise" + "_e2e_db"
)
EXECUTABLE_SURFACE = (
    "AGENTS.md",
    ".claude",
    ".github",
    "harness",
    "scripts",
    "tests",
    "frontend",
    "mockups",
)
EXECUTABLE_GLOBS = (
    "AGENTS.md",
    ".claude/**",
    ".github/**",
    "harness/**",
    "scripts/**",
    "tests/**",
    "frontend/**",
    "mockups/**/*.mjs",
)


class RetiredReviseE2ETest(unittest.TestCase):
    def test_closed_executable_surface_has_no_retired_name(self) -> None:
        command = [
            "rg", "-n", "--hidden", RETIRED_PATTERN, *EXECUTABLE_SURFACE,
        ]
        for glob in EXECUTABLE_GLOBS:
            command.extend(("--glob", glob))
        result = subprocess.run(
            command, cwd=REPO_ROOT, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertEqual(result.stdout, "")

    def test_retired_generator_is_absent(self) -> None:
        generator = REPO_ROOT / "scripts" / ("gen_" + "revise" + "_e2e_db.py")
        self.assertFalse(generator.exists())

    def test_retired_fixture_directory_is_absent(self) -> None:
        fixture = REPO_ROOT / "mockups" / ("revise" + "-e2e.synthetic")
        self.assertFalse(fixture.exists())


if __name__ == "__main__":
    unittest.main()
