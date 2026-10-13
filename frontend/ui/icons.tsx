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
  settings: (
    <>
      <path d="M5 7h14" /><path d="M5 17h14" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" />
    </>
  ),
  snooze: (
    <>
      <circle cx="12" cy="13" r="7" /><path d="M12 9.5V13l2.5 1.5" /><path d="M5 4.5L3 6.5" /><path d="M19 4.5l2 2" />
    </>
  ),
  pattern: (
    <>
      <path d="M3 18h18" /><circle cx="6" cy="13" r="1.6" /><circle cx="12" cy="10" r="1.6" /><circle cx="18" cy="7" r="1.6" />
    </>
  ),
  setting: (
    <>
      <rect x="4" y="5" width="12" height="15" rx="2.5" /><rect x="7" y="8" width="6" height="4" rx="0.8" /><path d="M16 9h2.5a2 2 0 0 1 2 2v7" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
