/**
 * The app's icon set: small, inline, stroke-only SVGs.
 *
 * The bundle must run offline, so there is no icon font and no sprite sheet.
 * Every icon inherits `currentColor`, is `aria-hidden` (the visible label next
 * to it carries the meaning) and defaults to 20px.
 */
import type { ReactNode, SVGProps } from "react";

export interface IconProps {
  /** Rendered width/height in px; the viewBox stays 24×24. */
  size?: number;
  className?: string;
}

interface SvgProps extends IconProps {
  children: ReactNode;
  /** Opt out of the shared round caps (rare). */
  linecap?: SVGProps<SVGPathElement>["strokeLinecap"];
}

function Svg({ children, size = 20, className, linecap = "round" }: SvgProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap={linecap}
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

/** American football: tilted ball with laces. */
export function Football(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.6 19.4c-2.3-2.3-2.3-7.4 1-10.7s8.4-3.3 10.7-1 2.3 7.4-1 10.7-8.4 3.3-10.7 1Z" />
      <path d="m8 16 8-8M10.5 11.5l2 2M12 10l2 2M9 13l2 2" />
    </Svg>
  );
}

/** First down: an arrow moving forward. */
export function ArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </Svg>
  );
}

/** Turnover: two arrows swapping ends. */
export function SwapArrows(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h14M14 4l4 4-4 4" />
      <path d="M20 16H6M10 12l-4 4 4 4" />
    </Svg>
  );
}

/** Interception: two sides meeting in the middle. */
export function Interception(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12h7M7 9l3 3-3 3" />
      <path d="M21 12h-7M17 9l-3 3 3 3" />
      <path d="M12 5v14" />
    </Svg>
  );
}

/** Penalty flag. */
export function Flag(props: IconProps) {
  return (
    <Svg {...props} linecap="butt">
      <path d="M6 21V4" />
      <path d="M6 4h11l-2.5 4L17 12H6" />
    </Svg>
  );
}

/** Safety: a shield. */
export function Shield(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l7 3v5.6c0 4.3-2.9 7.4-7 9.4-4.1-2-7-5.1-7-9.4V6l7-3Z" />
      <path d="M9 12.2l2.1 2.1 4-4.1" />
    </Svg>
  );
}

/** Timeout. */
export function Clock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

/** Game clock: a stopwatch. */
export function Stopwatch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 10v3.5l2.2 1.5M9.5 3h5M12 3v3.5M18.5 6.5l1.5-1.5" />
    </Svg>
  );
}

/** Overtime: one more period. */
export function PlusCircle(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </Svg>
  );
}

/** Half-time: the referee's whistle. */
export function Whistle(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="13" r="5" />
      <path d="M15 11h4l2 2-2 2h-4" />
      <path d="M10 8V5.5" />
    </Svg>
  );
}

/** Halbzeit fallback for contexts that read better as "pause". */
export function Pause(props: IconProps) {
  return (
    <Svg {...props} linecap="butt">
      <path d="M9 5v14M15 5v14" />
    </Svg>
  );
}

/** Theme: follow the OS. */
export function Auto(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Theme: light. */
export function Sun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </Svg>
  );
}

/** Theme: outdoor (sun, high contrast): a filled sun with long rays. */
export function BrightSun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <path d="M12 1.5v3M12 19.5v3M3.6 3.6l2.1 2.1M18.3 18.3l2.1 2.1M1.5 12h3M19.5 12h3M3.6 20.4l2.1-2.1M18.3 5.7l2.1-2.1" />
    </Svg>
  );
}

/** Theme: dark. */
export function Moon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />
    </Svg>
  );
}

/** Undo: an arrow curling back. */
export function Undo(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 5 4 10l5 5" />
      <path d="M4 10h10a6 6 0 0 1 0 12h-3" />
    </Svg>
  );
}

/** Confirmation tick. */
export function Check(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12.5l5.2 5.2L20 6.8" />
    </Svg>
  );
}

/** Back navigation. */
export function ChevronLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

/** Forward affordance: the row opens something. */
export function ChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  );
}

/** Account fallback: no initials, so the menu trigger gets a head-and-shoulders. */
export function User(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}
