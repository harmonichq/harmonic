export const EVIDENCE_CAP = 5;

/* A row may carry its own `pressed` (#464: a carb-ratio low is pressed by the run
   it sits on, not by its own id), and `onPreview` hears hover and focus without
   selecting. `cap` is the shared five rows unless a caller lists every row. */
export function renderOccurrenceRoster(host, groups, {
  selectedId, shownCount, onSelect, onMore, onPreview, cap = EVIDENCE_CAP,
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
      button.className = `ev-row case-occurrence${group.compact ? ' case-compact' : ''}`;
      button.dataset.occurrenceId = row.id;
      Object.assign(button.dataset, row.dataset);
      button.setAttribute('aria-pressed', String(row.pressed ?? row.id === selectedId));
      button.innerHTML = row.html;
      button.addEventListener('click', () => onSelect(row.id));
      if (onPreview) {
        button.addEventListener('mouseenter', () => onPreview(row.id));
        button.addEventListener('focus', () => onPreview(row.id));
      }
      host.append(button);
    }
    if (group.servedCount > cap) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'more';
      more.textContent = shownCount > cap
        ? `Show first ${cap}`
        : `${group.servedCount - cap} more`;
      more.addEventListener('click', onMore);
      host.append(more);
    }
  }
}
