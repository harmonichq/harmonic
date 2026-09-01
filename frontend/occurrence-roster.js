export const EVIDENCE_CAP = 5;

export function renderOccurrenceRoster(host, groups, {
  selectedId, shownCount, onSelect, onMore,
}) {
  for (const group of groups) {
    if (group.servedCount === 0 && group.emptyBeforeHeader) {
      host.insertAdjacentHTML('beforeend', group.empty);
      continue;
    }
    host.insertAdjacentHTML('beforeend', group.header);
    if (group.servedCount === 0) {
      host.insertAdjacentHTML('beforeend', group.empty);
      continue;
    }
    for (const row of group.rows.slice(0, shownCount)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ev-row case-occurrence';
      button.dataset.occurrenceId = row.id;
      Object.assign(button.dataset, row.dataset);
      button.setAttribute('aria-pressed', String(row.id === selectedId));
      button.innerHTML = row.html;
      button.addEventListener('click', () => onSelect(row.id));
      host.append(button);
    }
    if (group.servedCount > EVIDENCE_CAP) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'more';
      more.textContent = shownCount > EVIDENCE_CAP
        ? `Show first ${EVIDENCE_CAP}`
        : `${group.servedCount - EVIDENCE_CAP} more`;
      more.addEventListener('click', onMore);
      host.append(more);
    }
  }
}
