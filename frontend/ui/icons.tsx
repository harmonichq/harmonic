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
