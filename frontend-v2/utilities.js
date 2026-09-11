// The utilities: App settings, the detected Pump settings, Log carbs, Carb
// questions, Guide and Glossary, as one pane that takes the reading pane's seat
// with the destination still standing underneath (HV2-33).
//
// Ported from the ★ LOCKED desktop prototype under the harmonic-v2-desktop lock
// manifest. That prototype held every write in page memory and said so; this
// writes through the one authenticated client, so
// a logged entry, an answered question and saved credentials are durable and a
// FAILED save stays a failure with its Retry rather than reading as saved.
//
// PUBLISHED FOR CHUNKS 2 AND 3:
//
//   openUtility(kind, launcher)   open one utility; `launcher` gets focus back
//   seatUtility(destination)      seat it over whatever frame just rendered
//
// Chunk 2 places the Pump settings entry inside Changes by rendering nothing:
// this module puts it in the Changes stage head, because the entry belongs to
// the utility layer that owns the pane behind it (HV2-12).
import { QUICKLOG_PRESETS, QUICKLOG_TIMES, buildCarbPayload, isLoggable, carbToast } from '../frontend/carb-log.js';
import { answerToSource, answerLabel, detectorKicker, sortOldestFirst, buildSparklineOption } from '../frontend/prompt-queue.js';
import { AUTHORED, GENERATED, CATEGORIES, renderMarkdown, articleBySlug } from '../frontend/kb.js';
import { guideGroups, guideTierLabel, guideMd, guideWorkedRows } from '../frontend/guide.js';
import { PLAN_PARAMS, formatStartMin } from '../frontend/plan.js';
import {
  answerPrompt, clearPrompt, createCarb, deleteCarb, fetchCarbs, fetchCatalog, fetchCredentials,
  fetchKbArticle, fetchPrompts, fetchPumpSettings, saveCredentials,
} from './client.js';
import { deskColors } from './colors.js';
import { clock, desk, e, shortDate } from './frame.js';
import {
  currentDestination, deskSurface, hold, load, narrow, navigate, registerEscape, registerSeatLayer, render, view,
} from './routes.js';

// The utility pane titles, verbatim from the lock. One table: the pane's own
// heading, the label a utility's Open Day declares, and the name its Day return
// is called by all read it, so the three cannot drift apart (S76).
export const UTILITY_TITLE = { settings: 'App settings', pump: 'Pump settings', carbs: 'Log carbs', questions: 'Carb questions', guide: 'Guide', glossary: 'Glossary' };
// The v1 articles hand off to v1 tabs; on this desk those read as these destinations.
const HANDOFF = { diagnose: ['diagnose', 'Diagnose'], day: ['day', 'Day'], plan: ['changes', 'Changes'] };
// Presentation only (CONTEXT.md): the two v1 glossary labels shown under their
// approved names, the v1 term kept small beside them. Definitions are untouched.
const PRESENT = { ISF: 'Correction factor', 'I:C': 'Carb ratio' };
// Deliverable heads in PLAN_PARAMS order, in the approved user copy (DESIGN.md).
const PLAN_HEAD = { basal_rate: 'Basal (U/h)', isf: 'Correction factor', carb_ratio: 'Carb ratio (g/U)', target_bg: 'Target (mg/dL)' };
// A correction factor reads insulin first (CONTEXT.md); the number is the served one.
const userValue = (param, value) => (value == null || value === '' ? '' : param === 'isf' ? `1 U : ${value} mg/dL` : String(value));

const questionKey = (prompt) => `${prompt.detector}|${prompt.anchor_t}`;

/* -------------------------------------------------------------- the state */

let seated = null;
let opener = null;
let glossaryGroups = [];

const state = {
  flash: null, failed: null, unread: null,
  draft: { grams: '', when: 'now', customAt: '', question: null },
  guide: null,
  settings: { token: '', email: '', password: '', region: 'US', dev: false, tokenSaved: false, credentialsSaved: null },
  entries: null, prompts: null, catalog: null, articles: new Map(), profile: null, credentials: null,
};
const answers = new Map();

const pending = () => sortOldestFirst(state.prompts || []);
const openCount = () => pending().filter((prompt) => !answers.has(questionKey(prompt))).length;

// Reads go through the desk's one loader, which is also what keeps an opening
// pane's focus target alive until the content it named exists — the Guide's
// article arrives one fetch after the press that asked for it.
//
// A failed READ is its own state, never the failed-SAVE alert: the pane must not
// tell the reader a write failed when nothing was written.
function need(key, run) {
  if (state.unread?.key === key) return;
  load(key, run, () => {
    state.unread = { key, run: () => { state.unread = null; need(key, run); } };
  });
}

/* ------------------------------------------------------------- the writes */

