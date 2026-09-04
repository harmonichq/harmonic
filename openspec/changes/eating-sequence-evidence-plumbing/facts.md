# Generated facts — #277 revised plan inputs

Regenerated on this checkout after the revised plan files. Commands below are the
source of these facts; rerun them after implementation, never edit their output.

## Current report comparison contracts

```sh
sed -n '133,188p' ciq_autotune/analyzers/eating_sequences.py
sed -n '326,368p' ciq_autotune/analyzers/eating_sequences.py
sed -n '375,390p' ciq_autotune/analyzers/eating_sequences.py
```

Output:

```text
@dataclass(frozen=True)
class HighCarbComparisonRow:
    """A Q5-minus-Q1–Q4 comparison for one scope and interval."""

    scope: str
    period: str
    status: str
    reference_n: int
    high_n: int
    tir_difference_pct_points: Optional[float]
    mean_difference_mgdl: Optional[float]
    sd_difference_mgdl: Optional[float]
    reference_cohort: str = "Q1-Q4"
    high_cohort: str = "Q5"

    def to_dict(self) -> dict:
        return {
            "scope": self.scope,
            "period": self.period,
            "reference_cohort": self.reference_cohort,
            "high_cohort": self.high_cohort,
            **_comparison_dict(self),
        }


@dataclass(frozen=True)
class RepeatComparisonRow:
    """A 3+-minus-1 window-count comparison for one quintile and interval."""

    carb_quintile: int
    period: str
    status: str
    reference_n: int
    repeat_n: int
    tir_difference_pct_points: Optional[float]
    mean_difference_mgdl: Optional[float]
    sd_difference_mgdl: Optional[float]
    reference_band: str = "1"
    repeat_band: str = "3+"

    def to_dict(self) -> dict:
        return {
            "carb_quintile": self.carb_quintile,
            "period": self.period,
            "reference_band": self.reference_band,
            "repeat_band": self.repeat_band,
            "status": self.status,
            "reference_n": self.reference_n,
            "repeat_n": self.repeat_n,
            "tir_difference_pct_points": self.tir_difference_pct_points,
            "mean_difference_mgdl": self.mean_difference_mgdl,
            "sd_difference_mgdl": self.sd_difference_mgdl,
        }


@dataclass(frozen=True)
def empty_report(window: SourceWindow, *, config: EatingSequenceConfig | None = None) -> EatingSequenceReport:
    """Return the complete all-insufficient report for an empty source window."""
    config = config or EatingSequenceConfig()
    aggregate = IntervalAggregate("insufficient", 0, None, None, None, None)
    quintile_rows = tuple(
        QuintileRow(quintile, 0, aggregate, aggregate, aggregate)
        for quintile in range(1, config.quintile_count + 1)
    )
    scope = QuintileScope((None, None, None, None), quintile_rows)
    exclusions = {"cgm_coverage": 0, "carb_log_contamination": 0, "next_sequence_overlap": 0}
    high_comparisons = tuple(
        HighCarbComparisonRow(scope_name, period, "insufficient", 0, 0, None, None, None)
        for scope_name in _SCOPES for period in _PERIODS
    )
    matrix = tuple(
        MatrixRow(quintile, band, aggregate, aggregate, aggregate)
        for quintile in range(1, config.quintile_count + 1)
        for band in config.window_count_bands
    )
    repeat_comparisons = tuple(
        RepeatComparisonRow(quintile, period, "insufficient", 0, 0, None, None, None,
                            config.window_count_bands[0], config.window_count_bands[-1])
        for quintile in range(1, config.quintile_count + 1)
        for period in _PERIODS
    )
    return EatingSequenceReport(
        window, config,
        HighCarbSequenceReport("insufficient", None, scope, scope, high_comparisons, exclusions),
        RepeatEatingAmplifierReport("insufficient", None, matrix, repeat_comparisons, exclusions),
    )


def report_dict(report: EatingSequenceReport) -> dict:
    """Serialize an eating-sequence report to plain JSON-compatible data."""
    return report.to_dict()


to_dict = report_dict


@dataclass(frozen=True)
class EatingSequence:
    """One chained eating-window sequence consumed by this report and #276."""
@dataclass(frozen=True)
class _ComparedCohorts:
    row: HighCarbComparisonRow
    reference: IntervalAggregate
    high: IntervalAggregate


@dataclass(frozen=True)
class _ComparedRepeatCohorts:
    row: RepeatComparisonRow
    reference: IntervalAggregate
    repeat: IntervalAggregate


def build_report(
    boluses: Sequence[BolusEvent], cgm: Sequence[CgmReading], carb_log: Sequence[CarbEntry], *,
```

## Fixture generator and current first comparison

```sh
sed -n '20,36p' scripts/gen_eating_sequence_fixtures.py
python3 -c 'import json; r=json.load(open("frontend/__fixtures__/eating-sequence-report.json")); print(r["high_carb_sequence"]["comparisons"][0])'
```

Output:

```text
def payload() -> dict:
    """Build a populated report from the shared manufactured stream."""
    boluses, cgm, carb_log, _ = repeat_eating_stream()
    end = cgm[-1].t
    report = build_report(
        boluses, cgm, carb_log,
        window_start=end - timedelta(days=30), window_end=end,
        config=EatingSequenceConfig(),
    )
    return {
        "_generated_by": "scripts/gen_eating_sequence_fixtures.py",
        "_note": "SYNTHETIC. Fixed invented eating sequences; no personal data.",
        **report_dict(report),
    }


def main() -> int:
{'high_cohort': 'Q5', 'high_n': 16, 'mean_difference_mgdl': 50.2, 'period': 'in_sequence', 'reference_cohort': 'Q1-Q4', 'reference_n': 64, 'scope': 'pooled', 'sd_difference_mgdl': 0.0, 'status': 'supported', 'tir_difference_pct_points': -50.0}
```

