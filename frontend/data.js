/* =========================================================================
   #102 DATA-ACCESS MODULE — consolidated fetch transport + per-operation API.

   Extracted from index.html's api() helper and its 11 call sites so there is
   a single place that knows endpoint paths, query-param encoding, and the
   Bearer-token attach / error-unwrap contract.

   SEAM: the default fetch implementation is the browser's globalThis.fetch.
   Tests (node --test) inject a fake via the second argument of each exported
   function or, more ergonomically, by calling makeDeps({ fetch: fakeFetch })
   and destructuring the returned namespace.  Callers in index.html use the
   zero-argument form and get the real browser fetch.

   VUE-FREE and DOM-FREE at import time so `node --test` can import with no
   importmap and no DOM.  The request-id race guard in loadAnalysis stays in
   index.html — the app owns staleness; only the transport belongs here.
   ========================================================================= */

export class ApiTransportError extends Error {
  constructor(status, detail, fallback) {
    const structured = detail && typeof detail === 'object' ? detail : null;
    super(structured?.message || detail || fallback);
    this.name = 'ApiTransportError';
    this.status = status;
    this.code = structured?.code || null;
    this.detail = detail ?? null;
  }
}

/**
 * Build a bound API namespace whose transport can be replaced.
 *
 * @param {{ fetch?: Function }} [deps={}]
 * @returns {{ fetchCredentials, saveCredentials, fetchStatus, fetchNow,
 *             fetchPumpSettings, fetchBacktest, fetchAnalysis, fetchScenarios,
 *             fetchTimeline, fetchVerifyTrials, fetchExploreTimeOfDay, fetchAuditDismissals, dismissAuditItem, loadPlan, savePlanDraft,
 *             loadPlanHistory, applyPlan }}
 */
