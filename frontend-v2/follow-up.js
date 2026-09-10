// Following a change through: the setting Trial, the Pattern Focus, their
// readiness, and the ending the wearer records (HV2-12, HV2-22 to HV2-27).
//
// Ported from the ★ LOCKED desktop prototype — the Trial stage and its progress,
// evidence and conclusion (harmonic-v2-glucose.js:538-640) and the Focus stage's
// two served tables and its record (harmonic-v2-glucose-focus.js:148-260) —
// under the harmonic-v2-desktop lock manifest. The prototype held the pin, the
// conclusion and the ending in page memory and said so in its own ★ header;
// every one of them is a durable backend write here, which is the substitution
// this port exists to make.
//
// THE ONE RULE THIS MODULE IS BUILT AROUND: readiness is TWO different backend
// facts, and the prototype's single label hid that.
//
//   selected.readiness          watch maturity — "Maturing" / "Ready to judge".
//                               LIFECYCLE METADATA. It is not evidence readiness,
//                               it is not a comparison cutoff, and it never
//                               supplies a criterion (HV2-22, HV2-24).
//   comparison.readiness.{before,after}
//                               the type-specific EVIDENCE readiness, and the
//                               only place a criterion lives. It arrives only
//                               under assessment=retained, which the server
//                               rejects 422 without a selection — so it takes a
//                               SECOND request and can never be a roster field.
//
// AND THE ARMS ARE DIFFERENT SHAPES, which is why nothing here is derived:
//
//   setting arm  {unit, required, observed, contributing_dates, criterion_met,
//                 reason, available, elapsed_days}
//   Pattern arm  {count, gate, unit, verdict, reason, contributing_dates,
//                 criterion_met, measured, unmeasured, elapsed_days}.
// Legacy non-Pattern records retain their served duration criterion. Pattern
// behavior measurement counts belong to adherence, not the opportunity meter.
// No browser count comparison supplies readiness or permission.
//
// PUBLISHED FOR THE CHANGES COMPOSITION (#389 chunk 3):
//
//   configureFollowUp({ openRecord })             connect the saved record
//   mount(host, deps)                              the follow-up arm's content
//   readinessSection, comparisonTables,            the comparison renderers one
//   evidenceFigure, figureColors,                  record read shares
//   mountComparisonChart, dailyEvidence
import { heroOption } from '../frontend/verify-workstation-chart.js';
import {
  fetchVerifyTrials, finishTrial, resolveFocus,
} from './client.js';
import {
  date, desk, e, emptyFrame, errorFrame, loadingFrame, nameplate, readingHeader, shortDate, stamp,
} from './frame.js';
import { stagePrior } from './plan-view.js';
import { hold, narrow, navigate, render, view } from './routes.js';

const SETTING_NAME = {
  basal_rate: 'Basal', carb_ratio: 'Carb ratio', isf: 'Correction factor',
  target_bg: 'Target glucose', profile: 'Whole profile',
};
const LEVER_NAME = {
  over_treated_low: 'Over-treated low', correction_on_iob: 'Correction on active insulin',
  correction_stacking: 'Stacked corrections', carb_undercount: 'Carb undercount',
  late_bolus: 'Late bolus', meal_over_delivery: 'Meal over-delivery',
  meal_bolus_short: 'Meal bolus fell short', missed_meal: 'Missed or unannounced meal',
  user_override: 'Override of the pump’s dose',
};
const UNIT = { basal_rate: 'U/h', carb_ratio: 'g/U', target_bg: 'mg/dL' };
// The served inference states. `favorable` exists per outcome row only: the
// overall assessment is one of these three and never favourable, so no summary
// on this surface can claim a favourable ending (lock "Backend binding notes").
const STATE_WORD = { concerning: 'Concerning', unclear: 'Unclear', context: 'Context only', favorable: 'Favourable' };
const PERIOD_WORD = { before: 'Before', after: 'After' };
const BOUNDARY_WORD = {
  available_history: 'Available history', pin: 'Pinned', data_tail: 'Data read through',
  data_cutoff: 'Data read through', setting_change: 'Setting change',
  previous_relevant_setting_change: 'Previous relevant setting change',
  next_relevant_setting_change: 'Next relevant setting change',
  effective_ending: 'Effective ending', '90_day_cap': '90-day limit',
  missing_continuous_setting_history: 'Continuous setting history unavailable',
};

/** One programmed value in its own unit; a correction factor reads insulin first. */
const settingValue = (parameter, value) => {
  if (value == null) return 'not recorded';
  if (parameter === 'isf') return `1 U : ${value} mg/dL`;
  return `${value} ${UNIT[parameter] || ''}`.trim();
};

// A served count that may be fractional — I:C ownership weights are not rounded
// into whole runs — printed at the precision it arrived with.
const count = (value) => (value == null ? '—' : Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2))));
const days = (value) => (value == null ? '—' : `${Math.floor(value)}`);
const percent = (value) => (value == null ? '—' : `${value}%`);

// The prototype's own figure palette (harmonic-v2-glucose.js:115-126), read off
// the live desk rather than transcribed: the shipped Verify hero takes a plain
// dict, and these are the tokens the locked prototype resolved for it.
export function figureColors(root) {
  const host = root || document.documentElement;
  const v = (name) => getComputedStyle(host).getPropertyValue(name).trim();
  const mix = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
  return {
    text: v('--mk-text'), muted: v('--mk-muted'), line: v('--mk-line'), accent: v('--mk-primary'),
    manual: v('--ck-manual') || '#93701B',
    accentSoft: mix(v('--mk-primary'), 20), mutedSoft: mix(v('--mk-muted'), 20),
    targetFill: mix(v('--mk-ok'), 8), targetEdge: mix(v('--mk-ok'), 55),
    targetText: `color-mix(in srgb, ${v('--mk-ok')} 85%, ${v('--mk-text')})`,
    rail: v('--ck-rail'), mono: v('--ck-mono'),
  };
}