## Frontend precedents

```sh
rg -n 'fetchExploreTimeOfDay' frontend/data.js
sed -n '15,36p' frontend/diagnose-workstation-data.js
sed -n '19,37p' frontend/diagnose-data-age.js
sed -n '5324,5350p' frontend/index.html
sed -n '33,42p' harness/stories.js
```

Output:

```text
36: *             fetchTimeline, fetchVerifyTrials, fetchExploreTimeOfDay, fetchAuditDismissals, dismissAuditItem, loadPlan, savePlanDraft,
221:  function fetchExploreTimeOfDay() { return api('/api/explore/time-of-day'); }
466:    fetchExploreTimeOfDay,
514:export const fetchExploreTimeOfDay = _defaults.fetchExploreTimeOfDay;
/** The mock's `buildEnvelope()` return, rebuilt from the server's pooled feed.
 *
 *  The mock pools 30 days of raw CGM in the browser. The app pools server-side
 *  (`/api/explore/time-of-day` → `pooled`) and never ships the raw readings, so this
 *  renames the server's bins onto the arrays the chart module already indexes.
 *  Field-for-field, no arithmetic: median→p50, n→counts, raw_n→raw. */
export function envelopeFromPooled(pooled) {
  const bins = pooled?.bins || [];
  const col = (key) => bins.map((bin) => (bin[key] == null ? null : bin[key]));
  return {
    labels: bins.map((bin) => hhmm(bin.minute)),
    p10: col('p10'),
    p25: col('p25'),
    p50: col('median'),
    p75: col('p75'),
    p90: col('p90'),
    counts: bins.map((bin) => bin.n || 0),
    raw: bins.map((bin) => bin.raw_n || 0),
    readings: pooled?.reading_count || 0,
    days: pooled?.captured_days || 0,
    pool: pooled?.pool_minutes ?? 45,
  };
    && wallClock(value.covers_to)
    && (!Object.hasOwn(value, 'newest_covers_to') || wallClock(value.newest_covers_to));
}

export function recordDiagnoseAge(ages, shape, payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    delete ages[shape];
    return null;
  }
  if (!Object.hasOwn(payload, 'input_data_age')) {
    delete ages[shape];
    return payload;
  }
  if (!validInputDataAge(payload.input_data_age)) {
    delete ages[shape];
    return null;
  }
  ages[shape] = payload.input_data_age;
  const { input_data_age, ...display } = payload;
        async function loadAudit() {
          if (!hasToken.value || diagnoseLoaded) return;
          diagnoseLoaded = true;
          resetDiagnoseAges(diagnoseAges.value);
          try {
            // Keep cacheable fixed arrivals aligned with api.py's invalidate_and_warm.
            const [a, s, e, x, p, o] = await Promise.all([
              enqueue(() => dataFetchAnalysis({ window: 30, pool: true })),
              enqueue(() => dataFetchScenarios(30)),
              enqueue(() => dataFetchExploreTimeOfDay()),
              enqueue(() => dataFetchExploreExposures()),
              // the GLOBAL queue — the unscoped 24 h list the surface opens on
              enqueue(() => dataFetchDiagnoseFindingCasePreparation(null)),
              // the dock's object; the trend payload is where the one-active
              // invariant is already resolved, so nothing is re-derived here
              enqueue(() => dataFetchOutcomesTrend(30)),
            ]);
            const displays = [
              recordDiagnoseAge(diagnoseAges.value, 'analysis', a),
              recordDiagnoseAge(diagnoseAges.value, 'scenarios', s),
              recordDiagnoseAge(diagnoseAges.value, 'time_of_day', e),
              recordDiagnoseAge(diagnoseAges.value, 'exposures', x),
              recordDiagnoseAge(diagnoseAges.value, 'trend', o),
            ];
            if (displays.some((payload) => payload === null)) {
              throw new Error('Diagnose received invalid input-data age.');
            }
async function drawWorkstation(host, state, story) {
  const slot = story.id === 'basal' ? basalSlot(state.slot) : null;
  const [analyze, scenarios, evidence, exposures, preparation, outcomes] = await Promise.all([
    request('/api/analyze?window=30&pool=1'),
    request('/api/scenarios?window=30'),
    request('/api/explore/time-of-day'),
    request('/api/explore/exposures'),
    request('/api/diagnose/finding-case-file-preparation'),
    request('/api/outcomes?window=30'),
  ]);
```

## Expected-diff paths

```sh
for p in openspec/changes/eating-sequence-evidence-plumbing ciq_autotune/analyzers/eating_sequences.py tests/test_eating_sequences.py frontend/__fixtures__/eating-sequence-report.json frontend/data.js frontend/diagnose-eating-sequences.js frontend/diagnose-eating-sequences.test.js frontend/diagnose-data-age.test.js; do test -e "$p" && echo "present $p" || echo "absent $p"; done
```

```text
present openspec/changes/eating-sequence-evidence-plumbing
present ciq_autotune/analyzers/eating_sequences.py
present tests/test_eating_sequences.py
present frontend/__fixtures__/eating-sequence-report.json
present frontend/data.js
absent frontend/diagnose-eating-sequences.js
absent frontend/diagnose-eating-sequences.test.js
present frontend/diagnose-data-age.test.js
```
