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


class _Preparation:
    def __init__(self, projection_id, *, leased=True):
        self.projection_id = projection_id
        self.lease_until = time.monotonic() + 60 if leased else 0
        self.pins = 0


class ResultCacheTest(unittest.TestCase):
    def test_stable_read_retries_a_compute_crossed_by_a_bump(self):
        cache = ResultCache(incarnation="test-process")
        calls = []

        def compute():
            calls.append(1)
            if len(calls) == 1:
                cache.bump()
                return "stale"
            return "fresh"

        generation, value = cache.stable_read(("k",), compute)

        self.assertEqual((generation, value), ("test-process:1", "fresh"))
        self.assertEqual(len(calls), 2)

    def test_stable_read_aborts_after_repeated_crossed_computes(self):
        cache = ResultCache(incarnation="test-process")

        def compute():
            cache.bump()
            return "stale"

        with self.assertRaises(ResultCache.GenerationChanged):
            cache.stable_read(("k",), compute, attempts=2)

    def test_generations_do_not_collide_across_process_incarnations(self):
        first = ResultCache(incarnation="process-a")
        restarted = ResultCache(incarnation="process-b")

        self.assertNotEqual(first.generation, restarted.generation)

    def test_captured_version_has_the_same_opaque_generation_identity(self):
        cache = ResultCache(incarnation="captured")
        cache.bump()
        self.assertEqual(cache.generation_for_version(cache.version), cache.generation)

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

    def test_preparation_single_flight_returns_one_registered_identity(self):
        cache = ResultCache()
        entered = threading.Event()
        release = threading.Event()
        calls = []
        results = []

        def build(version):
            calls.append(version)
            entered.set()
            release.wait(1)
            return _Preparation(f"fp_{len(calls):032x}")

        def worker():
            results.append(cache.get_or_build_preparation(("same",), build)[0])

        first = threading.Thread(target=worker)
        second = threading.Thread(target=worker)
        first.start(); self.assertTrue(entered.wait(1)); second.start()
        time.sleep(0.05); release.set(); first.join(1); second.join(1)
        self.assertEqual(len(calls), 1)
        self.assertIs(results[0], results[1])

    def test_preparation_retries_once_then_fails_changed(self):
        cache = ResultCache()
        built = []

        def build(version):
            built.append(version)
            return _Preparation(f"fp_{len(built):032x}")

        value, reason = cache.get_or_build_preparation(
            ("moving",), build, before_commit=cache.bump,
        )
        self.assertIsNone(value)
        self.assertEqual(reason, "changed")
        self.assertEqual(len(built), 2)

    def test_preparation_capacity_never_evicts_leased_or_pinned(self):
        cache = ResultCache()
        for index in range(64):
            prepared = _Preparation(f"fp_{index:032x}")
            retained, reason = cache.get_or_build_preparation(
                (index,), lambda version, prepared=prepared: prepared,
            )
            self.assertIs(retained, prepared); self.assertIsNone(reason)
        value, reason = cache.get_or_build_preparation(
            (64,), lambda version: _Preparation(f"fp_{64:032x}"),
        )
        self.assertIsNone(value)
        self.assertEqual(reason, "capacity")

        # An expired but pinned oldest entry is skipped; the next expired entry goes.
        cache._preparations[(0,)].lease_until = 0
        cache._preparations[(0,)].pins = 1
        cache._preparations[(1,)].lease_until = 0
        value, reason = cache.get_or_build_preparation(
            (65,), lambda version: _Preparation(f"fp_{65:032x}"),
        )
        self.assertIsNone(reason)
        self.assertIn((0,), cache._preparations)
        self.assertNotIn((1,), cache._preparations)
        self.assertIs(value, cache._preparations[(65,)])

    def test_expired_preparation_hit_refreshes_lease_and_lru_retention(self):
        cache = ResultCache()
        entries = []
        for index in range(64):
            prepared = _Preparation(f"fp_{index:032x}", leased=False)
            entries.append(prepared)
            cache.get_or_build_preparation(
                (index,), lambda version, prepared=prepared: prepared,
            )

        retained, reason = cache.get_or_build_preparation(
            (0,), lambda version: self.fail("a retained coordinate rebuilt"),
        )
        self.assertIs(retained, entries[0])
        self.assertIsNone(reason)
        self.assertGreater(retained.lease_until, time.monotonic())

        cache.get_or_build_preparation(
            (64,), lambda version: _Preparation(f"fp_{64:032x}"),
        )
        self.assertIn((0,), cache._preparations)
        self.assertNotIn((1,), cache._preparations)

    def test_bump_removes_addressability_but_not_an_acquired_object(self):
        cache = ResultCache()
        prepared = _Preparation("fp_" + "a" * 32)
        cache.get_or_build_preparation(("k",), lambda version: prepared)
        acquired = cache.acquire_preparation(prepared.projection_id)
        self.assertIs(acquired, prepared)
        cache.bump()
        self.assertIsNone(cache.acquire_preparation(prepared.projection_id))
        self.assertEqual(acquired.pins, 1)
        cache.release_preparation(acquired)
        self.assertEqual(acquired.pins, 0)


if __name__ == "__main__":
    unittest.main()
