import type { ReactNode } from "react";

/**
 * The icon set (Figma: Components → Icons). 24px grid, 2px round stroke,
 * drawn in `currentColor` so an icon takes the text colour of whatever it
 * sits in. To add one: draw it on the same grid in Figma first, then add
 * its paths here — keep the two lists identical.
 */
export const ICON_NAMES = [
  "check",
  "chevron-right",
  "chevron-left",
  "chevron-down",
  "close",
  "plus",
  "minus",
  "share",
  "calendar",
  "pin",
  "games",
  "wallet",
  "user",
  "users",
  "more",
  "info",
  "alert",
  "clock",
  "lock",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M5 12l5 5L20 7" />,
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  "chevron-left": <path d="M15 6l-6 6 6 6" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  share: <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  games: <path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />,
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="3" />
      <path d="M3 10h18M16 15h2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20a7 7 0 0114 0M16 4.5a3.5 3.5 0 010 7M18 14.5a7 7 0 013.5 5.5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="3" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
};

export interface IconProps {
  name: IconName;
  /** Pixel size of the square icon. Default 24. */
  size?: number;
  className?: string;
  /** Accessible name. Omit for decorative icons (the default), which are hidden from screen readers. */
  label?: string;
}

export function Icon({ name, size = 24, className, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[name]}
    </svg>
  );
}
