/* ========================================================================
   #277 EATING-SEQUENCE EVIDENCE ADAPTER — served aggregate selections.

   The report owns all aggregation and judgment. This Vue-free adapter only
   groups its served rows and selects one fixed chart coordinate at a time.
   ======================================================================== */

const PERIODS = ['in_sequence', 'post_4h', 'post_6h'];
const SCOPES = ['pooled', 'evening'];
const TRAJECTORY_METRICS = ['tir_pct', 'mean_mgdl', 'sd_mgdl'];
const MATRIX_METRICS = ['tir_pct', 'sd_mgdl'];
const QUINTILES = [1, 2, 3, 4, 5];
const BANDS = ['1', '2', '3+'];

function selectAggregate(aggregate) {
  const { status, n, tir_pct, mean_mgdl, sd_mgdl, peak_mgdl } = aggregate;
  return { status, n, tir_pct, mean_mgdl, sd_mgdl, peak_mgdl };
}

function selectQuintileRow(row) {
  const { quintile, sequence_n } = row;
  return {
    quintile,
    sequence_n,
    in_sequence: selectAggregate(row.in_sequence),
    post_4h: selectAggregate(row.post_4h),
    post_6h: selectAggregate(row.post_6h),
  };
}

function selectScope(scope) {
  return {
    boundaries_g: scope.boundaries_g,
    rows: scope.rows.map(selectQuintileRow),
  };
}

function selectMatrixRow(row) {
  const { carb_quintile, window_count_band } = row;
  return {
    carb_quintile,
    window_count_band,
    in_sequence: selectAggregate(row.in_sequence),
    post_4h: selectAggregate(row.post_4h),
    post_6h: selectAggregate(row.post_6h),
  };
}

function selectHighComparison(row) {
  return { ...row, reference: selectAggregate(row.reference), high: selectAggregate(row.high) };
}

function selectRepeatComparison(row) {
  return { ...row, reference: selectAggregate(row.reference), repeat: selectAggregate(row.repeat) };
}

/** Reshape the served report into its fixed Diagnose aggregate-evidence shape. */
export function adaptEatingSequenceReport(report) {
  const high = report.high_carb_sequence;
  const repeat = report.repeat_eating_amplifier;
  return {
    schema: report.schema,
    window: report.window,
    definitions: report.definitions,
    highCarb: {
      status: high.status,
      finding: high.finding,
      exclusions: high.exclusions,
      scopes: {
        pooled: selectScope(high.scopes.pooled),
        evening: selectScope(high.scopes.evening),
      },
      comparisons: high.comparisons.map(selectHighComparison),
    },
    repeat: {
      status: repeat.status,
      finding: repeat.finding,
      exclusions: repeat.exclusions,
      matrix: repeat.matrix.map(selectMatrixRow),
      comparisons: repeat.comparisons.map(selectRepeatComparison),
    },
  };
}

/** Select one served high-carb trajectory metric for the fixed three periods. */
export function trajectorySeries(adapted, { scope, metric }) {
  if (!SCOPES.includes(scope) || !TRAJECTORY_METRICS.includes(metric)) {
    throw new Error('Unknown eating-sequence trajectory selector.');
  }
  const selected = adapted.highCarb.scopes[scope];
  return {
    periods: PERIODS,
    boundaries_g: selected.boundaries_g,
    series: QUINTILES.map((quintile) => {
      const row = selected.rows.find((candidate) => candidate.quintile === quintile);
      return {
        quintile: row.quintile,
        sequence_n: row.sequence_n,
        points: PERIODS.map((period) => {
          const aggregate = row[period];
          return {
            period,
            value: aggregate.status === 'insufficient' ? null : aggregate[metric],
            n: aggregate.n,
            status: aggregate.status,
          };
        }),
      };
    }),
  };
}

/** Select one served repeat-eating matrix metric for the fixed three bands. */
export function matrixSeries(adapted, { period, metric }) {
  if (!PERIODS.includes(period) || !MATRIX_METRICS.includes(metric)) {
    throw new Error('Unknown eating-sequence matrix selector.');
  }
  return {
    quintiles: QUINTILES,
    series: BANDS.map((band) => ({
      band,
      cells: QUINTILES.map((quintile) => {
        const row = adapted.repeat.matrix.find((candidate) => (
          candidate.carb_quintile === quintile && candidate.window_count_band === band
        ));
        const aggregate = row[period];
        const comparison = band === '3+'
          ? adapted.repeat.comparisons.find((candidate) => (
            candidate.carb_quintile === quintile && candidate.period === period
          ))
          : null;
        return {
          quintile,
          value: aggregate.status === 'insufficient' ? null : aggregate[metric],
          n: aggregate.n,
          status: aggregate.status,
          comparison,
        };
      }),
    })),
  };
}
