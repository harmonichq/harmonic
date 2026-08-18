#!/usr/bin/env python3
"""CI gate for the Harmonic public-repository allowlist (#728, cutover plan
Phase 1.2).

Fails when the allowlist file itself violates the parse-time grammar (a bare
``**`` rule, an exact-path deny that contains a glob, or a path ruled by both
an exact-path positive and an exact-path deny — plan §1.3 [R9]/[R10]).
``allowlist_rules.Allowlist.disposition`` is total over every tracked path —
exact-deny > exact-positive > binary-deny > glob-positive > default-exclude
always resolves to included or excluded — so once the allowlist parses clean,
every tracked file is dispositioned by construction; there is no third
"neither" state left to detect at match time.

    python3 scripts/check_public_allowlist.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import allowlist_rules  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent


def tracked_files(repo_root: Path = REPO_ROOT) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"], cwd=str(repo_root), capture_output=True, text=True, check=True,
    )
    return [line for line in result.stdout.splitlines() if line]


def main(repo_root: Path = REPO_ROOT) -> int:
    try:
        allowlist = allowlist_rules.load()
    except allowlist_rules.AllowlistError as exc:
        print(f"check-public-allowlist: {exc}", file=sys.stderr)
        return 1

    included = 0
    excluded = 0
    for path in tracked_files(repo_root):
        ok, _reason = allowlist.disposition(path)
        if ok:
            included += 1
        else:
            excluded += 1

    print(
        f"check-public-allowlist: {included} tracked file(s) cleared to ship,"
        f" {excluded} excluded. Every tracked path dispositioned."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
