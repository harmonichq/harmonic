"""Guard: runtime file-path assets the API serves must ship in the Docker image.

Production runs the GHCR image CI publishes on merge (docker compose pull), NOT a
source checkout — so any file api.py reads at runtime relative to the package must
be explicitly COPY'd into the image. The #269 Guide-KB serves the authored how-tos
as raw markdown from ../docs/kb/<slug>.md via /api/kb/<slug>; without a
`COPY docs/kb` line those files are absent in the image and every authored article
404s ("unknown article"). This test fails loudly if that COPY is dropped.
"""

import re
import unittest
from pathlib import Path

_REPO = Path(__file__).resolve().parent.parent
_AUTHORED_SLUGS = ("start-here", "reading-diagnose", "reading-day", "the-plan-tab")
_RUNTIME_START = "FROM python:3.12-slim-bookworm AS runtime"
_NODE_RUN = r"(?im)^\s*RUN\b[^\n]*(?:\bnodejs?\b|\bnpm\b|\bnpx\b)"
_NODE_FROM = r"(?im)^\s*FROM\s+node(?:[:\s]|$)"
_NODE_BINARY_COPY = r"(?im)^\s*COPY\b[^\n]*--from=\S+\s+\S*/(?:nodejs?|npm|npx)\b"


def _runtime_without_comments(dockerfile):
    """The runtime Dockerfile stage, with comments removed before instruction checks."""
    runtime = dockerfile.split(_RUNTIME_START, 1)[1]
    return "\n".join(line.split("#", 1)[0] for line in (_RUNTIME_START + runtime).splitlines())


class DeployAssetsTest(unittest.TestCase):
    def test_dockerfile_ships_the_kb_markdown(self):
        text = (_REPO / "Dockerfile").read_text()
        self.assertRegex(
            text, r"COPY\s+docs/kb\b",
            "Dockerfile must COPY docs/kb into the image — the #269 /api/kb how-tos "
            "are read from ../docs/kb at runtime; without it every authored Guide "
            "article 404s ('unknown article') in the deployed app.",
        )
        self.assertIn("FROM node:22", text)

    def test_dockerfile_ships_the_one_built_shell_and_its_build_inputs(self):
        # ADR 416: the desk is the only shell. api.py resolves it as
        # ../frontend/dist, so that build must be COPY'd in — and the builder
        # needs the one source root and the one build config to produce it.
        text = (_REPO / "Dockerfile").read_text()
        self.assertRegex(
            text, r"COPY\s+--from=frontend-builder\s+/app/frontend/dist\s+./frontend/dist",
            "Dockerfile must COPY the built desk into the image; without it every "
            "page answers 503 in the deployed app.",
        )
        # One shell means one build copied out of the frontend builder. The
        # count is the assertion, because a second shell would now be a second
        # path under the same root rather than a differently named one.
        self.assertEqual(
            len(re.findall(r"COPY\s+--from=frontend-builder\b", text)), 1,
            "exactly one built shell ships (ADR 416)")
        self.assertRegex(text, r"COPY\s+vite\.config\.mjs\s+tsconfig\.json\b")
        self.assertRegex(text, r"(?m)^COPY\s+frontend\s+\./frontend$")


    def test_runtime_copies_only_the_built_frontend_without_node(self):
        runtime = _runtime_without_comments((_REPO / "Dockerfile").read_text())
        with self.assertRaises(AssertionError):
            self.assertNotRegex("COPY frontend ./frontend", r"(?m)^COPY\s+frontend\b")
        self.assertNotRegex(runtime, r"(?m)^COPY\s+frontend\b")
        with self.assertRaises(AssertionError):
            self.assertNotRegex("RUN apt-get install -y nodejs", _NODE_RUN)
        with self.assertRaises(AssertionError):
            self.assertNotRegex("RUN npm install", _NODE_RUN)
        self.assertRegex("RUN apt-get install -y nodejs", _NODE_RUN)
        self.assertRegex("RUN npm install", _NODE_RUN)
        self.assertNotRegex(_runtime_without_comments(
            _RUNTIME_START + "\n# No Node in this stage"), _NODE_RUN)
        self.assertNotRegex(runtime, _NODE_FROM)
        self.assertNotRegex(runtime, _NODE_RUN)
        self.assertNotRegex(runtime, _NODE_BINARY_COPY)

    def test_dockerignore_does_not_exclude_docs(self):
        di = _REPO / ".dockerignore"
        if di.is_file():
            for line in di.read_text().splitlines():
                s = line.strip()
                if s and not s.startswith("#"):
                    self.assertFalse(re.match(r"/?docs(/|$)", s),
                                     f".dockerignore must not exclude docs: {line!r}")

    def test_every_authored_how_to_has_its_markdown_file(self):
        for slug in _AUTHORED_SLUGS:
            self.assertTrue((_REPO / "docs" / "kb" / f"{slug}.md").is_file(),
                            f"docs/kb/{slug}.md is missing")


if __name__ == "__main__":
    unittest.main()
