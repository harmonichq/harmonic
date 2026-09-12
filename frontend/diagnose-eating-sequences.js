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

const SEQUENCE_LEVERS = ['high_carb_sequence', 'repeat_eating'];
const PERIOD_LABELS = { in_sequence: 'During sequence', post_4h: 'Next 4 h', post_6h: 'Next 6 h' };

export function isEatingSequence(lever) {
  return SEQUENCE_LEVERS.includes(lever);
}

/** Read the detector's chosen scope/quintile and keep every served period. */
export function eatingSequenceComparison(caseFile) {
  const report = caseFile.projection.report;
  const repeat = caseFile.finding.lever === 'repeat_eating';
  const detector = repeat ? report.repeat_eating_amplifier : report.high_carb_sequence;
  const chosen = detector.finding;
  const comparisons = detector.comparisons.filter((row) => repeat
    ? row.carb_quintile === chosen?.carb_quintile : row.scope === chosen?.scope);
  return {
    status: detector.status, finding: chosen, window: report.window,
    context: repeat ? `Carb quintile ${chosen?.carb_quintile ?? '—'}` : chosen?.scope,
    periods: comparisons.map((row) => ({
      period: row.period, label: !repeat && row.period === 'in_sequence' ? 'During eating' : PERIOD_LABELS[row.period],
      selected: row.period === chosen?.period, status: row.status,
      reference: row.reference, comparison: repeat ? row.repeat : row.high,
      referenceLabel: repeat ? `${row.reference_band} eating window` : row.reference_cohort,
      comparisonLabel: repeat ? `${row.repeat_band} eating windows` : row.high_cohort,
      tir_difference_pct_points: row.tir_difference_pct_points,
      sd_difference_mgdl: row.sd_difference_mgdl,
    })),
  };
}

const RESPONSE_PERIODS = ['in_sequence', 'post_4h', 'post_6h'];
const RESPONSE_SUPPORT = new Set(['withheld', 'limited', 'supported']);
const responseCount = (value) => Number.isInteger(value) && value >= 0;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function validResponseCohort(cohort, key, name, window) {
  if (cohort?.key !== key || cohort.name !== name
    || !responseCount(cohort.routed_count) || !responseCount(cohort.usable_count)
    || cohort.usable_count > cohort.routed_count || !RESPONSE_SUPPORT.has(cohort.support)
    || !Array.isArray(cohort.occurrence_ids) || cohort.occurrence_ids.length !== cohort.routed_count
    || !cohort.occurrence_ids.every((id) => /^o_[a-f0-9]{32}$/.test(id))
    || !Array.isArray(cohort.points)) return false;
  return cohort.points.every((point) => Number.isFinite(point?.minute)
    && point.minute >= window[0] && point.minute < window[1] && point.minute % 5 === 0
    && responseCount(point.n) && point.n <= cohort.usable_count
    && RESPONSE_SUPPORT.has(point.support)
    && (point.n === 0 || point.support === 'withheld'
      ? point.median === null && point.p25 === null && point.p75 === null
      : Number.isFinite(point.median) && Number.isFinite(point.p25) && Number.isFinite(point.p75)
        && point.p25 <= point.median && point.median <= point.p75));
}

/** Validate the additive High-carb response without admitting it as a generic event case. */
export function validHighCarbResponse(caseFile) {
  if (caseFile?.finding?.lever !== 'high_carb_sequence') return false;
  const response = caseFile.projection?.response;
  const report = caseFile.projection?.report?.high_carb_sequence;
  if (response?.schema !== 'high-carb-sequence-response-v1' || response.alignment !== 'event'
    || !same(response.anchor, { kind: 'sequence_end', label: 'End of eating sequence' })
    || !Array.isArray(response.window_min) || response.window_min.length !== 2
    || !response.window_min.every(Number.isFinite) || response.window_min[0] >= response.window_min[1]
    || !same(response.source_window, caseFile.projection.report?.window)
    || response.scope !== report?.finding?.scope || response.period !== report?.finding?.period
    || response.summary !== report?.finding?.summary
    || !Array.isArray(response.comparisons)
    || !same(response.comparisons, report?.comparisons?.filter((row) => row.scope === response.scope))
    || !same(response.comparisons.map((row) => row.period), RESPONSE_PERIODS)
    || !same(response.comparison, {
      name: 'Other sequences',
      state: response.cohorts?.[1]?.support === 'withheld' ? 'unavailable' : 'available',
    })
    || !Array.isArray(response.cohorts) || response.cohorts.length !== 2
    || !validResponseCohort(response.cohorts[0], 'matched', 'Highest-carb fifth', response.window_min)
    || !validResponseCohort(response.cohorts[1], 'comparison', 'Other sequences', response.window_min)) return false;
  return response.cohorts.every((cohort) => cohort.points.every((point, index, points) =>
    index === 0 || point.minute > points[index - 1].minute));
}