/* ============================ the comparison ============================== */

/**
 * ONE readiness arm, rendered by the fields that arrived.
 *
 * A `verdict` identifies a Pattern arm; otherwise `required` identifies a
 * setting arm, including settings with an elapsed requirement. The remaining
 * legacy Focus shape gets its duration and measured population. No branch
 * compares a count to a requirement: `criterion_met` and `reason` are served.
 */
export function readinessArm(name, arm, { lever = null } = {}) {
  if (!arm) {
    return `<div class="gf-figure" data-readiness="${e(name)}">${e(PERIOD_WORD[name] || name)}<small>no readiness served for this period</small></div>`;
  }
  const armKind = 'verdict' in arm ? 'pattern' : 'required' in arm ? 'setting' : 'legacy-focus';
  const dates = arm.contributing_dates || [];
  const met = arm.criterion_met === true;
  // The criterion line: what was observed, in the unit the backend named, and
  // the requirement it named beside it. The legacy Focus arm has no required count, so
  // it prints its measured and unmeasured opportunities in that place.
  const requirement = armKind === 'setting'
    ? `<small data-required="${e(count(arm.required))}">required</small>` : '';
  const figure = armKind === 'legacy-focus'
    ? `${e(count(arm.observed))} ${e(arm.unit)}<small data-focus-population>${e(count(arm.measured))} measured · ${e(count(arm.unmeasured))} unmeasured</small>`
    : `${e(count(armKind === 'pattern' ? arm.count : arm.observed))} of ${e(count(armKind === 'pattern' ? arm.gate : arm.required))} ${e(arm.unit)}${requirement}`;
  // Elapsed days are reported alongside the evidence count and are never
  // labelled as observations of their own.
  const duration = armKind === 'legacy-focus'
    ? `<p class="gf-meta" data-elapsed>${e(days(arm.elapsed_days))} of ${e(count(arm.required_elapsed_days))} days elapsed</p>`
    : `<p class="gf-meta" data-elapsed>${e(days(arm.elapsed_days))} days elapsed${arm.required_elapsed_days != null ? ` of ${e(count(arm.required_elapsed_days))} required` : ''}</p>`;
  // `available` belongs to the setting arms only. The Focus override omits it,
  // and this surface does not invent one for it.
  const availability = 'available' in arm
    ? `<p class="gf-meta" data-readiness-available="${arm.available ? 'true' : 'false'}">${arm.available
        ? 'Evidence for this period is available.'
        : `This period's evidence is unavailable: ${e(arm.reason || 'not served')}.`}</p>`
    : '';
  const supporting = dates.length
    ? `<p class="gf-meta">Contributing ${dates.length === 1 ? 'date' : 'dates'} · ${dates.length}</p><div class="gf-actions" data-supporting="${e(name)}">${dates.slice(0, 8).map((iso) => `<button class="gf-btn" data-day-date="${e(iso)}"${lever ? ` data-day-lever="${e(lever)}"` : ''} data-day-subject="${e(name)}">${e(shortDate(iso))}</button>`).join('')}</div>`
    : '<p class="gf-meta">No contributing date has qualified in this period yet.</p>';
  return `<div data-readiness="${e(name)}" data-criterion-met="${met ? 'true' : 'false'}">
    <div class="gf-figure">${figure}</div>
    ${duration}
    ${armKind === 'pattern' ? `<p class="gf-meta" data-opportunity-verdict="${e(arm.verdict)}">${e(arm.verdict)}${arm.reason ? ` · ${e(arm.reason)}` : ''}</p>` : ''}
    <p class="gf-meta" data-criterion>${met ? 'Criterion met.' : `Not met — ${e(arm.reason || 'collecting')}.`}</p>
    ${availability}
    ${supporting}</div>`;
}

/**
 * The evidence readiness of both arms, plus what the comparison concluded.
 *
 * An unavailable comparison carries no readiness at all; that is a served state,
 * so it says so and offers no meter (HV2-31). Readable values and progress stay
 * visible either way — this surface is not final-only (HV2-23).
 */
export function readinessSection(comparison, { kind = 'trial', heading = 'Evidence accrued' } = {}) {
  if (!comparison) {
    return `<section class="gf-section" data-part="readiness"><h3>${e(heading)}</h3>
      <p class="gf-meta" data-readiness-state="not-requested">No comparison has been read for this record yet.</p></section>`;
  }
  const availability = comparison.availability || {};
  const readiness = comparison.readiness;
  const inference = comparison.assessment || {};
  // The habit's lever rides on its adherence rows, not on the comparison, and a
  // supporting date carries it so the Day it opens knows which behavior it is
  // being read for.
  const adherence = comparison.adherence || {};
  const lever = kind === 'focus'
    ? ((adherence.before || {}).lever || (adherence.after || {}).lever || null)
    : null;
  const arms = readiness
    ? `${readinessArm('before', readiness.before, { lever })}${readinessArm('after', readiness.after, { lever })}`
    : `<p class="gf-meta" data-readiness-state="unavailable">No readiness is served for this comparison: ${e(availability.reason || 'not served')}.</p>`;
  return `<section class="gf-section" data-part="readiness"><h3>${e(heading)} <span class="meta">${e(kind === 'focus' ? 'opportunities' : 'type-specific')}</span></h3>
    <p class="gf-meta" data-availability="${e(availability.state || 'unavailable')}">${availability.state === 'available'
      ? 'This comparison is available.'
      : `This comparison is unavailable: ${e(availability.reason || 'not served')}.`}</p>
    ${arms}
    ${inference.state ? `<dl><dt>Read of the two periods</dt><dd data-inference="${e(inference.state)}">${e(STATE_WORD[inference.state] || inference.state)}</dd></dl>${inference.reason ? `<p class="gf-meta">${e(inference.reason)}</p>` : ''}` : ''}
    <p class="gf-meta">Readiness is what has been observed, not a judgement. A period may end without a clear answer.</p>
    ${(comparison.limitations || []).map((text) => `<p class="gf-meta">${e(text)}</p>`).join('')}</section>`;
}

