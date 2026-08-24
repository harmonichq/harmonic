# Design — A fetch invalidates on a committed write (#146)

## ADR 146 — A fetch invalidates on a committed write, not on a successful fetch

**Ruling.** Whether a fetch attempt invalidates the result cache is decided by
whether it **committed anything**, read off the store's durable input-data
revision, and not by whether the pull returned or by which exception it raised.
`run_fetch_once` returns the committed counts for a failed attempt that wrote —
an empty summary on the path that carries no counts — and `None` only for an
attempt that committed nothing; the loop invalidates on any non-`None` return.
`POST /api/fetch` applies the same comparison in one `except` branch and bumps
before mapping the failure to its status.

**Context.** A pull longer than 31 days runs in windows, and each window's
upserts commit as it lands. Three paths therefore commit rows and then fail: the
hourly loop on a partial fetch, the manual endpoint on a partial fetch (the
partial-fetch error is not a `RuntimeError`, so it escaped a handler that caught
only that), and either path on a first-window failure, where the settings
snapshot captured before window 0 is already committed and the upserts inside the
window commit one at a time. All three left the in-process cache serving
pre-fetch numbers on a surface whose numbers are dosing advice. The durable
sidecar layer was never exposed, because it already keys on this same revision.

**Why the revision rather than the exception type.** The exception says how the
attempt ended; only the store says what survived it. A rule written against
exception types has to be re-derived every time the pull grows a new failure
mode, and the first-window case shows the type is not even a reliable proxy — an
ordinary `RuntimeError` there can leave committed rows behind, while the same
type from a credential check leaves none. The revision is one fact, the same fact
the durable derivations already trust, and it is advanced inside the writing
transaction, so it cannot claim a commit that did not happen. It also declines to
advance for a zero-row upsert, which is why nothing here counts rows.

**The trap, and why the measurement window closes early.** The revision is
advanced by more than data upserts. Recording a fetch outcome ends in an
unconditional advance — on failure as well as success — and so does saving
credentials, which the pull itself reaches the first time it seeds the credential
table from `.env`. So the comparison is only meaningful across a window that ends
*before* the outcome is recorded. Measured after it, "the revision advanced" is
true on every attempt, and the fix silently becomes "invalidate on every
failure": every bad-credential or network failure would clear the cache and run
the full warm pass, hourly, forever. Each failure branch therefore takes the
comparison as its first statement, ahead of the log and the recorded outcome.
This ordering is load-bearing, not stylistic, and a characterization test pins
both branches against it.

**What this deliberately does not change.** A partial fetch is still not a
success: the recorded outcome, the last known good counts, and the window summary
in `last_error` are untouched, and the person using the app is still told the
fetch failed. The endpoint's one status change is the partial fetch itself,
which answered an unhandled 500 only because it escaped a handler that caught
`RuntimeError` alone; it now answers the 503 that every other fetch failure
already did, carrying how far the pull got. A failure that is neither keeps
propagating unchanged — an ingest bug must not start reading as a vendor outage
merely because the handler was widened to catch everything for the sake of
invalidating. Over-invalidation
is accepted in exchange: a successful fetch that changed nothing still
invalidates, and a first-ever credential seeding inside a failed pull counts as a
commit and invalidates once.
