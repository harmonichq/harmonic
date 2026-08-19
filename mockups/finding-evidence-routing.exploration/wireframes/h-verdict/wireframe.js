/* Wireframe round H — three shapes for one finding's occurrences.
 *
 * WHAT IS REAL HERE. The surface is the app's: `.dw` / `.panes` / `.pane
 * .inspector` from frontend/diagnose-workstation.css, the crumb, the settled
 * factor dropdown (`.fer-sel`, scene.css), the level, the one-line dock, and —
 * the thing this round is drawn ON — the production evidence table: `.lvl-cap`,
 * `.ev-group`'s successor `.fer-group`, `.ev-row` on its seven-column spine,
 * `.fer-residue`, `.more`.
 *
 * WHAT IS NEW. Three blocks, one per form: the verdict sentence (H1), the tally
 * line + inline verdict marks (H2), the proportional band (H3). Their rules live
 * in ./wireframe.css and each says which shipped sibling it copied.
 *
 * WHICH CASE FILE. The population case file for `Lows`, with the factor dropdown
 * standing on `Over-treated low` — because that is the frame the seventeen-row
 * three-verdict table actually belongs to in the exploration's data. Using the
 * finding case file instead would put the projection's own `1 episode` count on
 * the crumb beside a table of seventeen, which is a fixture disagreement this
 * round has no business re-litigating.
 *
 * EVERY FIGURE IS READ FROM ../../data.json. Nothing below hand-enters a count,
 * a date, a glucose value or a window. Prose that is not a figure is wireframe
 * placeholder.
 */

const data = await fetch('../../data.json').then((r) => r.json());

const POP = data.scenes['population:lows'];
const FRAME = POP.frames.over_treated_low;
const OCC = FRAME.occurrences;
const GROUPS = OCC.groups;
const HEDGE = FRAME.canvas.nearRuleNote;
const DOCK = data.dock.population;

/* The cap's own parts. ROUND 8 moved the numerator out of data.json — under H3
   the roster is one verdict long, so how many rows the table draws is a runtime
   fact — and this page composes the same line the mock does. */
const CAP_HEAD = OCC.cap.key;
const POOL = String(OCC.cap.denominator);
const WINDOW = OCC.cap.window;
const SHOWN = String(GROUPS.reduce((n, g) => n + g.occurrences.length, 0));

/* ROUND 8 — data.json carries occurrences in the SHIPPED evidence shape now
   (the mock runs the production `renderEvidence` over them), so this page
   formats its own display cells. VERBATIM — diagnose-workstation.js
   `renderEvidence`'s date, time and numeric-cell rules. */
const fmtDate = (iso) => new Date(`${iso}T00:00:00`)
  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const cells = (o) => {
  const worst = o.worst_bg != null ? Math.round(o.worst_bg) : null;
  const entry = o.bg != null ? Math.round(o.bg) : null;
  return {
    when: `${fmtDate(o.date)} · ${o.t.slice(11, 16)}`,
    entry, worst,
    delta: `${worst - entry > 0 ? '+' : '−'}${Math.abs(worst - entry)}`,
    title: o.text || '',
  };
};

/** One flat roster, each row carrying the verdict of the group it came from. */
const ROSTER = GROUPS.flatMap((g, gi) => g.occurrences.map((o, ri) => ({
  ...o, ...cells(o), verdict: g.key, verdictLead: g.lead, order: gi * 100 + ri,
  swing: Math.abs(o.worst_bg - o.bg),
})));

/* The drilled occurrence is the LARGEST SWING in the set — not a pick. It turns
   out to be a near-rule occurrence, which is exactly why it is worth drilling:
   the worst-looking low here is one the habit did not claim, and each form makes
   reaching it cost something different. */
const DRILL = ROSTER.reduce((a, b) => (b.swing > a.swing ? b : a));

/** H2's order: biggest swing first, original order as the tie-break. */
const RANKED = [...ROSTER].sort((a, b) => b.swing - a.swing || a.order - b.order);

/** The short verdict a row prints in the shipped tier column. */
const MARK = { fired: 'matched', near_rule: 'near rule', neutral: 'did not match' };
const countOf = (key) => GROUPS.find((g) => g.key === key).count;
const leadOf = (key) => GROUPS.find((g) => g.key === key).lead;

