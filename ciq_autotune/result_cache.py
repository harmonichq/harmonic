"""An in-process result cache for the heavy read endpoints (#267).

The API and its hourly fetch loop run in one process, so a plain in-memory cache
owned by the app — cleared on every write — is trivially consistent with no
external infrastructure. The first request for a given endpoint+params after a
fetch recomputes; every request after that is a dict lookup until the next write.

Design (see ADR 0035):

- **Coarse, global invalidation.** Any write calls :meth:`bump`, which clears the
  whole map and advances a monotonic ``version``. No per-endpoint dependency
  tracking — over-invalidation costs at most one recompute.
- **Race guard.** :meth:`get_or_compute` snapshots ``version`` before computing and
  refuses to *store* a result whose version advanced meanwhile (an hourly fetch
  landing mid-compute), so it can never leave a stale entry. That request still
  returns its own freshly computed value — discard-on-store means "don't poison the
  cache," never "drop the response."
- **Thread-safe.** Sync endpoints run in FastAPI's threadpool and the fetch loop
  bumps from a ``to_thread`` worker, so every mutation of the map is under a lock.
  ``compute`` runs *outside* the lock so recomputes never serialize against each
  other or against cache reads.
- **Bounded.** LRU eviction past a fixed cap keeps per-hour key growth from the
  date/month/range-keyed endpoints from leaking; ``bump`` empties it hourly anyway.

Stdlib only, imported by nothing in core — it stays out of the ``api`` extra's way.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from typing import Callable, Hashable, TypeVar

T = TypeVar("T")

DEFAULT_CAP = 256


class ResultCache:
    """A thread-safe, bounded, version-invalidated result cache.

    ``get_or_compute(key, compute)`` returns the cached value for ``key`` or runs
    ``compute`` (a zero-arg callable) to produce and store it. ``bump()`` clears
    everything and advances ``version``.
    """

    def __init__(self, cap: int = DEFAULT_CAP) -> None:
        self._cap = cap
        self._lock = threading.Lock()
        self._map: "OrderedDict[Hashable, object]" = OrderedDict()
        self._version = 0
        # Per-key "flight" locks (#267 commit 7): two concurrent misses for the same
        # key compute once instead of racing — the second waits, then hits the cache
        # the first filled. Guarded by ``_lock``; entries are dropped after compute.
        self._flights: "dict[Hashable, threading.Lock]" = {}

    @property
    def version(self) -> int:
        """The monotonic data version — advanced by every :meth:`bump`."""
        with self._lock:
            return self._version

    def bump(self) -> None:
        """Invalidate: clear the map and advance ``version``. Called after any write."""
        with self._lock:
            self._map.clear()
            self._version += 1

    def get_or_compute(self, key: Hashable, compute: Callable[[], T]) -> T:
        """Return ``key``'s cached value, or compute + store it.

        Snapshots ``version`` on a miss; ``compute`` runs outside the lock, and the
        result is only stored if ``version`` is unchanged on completion (the race
        guard). The freshly computed value is always returned to this caller
        regardless of whether it was stored.
        """
        with self._lock:
            if key in self._map:
                self._map.move_to_end(key)
                return self._map[key]  # type: ignore[return-value]
            flight = self._flights.get(key)
            if flight is None:
                flight = self._flights[key] = threading.Lock()

        # Single-flight: only one thread computes a given key at a time. A second
        # miss for the same key blocks here, then re-checks the map below and hits
        # the value the first thread filled — no duplicate recompute.
        with flight:
            with self._lock:
                if key in self._map:
                    self._map.move_to_end(key)
                    self._flights.pop(key, None)
                    return self._map[key]  # type: ignore[return-value]
                # Snapshot inside the flight lock: a write may have landed while we
                # waited for it, so this is the version ``compute`` reads against.
                snapshot = self._version

            try:
                value = compute()
                with self._lock:
                    # Only cache if no write landed while we were computing; otherwise
                    # this value is already stale relative to the current version —
                    # return it to our caller but don't poison the cache.
                    if self._version == snapshot:
                        self._map[key] = value
                        self._map.move_to_end(key)
                        while len(self._map) > self._cap:
                            self._map.popitem(last=False)  # evict least-recently-used
            finally:
                # Drop the flight lock even if ``compute`` raised, so a key whose
                # compute always fails (e.g. an endpoint validating a bad param
                # inside ``compute``) can't leak an entry per distinct bad value.
                with self._lock:
                    self._flights.pop(key, None)
        return value
