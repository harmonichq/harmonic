# syntax=docker/dockerfile:1
#
# harmonic serve — FastAPI API + bundled Vue SPA on one port, for
# single-user self-hosting (issue #6, ADR 0021).
#
# Multi-stage: the builder resolves the locked dependency set into a venv; the
# runtime stage carries only that venv plus the source tree. Both stages share
# the same python:3.12-slim interpreter so the venv copied between them points
# at an interpreter that exists in the final image.

# ---- builder: resolve deps from the lockfile into /app/.venv ----------------
FROM python:3.12-slim-bookworm AS builder

# uv, copied from its published image. Pinned for reproducible builds.
COPY --from=ghcr.io/astral-sh/uv:0.11.25 /uv /uvx /usr/local/bin/

# UV_PYTHON_DOWNLOADS=0 forces uv to use this image's system interpreter (so the
# venv is portable to the runtime stage); LINK_MODE=copy avoids hardlink warns
# across the build cache; COMPILE_BYTECODE speeds first start.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# Only the lock inputs — so this layer caches unless the deps actually change.
# --no-install-project: install just the api+sync dependencies, not the app
# itself. We run ciq_autotune from the copied source tree at runtime (see the
# entrypoint) so its sibling frontend/ dir resolves; installing it as a wheel
# into site-packages would break that path. `tconnectsync` (the sync extra)
# holds at its locked 3.0.0 because we build --frozen from uv.lock.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --extra api --extra sync

# ---- runtime: venv + source, non-root -------------------------------------
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

# Non-root user; uid 1000 so a bind-mounted volume is writable with sane perms.
RUN useradd --create-home --uid 1000 app

WORKDIR /app

# The resolved venv from the builder (same interpreter path, so it just works).
COPY --from=builder /app/.venv /app/.venv

# The app source. frontend/ must sit beside ciq_autotune/ — api.py resolves the
# SPA as ../frontend/index.html relative to the package (#10). docs/kb/ likewise:
# the #269 Guide-KB serves the authored how-tos as raw markdown from
# ../docs/kb/<slug>.md, so those files must ship in the image too — without this
# COPY, /api/kb/<slug> 404s and every authored article reads "unknown article".
COPY ciq_autotune ./ciq_autotune
COPY frontend ./frontend
COPY docs/kb ./docs/kb
COPY pyproject.toml README.md ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# tconnect-data holds the SQLite DB *and* the Fernet key together (ADR 0021):
# one volume keeps them co-located, so losing the key doesn't silently orphan
# the DB. Owned by the runtime user so the server can write on first run.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/tconnect-data \
    && chown -R app:app /app

USER app

# Default port (cli.py). Host maps it with -p 8765:8765.
EXPOSE 8765
VOLUME ["/app/tconnect-data"]

# Ungated /health (api.py) — no token, no credentials needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8765/health').status==200 else 1)"

# The entrypoint validates TIMEZONE_NAME; the app resolves HARMONIC_NO_FETCH (or
# its deprecated CIQ_NO_FETCH fallback). CMD supplies
# the serve args. --host 0.0.0.0 because the CLI default 127.0.0.1 is
# unreachable from outside the container.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["--host", "0.0.0.0", "--port", "8765"]
