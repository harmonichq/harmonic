/* =========================================================================
   The app's one client (#102, #495): every endpoint path, the query-param
   encoding, the Bearer-token attach and the error unwrap, in one place. No
   other module in frontend/ fetches.

   SEAM: the default fetch implementation is the browser's globalThis.fetch.
   Tests (node --test) inject a fake through makeDeps({ fetch: fakeFetch }) and
   destructure the returned namespace; the app imports the bound defaults.

   DOM-free at import time, so `node --test` imports it with no DOM.
   ========================================================================= */

export class ApiTransportError extends Error {
  constructor(status, detail, fallback) {
    const structured = detail && typeof detail === 'object' ? detail : null;
    // Only served words become the message: a validation list never prints as
    // "[object Object]". With none, the message is the status text, which an
    // HTTP/2 answer leaves empty.
    super((typeof structured?.message === 'string' && structured.message)
      || (typeof detail === 'string' && detail) || fallback || '');
    this.name = 'ApiTransportError';
    this.status = status;
    this.code = structured?.code || null;
    this.detail = detail ?? null;
  }
}

/** Where the browser keeps the API token the server was started with. */
export const TOKEN_KEY = 'ciq_token';

/**
 * Keep the API token where every request reads it. Storage that refuses
 * access (a private window, blocked site data) keeps nothing.
 *
 * @param {string} token
 */
export function saveToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

/** The API token every request carries now, or null: none kept, no storage (node tests), or access refused. */
export function currentToken() {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null; } catch { return null; }
}

/**
 * Build a bound API namespace whose transport can be replaced.
 *
 * @param {{ fetch?: Function }} [deps={}]
 */
