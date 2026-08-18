"""Unit tests for the in-process ResultCache (#267).

The cache is asserted in isolation — no API, no DB. The behavioral contracts are:
a miss computes and stores, a hit returns without recomputing, ``bump`` clears and
advances the version, the race guard discards a store whose version went stale
mid-compute (while still returning the value to that caller), and the map is bounded.
"""

import threading
import time
import unittest

from ciq_autotune.result_cache import ResultCache


class ResultCacheTest(unittest.TestCase):
    def test_miss_computes_hit_does_not(self):
        cache = ResultCache()
        calls = []

        def compute():
            calls.append(1)
            return "v"

        self.assertEqual(cache.get_or_compute(("k",), compute), "v")
        self.assertEqual(cache.get_or_compute(("k",), compute), "v")
        self.assertEqual(len(calls), 1)  # second call was a cache hit

    def test_distinct_keys_compute_separately(self):
        cache = ResultCache()
        self.assertEqual(cache.get_or_compute(("a",), lambda: 1), 1)
        self.assertEqual(cache.get_or_compute(("b",), lambda: 2), 2)
        # re-fetch both from cache, no recompute
        self.assertEqual(cache.get_or_compute(("a",), lambda: 99), 1)
        self.assertEqual(cache.get_or_compute(("b",), lambda: 99), 2)

    def test_bump_clears_and_advances_version(self):
        cache = ResultCache()
        v0 = cache.version
        cache.get_or_compute(("k",), lambda: "old")
        cache.bump()
        self.assertEqual(cache.version, v0 + 1)
        # cleared → recompute
        self.assertEqual(cache.get_or_compute(("k",), lambda: "new"), "new")

    def test_version_is_monotonic(self):
        cache = ResultCache()
        start = cache.version
        for i in range(3):
            cache.bump()
        self.assertEqual(cache.version, start + 3)

    def test_race_guard_discards_stale_store_but_returns_value(self):
        cache = ResultCache()

        def compute():
            # A write lands mid-compute: version advances before this result stores.
            cache.bump()
            return "stale"

        # The caller still gets its freshly computed value...
        self.assertEqual(cache.get_or_compute(("k",), compute), "stale")
        # ...but it was NOT stored (version advanced), so the next call recomputes.
        self.assertEqual(cache.get_or_compute(("k",), lambda: "fresh"), "fresh")

    def test_lru_eviction_bounds_the_map(self):
        cache = ResultCache(cap=2)
        cache.get_or_compute(("a",), lambda: 1)
        cache.get_or_compute(("b",), lambda: 2)
        cache.get_or_compute(("c",), lambda: 3)  # evicts oldest ("a")
        recompute = []
        # "a" was evicted → recompute
        cache.get_or_compute(("a",), lambda: recompute.append("a") or 1)
        self.assertEqual(recompute, ["a"])
        # "c" is still resident → hit
        cache.get_or_compute(("c",), lambda: recompute.append("c") or 3)
        self.assertEqual(recompute, ["a"])

    def test_hit_refreshes_lru_recency(self):
        cache = ResultCache(cap=2)
        cache.get_or_compute(("a",), lambda: 1)
        cache.get_or_compute(("b",), lambda: 2)
        cache.get_or_compute(("a",), lambda: 99)  # touch "a" → now most-recent
        cache.get_or_compute(("c",), lambda: 3)   # evicts LRU, which is now "b"
        recompute = []
        # "a" and "c" are the two resident keys → both hit, neither recomputes.
        cache.get_or_compute(("a",), lambda: recompute.append("a") or 1)
        cache.get_or_compute(("c",), lambda: recompute.append("c") or 3)
        self.assertEqual(recompute, [])  # "b" was the eviction victim, not "a"

    def test_single_flight_concurrent_misses_for_same_key_compute_once(self):
        cache = ResultCache()
        in_compute = threading.Event()
        release = threading.Event()
        calls = []

        def compute():
            calls.append(1)
            in_compute.set()
            release.wait(1)
            return "v"

        results = []

        def worker():
            results.append(cache.get_or_compute(("k",), compute))

        t1 = threading.Thread(target=worker)
        t1.start()
        self.assertTrue(in_compute.wait(1))  # t1 is now inside compute()
        t2 = threading.Thread(target=worker)
        t2.start()
        time.sleep(0.05)  # let t2 block on the flight lock
        release.set()
        t1.join(1)
        t2.join(1)
        self.assertEqual(len(calls), 1)      # only one compute despite two misses
        self.assertEqual(results, ["v", "v"])  # both got the value

    def test_raising_compute_does_not_leak_a_flight_lock(self):
        # An endpoint that validates a bad param *inside* compute raises every time;
        # each distinct bad key must not permanently leave a per-key flight lock
        # (the LRU/bump bound only covers the value map, not the flight table).
        cache = ResultCache()

        def boom():
            raise ValueError("bad param")

        for i in range(50):
            with self.assertRaises(ValueError):
                cache.get_or_compute((i,), boom)
        self.assertEqual(len(cache._flights), 0)
        # And a later good compute for a previously-failed key still works.
        self.assertEqual(cache.get_or_compute((0,), lambda: "ok"), "ok")

    def test_thread_safe_under_concurrent_access(self):
        cache = ResultCache()
        errors = []

        def worker(n):
            try:
                for i in range(200):
                    cache.get_or_compute((i % 20,), lambda: i)
                    if i % 50 == 0:
                        cache.bump()
            except Exception as e:  # pragma: no cover
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(n,)) for n in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
