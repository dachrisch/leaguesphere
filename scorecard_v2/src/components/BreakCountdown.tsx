import { useEffect, useState } from "react";

import { formatBreak, HALFTIME_BREAK_SECONDS, secondsLeft } from "../app/break";

interface BreakCountdownProps {
  /** Epoch ms the break started. */
  startedAt: number;
  /** The intermission the definition gives, in seconds. */
  totalSeconds?: number;
  /** Dismiss the countdown (break over, or skipped). */
  onDone: () => void;
}

/**
 * `Pause · 04:12` under the controls: the half-time break, counted down.
 *
 * It is a helper, not a clock: the app never stops the game, and the officials
 * may end the break early. At zero the panel stays and says the break is over —
 * a disappearing timer would hide the one fact it exists for.
 */
export default function BreakCountdown({
  startedAt,
  totalSeconds = HALFTIME_BREAK_SECONDS,
  onDone,
  label = "Pause",
  panelLabel = "Halbzeitpause",
  doneLabel,
  durationNote,
}: BreakCountdownProps & {
  /** The countdown's visible name ("Pause", "Auszeit"). */
  label?: string;
  /** The section's accessible name. */
  panelLabel?: string;
  /** The button that ends it early; defaults to "Pause beenden". */
  doneLabel?: string;
  /** Screen-reader note about the full duration. */
  durationNote?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const left = secondsLeft(startedAt, now, totalSeconds);
  const over = left === 0;

  return (
    <section aria-label={panelLabel} className="breakpanel">
      <p className="breaktext">
        <span className="breaklabel">{label}</span>
        <span
          aria-label={over ? `${label} vorbei` : `Restliche ${label}`}
          className={over ? "breaktime over" : "breaktime"}
          role="timer"
        >
          {formatBreak(left)}
        </span>
      </p>
      <button className="breakskip" onClick={onDone} type="button">
        {over ? "Weiter" : (doneLabel ?? `${label} beenden`)}
      </button>
      <span className="sr-only">
        {durationNote ??
          `Die Pause dauert ${Math.round(totalSeconds / 60)} Minuten.`}
      </span>
    </section>
  );
}