/** Present the served High-carb response to the shared event renderer without recomputing it. */
export function highCarbResponseCase(caseFile) {
  if (!validHighCarbResponse(caseFile)) throw new Error('High-carb response evidence is unavailable.');
  return { ...caseFile, projection: caseFile.projection.response };
}

/** Sequence transport has its own projection, never event-response cohorts. */
export function validEatingSequenceCase(data) {
  if (data?.schema !== 'diagnose-finding-case-file-v1' || !isEatingSequence(data?.finding?.lever)
    || data.finding.id !== `finding:${data.finding.lever}`
    || data.projection?.kind !== 'eating-sequence'
    || !['event', 'clock'].includes(data.projection.alignment)
    || data.family !== 'sequences' || data.population !== 'sequences' || data.cross_population !== false
    || typeof data.finding.title !== 'string'
    || typeof data.analysis_generation !== 'string'
    || !Array.isArray(data.occurrences)) return false;
  const count = (n) => Number.isInteger(n) && n >= 0;
  const states = ['fired', 'outranked', 'near_miss', 'no_data', 'clean'];
  const summary = data.summary;
  if (!count(summary?.claimed) || !count(summary.denominator)
    || summary.claimed > summary.denominator || summary.noun !== 'sequences'
    || data.occurrences.length !== summary.denominator
    || new Set(data.occurrences.map((row) => row.id)).size !== data.occurrences.length
    || !states.every((key) => count(data.verdict_counts?.[key]))
    || states.reduce((sum, key) => sum + data.verdict_counts[key], 0) !== summary.denominator
    || data.occurrences.filter((row) => row.attributed).length !== summary.claimed
    || !data.occurrences.every((row) => /^o_[a-f0-9]{32}$/.test(row.id)
      && states.includes(row.verdict) && typeof row.attributed === 'boolean'
      && typeof row.sequence?.id === 'string'
      && typeof row.sequence.sequence_start === 'string' && typeof row.sequence.sequence_end === 'string'
      && Number.isFinite(row.sequence.carbs) && count(row.sequence.window_count)
      && Array.isArray(row.episodes) && row.episodes.every((episode) =>
        typeof episode.start === 'string' && typeof episode.end === 'string'
        && typeof episode.attributed === 'boolean'))) return false;
  let comparison;
  try { comparison = eatingSequenceComparison(data); } catch { return false; }
  if (typeof comparison.finding?.summary !== 'string' || JSON.stringify(comparison.periods.map((row) => row.period)) !== JSON.stringify(PERIODS)
    || !comparison.periods.every((row) => PERIODS.includes(row.period)
      && ['supported', 'insufficient'].includes(row.status)
      && [row.reference, row.comparison].every((cell) => count(cell?.n)
        && ['supported', 'insufficient'].includes(cell.status)
        && ['tir_pct', 'mean_mgdl', 'sd_mgdl', 'peak_mgdl'].every((key) =>
          cell[key] === null || Number.isFinite(cell[key]))))) return false;
  const selection = data.selection;
  if (!['none', 'selected', 'unavailable'].includes(selection?.state)) return false;
  if (selection.state === 'selected') {
    const row = data.occurrences.find((item) => item.id === selection.requested_id);
    if (!row) return false;
    if (data.finding.lever === 'high_carb_sequence') {
      const { glucose, comparison_cohort, ...retained } = selection.detail || {};
      const response = data.projection.response;
      const cohort = response?.cohorts?.find((item) => item.key === comparison_cohort);
      if (!same(row, retained) || !cohort?.occurrence_ids.includes(row.id)
        || !Array.isArray(glucose) || !glucose.every((point) => typeof point?.t === 'string'
          && Number.isFinite(point.minute) && Number.isFinite(point.bg)
          && point.minute >= response.window_min[0] && point.minute < response.window_min[1])) return false;
    } else if (!same(row, selection.detail)) return false;
  }
  if (selection.state !== 'selected' && selection.detail !== null) return false;
  return data.finding.lever === 'high_carb_sequence'
    ? validHighCarbResponse(data)
    : !Object.hasOwn(data.projection, 'response');
}

