#!/usr/bin/env python3
"""Fail CI when a committed demo fixture set no longer matches its generator (#716).

Two synthetic fixture sets are committed under `mockups/` so the browser gates can
render a deterministic demo without touching real PHI: the Verify workstation's
`verify-660-story.synthetic/` and the Diagnose workstation's
`diagnose-workstation.synthetic/`. Both are produced by running a real generator
script, not hand-written — the same "fixture encodes the assumption under test"
trap `CLAUDE.md` records for the thin-slot hold applies here: if a generator's
output drifts from what's committed, the browser suites replay a fixture the
generator no longer produces, silently.

This regenerates each set into a temporary directory and byte-compares it against
the committed copy. Byte-exact: no parsing/normalization, so even an
indentation-only or key-order change fails.

    python3 scripts/check_demo_fixtures.py

Both generators run as SUBPROCESSES, never via import —
`.claude/qa/gen_synthetic_fixtures.py` has no `if __name__ == "__main__"` guard
and writes files at import time, defaulting to the real committed mockups dir.
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
import tempfile

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]


def _verify_cmd(outdir: pathlib.Path) -> list[str]:
    return [
        sys.executable,
        str(REPO_ROOT / ".claude" / "qa" / "gen_verify_payload.py"),
        "--synthetic",
        "--out",
        str(outdir),
    ]


def _diagnose_cmd(outdir: pathlib.Path) -> list[str]:
    return [
        sys.executable,
        str(REPO_ROOT / ".claude" / "qa" / "gen_synthetic_fixtures.py"),
        str(outdir),
    ]


ENTRIES = [
    {
        "name": "verify-660-story",
        "cmd_fn": _verify_cmd,
        "committed_dir": "mockups/verify-660-story.synthetic",
        "regen_cmd": (
            "python3 .claude/qa/gen_verify_payload.py --synthetic "
            "--out mockups/verify-660-story.synthetic"
        ),
    },
    {
        "name": "diagnose-workstation",
        "cmd_fn": _diagnose_cmd,
        "committed_dir": "mockups/diagnose-workstation.synthetic",
        "regen_cmd": (
            "python3 .claude/qa/gen_synthetic_fixtures.py "
            "mockups/diagnose-workstation.synthetic"
        ),
        # These exact files have their own generator + CI drift check. Excluding
        # them keeps the legacy demo generator from becoming a second writer while
        # preserving closed-set checking for every other file.
        "externally_generated": ["ic-history-events.capture.json",
                                 "ic-block-evidence.capture.json",
                                 "isf-rest-window-evidence.capture.json"],
    },
]


def _first_diff_offset(a: bytes, b: bytes) -> int:
    n = min(len(a), len(b))
    for i in range(n):
        if a[i] != b[i]:
            return i
    return n


def _excerpt(data: bytes, offset: int, width: int = 40) -> bytes:
    start = max(0, offset - width)
    end = min(len(data), offset + width)
    return data[start:end]


def _describe_mismatch(entry: dict, rel: pathlib.Path, committed: bytes, regenerated: bytes) -> str:
    lines = [f"{entry['name']}: {entry['committed_dir']}/{rel} differs from the regenerated output"]
    try:
        parsed_committed = json.loads(committed)
        parsed_regenerated = json.loads(regenerated)
    except ValueError:
        parsed_committed = parsed_regenerated = None
    if parsed_committed is not None and parsed_committed == parsed_regenerated:
        lines.append("  parsed JSON content is EQUAL on both sides — only formatting/key-order moved")
    offset = _first_diff_offset(committed, regenerated)
    lines.append(f"  first differing byte offset: {offset}")
    lines.append(f"  committed   : {_excerpt(committed, offset)!r}")
    lines.append(f"  regenerated : {_excerpt(regenerated, offset)!r}")
    return "\n".join(lines)


def check_set(entry: dict, repo_root: pathlib.Path = REPO_ROOT) -> tuple[bool, str]:
    """Regenerate one fixture set into a temp dir and byte-compare it to committed.

    Returns (ok, message). Never raises on a generator failure or mismatch — those
    are reported in the message so main() can surface every entry's result.
    """
    committed_dir = repo_root / entry["committed_dir"]
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = pathlib.Path(tmp)
        cmd = entry["cmd_fn"](tmp_path)
        env = dict(os.environ)
        existing = env.get("PYTHONPATH")
        env["PYTHONPATH"] = str(repo_root) if not existing else os.pathsep.join([str(repo_root), existing])
        result = subprocess.run(
            cmd, cwd=str(repo_root), env=env, capture_output=True, text=True
        )
        if result.returncode != 0:
            return False, (
                f"{entry['name']}: generator exited {result.returncode}\n"
                f"  cmd: {' '.join(cmd)}\n"
                f"  stdout:\n{result.stdout}\n"
                f"  stderr:\n{result.stderr}\n"
                f"  regenerate with: {entry['regen_cmd']}"
            )

        generated_files = sorted(
            p.relative_to(tmp_path) for p in tmp_path.rglob("*") if p.is_file()
        )
        if not generated_files:
            return False, (
                f"{entry['name']}: generator produced NO files — cannot be read as "
                f"'no differences'\n  regenerate with: {entry['regen_cmd']}"
            )

        externally_generated = {
            pathlib.Path(path) for path in entry.get("externally_generated", [])
        }
        committed_files = sorted(
            p.relative_to(committed_dir) for p in committed_dir.rglob("*") if p.is_file()
            and p.relative_to(committed_dir) not in externally_generated
        ) if committed_dir.is_dir() else []

        missing = sorted(str(p) for p in set(committed_files) - set(generated_files))
        extra = sorted(str(p) for p in set(generated_files) - set(committed_files))
        if missing or extra:
            lines = [f"{entry['name']}: fixture file set mismatch in {entry['committed_dir']}"]
            if missing:
                lines.append(f"  missing from regenerated output: {missing}")
            if extra:
                lines.append(f"  extra in regenerated output (not committed): {extra}")
            lines.append(f"  regenerate with: {entry['regen_cmd']}")
            return False, "\n".join(lines)

        problems = []
        for rel in committed_files:
            committed_bytes = (committed_dir / rel).read_bytes()
            regenerated_bytes = (tmp_path / rel).read_bytes()
            if committed_bytes != regenerated_bytes:
                problems.append(_describe_mismatch(entry, rel, committed_bytes, regenerated_bytes))
        if problems:
            return False, "\n\n".join(problems) + f"\n\n  regenerate with: {entry['regen_cmd']}"

        return True, f"{entry['name']}: current ({entry['committed_dir']})"


def main(entries: list = ENTRIES, repo_root: pathlib.Path = REPO_ROOT) -> int:
    ok = True
    for entry in entries:
        passed, message = check_set(entry, repo_root=repo_root)
        print(message)
        ok = ok and passed
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
