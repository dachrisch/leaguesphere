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
}: BreakCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const left = secondsLeft(startedAt, now, totalSeconds);
  const over = left === 0;

  return (
    <section aria-label="Halbzeitpause" className="breakpanel">
      <p className="breaktext">
        <span className="breaklabel">Pause</span>
        <span
          aria-label={over ? "Pause vorbei" : "Restliche Pause"}
          className={over ? "breaktime over" : "breaktime"}
          role="timer"
        >
          {formatBreak(left)}
        </span>
      </p>
      <button className="breakskip" onClick={onDone} type="button">
        {over ? "Weiter" : "Pause beenden"}
      </button>
      <span className="sr-only">
        {`Die Pause dauert ${Math.round(HALFTIME_BREAK_SECONDS / 60)} Minuten.`}
      </span>
    </section>
  );
}
