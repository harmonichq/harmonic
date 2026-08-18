#!/bin/sh
# Container entrypoint for `harmonic serve`.
#
# Two jobs before handing off to the server:
#
#   1. Fail fast if TIMEZONE_NAME is unset. It sets the wall clock every record
#      is bucketed by (a basal profile is a wall-clock schedule) and is never
#      stored in the DB — a fetch refuses to run without it (#198). A missing
#      value would otherwise surface as a confusing "data won't update" loop, so
#      we stop here with a clear message instead (ADR 0021).
#
#   2. The app resolves HARMONIC_NO_FETCH (or its deprecated CIQ_NO_FETCH
#      fallback) to skip the OAuth-PKCE login on startup — needed for a
#      scratch/synthetic DB with no Tandem credentials, and how you smoke-test
#      the container. Left unset (the default), the server does its live fetch
#      on startup, which is the point of running it.
set -eu

if [ -z "${TIMEZONE_NAME:-}" ]; then
    echo "error: TIMEZONE_NAME is required and must match your pump's timezone" >&2
    echo "       (e.g. TIMEZONE_NAME=America/Phoenix). It sets the wall clock" >&2
    echo "       every record is bucketed by; a fetch refuses to run without it." >&2
    exit 1
fi

set -- serve "$@"

# Run from the source tree (WORKDIR /app) so `ciq_autotune`'s sibling
# `frontend/` dir resolves for the SPA — the venv holds deps only.
exec python -m ciq_autotune.cli "$@"
