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

  /** GET /api/credentials */
  function fetchCredentials() {
    return api('/api/credentials');
  }

  /**
   * POST /api/credentials
   * @param {{ email: string, password: string, region?: string }} form
   */
  function saveCredentials(form) {
    return api('/api/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
  }

  // --- status / fetch-now -------------------------------------------------

  /** GET /api/status */
  function fetchStatus() {
    return api('/api/status');
  }

  /** POST /api/fetch */
  function fetchNow() {
    return api('/api/fetch', { method: 'POST' });
  }

  // --- pump settings ------------------------------------------------------

  /** GET /api/pump-settings */
  function fetchPumpSettings() {
    return api('/api/pump-settings');
  }

  // --- backtest -----------------------------------------------------------

  /**
   * GET /api/backtest
   * @param {{ holdoutDays?: number }} [opts]
   */
  function fetchBacktest({ holdoutDays = 2 } = {}) {
    return api('/api/backtest' + (holdoutDays !== 2 ? '?holdout_days=' + holdoutDays : ''));
  }

  // --- analysis -----------------------------------------------------------

  /**
   * GET /api/analyze
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
    return api('/api/analyze' + (qs ? '?' + qs : ''));
  }

  // --- scenarios ----------------------------------------------------------

  /**
   * GET /api/scenarios?window=N
   * @param {number} window - look-back window in days
   */
  function fetchScenarios(window) {
    return api('/api/scenarios?window=' + encodeURIComponent(window));
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
   * GET /api/model-view?date=YYYY-MM-DD — the per-day introspection feed: every
   * anchor the engine saw that day, each with all its classifier verdicts +
   * state (fired/outranked/near-miss/clean/no-data). The Daily-tab model-view
   * panel binds this.
   * @param {string} date - a pump-local 'YYYY-MM-DD' calendar day
   * @param {RequestInit} [opts]
   */
  function fetchModelView(date, opts) {
    return api('/api/model-view?date=' + encodeURIComponent(date), opts);
  }

  // --- Day navigator (#248 / ADR 0031) ------------------------------------

  /**
   * GET /api/day-navigator[?month=YYYY-MM] — the Day surface navigator feed: per-day
   * glycemic severity (lows / highs / TIR) + a downsampled glucose sparkline curve
   * for every day in the calendar month (± a week of pad). `month` omitted defaults
   * to the month of the latest day with data.
   * @param {string} [month] - a 'YYYY-MM' calendar month
   */
  function fetchDayNavigator(month) {
    return api('/api/day-navigator' + (month ? '?month=' + encodeURIComponent(month) : ''));
  }

  // --- outcomes trend (#131) ----------------------------------------------

  /**
   * GET /api/outcomes/trend?window=N — the behavioral + glycemic scorecard across
   * rolling `window`-day windows (oldest→newest, index-aligned series per
   * behavior/metric). The Outcomes tab binds this.
   * @param {number} window - window width in days (14 default)
   */
  function fetchOutcomesTrend(window) {
    return api('/api/outcomes/trend' + (window != null ? '?window=' + encodeURIComponent(window) : ''));
  }

  // --- Verify Trial roster (#587) ----------------------------------------

  /**
   * GET /api/verify/trials?selected=derived-id — the bounded server-derived Trial
   * roster.  An optional selected id returns only that Trial's aligned detail.
   * The Trial's maturing window is a backend fact — no window knob exists here.
   * @param {{ selected?: string }} [opts]
   */
  function fetchVerifyTrials({ selected } = {}) {
    const params = new URLSearchParams();
    if (selected) params.set('selected', selected);
    const qs = params.toString();
    return api('/api/verify/trials' + (qs ? '?' + qs : ''));
  }

  /** GET /api/explore/time-of-day — fixed server-owned 30-day aggregate. */
  function fetchExploreTimeOfDay() { return api('/api/explore/time-of-day'); }
  /** GET /api/explore/exposures — every exposure in the window with each
   *  classifier's verdict; the Diagnose inspector's own feed (#654). */
  function fetchExploreExposures() { return api('/api/explore/exposures'); }

  /** Analyzer-owned delivered-versus-programmed evidence for one basal slot. */
  function fetchDiagnoseBasalNightEvidence({ slot } = {}) {
    const params = new URLSearchParams();
    if (slot != null) params.set('slot', slot);
    return api('/api/diagnose/basal-night-evidence?' + params.toString());
  }
  /** Analyzer-owned rest windows and qualifying fasting steps. */
  function fetchDiagnoseIsfRestWindowEvidence() {
    return api('/api/diagnose/isf-rest-window-evidence');
  }
  /** Current I:C block's published meal-run roster and bounded CGM series. */
  async function fetchDiagnoseCarbRatioBlockEvidence({ block_id, analysis_generation } = {}) {
    const params = new URLSearchParams();
    if (block_id != null) params.set('block_id', block_id);
    if (analysis_generation != null) params.set('analysis_generation', analysis_generation);
    try {
      return await api('/api/diagnose/carb-ratio-block-evidence?' + params.toString());
    } catch (error) {
      if (error instanceof ApiTransportError && error.status === 409
          && error.code === 'analysis_generation_mismatch') {
        return { stale: true, message: error.message };
      }
      throw error;
    }
  }
  /**
   * GET /api/diagnose/findings — the Diagnose findings queue for one clock window
   * (#730, ADR 730). Omit the window for the global (24 h) queue; send both bounds
   * for a pressed preset or a drawn brace. Everything the queue shows — register,
   * merged spans, outcome anchoring, window-local denominators, order — is decided
   * server-side and rendered verbatim (lock term 40).
   * @param {{ start_min: number, end_min: number }|null} [window]
   * @param {string|null} [selectedHistoryId]
   */
  function fetchDiagnoseFindings(window = null, selectedHistoryId = null) {
    const params = new URLSearchParams();
    if (window) {
      params.set('start_min', window.start_min);
      params.set('end_min', window.end_min);
    }
    if (selectedHistoryId) params.set('selected_id', selectedHistoryId);
    const query = params.toString();
    return api('/api/diagnose/findings' + (query ? '?' + query : ''));
  }
  /** Exact active analyzer-run evidence for one retired I:C history item. */
  function fetchDiagnoseCarbRatioHistoryEvents({
    historyId, analysisGeneration, selectedRunId,
  } = {}) {
    const params = new URLSearchParams();
    if (historyId) params.set('history_id', historyId);
    if (analysisGeneration) params.set('analysis_generation', analysisGeneration);
    if (selectedRunId) params.set('selected_run_id', selectedRunId);
    return api('/api/diagnose/carb-ratio-history/events?' + params.toString());
  }
  /**
   * GET /api/diagnose/finding-case-file-preparation — one retained server-owned
   * Finding generation. The optional clock window is the preparation's only
   * membership coordinate; history selection passes through to the wrapped queue.
   */
  function fetchDiagnoseFindingCasePreparation(window = null, selectedHistoryId = null) {
    const params = new URLSearchParams();
    if (window) {
      params.set('start_min', window.start_min);
      params.set('end_min', window.end_min);
    }
    if (selectedHistoryId) params.set('selected_id', selectedHistoryId);
    const query = params.toString();
    return api('/api/diagnose/finding-case-file-preparation' + (query ? '?' + query : ''));
  }
  /**
   * GET /api/diagnose/finding-case-file — project one retained Finding population.
   * All identifiers are opaque transport coordinates; the browser never parses
   * or reconstructs them.
   */
  function fetchDiagnoseFindingCase({ projection_id, finding_id, alignment, occ } = {}) {
    const params = new URLSearchParams({ projection_id, finding_id, alignment });
    if (occ) params.set('occ', occ);
    return api('/api/diagnose/finding-case-file?' + params.toString());
  }
  function fetchAuditDismissals() { return api('/api/audit/dismissals'); }
  function dismissAuditItem(item_id, evidence_fingerprint) {
    return api('/api/audit/dismissals', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id, evidence_fingerprint }) });
  }

  // --- timeline -----------------------------------------------------------

  /**
   * GET /api/timeline?start=...&end=...
   * @param {{ start: string, end: string }} range - ISO wall-clock strings
   * @param {RequestInit} [opts]
   */
  function fetchTimeline({ start, end }, opts) {
    return api(
      '/api/timeline?start=' + encodeURIComponent(start) +
      '&end=' + encodeURIComponent(end),
      opts,
    );
  }

  // --- carb log (#126) ----------------------------------------------------

  /**
   * GET /api/carbs[?start=&end=] — the user-entered carb_entries (#125 shape),
   * id-bearing so the caller can edit/delete by id.
   * @param {{ start?: string, end?: string }} [range] - ISO wall-clock strings
   * @param {RequestInit} [opts]
   */
  function fetchCarbs({ start, end } = {}, opts) {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const qs = params.toString();
    return api('/api/carbs' + (qs ? '?' + qs : ''), opts);
  }

  /**
   * POST /api/carbs — create one carb entry.
   * @param {{ t: string, grams: ?number, certainty: string, source?: string, note?: ?string }} entry
   */
  function createCarb(entry) {
    return api('/api/carbs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  }

  // --- carb-log prompt queue (#128) --------------------------------------

  /** GET /api/prompts — the live review queue (List[Prompt], oldest-first). */
  function fetchPrompts() {
    return api('/api/prompts');
  }

  /**
   * POST /api/prompts/answer — answer one prompt.
   * When answer === 'carbs' the server creates the carb entry (pinned to the
   * anchor, tagged rise-prompt / low-prompt) AND the response row atomically.
   * @param {{ detector: string, anchor_t: string, answer: string,
   *           entry?: { grams: ?number, certainty: string, note?: ?string } }} body
   */
  function answerPrompt(body) {
    return api('/api/prompts/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE /api/prompts/answer — clear a prompt's answer so it resurrects.
   * @param {{ detector: string, anchor_t: string }} body
   */
  function clearPrompt(body) {
    return api('/api/prompts/answer', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // --- Focus: the pinned watched behavioral lever (#244) ------------------

  /**
   * GET /api/focus — every Focus ever pinned (active + closed, newest first) plus
   * the pinnable-lever universe. Verify uses this to resolve the active Focus's
   * id (the `/api/outcomes/trend` FocusView carries no id) so Retire can target it.
   */
  function fetchFocuses() {
    return api('/api/focus');
  }

  /**
   * POST /api/focus/{id}/resolve — unpin (retire) the active Focus by id.
   * @param {number} id
   */
  function resolveFocus(id) {
    return api('/api/focus/' + encodeURIComponent(id) + '/resolve', { method: 'POST' });
  }

  /**
   * POST /api/focus — pin a behavioral lever as the active Focus (#246 Diagnose's
   * "Pin as Focus → Verify" disposition). Rejected (409) while a Trial is live or
   * another Focus is active, (400) for a non-pinnable tuning lever — the caller
   * surfaces the message. Returns the pinned Focus row (with its id, for undo).
   * @param {string} lever
   */
  function pinFocus(lever) {
    return api('/api/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lever }),
    });
  }

  // --- plan ---------------------------------------------------------------

  /** GET /api/plan */
  function loadPlan() {
    return api('/api/plan');
  }

  /**
   * PUT /api/plan
   * @param {{ items: Array }} draft
   */
  function savePlanDraft(draft) {
    return api('/api/plan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
  }

  /** GET /api/plan/history */
  function loadPlanHistory() {
    return api('/api/plan/history');
  }

  /** POST /api/plan/apply */
  function applyPlan() {
    return api('/api/plan/apply', { method: 'POST' });
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
    fetchDiagnoseBasalNightEvidence,
    fetchDiagnoseIsfRestWindowEvidence,
    fetchDiagnoseCarbRatioBlockEvidence,
    fetchDiagnoseFindings,
    fetchDiagnoseCarbRatioHistoryEvents,
    fetchDiagnoseFindingCasePreparation,
    fetchDiagnoseFindingCase,
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
export const fetchDiagnoseBasalNightEvidence = _defaults.fetchDiagnoseBasalNightEvidence;
export const fetchDiagnoseIsfRestWindowEvidence = _defaults.fetchDiagnoseIsfRestWindowEvidence;
export const fetchDiagnoseCarbRatioBlockEvidence =
  _defaults.fetchDiagnoseCarbRatioBlockEvidence;
export const fetchDiagnoseFindings = _defaults.fetchDiagnoseFindings;
export const fetchDiagnoseCarbRatioHistoryEvents =
  _defaults.fetchDiagnoseCarbRatioHistoryEvents;
export const fetchDiagnoseFindingCasePreparation = _defaults.fetchDiagnoseFindingCasePreparation;
export const fetchDiagnoseFindingCase = _defaults.fetchDiagnoseFindingCase;
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
