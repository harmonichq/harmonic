#!/usr/bin/env python3
"""Provision (once) and reuse the local browser-gate toolchain.

The AGENTS.md mktemp recipe rebuilds Playwright, Chromium, and the two vendored
CDN modules for every checkout. On a machine that runs the gates repeatedly,
this provisioner puts them all under one cache root instead:

    ~/.cache/harmonic-browser-gate/pw      an isolated playwright@1.61.1
    ~/.cache/harmonic-browser-gate/vendor  the CDN modules the suites route through

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
import urllib.request
from pathlib import Path

PLAYWRIGHT_VERSION = "1.61.1"
VENDOR_MODULES = (
    ("vue.esm-browser.js", "https://unpkg.com/vue@3/dist/vue.esm-browser.js"),
    ("echarts.min.js", "https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"),
)


def main() -> int:
    root = Path(os.environ.get("HARMONIC_BROWSER_GATE_CACHE",
                               Path.home() / ".cache" / "harmonic-browser-gate"))
    pw, vendor = root / "pw", root / "vendor"
    pw.mkdir(parents=True, exist_ok=True)
    vendor.mkdir(parents=True, exist_ok=True)

    for name, url in VENDOR_MODULES:
        target = vendor / name
        if not target.exists():
            print(f"fetching {name}", file=sys.stderr)
            with urllib.request.urlopen(url) as response:
                target.write_bytes(response.read())

    if not (pw / "node_modules" / "playwright").is_dir():
        print(f"installing playwright@{PLAYWRIGHT_VERSION}", file=sys.stderr)
        subprocess.run(["npm", "install", "--prefix", str(pw),
                        f"playwright@{PLAYWRIGHT_VERSION}", "--silent"],
                       check=True, stdout=sys.stderr)
    subprocess.run(["npx", "--prefix", str(pw), "playwright", "install", "chromium"],
                   check=True, stdout=sys.stderr)

    print(f'export PLAYWRIGHT_MODULE="{pw / "node_modules" / "playwright"}"')
    print(f'export VENDOR_DIR="{vendor}"')
    return 0


if __name__ == "__main__":
    sys.exit(main())
