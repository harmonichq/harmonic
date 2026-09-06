#!/usr/bin/env python3
"""Provision (once) and reuse the local browser-gate toolchain.

The AGENTS.md mktemp recipe rebuilds Playwright and Chromium for every checkout.
On a machine that runs the gates repeatedly, this provisioner puts them under
one cache root instead:

    ~/.cache/harmonic-browser-gate/pw      an isolated playwright@1.61.1

Chromium itself goes to Playwright's own per-user browser cache, which the
pinned playwright version manages and reuses across checkouts.

Idempotent: every piece is checked before it is fetched, so reruns cost one
stat each. Only the exports print to stdout; provisioning chatter goes to
stderr. Use with:

    eval "$(python3 scripts/ensure_browser_gate_env.py)"
    PAYLOAD=... node --test frontend/diagnose-workstation.browser.test.mjs

Deliberately not ``--with-deps``: that step can stall on a privilege prompt
for system packages, CI keeps its own recipe, and a local dev box already has
what it needs.
"""

import os
import subprocess
import sys
from pathlib import Path

PLAYWRIGHT_VERSION = "1.61.1"

def main() -> int:
    root = Path(os.environ.get("HARMONIC_BROWSER_GATE_CACHE",
                               Path.home() / ".cache" / "harmonic-browser-gate"))
    pw = root / "pw"
    pw.mkdir(parents=True, exist_ok=True)

    if not (pw / "node_modules" / "playwright").is_dir():
        print(f"installing playwright@{PLAYWRIGHT_VERSION}", file=sys.stderr)
        subprocess.run(["npm", "install", "--prefix", str(pw),
                        f"playwright@{PLAYWRIGHT_VERSION}", "--silent"],
                       check=True, stdout=sys.stderr)
    subprocess.run(["npx", "--prefix", str(pw), "playwright", "install", "chromium"],
                   check=True, stdout=sys.stderr)

    print(f'export PLAYWRIGHT_MODULE="{pw / "node_modules" / "playwright"}"')
    return 0


if __name__ == "__main__":
    sys.exit(main())