/**
 * The exact periods the two arms own, with the boundary the backend chose.
 *
 * A setting change's later period is its Trial, which is what the reader calls
 * it; a habit's is simply After its pin. Both are the same served envelope.
 */
export function periodsSection(comparison, kind = 'trial') {
  const periods = (comparison || {}).periods || {};
  const word = { before: 'Before', after: kind === 'focus' ? 'After' : 'Trial' };
  if (!periods.before || !periods.after) {
    return `<section class="gf-section" data-part="periods"><h3>Evidence periods</h3>
      <p class="gf-meta">No period is served for this comparison, so neither ${word.before} nor ${word.after} has bounds to show.</p></section>`;
  }
  const row = (name) => {
    const period = periods[name];
    const reasons = period.boundary_reasons || {};
    const boundaries = [reasons.start, reasons.end].map(reason => BOUNDARY_WORD[reason]).filter(Boolean).join(' → ');
    return `<dt>${e(word[name])}</dt><dd data-period="${e(name)}">${e(stamp(period.start))} to ${e(stamp(period.end))}${boundaries ? ` <small>${e(boundaries)}</small>` : ''}</dd>`;
  };
  return `<section class="gf-section" data-part="periods"><h3>Evidence periods</h3>
    <dl>${row('before')}${row('after')}</dl>
    <p class="gf-meta">Pump-local time, half-open. Observations are limited to these periods; data was read to ${e(stamp(periods.after.data_cutoff))}.</p></section>`;
}

/**
 * The served outcome rows: one Before/After table.
 *
 * A missing value is read against its own population — a served zero, a zero
 * denominator and an unavailable measurement are three different cells and none
 * of them becomes another (HV2-26, HV2-31). Each row keeps its own assessment
 * state, which is the only place `favorable` can appear.
 */
export function outcomesTable(comparison, kind) {
  const outcomes = (comparison || {}).outcomes || [];
  if (!outcomes.length) {
    return '<p class="gf-meta" data-outcomes="none">No glucose outcome is served for these periods.</p>';
  }
  // An absent value is read against its OWN population, in the prototype's own
  // words (harmonic-v2-glucose.js:658-661): a period with no meals says "no
  // meals in period", one with no readings says "no readings", and a population
  // that exists but could not be measured is "unavailable". None of the three
  // becomes another, and none becomes a zero.
  const emptyValue = (denominator) => {
    if (/meal/i.test(denominator)) return 'no meals';
    if (/reading/i.test(denominator)) return 'no readings';
    return `no ${denominator}`;
  };
  const emptyNote = (denominator) => (/meal/i.test(denominator)
    ? 'no meals in period' : `no ${denominator} in period`);
  const cell = (row, side) => {
    const value = row[side];
    const n = (row.denominators || {})[side];
    if (value == null) {
      return `<td class="v">${n ? 'unavailable' : e(emptyValue(row.denominator))}<small>${e(n ? `${n} ${row.denominator}` : emptyNote(row.denominator))}</small></td>`;
    }
    return `<td class="v">${e(row.unit === '%' ? percent(value) : `${value} ${row.unit}`)}<small>${e(n != null ? `${n} ${row.denominator}` : row.denominator)}</small></td>`;
  };
  // Mapped outcomes lead; the served context rows follow and are marked as
  // context so they are never read as the Focus's own result.
  const ordered = [...outcomes].sort((a, b) => (a.role === 'mapped_outcome' ? 0 : 1) - (b.role === 'mapped_outcome' ? 0 : 1));
  // The head is the prototype's: a setting change reads Before against Trial,
  // and the habit's second table is its Glucose outcomes.
  const head = kind === 'focus'
    ? '<th scope="col">Glucose outcomes</th><th scope="col">Before</th><th scope="col">After</th>'
    : '<th scope="col">Glucose observations</th><th scope="col">Before</th><th scope="col">Trial</th>';
  return `<table class="gf-table gf-trend" data-table="outcomes"><thead><tr>${head}<th scope="col">Read</th></tr></thead><tbody>${ordered.map((row) => `<tr class="${row.role === 'mapped_outcome' ? 'gf-target' : ''}" data-outcome="${e(row.key)}"${row.role ? ` data-role="${e(row.role)}"` : ''}><td>${e(row.label)}<small>${e(row.role === 'context' ? 'context' : row.role === 'mapped_outcome' ? 'mapped outcome' : row.denominator)}</small></td>${cell(row, 'before')}${cell(row, 'after')}<td class="v" data-outcome-state="${e((row.assessment || {}).state || 'unclear')}">${e(STATE_WORD[(row.assessment || {}).state] || 'unclear')}<small>${e(row.difference == null ? 'no difference estimable' : `difference ${row.difference > 0 ? '+' : ''}${row.difference}`)}</small></td></tr>`).join('')}</tbody></table>`;
}

/**
 * The habit's own observed behavior, as its own table.
 *
 * Adherence is NOT folded into the glucose outcomes, and a missing behavior
 * measurement is never filled in from them (HV2-26). Zero opportunities, an
 * absent measurement against a nonzero population, and a positive denominator
 * with zero unwanted events stay three distinct readings.
 */
