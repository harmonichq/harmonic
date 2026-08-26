export function sameFindingCaseWindow(actual, requested) {
  const scoped = requested !== null;
  return actual?.scoped === scoped
    && actual?.start_min === (scoped ? requested.start_min : null)
    && actual?.end_min === (scoped ? requested.end_min : null);
}

const sameWindow = (left, right) => left?.scoped === right?.scoped
  && left?.start_min === right?.start_min && left?.end_min === right?.end_min
  && left?.label === right?.label;

export function inconsistentFindingProjection(message) {
  const error = new Error(message);
  error.detail = { code: 'inconsistent_projection', message: error.message };
  throw error;
}

const FINDING_VERDICTS = ['fired', 'outranked', 'near_miss', 'no_data', 'clean'];
const OCCURRENCE_ID = /^o_[0-9a-f]{32}$/;
const ANNOUNCED_MEAL_ID = /^m_[0-9a-f]{32}$/;
const SUPPORT = new Set(['withheld', 'limited', 'supported']);

const validCount = (value) => Number.isInteger(value) && value >= 0;
const validNumberOrNull = (value) => value === null || Number.isFinite(value);
const validAnchor = (anchor) => typeof anchor?.t === 'string'
  && typeof anchor.kind === 'string' && typeof anchor.label === 'string'
  && validNumberOrNull(anchor.bg);
const validCohort = (cohort, identity) => validCount(cohort?.routed_count)
  && validCount(cohort.usable_count) && cohort.usable_count <= cohort.routed_count
  && SUPPORT.has(cohort.support)
  && Array.isArray(cohort.occurrence_ids)
  && cohort.routed_count === cohort.occurrence_ids.length
  && cohort.occurrence_ids.every(identity) && Array.isArray(cohort.points)
  && cohort.points.every((point) => {
    if (!Number.isFinite(point?.minute) || !validCount(point.n)
      || point.n > cohort.usable_count || !SUPPORT.has(point.support)) return false;
    const aggregatesAreNull = point.median === null
      && point.p25 === null && point.p75 === null;
    if (point.n === 0 || point.support === 'withheld') return aggregatesAreNull;
    return Number.isFinite(point.median) && Number.isFinite(point.p25)
      && Number.isFinite(point.p75) && point.p25 <= point.median
      && point.median <= point.p75;
  })
  && (cohort.routed_count !== 0 || (cohort.support === 'withheld'
    && cohort.points.every((point) => point.n === 0 && point.support === 'withheld')
    && (cohort.episodes === undefined
      || (Array.isArray(cohort.episodes) && cohort.episodes.length === 0))));
const fixedMinutes = (window) => Array.from(
  { length: ((window[1] - window[0]) / 5) + 1 }, (_, index) => window[0] + (index * 5),
);

