# Generated facts — #275 plan inputs

These are command transcripts from the checked-out tree at drafting time. They are
evidence for the lock's closed expected diffs, not a second source of behavior.

## Drift-check register

Command:

```sh
grep -n -A18 -B2 'backend job also runs' AGENTS.md
```

Output:

```text
53-```
54-
55:The backend job also runs twelve **drift checks**, so a committed
56-generator-authored artifact can never silently diverge from its generator.
57-Eleven are listed below; the twelfth is the evidence-canvas exploration's
58-generator — a private design artifact the public tree excludes, so its
59-`--check` command lives in `.github/workflows/ci.yml`:
60-
61-```sh
62-uv run python scripts/gen_ic_block_fixtures.py --check
63-uv run python scripts/gen_annotation_fixtures.py --check
64-uv run python scripts/gen_chart_builder_fixtures.py --check
65-uv run python scripts/check_demo_fixtures.py   # the committed synthetic demo sets
66-uv run python scripts/gen_qa_e2e_db.py --check
67-uv run python scripts/gen_findings_projection_fixtures.py --check
68-uv run python scripts/gen_ic_history_event_fixtures.py --check
69-uv run python scripts/gen_ic_block_evidence_fixtures.py --check
70-uv run python scripts/gen_basal_night_evidence_fixtures.py --check
71-uv run python scripts/gen_isf_rest_window_evidence_fixtures.py --check
72-uv run python scripts/gen_missed_meal_comparison_fixtures.py --check
73-```
```

Command:

```sh
grep -c 'gen_.*fixtures.py\|check_demo_fixtures.py' AGENTS.md
```

Output:

```text
10
```

## Fixed source window and Scenario slice

Command:

```sh
rg -n 'DIAGNOSE_SOURCE_WINDOW_DAYS' ciq_autotune/findings_projection.py
```

Output:

```text
138:DIAGNOSE_SOURCE_WINDOW_DAYS = 30
```

Command:

```sh
rg -n -A8 -B2 'def _slice' ciq_autotune/analyzers/scenario/engine.py
```

Output:

```text
84-
85-
86:def _slice(events: Sequence, start: datetime, end: datetime) -> list:
87-    return [e for e in events if start <= e.t <= end]
88-
89-
90-def _exposure_counts(
91-    bolus: Sequence[BolusEvent],
92-    cgm: Sequence[CgmReading],
93-    basal: Sequence[BasalEvent],
94-    *,
```

## Fixed producer, route, and response age

Command:

```sh
sed -n '270,295p' ciq_autotune/api.py
```

Output:

```text
                          serve_stale=False).value
        exposures = fixed(
            ("exposures",), "exposures-v1",
            lambda store: build_exposures(store, window_days=window),
            serve_stale=False,
        ).value
        return analysis, exposures, scenarios

    def basal_night_evidence_preparation(window):
        """One fixed analyzer-owned basal roster set per source window."""
        if window != findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS:
            raise ValueError("basal night evidence requires its fixed source window")
        return fixed(
            ("basal-night-evidence", window), "basal-night-evidence-v1",
            lambda store: prepare_basal_night_evidence(findings_products(window)[0]),
            dump=dump_basal_night_evidence, rebuild=rebuild_basal_night_evidence,
            serve_stale=False,
        )
```

Command:

```sh
sed -n '925,960p' ciq_autotune/api.py
```

Output:

```text
    @app.get("/api/diagnose/basal-night-evidence")
    def diagnose_basal_night_evidence_endpoint(
        slot: Optional[int] = None,
        window: int = findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS,
        _: None = Depends(require_token),
    ) -> dict:
        """Analyzer-owned nightly delivered-versus-programmed basal evidence."""
        n_slots = 24 * 60 // ModelConfig().slot_minutes
        if slot is None or not 0 <= slot < n_slots:
            raise HTTPException(status_code=400, detail="slot must name a basal clock slot")
        if window != findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS:
            raise HTTPException(status_code=400, detail=(
                "basal night evidence requires its fixed source window"))
        try:
            result = basal_night_evidence_preparation(window)
            return recover_sidecar_projection(
                ("basal-night-evidence", window), "basal-night-evidence-v1", result,
                lambda prepared: prepared.project(
                    slot, analysis_generation=cache.generation),
                lambda: basal_night_evidence_preparation(window),
            )
        except UnknownBasalSlot as error:
            raise HTTPException(status_code=404, detail="basal slot was not found") from error
        except IncompleteBasalNightEvidence as error:
            raise HTTPException(status_code=500, detail="basal night evidence is incomplete") from error
