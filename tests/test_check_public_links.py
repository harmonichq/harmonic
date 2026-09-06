"""Tests for scripts/check_public_links.py (#728, cutover plan Phase 2.2).

The unit tests build a fake "public tree" plus a fake tracked set and drive
``check`` directly, so each of the three rules is exercised in isolation. The
first two reproduce the links this check was written for — a markdown link into
``docs/adr/`` and a prose pointer at a ``mockups/`` file — which is how we know
a fourth would be caught rather than shipped. One end-to-end test then runs the
check against the real materialised tree, matching this repo's convention (see
``test_check_public_allowlist.py``) of pinning one smoke test to the real tree
alongside the isolated units.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

# scripts/ is not a package; add it to sys.path for a direct import (matches
# tests/test_check_adr_numbers.py's convention).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_public_tree  # noqa: E402
import check_public_links  # noqa: E402


class _Tree(unittest.TestCase):
    """A throwaway public tree plus the tracked set it was built from."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tree = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def write(self, rel: str, text: str) -> None:
        path = self.tree / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def check(self, tracked: set[str]) -> list[str]:
        return check_public_links.check(self.tree, tracked)


class TestMarkdownLinks(_Tree):

    def test_link_into_an_excluded_record_fails(self) -> None:
        """README.md's deployment link, as it stood: the ADR is tracked here and
        excluded from the public tree."""
        self.write("README.md", "See [the design](docs/adr/adr-6-ci-and-docker-deployment.md).\n")
        failures = self.check({"README.md", "docs/adr/adr-6-ci-and-docker-deployment.md"})
        self.assertEqual(len(failures), 1, failures)
        self.assertIn("adr-6-ci-and-docker-deployment.md", failures[0])

    def test_link_to_a_shipped_file_passes(self) -> None:
        self.write("README.md", "Licensed under [PolyForm](LICENSE).\n")
        self.write("LICENSE", "terms\n")
        self.assertEqual(self.check({"README.md", "LICENSE"}), [])

    def test_anchor_and_scheme_links_are_not_paths(self) -> None:
        """The knowledge base links in-product surfaces as `app:day`, and links
        its own headings as bare fragments. Neither is a file."""
        self.write("docs/kb/reading-day.md",
                   "[Open your Day surface](app:day), or [jump](#the-pipeline),"
                   " or read [the docs](https://example.com/x).\n")
        self.assertEqual(self.check({"docs/kb/reading-day.md"}), [])

    def test_link_escaping_the_tree_fails(self) -> None:
        self.write("README.md", "[out](../secrets.md)\n")
        failures = self.check({"README.md"})
        self.assertEqual(len(failures), 1, failures)
        self.assertIn("escapes the public tree", failures[0])