// A failed write stays a failure and offers its Retry; nothing is recorded, and
// the pane never shows an unsaved change as saved (the risk contract's "a failed
// save shown as saved").
function commit(label, run) {
  state.failed = null;
  state.flash = null;
  render();
  return run().then((flash) => { state.flash = flash || null; render(); })
    .catch((error) => { state.failed = { label, error, run: () => commit(label, run) }; render(); });
}

async function refreshEntries() {
  const payload = await fetchCarbs();
  state.entries = payload?.carb_entries || [];
}

function logCarbs(grams, certainty, prompt = null) {
  if (!isLoggable(grams, certainty)) return;
  const draft = state.draft;
  const payload = prompt
    ? { ...buildCarbPayload({ grams, certainty }), t: prompt.anchor_t, source: answerToSource(prompt.detector) }
    : buildCarbPayload({ grams, certainty, when: draft.when, customAt: draft.customAt });
  if (!payload.t) return;
  return commit(prompt ? 'answer' : 'log', async () => {
    if (prompt) {
      // The answer and its entry are ONE server write (#128): answering 'carbs'
      // creates the carb entry and the response row in one transaction, so the
      // delete-resurrects invariant holds.
      const entry = { grams: payload.grams, certainty: payload.certainty, note: payload.note };
      const written = await answerPrompt({ detector: prompt.detector, anchor_t: prompt.anchor_t, answer: 'carbs', entry });
      answers.set(questionKey(prompt), { answer: 'carbs', entry: written?.carb_entry_id ?? null, grams: payload.grams, certainty: payload.certainty });
    } else {
      await createCarb(payload);
    }
    state.draft = { grams: '', when: 'now', customAt: '', question: null };
    await refreshEntries();
    return prompt ? `${carbToast(payload.grams, certainty)} · question answered` : carbToast(payload.grams, certainty);
  });
}

const answer = (prompt, value) => commit('answer', async () => {
  await answerPrompt({ detector: prompt.detector, anchor_t: prompt.anchor_t, answer: value });
  answers.set(questionKey(prompt), { answer: value });
  state.draft.question = null;
  return `Answered: ${answerLabel(value)}`;
});

// Undo clears the one answer; an entry it logged goes with it, because deleting
// a prompt-sourced carb entry cascades its response row away server-side.
const undo = (prompt) => commit('undo', async () => {
  await clearPrompt({ detector: prompt.detector, anchor_t: prompt.anchor_t });
  answers.delete(questionKey(prompt));
  await refreshEntries();
  return 'Answer cleared';
});

const remove = (id) => commit('remove', async () => {
  await deleteCarb(id);
  for (const [key, held] of answers) if (held.entry === id) answers.delete(key);
  await refreshEntries();
  state.prompts = await fetchPrompts();
  return 'Entry removed';
});

/* --------------------------------------------------------------- the pane */

function status() {
  if (state.failed) {
    return '<div class="gf-status" role="alert"><p class="gf-error">Save failed: no response from the store.</p><div class="gf-actions"><button class="gf-btn primary" data-utility-retry>Retry</button></div></div>';
  }
  if (state.unread) {
    return '<div class="gf-status" role="alert"><p class="gf-error">This did not load: no response from the store.</p><div class="gf-actions"><button class="gf-btn primary" data-utility-reread>Retry</button></div></div>';
  }
  return state.flash ? `<p class="gf-meta gf-flash" role="status">${e(state.flash)}</p>` : '';
}

// What a pane shows while its own read is open: no count, no former row. A read
// that failed says so through status() instead, so the pane never sits on a
// "Loading…" line that will never finish.
const waiting = (what) => ({
  meta: '',
  html: state.unread ? '' : `<section class="gf-section"><p class="gf-meta" role="status">Loading ${e(what)}…</p></section>`,
});

