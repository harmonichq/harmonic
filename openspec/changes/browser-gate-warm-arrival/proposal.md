# The replay's stories arrive warm, and their servers' logs are kept (#507)

## Why

Two browser-gate failures on PR #503 had nothing to do with that change. In one
ledger shard, every story served from the showcase store timed out waiting for
the desk to finish reading; in the Trial and Pattern Focus suite, one story's
read of a finished Trial failed with a dropped connection. Neither failure left
the server's own output anywhere a reader could see it.

The first is cold-compute latency. Each story gets a fresh copy of its case
store and a `--no-fetch` server, which never warms, and the case server deleted
the persisted derived-results sidecar before every story. Every story's arrival
therefore computed the whole fixed Diagnose read from nothing. On the showcase
store that cost about 10 s on a dev machine, close enough to the opener's 20 s
bound that a slower runner crossed it on every story. A running install keeps
that sidecar and re-warms it after every fetch, so its visitors never pay this.

The second is a keep-alive race. Playwright pools the harness's own API reads on
one keep-alive socket; the served app closes an idle socket after 5 s; a read
sent on a socket as it closed fails with "socket hang up". Browsers retry that
case and Node does not.

## What changes

- The case server warms each generated case's derived sidecar once, from its
  pristine source, through the server's own warm roster, and copies it beside
  every story's fresh store.
- The replay's browser context sends `Connection: close`, so no harness read
  reuses a socket the server is closing.
- Each story's server log records the server's exit status, and the ledger and
  Trial and Pattern Focus jobs upload those logs.

## Impact

- `frontend/replay-cases.mjs`, the new `frontend/replay-warm.py`, the frozen
  `frontend/desk-behavior.replay.mjs` (one amendment: transport only),
  `frontend/follow-up.browser.test.mjs`, `.github/workflows/ci.yml`.
- No story claim, wait, tolerance or action changes. No product code changes.
