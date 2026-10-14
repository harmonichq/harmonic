#!/usr/bin/env python3
"""Smoke-test the served app (#495): the server serves the built app and an API answer.

    uv run python scripts/smoke_app.py                 # boot the synthetic no-fetch serve
    python3 scripts/smoke_app.py --url URL [--token T] # probe a server already running

With no ``--url`` it boots exactly the one permitted offline serve (AGENTS.md,
"The data boundary"): a scratch copy of the committed synthetic QA store,
``--no-fetch`` and an empty token, on a free loopback port. Nothing is
fetched and no real data is read. Either way it then asks for:

* ``/`` — the built app's page, which must name its fingerprinted script;
* that script, which must be served as JavaScript;
* ``/day`` — a tab's page path, which must be the same page;
* ``/api/status`` — one engine answer, as JSON.

It exits nonzero naming the first thing missing: a build that was never made,
a server that never answered, or an answer of the wrong shape. Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
STORE = ROOT / "mockups" / "qa-e2e.synthetic" / "harmonic.sqlite"
SCRIPT = re.compile(r'<script type="module"[^>]*src="(/assets/[^"]+\.js)"')


def get(url: str, token: str | None) -> tuple[int, str, bytes]:
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"} if token else {})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.headers.get("content-type", ""), response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get("content-type", ""), error.read()


def require(ok: bool, message: str) -> None:
    if not ok:
        raise SystemExit(f"smoke-app: {message}")


def wait_ready(base: str, server: subprocess.Popen | None) -> None:
    for _ in range(240):
        if server is not None and server.poll() is not None:
            raise SystemExit(f"smoke-app: the server exited {server.returncode} before it answered")
        try:
            if get(f"{base}/api/health", None)[0] == 200:
                return
        except OSError:
            pass
        time.sleep(0.5)
    raise SystemExit(f"smoke-app: no answer from {base}/api/health")


def probe(base: str, token: str | None) -> list[str]:
    status, kind, page = get(f"{base}/", token)
    require(status == 200 and kind.startswith("text/html"), f"/ answered {status} {kind}: {page[:200]!r}")
    html = page.decode()
    require('<div id="app">' in html, "/ is not the app's page (no #app root)")
    script = SCRIPT.search(html)
    require(script is not None, "/ names no fingerprinted /assets/ script")
    status, kind, _ = get(f"{base}{script.group(1)}", token)
    require(status == 200 and "javascript" in kind, f"{script.group(1)} answered {status} {kind}")
    status, _, tab = get(f"{base}/day", token)
    require(status == 200 and tab == page, f"/day answered {status}, not the app's page")
    status, kind, body = get(f"{base}/api/status", token)
    require(status == 200 and kind.startswith("application/json"), f"/api/status answered {status} {kind}")
    answer = json.loads(body)
    require("last_success_at" in answer and "latest_data_day" in answer, f"/api/status is not a status: {answer}")
    return ["/", script.group(1), "/day", "/api/status"]


def free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", help="probe this running server instead of booting the synthetic serve")
    parser.add_argument("--token", help="the API token that server was started with")
    args = parser.parse_args()
    if args.url:
        wait_ready(args.url.rstrip("/"), None)
        served = probe(args.url.rstrip("/"), args.token)
    else:
        require((ROOT / "frontend" / "dist" / "index.html").is_file(), "no built app; run npm ci && npm run build")
        with tempfile.TemporaryDirectory() as scratch:
            store = pathlib.Path(scratch) / "harmonic-qa-e2e.sqlite"
            shutil.copyfile(STORE, store)
            port = free_port()
            server = subprocess.Popen(
                [sys.executable, "-c", "import sys; from ciq_autotune.cli import main; sys.exit(main())",
                 "serve", "--no-fetch", "--token", "", "--db", str(store), "--port", str(port)],
                cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            try:
                base = f"http://127.0.0.1:{port}"
                wait_ready(base, server)
                served = probe(base, None)
            finally:
                server.terminate()
                try:
                    server.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    server.kill()
    print(f"smoke-app: the app and an API answer were served ({', '.join(served)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
