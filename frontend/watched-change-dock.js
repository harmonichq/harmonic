/* The watched-change dock — the inspector's FLOOR (lock terms 46–49).
 *
 * CONTEXT.md's watching-changes rule already settles the shape: Plan, Trial and
 * Focus all obey one variable under study, at most one is active at a time, and the
 * app exposes a SINGLE active watched-change object, never two lists. So the floor
 * of the inspector is that one object, in one reserved height, in mutually
 * exclusive states — and the pane header's staged status is deleted in the same
 * change, because two claims about one object on one screen is the defect term 47
 * exists to remove (the header could read "nothing staged" while a Trial was being
 * watched, since it only ever named the Plan branch).
 *
 * PRECEDENCE IS NOT DECIDED HERE. `watched` arrives already resolved by
 * `watched_change.active_watched_change` — Trial XOR Focus, pump wins, a Focus is
 * blocked under a Trial and dropped when a setting change preempts it (ADR 0029).
 * This module only fills the slot: the watched object if there is one, else the
 * recorded Plan awaiting the pump (the guidance read's served pending Plan, #431),
 * else the staged Plan, else idle. The staged Plan is the change this surface
 * marks as staged when it names one, and otherwise the guidance read's served
 * Plan draft, named from its own items (ADR 460) — so a draft saved in Changes,
 * or read after this surface seeded its marks, never reads as nothing watched.
 * The pending Plan's verdict is the server's; a confirmed Plan is never served as
 * pending, so it holds no state here.
 */
import { trialDayCount } from './follow-up.js';
import { hhmm, windowSpanText } from './diagnose-workstation-chart.js';
import { SETTING_NAME } from './plan-view.js';
import { formatStartMin, PLAN_PARAMS, settingValue } from './plan.js';

/** Term 47 — the kind labels, byte for byte. */
export const KIND = {
  trial: 'Trial · watching',
  focus: 'Focus · watching',
  recorded: 'Plan · awaiting pump',
  plan: 'Plan · staged',
  idle: 'Nothing being watched',
};
/** The sentence a 98px reserve exists to protect — it wraps and never ellipsizes. */
export const PLAN_DETAIL = 'Staged, not applied: nothing has changed on the pump';
export const IDLE_TITLE = 'No change staged, no trial or focus active';
export const IDLE_DETAIL = 'Stage a change from a finding to start one.';

// A Trial names its setting as the desk does; a whole profile keeps its own word.
const TRIAL_NAME = { ...SETTING_NAME, profile: 'Profile' };
// A correction factor carries its unit insulin first through `settingValue`.
const UNIT = { basal_rate: 'U/hr', carb_ratio: 'g/U', target_bg: 'mg/dL' };

const num = (value) => {
  const text = String(Number(value));
  return text.includes('.') ? text : `${text}.0`;
};
/** `2026-08-11 07:00:00` -> `08-11`. The year is noise at this size. */
const monthDay = (stamp) => (typeof stamp === 'string' ? stamp.slice(5, 10) : '');

/** A Plan item family's setting parameter, e.g. `ic` -> `carb_ratio`. */
const paramOf = (type) => PLAN_PARAMS.find((row) => row.type === type)?.param;

/** A recorded Plan's setting in the wearer's words, from its recorded item family. */
const planSetting = (plan) => SETTING_NAME[paramOf(plan.items[0]?.type)];

/**
 * A Plan draft's own name: its setting in the wearer's words and the span its
 * items cover, spelled as this surface spells the same change (ADR 460 point 3).
 * A draft serves no direction, so the name carries none.
 */
export function draftName(draft) {
  const items = [...(draft?.items || [])].sort((a, b) => a.start_min - b.start_min);
  const type = items[0]?.type;
  const name = SETTING_NAME[paramOf(type)] || type;
  const first = items[0]?.start_min;
  const last = items[items.length - 1]?.start_min;
  if (type === 'basal') {
    return items.length === 1 ? `${name} ${formatStartMin(first)}` : `${name} ${formatStartMin(first)} to ${hhmm(last + 30)}`;
  }
  if (type === 'ic') {
    const head = items[0].ic_block_provenance;
    const tail = items[items.length - 1].ic_block_provenance;
    return head && tail ? `${name} ${windowSpanText([head.block_start_min, tail.block_end_min])}`
      : `${name} ${formatStartMin(first)}`;
  }
  return name;
}

/** A draft's current→proposed pair in the wearer's form, only where every item
    carries the same pair; the panel's own two-place rounding. */
