#!/usr/bin/env python3
"""Reject retired vendor-derived names in explicitly owned identifiers.

This is intentionally not a repository-wide word search. ``ciq`` and
``control-iq`` still occur in data-model internals and factual vendor
compatibility prose; neither is an owned public identifier. The rules below name
the product, command, deployment, and metadata fields that Harmonic owns.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
FORBIDDEN = re.compile(r"(?:ciq|control-iq)", re.IGNORECASE)


@dataclass(frozen=True)
class IdentifierRule:
    path: str
    description: str
    pattern: re.Pattern[str]


# The deny list covers only names we present or assign as Harmonic's identity.
# The ``identifier`` group is the value checked against FORBIDDEN.
RULES = (
    IdentifierRule("pyproject.toml", "distribution name",
                   re.compile(r'^name\s*=\s*["\'](?P<identifier>[^"\']+)', re.MULTILINE)),
    IdentifierRule("pyproject.toml", "project description",
                   re.compile(r'^description\s*=\s*["\'](?P<identifier>[^"\']+)', re.MULTILINE)),
    IdentifierRule("pyproject.toml", "console-script name",
                   re.compile(r'^(?P<identifier>[a-z0-9-]+)\s*=\s*"ciq_autotune\.cli:main"', re.MULTILINE)),
    IdentifierRule("ciq_autotune/cli.py", "argparse program name",
                   re.compile(r'ArgumentParser\(prog="(?P<identifier>[^"]+)"')),
    IdentifierRule("ciq_autotune/cli.py", "CLI command examples",
                   re.compile(r'^\s*(?P<identifier>[a-z0-9-]+)\s+(?:fetch|basal|backtest|dia-sweep|report|outcomes)', re.MULTILINE)),
    IdentifierRule("ciq_autotune/cli.py", "serve banner",
                   re.compile(r'Serving\s+(?P<identifier>[A-Za-z0-9-]+)\s+API')),
    IdentifierRule("ciq_autotune/cli.py", "report extra package name",
                   re.compile(r'pip install (?P<identifier>[^\[\s]+)\[report\]')),
    IdentifierRule("ciq_autotune/sync.py", "sync extra package name",
                   re.compile(r'pip install (?P<identifier>[^\[\s]+)\[sync\]')),
    IdentifierRule("ciq_autotune/report.py", "report extra package name",
                   re.compile(r'pip install (?P<identifier>[^\[\s]+)\[report\]')),
    IdentifierRule("ciq_autotune/api.py", "OpenAPI title",
                   re.compile(r'FastAPI\(title="(?P<identifier>[^"]+)"')),
    IdentifierRule("ciq_autotune/api.py", "API extra package name",
                   re.compile(r'pip install (?P<identifier>[^\[\s]+)\[api\]')),
    IdentifierRule("frontend/index.html", "browser title",
                   re.compile(r'<title>(?P<identifier>[^<]+)</title>')),
    IdentifierRule("frontend/favicon.svg", "application icon accessible name",
                   re.compile(r'aria-label="(?P<identifier>[^"]+)"')),
    IdentifierRule("frontend/index.html", "header wordmark",
                   re.compile(r'^\s*(?P<identifier>[A-Za-z0-9-]+)\s+<small>advisory</small>', re.MULTILINE)),
    IdentifierRule("README.md", "README heading",
                   re.compile(r'^#\s+(?P<identifier>.+)$', re.MULTILINE)),
    IdentifierRule("CONTEXT.md", "glossary heading",
                   re.compile(r'^#\s+(?P<identifier>[^#\n]+)$', re.MULTILINE)),
    IdentifierRule("DESIGN.md", "design-system front-matter name",
                   re.compile(r'^name:\s*(?P<identifier>.+)$', re.MULTILINE)),
    IdentifierRule("DESIGN.md", "design-system title",
                   re.compile(r'^#\s+Design System:\s*(?P<identifier>.+)$', re.MULTILINE)),
    IdentifierRule("README.md", "documented command",
                   re.compile(r'uv run (?P<identifier>[a-z0-9-]+)\s')),
    IdentifierRule("README.md", "repository URL",
                   re.compile(r'https://github\.com/(?P<identifier>[^/\s)]+/[^/\s)]+)')),
    IdentifierRule("README.md", "container image",
                   re.compile(r'(?P<identifier>ghcr\.io/[^\s`]+)')),
    IdentifierRule("docker-compose.yml", "Docker service name",
                   re.compile(r'^  (?P<identifier>[a-z0-9-]+):\s*$', re.MULTILINE)),
    IdentifierRule("docker-compose.yml", "Docker container name",
                   re.compile(r'container_name:\s*(?P<identifier>[^\s]+)')),
    IdentifierRule("docker-compose.yml", "Docker image",
                   re.compile(r'image:\s*(?P<identifier>[^\s]+)')),
    IdentifierRule("docker-compose.yml", "Docker volume name",
                   re.compile(r'^  (?P<identifier>[a-z0-9-]+-data):\s*$', re.MULTILINE)),
    IdentifierRule("Dockerfile", "Docker command example",
                   re.compile(r'^#\s+(?P<identifier>[a-z0-9-]+) serve', re.MULTILINE)),
    IdentifierRule("docker-entrypoint.sh", "container command",
                   re.compile(r'entrypoint for `(?P<identifier>[a-z0-9-]+) serve`')),
    IdentifierRule(".env.example", "example command",
                   re.compile(r'for `(?P<identifier>[a-z0-9-]+) fetch`')),
    IdentifierRule(".claude/launch.json", "local demo name",
                   re.compile(r'"name":\s*"(?P<identifier>[^"]+)"')),
    IdentifierRule(".claude/qa/demo_serve.py", "demo server product name",
                   re.compile(r'Serves the full (?P<identifier>[A-Za-z0-9-]+) HTTP API')),
)

# These are deliberately outside RULES, with their reasons visible here:
# - ciq_autotune is the unchanged internal Python package path.
# - tconnect-data is the unchanged local data directory.
# - tconnectsync and TCONNECT_* are upstream dependency/configuration names.
# - CIQ_* occurs only as a deprecated fallback in config.py and deployment notes.
# - Tandem / Control-IQ prose and vendor API literals are factual compatibility,
#   not owned identifiers.
# - docs/adr and docs/scope are historical, read-only decision/ledger records.
# - A local design-lock tooling file once had a rule here. It is not part of the
#   published tree, and this guard fails on a missing file, so the rule would
#   fail closed for anyone who cloned. DESIGN.md's own "design-system title"
#   rule above covers the same identifier in a file that actually ships.
EXEMPTIONS = (
    "ciq_autotune package path", "tconnect-data directory", "tconnectsync dependency",
    "TCONNECT_* upstream variables", "CIQ_* deprecated fallback", "vendor compatibility prose",
    "vendor API field names", "docs/adr historical records", "docs/scope historical ledgers",
    "design-lock tooling state",
)


def read_text(path: Path) -> Optional[str]:
    """Return UTF-8 text, skipping binary files without ever rewriting them."""
    data = path.read_bytes()
    if b"\0" in data:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def main() -> int:
    failures: list[str] = []
    for rule in RULES:
        path = ROOT / rule.path
        if not path.is_file():
            failures.append(f"{rule.path}: missing file for {rule.description}")
            continue
        text = read_text(path)
        if text is None:
            continue
        matches = list(rule.pattern.finditer(text))
        if not matches:
            failures.append(f"{rule.path}: {rule.description} rule matched no identifier")
            continue
        for match in matches:
            identifier = match.group("identifier")
            if FORBIDDEN.search(identifier):
                line = text.count("\n", 0, match.start("identifier")) + 1
                failures.append(
                    f"{rule.path}:{line}: {rule.description} retains {identifier!r}"
                )

    if failures:
        print("check-owned-identifiers: retired vendor-derived identifier found:", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1

    print(f"check-owned-identifiers: {len(RULES)} owned-identifier rules passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
