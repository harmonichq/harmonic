"""Typed-row tests (stdlib unittest, no third-party deps).

Covers the #125 CarbEntry invariants; the other event dataclasses are plain data
exercised through the store tests.
"""

import unittest
from datetime import datetime

from ciq_autotune.events import CarbEntry, format_t, parse_t


class CarbEntryTest(unittest.TestCase):
    def setUp(self):
        self.t = datetime(2026, 7, 2, 13, 30, 0)

    def test_valid_entries_construct(self):
        # A typed number, a preset estimate, and an "ate something, don't know".
        CarbEntry(self.t, 45.0, "exact", "manual")
        CarbEntry(self.t, 15.0, "estimate", "rise-prompt", note="snack")
        CarbEntry(self.t, None, "unknown", "low-prompt")

    def test_grams_none_requires_unknown_certainty(self):
        for certainty in ("exact", "estimate"):
            with self.assertRaises(ValueError):
                CarbEntry(self.t, None, certainty, "manual")

    def test_unknown_certainty_allows_a_number_too(self):
        # "unknown" only *permits* a null grams; a value is still valid.
        e = CarbEntry(self.t, 30.0, "unknown", "manual")
        self.assertEqual(e.grams, 30.0)

    def test_bad_certainty_rejected(self):
        with self.assertRaises(ValueError):
            CarbEntry(self.t, 10.0, "guess", "manual")

    def test_bad_source_rejected(self):
        with self.assertRaises(ValueError):
            CarbEntry(self.t, 10.0, "exact", "imported")

    def test_frozen(self):
        e = CarbEntry(self.t, 10.0, "exact", "manual")
        with self.assertRaises(Exception):
            e.grams = 20.0  # type: ignore[misc]


class FormatTest(unittest.TestCase):
    def test_format_t_round_trips_parse_t(self):
        t = datetime(2026, 7, 2, 13, 30, 45)
        self.assertEqual(parse_t(format_t(t)), t)
        self.assertEqual(format_t(t), "2026-07-02 13:30:45")


if __name__ == "__main__":
    unittest.main()
