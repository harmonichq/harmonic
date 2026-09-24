import { formatStartMin } from './plan.js';
import { SETTING_NAME } from './plan-view.js';

// A request is not a drill. Only an explicit reader selection changes intent;
// descriptor loads and failed or superseded responses cannot choose a subject.
export function createCaseContext(delegate) {
  let intent = null;
  let selected = null;
  let generation = 0;
  return {
    select(subject, occurrence = null) {
      intent = subject ? { subject, occurrence } : null;
      selected = null;
      generation += 1;
    },
    current: () => selected,
    load(coordinates) {
      const at = generation;
      const requested = intent && coordinates.finding_id === intent.subject
        && (coordinates.occ || null) === intent.occurrence;
      return Promise.resolve(delegate(coordinates)).then(data => {
        if (requested && generation === at && data?.finding?.id === intent.subject
          && data.projection_id === coordinates.projection_id
          && data.selection?.requested_id === (coordinates.occ || null)) {
          selected = { subject: intent.subject, occurrence: intent.occurrence,
            finding: data.finding, window: data.window, detail: data.selection.detail || null };
        }
        return data;
      });
    },
  };
}

// The Day door's name for what the reader was looking at: the served case
// file's finding title, or, for a basal slot with no case, the setting and its
// half-hour range in the wearer's words (CONTEXT.md, Slot).
export function evidenceDayContext({ occurrence, selected, slot, focus }) {
  const at = occurrence.t || occurrence.anchor?.t || '';
  return {
    date: String(at).slice(0, 10), moment: at,
    subject: selected?.subject || (slot ? `basal:${slot.start}` : ''),
    title: selected?.finding.title
      || (slot ? `${SETTING_NAME.basal_rate} · ${formatStartMin(slot.start)}–${formatStartMin(slot.end)}` : ''),
    occurrence: occurrence.id || selected?.occurrence || String(at).slice(0, 10),
    lever: occurrence.cause_lever || (slot ? 'basal_rate' : ''),
    window: Number.isFinite(selected?.window?.start_min) ? `${selected.window.start_min}-${selected.window.end_min}`
      : slot ? `${slot.start}-${slot.end}` : '',
    from: 'diagnose', focus,
  };
}
