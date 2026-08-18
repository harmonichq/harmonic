#!/usr/bin/env python3
"""Materialise the Harmonic public tree from the committed allowlist (#728,
cutover plan Phase 1.1).

Copies only positively-cleared tracked files (``git ls-files`` is the
universe — an untracked or gitignored file is never a candidate) into a
scratch output directory, preserving ``CLAUDE.md`` as the symlink it is
rather than copying its target's bytes (plan §1.6.4). Refuses to run if
``scripts/public_allowlist.txt`` fails the parser's parse-time validation.

    uv run python scripts/build_public_tree.py <output-dir>
"""
from __future__ import annotations

import shutil
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


def build(
    output_dir: Path, repo_root: Path = REPO_ROOT
) -> tuple[int, int, list[tuple[str, str]]]:
    """Materialise the public tree at ``output_dir``.

    Returns ``(copied, excluded, manifest)`` where ``manifest`` is
    ``[(path, reason), ...]`` for every copied file, one entry per file,
    naming the rule that cleared it. Raises ``allowlist_rules.AllowlistError``
    unchanged if the allowlist fails parse-time validation — the caller
    decides how to report that.
    """
    allowlist = allowlist_rules.load()

    output_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    excluded = 0
    manifest: list[tuple[str, str]] = []

    for rel in tracked_files(repo_root):
        ok, reason = allowlist.disposition(rel)
        if not ok:
            excluded += 1
            continue

        src = repo_root / rel
        dst = output_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_symlink():
            if dst.exists() or dst.is_symlink():
                dst.unlink()
            dst.symlink_to(src.readlink())
        else:
            shutil.copy2(src, dst)
        copied += 1
        manifest.append((rel, reason))

    return copied, excluded, manifest


def main(argv: list[str] = sys.argv[1:]) -> int:
    if len(argv) != 1:
        print("usage: build_public_tree.py <output-dir>", file=sys.stderr)
        return 2

    try:
        copied, excluded, manifest = build(Path(argv[0]).resolve())
    except allowlist_rules.AllowlistError as exc:
        print(f"build-public-tree: allowlist fails parse-time validation: {exc}", file=sys.stderr)
        return 1

    for rel, reason in manifest:
        print(f"COPY\t{rel}\t{reason}")
    print(
        f"\nbuild-public-tree: {copied} file(s) copied, {excluded} file(s)"
        f" excluded, into {Path(argv[0]).resolve()}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
