/* EXTRACTED VERBATIM from frontend/diagnose-workstation.js by
 * mockups/finding-evidence-routing.exploration/build.mjs. Do not edit —
 * re-run the build script.
 *
 * This contains the production Diagnose case-file roster: its group
 * headers, rows, server-verdict labels, and two-way expander. The small
 * adapter below reshapes this archived exploration's rows, then calls the
 * extracted renderer; it does not paint a second table.
 */
export const EVIDENCE_CAP = 5;

const fmtDate = (iso) => new Date(`${iso}T00:00:00`)
  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const VERDICT_BAND_KEY = { fired: 'Meets criteria', near_miss: 'Borderline', clean: 'Does not meet' };
const VERDICT_RESIDUE_KEY = { outranked: 'claimed by another factor', no_data: 'not comparable' };

function renderCaseRoster(host, caseFile, verdict, selectedId, onSelect, onMore, shownCount) {
  const rows = caseFile.occurrences.filter((row) => row.verdict === verdict);
  const publishedCount = caseFile.verdict_counts[verdict];
  const label = VERDICT_BAND_KEY[verdict] || VERDICT_RESIDUE_KEY[verdict] || verdict;
  host.insertAdjacentHTML('beforeend',
    `<div class="lvl-cap">Occurrences<span class="meta">${publishedCount} of ${caseFile.summary.denominator}</span></div>`);
  if (publishedCount === 0) {
    host.insertAdjacentHTML('beforeend', '<div class="empty">No occurrences in this verdict.</div>');
    return;
  }
  host.insertAdjacentHTML('beforeend', `<div class="ev-group"><b>${caseFile.finding.title}</b> — ${label}
    <span class="n">· ${publishedCount} episode${publishedCount === 1 ? '' : 's'}</span></div>`);
  for (const row of rows.slice(0, shownCount)) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'ev-row case-occurrence';
    button.dataset.occurrenceId = row.id;
    button.setAttribute('aria-pressed', String(row.id === selectedId));
    button.innerHTML = `<span class="when">${fmtDate(row.date)} · ${row.anchor.t.slice(11, 16)}</span>
      <span class="only">${row.anchor.bg == null ? '—' : Math.round(row.anchor.bg)}
        <span>· ${row.anchor.label}</span></span><span class="tier">${label}</span>`;
    button.addEventListener('click', () => onSelect(row.id));
    host.append(button);
  }
  if (publishedCount > EVIDENCE_CAP) {
    const more = document.createElement('button'); more.type = 'button'; more.className = 'more';
    more.textContent = shownCount > EVIDENCE_CAP ? `Show first ${EVIDENCE_CAP}`
      : `${publishedCount - EVIDENCE_CAP} more`;
    more.addEventListener('click', onMore); host.append(more);
  }
}

export function tierOf(occ) {
  const matched = (occ.verdicts || []).find((item) => item.matched);
  return matched ? matched.evidence_tier : null;
}

export function renderEvidence(host, factor, occurrences, verdictLabel, onOpen, onMore, shownCount, selected) {
  const verdict = ({ 'Meets criteria': 'fired', Borderline: 'near_miss', 'Does not meet': 'clean' })[verdictLabel] || 'fired';
  const rows = occurrences.map((occurrence) => ({
    id: occurrence.id, date: occurrence.date, verdict,
    anchor: { t: occurrence.t, bg: occurrence.worst_bg ?? occurrence.bg ?? null, label: 'Low excursion' },
  }));
  const caseFile = { occurrences: rows, verdict_counts: { [verdict]: rows.length },
    summary: { denominator: factor.denominator ?? rows.length },
    finding: { title: factor.title || (factor.cause || '').trim() } };
  renderCaseRoster(host, caseFile, verdict, selected?.id || null,
    (id) => onOpen(occurrences.find((occurrence) => occurrence.id === id)), onMore, shownCount);
}