export function makeDeps({ fetch: _fetch = globalThis.fetch } = {}) {
  /**
   * Internal transport: attaches the Bearer token from localStorage when
   * present and unwraps the `detail` string on non-2xx responses.
   *
   * @param {string} url
   * @param {RequestInit} [opts]
   * @returns {Promise<any>} parsed JSON body
   */
  async function _send(url, opts) {
    const headers = Object.assign({}, opts && opts.headers);
    // localStorage may not exist in non-browser environments (node tests).
    const token =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('ciq_token')
        : null;
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await _fetch(url, Object.assign({}, opts, { headers }));
    if (!res.ok) {
      let detail = null;
      try { detail = (await res.json()).detail ?? null; } catch (e) {}
      throw new ApiTransportError(res.status, detail, res.statusText);
    }
    return res;
  }
  /** @returns {Promise<any>} parsed JSON body */
  async function api(url, opts) { return (await _send(url, opts)).json(); }
  /** @returns {Promise<string>} raw text body (e.g. #269 raw markdown) */
  async function apiText(url, opts) { return (await _send(url, opts)).text(); }

  // --- credentials -------------------------------------------------------

  /** GET /credentials */
  function fetchCredentials() {
    return api('/credentials');
  }

  /**
   * POST /credentials
   * @param {{ email: string, password: string, region?: string }} form
   */
  function saveCredentials(form) {
    return api('/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
  }

  // --- status / fetch-now -------------------------------------------------

  /** GET /status */
  function fetchStatus() {
    return api('/status');
  }

  /** POST /fetch */
  function fetchNow() {
    return api('/fetch', { method: 'POST' });
  }

  // --- pump settings ------------------------------------------------------

  /** GET /pump-settings */
  function fetchPumpSettings() {
    return api('/pump-settings');
  }

  // --- backtest -----------------------------------------------------------

  /**
   * GET /backtest
   * @param {{ holdoutDays?: number }} [opts]
   */
  function fetchBacktest({ holdoutDays = 2 } = {}) {
    return api('/backtest' + (holdoutDays !== 2 ? '?holdout_days=' + holdoutDays : ''));
  }

  // --- analysis -----------------------------------------------------------

  /**
   * GET /analyze
   * @param {{ window?: number, ignoreChanges?: boolean, pool?: boolean }} [opts]
   *   `pool` (#85 / #246) pools a changed basal slot's agreeing pre-edit nights
   *   back into its estimate — the mode the Diagnose queue ranks levers in (ADR 0032).
   */
  function fetchAnalysis({ window: win, ignoreChanges = false, pool = false } = {}) {
    const params = new URLSearchParams();
    if (win != null) params.set('window', win);
    if (ignoreChanges) params.set('ignore_changes', '1');
    if (pool) params.set('pool', '1');
    const qs = params.toString();
    return api('/analyze' + (qs ? '?' + qs : ''));
  }

  // --- scenarios ----------------------------------------------------------

  /**
   * GET /scenarios?window=N
   * @param {number} window - look-back window in days
   */
  function fetchScenarios(window) {
    return api('/scenarios?window=' + encodeURIComponent(window));
  }

  // --- guide / about catalog (#157) ---------------------------------------

  /**
   * GET /api/catalog — the type-level Guide payload: the lever catalog, the
   * SilenceReason taxonomy, evidence tiers, the pipeline, and one worked
   * example. Static and DB-free; the Guide tab fetches it lazily on open.
   */
  function fetchCatalog() {
    return api('/api/catalog');
  }

  /**
   * GET /api/kb/<slug> — the RAW markdown of one authored Guide-KB how-to
   * (#269). Returns markdown text (not JSON); the frontend renders it (kb.js).
   * The article pane fetches it lazily when its article opens.
   * @param {string} slug
   * @returns {Promise<string>} raw markdown
   */
  function fetchKbArticle(slug) {
    return apiText('/api/kb/' + encodeURIComponent(slug));
  }

  // --- per-day model-view (#152 / ADR 0019) -------------------------------

  /**
   * GET /model-view?date=YYYY-MM-DD — the per-day introspection feed: every
   * anchor the engine saw that day, each with all its classifier verdicts +
   * state (fired/outranked/near-miss/clean/no-data). The Daily-tab model-view
   * panel binds this.
   * @param {string} date - a pump-local 'YYYY-MM-DD' calendar day
   * @param {RequestInit} [opts]
   */
  function fetchModelView(date, opts) {
    return api('/model-view?date=' + encodeURIComponent(date), opts);
  }

  // --- Day navigator (#248 / ADR 0031) ------------------------------------

  /**
   * GET /day-navigator[?month=YYYY-MM] — the Day surface navigator feed: per-day
   * glycemic severity (lows / highs / TIR) + a downsampled glucose sparkline curve
   * for every day in the calendar month (± a week of pad). `month` omitted defaults
   * to the month of the latest day with data.
   * @param {string} [month] - a 'YYYY-MM' calendar month
   */
  function fetchDayNavigator(month) {
    return api('/day-navigator' + (month ? '?month=' + encodeURIComponent(month) : ''));
  }

  // --- outcomes trend (#131) ----------------------------------------------

  /**
   * GET /outcomes/trend?window=N — the behavioral + glycemic scorecard across
   * rolling `window`-day windows (oldest→newest, index-aligned series per
   * behavior/metric). The Outcomes tab binds this.
   * @param {number} window - window width in days (14 default)
   */
  function fetchOutcomesTrend(window) {
    return api('/outcomes/trend' + (window != null ? '?window=' + encodeURIComponent(window) : ''));
  }

  // --- Verify Trial roster (#587) ----------------------------------------

  /**
   * GET /verify/trials?selected=derived-id — the bounded server-derived Trial
   * roster.  An optional selected id returns only that Trial's aligned detail.
   * The Trial's maturing window is a backend fact — no window knob exists here.
   * @param {{ selected?: string }} [opts]
   */
  function fetchVerifyTrials({ selected } = {}) {
    const params = new URLSearchParams();
    if (selected) params.set('selected', selected);
    const qs = params.toString();
    return api('/verify/trials' + (qs ? '?' + qs : ''));
  }

  /** GET /explore/time-of-day — fixed server-owned 30-day aggregate. */
  function fetchExploreTimeOfDay() { return api('/explore/time-of-day'); }
  /** GET /explore/exposures — every exposure in the window with each
   *  classifier's verdict; the Diagnose inspector's own feed (#654). */
  function fetchExploreExposures() { return api('/explore/exposures'); }

  /**
   * GET /diagnose/event-comparison — one bounded, server-projected Meals or
   * Lows comparison. Coordinates are interaction state, never browser policy.
   * @param {{ view: 'meals'|'lows', factor?: string,
   *            window?: {start_min: number, end_min: number}|null,
   *            another?: boolean, occurrenceId?: string }} coordinates
   */
  function fetchDiagnoseEventComparison({ view, factor, window = null, another = false,
                                          occurrenceId } = {}) {
    const params = new URLSearchParams();
    if (view) params.set('view', view);
    if (factor) params.set('factor', factor);
    if (window) {
      params.set('start_min', window.start_min);
      params.set('end_min', window.end_min);
    }
    if (another) params.set('another', '1');
    if (occurrenceId) params.set('occ', occurrenceId);
    const query = params.toString();
    return api('/diagnose/event-comparison' + (query ? '?' + query : ''));
  }
  /**
   * GET /diagnose/findings — the Diagnose findings queue for one clock window
   * (#730, ADR 730). Omit the window for the global (24 h) queue; send both bounds
   * for a pressed preset or a drawn brace. Everything the queue shows — register,
   * merged spans, outcome anchoring, window-local denominators, order — is decided
   * server-side and rendered verbatim (lock term 40).
   * @param {{ start_min: number, end_min: number }|null} [window]
   */
  function fetchDiagnoseFindings(window = null) {
    const params = new URLSearchParams();
    if (window) {
      params.set('start_min', window.start_min);
      params.set('end_min', window.end_min);
    }
    const query = params.toString();
    return api('/diagnose/findings' + (query ? '?' + query : ''));
  }
  /** Exact active analyzer-run evidence for one retired I:C history item. */
  function fetchDiagnoseCarbRatioHistoryEvents({
    historyId, analysisGeneration, selectedRunId,
  } = {}) {
    const params = new URLSearchParams();
    if (historyId) params.set('history_id', historyId);
    if (analysisGeneration) params.set('analysis_generation', analysisGeneration);
    if (selectedRunId) params.set('selected_run_id', selectedRunId);
    return api('/diagnose/carb-ratio-history/events?' + params.toString());
  }
  function fetchAuditDismissals() { return api('/audit/dismissals'); }
  function dismissAuditItem(item_id, evidence_fingerprint) {
    return api('/audit/dismissals', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id, evidence_fingerprint }) });
  }

  // --- timeline -----------------------------------------------------------

  /**
   * GET /timeline?start=...&end=...
   * @param {{ start: string, end: string }} range - ISO wall-clock strings
   * @param {RequestInit} [opts]
   */
  function fetchTimeline({ start, end }, opts) {
    return api(
      '/timeline?start=' + encodeURIComponent(start) +
      '&end=' + encodeURIComponent(end),
      opts,
    );
  }

  // --- carb log (#126) ----------------------------------------------------

  /**
   * GET /carbs[?start=&end=] — the user-entered carb_entries (#125 shape),
   * id-bearing so the caller can edit/delete by id.
   * @param {{ start?: string, end?: string }} [range] - ISO wall-clock strings
   * @param {RequestInit} [opts]
   */
  function fetchCarbs({ start, end } = {}, opts) {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const qs = params.toString();
    return api('/carbs' + (qs ? '?' + qs : ''), opts);
  }

  /**
   * POST /carbs — create one carb entry.
   * @param {{ t: string, grams: ?number, certainty: string, source?: string, note?: ?string }} entry
   */
  function createCarb(entry) {
    return api('/carbs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  }

  // --- carb-log prompt queue (#128) --------------------------------------

  /** GET /prompts — the live review queue (List[Prompt], oldest-first). */
  function fetchPrompts() {
    return api('/prompts');
  }

  /**
   * POST /prompts/answer — answer one prompt.
   * When answer === 'carbs' the server creates the carb entry (pinned to the
   * anchor, tagged rise-prompt / low-prompt) AND the response row atomically.
   * @param {{ detector: string, anchor_t: string, answer: string,
   *           entry?: { grams: ?number, certainty: string, note?: ?string } }} body
   */
  function answerPrompt(body) {
    return api('/prompts/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE /prompts/answer — clear a prompt's answer so it resurrects.
   * @param {{ detector: string, anchor_t: string }} body
   */
  function clearPrompt(body) {
    return api('/prompts/answer', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // --- Focus: the pinned watched behavioral lever (#244) ------------------

  /**
   * GET /focus — every Focus ever pinned (active + closed, newest first) plus
   * the pinnable-lever universe. Verify uses this to resolve the active Focus's
   * id (the `/outcomes/trend` FocusView carries no id) so Retire can target it.
   */
  function fetchFocuses() {
    return api('/focus');
  }

  /**
   * POST /focus/{id}/resolve — unpin (retire) the active Focus by id.
   * @param {number} id
   */
  function resolveFocus(id) {
    return api('/focus/' + encodeURIComponent(id) + '/resolve', { method: 'POST' });
  }

  /**
   * POST /focus — pin a behavioral lever as the active Focus (#246 Diagnose's
   * "Pin as Focus → Verify" disposition). Rejected (409) while a Trial is live or
   * another Focus is active, (400) for a non-pinnable tuning lever — the caller
   * surfaces the message. Returns the pinned Focus row (with its id, for undo).
   * @param {string} lever
   */
  function pinFocus(lever) {
    return api('/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lever }),
    });
  }

  // --- plan ---------------------------------------------------------------

  /** GET /plan */
  function loadPlan() {
    return api('/plan');
  }

  /**
   * PUT /plan
   * @param {{ items: Array }} draft
   */
  function savePlanDraft(draft) {
    return api('/plan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
  }

  /** GET /plan/history */
  function loadPlanHistory() {
    return api('/plan/history');
  }

  /** POST /plan/apply */
  function applyPlan() {
    return api('/plan/apply', { method: 'POST' });
  }

  return {
    fetchCredentials,
    saveCredentials,
    fetchStatus,
    fetchNow,
    fetchPumpSettings,
    fetchBacktest,
    fetchAnalysis,
    fetchScenarios,
    fetchCatalog,
    fetchKbArticle,
    fetchModelView,
    fetchDayNavigator,
    fetchOutcomesTrend,
    fetchVerifyTrials,
    fetchExploreTimeOfDay,
    fetchExploreExposures,
    fetchDiagnoseEventComparison,
    fetchDiagnoseFindings,
    fetchDiagnoseCarbRatioHistoryEvents,
    fetchAuditDismissals,
    dismissAuditItem,
    fetchTimeline,
    fetchCarbs,
    createCarb,
    fetchPrompts,
    answerPrompt,
    clearPrompt,
    fetchFocuses,
    resolveFocus,
    pinFocus,
    loadPlan,
    savePlanDraft,
    loadPlanHistory,
    applyPlan,
  };
}

// ---------------------------------------------------------------------------
// Default singleton — index.html imports these directly and gets the real
// browser fetch.  Tests import makeDeps instead.
// ---------------------------------------------------------------------------

const _defaults = makeDeps();

export const fetchCredentials  = _defaults.fetchCredentials;
export const saveCredentials   = _defaults.saveCredentials;
export const fetchStatus       = _defaults.fetchStatus;
export const fetchNow          = _defaults.fetchNow;
export const fetchPumpSettings = _defaults.fetchPumpSettings;
export const fetchBacktest     = _defaults.fetchBacktest;
export const fetchAnalysis     = _defaults.fetchAnalysis;
export const fetchScenarios    = _defaults.fetchScenarios;
export const fetchCatalog      = _defaults.fetchCatalog;
export const fetchKbArticle    = _defaults.fetchKbArticle;
export const fetchModelView    = _defaults.fetchModelView;
export const fetchDayNavigator = _defaults.fetchDayNavigator;
export const fetchOutcomesTrend = _defaults.fetchOutcomesTrend;
export const fetchVerifyTrials = _defaults.fetchVerifyTrials;
export const fetchExploreTimeOfDay = _defaults.fetchExploreTimeOfDay;
export const fetchExploreExposures = _defaults.fetchExploreExposures;
export const fetchDiagnoseEventComparison = _defaults.fetchDiagnoseEventComparison;
export const fetchDiagnoseFindings = _defaults.fetchDiagnoseFindings;
export const fetchDiagnoseCarbRatioHistoryEvents =
  _defaults.fetchDiagnoseCarbRatioHistoryEvents;
export const fetchAuditDismissals = _defaults.fetchAuditDismissals;
export const dismissAuditItem = _defaults.dismissAuditItem;
export const fetchTimeline     = _defaults.fetchTimeline;
export const fetchCarbs        = _defaults.fetchCarbs;
export const createCarb        = _defaults.createCarb;
export const fetchPrompts      = _defaults.fetchPrompts;
export const answerPrompt      = _defaults.answerPrompt;
export const clearPrompt       = _defaults.clearPrompt;
export const fetchFocuses      = _defaults.fetchFocuses;
export const resolveFocus      = _defaults.resolveFocus;
export const pinFocus          = _defaults.pinFocus;
export const loadPlan          = _defaults.loadPlan;
export const savePlanDraft     = _defaults.savePlanDraft;
export const loadPlanHistory   = _defaults.loadPlanHistory;
export const applyPlan         = _defaults.applyPlan;
