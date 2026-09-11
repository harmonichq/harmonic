// The one authenticated client, re-exported for this surface.
//
// frontend/data.js owns every endpoint path, the Bearer-token attach and the
// error unwrap, for v1 and v2 alike (#389 desktop build contracts). This module
// adds no fetching of its own: it exists so a v2 component imports ONE module
// and the client stays single-sourced. A second client here would be a duplicate
// implementation of a fact that already has an owner.
//
// Chunks 2 and 3 extend this list with the reads and writes their destinations
// need, adding the functions themselves to frontend/data.js in that module's
// idiom and naming them here.
export {
  ApiTransportError,
  // the desk's own clock and recorded-day bounds
  fetchStatus,
  fetchDayNavigator,
  // one day: its chronology, its episodes and the carbs logged by hand
  fetchTimeline,
  fetchModelView,
  fetchCarbs,
  createCarb,
  deleteCarb,
  // Carb questions
  fetchPrompts,
  answerPrompt,
  clearPrompt,
  // the Guide's catalog and its authored how-tos
  fetchCatalog,
  fetchKbArticle,
  // App settings and the detected pump schedule
  fetchCredentials,
  saveCredentials,
  fetchPumpSettings,
  fetchAnalysis, fetchScenarios, fetchExploreTimeOfDay, fetchExploreExposures,
  fetchOutcomesTrend, fetchDiagnoseFindings, fetchDiagnoseFindingCasePreparation,
  fetchDiagnoseFindingCase, fetchDiagnoseBasalNightEvidence,
  fetchDiagnoseIsfRestWindowEvidence, fetchDiagnoseCarbRatioBlockEvidence,
  fetchDiagnoseCarbRatioHistoryEvents,
  applyPlan, loadPlan, loadPlanHistory, savePlanDraft, withdrawPlan,
  fetchGuidance, setGuidancePreference, restoreGuidancePreference,
  fetchVerifyTrials, finishTrial, concludeTrial, fetchFocuses, pinFocus, resolveFocus,
} from '../frontend/data.js';