export function validFindingCaseFile(caseFile) {
  const counts = caseFile?.verdict_counts;
  const occurrences = caseFile?.occurrences;
  const projection = caseFile?.projection;
  const selection = caseFile?.selection;
  if (!caseFile?.finding || typeof caseFile.finding.lever !== 'string'
    || typeof caseFile.finding.title !== 'string' || typeof caseFile.family !== 'string'
    || typeof caseFile.cross_population !== 'boolean' || typeof caseFile.population !== 'string'
    || !validCount(caseFile?.summary?.claimed) || !validCount(caseFile?.summary?.denominator)
    || caseFile.summary.claimed > caseFile.summary.denominator
    || typeof caseFile.summary.noun !== 'string'
    || !counts || !FINDING_VERDICTS.every((key) => validCount(counts[key]))
    || FINDING_VERDICTS.reduce((sum, key) => sum + counts[key], 0)
      !== caseFile.summary.denominator
    || !Array.isArray(occurrences) || occurrences.length !== caseFile.summary.denominator
    || !occurrences.every((row) => OCCURRENCE_ID.test(row?.id || '')
      && typeof row.date === 'string' && FINDING_VERDICTS.includes(row.verdict)
      && validAnchor(row.anchor))) return false;

  const roster = new Map(occurrences.map((row) => [row.id, row]));
  if (roster.size !== occurrences.length) return false;
  const missedMeal = caseFile.finding.lever === 'missed_meal';
  const attributedIds = missedMeal ? occurrences.filter((row) => row.attributed)
    .map((row) => row.id) : [];
  if (missedMeal && (!occurrences.every((row) => typeof row.attributed === 'boolean'
    && (row.attributed
      ? row.verdict === 'fired' && validAnchor(row.comparison_anchor)
        && row.comparison_anchor.kind === 'detected_rise_onset'
        && row.comparison_anchor.label === 'Detected rise onset'
        && Number.isFinite(row.comparison_anchor.bg)
      : row.comparison_anchor === null))
    || attributedIds.length !== caseFile.summary.claimed)) return false;

  if (projection?.alignment === 'clock') {
    const clock = projection.clock;
    if (projection.anchor !== null || projection.window_min !== null
      || !Array.isArray(projection.cohorts) || projection.cohorts.length !== 0
      || !validCount(clock?.total) || clock.total !== caseFile.summary.claimed
      || !validCount(clock?.peak_bucket_index) || clock.peak_bucket_index >= 12
      || !Array.isArray(clock?.buckets) || clock.buckets.length !== 12
      || !clock.buckets.every((bucket) => validCount(bucket?.n)
        && Number.isFinite(bucket.start_min) && Number.isFinite(bucket.end_min)
        && Array.isArray(bucket.occurrence_ids)
        && bucket.n === bucket.occurrence_ids.length
        && bucket.occurrence_ids.every((id) => roster.has(id)
          && (!missedMeal || roster.get(id).attributed)))
      || clock.buckets.reduce((sum, bucket) => sum + bucket.n, 0) !== clock.total) return false;
    const clockIds = clock.buckets.flatMap((bucket) => bucket.occurrence_ids);
    if (new Set(clockIds).size !== clockIds.length) return false;
  } else if (projection?.alignment === 'event') {
    const cohorts = projection.cohorts;
    if (typeof projection.anchor?.kind !== 'string'
      || typeof projection.anchor?.label !== 'string'
      || !Array.isArray(projection.window_min) || projection.window_min.length !== 2
      || !projection.window_min.every(Number.isFinite)
      || projection.clock !== null || !Array.isArray(cohorts)) return false;

    const [matched, near, comparison] = cohorts;
    const counts = projection.counts;
    const crossPopulation = caseFile.cross_population;
    const expectedMinutes = JSON.stringify(fixedMinutes(projection.window_min));
    const hasSharedAxis = cohorts.every((cohort) => (
      JSON.stringify(cohort.points.map((point) => point.minute)) === expectedMinutes
    ));
    if (cohorts.length !== 3 || matched?.key !== 'matched' || near?.key !== 'nearly_matched'
      || comparison?.key !== 'comparison' || matched?.name !== 'Matched'
      || near?.name !== 'Nearly matched' || typeof comparison?.name !== 'string'
      || projection?.comparison?.name !== comparison.name
      || !['available', 'unavailable'].includes(projection?.comparison?.state)
      || !validCohort(matched, (id) => OCCURRENCE_ID.test(id))
      || !validCohort(near, (id) => OCCURRENCE_ID.test(id))
      || !validCohort(comparison, (id) => OCCURRENCE_ID.test(id)
        || (crossPopulation && caseFile.population === 'highs' && ANNOUNCED_MEAL_ID.test(id)))
      || !validCount(counts?.matched) || !validCount(counts.nearly_matched)
      || !validCount(counts.comparison) || !validCount(counts.not_comparable)
      || counts.matched !== matched.routed_count || counts.nearly_matched !== near.routed_count
      || counts.comparison !== comparison.routed_count
      || counts.matched + counts.nearly_matched + counts.not_comparable
        !== caseFile.summary.denominator
      || (projection.comparison.state === 'unavailable') !== (comparison.support === 'withheld')
      || !hasSharedAxis) return false;
    const memberIds = new Set([...matched.occurrence_ids, ...near.occurrence_ids]);
    if (memberIds.size !== matched.routed_count + near.routed_count
      || matched.occurrence_ids.some((id) => roster.get(id)?.verdict !== 'fired')
      || near.occurrence_ids.some((id) => roster.get(id)?.verdict !== 'near_miss')
      || [...memberIds].some((id) => !roster.has(id))) return false;
    if (missedMeal && JSON.stringify(matched.occurrence_ids.slice().sort())
      !== JSON.stringify(attributedIds.slice().sort())) return false;
    if (missedMeal && (matched.anchor?.kind !== 'detected_rise_onset'
      || matched.anchor?.label !== 'Detected rise onset'
      || near.anchor?.kind !== 'detected_rise_onset'
      || near.anchor?.label !== 'Detected rise onset'
      || comparison.anchor?.kind !== 'completed_carb_bolus'
      || comparison.anchor?.label !== 'Completed carb bolus')) return false;
    if (!crossPopulation) {
      const partition = new Set([...memberIds, ...comparison.occurrence_ids]);
      if (partition.size !== caseFile.summary.denominator
        || [...partition].some((id) => !roster.has(id))) return false;
    }
  } else return false;

  if (!selection || !['none', 'selected', 'unavailable'].includes(selection.state)) return false;
  if (selection.state === 'selected') {
    const detail = selection.detail;
    const activeIds = new Set(projection.alignment === 'event'
      ? projection.cohorts.flatMap((cohort) => cohort.occurrence_ids)
      : occurrences.map((row) => row.id));
    const selectedRosterRow = roster.get(detail?.id);
    const comparisonSelection = projection.alignment === 'event'
      && detail?.comparison_cohort === 'comparison'
      && detail?.verdict === 'comparison'
      && detail?.anchor?.kind === 'completed_carb_bolus'
      && detail.anchor.label === 'Completed carb bolus'
      && projection?.cohorts?.[2]?.occurrence_ids?.includes(detail.id);
    const missedSelection = missedMeal && projection.alignment === 'event'
      && detail?.comparison_cohort === 'matched'
      && detail?.verdict === 'fired' && detail?.anchor?.kind === 'detected_rise_onset'
      && detail.anchor.label === 'Detected rise onset'
      && selectedRosterRow?.attributed
      && projection?.cohorts?.[0]?.occurrence_ids?.includes(detail.id)
      && JSON.stringify(detail.anchor) === JSON.stringify(selectedRosterRow.comparison_anchor)
      && detail.date === detail.anchor.t.slice(0, 10)
      && detail.day_target?.date === detail.date
      && detail.glucose?.some((point) => point.minute === 0
        && point.bg === detail.anchor.bg);
    const nearSelection = missedMeal && projection.alignment === 'event'
      && detail?.comparison_cohort === 'nearly_matched'
      && detail?.verdict === 'near_miss' && detail?.anchor?.kind === 'detected_rise_onset'
      && projection?.cohorts?.[1]?.occurrence_ids?.includes(detail.id);
    const fixedComparisonDetail = !missedMeal || projection.alignment !== 'event'
      || ((comparisonSelection || missedSelection || nearSelection)
        && detail.date === detail.anchor.t.slice(0, 10)
        && detail.day_target?.date === detail.date
        && Array.isArray(detail.glucose)
        && detail.glucose.every((point) => point.minute >= -60 && point.minute <= 300)
        && Array.isArray(detail.markers)
        && detail.markers.every((marker) => marker.minute >= -60 && marker.minute <= 300));
    if (!detail || detail.id !== selection.requested_id
      || !activeIds.has(detail.id)
      || typeof detail.date !== 'string' || !validAnchor(detail.anchor)
      || !(FINDING_VERDICTS.includes(detail.verdict) || comparisonSelection)
      || !Array.isArray(detail.glucose)
      || !detail.glucose.every((point) => typeof point?.t === 'string'
        && Number.isFinite(point.minute) && Number.isFinite(point.bg))
      || !Array.isArray(detail.markers)
      || !detail.markers.every((marker) => typeof marker?.kind === 'string'
        && typeof marker.t === 'string' && Number.isFinite(marker.minute))
      || !Array.isArray(detail.source_corrections)
      || !detail.source_corrections.every((dose) => typeof dose?.t === 'string'
        && Number.isFinite(dose.insulin))
      || typeof detail.day_target?.date !== 'string'
      || !fixedComparisonDetail
      || (missedMeal && projection.alignment === 'event'
        ? !(comparisonSelection || missedSelection || nearSelection)
        : !occurrences.some((row) => row.id === detail.id
        && row.date === detail.date && row.verdict === detail.verdict
        && JSON.stringify(row.anchor) === JSON.stringify(detail.anchor)))) return false;
  } else if (selection.detail !== null) return false;
  return true;
}

