# Design

## ADR 123 — Version durable Diagnose artifacts from a Store snapshot

The primary Store advances a durable revision inside each committed mutation.
Sidecar reads and computation use one query-only snapshot, then write through
only if a fresh primary read still has that revision. Artifacts are canonical
JSON plus a digest and are keyed by revision, complete ResultCache coordinates,
layout/shape marker, and a process-cached hash of package source. Contention is
a miss and never deletes a sidecar; malformed/corrupt sidecars are disposable.
`PreparedCases` remains excluded: its domain objects/non-plain collections are
not safe JSON artifacts and its recomputation is already pre-warmed.

Byte-exactness is the digest's job; consumability is proven by use, with a total
recompute-once guard for sidecar-sourced objects.