export function adherenceTable(comparison) {
  const adherence = (comparison || {}).adherence;
  if (!adherence) return '';
  const cell = (side) => {
    const arm = adherence[side] || {};
    const availability = arm.availability || {};
    const unmeasured = arm.unmeasured_opportunities || 0;
    if (!arm.opportunities) {
      return `<td class="v" data-adherence="${e(side)}" data-adherence-state="zero-opportunities">no ${e(arm.denominator || 'opportunities')}<small>nothing to compare</small></td>`;
    }
    if (arm.rate == null) {
      return `<td class="v" data-adherence="${e(side)}" data-adherence-state="unavailable">unavailable<small>${e(availability.reason || 'measurement unavailable')} · ${e(count(arm.measured_opportunities))} of ${e(count(arm.opportunities))} measured</small></td>`;
    }
    return `<td class="v" data-adherence="${e(side)}" data-adherence-state="available">${e(arm.numerator)} of ${e(arm.opportunities)}<small>${e(percent(Math.round(arm.rate * 1000) / 10))} of ${e(arm.denominator)}${unmeasured ? ` · ${e(count(unmeasured))} unmeasured` : ''}</small></td>`;
  };
  const harm = (side) => {
    const arm = adherence[side] || {};
    const availability = arm.harm_availability || {};
    if (availability.state !== 'available') {
      return `<td class="v" data-harm="${e(side)}" data-harm-state="unavailable">unavailable<small>${e(availability.reason || 'not measured')}</small></td>`;
    }
    return `<td class="v" data-harm="${e(side)}" data-harm-state="available">${e(arm.harm)}<small>attributed harm</small></td>`;
  };
  const assessment = adherence.assessment || {};
  const lever = (adherence.before || {}).lever || (adherence.after || {}).lever;
  return `<table class="gf-table gf-trend" data-table="adherence"><thead><tr><th scope="col">Observed behavior</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Read</th></tr></thead><tbody>
    <tr class="gf-target"><td>${e(LEVER_NAME[lever] || lever)}<small>the intended behavior · ${e((adherence.before || {}).denominator || 'opportunities')}</small></td>${cell('before')}${cell('after')}<td class="v" data-adherence-read="${e(assessment.state || 'unclear')}">${e(STATE_WORD[assessment.state] || 'unclear')}<small>${e(assessment.unit || 'proportion')}</small></td></tr>
    <tr><td>Attributed harm<small>measured separately from the behavior</small></td>${harm('before')}${harm('after')}<td class="v">—<small>no rate</small></td></tr>
    </tbody></table>`;
}

/** The behavior table, then the mapped outcomes, in that order: the habit leads
    with what it intended, not with glucose (HV2-26). */
export function comparisonTables(comparison, kind) {
  return kind === 'focus'
    ? `${adherenceTable(comparison)}${outcomesTable(comparison, kind)}`
    : outcomesTable(comparison, kind);
}

/**
 * The other view of a setting change's evidence: one served day at a time,
 * ported from the prototype's `dailyEvidence` (harmonic-v2-glucose.js:678-685).
 *
 * A day with readings is not a complete day of data, and it says so: this view
 * reads what was recorded on one date and changes no count, no criterion and no
 * maturity.
 */
export function dailyEvidence(detail, { period, day }) {
  const rows = ((detail.day_rows || {})[period]) || [];
  if (!rows.length) {
    return `<div class="gf-select"><label>Period <select data-select="evidence-period">${['before_period', 'trial_period'].map((key) => `<option value="${key}"${period === key ? ' selected' : ''}>${key === 'before_period' ? 'Before' : 'Trial'}</option>`).join('')}</select></label></div>
      <div class="gf-day-read" aria-live="polite"><p class="gf-meta">No day was recorded in this period. A day with readings is not necessarily a complete day of data.</p></div>`;
  }
  const index = Math.min(Math.max(day, 0), rows.length - 1);
  const row = rows[index];
  const value = (n) => (n == null ? 'no readings' : percent(n));
  return `<div class="gf-select"><label>Period <select data-select="evidence-period">${['before_period', 'trial_period'].map((key) => `<option value="${key}"${period === key ? ' selected' : ''}>${key === 'before_period' ? 'Before' : 'Trial'}</option>`).join('')}</select></label><label>Available day <select data-select="evidence-day">${rows.map((item, i) => `<option value="${i}"${index === i ? ' selected' : ''}>${e(date(item.date))}</option>`).join('')}</select></label></div>
    <div class="gf-day-read" aria-live="polite"><div class="gf-figure">${e(date(row.date))}<small>${e(row.n_readings)} glucose readings</small></div><table class="gf-table"><tbody><tr><td>Time in range</td><td class="v">${e(value(row.tir))}</td></tr><tr><td>Time below range</td><td class="v">${e(value(row.tbr))}</td></tr><tr><td>Meals</td><td class="v">${e(row.meals)}</td></tr></tbody></table><p>A day with readings is not necessarily a complete day of data. The Trial’s maturity stays unchanged.</p></div>`;
}

/** The two views of a setting change's evidence, as the prototype's segment. */
function viewSegment(mode) {
  return `<div class="seg" role="group" aria-label="View"><button data-mode="summary" aria-pressed="${mode === 'summary'}">Before / Trial</button><button data-mode="daily" aria-pressed="${mode === 'daily'}">Available days</button></div>`;
}

/* ------------------------------------------------------------- the figure */

/**
 * The chart host. Its figure is the shipped Verify hero over the comparison's
 * own clock envelopes, so no facsimile stands behind any reading here.
 *
 * The selectors and the legend words are the prototype's
 * (harmonic-v2-glucose.js:545): a setting change's figure is
 * `[data-trial-chart]` and a habit's is `[data-focus-chart]`, and the ribbon
 * names the marks the figure draws or says plainly that there is nothing paired
 * to compare yet.
 */
