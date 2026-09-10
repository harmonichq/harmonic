# Scope ledger — An undecryptable credential row reads as unconfigured (#351)

Child of the Diagnose QA sweep (#350). Triaged without an interview: the issue
body carries the reproduction, the expected and actual behavior, the suspected
source and the explorer's evidence, so every decision below was settled from
that evidence and from this repository rather than put to the operator.

## Reproduction

`docs/scope/351-credentials-repro.py`, committed beside this ledger and run
through `uv run python docs/scope/351-credentials-repro.py`. It is entirely
synthetic — a throwaway database, a made-up address and password, two locally
generated Fernet keys — and touches no snapshot. Today it prints:

```
raised: InvalidToken
status: 500 content-type=text/plain; charset=utf-8 body='Internal Server Error'
```

So the endpoint answers a bare `text/plain` `500`, not even the API's own JSON
`detail` shape. The operator snapshot on port 8801 shows the same failure, and
no value from it appears here or in the order.

## Decisions

- The handler goes in `ciq_autotune/credentials.py`, not in the endpoint. There
  are two production readers of `load_credentials` — `api.py:1226` and
  `sync.py:149` — and the function already answers `None` for every other
  unavailable case. `tests/test_credentials.py::test_missing_sync_extra_returns_none_instead_of_raising`
  pins that "unavailable" is a return value here rather than an exception.
- An undecryptable row returns `None` **immediately** and does not fall through
  to the `.env` fallback. That fallback is conditioned on an empty table, and
  the specification's *Credentials change through the API, not by editing
  configuration files after first use* requirement exists to stop a stale
  `.env` replacing a stored row. The ticket's noted second-order effect — that
  an unreadable row blocks the one-time `.env` re-seed — is therefore kept
  deliberately, and pinned by a test.
- `InvalidToken` only. A malformed key *file* raises `ValueError` out of
  `Fernet()`; that state is not reported and not reproduced, so it earns no
  guard.
- The exception class is imported inside the function, because this module
  defers every `cryptography`/`tconnectsync` import to call time so the
  stdlib-only core imports without the extras.
- One `logger.warning` marks the degradation. Removing the traceback otherwise
  leaves silence, since the API shape cannot distinguish a lost key from a
  never-configured install. Drawing that distinction in the interface is
  separate work and is not in this ticket.
- No screen changes. The shell already swallows this response into
  "no credentials configured", which is the correct reading once the endpoint
  answers 200, and the sweep forbids touching any screen other than Diagnose.
- Recorded as `## ADR 351` in
  `openspec/changes/credentials-undecryptable-row/design.md`.

## Document inventory

Closed inventory of the key-loss promise, from a grep of the whole tree for
`no key to lose`, `locked out`, `Losing the key`, `Losing the encryption key`
and `re-enter`:

| Document | Line | Moves? |
|---|---|---|
| `ciq_autotune/credentials.py` | 8 | Yes — the docstring states the degradation where it promises it |
| `openspec/specs/credentials/spec.md` | 29–38 | Yes — the requirement says what "inaccessible" means at the read boundary, and its existing placeholder scenario is rewritten in place to state it |
| `README.md` | 190 | No — already describes the fixed behavior |
| `AGENTS.md` | 431 | No — already describes the fixed behavior |
| `docker-compose.yml` | 69 | No — already describes the fixed behavior |

## Shape

Flat. No slicing trait fires: one module, one target, no live run in the ticket
(the pytest subset is the harness and it already exists), no split-path
evidence, no lockstep copies. The store's caution that a Harmonic ticket can
run flat and still degrade was read and checked; the categories it names —
cache invalidation, population semantics, concurrency, decision-heavy evidence
contracts — do not describe a single exception handler with three unit tests
and one specification paragraph. No nearby anchor contradicts the flat call.

## Open questions

None.

## Review

Instrumented per round below; blockers tagged `authoring` (present since the
draft) or `injected` (introduced by a prior fix round).

- Round 1: four blockers, all `authoring` — none injected, there being no prior
  fix round. Three block posting and one is a note.
  1. The order's Summary claimed the app is broken today. It is not: the shell's
     cold load routes `/api/credentials` through `Promise.allSettled`
     (`frontend/index.html:5242`), catches the rejection into `credentials.value
     = null` (`:4274-4276`) and renders "No credentials stored yet." (`:1835`).
     Fixed by stating what actually changes — a traceback and a bare
     `text/plain` 500 become a 200 and one warning, and no screen moves.
  2. Task 3 asked for a scenario the requirement already carries at
     `openspec/specs/credentials/spec.md:35-38`, in the placeholder shape its
     neighbours use — so "in the shape its neighbours already use" and "expresses
     the new behavior" could not both be met. Fixed by rewording the task to
     rewrite that scenario in place, and by widening this ledger's inventory row
     to 29–38.
  3. The Summary's "cannot be unlocked with the key on disk" also described a
     malformed `secret.key`, which raises `ValueError` out of `_fernet()` before
     `decrypt` is reached and which this change deliberately does not guard (see
     Decisions above). Fixed by narrowing the Summary to a key that no longer
     matches the stored row, and by listing the malformed key file under "Not in
     this ticket".
  4. Note: a hand-counted generated fact read "57 of its 59 active changes".
     Regenerated from the tree — 58 of 59 active changes carry `.openspec.yaml`
     with `skip_specs: true`; the holdout is `openspec/changes/basal-night-drill/`,
     which has none. Corrected.
