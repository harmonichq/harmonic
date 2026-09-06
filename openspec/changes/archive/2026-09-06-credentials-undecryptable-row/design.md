# Design — An undecryptable credential row reads as unconfigured (#351)

## ADR 351 — An undecryptable credential row reads as unconfigured, and never re-seeds from `.env`

**Ruling.** A `credentials` row the on-disk Fernet key cannot decrypt is
answered as **no usable credentials**: `load_credentials` catches `InvalidToken`
around its single `decrypt` call, logs one warning, and returns `None`
immediately — without consulting the `.env` fallback. The handler lives in
`credentials.py`, not in the endpoint, so both callers get the same answer from
one place.

**Context.** The key lives outside the database precisely so that losing it
costs a re-entry rather than a lockout, and five documents in this repository
say so. The code raised instead, and the endpoint had no handler, so the
promised degradation was an unhandled `500` with a bare `text/plain` body.

**Why `credentials.py` rather than the endpoint.** There are two production
readers, and catching at the endpoint would fix one of them. `load_credentials`
already answers `None` for every other unavailable case — no row and no `.env`,
placeholder `.env` values, the `sync` extra absent — and a test in the tree
(`test_missing_sync_extra_returns_none_instead_of_raising`) pins that
"unavailable" is a return value here, not an exception. An unreadable row is one
more unavailable case, so it belongs in the same verdict. The pull path then
degrades for free: it already raises a not-configured `RuntimeError` on `None`,
which `POST /api/fetch` maps to `503` with text naming `/api/credentials`, and
which the hourly loop already records as a failed attempt.

**Why not fall through to `.env`.** Falling through would let a stale `.env`
re-seed the table and quietly overwrite a row the operator set through the API —
exactly what the *Credentials change through the API, not by editing
configuration files after first use* requirement exists to prevent. The `.env`
fallback is conditioned on the table being **empty**, and an undecryptable row
is not an empty table. So the second-order effect noted on the ticket — that an
unreadable row blocks the one-time `.env` re-seed — is kept deliberately, and a
test pins the stored ciphertext as unchanged.

**Why the exception import is deferred.** This module defers every
`cryptography` and `tconnectsync` import to call time, so the stdlib-only core
imports without the `api`/`sync` extras installed. `InvalidToken` is imported
inside the function for the same reason; a module-level import would break that
guarantee and the failure would only show on an install without the extras.

**Why `InvalidToken` and nothing wider.** `InvalidToken` is what a wrong key, a
tampered token and a corrupt ciphertext all raise, which is the whole of the
reported state. A malformed key *file* raises `ValueError` from `Fernet()`
instead; that state is not reported, not reproduced, and gets no guard here.

**Why a log line at all.** The fix removes a traceback, and the API shape cannot
tell the operator apart from someone who never configured credentials. One
warning keeps a signal where this repository already puts operator signals — the
same `logger.warning` shape `fetch_loop` and `config` use — while the message is
held to the key path and the recovery, never the credential itself.