export function evidenceFigure(comparison, kind, colors) {
  const pairs = comparisonPairs(comparison);
  const palette = colors || { accentSoft: 'currentColor', mutedSoft: 'currentColor' };
  // Three states, and they are not the same thing. A paired figure names its
  // two marks. A Before-only figure says the later period has no readings yet.
  // And a saved ending keeps no clock envelope at all — the snapshot retains the
  // rows and the assessment, not the curve — so it says that rather than
  // reporting an absence of readings it cannot actually see.
  const marks = pairs.paired.length
    ? `<span><i style="background:${palette.accentSoft}"></i>${kind === 'focus' ? 'After above Before' : 'Trial above Before'}</span><span><i style="background:${palette.mutedSoft}"></i>${kind === 'focus' ? 'After below Before' : 'Trial below Before'}</span>`
    : pairs.before.length
      ? `<span>no ${kind === 'focus' ? 'later' : 'Trial'} readings to compare yet</span>`
      : '<span>no clock envelope is retained for this record</span>';
  const attribute = kind === 'focus' ? 'data-focus-chart' : 'data-trial-chart';
  return `<div class="gf-fig ${kind === 'focus' ? 'gf-fig-focus' : 'gf-fig-trial'}" ${attribute}="${e(kind)}"><div class="gf-chart-seat"><div class="gf-chart" role="img" aria-label="Median glucose by clock, before against after"></div></div><div class="ds-chart-legend">${marks}<span>median glucose by clock · ${e(pairs.days)}</span></div></div>`;
}

/**
 * The two clock envelopes ONE comparison served, paired where both sides have a
 * bin — the shipped Verify binding (verify-workstation.js renderHero). A side
 * with no readings pairs nothing and stays a Before-only figure rather than
 * drawing an empty line.
 *
 * The comparison is passed in rather than chosen here, so the figure and the
 * tables beneath it always read the same one. Letting the figure prefer a
 * recomputed comparison while the rows showed a saved snapshot would put two
 * generations on one stage.
 */
export function comparisonPairs(comparison) {
  const views = (comparison || {}).views || {};
  const periods = (comparison || {}).periods || {};
  const rows = (name) => ((views[name] || {}).clock || []).filter((row) => row.n > 0);
  const minutes = (row) => parseInt(String(row.t).slice(0, 2), 10) * 60 + parseInt(String(row.t).slice(3, 5), 10);
  const before = rows('before');
  const after = rows('after');
  const byT = new Map(before.map((row) => [String(row.t), row]));
  const paired = after.filter((row) => byT.has(String(row.t))).map((row) => ({
    t: minutes(row), b: byT.get(String(row.t)).med, v: row.med,
    d: row.med - byT.get(String(row.t)).med,
  }));
  const span = (period) => (period ? `${shortDate(period.start)}–${shortDate(period.end)}` : 'unavailable');
  return {
    paired,
    before: before.map((row) => [minutes(row), row.med]),
    beforeLabel: `Before · ${span(periods.before)}`,
    afterLabel: `After · ${span(periods.after)}`,
    days: `${before.length} → ${after.length} half-hours read`,
  };
}

/** Seat the hero on the rendered figure, and hand its teardown to the router. */
export function mountComparisonChart(host, comparison, holdCleanup = hold) {
  const figure = host.querySelector('[data-trial-chart], [data-focus-chart]');
  if (!figure || !globalThis.echarts) return;
  const element = figure.querySelector('.gf-chart');
  const chart = globalThis.echarts.init(element);
  holdCleanup(() => chart.dispose());
  const update = () => {
    const bound = comparisonPairs(comparison);
    const option = heroOption(figureColors(), {
      pairs: bound.paired, arc: false,
      beforeLabel: bound.beforeLabel, trialLabel: bound.afterLabel,
    });
    if (!bound.paired.length) {
      const beforeSeries = option.series.find((series) => series.name === bound.beforeLabel);
      const afterSeries = option.series.find((series) => series.name === bound.afterLabel);
      if (beforeSeries) beforeSeries.data = bound.before;
      if (afterSeries) afterSeries.name = 'After · no readings yet';
      option.legend.data = [bound.beforeLabel, 'After · no readings yet'];
    }
    chart.setOption(option, true);
    chart.resize();
  };
  update();
  const observer = new ResizeObserver(update);
  observer.observe(element);
  holdCleanup(() => observer.disconnect());
}

/* ========================= watch maturity, separately ===================== */

/**
 * The watch's own lifecycle progress: fourteen days to maturity, twenty-eight to
 * expiry. Retained metadata, and labelled as such — it supplies no evidence
 * readiness and it truncates no comparison bound (HV2-24).
 *
 * The bar is clamped to its maximum and never overfilled: this is the B-08
 * repair, and "15 of 14 days" must not return.
 */
export function maturitySection(detail) {
  const maturing = detail.maturing;
  const readiness = detail.readiness || {};
  if (!maturing) {
    return `<section class="gf-section" data-part="maturity"><h3>Watch maturity <span class="meta">lifecycle</span></h3>
      <p class="gf-meta">This record carries no watch maturity.</p></section>`;
  }
  const met = maturing.days_elapsed >= maturing.days_required;
  const gaps = `${maturing.gap_count} data ${maturing.gap_count === 1 ? 'gap' : 'gaps'}`;
  const figure = met
    ? `${e(maturing.days_elapsed)} days<small>${e(maturing.days_required)} required · ${e(gaps)}</small>`
    : `${e(maturing.days_elapsed)} of ${e(maturing.days_required)} days<small>${e(gaps)}</small>`;
  return `<section class="gf-section" data-part="maturity"><h3>Watch maturity <span class="meta">lifecycle</span></h3>
    <div class="gf-figure">${figure}</div>
    <progress value="${Math.min(maturing.days_elapsed, maturing.days_required)}" max="${maturing.days_required}" aria-label="Trial progress"></progress>
    ${readiness.label ? `<p class="gf-meta" data-maturity-label>${e(readiness.label)}</p>` : ''}
    ${readiness.message ? `<p class="gf-meta">${e(readiness.message)}</p>` : ''}
    <p class="gf-meta">Maturity is where this watch is in its own lifecycle. It is not the evidence criterion, and it does not end the observation.</p></section>`;
}

/* ============================== the conclusion ============================ */

/**
 * The one required, user-written field. The app puts no words in the wearer's
 * mouth: the control stays disabled until the text is non-blank, and nothing is
 * pre-filled (HV2-25).
 */
