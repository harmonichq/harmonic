/* Browser-gate adapter for the server-owned Finding preparation response.
 *
 * The committed case files carry the evidence payload for every ready Finding,
 * while the fixture-only findings mirror publishes the rows and coordinates for
 * the requested window. Keep that join in one place: both browser harnesses must
 * serve the same row/header coordinate pair the real preparation endpoint does.
 */
import { findingHeadline } from '../mockups/findings-projection.mirror.mjs';

export function populateFindingCasePreparation(preparation, projection) {
  const readyRows = new Map(preparation.rendered_rows
    .filter((row) => row.case_header?.inspectability === 'ready')
    .map((row) => [row.id, row]));

  preparation.findings = structuredClone(projection);
  preparation.rendered_rows = structuredClone(projection.rows).flatMap((row) => {
    if (row.register !== 'finding') return [row];
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
