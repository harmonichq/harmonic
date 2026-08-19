/* EXTRACTED VERBATIM from frontend/diagnose-workstation.js by
 * mockups/finding-evidence-routing.exploration/build.mjs. Do not edit —
 * re-run the build script.
 *
 * This IS the production Diagnose evidence table: its group headers, its
 * seven-column rows, its five-row cap and two-way expander, its tier word.
 * The exploration draws no table of its own (round 8, item 1). The only
 * edits are the three `export` keywords, so the surface can import it and
 * split a group the same way it does (`tierOf` decides fits from counter).
 */
export const EVIDENCE_CAP = 5;

const fmtDate = (iso) => new Date(`${iso}T00:00:00`)
  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function tierOf(occ) {
  const matched = (occ.verdicts || []).find((v) => v.matched);
  return matched ? matched.evidence_tier : null;
}

export function renderEvidence(host, factor, occurrences, onOpen, onMore, shownCount) {
  if (!occurrences.length) {
    // appended, never assigned: the factor head is already in this level
    host.insertAdjacentHTML('beforeend',
      '<div class="empty">No attributed occurrences in this range.</div>');
    return;
  }
  const fits = occurrences.filter((o) => tierOf(o));
  const counter = occurrences.filter((o) => !tierOf(o));
  // the hedged sentence, once, from the fixture's own text
  /* The group header names the GROUP. It used to be built by regex-trimming one
     occurrence's sentence, which produced a mid-sentence fragment with no
     opening clause and no terminal punctuation — a sentence about ONE episode
     masquerading as a label for all of them. It is now the factor's own causal
     phrase, which is what the group actually is, and degrades to the bare hedge
     if a factor somehow carries no title. */
  const tier = fits.length ? tierOf(fits[0]) : null;
  const groupPhrase = (factor.cause || '').trim();

  /* Aligned numeric columns: entry → worst → Δ where the fixture holds BOTH
     readings, and a stated "extreme only" cell where it holds one. Nothing is
     inferred to fill a column — a missing reading stays missing. */
  const rows = (list, limit) => list.slice(0, limit).map((o) => {
    const worst = o.worst_bg != null ? Math.round(o.worst_bg) : null;
    const entry = o.bg != null ? Math.round(o.bg) : null;
    const both = entry != null && worst != null && entry !== worst;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ev-row';
    b.dataset.counter = String(!tierOf(o));
    b.title = o.text || '';
    const nums = both
      ? `<span class="entry">${entry}</span><span class="arrow" aria-hidden="true">→</span>
         <span class="worst">${worst}</span>
         <span class="delta">${worst - entry > 0 ? '+' : '−'}${Math.abs(worst - entry)}</span>`
      : `<span class="only">${worst ?? entry ?? '—'} <span>· extreme only</span></span>`;
    b.innerHTML = `<span class="when">${fmtDate(o.date)} · ${o.t.slice(11, 16)}</span>
      ${nums}
      <span class="tier">${tierOf(o) || 'unclassified'}</span>`;
    b.addEventListener('click', () => onOpen(o));
    return { node: b, occ: o };
  });

  if (fits.length) {
    // The hedge prints ONCE, as this group's header, whether five rows or fifty
    // are showing — it is a property of the group, not of a row, so expanding
    // must never restate it.
    host.insertAdjacentHTML('beforeend',
      `<div class="ev-group">${groupPhrase ? `<b>${groupPhrase}</b> — ` : ''}${tier}, not confirmed`
      + ` <span class="n">· ${fits.length} episode${fits.length === 1 ? '' : 's'}</span></div>`);
    for (const { node } of rows(fits, shownCount)) host.append(node);
    // the cap is a real toggle: five rows, then "N more", then back to five
    if (fits.length > EVIDENCE_CAP) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'more';
      more.textContent = shownCount > EVIDENCE_CAP
        ? `Show first ${EVIDENCE_CAP}`
        : `${fits.length - EVIDENCE_CAP} more`;
      more.addEventListener('click', onMore);
      host.append(more);
    }
  }
  if (counter.length) {
    host.insertAdjacentHTML('beforeend',
      `<div class="ev-group counter">Attributed here, but no classifier fired on the pattern
        <span class="n">· ${counter.length}</span></div>`);
    for (const { node } of rows(counter, counter.length)) host.append(node);
  }
}
