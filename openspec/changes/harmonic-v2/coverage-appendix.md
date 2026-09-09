# #393 coverage appendix

All measurements use only committed manufactured QA recipes. Limits are unchanged:
showcase database at most 25 MiB, showcase drift at most 30 seconds, focused QA
suite at most 90 seconds, slowest generated case at most 15 seconds, and full
pytest at most 2.5 times the active QA change's recorded chunk-1 baseline.

| Measure | c1 base | c4 replay |
| --- | ---: | ---: |
| Named QA catalog cases | 45 | 45 |
| Pattern roster expectation | literal for every case | literal for every case |
| `tests/test_pattern_replay.py` | not present | 15.76 s; 1 pass, 45 subtests |
| Focused-QA limit | 90 s unchanged | 90 s unchanged |

c1 established the generator-owned literal roster catalog; c4 adds no recipe,
fixture, generator, limit, or production code. The c4 replay materializes each
case once and reuses it through the analyzer composition, prepared Findings
projection, guidance, and follow-up admission. Its 15.76-second measured run is
below the unchanged 90-second focused-QA budget.