/** Separate rulers for time in range (%) and glucose variability (mg/dL).
 * Points are cohort aggregates, not predicted glucose traces. */
export function eatingSequenceChartOption(caseFile, { surface = null, mini = false, palette = null } = {}) {
  const view = eatingSequenceComparison(caseFile);
  const css = (token) => typeof getComputedStyle === 'function'
    ? getComputedStyle(surface || document.documentElement).getPropertyValue(token).trim() : undefined;
  const colors = [palette?.comparison || css('--ec-comparison') || css('--secondary'),
    palette?.matched || css('--ec-matched') || css('--in-range')];
  const ink = css('--text');
  const muted = css('--muted');
  const metrics = [['tir_pct', 'Time in range · %'], ['sd_mgdl', 'Glucose SD · mg/dL']];
  const labels = view.periods.map((row) => `${row.selected ? '● ' : ''}${row.label}`);
  const active = view.periods.find((row) => row.selected);
  const names = ['reference', 'comparison'].map((key) =>
    `${active?.[`${key}Label`] || key} · n = ${active?.[key].n ?? '—'}`);
  const unavailable = view.periods.filter((row) => row.status === 'insufficient').map((row) => row.label);
  const series = metrics.flatMap(([metric], axis) => ['reference', 'comparison'].map((key, cohort) => ({
    id: `sequence:${metric}:${key}`, name: names[cohort],
    type: 'scatter', xAxisIndex: axis, yAxisIndex: axis,
    symbol: cohort ? 'circle' : 'diamond', symbolSize: mini ? 4 : 8,
    silent: mini, itemStyle: { color: colors[cohort] },
    data: view.periods.map((row, index) => ({
      value: [index, row[key][metric]], n: row[key].n,
      status: row[key].status, period: row.period, unit: axis === 0 ? '%' : 'mg/dL',
    })),
  })));
  return {
    animation: false, backgroundColor: 'transparent',
    title: mini ? [] : metrics.map(([, text], index) => ({
      text, left: index ? '56%' : 36, top: 5,
      textStyle: { color: ink, fontSize: 11, fontWeight: 500 },
    })),
    legend: { show: !mini, bottom: 32, textStyle: { color: muted, fontSize: 10 },
      data: names },
    graphic: mini ? [] : [{ type: 'text', left: 'center', bottom: 2, silent: true,
      style: { text: `${view.context} · ● ${active?.label || 'No selected comparison'}${unavailable.length ? `\nUnavailable: ${unavailable.join(', ')}` : ''}`,
        fill: muted, font: '10px Inter, system-ui, sans-serif' } }],
    grid: [0, 1].map((index) => ({
      left: mini ? (index ? '55%' : 6) : (index ? '56%' : 36),
      right: index ? (mini ? 6 : 14) : '55%', top: mini ? 6 : 30,
      bottom: mini ? 6 : 92, containLabel: false,
    })),
    xAxis: [0, 1].map((index) => ({ type: 'category', gridIndex: index, data: labels,
      axisLabel: { show: !mini, color: muted, fontSize: 9, interval: 0,
        formatter: (value) => value.replace(' sequence', '\nsequence').replace('Next ', 'Next\n') },
      axisTick: { show: false }, axisLine: { show: !mini, lineStyle: { color: css('--line') } },
    })),
    yAxis: metrics.map((_, index) => ({ type: 'value', gridIndex: index, min: 0,
      ...(index === 0 ? { max: 100 } : {}), splitNumber: 3,
      axisLabel: { show: !mini, color: muted, fontSize: 9 },
      splitLine: { show: !mini, lineStyle: { color: css('--line'), type: 'dashed' } },
    })),
    tooltip: { show: !mini, trigger: 'item', renderMode: 'richText',
      formatter: (item) => `${item.seriesName}\n${PERIOD_LABELS[item.data.period]}\n${item.data.value[1] ?? 'Unavailable'} ${item.data.unit} · n = ${item.data.n}\n${item.data.status}` },
    series,
  };
}
