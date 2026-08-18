"""Tests for scripts/allowlist_rules.py and scripts/check_public_allowlist.py
(#728, cutover plan Phase 1).

Grammar and precedence tests drive ``allowlist_rules`` directly — no
filesystem or git needed. One end-to-end test runs ``check_public_allowlist``
against the real repo and the real committed allowlist, matching this repo's
convention (see ``test_check_demo_fixtures.py``) of pinning one smoke test to
the unmodified tree alongside the isolated unit tests.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

# scripts/ is not a package; add it to sys.path for a direct import (matches
# tests/test_check_adr_numbers.py's convention).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import allowlist_rules  # noqa: E402
import check_public_allowlist  # noqa: E402


class TestGrammar(unittest.TestCase):
    """Parse-time validation (plan §1.3)."""

    def test_exact_positive_clears_one_file(self) -> None:
        allowlist = allowlist_rules.parse("pyproject.toml\n")
        self.assertEqual(allowlist.disposition("pyproject.toml"), (True, "exact-positive: pyproject.toml"))
        self.assertEqual(allowlist.disposition("other.toml")[0], False)

    def test_glob_positive_requires_extension_whitelist(self) -> None:
        allowlist = allowlist_rules.parse("frontend/** {.js,.html}\n")
        self.assertTrue(allowlist.disposition("frontend/index.html")[0])
        self.assertTrue(allowlist.disposition("frontend/sub/app.js")[0])
        self.assertFalse(allowlist.disposition("frontend/data.json")[0])
        self.assertFalse(allowlist.disposition("other/index.html")[0])

    def test_bare_double_star_is_rejected(self) -> None:
        with self.assertRaises(allowlist_rules.AllowlistError):
            allowlist_rules.parse("**\n")

    def test_directory_glob_without_extension_whitelist_is_rejected(self) -> None:
        """A `dir/**` rule with no `{...}` is the bare-** failure mode named in
        §1.3: it would positively clear any future file dropped there,
        binary or not."""
        with self.assertRaises(allowlist_rules.AllowlistError):
            allowlist_rules.parse("frontend/**\n")

    def test_glob_with_empty_extension_braces_is_rejected(self) -> None:
        with self.assertRaises(allowlist_rules.AllowlistError):
            allowlist_rules.parse("frontend/** {}\n")

    def test_exact_deny_clears_before_positive(self) -> None:
        allowlist = allowlist_rules.parse(
            "frontend/** {.mjs}\n! frontend/leak.shot.mjs\n"
        )
        self.assertFalse(allowlist.disposition("frontend/leak.shot.mjs")[0])
        self.assertTrue(allowlist.disposition("frontend/ok.mjs")[0])

    def test_exact_deny_rejects_glob_syntax(self) -> None:
        with self.assertRaises(allowlist_rules.AllowlistError):
            allowlist_rules.parse("! frontend/*.shot.mjs\n")

    def test_same_path_as_positive_and_deny_is_a_parse_error(self) -> None:
        """§1.3 [R10]: a path named by both forms is a parse-time error, not
        resolved by precedence."""
        with self.assertRaises(allowlist_rules.AllowlistError):
            allowlist_rules.parse("frontend/x.js\n! frontend/x.js\n")

    def test_duplicate_exact_positive_is_a_parse_error(self) -> None:
        with self.assertRaises(allowlist_rules.AllowlistError):
            allowlist_rules.parse("pyproject.toml\npyproject.toml\n")

    def test_comments_and_blank_lines_are_ignored(self) -> None:
        allowlist = allowlist_rules.parse("# a comment\n\npyproject.toml\n\n")
        self.assertTrue(allowlist.disposition("pyproject.toml")[0])


class TestPrecedence(unittest.TestCase):
    """Fixed chain: exact-deny > exact-positive > binary-deny > glob-positive
    > default-exclude (§1.3)."""

    def test_binary_extensions_are_denied_globally(self) -> None:
        allowlist = allowlist_rules.parse("frontend/** {.png,.js}\n")
        self.assertFalse(allowlist.disposition("frontend/capture.png")[0])
        self.assertTrue(allowlist.disposition("frontend/app.js")[0])

    def test_exact_positive_overrides_binary_deny(self) -> None:
        """The one legitimate binary in the plan (favicon.svg) isn't actually
        binary, but the override path itself is part of the contract."""
        allowlist = allowlist_rules.parse("frontend/logo.png\n")
        self.assertTrue(allowlist.disposition("frontend/logo.png")[0])

    def test_unmatched_path_defaults_to_excluded(self) -> None:
        allowlist = allowlist_rules.parse("pyproject.toml\n")
        self.assertEqual(allowlist.disposition("docs/adr/adr-1-x.md"), (False, "default-exclude"))

    def test_disposition_is_total_over_arbitrary_paths(self) -> None:
        """No input raises — every tracked path resolves to included or
        excluded (the "no third state" property check_public_allowlist relies
        on)."""
        allowlist = allowlist_rules.parse("pyproject.toml\nfrontend/** {.js}\n! frontend/bad.js\n")
        for path in ["", "a", "a/b/c.js", "frontend/bad.js", "frontend/bad.js.js", ".hidden"]:
            ok, reason = allowlist.disposition(path)
            self.assertIsInstance(ok, bool)
            self.assertIsInstance(reason, str)


class TestCheckAgainstRealRepo(unittest.TestCase):
    """One end-to-end smoke test against the actual committed allowlist and
    the actual tracked tree (matches test_check_demo_fixtures.py's pattern)."""

    def test_committed_allowlist_parses_and_dispositions_every_tracked_file(self) -> None:
        self.assertEqual(check_public_allowlist.main(), 0)

    def test_committed_allowlist_clears_the_core_source_trees(self) -> None:
        allowlist = allowlist_rules.load()
        for path in [
            "pyproject.toml",
            "CLAUDE.md",
            "ciq_autotune/model.py",
            "tests/test_store.py",
            "frontend/index.html",
            "scripts/check_public_allowlist.py",
            "scripts/public_allowlist.txt",
            "scripts/public_scan_config.txt",
            "githooks/pre-push",
            "docs/kb/start-here.md",
            # AGENTS.md ships by exact path (#728): the repo's own copy is
            # rewritten for the public audience and becomes the public
            # contributor document. It was previously ruled "replaced, not
            # copied", which left CLAUDE.md's symlink dangling in the
            # materialised tree — a FAILURE from the contamination scan.
            "AGENTS.md",
        ]:
            self.assertTrue(allowlist.disposition(path)[0], f"{path} should be cleared")

    def test_committed_allowlist_excludes_known_contamination(self) -> None:
        allowlist = allowlist_rules.load()
        for path in [
            "tconnect-data/ciq.db",
            "docs/screenshots/issue-385/before.png",
            "frontend/dose-focus-385.shot.mjs",
            "frontend/basal-lane-394.shot.mjs",
            "docs/adr/adr-1-example.md",
        ]:
            self.assertFalse(allowlist.disposition(path)[0], f"{path} should be excluded")


if __name__ == "__main__":
    unittest.main()
