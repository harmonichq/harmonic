"""#414 spike: the episode chaining rule from ADR 414, as a table test.

Records sorted by change instant join the previous record's episode when the
gap is at most the detector's one-day profile tolerance; otherwise they start
a new one. Run: python3 docs/scope/414-episode-chain.spike.py
"""
from datetime import datetime, timedelta

TOLERANCE = timedelta(days=1)


def episodes(records):
    out, key, last = {}, None, None
    for rec in sorted(records, key=lambda r: r["changed_at"]):
        if last is None or rec["changed_at"] - last > TOLERANCE:
            key = f"ep:{rec['id']}"
        out[rec["id"]] = key
        last = rec["changed_at"]
    return out


T0 = datetime(2024, 5, 1, 8, 0)
CASES = [
    ("single", [("a", 0)], {"a": "ep:a"}),
    ("exactly one day chains", [("a", 0), ("b", 24 * 60)], {"a": "ep:a", "b": "ep:a"}),
    ("one day plus one minute splits", [("a", 0), ("b", 24 * 60 + 1)], {"a": "ep:a", "b": "ep:b"}),
    ("chain spans two days by adjacency", [("a", 0), ("b", 20 * 60), ("c", 40 * 60)],
     {"a": "ep:a", "b": "ep:a", "c": "ep:a"}),
    ("a week later is its own episode", [("a", 0), ("b", 6 * 60), ("c", 7 * 24 * 60)],
     {"a": "ep:a", "b": "ep:a", "c": "ep:c"}),
    ("unsorted input sorts first", [("b", 6 * 60), ("a", 0)], {"a": "ep:a", "b": "ep:a"}),
]

if __name__ == "__main__":
    for name, rows, want in CASES:
        got = episodes([{"id": i, "changed_at": T0 + timedelta(minutes=m)} for i, m in rows])
        assert got == want, (name, got, want)
        print("ok", name)