```

Command:

```sh
rg -n -C 3 'def fixed_response|input_data_age' ciq_autotune/api.py
```

Output:

```text
183-
184-    def current_fixed_result(result: FixedResult) -> bool:
185-        """Validate a fresh envelope while ResultCache holds its publish lock."""
186:        if result.revision is None or result.input_data_age is not None:
187-            return False
188-        with Store.open_queryonly(db_path) as current:
189-            return current.input_data_revision() == result.revision
--
215-
216-    app.state.fixed_in_flight_keys = fixed_in_flight_keys
217-
218:    def fixed_response(result: FixedResult, project=lambda value: value):
219-        """Project a fixed payload once, then atomically attach backend-owned age."""
220-        payload = project(result.value)
221:        if result.input_data_age is None:
222-            return payload
223-        age = {
224:            "revision": result.input_data_age.revision,
225:            "covers_to": result.input_data_age.covers_to,
226-        }
227:        if result.input_data_age.newest_covers_to is not None:
228:            age["newest_covers_to"] = result.input_data_age.newest_covers_to
229:        return {**payload, "input_data_age": age}
230-
231-    def canonical_pooled_analysis(window: int, *, serve_stale=True):
232-        """The shared pooled analysis plus retained ISF step identities."""
```

## Warm roster

Command:

```sh
sed -n '1575,1610p' ciq_autotune/api.py
```

Output:

```text
        ``run_fetch_loop`` invokes this from its fetch thread.  It deliberately
        does no compute there: one event coalesces writes while the worker is
        running and the loop remains free to serve requests between shapes.
        """
        cache.bump()
        app.state.recompute_loop.call_soon_threadsafe(app.state.recompute_event.set)

    async def default_recompute_pace() -> None:
        await asyncio.sleep(RECOMPUTE_PACE_SECONDS)

    def warm_roster():
        return (
            ("analyze", lambda: analyze_endpoint(window=30, ignore_changes=False, pool=False)),
            ("backtest", lambda: backtest_endpoint(holdout_days=2)),
            ("outcomes-trend", lambda: outcomes_trend_endpoint(window=30)),
            ("analyze-pooled", lambda: analyze_endpoint(window=30, ignore_changes=False, pool=True)),
            ("scenarios", lambda: scenarios_endpoint(window=30)),
            ("explore-time-of-day", explore_time_of_day_endpoint),
            ("exposures", explore_exposures_endpoint),
            ("ic-block-evidence-preparation", ic_block_evidence_preparation),
            ("basal-night-evidence", lambda: basal_night_evidence_preparation(
                findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS)),
            ("isf-rest-window-evidence", lambda: diagnose_isf_rest_window_evidence_endpoint()),
            ("finding-case-file", lambda: finding_case_file_preparation(
                Request({"type": "http", "query_string": b""}))),
        )
```

## Existing generator and CI precedent

Command:

```sh
sed -n '84,120p' scripts/gen_missed_meal_comparison_fixtures.py
```

Output:

```text
    return _preparation(zero_attribution=True)


def payload():
    prepared = _preparation()
    zero_prepared = _zero_attribution_preparation()
    members = prepared.members[Lever.MISSED_MEAL]
    case = prepared.case("finding:missed_meal", "event", None)
    announced_id = case["projection"]["cohorts"][2]["occurrence_ids"][0]
    return {
        "_generated_by": "scripts/gen_missed_meal_comparison_fixtures.py",
        "_note": "SYNTHETIC. Fixed invented Highs and boluses; no personal data.",
        "payload": case,
        "preparation": wrap(prepared),
        "zero_payload": zero_prepared.case("finding:missed_meal", "event", None),
        "selected_missed": prepared.case("finding:missed_meal", "event", members[0].id),
        "selected_announced": prepared.case("finding:missed_meal", "event", announced_id),
        "clock_after_announced": prepared.case(
            "finding:missed_meal", "clock", announced_id,
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(payload(), indent=1, sort_keys=True) + "\n"
    if args.check:
        if (OUT.read_text() if OUT.exists() else "") != rendered:
            print(f"stale fixture: {OUT} — rerun scripts/gen_missed_meal_comparison_fixtures.py")
            return 1
        print(f"missed-meal comparison fixture current ({OUT})")
        return 0
    OUT.write_text(rendered)
    print(f"wrote {OUT}")
    return 0
```

Command:

```sh
sed -n '64,78p' .github/workflows/ci.yml
```

Output:

```text
        run: uv run python scripts/gen_findings_projection_fixtures.py --check
      - name: Check the generated I:C history-event fixtures are current
        run: uv run python scripts/gen_ic_history_event_fixtures.py --check
      - name: Check the generated current I:C block-evidence fixtures are current
        run: uv run python scripts/gen_ic_block_evidence_fixtures.py --check
      - name: Check the generated basal-night-evidence fixtures are current
        run: uv run python scripts/gen_basal_night_evidence_fixtures.py --check
      - name: Check the generated ISF rest-window evidence fixtures are current
        run: uv run python scripts/gen_isf_rest_window_evidence_fixtures.py --check
      - name: Check the generated missed-meal comparison fixture is current
        run: uv run python scripts/gen_missed_meal_comparison_fixtures.py --check

  docs:
    name: ADR numbering guard
    runs-on: ubuntu-latest
```

## Cached-reads requirement

Command:

```sh
sed -n '44,68p' openspec/specs/http-api/spec.md
```

Output:

```text
### Requirement: The heavy read endpoints answer from one per-process result cache

Recomputing the analysis from the store costs tens of seconds, so the expensive
reads — the analysis result, scenarios, backtest, outcomes, the outcomes trend, the
per-day model view, the day navigator, the pattern sweep, the time-of-day evidence
feed, and the lever catalog — answer through a cache keyed by endpoint name plus
the parameters that change the answer. Finding case-file preparation is cached once
per data version and projects each request's coordinates from that prepared source.
Caching is opt-in per endpoint: the cheap store reads (status, timeline, pump
settings, carb entries, prompts, the Plan draft and its history, Focus, dismissals)
read the store directly on every request and are never cached.

The cache instance belongs to the app, not to the module, so two apps built in one
process (as tests do) never share state. It is bounded by a least-recently-used cap
so the date-, month-, and window-keyed entries cannot grow without limit. A miss
computes outside the lock, under a per-key single-flight lock so two concurrent
misses for the same key compute once. A compute whose data version advanced while
it ran still returns its own freshly computed value to its caller but MUST NOT be
stored — discard-on-store means "do not poison the cache," never "drop the
response."

#### Scenario: The heavy read endpoints answer from one per-process result cache

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
```

## Expected-diff paths

Command:

```sh
ls -ld ciq_autotune/analyzers/eating_sequences.py ciq_autotune/analyzers/eating_sequence_config.py tests/eating_sequence_streams.py tests/test_eating_sequences.py ciq_autotune/api.py tests/test_eating_sequences_api.py tests/test_eating_sequence_fixture.py scripts/gen_eating_sequence_fixtures.py frontend/__fixtures__/eating-sequence-report.json .github/workflows/ci.yml AGENTS.md
```

Output:

```text
ls: frontend/__fixtures__/eating-sequence-report.json: No such file or directory
ls: scripts/gen_eating_sequence_fixtures.py: No such file or directory
ls: tests/eating_sequence_streams.py: No such file or directory
ls: tests/test_eating_sequence_fixture.py: No such file or directory
ls: tests/test_eating_sequences_api.py: No such file or directory
-rw-r--r--@ 1 connor  staff  19322 Sep  4 09:51 .github/workflows/ci.yml
-rw-r--r--@ 1 connor  staff  28709 Sep  4 09:51 AGENTS.md
-rw-r--r--@ 1 connor  staff   1674 Sep  4 09:51 ciq_autotune/analyzers/eating_sequence_config.py
-rw-r--r--@ 1 connor  staff  12360 Sep  4 09:51 ciq_autotune/analyzers/eating_sequences.py
-rw-r--r--@ 1 connor  staff  81864 Sep  4 09:51 ciq_autotune/api.py
-rw-r--r--@ 1 connor  staff  10857 Sep  4 09:51 tests/test_eating_sequences.py
```