function draftValues(draft) {
  const [head, ...rest] = draft.items;
  if (head.current == null || head.value == null
    || rest.some((item) => item.current !== head.current || item.value !== head.value)) return '';
  const param = paramOf(head.type);
  const two = (value) => Number(value).toFixed(2);
  if (param === 'isf') return `${settingValue('isf', two(head.current))} → ${settingValue('isf', two(head.value))}`;
  const unit = UNIT[param];
  return unit ? `${two(head.current)} → ${two(head.value)} ${unit}` : '';
}

/** A Trial's own name for the change it is watching: its setting and slot. A
    Trial serves no direction, and the dock derives none (ADR 451). */
function trialTitle(trial) {
  const name = TRIAL_NAME[trial.parameter] || trial.parameter;
  return trial.slot ? `${name} ${trial.slot}` : name;
}

/** A Trial's from→to values in the wearer's form, or '' when it serves none. */
function trialValues(trial) {
  if (trial.before == null || trial.after == null) return '';
  if (trial.parameter === 'isf') {
    return `${settingValue('isf', num(trial.before))} → ${settingValue('isf', num(trial.after))}`;
  }
  const unit = UNIT[trial.parameter];
  return unit ? `${num(trial.before)} → ${num(trial.after)} ${unit}` : '';
}

/** Values lead the wrapping detail line, before its sentence (ADR 451). */
const leading = (values) => (values ? [{ text: `${values} · ` }] : []);

/**
 * The one object the dock reports, as `{ state, kind, title, detail, route }`.
 *
 * `detail` is a list of `{ text }` / `{ strong }` parts rather than markup, so the
 * painter can emphasise a count without this module writing HTML. `staged` is the
 * surface's `{ count, title, values }`: the one-line title names the change, and
 * its values lead the wrapping detail, where they are never cut off. `draft` is
 * the guidance read's served Plan draft, read only when `staged` names nothing and
 * no stage save the surface issued is in flight (`saving`): mid-save, the served
 * draft is the one read before the press.
 */
export function watchDockView({ watched = null, pendingPlan = null, staged = null, draft = null, saving = false } = {}) {
  if (watched && watched.kind === 'trial') {
    const maturing = watched.maturing || {};
    // "Maturing" and "ready to judge" are the domain's own words for a Trial's
    // watch phase (CONTEXT.md) — neither is invented here.
    const ready = !maturing.is_maturing;
    const lead = ready ? 'Ready to judge — ' : 'Maturing — ';
    // The dock prints the served count through Changes' own printer, so the two
    // surfaces read one number for one Trial (#447). A completed Trial whose
    // bounded period spans 15 dates reads "15 days · 14 required" here as it does
    // in Changes; only Changes' progress bar clamps.
    const count = trialDayCount(maturing, ready);
    return {
      state: 'trial',
      kind: KIND.trial,
      title: trialTitle(watched),
      detail: [
        ...leading(trialValues(watched)),
        { text: lead },
        { strong: count.number },
        { text: ` days since ${monthDay(watched.changed_at)}${count.required ? ` · ${count.required}` : ''}` },
      ],
      route: { label: 'Open Changes', to: 'changes' },
    };
  }
  if (watched && watched.kind === 'focus') {
    return {
      state: 'focus',
      kind: KIND.focus,
      title: watched.title,
      // Adherence and outcome are a Focus's two dimensions (CONTEXT.md "Focus"), and
      // Changes renders both as tables; the dock names where they are read, never
      // guesses them.
      detail: [{ text: `Pinned ${monthDay(watched.pinned_at)} · adherence and outcome are read in Changes` }],
      route: { label: 'Open Changes', to: 'changes' },
    };
  }
  if (pendingPlan) {
    // The server's verdict, said in the same words Changes uses for it.
    const { state, on_pump: onPump } = pendingPlan.verdict;
    return {
      state: 'recorded',
      kind: KIND.recorded,
      title: `${planSetting(pendingPlan)} · recorded ${monthDay(pendingPlan.applied_at)}`,
      detail: [{ text: state === 'mismatch' ? "The latest pump read doesn't match this Plan"
        : onPump ? 'On the pump — awaiting confirmation' : 'Recorded — waiting for a pump read that matches' }],
      // Changes on the Plan itself — never the watched-change address.
      route: { label: 'Open Changes', to: 'plan' },
    };
  }
  const plan = staged && staged.count > 0 ? staged
    : !saving && draft?.items?.length ? { title: draftName(draft), values: draftValues(draft) } : null;
  if (plan) {
    return {
      state: 'plan',
      kind: KIND.plan,
      title: plan.title,
      detail: [...leading(plan.values), { text: PLAN_DETAIL }],
      route: { label: 'Open Changes', to: 'plan' },
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
