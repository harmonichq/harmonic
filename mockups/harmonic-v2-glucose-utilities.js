// Glucose first, round 4 (#348). Unlocked design exploration: the retained
// utilities — App settings, the detected Pump settings, Log carbs, Carb
// questions, Guide and Glossary — as one workspace pane. The pane seats where
// the desk's reading pane sits (the sheet, at narrow widths), so the stage keeps
// the current context while a utility is open, and it stays open across
// destinations on the desk.
//
// Every write here is page memory: a logged entry, an answered question and a
// saved settings form stay in this page for the source they were made on, and
// none of them recalculates the read. The shipped carb-log module validates and
// shapes the entry; the shipped prompt-queue module names the answers and draws
// the ±2 h sparkline; the shipped KB and Guide helpers render the articles and the
// catalog. The Glossary's definitions are v1's verbatim; only the two labels
// CONTEXT.md renames are presented under their approved names.
import { QUICKLOG_PRESETS, QUICKLOG_TIMES, buildCarbPayload, isLoggable, carbToast } from '../frontend/carb-log.js';
import { answerToSource, answerLabel, detectorKicker, sortOldestFirst, buildSparklineOption } from '../frontend/prompt-queue.js';
import { AUTHORED, GENERATED, CATEGORIES, renderMarkdown, articleBySlug } from '../frontend/kb.js';
import { guideGroups, guideTierLabel, guideMd, guideWorkedRows } from '../frontend/guide.js';
import { glossaryGroups } from './harmonic-v2.exploration/glossary.js';
import { profileTable } from './harmonic-v2-glucose-setting.js';

const TITLE = { settings: 'App settings', pump: 'Pump settings', carbs: 'Log carbs', questions: 'Carb questions', guide: 'Guide', glossary: 'Glossary' };
const SETTING_NAME = { basal_rate: 'Basal', isf: 'Correction factor', carb_ratio: 'Carb ratio', target_bg: 'Target' };
const settingValue = (param, value) => (param === 'isf' ? `1 U : ${value} mg/dL` : String(value));
// Presentation only (CONTEXT.md): the two v1 glossary labels shown under their
// approved names, the v1 term kept small beside them. Definitions are untouched.
const PRESENT = { ISF: 'Correction factor', 'I:C': 'Carb ratio' };
// The v1 articles hand off to v1 tabs; on this desk those read as these destinations.
const HANDOFF = { diagnose: ['explore', 'Explore'], day: ['day', 'Day'], plan: ['changes', 'Changes'] };
const questionKey = prompt => `${prompt.detector}|${prompt.anchor_t}`;

