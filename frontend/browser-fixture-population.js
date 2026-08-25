/* Browser-gate adapter for the server-owned Finding preparation response.
 *
 * The committed case files carry the evidence payload for every ready Finding,
 * while the fixture-only findings mirror publishes the rows and coordinates for
 * the requested window. Keep that join in one place: both browser harnesses must
 * serve the same row/header coordinate pair the real preparation endpoint does.
 */
export function populateFindingCasePreparation(preparation, projection) {
  const readyRows = new Map(preparation.rendered_rows
    .filter((row) => row.case_header?.inspectability === 'ready')
    .map((row) => [row.id, row]));

  preparation.findings = structuredClone(projection);
  preparation.rendered_rows = structuredClone(projection.rows).flatMap((row) => {
    if (row.register !== 'finding') return [row];
    const ready = readyRows.get(row.id);
    if (!ready) return [];
    return [{ ...row,
      appearances: ready.appearances,
      episodes: ready.episodes,
      evidence: ready.evidence,
      verdict_counts: ready.verdict_counts,
      verdict_counts_by_family: ready.verdict_counts_by_family,
      case_header: { ...ready.case_header, event_chart: row.event_chart },
    }];
  });
  preparation.behavioral_case_headers = Object.fromEntries(
    preparation.rendered_rows
      .filter((row) => row.case_header?.inspectability === 'ready')
      .map((row) => [row.id, row.case_header]),
  );
  return preparation;
}
