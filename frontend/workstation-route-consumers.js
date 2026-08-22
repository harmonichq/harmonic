import { initialTrial } from './verify-workstation-data.js';

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function encodeDiagnoseOccurrence(family, occurrence) {
  const json = JSON.stringify([family, occurrence.ep_id, occurrence.t])
    .replace(/\s/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return base64Url(new TextEncoder().encode(json));
}

function decodeDiagnoseOccurrence(value) {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
      + '='.repeat((4 - value.length % 4) % 4);
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return Array.isArray(decoded) && decoded.length === 3 ? decoded : null;
  } catch { return null; }
}

const DIAGNOSE_ALIGNMENT = Object.freeze({
  carb_undercount: Object.freeze({ view: 'meals', factor: 'carb_undercount' }),
  late_bolus: Object.freeze({ view: 'meals', factor: 'late_bolus' }),
  meal_over_delivery: Object.freeze({ view: 'meals', factor: 'meal_over_delivery' }),
  over_treated_low: Object.freeze({ view: 'lows', factor: 'over_treated_low' }),
  correction_stacking: Object.freeze({ view: 'lows', factor: 'correction_stacking' }),
  correction_on_iob: Object.freeze({ view: 'lows', factor: 'correction_on_iob' }),
});

export function diagnoseAlignmentCoordinates(lever) {
  return DIAGNOSE_ALIGNMENT[lever] || null;
}

function comparisonCoordinates(query) {
  return {
    view: query.view,
    factor: query.factor || undefined,
    window: query.start_min == null ? null : {
      start_min: Number(query.start_min), end_min: Number(query.end_min),
    },
    another: query.another === '1',
    occurrenceId: query.occ || undefined,
  };
}

async function resolveComparison(query, transaction, loadComparison) {
  const projection = await loadComparison(comparisonCoordinates(query));
  const factorOptions = Array.isArray(projection?.coordinates?.factor_options)
    ? projection.coordinates.factor_options : [];
  const factor = query.factor || projection?.coordinates?.factor;
  if (!factor || !factorOptions.some((option) => option?.key === factor)) {
    return transaction.invalid();
  }
  if (projection?.coordinates?.view !== query.view
      || projection?.coordinates?.factor !== factor) {
    return transaction.invalid();
  }
  if (query.occ && !(projection?.occurrences || [])
    .some((occurrence) => occurrence?.identity?.id === query.occ)) {
    return transaction.invalid();
  }
  if (query.occ && projection?.selection?.requested_id !== query.occ) {
    return transaction.invalid();
  }
  const complete = { ...query, factor };
  return transaction.resolved(complete, {
    kind: 'comparison', projection, query: complete,
  });
}

function exposureFamilies(payload) {
  return payload?.exposures?.exposures || {};
}

async function resolveWorkstation(query, transaction, loadWorkstation, loadComparison) {
  const window = query.start_min == null ? null : {
    start_min: Number(query.start_min), end_min: Number(query.end_min),
  };
  const payload = await loadWorkstation(window);
  if (!query.finding) {
    return transaction.resolved({}, {
      kind: 'workstation', payload, selection: null, query: {},
    });
  }
  const row = (payload?.findings?.rows || []).find((candidate) => candidate.id === query.finding);
  const separator = query.factor.indexOf('.');
  const family = query.factor.slice(0, separator);
  const lever = query.factor.slice(separator + 1);
  const alignment = diagnoseAlignmentCoordinates(lever);
  const familyIsPublished = (row?.evidence || [])
    .some((evidence) => evidence.family === family);
  if (!row || row.lever !== lever
      || !familyIsPublished) {
    return transaction.invalid();
  }

  let occurrence = null;
  if (query.occ) {
    const identity = decodeDiagnoseOccurrence(query.occ);
    if (!identity || identity[0] !== family) return transaction.invalid();
    const [, epId, time] = identity;
    const evidenceMember = (row.evidence || []).some((evidence) => (
      evidence.family === family && evidence.ep_id === epId && evidence.t === time
    ));
    occurrence = (exposureFamilies(payload)[family]?.occurrences || [])
      .find((candidate) => candidate.ep_id === epId && candidate.t === time) || null;
    if (!evidenceMember || !occurrence) return transaction.invalid();
  }

  let comparison = null;
  if (query.projection === 'event') {
    const coordinates = diagnoseAlignmentCoordinates(lever);
    if (!coordinates) return transaction.invalid();
    const request = {
      ...coordinates, window, another: false, occurrenceId: undefined,
    };
    const catalog = await loadComparison(request);
    if (catalog?.coordinates?.view !== coordinates.view
        || catalog?.coordinates?.factor !== coordinates.factor) {
      return transaction.invalid();
    }
    if (occurrence) {
      const eventOccurrence = (catalog.occurrences || []).find((candidate) => (
        candidate?.identity?.ep_id === occurrence.ep_id
        && candidate?.identity?.t === occurrence.t
      ));
      if (!eventOccurrence?.identity?.id) return transaction.invalid();
      comparison = await loadComparison({
        ...request, occurrenceId: eventOccurrence.identity.id,
      });
      if (comparison?.coordinates?.view !== coordinates.view
          || comparison?.coordinates?.factor !== coordinates.factor
          || comparison?.selection?.requested_id !== eventOccurrence.identity.id) {
        return transaction.invalid();
      }
    } else comparison = catalog;
  }

  return transaction.resolved(query, {
    kind: 'workstation', payload,
    selection: {
      finding: row.id,
      family: occurrence ? family : (alignment?.view || family),
      routeFamily: family,
      lever,
      window: window ? [window.start_min, window.end_min] : null,
      projection: query.projection || 'clock', occurrence,
    },
    ...(comparison ? { comparison } : {}),
    query,
  });
}

export function createDiagnoseRouteConsumer({ loadWorkstation, loadComparison, publish }) {
  return Object.freeze({
    resolve(query, transaction) {
      if (query.view) return resolveComparison(query, transaction, loadComparison);
      return resolveWorkstation(query, transaction, loadWorkstation, loadComparison);
    },
    publish,
  });
}

export function createVerifyRouteConsumer({ loadRoster, loadTrial, publish }) {
  return Object.freeze({
    async resolve(query, transaction) {
      const roster = await loadRoster();
      const trials = Array.isArray(roster?.trials) ? roster.trials : [];
      const selected = query.trial
        ? trials.find((trial) => trial.id === query.trial)
        : initialTrial(trials);
      if (query.trial && !selected) return transaction.invalid();

      const details = {};
      await Promise.all(trials.map(async (trial) => {
        try {
          const detail = await loadTrial(trial.id);
          const selectedDetail = detail?.selected || detail;
          if (selectedDetail?.id === trial.id) details[trial.id] = detail;
        }
        catch { /* Existing Verify semantics keep a Trial whose detail failed nameable. */ }
      }));
      const trial = selected?.id || null;
      return transaction.resolved(trial ? { trial } : {}, { roster, details, trial });
    },
    publish,
  });
}