export function makeDeps({ fetch: _fetch = globalThis.fetch } = {}) {
  /**
   * Internal transport: attaches the Bearer token from localStorage when
   * present and unwraps the `detail` on non-2xx responses.
   *
   * @param {string} url
   * @param {RequestInit} [opts]
   * @returns {Promise<any>} parsed JSON body
   */
  async function api(url, opts) {
    const headers = Object.assign({}, opts && opts.headers);
    const token = currentToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await _fetch(url, Object.assign({}, opts, { headers }));
    if (!res.ok) {
      let detail = null;
      try { detail = (await res.json()).detail ?? null; } catch (e) {}
      throw new ApiTransportError(res.status, detail, res.statusText);
    }
    return res.json();
  }

  const send = (url, method, body) => api(url, body === undefined ? { method } : {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  // --- Settings: credentials, sync status, the pump profile ----------------

  /** GET /api/credentials — `{configured, email, region}`. */
  const fetchCredentials = () => api('/api/credentials');

  /**
   * POST /api/credentials
   * @param {{ email: string, password: string, region?: string }} form
   */
  const saveCredentials = (form) => send('/api/credentials', 'POST', form);

  /** GET /api/status — the last sync attempt and success, and the data's span. */
  const fetchStatus = () => api('/api/status');

  /** GET /api/pump-settings — the active pump profile, or `{configured: false}`. */
  const fetchPumpSettings = () => api('/api/pump-settings');

  // --- Queue: guidance, findings, the analysis, case files ----------------

  /**
   * GET /api/guidance — every candidate with its admission, priority and
   * set-aside preference, and the `analysis_generation` a snooze quotes back.
   */
  const fetchGuidance = () => api('/api/guidance');

  /**
   * PUT /api/guidance/preferences/<subject> — snooze a candidate. A plain
   * `detail` on 409/404, and no receipt: re-read the guidance after it.
   * @param {string} subject
   * @param {{ generation: string, reason?: string|null }} body
   */
  const setGuidancePreference = (subject, { generation, reason = null } = {}) =>
    send('/api/guidance/preferences/' + encodeURIComponent(subject), 'PUT', { generation, reason });

  /** DELETE /api/guidance/preferences/<subject> — restore a snoozed candidate. */
  const restoreGuidancePreference = (subject) =>
    send('/api/guidance/preferences/' + encodeURIComponent(subject), 'DELETE');

  /**
   * POST /api/plan/apply — Done on a Setting card (#518): record that the
   * subject's served suggestion is programmed into the pump. `body` names the
   * subject and the read it was made from, with a durable request identity
   * (`request_id`, `input_revision`, `analysis_generation`).
   */
  const recordDone = (body) => send('/api/plan/apply', 'POST', body);

  /** POST /api/plan/history/withdraw — Undo a Done still waiting for the pump. */
  const withdrawDone = (body) => send('/api/plan/history/withdraw', 'POST', body);

  /** GET /api/diagnose/findings — the whole-day findings projection. */
  const fetchDiagnoseFindings = () => api('/api/diagnose/findings');

  /** GET /api/analyze — the analysis, at the engine's default window or over `window` days. */
  const fetchAnalysis = (window) => api('/api/analyze' + (window ? '?window=' + encodeURIComponent(window) : ''));

  /** GET /api/diagnose/finding-case-file-preparation — the projection a case file is read from. */
  const fetchDiagnoseFindingCasePreparation = () => api('/api/diagnose/finding-case-file-preparation');

  /**
   * GET /api/diagnose/finding-case-file — one Finding's event-aligned case
   * file. The identifiers are opaque transport coordinates.
   */
  const fetchDiagnoseFindingCase = ({ projection_id, finding_id, alignment }) =>
    api('/api/diagnose/finding-case-file?' + new URLSearchParams({ projection_id, finding_id, alignment }));

  // --- Changes: the Trial roster and Focus --------------------------------

  /**
   * GET /api/verify/trials — the admission, the Trials and the Focus records;
   * with `selected` (and `kind`, `assessment`), that one change's detail.
   * @param {{ selected?: string, kind?: string, assessment?: string }} [opts]
   */
  function fetchVerifyTrials({ selected, kind, assessment } = {}) {
    const params = new URLSearchParams();
    if (selected) params.set('selected', selected);
    if (kind) params.set('kind', kind);
    if (assessment) params.set('assessment', assessment);
    const qs = params.toString();
    return api('/api/verify/trials' + (qs ? '?' + qs : ''));
  }

  /** POST /api/verify/trials/<id>/finish — end a matured Trial, with its durable retry identity. */
  const finishTrial = (id, durable) =>
    send('/api/verify/trials/' + encodeURIComponent(id) + '/finish', 'POST', durable);

  /** GET /api/focus — the Focus records and the follow-up input revision. */
  const fetchFocuses = () => api('/api/focus');

  /**
   * POST /api/focus — pin a Pattern's habit as the active Focus.
   * @param {{ pattern_key: string, outcome_window: {start_min: number, end_min: number},
   *           request_id: string, input_revision: number, subject: string,
   *           analysis_generation: string }} body
   */
  const pinFocus = (body) => send('/api/focus', 'POST', body);

  /** POST /api/focus/<id>/resolve — end the active Focus. */
  const resolveFocus = (id) => send('/api/focus/' + encodeURIComponent(id) + '/resolve', 'POST');

  // --- Overview -----------------------------------------------------------

  /** GET /api/outcomes?window=N — the standard metrics over one window. */
  const fetchOutcomes = (window) => api('/api/outcomes?window=' + encodeURIComponent(window));

  /** GET /api/explore/time-of-day — the glucose profile, over 30 days or `days` (14, 30 or 90). */
  const fetchExploreTimeOfDay = (days) =>
    api('/api/explore/time-of-day' + (days ? '?days=' + encodeURIComponent(days) : ''));

  /** GET /api/explore/meal-size — the Meal size card: the climb after each counted meal of the last 90 days, by size (#501). */
  const fetchMealSize = () => api('/api/explore/meal-size');

  /**
   * GET /api/day-navigator[?month=YYYY-MM] — each day of the month (the latest
   * with data when none is named), ± a week of pad: its lows, highs, in-range
   * share and sparkline.
   */
  const fetchDayNavigator = (month) => api('/api/day-navigator' + (month ? `?month=${encodeURIComponent(month)}` : ''));

  // --- Day: one day, the carb log, Prompts --------------------------------

  /**
   * GET /api/timeline?start=...&end=...
   * @param {{ start: string, end: string }} range - ISO wall-clock strings
   */
  const fetchTimeline = ({ start, end }) =>
    api('/api/timeline?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end));

  /**
   * GET /api/carbs?start=&end= — the carbs logged by hand over a range.
   * @param {{ start: string, end: string }} range - ISO wall-clock strings
   */
  const fetchCarbs = ({ start, end }) => api('/api/carbs?' + new URLSearchParams({ start, end }));

  /**
   * POST /api/carbs — log carbs eaten without a bolus.
   * @param {{ t: string, grams: number, certainty: string, source: string }} entry
   */
  const createCarb = (entry) => send('/api/carbs', 'POST', entry);

  /**
   * PATCH /api/carbs/<id> — merge fields into one logged entry (a Prompt's
   * grams, typed after its Yes).
   * @param {number} entryId
   * @param {{ grams: number, certainty: string }} fields
   */
  const updateCarb = (entryId, fields) => send('/api/carbs/' + encodeURIComponent(entryId), 'PATCH', fields);

  /**
   * GET /api/model-view?date=YYYY-MM-DD — every moment the engine weighed on
   * one day, by episode, each with its state and the habits it matched.
   */
  const fetchModelView = (date) => api('/api/model-view?' + new URLSearchParams({ date }));

  /** GET /api/prompts — the unanswered and answered Prompts, oldest first. */
  const fetchPrompts = () => api('/api/prompts');

  /**
   * POST /api/prompts/answer — answer one Prompt. `carbs` (Yes) creates the
   * carb entry and the answer together and returns `carb_entry_id`.
   * @param {{ detector: string, anchor_t: string, answer: string,
   *           entry?: { grams: ?number, certainty: string } }} body
   */
  const answerPrompt = (body) => send('/api/prompts/answer', 'POST', body);

  return {
    fetchCredentials, saveCredentials, fetchStatus, fetchPumpSettings,
    fetchGuidance, setGuidancePreference, restoreGuidancePreference, recordDone, withdrawDone,
    fetchDiagnoseFindings, fetchAnalysis,
    fetchDiagnoseFindingCasePreparation, fetchDiagnoseFindingCase,
    fetchVerifyTrials, finishTrial, fetchFocuses, pinFocus, resolveFocus,
    fetchOutcomes, fetchExploreTimeOfDay, fetchMealSize, fetchDayNavigator,
    fetchTimeline, fetchCarbs, fetchModelView, createCarb, updateCarb, fetchPrompts, answerPrompt,
  };
}

/** The client over the browser's own fetch: what the app imports. */
export const client = makeDeps();
