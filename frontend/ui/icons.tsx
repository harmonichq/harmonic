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
  // A day's events, drawn in their data family's colour by whatever holds them.
  // Correction bolus: Feather's "droplet" (MIT licence, feathericons.com).
  correction: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
  // Meal bolus: the same drop, smaller, over a plate line (original, after Feather).
  meal: (
    <>
      <path d="M12 2.5l4.24 4.24a6 6 0 1 1-8.48 0z" /><path d="M5 21h14" />
    </>
  ),
  // Logged carbs: Lucide's "wheat" (ISC licence, lucide.dev).
  carbs: (
    <>
      <path d="M2 22 16 8" />
      <path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
      <path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
      <path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
      <path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z" />
      <path d="M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" />
      <path d="M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" />
      <path d="M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z" />
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
  pattern: (
    <>
      <path d="M3 18h18" /><circle cx="6" cy="13" r="1.6" /><circle cx="12" cy="10" r="1.6" /><circle cx="18" cy="7" r="1.6" />
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