class TestProsePathReferences(_Tree):

    def test_prose_pointer_at_an_excluded_file_fails(self) -> None:
        """PRODUCT.md's mockup-library pointer: no markdown link, just a path in
        backticks, which is why the link rule alone was not enough."""
        self.write("PRODUCT.md", "see the mockup library, `mockups/INDEX.md`, and the builders\n")
        failures = self.check({"PRODUCT.md", "mockups/INDEX.md"})
        self.assertEqual(len(failures), 1, failures)
        self.assertIn("mockups/INDEX.md", failures[0])

    def test_prose_pointer_at_an_excluded_directory_fails(self) -> None:
        self.write("PRODUCT.md", "and docs/adr/ for the reasoning trail\n")
        failures = self.check({"PRODUCT.md", "docs/adr/adr-6-ci-and-docker-deployment.md"})
        self.assertEqual(len(failures), 1, failures)
        self.assertIn("excludes entirely", failures[0])

    def test_a_directory_that_ships_partly_passes(self) -> None:
        self.write("PRODUCT.md", "the specs under openspec/specs/ say why\n")
        self.write("openspec/specs/plan/spec.md", "# Plan\n")
        self.assertEqual(self.check({"PRODUCT.md", "openspec/specs/plan/spec.md"}), [])

    def test_runtime_paths_and_globs_are_not_references(self) -> None:
        """`tconnect-data/ciq.db` is created at runtime and `frontend/*.js` is a
        glob: neither is tracked, so neither could have been excluded."""
        self.write("README.md",
                   "The database defaults to `tconnect-data/ciq.db`; see the builders in"
                   " `frontend/*.js` and name records `docs/adr/adr-<issue>-<slug>.md`.\n")
        self.assertEqual(self.check({"README.md"}), [])

    def test_rule_file_patterns_are_not_references_but_its_comments_are(self) -> None:
        """An ignore pattern naming a path makes no claim that the path ships.
        A comment pointing a reader at a document does."""
        self.write(".gitignore", ".agents/skills/lib/parser.mjs\n")
        self.assertEqual(self.check({".gitignore", ".agents/skills/lib/parser.mjs"}), [])

        self.write(".gitignore", "# quoted in docs/agents/mock-to-app-process.md\n")
        failures = self.check({".gitignore", "docs/agents/mock-to-app-process.md"})
        self.assertEqual(len(failures), 1, failures)
        self.assertIn("mock-to-app-process.md", failures[0])

    def test_a_pinned_reference_is_cleared_with_its_reason(self) -> None:
        """`AGENTS.md` names `openspec/changes/` as where a new decision record is
        created, not as content to go and read. Pinned per document, with the
        reason visible in the check itself."""
        self.assertIn(("AGENTS.md", "openspec/changes/"), check_public_links.PINNED)
        self.write("AGENTS.md", "Decision records live in `openspec/changes/`.\n")
        self.assertEqual(self.check({"AGENTS.md", "openspec/changes/x/design.md"}), [])
        # The same path in another document is still a failure.
        self.write("PRODUCT.md", "and openspec/changes/ for the reasoning trail\n")
        self.assertEqual(len(self.check({"PRODUCT.md", "openspec/changes/x/design.md"})), 1)

    def test_generated_qa_database_path_is_pinned_only_for_agent_instructions(self) -> None:
        path = "mockups/qa-e2e.synthetic/harmonic.sqlite"
        self.assertIn(("AGENTS.md", path), check_public_links.PINNED)
        self.assertIn(("CLAUDE.md", path), check_public_links.PINNED)
        self.write("AGENTS.md", f"Run with `{path}` after its generator.\n")
        self.assertEqual(self.check({"AGENTS.md", path}), [])
        self.write("README.md", f"Open `{path}` directly.\n")
        failures = self.check({"AGENTS.md", "README.md", path})
        self.assertEqual(len(failures), 1, failures)
        self.assertIn("README.md", failures[0])


class TestModuleImports(_Tree):
    """The rule that fails a BUILD, not just a reader.

    Five shipping modules once imported a fixture mirror that no allowlist rule
    cleared, so the frontend job and three browser gates could not pass on any
    commit — while a prose-only check reported the tree clean. Every case below
    is that shape or a way of getting it wrong.
    """

    def test_import_of_a_module_the_tree_excludes_fails(self) -> None:
        self.write("frontend/mirror.test.js",
                   "import { project } from '../mockups/projection.mirror.mjs';\n")
        failures = self.check({"frontend/mirror.test.js"})
        self.assertEqual(len(failures), 1, failures)
        self.assertIn("projection.mirror.mjs", failures[0])
        self.assertIn("fails a build", failures[0])

    def test_import_of_a_shipped_module_passes(self) -> None:
        self.write("frontend/mirror.test.js",
                   "import { project } from '../mockups/projection.mirror.mjs';\n")
        self.write("mockups/projection.mirror.mjs", "export const project = () => {};\n")
        self.assertEqual(self.check({"frontend/mirror.test.js"}), [])

    def test_bare_package_specifiers_are_not_paths(self) -> None:
        """`vue` resolves through Vite and `node:test` through
        the runtime. Neither is a file this tree could have shipped."""
        self.write("frontend/app.js",
                   "import { ref } from 'vue';\n"
                   "import test from 'node:test';\n"
                   "import { chromium } from 'playwright';\n")
        self.assertEqual(self.check({"frontend/app.js"}), [])

    def test_import_escaping_the_tree_fails(self) -> None:
        self.write("frontend/app.js", "import x from '../../elsewhere.js';\n")
        failures = self.check({"frontend/app.js"})
        self.assertEqual(len(failures), 1, failures)
        self.assertIn("escapes the public tree", failures[0])

    def test_side_effect_dynamic_and_re_export_specifiers_all_resolve(self) -> None:
        for source in (
            "import './missing.js';\n",
            "const m = await import('./missing.js');\n",
            "export { thing } from './missing.js';\n",
            "import {\n  a,\n  b,\n} from './missing.js';\n",
        ):
            with self.subTest(source=source):
                self.write("frontend/app.js", source)
                failures = self.check({"frontend/app.js"})
                self.assertEqual(len(failures), 1, failures)
                self.assertIn("missing.js", failures[0])

    def test_html_inline_module_imports_are_resolved(self) -> None:
        """The SPA is one HTML file with its module inline, so its imports are
        the same build dependency an .mjs file's are."""
        self.write("frontend/index.html",
                   "<script type='module'>\n"
                   "import { TABS } from './tab-routing.js';\n"
                   "</script>\n")
        failures = self.check({"frontend/index.html"})
        self.assertEqual(len(failures), 1, failures)
        self.assertIn("tab-routing.js", failures[0])

    def test_an_ordinary_string_is_not_a_specifier(self) -> None:
        """A relative URL passed to fetch is a runtime route, not a module."""
        self.write("frontend/data.js",
                   "const r = await fetch('./api/analyze');\n"
                   "const label = './not-a-module.js';\n")
        self.assertEqual(self.check({"frontend/data.js"}), [])