/* ------------------------------------------------------------------ markup */

/** The production evidence row, verbatim in structure; only the tier cell's
    content differs between forms, and it stays in the tier cell. */
const row = (r, { selected = false, mark = '' } = {}) => `
  <button type="button" class="ev-row" data-id="${r.id}" data-counter="false"
          data-selected="${selected}" data-route="none" title="${r.title}">
    <span class="when">${r.when}</span>
    <span class="entry">${r.entry}</span><span class="arrow" aria-hidden="true">→</span>
    <span class="worst">${r.worst}</span><span class="delta">${r.delta}</span>
    <span class="tier"${mark ? ` data-verdict="${r.verdict}"` : ''}>${mark}</span>
    <span class="chev" aria-hidden="true">›</span>
  </button>`;

/** The settled group rule (scene.css block 5). */
const groupRule = (g, withCount) => `
  <div class="fer-group"><span class="lab">${g.lead}</span>
    <i class="rule" aria-hidden="true"></i>
    ${withCount ? `<span class="n">${g.count}</span>` : ''}</div>`;

const cap = (meta) => `<div class="lvl-cap fer-occ-cap">Occurrences<span class="meta">${meta}</span></div>`;
const residue = () => `<div class="fer-residue">${OCC.residue}</div>`;
const more = (n) => (n > 0 ? `<button type="button" class="more">${n} more</button>` : '');

/** The occurrence's own detail — every element shipped (level 3 of the
    workstation inspector). Only the back line is new. */
const drillBlock = (occ, { inline = false, back = '' } = {}) => `
  <div class="hv-drill" ${inline ? 'data-inline="true"' : ''}>
    ${back ? `<button type="button" class="hv-back">‹ ${back}</button>` : ''}
    <div class="inner">
      <div class="occ-head">
        <span class="when">${occ.when}</span>
        <span class="tag">${occ.verdictLead}</span>
        <span class="pos">${RANKED.indexOf(occ) + 1} of ${SHOWN}<i class="keyhint">← →</i></span>
      </div>
      <div class="occ-nums">${occ.entry} <span>at entry</span> → ${occ.worst} <span>nadir</span>
        <span>·</span> ${occ.delta} <span>mg/dL</span></div>
      <div class="statline">The canvas shows this day's own trace over the pooled envelope, with the
        other ${SHOWN - 1} occurrences still drawn behind it.</div>
      <div class="occ-say">This low came close to the over-treated pattern without matching it —
        near-rule occurrences are shown so nothing is hidden from you. ${HEDGE}</div>
    </div>
  </div>`;

/* ------------------------------------------------------------------- forms */

/* H1 — THE VERDICT LEADS.
 *
 * A plain-language statement of what the finding found, before the reader meets
 * a row. The roster underneath is unchanged from today: the same three group
 * rules over the same production rows, demoted from "the content" to "the
 * backing". The verdict block does not move when the reader drills — that is
 * H1's whole claim, that the answer stays in view. */
function h1(state) {
  const drilled = state === 'drill';
  const verdict = `
    <div class="hv-verdict">
      <p class="say">Over-treated low held in <b>${countOf('fired')}</b> of the <b>${SHOWN}</b> lows
        it could be compared against.</p>
      <p class="sub"><em>${countOf('near_rule')}</em> more came close without matching, and
        <em>${countOf('neutral')}</em> matched no factor's rule. ${WINDOW}.</p>
      <p class="hedge">${countOf('near_rule')} near-rule lows. ${HEDGE}</p>
    </div>`;

  const limit = drilled ? 4 : 9;
  let budget = limit;
  const body = GROUPS.map((g) => {
    if (budget <= 0) return '';
    const rows = g.occurrences.slice(0, budget);
    budget -= rows.length;
    return groupRule(g, true) + rows.map((r) => row(
      ROSTER.find((x) => x.id === r.id),
      { selected: drilled && r.id === DRILL.id },
    )).join('');
  }).join('');

  return verdict
    + (drilled ? drillBlock(DRILL, { back: 'Over-treated low · all occurrences' }) : '')
    + cap(`${CAP_HEAD} &nbsp;·&nbsp; ${SHOWN} of ${POOL} in ${WINDOW}`)
    + body + residue() + more(Number(SHOWN) - limit);
}