function settingsBody() {
  if (state.credentials === null) { need('credentials', async () => { state.credentials = await fetchCredentials(); }); return waiting('settings'); }
  const form = state.settings;
  const saved = form.credentialsSaved || (state.credentials.configured ? { region: state.credentials.region, email: state.credentials.email } : null);
  return { meta: 'this browser · this store', html: `
      <section class="gf-section"><h3>API access</h3>
        <form data-utility-form="token"><label for="ut-token">Bearer token</label><div class="gf-field"><input id="ut-token" type="password" autocomplete="off" value="${e(form.token)}"><button class="gf-btn" type="button" data-utility-reveal="ut-token" aria-pressed="false">Show</button></div>
        <p class="gf-meta">${form.tokenSaved ? 'Token saved in this browser.' : 'No token saved.'}</p>
        <div class="gf-actions" style="padding:0"><button class="gf-btn primary" type="submit">Save token</button></div></form></section>
      <section class="gf-section"><h3>Tandem credentials</h3>
        <form data-utility-form="credentials"><label for="ut-email">Email</label><input id="ut-email" type="email" autocomplete="off" value="${e(form.email || state.credentials.email || '')}">
        <label for="ut-password">Password</label><div class="gf-field"><input id="ut-password" type="password" autocomplete="off" value="${e(form.password)}"><button class="gf-btn" type="button" data-utility-reveal="ut-password" aria-pressed="false">Show</button></div>
        <label for="ut-region">Region</label><select id="ut-region"><option value="US" ${form.region === 'US' ? 'selected' : ''}>US</option><option value="EU" ${form.region === 'EU' ? 'selected' : ''}>EU</option></select>
        <p class="gf-meta">${saved ? `Credentials saved · ${e(saved.region || '')} region` : 'No credentials saved.'}</p>
        <div class="gf-actions" style="padding:0"><button class="gf-btn primary" type="submit">Save credentials</button></div></form></section>
      <section class="gf-section"><h3>Developer mode</h3>
        <form data-utility-form="dev"><label class="gf-check"><input type="checkbox" ${form.dev ? 'checked' : ''}> Show the engine's raw internals</label><p class="gf-meta">Changes disclosure only, never the analysis.</p></form></section>` };
}

