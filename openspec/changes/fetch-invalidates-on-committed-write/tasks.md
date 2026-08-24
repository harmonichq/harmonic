# Tasks — A fetch invalidates on a committed write (#146)

## 1. Make the committed write the signal in the hourly loop

- [x] Take the store's input-data revision as the attempt's baseline inside the
      opened store, before the pull.
- [x] Read the revision comparison as the first statement of each failure branch,
      before the outcome is recorded, and return the partial fetch's counts or an
      empty summary when it advanced.
- [x] Keep the success branch unconditional, and leave the recorded outcome,
      the warning logs and the summary string byte-identical.
- [x] Fire `on_write` on any non-`None` return, so an empty summary invalidates.
- [x] State the rule the code now has in both docstrings.

## 2. Close the same gap on the manual endpoint

- [x] Read the baseline inside the opened store, bump when the revision advanced,
      and settle the failure statuses: a partial fetch joins `RuntimeError` at 503
      instead of escaping the handler as an unhandled 500, and anything else keeps
      propagating unchanged.

## 3. Pin the behavior through the public interface

- [x] A partial fetch that committed rows returns its counts, and is still
      recorded as not-a-success naming the windows.
- [x] A first-window failure that committed only the settings snapshot returns a
      summary rather than `None`.
- [x] A failure that committed nothing returns `None` — asserted for both the
      partial and the generic branch, which is what catches the outcome-recording
      trap.
- [x] The loop invalidates on an empty-summary return.
- [x] The endpoint's five cases, read on the cache's public version: partial and
      `RuntimeError` with and without a committed write, and a third failure kind
      that invalidates and still propagates.

## 4. Record the decision and fold in the specification delta

- [x] Record `## ADR 146` with the revision-as-signal ruling and the
      outcome-recording trap.
- [x] State the committed-but-failed case under both the scheduled-fetch and the
      every-write-path requirements in the HTTP API specification.
