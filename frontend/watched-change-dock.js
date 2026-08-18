/* The watched-change dock — the inspector's FLOOR (lock terms 46–49).
 *
 * CONTEXT.md's watching-changes rule already settles the shape: Plan, Trial and
 * Focus all obey one variable under study, at most one is active at a time, and the
 * app exposes a SINGLE active watched-change object, never two lists. So the floor
 * of the inspector is that one object, in one reserved height, in four mutually
 * exclusive states — and the pane header's staged status is deleted in the same
 * change, because two claims about one object on one screen is the defect term 47
 * exists to remove (the header could read "nothing staged" while a Trial was being
 * watched, since it only ever named the Plan branch).
 *
 * PRECEDENCE IS NOT DECIDED HERE. `watched` arrives already resolved by
 * `watched_change.active_watched_change` — Trial XOR Focus, pump wins, a Focus is
 * blocked under a Trial and dropped when a setting change preempts it (ADR 0029).
 * This module only fills the slot: the watched object if there is one, else the
 * Plan draft staged on this surface, else idle.
 */

/** Term 47 — the four kind labels, byte for byte. */
export const KIND = {
  trial: 'Trial · watching',
  focus: 'Focus · watching',
  plan: 'Plan · staged',
  idle: 'Nothing being watched',
};
/** The sentence a 98px reserve exists to protect — it wraps and never ellipsizes. */
export const PLAN_DETAIL = 'Staged, not applied — nothing has changed on the pump';
export const IDLE_TITLE = 'No change staged, no trial or focus active';
export const IDLE_DETAIL = 'Stage a change from a finding to start one.';

const PARAMETER = {
  basal_rate: 'Basal', isf: 'ISF', carb_ratio: 'I:C',
  target_bg: 'Target', profile: 'Profile',
};
const UNIT = { basal_rate: 'U/hr', carb_ratio: 'g/U', isf: 'mg/dL/U', target_bg: 'mg/dL' };

const num = (value) => {
  const text = String(Number(value));
  return text.includes('.') ? text : `${text}.0`;
};
/** `2026-08-11 07:00:00` -> `08-11`. The year is noise at this size. */
const monthDay = (stamp) => (typeof stamp === 'string' ? stamp.slice(5, 10) : '');

/** A Trial's own name for the change it is watching. */
function trialTitle(trial) {
  const name = PARAMETER[trial.parameter] || trial.parameter;
  const unit = UNIT[trial.parameter];
  const where = trial.slot ? `${name} ${trial.slot}` : name;
  if (trial.before == null || trial.after == null || !unit) return where;
  return `${where} · ${num(trial.before)} → ${num(trial.after)} ${unit}`;
}

/**
 * The one object the dock reports, as `{ state, kind, title, detail, route }`.
 *
 * `detail` is a list of `{ text }` / `{ strong }` parts rather than markup, so the
 * painter can emphasise a count without this module writing HTML.
 */
export function watchDockView({ watched = null, staged = null } = {}) {
  if (watched && watched.kind === 'trial') {
    const maturing = watched.maturing || {};
    // "Maturing" and "ready to judge" are the domain's own words for a Trial's
    // watch phase (CONTEXT.md) — neither is invented here.
    const lead = maturing.is_maturing ? 'Maturing — ' : 'Ready to judge — ';
    return {
      state: 'trial',
      kind: KIND.trial,
      title: trialTitle(watched),
      detail: [
        { text: lead },
        { strong: `${maturing.days_elapsed ?? 0} of ${maturing.days_required ?? 0}` },
        { text: ` days since ${monthDay(watched.changed_at)}` },
      ],
      route: { label: 'Open Verify', to: 'verify' },
    };
  }
  if (watched && watched.kind === 'focus') {
    return {
      state: 'focus',
      kind: KIND.focus,
      title: watched.title,
      // Adherence and outcome are two dimensions read off Verify's own series
      // (CONTEXT.md "Focus"); the dock names where they are read, never guesses them.
      detail: [{ text: `Pinned ${monthDay(watched.pinned_at)} · adherence and outcome are read on Verify` }],
      route: { label: 'Open Verify', to: 'verify' },
    };
  }
  if (staged && staged.count > 0) {
    return {
      state: 'plan',
      kind: KIND.plan,
      title: staged.title,
      detail: [{ text: PLAN_DETAIL }],
      route: { label: 'Open Plan', to: 'plan' },
    };
  }
  return {
    state: 'idle',
    kind: KIND.idle,
    title: IDLE_TITLE,
    detail: [{ text: IDLE_DETAIL }],
    route: null,
  };
}

/* --------------------------------------------------------------- the painter */

/**
 * Paint the dock into the node the pane already carries.
 *
 * The dock is PANE FURNITURE (term 46): the markup is mounted once with the pane and
 * every drill level repaints it in place, so it can never be scrolled away, never
 * become level-1 content and never depend on the queue's length or scope.
 */
export function paintWatchDock(node, view, onRoute) {
  if (!node) return;
  node.innerHTML = '';
  node.dataset.state = view.state;
  const kind = document.createElement('span');
  kind.className = 'kind';
  kind.textContent = view.kind;
  node.append(kind);
  // MAY ellipsize (term 49) — it is a name, and the sentence below is the claim
  const what = document.createElement('span');
  what.className = 'what';
  what.textContent = view.title;
  node.append(what);
  const how = document.createElement('span');
  how.className = 'how';
  for (const part of view.detail) {
    if (part.strong == null) { how.append(part.text); continue; }
    const bold = document.createElement('b');
    bold.textContent = part.strong;
    how.append(bold);
  }
  node.append(how);
  if (!view.route) return;
  // OUTLINED, never filled: the surface had just narrowed its interaction accent
  // and a filled plate here would broaden it straight back (term 49).
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'go';
  go.textContent = `${view.route.label} ›`;
  go.addEventListener('click', () => onRoute?.(view.route.to));
  node.append(go);
}
