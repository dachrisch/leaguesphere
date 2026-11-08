import Sheet from "./Sheet";

/** The half-time facts the officials confirm before the break starts. */
export interface HalftimeFacts {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  /** Team that receives the second-half kickoff, or `null` when unknown. */
  possession: string | null;
  /** The direction the second half plays toward ("Nord" / "Süd"). */
  direction: string | null;
  /** The definition's intermission, in minutes. */
  intermissionMinutes: number;
}

/**
 * **Halbzeit**: restate the score, who gets the ball and which way the teams
 * play, then start the break.
 *
 * The old two-tap arm on the button became this dialog: the facts are the
 * confirmation (meeting 2026-11-08), and the second-half possession is derived
 * from the setup, never from whoever happened to hold the ball last.
 */
export default function HalftimeSheet({
  home,
  away,
  homeScore,
  awayScore,
  possession,
  direction,
  intermissionMinutes,
  busy = false,
  error = null,
  disabled = false,
  onStart,
  onClose,
}: HalftimeFacts & {
  busy?: boolean;
  error?: string | null;
  disabled?: boolean;
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      busy={busy}
      error={error}
      footer={
        <button
          className="startbtn"
          disabled={busy || disabled}
          onClick={onStart}
          type="button"
        >
          {busy ? "Halbzeit …" : "Halbzeit starten"}
        </button>
      }
      onClose={onClose}
      title="Halbzeit"
    >
      <p className="sheetnote">
        {homeScore} : {awayScore} · {home} – {away}
      </p>
      <dl className="startlist">
        <div className="startrow">
          <dt>Ballbesitz 2. Halbzeit</dt>
          <dd>{possession ?? "–"}</dd>
        </div>
        <div className="startrow">
          <dt>Spielrichtung 2. Halbzeit</dt>
          <dd>{direction ?? "–"}</dd>
        </div>
        <div className="startrow">
          <dt>Pause</dt>
          <dd>{intermissionMinutes} Minuten</dd>
        </div>
      </dl>
      <p className="sheetnote">
        Der zweite Ballbesitz kommt aus der Vorbereitung: die Mannschaft, die
        den Anstoß nicht hatte. Die Richtung dreht sich in der Halbzeit.
      </p>
    </Sheet>
  );
}