export function createUtilities(kit, { context }) {
  const { surface, mockbar, colors, narrow, view, e, clock, shortDate, stamp } = kit;
  let served = null, saveFails = false, opener = null;
  let charts = [];
  // page memory, per source: what the wearer logged, answered and saved here
  const memories = {};
  const memory = () => (memories[context().key] ||= {
    entries: [], answers: {}, flash: null, failed: null, nextId: 1,
    draft: { grams: '', when: 'now', customAt: '', question: null },
    settings: { token: '', email: '', password: '', region: 'US', dev: false, tokenSaved: false, credentialsSaved: null },
    guide: null,
  });
  const nowDate = () => new Date(String(context().now).replace(' ', 'T'));
  const pending = () => sortOldestFirst(context().utilities?.pending || []);
  const answerOf = prompt => memory().answers[questionKey(prompt)] || null;
  const openCount = () => pending().filter(prompt => !answerOf(prompt)).length;

  /* ---- writes: page memory, admitted or failed like an ordinary save ------- */
  // A failed save keeps the form and its Retry; the review control that fails it
  // clears itself, so the retry succeeds unless it is set again.
  function commit(label, run) {
    const mem = memory();
    mem.failed = null; mem.flash = null;
    if (saveFails) {
      saveFails = false; const box = mockbar.querySelector('[aria-label="Next utility save fails"]'); if (box) box.checked = false;
      mem.failed = { label, run: () => commit(label, run) }; kit.render(); return false;
    }
    run(mem); kit.render(); return true;
  }
  function logCarbs(grams, certainty, prompt = null) {
    const mem = memory(), draft = mem.draft;
    if (!isLoggable(grams, certainty)) return;
    const payload = prompt
      ? { ...buildCarbPayload({ grams, certainty, now: nowDate() }), t: prompt.anchor_t, source: answerToSource(prompt.detector) }
      : buildCarbPayload({ grams, certainty, when: draft.when, customAt: draft.customAt, now: nowDate() });
    if (!payload.t) return;
    commit(prompt ? 'answer' : 'log', m => {
      const entry = { id: m.nextId++, ...payload, logged_at: context().now };
      m.entries.push(entry);
      // the answer and its entry are one write, as the proposed contract keeps them
      if (prompt) m.answers[questionKey(prompt)] = { answer: 'carbs', entry: entry.id, at: context().now };
      m.draft = { grams: '', when: 'now', customAt: '', question: null };
      m.flash = prompt ? `${carbToast(payload.grams, certainty)} · question answered` : carbToast(payload.grams, certainty);
    });
  }
  const answer = (prompt, value) => commit('answer', m => { m.answers[questionKey(prompt)] = { answer: value, at: context().now }; m.draft.question = null; m.flash = `Answered: ${answerLabel(value)}`; });
  // Undo clears the one answer; an entry it logged goes with it.
  const undo = prompt => commit('undo', m => { const held = m.answers[questionKey(prompt)]; delete m.answers[questionKey(prompt)]; if (held?.entry) m.entries = m.entries.filter(entry => entry.id !== held.entry); m.flash = 'Answer cleared'; });
  const remove = id => commit('remove', m => { m.entries = m.entries.filter(entry => entry.id !== id); for (const [key, held] of Object.entries(m.answers)) if (held.entry === id) delete m.answers[key]; m.flash = 'Entry removed'; });

  /* ---- the pane ------------------------------------------------------------- */
  function pane() {
    const kind = view.utility;
    const body = { settings: settingsBody, pump: pumpBody, carbs: carbsBody, questions: questionsBody, guide: guideBody, glossary: glossaryBody }[kind]();
    return `<aside class="pane gf-reading gf-utility" data-utility="${kind}" aria-label="${TITLE[kind]}"><header><h2>${TITLE[kind]}</h2>${body.meta ? `<span class="meta">${body.meta}</span>` : ''}<div class="gf-end"><button class="gf-btn gf-utility-close" data-utility-close>Close</button></div></header><div class="gf-pane-body">${status()}${body.html}</div></aside>`;
  }
  function status() {
    const mem = memory();
    if (mem.failed) return `<div class="gf-status" role="alert"><p class="gf-error">Save failed: no response from the store.</p><div class="gf-actions"><button class="gf-btn primary" data-utility-retry>Retry</button></div></div>`;
    return mem.flash ? `<p class="gf-meta gf-flash" role="status">${e(mem.flash)}</p>` : '';
  }
  // read versus view: the questions and the profile are the read's; the page's
  // clock is the view's, named beside it when the two differ
  const readMeta = at => (at ? `read ${e(shortDate(at))} · ${e(clock(at))}${at.slice(0, 16) !== String(context().now).slice(0, 16) ? ` · viewed ${e(shortDate(context().now))}` : ''}` : '');

  function settingsBody() {
    const form = memory().settings;
    return { meta: 'this page', html: `
      <section class="gf-section"><h3>API access</h3>
        <form data-utility-form="token"><label for="ut-token">Bearer token</label><div class="gf-field"><input id="ut-token" type="password" autocomplete="off" value="${e(form.token)}"><button class="gf-btn" type="button" data-utility-reveal="ut-token" aria-pressed="false">Show</button></div>
        <p class="gf-meta">${form.tokenSaved ? 'Token saved in this page.' : 'No token saved.'}</p>
        <div class="gf-actions" style="padding:0"><button class="gf-btn primary" type="submit">Save token</button></div></form></section>
      <section class="gf-section"><h3>Tandem credentials</h3>
        <form data-utility-form="credentials"><label for="ut-email">Email</label><input id="ut-email" type="email" autocomplete="off" value="${e(form.email)}">
        <label for="ut-password">Password</label><div class="gf-field"><input id="ut-password" type="password" autocomplete="off" value="${e(form.password)}"><button class="gf-btn" type="button" data-utility-reveal="ut-password" aria-pressed="false">Show</button></div>
        <label for="ut-region">Region</label><select id="ut-region"><option value="US" ${form.region === 'US' ? 'selected' : ''}>US</option><option value="EU" ${form.region === 'EU' ? 'selected' : ''}>EU</option></select>
        <p class="gf-meta">${form.credentialsSaved ? `Credentials saved in this page · ${e(form.credentialsSaved.region)} region · ${e(stamp(form.credentialsSaved.at))}` : 'No credentials saved.'}</p>
        <div class="gf-actions" style="padding:0"><button class="gf-btn primary" type="submit">Save credentials</button></div></form></section>
      <section class="gf-section"><h3>Developer mode</h3>
        <form data-utility-form="dev"><label class="gf-check"><input type="checkbox" ${form.dev ? 'checked' : ''}> Show the engine's raw internals</label><p class="gf-meta">Changes disclosure only, never the analysis.</p></form></section>` };
  }
  function pumpBody() {
    const { profile, changes } = context();
    if (!profile) return { meta: '', html: `<section class="gf-section"><p>This read serves no pump profile.</p><p class="gf-meta">The proposed schedule is in Changes.</p></section>` };
    return { meta: readMeta(profile.at), html: `
      <section class="gf-section"><h3>Detected on the pump <span class="meta">${e(profile.caption)} ${e(shortDate(profile.at))}</span></h3>${profileTable(profile.profile, e)}<p class="gf-meta">${e(profile.profile.name)} · detected schedule, not the Plan. The proposed schedule is in Changes.</p></section>
      ${changes.length ? `<section class="gf-section"><h3>Recorded changes</h3><table class="gf-table"><thead><tr><th scope="col">Setting</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>${changes.map(change => `<tr><td>${SETTING_NAME[change.parameter] || e(change.parameter)}<small>${e(stamp(change.at))}${change.slot ? ` · ${e(change.slot)}` : ''}</small></td><td class="v">${e(settingValue(change.parameter, change.before))}</td><td class="v">${e(settingValue(change.parameter, change.after))}</td></tr>`).join('')}</tbody></table></section>` : ''}` };
  }
  // The shipped quick-log sheet's controls: the preset pair (exact / ~), another
  // amount, the unknown amount, and when — relative to this page's clock.
  function amountControls(prompt = null) {
    const draft = memory().draft, target = prompt ? ` data-question="${e(questionKey(prompt))}"` : '';
    const loggable = isLoggable(draft.grams, 'exact');
    return `<p class="gf-note">Tap the number for an exact count · tap ~ for a rough guess.</p>
      <div class="gf-chips">${QUICKLOG_PRESETS.map(grams => `<span class="gf-chip"><button class="gf-btn" data-utility-log="${grams}" data-certainty="exact"${target}>${grams} g</button><button class="gf-btn" data-utility-log="${grams}" data-certainty="estimate"${target} aria-label="about ${grams} grams">~</button></span>`).join('')}</div>
      <div class="gf-field"><label for="ut-grams" class="gf-visually-hidden">Other amount</label><input id="ut-grams" type="number" min="0" step="1" inputmode="numeric" placeholder="other amount, g" value="${e(draft.grams)}"><button class="gf-btn" data-utility-log="other" data-certainty="exact"${target} ${loggable ? '' : 'disabled'}>Log</button><button class="gf-btn" data-utility-log="other" data-certainty="estimate"${target} ${loggable ? '' : 'disabled'}>~ est</button></div>
      <button class="linkbtn" data-utility-log="unknown" data-certainty="unknown"${target}>Ate something, don't know how much</button>`;
  }
  function carbsBody() {
    const mem = memory(), draft = mem.draft;
    const entries = mem.entries.slice().sort((a, b) => (a.t < b.t ? 1 : -1));
    return { meta: `at ${e(shortDate(context().now))} · ${e(clock(context().now))}`, html: `
      <section class="gf-section"><h3>Amount</h3>${amountControls()}</section>
      <section class="gf-section"><h3>When</h3><div class="seg gf-seg" role="group" aria-label="When">${QUICKLOG_TIMES.map(when => `<button data-utility-when="${when.k}" aria-pressed="${draft.when === when.k}">${when.label}</button>`).join('')}</div>
        ${draft.when === 'custom' ? `<div class="gf-field"><label for="ut-custom" class="gf-visually-hidden">Custom time</label><input id="ut-custom" type="datetime-local" value="${e(draft.customAt)}"></div>` : ''}
        <p class="gf-meta">One tap logs · defaults to now, ${e(clock(context().now))} on ${e(shortDate(context().now))}.</p></section>
      <section class="gf-section"><h3>Logged in this page <span class="meta">${entries.length}</span></h3>
        ${entries.length ? entries.map(entry => `<div class="gf-row gf-entry-row" role="listitem"><span class="when">${e(shortDate(entry.t))} ${e(clock(entry.t))}</span><span class="n">${entry.grams == null ? 'unknown amount' : `${entry.certainty === 'estimate' ? '~' : ''}${e(entry.grams)} g`}</span><span class="text">${entry.source === 'manual' ? 'Logged by hand' : 'Answered a carb question'}${entry.note ? ` · ${e(entry.note)}` : ''}</span><span class="gf-row-tools"><button class="linkbtn" data-action="day" data-date="${e(entry.t.slice(0, 10))}" data-subject="Log carbs">Open ${e(shortDate(entry.t))}</button><button class="linkbtn" data-utility-remove="${entry.id}">Remove</button></span></div>`).join('') : '<p class="gf-meta">Nothing logged yet. An entry shows on its Day as a manual carb mark.</p>'}
      </section>` };
  }
  function questionsBody() {
    const mem = memory(), list = pending(), at = context().utilities?.event_clock;
    if (!list.length) return { meta: readMeta(at), html: `<section class="gf-section"><p>No open questions at this read.</p><p class="gf-meta">A question is pinned where the read saw a low or a rise with no bolus; answering one de-biases the fasting windows.</p></section>` };
    return { meta: readMeta(at), html: `<p class="gf-note">${openCount()} of ${list.length} open · oldest first. Each sits where it happened.</p>${list.map(prompt => questionCard(prompt, mem)).join('')}` };
  }
  function questionCard(prompt, mem) {
    const held = answerOf(prompt), key = questionKey(prompt), logging = mem.draft.question === key;
    const entry = held?.entry ? mem.entries.find(item => item.id === held.entry) : null;
    return `<section class="gf-section gf-question" data-question-card="${e(key)}">
      <h3>${e(detectorKicker(prompt.detector))} <span class="meta">${e(shortDate(prompt.anchor_t))} ${e(clock(prompt.anchor_t))} · ${Math.round(prompt.age_days)} d before the read</span></h3>
      <div class="gf-spark" data-chart="prompt" data-question="${e(key)}" role="img" aria-label="Glucose two hours either side of ${e(clock(prompt.anchor_t))}, ${Math.round(prompt.key_bg)} at the low"></div>
      <p><b>${e(prompt.question)}</b></p><p class="gf-meta">${e(prompt.context)}</p>
      ${held ? `<p class="gf-meta gf-answered">Answered: ${e(answerLabel(held.answer))}${entry ? ` · ${entry.grams == null ? 'unknown amount' : `${entry.certainty === 'estimate' ? '~' : ''}${e(entry.grams)} g`} at ${e(clock(entry.t))}` : ''}</p><div class="gf-actions"><button class="gf-btn" data-utility-undo="${e(key)}">Undo</button><button class="gf-btn" data-action="day" data-date="${e(prompt.anchor_t.slice(0, 10))}" data-subject="Carb questions">Open ${e(shortDate(prompt.anchor_t))}</button></div>`
        : logging ? `${amountControls(prompt)}<div class="gf-actions"><button class="gf-btn" data-utility-cancel-log>Cancel</button></div>`
        : `<div class="gf-actions"><button class="gf-btn primary" data-utility-answer-carbs="${e(key)}">Log carbs</button><button class="gf-btn" data-utility-answer="no" data-question="${e(key)}">No</button><button class="gf-btn" data-utility-answer="not-sure" data-question="${e(key)}">Not sure</button><button class="gf-btn" data-action="day" data-date="${e(prompt.anchor_t.slice(0, 10))}" data-subject="Carb questions">Open ${e(shortDate(prompt.anchor_t))}</button></div>
          ${prompt.detector === 'low' ? `<p class="gf-meta">Or, this reading wasn't real:</p><div class="gf-actions"><button class="gf-btn" data-utility-answer="false-low" data-question="${e(key)}">Not real (sensor noise / compression low)</button></div>` : ''}`}
    </section>`;
  }
  function guideBody() {
    const slug = memory().guide, article = slug ? articleBySlug(slug) : null;
    if (!article) {
      const groups = CATEGORIES.map(category => ({ ...category, items: [...AUTHORED, ...GENERATED].filter(item => item.category === category.id) })).filter(group => group.items.length);
      return { meta: '', html: groups.map(group => `<section class="gf-section"><h3>${e(group.label)}</h3>${group.items.map(item => `<button class="gf-row gf-guide-row" data-utility-slug="${item.slug}"><span class="text">${e(item.title)}</span></button>`).join('')}</section>`).join('') };
    }
    const html = article.kind === 'authored' ? authoredArticle(article) : generatedArticle(article);
    return { meta: e(CATEGORIES.find(category => category.id === article.category)?.label || ''), html: `<div class="gf-actions"><button class="gf-btn" data-utility-slug="">← All articles</button></div><article class="gf-article"><h2 class="gf-title">${e(article.title)}</h2>${html}</article>` };
  }
  // The four authored articles are v1's own text: their tab names are kept, and
  // each handoff names the destination that reads as on this desk.
  function authoredArticle(article) {
    const markdown = served?.guide.articles[article.slug]?.markdown;
    if (!markdown) return '<p class="gf-meta">This article is not in the capture.</p>';
    const html = renderMarkdown(markdown)
      .replace(/<a class="handoff-inline" data-app="(\w+)">([^<]*)<\/a>/g, (_, app, text) => (HANDOFF[app] ? `<button class="linkbtn" data-utility-go="${HANDOFF[app][0]}">${text}</button> <small>(${HANDOFF[app][1]} here)</small>` : text))
      .replace(/<a class="xlink" data-slug="([\w-]+)">([^<]*)<\/a>/g, '<button class="linkbtn" data-utility-slug="$1">$2</button>');
    return `<p class="gf-meta">Written for the v1 tabs: Diagnose reads as Explore here, Plan as Changes.</p>${html}`;
  }
  function generatedArticle(article) {
    const catalog = served?.guide.catalog;
    if (!catalog) return '<p class="gf-meta">The catalog is not in the capture.</p>';
    const list = items => `<ul>${items.map(item => `<li>${guideMd(e(item))}</li>`).join('')}</ul>`;
    if (article.slug === 'what-this-is') return `<p>${guideMd(e(catalog.engine.tagline))}</p><h3>It is</h3>${list(catalog.engine.is)}<h3>It won't</h3>${list(catalog.engine.wont)}`;
    if (article.slug === 'the-pipeline') return `${catalog.pipeline.chain.map(step => `<h3>${e(step.step)}</h3><p><b>${e(step.one_liner)}</b></p><p>${guideMd(e(step.body))}</p>`).join('')}<h3>Two truths about silence</h3>${catalog.pipeline.suppression_truths.map(truth => `<p><b>${e(truth.title)}</b> ${guideMd(e(truth.body))}</p>`).join('')}`;
    if (article.slug === 'worked-example') {
      const { worked } = catalog;
      return `<p>${guideMd(e(worked.intro))}</p><p><b>${e(worked.episode.title)}</b> · ${e(worked.episode.when)} · peak ${e(worked.episode.peak)} (${e(worked.episode.peak_state)})</p>${guideWorkedRows(worked).map(row => (row.kind === 'pattern' ? `<h3>${e(row.stage)}</h3><p>${guideMd(e(row.pattern.body))} <small>${e(row.pattern.rate)}</small></p>` : `<h3>${e(row.stage)} <small>${e(row.step.t)} · ${e(guideTierLabel(catalog.tiers, row.step.tier))}</small></h3><p>${guideMd(e(row.step.text))}</p>${row.verdict ? `<p><b>${e(row.verdict.label)}: ${e(row.verdict.title)}</b> ${guideMd(e(row.verdict.body))}</p>` : ''}`)).join('')}`;
    }
    if (article.slug === 'silence') return catalog.tiers.map(tier => { const reasons = catalog.silence_reasons.filter(reason => reason.tier === tier.value); return reasons.length ? `<h3>${e(tier.label)}</h3>${reasons.map(reason => `<p><b>${e(reason.label)}</b> ${guideMd(e(reason.body))}</p>`).join('')}` : ''; }).join('');
    if (article.slug === 'evidence-tiers') return catalog.tiers.map(tier => `<h3>${e(tier.label)}</h3><p>${guideMd(e(tier.body))}</p>`).join('');
    return guideGroups(catalog).map(group => `<h3>${e(group.label)} <small>per ${e(group.denominator)}</small></h3>${group.levers.map(lever => `<p><b>${e(lever.title)}</b> ${guideMd(e(lever.meaning))}</p><p class="gf-meta">Measured: ${e(lever.measured)} · Recommends: ${e(lever.recommendation)}</p>`).join('')}`).join('');
  }
  function glossaryBody() {
    return { meta: 'v1 definitions', html: glossaryGroups.map(group => `<section class="gf-section"><h3>${e(PRESENT[group.title] || group.title)}</h3><dl class="gf-glossary">${group.terms.map(term => `<dt>${e(PRESENT[term.term] || term.term)}${PRESENT[term.term] || term.unit ? `<small>${PRESENT[term.term] ? `${e(term.term)} · ` : ''}${e(term.unit || '')}</small>` : ''}</dt><dd>${e(term.def)}</dd>`).join('')}</dl></section>`).join('') };
  }

  /* ---- seating: the pane in the desk, the strip, the footer count ---------- */
  // A utility replaces the reading pane in place; a frame with no desk gets one.
  // On the narrow desk the utility is the sheet.
  function seat(destination) {
    if (view.utility) {
      if (narrow()) { view.sheetOpen = true; surface.dataset.sheet = 'open'; }
      const reading = surface.querySelector('.gf-desk > .gf-reading');
      if (reading) reading.outerHTML = pane();
      else { const stage = surface.querySelector('.pane'); if (stage) stage.outerHTML = kit.desk(stage.outerHTML, pane()); }
    }
    // the detected pump settings open from Changes, beside the proposed Plan
    if (destination === 'changes') {
      const head = surface.querySelector('.gf-stage > header');
      const end = head?.querySelector('.gf-end');
      const button = '<button class="gf-btn" data-utility="pump">Pump settings</button>';
      if (end) end.insertAdjacentHTML('beforeend', button); else head?.insertAdjacentHTML('beforeend', `<div class="gf-end">${button}</div>`);
    }
    surface.insertAdjacentHTML('beforeend', `<nav class="gf-utility-strip" aria-label="Utilities"><button data-utility="carbs">Log carbs</button><button data-utility="questions">Questions <span class="cockpit-count">${openCount()}</span></button><button data-utility="guide">Guide</button><button data-utility="settings">Settings</button><button data-utility="glossary">Glossary</button></nav>`);
    surface.querySelector('.gf-utility-strip').toggleAttribute('inert', narrow() && view.sheetOpen);
    for (const button of document.querySelectorAll('.cockpit-utilities [data-utility], .cockpit-log-carbs, .gf-utility-strip [data-utility]')) button.setAttribute('aria-pressed', String((button.dataset.utility || 'carbs') === view.utility));
    const count = document.querySelector('.cockpit-questions .cockpit-count'); if (count) count.textContent = String(openCount());
  }
  function open(kind, from) {
    if (view.utility !== kind) { opener = from || opener; view.utility = kind; }
    view.asideOpen = false;
    view.focusAfterRender = '.gf-utility-close';
    kit.render();
  }
  function close() {
    const back = opener; opener = null; view.utility = null; view.sheetOpen = false; memory().flash = null;
    kit.render();
    (typeof back === 'string' ? surface.querySelector(back) : back)?.focus();
  }
  // The shell's footer and topbar controls are bound once; the shell has no
  // Carb questions slot, so one is added beside Guide with the open count.
  function bindShell() {
    const footer = document.querySelector('.cockpit-utilities');
    if (footer && !footer.querySelector('.cockpit-questions')) footer.insertAdjacentHTML('afterbegin', '<button class="cockpit-questions" data-utility="questions">Carb questions <span class="cockpit-count">0</span></button>');
    for (const button of footer?.querySelectorAll('button') || []) {
      const kind = button.dataset.utility || { Guide: 'guide', Settings: 'settings', Glossary: 'glossary' }[button.textContent.trim()];
      if (!kind) continue;
      button.dataset.utility = kind; button.onclick = () => open(kind, button);
    }
    const log = document.querySelector('.cockpit-log-carbs'); if (log) log.onclick = () => open('carbs', log);
    if (mockbar.querySelector('.gf-review[data-source="utilities"]')) return;
    mockbar.querySelector('p').insertAdjacentHTML('beforebegin', `<span class="gf-review" data-source="utilities"><label><input type="checkbox" aria-label="Next utility save fails"> Next utility save fails</label><span class="gf-review-memo">Utility writes stay in this page; the read does not recalculate.</span></span>`);
    mockbar.querySelector('[aria-label="Next utility save fails"]').onchange = event => { saveFails = event.target.checked; };
  }
  function bind() {
    const mem = memory();
    // a desk opener is re-rendered, so Close finds it again by its selector
    for (const button of surface.querySelectorAll('[data-utility]')) if (button.tagName === 'BUTTON') button.onclick = () => open(button.dataset.utility, `button[data-utility="${button.dataset.utility}"]`);
    const closeButton = surface.querySelector('[data-utility-close]'); if (closeButton) closeButton.onclick = close;
    const retry = surface.querySelector('[data-utility-retry]'); if (retry) retry.onclick = () => mem.failed.run();
    for (const button of surface.querySelectorAll('[data-utility-go]')) button.onclick = () => { if (narrow()) view.utility = null; kit.navigate(button.dataset.utilityGo); };
    for (const button of surface.querySelectorAll('[data-utility-slug]')) button.onclick = () => { mem.guide = button.dataset.utilitySlug || null; view.focusAfterRender = mem.guide ? '.gf-article .gf-title' : `[data-utility-slug="${button.dataset.utilitySlug}"]`; kit.render(); surface.querySelector('.gf-utility .gf-pane-body')?.scrollTo(0, 0); };
    for (const button of surface.querySelectorAll('[data-utility-when]')) button.onclick = () => { mem.draft.when = button.dataset.utilityWhen; kit.render(); };
    const grams = surface.querySelector('#ut-grams'); if (grams) grams.oninput = event => { mem.draft.grams = event.target.value; for (const button of surface.querySelectorAll('[data-utility-log="other"]')) button.disabled = !isLoggable(event.target.value, 'exact'); };
    const custom = surface.querySelector('#ut-custom'); if (custom) custom.oninput = event => { mem.draft.customAt = event.target.value; };
    for (const button of surface.querySelectorAll('[data-utility-log]')) button.onclick = () => {
      const prompt = button.dataset.question ? pending().find(item => questionKey(item) === button.dataset.question) : null;
      const amount = button.dataset.utilityLog === 'unknown' ? null : button.dataset.utilityLog === 'other' ? mem.draft.grams : Number(button.dataset.utilityLog);
      logCarbs(amount, button.dataset.certainty, prompt);
    };
    for (const button of surface.querySelectorAll('[data-utility-answer-carbs]')) button.onclick = () => { mem.draft.question = button.dataset.utilityAnswerCarbs; view.focusAfterRender = `[data-question-card="${button.dataset.utilityAnswerCarbs}"] [data-utility-log]`; kit.render(); };
    const cancel = surface.querySelector('[data-utility-cancel-log]'); if (cancel) cancel.onclick = () => { const key = mem.draft.question; mem.draft.question = null; view.focusAfterRender = `[data-utility-answer-carbs="${key}"]`; kit.render(); };
    for (const button of surface.querySelectorAll('[data-utility-answer]')) button.onclick = () => { const prompt = pending().find(item => questionKey(item) === button.dataset.question); view.focusAfterRender = `[data-utility-undo="${button.dataset.question}"]`; answer(prompt, button.dataset.utilityAnswer); };
    for (const button of surface.querySelectorAll('[data-utility-undo]')) button.onclick = () => { const prompt = pending().find(item => questionKey(item) === button.dataset.utilityUndo); view.focusAfterRender = `[data-utility-answer-carbs="${button.dataset.utilityUndo}"]`; undo(prompt); };
    for (const button of surface.querySelectorAll('[data-utility-remove]')) button.onclick = () => remove(Number(button.dataset.utilityRemove));
    for (const button of surface.querySelectorAll('[data-utility-reveal]')) button.onclick = () => { const field = surface.querySelector(`#${button.dataset.utilityReveal}`); const shown = field.type === 'text'; field.type = shown ? 'password' : 'text'; button.textContent = shown ? 'Show' : 'Hide'; button.setAttribute('aria-pressed', String(!shown)); };
    const settings = mem.settings;
    for (const [id, key] of [['ut-token', 'token'], ['ut-email', 'email'], ['ut-password', 'password'], ['ut-region', 'region']]) { const field = surface.querySelector(`#${id}`); if (field) field.oninput = field.onchange = event => { settings[key] = event.target.value; }; }
    const token = surface.querySelector('[data-utility-form="token"]'); if (token) token.onsubmit = event => { event.preventDefault(); view.focusAfterRender = '#ut-token'; commit('settings', m => { m.settings.tokenSaved = !!m.settings.token; m.flash = m.settings.token ? 'Token saved in this page' : 'Token cleared'; }); };
    const credentials = surface.querySelector('[data-utility-form="credentials"]'); if (credentials) credentials.onsubmit = event => { event.preventDefault(); view.focusAfterRender = '#ut-email'; commit('settings', m => { m.settings.credentialsSaved = { region: m.settings.region, at: context().now }; m.settings.password = ''; m.flash = 'Credentials saved in this page'; }); };
    const dev = surface.querySelector('[data-utility-form="dev"] input'); if (dev) dev.onchange = event => { settings.dev = event.target.checked; };
  }
  function mountCharts() {
    for (const host of surface.querySelectorAll('[data-chart="prompt"]')) {
      if (!globalThis.echarts) return;
      const prompt = pending().find(item => questionKey(item) === host.dataset.question);
      const chart = echarts.init(host, null, { renderer: 'svg' });
      chart.setOption(buildSparklineOption(prompt, colors)); charts.push(chart);
    }
  }
  return {
    load(json) { served = json; bindShell(); },
    seat, bind, mountCharts,
    dispose() { for (const chart of charts) chart.dispose(); charts = []; },
    open,
    // the Day desk draws this page's entries for the current source as manual carb marks
    entries: () => memory().entries,
    // a destination change keeps the utility on the desk; the narrow sheet closes with it
    onNavigate() { if (narrow()) view.utility = null; },
    // Escape steps a Guide article back to its index, then closes the utility
    escape() {
      if (!view.utility) return false;
      if (view.utility === 'guide' && memory().guide) { memory().guide = null; view.focusAfterRender = '.gf-guide-row'; kit.render(); return true; }
      close(); return true;
    },
  };
}
