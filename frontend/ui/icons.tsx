// The library's glyphs: 24-unit line icons drawn at the §4.1 glyph size, in
// the ink of whatever holds them. Decorative only; the control that holds a
// glyph carries the label.
import type { ReactNode } from 'react';

const PATHS = {
  queue: (
    <>
      <path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h10" />
    </>
  ),
  changes: (
    <>
      <path d="M4 8h13" /><path d="M14 5l3 3-3 3" /><path d="M20 16H7" /><path d="M10 13l-3 3 3 3" />
    </>
  ),
  overview: (
    <>
      <path d="M5 20V11" /><path d="M12 20V5" /><path d="M19 20v-6" />
    </>
  ),
  day: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16" /><path d="M9 3v4" /><path d="M15 3v4" />
    </>
  ),
  // Gear: Feather's "settings" glyph (MIT licence, feathericons.com).
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  // A day's events, drawn in neutral ink; shape alone tells the kinds apart.
  // Correction bolus: Feather's "droplet" (MIT licence, feathericons.com).
  correction: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
  // Meal bolus: the same drop, filled, so it differs from a correction by shape.
  meal: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill="currentColor" />,
  // Logged carbs (eaten without a bolus, usually to treat a low): Lucide's
  // "candy", a hard candy in a twisted wrapper (ISC licence, lucide.dev).
  carbs: (
    <>
      <path d="M10 7v10.9" />
      <path d="M14 6.1V17" />
      <path d="M16 7V3a1 1 0 0 1 1.707-.707 2.5 2.5 0 0 0 2.152.717 1 1 0 0 1 1.131 1.131 2.5 2.5 0 0 0 .717 2.152A1 1 0 0 1 21 8h-4" />
      <path d="M16.536 7.465a5 5 0 0 0-7.072 0l-2 2a5 5 0 0 0 0 7.07 5 5 0 0 0 7.072 0l2-2a5 5 0 0 0 0-7.07" />
      <path d="M8 17v4a1 1 0 0 1-1.707.707 2.5 2.5 0 0 0-2.152-.717 1 1 0 0 1-1.131-1.131 2.5 2.5 0 0 0-.717-2.152A1 1 0 0 1 3 16h4" />
    </>
  ),
  // Site change: an infusion set, its round pad and the cannula below (original).
  site: (
    <>
      <circle cx="12" cy="9" r="6.5" /><circle cx="12" cy="9" r="2" /><path d="M12 15.5V22" />
    </>
  ),
  // Sleep: Feather's "moon" (MIT licence, feathericons.com).
  sleep: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  snooze: (
    <>
      <circle cx="12" cy="13" r="7" /><path d="M12 9.5V13l2.5 1.5" /><path d="M5 4.5L3 6.5" /><path d="M19 4.5l2 2" />
    </>
  ),
  expand: <path d="M7 10l5 5 5-5" />,
  collapse: <path d="M7 14l5-5 5 5" />,
  // The Day navigator's ‹ ›: the week (phone) or month (desktop) before and after.
  previous: <path d="M15 6l-6 6 6 6" />,
  next: <path d="M9 6l6 6-6 6" />,
  pattern: (
    <>
      <path d="M3 18h18" /><circle cx="6" cy="13" r="1.6" /><circle cx="12" cy="10" r="1.6" /><circle cx="18" cy="7" r="1.6" />
    </>
  ),
  // A Habit is something done again and again: Feather's "repeat" (MIT licence,
  // feathericons.com), a loop of two arrows (§4.2 QueueRow, ADR 528).
  habit: (
    <>
      <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  // A Setting is a value you adjust: sliders.
  setting: (
    <>
      <path d="M5 7h14" /><path d="M5 17h14" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 1.6 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
