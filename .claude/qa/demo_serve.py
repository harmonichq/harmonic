"""Local demo server for a persona-driven QA pass.

Serves the full Harmonic HTTP API + SPA against whatever DB HARMONIC_DB points at,
with the hourly fetch loop DISABLED (enable_fetch_loop=False) — so there is no
live OAuth login and no write back to your real database. Point HARMONIC_DB at a
*writable copy* of your own database; token comes from HARMONIC_API_TOKEN (use 'secret').

    HARMONIC_DB=$PWD/tconnect-data/ciq.demo.db HARMONIC_API_TOKEN=secret \
    HARMONIC_SECRET_KEY=$PWD/tconnect-data/secret.key TIMEZONE_NAME=America/New_York \
    uv run --extra api --extra sync python .claude/qa/demo_serve.py
"""
import uvicorn

from ciq_autotune.api import create_app

app = create_app(enable_fetch_loop=False)  # db/token/key read from env

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8899, log_level="info")
