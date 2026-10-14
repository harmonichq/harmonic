## ADR 507 — Replay stories arrive on a warmed sidecar; harness reads never reuse a socket

### Context

A ledger shard failed every showcase story with
`page.waitForFunction: Timeout 20000ms exceeded` in the opener's wait for the
desk's loading frame. The same signature hit three stories on main on
2026-10-12. Measured on the showcase store at 1440x900, a cold arrival on a fresh
copy cleared at 10.2 s (5.9 s for the same reads one at a time) and at 3.55 s
with the derived sidecar present. With the server on contended efficiency cores,
the cold arrival took 23.7 s and the seeded one 8.9 s. The replay under that
contention reproduced CI exactly: the showcase stories failed and a basal case
passed. Server logs showed every request answered 200 and a clean shutdown:
latency, not a broken copy.

Separately, `FAIL S52 — apiRequestContext.get: socket hang up`. Playwright's
request context pools sockets with keep-alive; uvicorn closes an idle one after
5 s. Two reads 4.990–5.009 s apart failed 4 of 60 times; with `Connection: close`
on the context, 0 of 60.

### Decision

1. **Warm each case once, from its pristine source, through the production warm
   roster.** `frontend/replay-warm.py` runs the server's own warm roster against
   the case's generated source after ingestion reconciliation. Each story copies
   the resulting sidecar beside its fresh store. Sidecar hits are exact on store
   revision, coordinates and source fingerprint, so a story's first write misses
   it exactly as a production write does. The only payload difference from a cold
   compute is `generated_at`, which records the warm step's time, as it does
   after a production restart; the desk reads only its date.
2. **The replay's browser context sends `Connection: close`.** That context is
   the one place every harness `page.request` read is built, so a single header
   covers all of them, and the desk's own requests are unaffected in what they
   read.
3. **Keep each story's server log.** The case server records the server's exit
   status in the story's log, and both jobs upload those logs.

### Rejected

- **Raising the opener's 20 s bound, or retrying the read.** Either would hide
  the next real regression in arrival cost or in the server dropping requests.
  The runner was slow, but the harness put a full cold compute on every story's
  critical path, which production never does.
- **Carrying a sidecar from one story to the next.** It would carry one story's
  writes into another's history; the seed comes only from the pristine source.
- **Raising uvicorn's keep-alive timeout in the product.** The product's client
  is a browser, which already retries this race; the defect is in the harness's
  Node client.
