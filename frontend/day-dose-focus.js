// day-dose-focus.js — pure logic for the Day-chart insulin-lane dose-focus reveal
// (#385). The five-strip chart's insulin lane no longer prints inline U/g labels
// (they overprinted when boluses cluster within minutes); instead a chart-local
// capsule reveals exact events on hover/focus, and visually-inseparable marks get
// one functional ×N target. This module owns the Vue-free, DOM-free core so Node's
// built-in runner covers it: the event model, the CHRONOLOGICAL row copy, and the
// PIXEL-proximity grouping. The DOM/overlay/pin lifecycle lives in index.html.
//
// A dose EVENT is one bolus (its attached pump-carb diamond stays part of it, never
// a second event) or one separately-logged manual carb. That is the count ×N
// reports — never a plotted-glyph count.

import { bolusKind, DOSE_ROWS } from './chart-builders.js';

// Flatten a day's boluses + logged carbs into one chronological event list. Each
// event carries the fixed insulin-lane row it plots on so the caller can project it
// to pixels with the SAME axis the builder used. `toMs` is injected (wall-clock
// parse) so this stays free of the tz assumptions index.html owns.
export function doseEvents(day, carbEntries, toMs) {
  return [
    ...((day && day.boluses) || []).map((raw) => ({
      type: 'bolus',
      raw,
      ms: toMs(raw.t),
      row: DOSE_ROWS.bolus,
      kind: bolusKind(raw),
    })),
    ...((carbEntries) || []).map((raw) => ({
      type: 'logged',
      raw,
      ms: toMs(raw.t),
      row: DOSE_ROWS.carbs,
      kind: 'logged',
    })),
  ].sort((a, b) => a.ms - b.ms);
}

// The human name for a dose row in the capsule.
export function eventLabel(event) {
  if (event.type === 'logged') return 'Logged carbs';
  return {
    food: 'Meal bolus',
    correction: 'Correction',
    'food+correction': 'Meal + correction',
  }[event.kind] || 'Bolus';
}

// The exact dose/carbs for a capsule row. Never a combined total — a meal bolus
// shows its own insulin (and its own pump carbs), a manual carb shows its grams
// with certainty preserved (`~` = estimate, `?` = unknown).
export function eventValue(event) {
  if (event.type === 'logged') {
    if (event.raw.grams == null) return '? logged';
    const prefix = event.raw.certainty === 'estimate' ? '~' : '';
    return `${prefix}${Math.round(event.raw.grams)}g logged`;
  }
  const insulin = `${(event.raw.insulin || 0).toFixed(1)}U`;
  return (event.raw.carbs || 0) > 0
    ? `${insulin} · ${Math.round(event.raw.carbs)}g`
    : insulin;
}

// A stable id for one event (type + instant) — lets the caller re-find a frozen
// group's members after a resize re-projects everything.
export function eventKey(event) {
  return `${event.type}:${event.ms}`;
}

// Group events by VISUAL pixel proximity at the current chart width — NOT a fixed
// time window. `events` must already carry a numeric `.x` pixel coordinate (the
// caller projects each event's [ms,row] through the live chart). Sorted by x, a run
// stays one group while each next mark is within `spanPx` of the run's first mark;
// the first mark past that opens a new group. Returns `{ index, id, events }` groups
// in draw order. Recompute this on every resize (the pixel gaps change even though
// the times don't).
export function clusterByPixels(events, spanPx) {
  const placed = events.filter((e) => Number.isFinite(e.x)).sort((a, b) => a.x - b.x);
  const groups = [];
  for (const event of placed) {
    const last = groups[groups.length - 1];
    if (last && event.x - last.events[0].x <= spanPx) last.events.push(event);
    else groups.push({ events: [event] });
  }
  groups.forEach((group, index) => {
    group.index = index;
    group.id = group.events.map(eventKey).join('|');
  });
  return groups;
}

// The preview/pin state machine, kept pure so the interaction RULES are node-testable
// (the DOM effects — capsule content, glyph emphasis, aria, focus() — stay in
// index.html and are applied FROM the resulting state). `activeGroup` is the group
// currently shown; `pinned` distinguishes a transient hover/focus preview from a
// pinned readout. Membership of `activeGroup` is frozen by the caller once shown, so
// a resize can reposition it without rewriting which events it holds.
export function initDoseFocus() {
  return { activeGroup: null, pinned: false, previewSource: null, suppressedTrigger: null };
}

// Reduce one interaction into the next state. Actions:
//   preview {group, source}   — hover/focus preview; IGNORED while pinned (a pin owns
//                               the readout until explicitly switched or cleared).
//   clearPreview {source}     — end a preview, but only the one that this source began.
//   pin {group}               — click/Enter pins; switches an existing pin to `group`.
//   close {restoreFocus, trigger} — Close/Escape/blank-click/date-change clears. With
//                               restoreFocus, remembers `trigger` as suppressed so the
//                               focus() the caller restores to it does NOT reopen.
//   focus {group, trigger}    — keyboard focus landed on a target: previews it, UNLESS
//                               it is the suppressed trigger (consume the suppression).
export function doseFocusReduce(state, action) {
  switch (action.type) {
    case 'preview':
      if (state.pinned) return state;
      return { ...state, activeGroup: action.group, pinned: false, previewSource: action.source };
    case 'clearPreview':
      if (state.pinned || !state.activeGroup || state.previewSource !== action.source) return state;
      return { ...state, activeGroup: null, previewSource: null };
    case 'pin':
      return { ...state, activeGroup: action.group, pinned: true, previewSource: null, suppressedTrigger: null };
    case 'close':
      return { activeGroup: null, pinned: false, previewSource: null,
        suppressedTrigger: action.restoreFocus ? (action.trigger || null) : null };
    case 'focus':
      if (action.trigger && action.trigger === state.suppressedTrigger) {
        return { ...state, suppressedTrigger: null };
      }
      if (state.pinned) return state;
      return { ...state, activeGroup: action.group, pinned: false, previewSource: 'target' };
    default:
      return state;
  }
}
