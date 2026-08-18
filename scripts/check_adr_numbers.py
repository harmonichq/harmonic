#!/usr/bin/env python3
"""Guard against ADR identity drift (stdlib only; no deps).

ADRs are identified by the GitHub issue that originated them, not a sequential
counter. Each ADR lives in a file named:

    docs/adr/adr-<issue>-<slug>.md

with a heading:

    # ADR <issue> — <title>

The (issue, slug) pair is unique — a collision becomes structurally impossible
because GitHub hands out issue numbers uniquely before any line is written.

Legacy files from the old sequential scheme (``NNNN-slug.md``, where the
originating issue was unrecoverable) are also accepted as-is and checked for
uniqueness on their 4-digit prefix.  They are read-only: new ADRs must use the
issue-keyed form.

Checks:
  1. No two new-style files share the same (issue, slug) pair.
  2. No two legacy files share the same NNNN prefix.
  3. Every file's heading issue/number agrees with its filename.

Exit non-zero (and print the offenders) on any violation.
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

ADR_DIR = Path(__file__).resolve().parent.parent / "docs" / "adr"

# New scheme: adr-<issue>-<slug>.md  (issue is one or more digits)
NEW_FILENAME_RE = re.compile(r"^adr-(\d+)-(.+)\.md$")
# Legacy scheme: NNNN-slug.md  (exactly 4 leading digits)
LEGACY_FILENAME_RE = re.compile(r"^(\d{4})-.+\.md$")

# New heading: # ADR <issue> [— ...]
NEW_HEADING_RE = re.compile(r"^#\s*ADR\s+(\d+)\b", re.IGNORECASE)
# Legacy heading: # ADR NNNN [— ...]  (4-digit number)
LEGACY_HEADING_RE = re.compile(r"^#\s*ADR\s+(\d{4})\b", re.IGNORECASE)


def main() -> int:
    if not ADR_DIR.is_dir():
        # A repository with no decisions recorded yet is legal — the public
        # tree ships this script but nothing under docs/adr/ (Harmonic cutover
        # Phase 1.7). Only a malformed or colliding *set* of records is a
        # failure; an absent directory has no records to malform or collide.
        print("check-adr: no ADR dir — nothing to check, pass.")
        return 0

    # (issue_str, slug) → [filename, ...]
    by_pair: dict[tuple[str, str], list[str]] = defaultdict(list)
    # nnnn → [filename, ...]  for legacy files
    by_legacy: dict[str, list[str]] = defaultdict(list)
    heading_mismatches: list[str] = []
    malformed: list[str] = []

    for path in sorted(ADR_DIR.glob("*.md")):
        nm = NEW_FILENAME_RE.match(path.name)
        lm = LEGACY_FILENAME_RE.match(path.name) if not nm else None

        if nm:
            issue, slug = nm.group(1), nm.group(2)
            by_pair[(issue, slug)].append(path.name)

            heading_issue = None
            for line in path.read_text(encoding="utf-8").splitlines():
                hm = NEW_HEADING_RE.match(line.strip())
                if hm:
                    heading_issue = hm.group(1)
                    break
            if heading_issue is not None and heading_issue != issue:
                heading_mismatches.append(
                    f"{path.name}: filename issue {issue!r},"
                    f" heading issue {heading_issue!r}"
                )
        elif lm:
            number = lm.group(1)
            by_legacy[number].append(path.name)

            heading_num = None
            for line in path.read_text(encoding="utf-8").splitlines():
                hm = LEGACY_HEADING_RE.match(line.strip())
                if hm:
                    heading_num = hm.group(1)
                    break
            if heading_num is not None and heading_num != number:
                heading_mismatches.append(
                    f"{path.name}: filename says {number}, heading says {heading_num}"
                )
        else:
            malformed.append(path.name)
            continue

    dup_pairs = {k: v for k, v in by_pair.items() if len(v) > 1}
    dup_legacy = {n: v for n, v in by_legacy.items() if len(v) > 1}

    ok = True
    if dup_pairs:
        ok = False
        print("check-adr: DUPLICATE (issue, slug) pairs:", file=sys.stderr)
        for (issue, slug), files in sorted(dup_pairs.items()):
            print(
                f"  issue={issue}, slug={slug!r}: {', '.join(files)}",
                file=sys.stderr,
            )
    if dup_legacy:
        ok = False
        print("check-adr: DUPLICATE legacy ADR numbers:", file=sys.stderr)
        for n, files in sorted(dup_legacy.items()):
            print(f"  {n}: {', '.join(files)}", file=sys.stderr)
    if heading_mismatches:
        ok = False
        print("check-adr: heading/filename number mismatch:", file=sys.stderr)
        for line in heading_mismatches:
            print(f"  {line}", file=sys.stderr)
    if malformed:
        ok = False
        print(
            "check-adr: filenames not matching adr-<issue>-<slug>.md"
            " or NNNN-slug.md:",
            file=sys.stderr,
        )
        for name in malformed:
            print(f"  {name}", file=sys.stderr)

    new_count = len(by_pair)
    legacy_count = len(by_legacy)
    if ok:
        parts = []
        if new_count:
            parts.append(f"{new_count} issue-keyed")
        if legacy_count:
            parts.append(f"{legacy_count} legacy")
        total = sum(len(v) for v in by_pair.values()) + sum(
            len(v) for v in by_legacy.values()
        )
        print(
            f"check-adr: {total} ADRs ({', '.join(parts)}),"
            " all identities unique and consistent."
        )
        return 0

    print(
        "\nNew ADRs: name files adr-<issue>-<slug>.md with heading"
        " '# ADR <issue> — title'.\n"
        "Legacy NNNN-slug.md files are accepted read-only — do not add new ones.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
