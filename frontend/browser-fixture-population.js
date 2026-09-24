/* Browser-gate adapter for the server-owned Finding preparation response.
 *
 * The committed case files carry the evidence payload for every ready Finding,
 * while the fixture-only findings mirror publishes the rows and coordinates for
 * the requested window. Keep that join in one place: both browser harnesses must
 * serve the same row/header coordinate pair the real preparation endpoint does.
 */
import { readFileSync } from 'node:fs';

import { findingHeadline } from '../mockups/findings-projection.mirror.mjs';
import { projectPatternCaseFile } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';

const findingsFixture = JSON.parse(readFileSync(new URL(
  './__fixtures__/findings-projection.json', import.meta.url), 'utf8'));
const defaultPatternCapture = JSON.parse(readFileSync(new URL(
  '../mockups/diagnose-event-comparison.synthetic/capture.json', import.meta.url), 'utf8'));

/** The frozen browser analysis, scenarios and analysis generation (ADR 454): the
 * inputs every browser roster, window and case was built from. The desk suite
 * serves them from its `/api/analyze` and `/api/scenarios` stubs, so every desk
 * read shares one input, as in the app. */
export const BROWSER_INPUTS = findingsFixture.browser_inputs;

/** The server input every browser-gate mirror call projects (ADR 454): the frozen
 * browser inputs and Pattern rosters (the whole day's and each narrowed window's the
 * browser checks request), with only the exposures taken from the caller. The test
 * desk's queue is then the server's own, in the server's order. */
export function populateFindingsProjectionInput({ exposures }) {
  const { analysis, scenarios, analysis_generation } = BROWSER_INPUTS;
  return {
    analysis: structuredClone(analysis),
    exposures,
    scenarios: structuredClone(scenarios),
    analysis_generation,
    outcome_patterns: structuredClone(findingsFixture.browser_outcome_patterns),
    outcome_patterns_by_window: structuredClone(findingsFixture.browser_outcome_patterns_by_window),
  };
}

export function populateFindingCasePreparation(
  preparation, projection, patternCapture = defaultPatternCapture,
) {
  const readyRows = new Map(preparation.rendered_rows
    .filter((row) => row.case_header?.inspectability === 'ready')
    .map((row) => [row.id, row]));

  preparation.findings = structuredClone(projection);
  preparation.rendered_rows = structuredClone(projection.rows).flatMap((row) => {
    if (row.register !== 'finding') return [row];
    if (row.kind === 'pattern') {
      if (!row.pattern_chart) return [row];
      const caseFile = projectPatternCaseFile(patternCapture, {
        patternChart: row.pattern_chart, projectionId: preparation.projection_id,
      });
      if (!caseFile) throw new Error(`chartable Pattern fixture has no case: ${row.id}`);
      const header = {
        finding_id: row.id, lever: row.pattern.key, title: row.title,
        family: caseFile.family, summary: caseFile.summary,
        verdict_counts: caseFile.verdict_counts, inspectability: 'ready',
        pattern_chart: structuredClone(row.pattern_chart),
      };
      return [{ ...row, case_header: header }];
    }
    const ready = readyRows.get(row.id);
    if (!ready) return [];
    /* The preparation owns its own event coordinate: `finding_case_file.wrap`
       stamps the row's `event_chart` FROM the case header, never from the
       separate findings projection. Taking the queue row's coordinate here made
       the harness publish `null` for a case the preparation holds — and a
       replacement window whose projection drops the family would strip the
       retained case file's By-event path, which the real endpoint never does. */
    const coordinate = ready.case_header.event_chart && {
      lever: ready.case_header.event_chart.lever,
      window: structuredClone(preparation.coordinates.window),
    };
    /* `finding_case_file.wrap` leads the rendered row with the case file's own
       family at the case file's counts, keeps every other family the projection
       published at the projection's counts, and composes the row's headline
       from that lead. The capture holds the case-file population; the other
       families' counts are window-dependent, so they come from the row the
       mirror just projected for the requested window. */
    const anchored = ready.case_header.family;
    const wrapped = { ...row,
      appearances: [
        ...ready.appearances.filter((appearance) => appearance.family === anchored),
        ...row.appearances.filter((appearance) => appearance.family !== anchored),
      ],
      episodes: ready.episodes,
      evidence: ready.evidence,
      verdict_counts: ready.verdict_counts,
      verdict_counts_by_family: ready.verdict_counts_by_family,
      event_chart: coordinate,
      case_header: { ...ready.case_header, event_chart: coordinate },
    };
    return [{ ...wrapped, headline: findingHeadline(wrapped) }];
  });
  preparation.behavioral_case_headers = Object.fromEntries(
    preparation.rendered_rows
      .filter((row) => row.case_header?.inspectability === 'ready')
      .map((row) => [row.id, row.case_header]),
  );
  return preparation;
}