export function conclusionForm(state, { label, note }) {
  const written = state.conclusion || '';
  return `<form id="finish-form" data-form="finish"><label for="conclusion">Conclusion</label><textarea id="conclusion" required aria-required="true">${e(written)}</textarea><div class="gf-actions"><button class="gf-btn primary" type="submit" ${written.trim() ? '' : 'disabled'}>${e(label)}</button></div></form><p class="gf-note">${e(note)}</p>`;
}

/**
 * A failed durable write, shown as a failure. The form, the wearer's own words
 * and a Retry all stay; nothing is recorded, and nothing claims to be.
 */
export function saveErrorBlock(state) {
  const failure = state.failure;
  if (!failure) return '';
  return `<div class="gf-status" role="alert" data-save-error="${e(failure.operation)}"><p class="gf-error">${e(failure.headline)}: ${e(failure.message)}</p><p class="gf-meta">Nothing was recorded. Your conclusion is still here.</p><div class="gf-actions"><button class="gf-btn primary" type="submit" form="finish-form" data-retry-save="${e(failure.operation)}" ${(state.conclusion || '').trim() ? '' : 'disabled'}>Retry</button></div></div>`;
}

/* ================================ the state =============================== */

const memory = {
  roster: null, detail: null, retained: null,
  error: null, loading: null, draftFor: null, conclusion: '', failure: null, attempt: null,
  // Which of the two views of a setting change's evidence is shown, and which
  // served day the Available-days read is on. Route-owned view state, not
  // anything the backend decides.
  view: { mode: 'summary', period: 'trial_period', day: 0 },
};

let openSavedRecord = null;
export function configureFollowUp({ openRecord }) { openSavedRecord = openRecord; }
let arrival = null;
let saving = false;

let readGeneration = 0;
function load(key, run) {
  if (memory.loading?.key === key) return;
  const token = ++readGeneration;
  memory.loading = { key, token };
  memory.error = null;
  run(token).then(() => {
    if (readGeneration !== token) return;
    memory.loading = null;
    render();
  }).catch((error) => {
    if (readGeneration !== token) return;
    memory.loading = null;
    memory.error = error;
    render();
  });
}

async function loadRoster(token = readGeneration) {
  const roster = await fetchVerifyTrials();
  if (readGeneration !== token) return;
  memory.roster = {
    revision: roster.input_revision, admission: roster.admission,
    trials: roster.trials || [], focuses: roster.focuses || [],
  };
}

// The active subject's two reads, deliberately sequential: the record first,
// then the retained comparison it does not carry. The second one is the only
// place evidence readiness lives, and the server refuses it without a selection.
async function loadActive(kind, id, token) {
  const original = await fetchVerifyTrials({ kind, selected: String(id) });
  const retained = await fetchVerifyTrials({ kind, selected: String(id), assessment: 'retained' });
  if (readGeneration !== token) return;
  const draftFor = `${kind}:${id}`;
  if (memory.draftFor !== draftFor) {
    memory.draftFor = draftFor; memory.conclusion = ''; memory.failure = null; memory.attempt = null;
  }
  const row = (kind === 'focus' ? memory.roster.focuses : memory.roster.trials).find(row => String(row.id) === String(id));
  memory.detail = { ...row, ...original.selected, kind, id: String(id), revision: retained.input_revision };
  memory.roster.revision = retained.input_revision;
  memory.roster.admission = retained.admission;
  memory.retained = retained.selected.reassessment || null;
}

/* -------------------------------------------------------------- the writes */