export function assertMatchingFindingCasePreparation(next, requested) {
  const validSummary = (summary) => validCount(summary?.claimed)
    && validCount(summary.denominator) && summary.claimed <= summary.denominator
    && typeof summary.noun === 'string';
  const validCounts = (counts, denominator) => counts
    && FINDING_VERDICTS.every((key) => validCount(counts[key]))
    && FINDING_VERDICTS.reduce((sum, key) => sum + counts[key], 0) === denominator;
  const validEventChart = (eventChart, lever, window) => eventChart === null
    || (typeof eventChart === 'object' && !Array.isArray(eventChart)
      && eventChart.lever === lever && sameWindow(eventChart.window, window));
  const validHeader = (header, findingId, window) => header?.finding_id === findingId
    && header.inspectability === 'ready'
    && typeof header.lever === 'string' && typeof header.title === 'string'
    && typeof header.family === 'string' && validSummary(header.summary)
    && validCounts(header.verdict_counts, header.summary.denominator)
    && validEventChart(header.event_chart, header.lever, window);
  const sameHeader = (left, right) => left.finding_id === right.finding_id
    && left.inspectability === right.inspectability && left.lever === right.lever
    && left.title === right.title && left.family === right.family
    && left.summary.claimed === right.summary.claimed
    && left.summary.denominator === right.summary.denominator
    && left.summary.noun === right.summary.noun
    && left.event_chart?.lever === right.event_chart?.lever
    && sameWindow(left.event_chart?.window, right.event_chart?.window)
    && FINDING_VERDICTS.every((key) => left.verdict_counts[key] === right.verdict_counts[key]);
  const renderedRows = next?.rendered_rows;
  const headers = next?.behavioral_case_headers;
  const readyFindingRows = Array.isArray(renderedRows)
    && renderedRows.filter((row) => row?.register === 'finding');
  const readyFindingIds = Array.isArray(readyFindingRows)
    ? new Set(readyFindingRows.map((row) => row.id)) : new Set();
  const validReadyRows = Array.isArray(readyFindingRows)
    && readyFindingIds.size === readyFindingRows.length
    && Object.keys(headers || {}).length === readyFindingRows.length
    && readyFindingRows.every((row) => {
      const header = row.case_header;
      const mapped = headers?.[row.id];
      return validHeader(header, row.id, next.coordinates?.window)
        && validHeader(mapped, row.id, next.coordinates?.window)
        && sameHeader(header, mapped)
        && row.event_chart?.lever === header.event_chart?.lever
        && sameWindow(row.event_chart?.window, header.event_chart?.window);
  });
  if (next?.schema !== 'diagnose-finding-case-file-preparation-v1'
    || (next?.findings?.schema !== 'diagnose-findings-v1'
      && next?.findings?.schema !== 'diagnose-findings-v2')
    || !Array.isArray(next?.findings?.rows)
    || !Number.isInteger(next?.coordinates?.source_window_days)
    || next.coordinates.source_window_days <= 0
    || !Array.isArray(renderedRows)
    || !headers || typeof headers !== 'object' || Array.isArray(headers)
    || !Array.isArray(next?.withheld_findings)
    || !validReadyRows
    || !/^fp_[0-9a-f]{32}$/.test(next?.projection_id || '')
    || !sameFindingCaseWindow(next?.coordinates?.window, requested)
    || !sameFindingCaseWindow(next?.findings?.window, requested)) {
    inconsistentFindingProjection(
      'The Finding preparation did not match the requested window.',
    );
  }
  return next;
}