class TestSourceComments(_Tree):
    """A comment pointing a stranger at a document that does not ship is the
    same dead end a README link is. Code is not read: a path in a string literal
    is a runtime value, not a claim that a document ships."""

    def test_a_comment_pointer_at_an_excluded_document_fails(self) -> None:
        for name, source in (
            ("frontend/a.js", "// the contract is recorded in docs/port-record.md\n"),
            ("frontend/b.js", "/* the contract is in docs/port-record.md */\n"),
            ("ciq_autotune/c.py", "# the contract is in docs/port-record.md\n"),
            ("ciq_autotune/d.py", '"""Recorded in docs/port-record.md."""\n'),
            ("frontend/e.css", "/* recorded in docs/port-record.md */\n"),
            ("frontend/f.html", "<!-- recorded in docs/port-record.md -->\n"),
        ):
            with self.subTest(name=name):
                # A fresh tree per case: the rule reports one failure per
                # (document, path), so leftovers would mask a miss.
                self.setUp()
                self.write(name, source)
                failures = self.check({name, "docs/port-record.md"})
                self.assertEqual(len(failures), 1, failures)
                self.assertIn("port-record.md", failures[0])

    def test_a_path_in_code_is_not_a_claim(self) -> None:
        self.write("ciq_autotune/c.py", 'RECORD = "docs/port-record.md"\n')
        self.assertEqual(self.check({"ciq_autotune/c.py", "docs/port-record.md"}), [])

    def test_a_trailing_full_stop_does_not_hide_a_reference(self) -> None:
        """A path ending a sentence swallows the stop, because "." is legal in a
        filename. Four citations hid behind exactly that."""
        self.write("frontend/a.js", "// The diff-to-mock is docs/port-record.md.\n")
        failures = self.check({"frontend/a.js", "docs/port-record.md"})
        self.assertEqual(len(failures), 1, failures)

    def test_markdown_link_syntax_in_a_comment_is_not_a_link(self) -> None:
        """A docstring explaining markdown is prose about markdown."""
        self.write("scripts/x.py", '"""Matches "[text](target)" and "[ref]: target"."""\n')
        self.assertEqual(self.check({"scripts/x.py"}), [])


class TestSymlinks(_Tree):

    def test_dangling_symlink_fails(self) -> None:
        """CLAUDE.md ships as the symlink it is, so AGENTS.md has to ship too."""
        (self.tree / "CLAUDE.md").symlink_to("AGENTS.md")
        failures = self.check({"CLAUDE.md", "AGENTS.md"})
        self.assertEqual(len(failures), 1, failures)
        self.assertIn("does not ship", failures[0])

    def test_resolved_symlink_passes(self) -> None:
        self.write("AGENTS.md", "# AGENTS\n")
        (self.tree / "CLAUDE.md").symlink_to("AGENTS.md")
        self.assertEqual(self.check({"CLAUDE.md", "AGENTS.md"}), [])


class TestRealPublicTree(unittest.TestCase):
    """End-to-end, against the tree the allowlist actually materialises."""

    def test_the_materialised_public_tree_has_no_dead_references(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            build_public_tree.build(Path(tmp))
            failures = check_public_links.check(
                Path(tmp), check_public_links.tracked_files()
            )
        self.assertEqual(failures, [], "\n".join(failures))


if __name__ == "__main__":
    unittest.main()