const attemptId = (operation) => {
  if (memory.attempt && memory.attempt.operation === operation && memory.attempt.target === memory.draftFor) return memory.attempt.id;
  const id = `${operation}:${globalThis.crypto && globalThis.crypto.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  memory.attempt = { operation, id, target: memory.draftFor };
  return id;
};

const failureMessage = (error) => {
  const detail = error && error.detail;
  if (detail && typeof detail === 'object' && detail.code) return `${detail.code} (${error.status})`;
  if (typeof detail === 'string' && detail) return detail;
  return error && error.message ? error.message : 'no response from the store';
};

/**
 * Record the ending. The revision sent is the one the rendered evidence was read
 * at, which is what lets the backend refuse a decision made against stale
 * input; a Retry re-reads first and sends the current one.
 */
async function submitEnding({ retry } = {}) {
  const detail = memory.detail;
  const conclusion = (memory.conclusion || '').trim();
  if (!detail || !conclusion || saving) return;
  saving = true;
  const operation = detail.kind === 'focus' ? 'resolve' : 'finish';
  const id = attemptId(operation);
  try {
    if (retry) await loadRoster();
    const body = { request_id: id, input_revision: memory.roster.revision, conclusion };
    if (detail.kind === 'focus') await resolveFocus(detail.id, body);
    else await finishTrial(detail.id, body);
    memory.failure = null;
    memory.attempt = null;
    memory.conclusion = '';
    // The finished record opens itself first, so the ending is acknowledged
    // before any other concern is offered (HV2-28). The roster and the detail
    // are dropped so the next arrival re-reads the seat the ending just freed.
    memory.roster = null;
    memory.detail = null;
    memory.retained = null;
    if (openSavedRecord) openSavedRecord(detail.kind, detail.id);
    view.focusAfterRender = '.gf-reading > header h2';
  } catch (error) {
    memory.failure = {
      operation,
      headline: operation === 'resolve' ? 'Ending the Focus failed' : 'Recording the conclusion failed',
      message: failureMessage(error),
    };
    view.focusAfterRender = `[data-retry-save="${operation}"]`;
  }
  saving = false;
  render();
}

/* =============================== the frames =============================== */

const trialTitle = (detail) => {
  const changes = detail.changes || [];
  if (changes.length !== 1) return `Profile change · ${changes.length} settings`;
  const [change] = changes;
  const name = `${SETTING_NAME[change.parameter] || change.parameter}${change.slot && !change.uniform ? ` ${change.slot}` : ''}`;
  return change.before == null
    ? `${name} · ${settingValue(change.parameter, change.after)}`
    : `${name} · ${settingValue(change.parameter, change.before)} → ${settingValue(change.parameter, change.after)}`;
};

/** The Revert route, exactly as the backend supplied it. Harmonic never
    programmes the pump, so this is a manual-entry route and says so (HV2-25). */
export function planRouteSection(detail, { canOpen }) {
  const route = detail.plan_route;
  if (!route) return '';
  return `<section class="gf-section" data-part="plan-route"><h3>Revert to Plan</h3>
    <p data-plan-route="${e(route.mode)}">${e(route.label)}</p>
    <p class="gf-meta">${e(route.message)}</p>
    ${canOpen ? '<div class="gf-actions"><button class="gf-btn" data-action="plan-route">Open Plan</button></div>' : ''}</section>`;
}

/** The active setting Trial: its evidence on the stage, its readiness, its
    maturity and its conclusion in the reading pane. */
function trialFrame(state) {
  const { detail, retained, canFinish, view: shown } = state;
  const comparison = (retained || {}).comparison || null;
  const body = shown.mode === 'daily'
    ? dailyEvidence(detail, { period: shown.period, day: shown.day })
    : comparisonTables(comparison, 'trial');
  const stage = `<section class="pane gf-stage gf-stage-trial" aria-label="Trial evidence">${nameplate({
    kicker: `Trial · <b>${e((detail.readiness || {}).label || 'Active')}</b>`,
    title: e(trialTitle(detail)),
    sub: `Detected ${e(stamp(detail.changed_at))}`,
    end: '<button class="gf-btn" data-follow-up-inspect>Inspect nights</button><button class="gf-btn" data-action="history">View change record</button>',
  })}
    <div class="instruments"><div class="instrument"><span class="cap">${comparisonPairs(comparison).paired.length ? 'Before → Trial' : 'Before only'}</span><span class="meta">median glucose by clock</span></div><div class="instrument gf-tools"><span class="meta">Pump-local time</span></div></div>
    ${evidenceFigure(comparison, 'trial', figureColors())}
    <div class="instruments"><div class="instrument"><span class="cap">View</span>${viewSegment(shown.mode)}</div><div class="instrument gf-tools">${narrow() ? '' : '<span class="meta">Advisory only</span>'}</div></div>
    <div class="gf-scroll">${body}</div></section>`;
  const reading = `<aside class="pane gf-reading" aria-label="This trial">${readingHeader('This trial', e((detail.readiness || {}).label || 'Active'))}<div class="gf-pane-body">
    ${readinessSection(comparison, { kind: 'trial' })}
    ${maturitySection(detail)}
    ${periodsSection(comparison, 'trial')}
    <section class="gf-section" data-part="conclusion"><h3>Conclusion</h3>
      ${saveErrorBlock(state)}
      ${canFinish
        ? conclusionForm(state, { label: 'Record conclusion & finish', note: 'Nothing here is sent to your pump. Changes are entered manually.' })
        : `<p class="gf-meta" data-finish-unavailable="${e(state.finishReason || 'not_permitted')}">This Trial cannot be finished yet: ${e(state.finishReason || 'the backend has not permitted it')}.</p>`}
    </section>
    ${planRouteSection(detail, { canOpen: Boolean(detail.plan_route) })}
    <section class="gf-section"><h3>Limits of this read</h3>${(detail.limits || []).map((text) => `<p>${e(text)}</p>`).join('')}</section>
  </div></aside>`;
  return desk(stage, reading);
}

/** The active Pattern Focus. It leads with the intended behavior, and its mapped
    glucose outcomes stay a separate table beneath (HV2-26). */
function focusFrame(state) {
  const { detail, retained } = state;
  const comparison = (retained || {}).comparison || null;
  const context = (detail.original || {}).context || {};
  const stage = `<section class="pane gf-stage gf-stage-focus" aria-label="Focus evidence">${nameplate({
    kicker: 'Focus · <b>Active</b>',
    // The retained decision context stores the served Pattern title as explanation.
    title: e(context.title || (detail.pattern_key ? context.explanation : null) || LEVER_NAME[detail.lever] || 'Focus'),
    sub: `Pinned ${e(stamp(detail.pinned_at))}`,
    end: '<button class="gf-btn" data-follow-up-inspect>Inspect evidence</button><button class="gf-btn" data-action="history">View change record</button>',
  })}
    <div class="instruments"><div class="instrument"><span class="cap">Before → After</span><span class="meta">the exact periods either side of the pin</span></div><div class="instrument gf-tools"><span class="meta">Pump-local time</span></div></div>
    ${evidenceFigure(comparison, 'focus', figureColors())}
    <div class="instruments"><div class="instrument"><span class="cap">Observed behavior, then glucose</span><span class="meta">${comparison ? 'read from the retained comparison' : 'no comparison read yet'}</span></div><div class="instrument gf-tools">${narrow() ? '' : '<span class="meta">Advisory only</span>'}</div></div>
    <div class="gf-scroll">${comparisonTables(comparison, 'focus')}</div></section>`;
  const reading = `<aside class="pane gf-reading" aria-label="This Focus">${readingHeader('This Focus', 'Active')}<div class="gf-pane-body">
    <section class="gf-section" data-part="intent"><h3>What this Focus watches</h3>
      <p>${e(context.explanation || LEVER_NAME[detail.lever] || detail.lever)}</p>
      <p class="gf-meta">Pinned ${e(stamp(detail.pinned_at))}. No pump setting changed.</p></section>
    ${readinessSection(comparison, { kind: 'focus' })}
    ${periodsSection(comparison, 'focus')}
    <section class="gf-section" data-part="conclusion"><h3>Conclusion</h3>
      ${saveErrorBlock(state)}
      ${conclusionForm(state, { label: 'Record conclusion & end Focus', note: 'Ending the Focus fixes its periods. Nothing here is sent to your pump.' })}
    </section>
  </div></aside>`;
  return desk(stage, reading);
}

/* =============================== the mount =============================== */

function bind(host) {
  const history = host.querySelector('[data-action="history"]');
  if (history) history.onclick = () => navigate('changes', { subject: 'history' });
  const text = host.querySelector('#conclusion');
  if (text) {
    text.oninput = (event) => {
      memory.conclusion = event.target.value;
      const blank = !memory.conclusion.trim();
      for (const button of host.querySelectorAll('[data-form="finish"] [type="submit"], [type="submit"][form="finish-form"]')) {
        button.disabled = blank;
      }
    };
  }
  const form = host.querySelector('[data-form="finish"]');
  if (form) {
    form.onsubmit = (event) => {
      event.preventDefault();
      if (!(memory.conclusion || '').trim()) return;
      submitEnding({ retry: Boolean(memory.failure) });
    };
  }
  // The two views of the evidence, and the served day the second one reads.
  for (const button of host.querySelectorAll('[data-mode]')) {
    button.onclick = () => {
      memory.view = { ...memory.view, mode: button.dataset.mode };
      view.focusAfterRender = `[data-mode="${button.dataset.mode}"]`;
      render();
    };
  }
  const period = host.querySelector('[data-select="evidence-period"]');
  if (period) {
    period.onchange = (event) => {
      memory.view = { ...memory.view, period: event.target.value, day: 0 };
      render();
    };
  }
  const day = host.querySelector('[data-select="evidence-day"]');
  if (day) {
    day.onchange = (event) => {
      memory.view = { ...memory.view, day: Number(event.target.value) };
      render();
    };
  }
  const openPlan = host.querySelector('[data-action="plan-route"]');
  if (openPlan) openPlan.onclick = async () => {
    if (await stagePrior(memory.detail.plan_route)) navigate('changes', { subject: 'plan' });
    else { memory.error = new Error('The prior setting did not save to Plan.'); render(); }
  };
  const inspect = host.querySelector('[data-follow-up-inspect]');
  if (inspect) inspect.onclick = () => navigate('diagnose', retainedEvidenceContext(memory.detail));
  for (const button of host.querySelectorAll('[data-day-date]')) {
    button.onclick = () => navigate('day', {
      date: button.dataset.dayDate,
      subject: retainedEvidenceContext(memory.detail).subject,
      lever: button.dataset.dayLever || null,
      occurrence: memory.detail.id, window: retainedEvidenceContext(memory.detail).window,
      from: 'changes', focus: `[data-day-date="${button.dataset.dayDate}"]`,
    });
  }
  const retry = host.querySelector('[data-retry]');
  if (retry) retry.onclick = () => { memory.error = null; memory.roster = null; memory.detail = null; memory.retained = null; render(); };
}

/** The follow-up arm's content: whichever subject the backend says is active. */
export function mount(host, deps = {}) {
  const holdCleanup = deps.hold || hold;
  if (arrival !== deps.navigation) {
    arrival = deps.navigation;
    readGeneration += 1;
    memory.roster = null; memory.detail = null; memory.retained = null;
    memory.error = null; memory.loading = null;
  }
  if (memory.error) { host.innerHTML = errorFrame('Changes', 'The active change'); bind(host); return; }
  if (!memory.roster) { load('roster', loadRoster); host.innerHTML = loadingFrame('Changes'); return; }
  if (memory.error) { host.innerHTML = errorFrame('Changes', 'The active change'); bind(host); return; }
  const admission = memory.roster.admission || {};
  // An unreconciled input grants no permission and is not a quiet desk: it says
  // what it is waiting for, and offers no action (HV2-31).
  if (admission.state !== 'available') {
    host.innerHTML = emptyFrame('Changes', 'Not available yet',
      `The backend cannot answer for this store yet: ${e(admission.reason || 'reconciliation required')}.`,
      '<button class="gf-btn primary" data-retry>Retry</button>');
    bind(host);
    return;
  }
  if (!admission.active_kind) {
    host.innerHTML = emptyFrame('Changes', 'No active change', 'The latest read has no active watch.',
      '<button class="gf-btn" data-destination-action="changes">Return to Changes</button>');
    return;
  }
  const kind = admission.active_kind;
  const id = String(admission.active_id);
  if (!memory.detail || memory.detail.id !== id || memory.detail.kind !== kind) {
    load(`active:${kind}:${id}`, token => loadActive(kind, id, token));
    host.innerHTML = loadingFrame('Changes');
    return;
  }
  const state = {
    detail: memory.detail,
    retained: memory.retained,
    conclusion: memory.conclusion,
    failure: memory.failure,
    view: memory.view,
    canFinish: kind === 'focus' ? true : admission.can_finish_trial === true,
    finishReason: kind === 'trial' && !admission.can_finish_trial
      ? ((admission.maturity || {}).is_maturing ? 'the watch is still maturing' : admission.reason)
      : null,
  };
  host.innerHTML = kind === 'focus' ? focusFrame(state) : trialFrame(state);
  bind(host);
  mountComparisonChart(host, (memory.retained || {}).comparison || null, holdCleanup);
}

/** The retained decision supplies the inspection subject and affected hours. */
export function retainedEvidenceContext(detail) {
  const context = detail?.original?.context || {};
  const first = context.action?.[0] || context.members?.[0];
  const change = detail?.changes?.[0];
  const subject = context.subject || detail?.subject || (detail?.pattern_key ? `pattern:${detail.pattern_key}` : null) || (change ? `setting:${change.parameter}` : '');
  const span = first?.span || first;
  const slot = change?.slot?.match(/^(\d{2}):(\d{2})/);
  const start = span?.start_min ?? (slot ? Number(slot[1]) * 60 + Number(slot[2]) : null);
  return { subject, from: 'changes', occurrence: '',
    window: start === null || start === undefined ? '' : `${start}-${span?.end_min ?? start + 30}`,
    lever: change?.parameter || detail?.lever || '', focus: '#crumb-trail' };
}
