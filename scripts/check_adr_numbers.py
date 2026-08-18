#!/usr/bin/env python3
"""Guard against ADR identity drift (stdlib only; no deps).

**A decision record's home is an OpenSpec change's design.md**, because that is
where this repository already records design:

    openspec/changes/<change>/design.md

    ## ADR <issue> — <title>

``<issue>`` is the GitHub issue, ticket or pull request the decision came from,
not a sequential counter: GitHub hands out those numbers uniquely before any
line is written, so two branches cannot both pick "the next free number" off a
stale base. Two records originating from one issue take distinct titles.

There is no ``docs/adr/`` tree here. One was created for ADR 25 and moved into
this scheme the same week (ADR 25 itself records why); this guard fails on its
reappearance so the history cannot fork again — a repository with two decision
homes has neither.

Checks:
  1. Every ``## ADR`` heading is issue-keyed and titled.
  2. No two records share an (issue, title) pair.
  3. No ``docs/adr/`` records exist.

Exit non-zero (and print the offenders) on any violation.
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CHANGES_DIR = REPO_ROOT / "openspec" / "changes"
RETIRED_DIR = REPO_ROOT / "docs" / "adr"

# "## ADR <issue> — <title>", em dash, en dash or hyphen between the two.
HEADING_RE = re.compile(r"^##\s*ADR\s+(\d+)\s*[—–-]\s*(\S.*?)\s*$", re.IGNORECASE)
# Anything else claiming to be an ADR heading — caught rather than skipped, so a
# record cannot go unidentified by mistyping its own heading.
LOOSE_RE = re.compile(r"^##\s*ADR\b", re.IGNORECASE)


def main() -> int:
    if not CHANGES_DIR.is_dir():
        # A repository with no decisions recorded yet is legal — the public tree
        # ships this guard, not the historical records.
        print("check-adr: no OpenSpec changes dir — nothing to check, pass.")
        return 0

    # (issue, title casefolded) → ["<change>/design.md:<line>", ...]
    by_identity: dict[tuple[str, str], list[str]] = defaultdict(list)
    malformed: list[str] = []

    for path in sorted(CHANGES_DIR.glob("**/design.md")):
        rel = path.relative_to(REPO_ROOT)
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            match = HEADING_RE.match(line.strip())
            if match:
                issue, title = match.group(1), match.group(2)
                by_identity[(issue, title.casefold())].append(f"{rel}:{number}")
            elif LOOSE_RE.match(line.strip()):
                malformed.append(f"{rel}:{number}: {line.strip()}")

    duplicates = {k: v for k, v in by_identity.items() if len(v) > 1}
    retired = sorted(p.name for p in RETIRED_DIR.glob("*.md")) if RETIRED_DIR.is_dir() else []

    ok = True
    if duplicates:
        ok = False
        print("check-adr: DUPLICATE (issue, title) records:", file=sys.stderr)
        for (issue, title), places in sorted(duplicates.items()):
            print(f"  issue={issue}, title={title!r}: {', '.join(places)}", file=sys.stderr)
    if malformed:
        ok = False
        print("check-adr: headings not matching '## ADR <issue> — <title>':", file=sys.stderr)
        for line in malformed:
            print(f"  {line}", file=sys.stderr)
    if retired:
        ok = False
        print(
            "check-adr: records under docs/adr/ — this repository records decisions"
            " in an OpenSpec change's design.md (ADR 25):",
            file=sys.stderr,
        )
        for name in retired:
            print(f"  docs/adr/{name}", file=sys.stderr)

    if ok:
        total = sum(len(v) for v in by_identity.values())
        files = {place.split(":")[0] for v in by_identity.values() for place in v}
        print(
            f"check-adr: {total} ADR{'' if total == 1 else 's'} in"
            f" {len(files)} design.md file{'' if len(files) == 1 else 's'},"
            " all identities unique and issue-keyed."
        )
        return 0

    print(
        "\nA new decision record is a '## ADR <issue> — <title>' section in the"
        " design.md of the OpenSpec change it belongs to; create the change"
        " directory if the work has none yet.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
