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

/* The Diagnose-origin Day entry (ADR 428 points 4 and 5). Subject, Occurrence
   and window are the case the workstation publishes — the same one the address
   names — and the date, moment and lever are the Occurrence's own. The held
   Occurrence id is also the return target, so no selector rides along. The
   title is the Day door's name for that case (ADR 426): the served finding
   title the workstation publishes with it, or, for a basal slot with no case,
   the setting and its half-hour range in the wearer's words (CONTEXT.md, Slot). */
export function evidenceDayContext({ occurrence, current }) {
  const at = occurrence.t || occurrence.anchor?.t || '';
  const slot = /^basal:\d+$/.test(current?.subject || '') ? String(current.window).split('-').map(Number) : null;
  return {
    date: String(at).slice(0, 10), moment: at,
    subject: current?.subject || '', occurrence: current?.occurrence || '', window: current?.window || '',
    title: current?.title
      || (slot ? `${SETTING_NAME.basal_rate} · ${formatStartMin(slot[0])}–${formatStartMin(slot[1])}` : ''),
    lever: occurrence.cause_lever || '',
    from: 'diagnose',
  };
}