/* H2 — ONE RANKED LIST.
 *
 * No group headers at all. Seventeen occurrences in one order — biggest swing
 * first — each carrying its verdict in the shipped row's own tier column. The
 * verdict becomes an attribute of an occurrence rather than a container holding
 * it, so the reader compares occurrences directly and can see, in the first
 * line of the list, that the largest swing is one the habit did not claim.
 *
 * The tally line carries what the three group headers used to: the split, and
 * the near-rule hedge, which no longer has a header to hang off. Drilling
 * expands the detail in place, between two rows, so the ranking survives it. */
function h2(state) {
  const drilled = state === 'drill';
  const limit = drilled ? 8 : 11;
  const rows = RANKED.slice(0, limit).map((r) => {
    const node = row(r, { selected: drilled && r.id === DRILL.id, mark: MARK[r.verdict] });
    return drilled && r.id === DRILL.id
      ? node + drillBlock(r, { inline: true })
      : node;
  }).join('');

  const tally = `
    <div class="hv-tally">
      <b>${countOf('fired')}</b> ${leadOf('fired').toLowerCase()}<span class="sep">·</span>
      <b>${countOf('near_rule')}</b> ${leadOf('near_rule').toLowerCase()}<span class="sep">·</span>
      <b>${countOf('neutral')}</b> ${leadOf('neutral').toLowerCase()}<br>
      Near rule is ${HEDGE.charAt(0).toLowerCase() + HEDGE.slice(1)}
    </div>`;

  return cap(`${CAP_HEAD} &nbsp;·&nbsp; ${SHOWN} of ${POOL} in ${WINDOW}`)
    + tally
    + `<div class="hv-rankcap fer-residue">Ordered by how far the low fell.</div>`
    + rows + residue() + more(Number(SHOWN) - limit);
}

/* H3 — PROPORTIONAL BAND, ONE VERDICT AT A TIME.
 *
 * The split becomes a figure — one 10px row divided by count — and the roster
 * below it holds exactly one verdict's occurrences. It is the shortest of the
 * three columns and the only one that still works at sixty occurrences.
 *
 * IT SCOPES THE ROSTER ONLY. The canvas keeps drawing all three cohorts, always
 * (#31 amendment: there is no cohort filter anywhere). That is stated on the
 * surface, in the band's own caveat line, because a control that looks like a
 * cohort filter sitting beside a canvas that is never cohort-filtered is the
 * exact disagreement the ruling exists to prevent — and it is the strongest
 * argument against this form. */
function h3(state) {
  const drilled = state === 'drill';
  const chosen = drilled ? DRILL.verdict : 'fired';
  const g = GROUPS.find((x) => x.key === chosen);

  const band = `
    <div class="hv-band">
      <div class="bar" role="group" aria-label="Verdict split"
           style="grid-template-columns:${GROUPS.map((x) => x.count).join('fr ')}fr">
        ${GROUPS.map((x) => `<button type="button" class="seg" aria-pressed="${x.key === chosen}"
            aria-label="${x.lead} · ${x.count}" data-key="${x.key}"></button>`).join('')}
      </div>
      <div class="keys">
        ${GROUPS.map((x) => `<button type="button" class="key" aria-pressed="${x.key === chosen}"
            data-key="${x.key}"><span>${x.lead}</span><span class="n">${x.count}</span></button>`).join('')}
      </div>
      <p class="caveat">${SHOWN} of ${POOL} lows in ${WINDOW}. The band scopes this list only — the
        comparison beside it always draws all three.</p>
    </div>`;

  if (drilled) {
    return band + drillBlock(DRILL, { back: `${g.lead} · ${g.count}` });
  }

  const limit = 9;
  const rows = g.occurrences.slice(0, limit)
    .map((r) => row(ROSTER.find((x) => x.id === r.id))).join('');
  return band
    + cap(`${CAP_HEAD} &nbsp;·&nbsp; ${g.count} of ${POOL} in ${WINDOW}`)
    + rows + residue() + more(g.count - limit);
}

const FORMS = { h1, h2, h3 };

/* ------------------------------------------------------------------- stage */

/** The app surface, once per frame. Canvas head is the shipped one; its body is
    a stated placeholder — this round proposes nothing on the canvas. */
