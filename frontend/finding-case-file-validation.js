export function sameFindingCaseWindow(actual, requested) {
  const scoped = requested !== null;
  return actual?.scoped === scoped
    && actual?.start_min === (scoped ? requested.start_min : null)
    && actual?.end_min === (scoped ? requested.end_min : null);
}

export function inconsistentFindingProjection(message) {
  const error = new Error(message);
  error.detail = { code: 'inconsistent_projection', message: error.message };
  throw error;
}

export function assertMatchingFindingCasePreparation(next, requested) {
  const verdicts = ['fired', 'outranked', 'near_miss', 'no_data', 'clean'];
  const validCount = (value) => Number.isInteger(value) && value >= 0;
  const validSummary = (summary) => validCount(summary?.claimed)
    && validCount(summary.denominator) && summary.claimed <= summary.denominator
    && typeof summary.noun === 'string';
  const validCounts = (counts, denominator) => counts
    && verdicts.every((key) => validCount(counts[key]))
    && verdicts.reduce((sum, key) => sum + counts[key], 0) === denominator;
  const validHeader = (header, findingId) => header?.finding_id === findingId
    && header.inspectability === 'ready'
    && typeof header.lever === 'string' && typeof header.title === 'string'
    && typeof header.family === 'string' && validSummary(header.summary)
    && validCounts(header.verdict_counts, header.summary.denominator);
  const sameHeader = (left, right) => left.finding_id === right.finding_id
    && left.inspectability === right.inspectability && left.lever === right.lever
    && left.title === right.title && left.family === right.family
    && left.summary.claimed === right.summary.claimed
    && left.summary.denominator === right.summary.denominator
    && left.summary.noun === right.summary.noun
    && verdicts.every((key) => left.verdict_counts[key] === right.verdict_counts[key]);
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
      return validHeader(header, row.id) && validHeader(mapped, row.id)
        && sameHeader(header, mapped);
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