// A pump profile's schedule as the Plan reads it: one row per segment, the
// deliverable's parameters in its own order. Kept here while Pump settings is
// its only reader; when Changes needs the same table it belongs in
// frontend/plan.js, which already owns PLAN_PARAMS and the value formatting.
function profileTable(profile) {
  return `<table class="gf-table"><thead><tr><th scope="col">Start</th>${PLAN_PARAMS.map(({ param }) => `<th scope="col">${PLAN_HEAD[param]}</th>`).join('')}</tr></thead><tbody>${profile.segments.map((segment) => `<tr><td class="v">${e(formatStartMin(segment.start_min))}</td>${PLAN_PARAMS.map(({ param }) => `<td class="v">${e(userValue(param, segment[param]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function pumpBody() {
  if (state.profile === null) { need('pump', async () => { state.profile = await fetchPumpSettings(); }); return waiting('the pump schedule'); }
  const served = state.profile;
  if (!served.configured || !served.profile) {
    return { meta: '', html: `<section class="gf-section"><p>This store serves no pump profile.</p><p class="gf-meta">The proposed schedule is in Changes.</p></section>` };
  }
  return { meta: served.fetched_at ? `read ${e(shortDate(served.fetched_at))} · ${e(clock(served.fetched_at))}` : '', html: `
      <section class="gf-section"><h3>Detected on the pump${served.fetched_at ? ` <span class="meta">${e(shortDate(served.fetched_at))}</span>` : ''}</h3>${profileTable(served.profile)}<p class="gf-meta">${e(served.profile.name || 'Active profile')} · detected schedule, not the Plan. The proposed schedule is in Changes.</p></section>` };
}

// The shipped quick-log sheet's controls: the preset pair (exact / ~), another
// amount, the unknown amount, and when — relative to this browser's clock.
function amountControls(prompt = null) {
  const draft = state.draft;
  const target = prompt ? ` data-question="${e(questionKey(prompt))}"` : '';
  const loggable = isLoggable(draft.grams, 'exact');
  return `<p class="gf-note">Tap the number for an exact count · tap ~ for a rough guess.</p>
      <div class="gf-chips">${QUICKLOG_PRESETS.map((grams) => `<span class="gf-chip"><button class="gf-btn" data-utility-log="${grams}" data-certainty="exact"${target}>${grams} g</button><button class="gf-btn" data-utility-log="${grams}" data-certainty="estimate"${target} aria-label="about ${grams} grams">~</button></span>`).join('')}</div>
      <div class="gf-field"><label for="ut-grams" class="gf-visually-hidden">Other amount</label><input id="ut-grams" type="number" min="0" step="1" inputmode="numeric" placeholder="other amount, g" value="${e(draft.grams)}"><button class="gf-btn" data-utility-log="other" data-certainty="exact"${target} ${loggable ? '' : 'disabled'}>Log</button><button class="gf-btn" data-utility-log="other" data-certainty="estimate"${target} ${loggable ? '' : 'disabled'}>~ est</button></div>
      <button class="linkbtn" data-utility-log="unknown" data-certainty="unknown"${target}>Ate something, don't know how much</button>`;
}

function carbsBody() {
  if (state.entries === null) { need('carbs', refreshEntries); return waiting('the carb log'); }
  const draft = state.draft;
  const entries = state.entries.slice().sort((a, b) => (a.t < b.t ? 1 : -1));
  const now = new Date();
  return { meta: `at ${e(shortDate(now.toISOString()))} · ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, html: `
      <section class="gf-section"><h3>Amount</h3>${amountControls()}</section>
      <section class="gf-section"><h3>When</h3><div class="seg gf-seg" role="group" aria-label="When">${QUICKLOG_TIMES.map((when) => `<button data-utility-when="${when.k}" aria-pressed="${draft.when === when.k}">${when.label}</button>`).join('')}</div>
        ${draft.when === 'custom' ? `<div class="gf-field"><label for="ut-custom" class="gf-visually-hidden">Custom time</label><input id="ut-custom" type="datetime-local" value="${e(draft.customAt)}"></div>` : ''}
        <p class="gf-meta">One tap logs · defaults to now.</p></section>
      <section class="gf-section"><h3>Logged <span class="meta">${entries.length}</span></h3>
        ${entries.length ? entries.map((entry) => `<div class="gf-row gf-entry-row" role="listitem"><span class="when">${e(shortDate(entry.t))} ${e(clock(entry.t))}</span><span class="n">${entry.grams == null ? 'unknown amount' : `${entry.certainty === 'estimate' ? '~' : ''}${e(entry.grams)} g`}</span><span class="text">${entry.source === 'manual' ? 'Logged by hand' : 'Answered a carb question'}${entry.note ? ` · ${e(entry.note)}` : ''}</span><span class="gf-row-tools"><button class="linkbtn" data-action="day" data-date="${e(String(entry.t).slice(0, 10))}" data-subject="Log carbs · ${e(shortDate(entry.t))} ${e(clock(entry.t))}" data-utility-from="carbs" data-utility-label="${e(UTILITY_TITLE.carbs)}" data-return-focus="[data-utility-remove='${entry.id}']">Open ${e(shortDate(entry.t))}</button><button class="linkbtn" data-utility-remove="${entry.id}">Remove</button></span></div>`).join('') : '<p class="gf-meta">Nothing logged yet. An entry shows on its Day as a manual carb mark.</p>'}
      </section>` };
}

// The way into the day itself sits on its own row after the answers (or the
// Undo), so the three answers read as one group and this stays the secondary
// step. The day opens under the questions, which stay open beside it: the entry
// names the question it came from, and the way back is this pane on that same
// question (S76).
const openDayRow = (prompt) => `<div class="gf-actions gf-question-day"><button class="gf-btn" data-action="day" data-date="${e(String(prompt.anchor_t).slice(0, 10))}" data-subject="Carb questions · ${e(shortDate(prompt.anchor_t))} ${e(clock(prompt.anchor_t))}" data-utility-from="questions" data-utility-label="${e(UTILITY_TITLE.questions)}" data-return-focus="[data-question-card='${e(questionKey(prompt))}'] [data-action='day']">Open ${e(shortDate(prompt.anchor_t))}</button></div>`;

function questionCard(prompt) {
  const key = questionKey(prompt);
  const held = answers.get(key) || null;
  const logging = state.draft.question === key;
  return `<section class="gf-section gf-question" data-question-card="${e(key)}">
      <h3>${e(detectorKicker(prompt.detector))} <span class="meta">${e(shortDate(prompt.anchor_t))} ${e(clock(prompt.anchor_t))} · ${Math.round(prompt.age_days)} d before now</span></h3>
      <div class="gf-spark" data-utility-chart="prompt" data-question="${e(key)}" role="img" aria-label="Glucose two hours either side of ${e(clock(prompt.anchor_t))}, ${Math.round(prompt.key_bg)} at the low"></div>
      <p><b>${e(prompt.question)}</b></p><p class="gf-meta">${e(prompt.context)}</p>
      ${held ? `<p class="gf-meta gf-answered">Answered: ${e(answerLabel(held.answer))}${held.grams !== undefined && held.answer === 'carbs' ? ` · ${held.grams == null ? 'unknown amount' : `${held.certainty === 'estimate' ? '~' : ''}${e(held.grams)} g`} at ${e(clock(prompt.anchor_t))}` : ''}</p><div class="gf-actions"><button class="gf-btn" data-utility-undo="${e(key)}">Undo</button></div>${openDayRow(prompt)}`
      : logging ? `${amountControls(prompt)}<div class="gf-actions"><button class="gf-btn" data-utility-cancel-log>Cancel</button></div>`
      : `<div class="gf-actions"><button class="gf-btn primary" data-utility-answer-carbs="${e(key)}">Log carbs</button><button class="gf-btn" data-utility-answer="no" data-question="${e(key)}">No</button><button class="gf-btn" data-utility-answer="not-sure" data-question="${e(key)}">Not sure</button></div>${openDayRow(prompt)}
          ${prompt.detector === 'low' ? `<p class="gf-meta">Or, this reading wasn't real:</p><div class="gf-actions"><button class="gf-btn" data-utility-answer="false-low" data-question="${e(key)}">Not real (sensor noise / compression low)</button></div>` : ''}`}
    </section>`;
}

function questionsBody() {
  if (state.prompts === null) { need('prompts', async () => { state.prompts = await fetchPrompts(); }); return waiting('the questions'); }
  const list = pending();
  if (!list.length) return { meta: '', html: `<section class="gf-section"><p>No open questions right now.</p><p class="gf-meta">A question is pinned where the read saw a low or a rise with no bolus; answering one de-biases the fasting windows.</p></section>` };
  return { meta: '', html: `<p class="gf-note">${openCount()} of ${list.length} open · oldest first.</p>${list.map(questionCard).join('')}` };
}

function guideBody() {
  if (state.catalog === null) { need('catalog', async () => { state.catalog = await fetchCatalog(); }); return waiting('the Guide'); }
  const slug = state.guide;
  const article = slug ? articleBySlug(slug) : null;
  if (!article) {
    const groups = CATEGORIES.map((category) => ({ ...category, items: [...AUTHORED, ...GENERATED].filter((item) => item.category === category.id) })).filter((group) => group.items.length);
    return { meta: '', html: groups.map((group) => `<section class="gf-section"><h3>${e(group.label)}</h3>${group.items.map((item) => `<button class="gf-row gf-guide-row" data-utility-slug="${item.slug}"><span class="text">${e(item.title)}</span></button>`).join('')}</section>`).join('') };
  }
  const html = article.kind === 'authored' ? authoredArticle(article) : generatedArticle(article);
  return { meta: e(CATEGORIES.find((category) => category.id === article.category)?.label || ''), html: `<div class="gf-actions"><button class="gf-btn" data-utility-slug="">← All articles</button></div><article class="gf-article"><h2 class="gf-title" tabindex="-1">${e(article.title)}</h2>${html}</article>` };
}

// The four authored articles are v1's own text, served raw from /api/kb: their
// tab names are kept, and each handoff names the destination that reads as on
// this desk.
function authoredArticle(article) {
  if (!state.articles.has(article.slug)) {
    need(`kb:${article.slug}`, async () => { state.articles.set(article.slug, await fetchKbArticle(article.slug)); });
    return '<p class="gf-meta" role="status">Loading this article…</p>';
  }
  const html = renderMarkdown(state.articles.get(article.slug))
    .replace(/<a class="handoff-inline" data-app="(\w+)">([^<]*)<\/a>/g, (_, app, text) => (HANDOFF[app] ? `<button class="linkbtn" data-utility-go="${HANDOFF[app][0]}">${text}</button> <small>(${HANDOFF[app][1]} here)</small>` : text))
    .replace(/<a class="xlink" data-slug="([\w-]+)">([^<]*)<\/a>/g, '<button class="linkbtn" data-utility-slug="$1">$2</button>');
  return `<p class="gf-meta">Written for the v1 tabs: Diagnose keeps its name here, Plan reads as Changes.</p>${html}`;
}

function generatedArticle(article) {
  const catalog = state.catalog;
  const list = (items) => `<ul>${items.map((item) => `<li>${guideMd(e(item))}</li>`).join('')}</ul>`;
  if (article.slug === 'what-this-is') return `<p>${guideMd(e(catalog.engine.tagline))}</p><h3>It is</h3>${list(catalog.engine.is)}<h3>It won't</h3>${list(catalog.engine.wont)}`;
  if (article.slug === 'the-pipeline') return `${catalog.pipeline.chain.map((step) => `<h3>${e(step.step)}</h3><p><b>${e(step.one_liner)}</b></p><p>${guideMd(e(step.body))}</p>`).join('')}<h3>Two truths about silence</h3>${catalog.pipeline.suppression_truths.map((truth) => `<p><b>${e(truth.title)}</b> ${guideMd(e(truth.body))}</p>`).join('')}`;
  if (article.slug === 'worked-example') {
    const { worked } = catalog;
    return `<p>${guideMd(e(worked.intro))}</p><p><b>${e(worked.episode.title)}</b> · ${e(worked.episode.when)} · peak ${e(worked.episode.peak)} (${e(worked.episode.peak_state)})</p>${guideWorkedRows(worked).map((row) => (row.kind === 'pattern' ? `<h3>${e(row.stage)}</h3><p>${guideMd(e(row.pattern.body))} <small>${e(row.pattern.rate)}</small></p>` : `<h3>${e(row.stage)} <small>${e(row.step.t)} · ${e(guideTierLabel(catalog.tiers, row.step.tier))}</small></h3><p>${guideMd(e(row.step.text))}</p>${row.verdict ? `<p><b>${e(row.verdict.label)}: ${e(row.verdict.title)}</b> ${guideMd(e(row.verdict.body))}</p>` : ''}`)).join('')}`;
  }
  if (article.slug === 'silence') return catalog.tiers.map((tier) => { const reasons = catalog.silence_reasons.filter((reason) => reason.tier === tier.value); return reasons.length ? `<h3>${e(tier.label)}</h3>${reasons.map((reason) => `<p><b>${e(reason.label)}</b> ${guideMd(e(reason.body))}</p>`).join('')}` : ''; }).join('');
  if (article.slug === 'evidence-tiers') return catalog.tiers.map((tier) => `<h3>${e(tier.label)}</h3><p>${guideMd(e(tier.body))}</p>`).join('');
  return guideGroups(catalog).map((group) => `<h3>${e(group.label)} <small>per ${e(group.denominator)}</small></h3>${group.levers.map((lever) => `<p><b>${e(lever.title)}</b> ${guideMd(e(lever.meaning))}</p><p class="gf-meta">Measured: ${e(lever.measured)} · Recommends: ${e(lever.recommendation)}</p>`).join('')}`).join('');
}

function glossaryBody() {
  return { meta: 'v1 definitions', html: glossaryGroups.map((group) => `<section class="gf-section"><h3>${e(PRESENT[group.title] || group.title)}</h3><dl class="gf-glossary">${group.terms.map((term) => `<dt>${e(PRESENT[term.term] || term.term)}${PRESENT[term.term] || term.unit ? `<small>${PRESENT[term.term] ? `${e(term.term)} · ` : ''}${e(term.unit || '')}</small>` : ''}</dt><dd>${e(term.def)}</dd>`).join('')}</dl></section>`).join('') };
}

const BODIES = { settings: settingsBody, pump: pumpBody, carbs: carbsBody, questions: questionsBody, guide: guideBody, glossary: glossaryBody };

/** The seated utility's complete pane markup. */
function utilityPane(kind = seated) {
  const body = BODIES[kind]();
  return `<aside class="pane gf-reading gf-utility" data-utility="${kind}" aria-label="${UTILITY_TITLE[kind]}"><header><h2 tabindex="-1">${UTILITY_TITLE[kind]}</h2>${body.meta ? `<span class="meta">${body.meta}</span>` : ''}<div class="gf-end"><button class="gf-btn gf-utility-close" data-utility-close>Close</button></div></header><div class="gf-pane-body">${status()}${body.html}</div></aside>`;
}

/* -------------------------------------------------------------- the seat */

/**
 * Seat the open utility over whichever frame just rendered, add the Changes
 * stage's Pump settings entry, and keep every launcher's pressed state and open
 * count in step. Called by the desk after every render.
 */
export function seatUtility(destination) {
  const surface = deskSurface();
  if (seated) {
    if (narrow()) { view.sheetOpen = true; surface.dataset.sheet = 'open'; }
    const reading = surface.querySelector('.gf-desk > .gf-reading');
    if (reading) reading.outerHTML = utilityPane();
    else {
      const inspector = surface.querySelector('[data-v2-diagnose] .panes > .inspector');
      if (inspector) {
        // Keep the carried owner's DOM, handlers and scroll in its seat. The
        // utility temporarily covers that seat; closing it restores the same
        // inspector rather than reconstructing any shared rail markup.
        const visibility = inspector.style.visibility;
        const inert = inspector.inert;
        inspector.style.visibility = 'hidden';
        inspector.inert = true;
        inspector.insertAdjacentHTML('afterend', utilityPane());
        const pane = inspector.nextElementSibling;
        pane.classList.add('v2-diagnose-utility');
        hold(() => { pane.remove(); inspector.style.visibility = visibility; inspector.inert = inert; });
      } else {
        const stage = surface.querySelector('.pane');
        if (stage) stage.outerHTML = desk(stage.outerHTML, utilityPane());
      }
    }
  }
  // The detected pump settings open from Changes, beside the proposed Plan.
  if (destination === 'changes') {
    const head = surface.querySelector('.gf-stage > header');
    const end = head?.querySelector('.gf-end');
    const button = '<button class="gf-btn" data-utility="pump">Pump settings</button>';
    if (end) end.insertAdjacentHTML('beforeend', button);
    else head?.insertAdjacentHTML('beforeend', `<div class="gf-end">${button}</div>`);
  }
  surface.insertAdjacentHTML('beforeend', `<nav class="gf-utility-strip" aria-label="Utilities"><button data-utility="carbs">Log carbs</button><button data-utility="questions">Questions <span class="cockpit-count">${openCount()}</span></button><button data-utility="guide">Guide</button><button data-utility="settings">Settings</button><button data-utility="glossary">Glossary</button></nav>`);
  surface.querySelector('.gf-utility-strip').toggleAttribute('inert', narrow() && view.sheetOpen);
  for (const button of document.querySelectorAll('.cockpit-utilities [data-utility], .cockpit-log-carbs, .gf-utility-strip [data-utility]')) {
    button.setAttribute('aria-pressed', String((button.dataset.utility || 'carbs') === seated));
  }
  const count = document.querySelector('.cockpit-questions .cockpit-count');
  if (count) count.textContent = String(openCount());
  bindPane(surface);
  mountSparklines(surface);
}

/**
 * Open one utility into the reading pane's seat. `launcher` is what gets focus
 * back on Close — an element, or a selector for a control the next render will
 * have rebuilt.
 */
export function openUtility(kind, launcher) {
  if (seated !== kind) { opener = launcher || opener; seated = kind; }
  view.focusAfterRender = '.gf-utility-close';
  render();
}

function close() {
  const back = opener;
  opener = null;
  seated = null;
  view.sheetOpen = false;
  state.flash = null;
  render();
  (typeof back === 'string' ? document.querySelector(back) : back)?.focus();
}

/* ------------------------------------------------------------------ wiring */

function bindPane(surface) {
  // A desk opener is re-rendered, so Close finds it again by its selector.
  for (const button of surface.querySelectorAll('[data-utility]')) {
    if (button.tagName === 'BUTTON') button.onclick = () => openUtility(button.dataset.utility, `button[data-utility="${button.dataset.utility}"]`);
  }
  const closeButton = surface.querySelector('[data-utility-close]');
  if (closeButton) closeButton.onclick = close;
  const retry = surface.querySelector('[data-utility-retry]');
  if (retry) retry.onclick = () => state.failed.run();
  const reread = surface.querySelector('[data-utility-reread]');
  if (reread) reread.onclick = () => state.unread.run();
  for (const button of surface.querySelectorAll('[data-utility-go]')) {
    button.onclick = () => { if (narrow()) seated = null; navigate(button.dataset.utilityGo); };
  }
  for (const button of surface.querySelectorAll('[data-utility-slug]')) {
    button.onclick = () => {
      state.guide = button.dataset.utilitySlug || null;
      // HV2-32: the caller names a precise target, and the build honours it —
      // the article heading, which is focusable here where the prototype's was
      // not (S73b).
      view.focusAfterRender = state.guide ? '.gf-article .gf-title' : `[data-utility-slug="${button.dataset.utilitySlug}"]`;
      render();
      surface.querySelector('.gf-utility .gf-pane-body')?.scrollTo(0, 0);
    };
  }
  for (const button of surface.querySelectorAll('[data-utility-when]')) {
    button.onclick = () => { state.draft.when = button.dataset.utilityWhen; render(); };
  }
  const grams = surface.querySelector('#ut-grams');
  if (grams) {
    grams.oninput = (event) => {
      state.draft.grams = event.target.value;
      for (const button of surface.querySelectorAll('[data-utility-log="other"]')) button.disabled = !isLoggable(event.target.value, 'exact');
    };
  }
  const custom = surface.querySelector('#ut-custom');
  if (custom) custom.oninput = (event) => { state.draft.customAt = event.target.value; };
  for (const button of surface.querySelectorAll('[data-utility-log]')) {
    button.onclick = () => {
      const prompt = button.dataset.question ? pending().find((item) => questionKey(item) === button.dataset.question) : null;
      const amount = button.dataset.utilityLog === 'unknown' ? null : button.dataset.utilityLog === 'other' ? state.draft.grams : Number(button.dataset.utilityLog);
      logCarbs(amount, button.dataset.certainty, prompt);
    };
  }
  for (const button of surface.querySelectorAll('[data-utility-answer-carbs]')) {
    button.onclick = () => {
      state.draft.question = button.dataset.utilityAnswerCarbs;
      view.focusAfterRender = `[data-question-card="${button.dataset.utilityAnswerCarbs}"] [data-utility-log]`;
      render();
    };
  }
  const cancel = surface.querySelector('[data-utility-cancel-log]');
  if (cancel) {
    cancel.onclick = () => {
      const key = state.draft.question;
      state.draft.question = null;
      view.focusAfterRender = `[data-utility-answer-carbs="${key}"]`;
      render();
    };
  }
  for (const button of surface.querySelectorAll('[data-utility-answer]')) {
    button.onclick = () => {
      const prompt = pending().find((item) => questionKey(item) === button.dataset.question);
      view.focusAfterRender = `[data-utility-undo="${button.dataset.question}"]`;
      answer(prompt, button.dataset.utilityAnswer);
    };
  }
  for (const button of surface.querySelectorAll('[data-utility-undo]')) {
    button.onclick = () => {
      const prompt = pending().find((item) => questionKey(item) === button.dataset.utilityUndo);
      view.focusAfterRender = `[data-utility-answer-carbs="${button.dataset.utilityUndo}"]`;
      undo(prompt);
    };
  }
  for (const button of surface.querySelectorAll('[data-utility-remove]')) {
    button.onclick = () => remove(Number(button.dataset.utilityRemove));
  }
  for (const button of surface.querySelectorAll('[data-utility-reveal]')) {
    button.onclick = () => {
      const field = surface.querySelector(`#${button.dataset.utilityReveal}`);
      const shown = field.type === 'text';
      field.type = shown ? 'password' : 'text';
      button.textContent = shown ? 'Show' : 'Hide';
      button.setAttribute('aria-pressed', String(!shown));
    };
  }
  for (const [id, key] of [['ut-token', 'token'], ['ut-email', 'email'], ['ut-password', 'password'], ['ut-region', 'region']]) {
    const field = surface.querySelector(`#${id}`);
    if (field) field.oninput = field.onchange = (event) => { state.settings[key] = event.target.value; };
  }
  const token = surface.querySelector('[data-utility-form="token"]');
  if (token) {
    token.onsubmit = (event) => {
      event.preventDefault();
      view.focusAfterRender = '#ut-token';
      // The client reads the Bearer token from this key on every request
      // (frontend/data.js); saving one here is what authenticates the surface.
      commit('token', async () => {
        if (state.settings.token) localStorage.setItem('ciq_token', state.settings.token);
        else localStorage.removeItem('ciq_token');
        state.settings.tokenSaved = Boolean(state.settings.token);
        return state.settings.token ? 'Token saved in this browser' : 'Token cleared';
      });
    };
  }
  const credentials = surface.querySelector('[data-utility-form="credentials"]');
  if (credentials) {
    credentials.onsubmit = (event) => {
      event.preventDefault();
      view.focusAfterRender = '#ut-email';
      commit('credentials', async () => {
        await saveCredentials({ email: state.settings.email, password: state.settings.password, region: state.settings.region });
        state.settings.credentialsSaved = { region: state.settings.region, at: new Date().toISOString() };
        state.settings.password = '';
        state.credentials = await fetchCredentials();
        return 'Credentials saved';
      });
    };
  }
  const dev = surface.querySelector('[data-utility-form="dev"] input');
  if (dev) dev.onchange = (event) => { state.settings.dev = event.target.checked; };
  // A dated moment inside a utility opens Day as the same contextual entry, and
  // this utility stays open over it as the continuation (S76). The return
  // target names both halves — the destination the utility was opened over, and
  // the utility itself, which is what the return is named for.
  for (const button of surface.querySelectorAll('.gf-utility [data-action="day"][data-date]')) {
    button.onclick = () => navigate('day', {
      date: button.dataset.date,
      subject: button.dataset.subject || '',
      from: `${currentDestination()}.${button.dataset.utilityFrom}`,
      focus: button.dataset.returnFocus || '',
    });
  }
}

// The sparkline hosts are the utility's own (`data-utility-chart`), never
// `data-chart`: that attribute is how each desk figure finds its mounter, and a
// desk mounter reads a `.gf-chart` seat the sparkline host does not have.
function mountSparklines(surface) {
  if (!globalThis.echarts) return;
  const colors = deskColors();
  for (const host of surface.querySelectorAll('[data-utility-chart="prompt"]')) {
    const prompt = pending().find((item) => questionKey(item) === host.dataset.question);
    if (!prompt) continue;
    const chart = globalThis.echarts.init(host, null, { renderer: 'svg' });
    chart.setOption(buildSparklineOption(prompt, colors));
    hold(() => chart.dispose());
  }
}

/** Bind the shell's own launchers, which live outside the desk surface and are
    therefore bound once rather than on every render. */
function bindShell() {
  for (const button of document.querySelectorAll('.cockpit-utilities [data-utility]')) {
    button.onclick = () => openUtility(button.dataset.utility, button);
  }
  const log = document.querySelector('.cockpit-log-carbs');
  if (log) log.onclick = () => openUtility('carbs', log);
}

/** Seat the utility layer on the shell. Called once, by the entry module. */
export function installUtilities({ glossary = [] } = {}) {
  glossaryGroups = glossary;
  bindShell();
  registerSeatLayer(seatUtility);
  // Escape steps a Guide article back to its index, then closes the utility —
  // and does both from inside the utility's own fields, keeping what was typed.
  registerEscape('utility', () => {
    if (!seated) return false;
    if (seated === 'guide' && state.guide) {
      state.guide = null;
      view.focusAfterRender = '.gf-guide-row';
      render();
      return true;
    }
    close();
    return true;
  });
}

/** Re-open a utility over the destination underneath. The Day return uses it to
    put the reader back inside the utility that opened Day (S76). */
export function reopenUtility(kind) {
  seated = kind;
}