function stageMarkup(inner) {
  return `
  <section class="dw ec-surface fer-surface" data-state="typical">
    <main class="panes">

      <section class="pane canvas-pane ec-canvas" aria-label="Evidence canvas">
        <header class="canvas-head" data-hover="0">
          <div class="head-swap">
            <div class="head-line head-rest"><h2>${FRAME.canvas.title}</h2></div>
          </div>
          <span class="meta persist">${FRAME.canvas.context}</span>
        </header>
        <div class="body hv-canvas-body">
          <div class="l1">The comparison canvas is unchanged by this round.</div>
          <div class="l2">All three cohorts stay drawn at all times, and the selected occurrence's
            own trace rides over them. Round H proposes nothing here — the question is the
            column to the right.</div>
        </div>
      </section>

      <section class="pane inspector" aria-label="Inspector">
        <header><h2>Inspector</h2></header>
        <div class="body">
          <div class="crumb">
            <div class="trail">
              <button type="button">${POP.crumb.root}</button>
              <span class="chev" aria-hidden="true">›</span>
              <span class="here" aria-current="page">${POP.crumb.here}</span>
            </div>
            <span class="fer-count">${POP.crumbCount}</span>
          </div>
          <div class="fer-sel-host" data-open="false">
            <button type="button" class="fer-sel" aria-expanded="false" aria-haspopup="listbox">
              <span class="nm">${FRAME.label}</span>
              <span class="ct">${FRAME.count}</span>
              <span class="chev" aria-hidden="true">›</span>
            </button>
          </div>
          <div class="level">${inner}</div>
        </div>
        <div class="watch"><span class="fer-dock-line">${DOCK}</span></div>
      </section>

    </main>
  </section>`;
}

/* ------------------------------------------------------------------ notes */

const NOTES = {
  h1: `<b>What it trades.</b> Four lines of the column, spent on the answer, every single visit —
    and one sentence per finding kind that somebody has to write and keep true. In exchange the
    reader never has to count rows to learn whether the habit held, and the sentence is still on
    screen when they drill, so the occurrence is read <em>against</em> the verdict rather than
    instead of it. The roster below is exactly today's: same group rules, same rows, demoted from
    the content to the backing.`,
  h2: `<b>What it trades.</b> The summary. There is no statement of the split beyond the tally line,
    and the near-rule hedge loses the group header it used to hang off. What it buys is the only
    honest comparison of the three — one order, one spine, seventeen occurrences — and it pays off
    immediately here: the largest fall in the whole set sits at the top of the list carrying
    <em>near rule</em>, which is a fact the grouped form buries four rows into a middle section.
    Drilling opens in place, so the ranking never moves.`,
  h3: `<b>What it trades.</b> Cross-verdict comparison, for height. The split reads in one glance
    and the roster is never longer than one verdict — the only form here that survives a finding
    with sixty occurrences. But the reader can no longer see the near-rule outlier without
    deliberately switching to it, and the band reads as a cohort filter sitting beside a canvas
    that is deliberately never filtered. It also stacks a second control directly under the factor
    dropdown, so the column opens with two rows of chrome before any evidence.`,
};

/* ----------------------------------------------------------------- harness */

/* The three switches also read from the URL hash — `#form=h2&state=drill&theme=dark`
   — so a frame can be linked to, reloaded into, and captured deterministically.
   Nothing else depends on it; it is a wireframe convenience, not a proposal. */
const HASH = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
const state = {
  form: HASH.form || 'all',
  state: HASH.state || 'rest',
  theme: HASH.theme || (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
};

function paint() {
  for (const stage of document.querySelectorAll('.hv-stage')) {
    stage.innerHTML = stageMarkup(FORMS[stage.dataset.form](state.state));
  }
  for (const key of ['h1', 'h2', 'h3']) {
    document.getElementById(`note-${key}`).innerHTML = NOTES[key];
    document.getElementById(`frame-${key}`).hidden = state.form !== 'all' && state.form !== key;
  }
  document.documentElement.classList.toggle('dark', state.theme === 'dark');
  for (const b of document.querySelectorAll('.hv-switch button')) {
    b.setAttribute('aria-pressed', String(state[b.dataset.set] === b.dataset.val));
  }
}

for (const b of document.querySelectorAll('.hv-switch button')) {
  b.addEventListener('click', () => { state[b.dataset.set] = b.dataset.val; paint(); });
}

paint();
