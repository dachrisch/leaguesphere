import { useRef, useState } from "react";

import type { GameLogEventInput, RosterPlayer } from "../../api/types";
import JerseyPicker from "../JerseyPicker";
import { errorMessage } from "./errors";
import Sheet from "./Sheet";
import { yardsText, yardsValue } from "./yards";

/** The three scrimmage plays the scorecard records. */
export type PlayType = "pass" | "run" | "sack";

const TITLES: Record<PlayType, string> = {
  pass: "Pass",
  run: "Run",
  sack: "Sack",
};

/** The row name the event store projects for one play. */
export function playName(type: PlayType, complete: boolean): string {
  if (type === "pass") {
    return complete ? "Pass" : "Pass unvollständig";
  }
  return TITLES[type];
}

/**
 * The visible text of a play, built once here and sent as the event's `input`
 * so the optimistic row and the server's projection read the same.
 */
export function playInput({
  type,
  complete,
  yards,
  qb,
  defender = null,
  deflection = false,
}: {
  type: PlayType;
  complete: boolean;
  yards: number;
  qb: number | null;
  defender?: number | null;
  deflection?: boolean;
}): string {
  const parts: string[] = [];
  if (type === "sack") {
    parts.push(yardsText(yards, { loss: true }));
  } else if (type !== "pass" || complete) {
    parts.push(yardsText(yards));
  }
  if (type === "pass" && qb !== null) {
    parts.push(`QB #${qb}`);
  }
  if (defender !== null && type !== "sack") {
    parts.push(deflection ? `Deflection #${defender}` : `Tackle #${defender}`);
  }
  return parts.join(" · ");
}

/**
 * One play as the event store takes it.
 *
 * `player` is the jersey the play belongs to (receiver, runner, sacked
 * quarterback). `payload` carries the structured record for the statistics
 * that come later: `yards` **signed** (a sack is a loss), `qb` for a pass and
 * `complete` for a pass. `input` is the text the log and the ticker show.
 */
export function playEvent({
  type,
  complete,
  yards,
  qb,
  player,
  defender = null,
  deflection = false,
}: {
  type: PlayType;
  complete: boolean;
  yards: number;
  qb: number | null;
  player: number | null;
  defender?: number | null;
  deflection?: boolean;
}): GameLogEventInput {
  const payload: Record<string, unknown> = {
    yards: type === "sack" ? -Math.abs(yards) : yards,
  };
  if (type === "pass") {
    payload.complete = complete;
    if (qb !== null) {
      payload.qb = qb;
    }
  }
  if (defender !== null && type !== "sack") {
    // The defender is the *other* team's player; the play's `player` stays the
    // offense's. Both are jersey numbers, the side comes from the event.
    payload.defense = deflection
      ? { player: defender, deflection: true }
      : { player: defender };
  }
  const event: GameLogEventInput = {
    name: playName(type, complete),
    input: playInput({ type, complete, yards, qb, defender, deflection }),
    payload,
  };
  if (player !== null) {
    event.player = player;
  }
  return event;
}

/**
 * The events of one play: the play itself and, when it scored, its touchdown.
 *
 * The touchdown is the **result of the play entry**, not a separate step
 * (meeting 2026-11-05, 53:05). Both rows go in one submission, so they share
 * one `TeamLog.sequence`: the statistics keep the scoring play (type, yards,
 * quarterback) and the score keeps its six points. The try stays its own
 * event, which is what lets a penalty on the touchdown be recorded before it.
 *
 * A touchdown counts without a number (IFAF R 8-1-1: the points are the
 * team's, the jersey is detail) — the row then simply names nobody.
 */
export function playEvents(options: {
  type: PlayType;
  complete: boolean;
  yards: number;
  qb: number | null;
  player: number | null;
  defender?: number | null;
  deflection?: boolean;
  touchdown?: boolean;
}): GameLogEventInput[] {
  const play = playEvent(options);
  if (options.touchdown !== true) {
    return [play];
  }
  return [
    play,
    options.player === null
      ? { name: "Touchdown" }
      : { name: "Touchdown", player: options.player },
  ];
}

interface PlaySheetProps {
  /** Possession team as the API knows it. */
  teamName: string;
  /** Side of the possession team, for the jersey lists. */
  side: RosterPlayer["side"];
  /** Both sides as loaded from the API, `null` while the request runs. */
  roster: RosterPlayer[] | null;
  /** The other team's name, printed above its defence picker. */
  opponentName?: string;
  /** The last quarterback of this side, pre-selected on a pass. */
  lastQuarterback?: number | null;
  onSubmit: (events: GameLogEventInput[]) => Promise<void>;
  onClose: () => void;
}

/**
 * The play-by-play entry: pass, run or sack with the player, the yards gained
 * or lost and — for a pass — the thrower and whether it was caught.
 */
export default function PlaySheet({
  teamName,
  side,
  roster,
  opponentName = "Gegner",
  lastQuarterback = null,
  onSubmit,
  onClose,
}: PlaySheetProps) {
  const [type, setType] = useState<PlayType>("pass");
  const [complete, setComplete] = useState(true);
  const [touchdown, setTouchdown] = useState(false);
  const [jersey, setJersey] = useState<number | null>(null);
  const [qb, setQb] = useState<number | null>(lastQuarterback);
  const [defender, setDefender] = useState<number | null>(null);
  const [deflection, setDeflection] = useState(false);
  const [yardsText, setYardsText] = useState("0");
  const [loss, setLoss] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two synchronous taps must not both write a play.
  const saving = useRef(false);

  const players =
    roster === null ? [] : roster.filter((player) => player.side === side);
  const defenders =
    roster === null ? [] : roster.filter((player) => player.side !== side);
  const magnitude = yardsValue(yardsText) ?? 0;
  const yards = loss ? -Math.abs(magnitude) : magnitude;
  const qbMissing = type === "pass" && qb === null;
  const ready = !posting && !qbMissing;

  /**
   * A typed minus also marks a loss, so a hardware keyboard and the touch
   * switch produce the same signed yards.
   */
  const changeYards = (raw: string): void => {
    if (raw.includes("-")) {
      setLoss(true);
    }
    setYardsText(raw.replace(/-/g, ""));
  };

  const save = async (): Promise<void> => {
    if (saving.current || !ready) {
      return;
    }
    saving.current = true;
    setPosting(true);
    setError(null);
    try {
      await onSubmit(
        playEvents({
          type,
          complete,
          yards,
          qb,
          player: jersey,
          // A deflection only exists on an incomplete pass; a sack has no
          // tackle to record (the sacked quarterback is the play's player).
          defender: type === "sack" ? null : defender,
          deflection: type === "pass" && !complete && deflection,
          // A sack never scores; an incomplete pass never scores.
          touchdown:
            touchdown && type !== "sack" && (type !== "pass" || complete),
        }),
      );
      onClose();
    } catch (failure) {
      saving.current = false;
      setPosting(false);
      setError(
        errorMessage(
          failure,
          "Der Spielzug konnte nicht gespeichert werden. Bitte erneut versuchen.",
        ),
      );
    }
  };

  return (
    <Sheet
      busy={posting}
      error={error}
      footer={
        <button
          className="startbtn"
          disabled={!ready}
          onClick={() => void save()}
          type="button"
        >
          {posting ? "Speichern …" : "Spielzug speichern"}
        </button>
      }
      onClose={onClose}
      title={`Spielzug · ${teamName}`}
    >
      <div aria-label="Spielzug" className="seg" role="group">
        {(Object.keys(TITLES) as PlayType[]).map((option) => (
          <button
            aria-pressed={type === option}
            className={type === option ? "sel" : undefined}
            disabled={posting}
            key={option}
            onClick={() => setType(option)}
            type="button"
          >
            {TITLES[option]}
          </button>
        ))}
      </div>

      {type === "pass" ? (
        <div aria-label="Pass" className="seg" role="group">
          <button
            aria-pressed={complete}
            className={complete ? "sel" : undefined}
            disabled={posting}
            onClick={() => setComplete(true)}
            type="button"
          >
            Complete
          </button>
          <button
            aria-pressed={!complete}
            className={!complete ? "sel" : undefined}
            disabled={posting}
            onClick={() => setComplete(false)}
            type="button"
          >
            Incomplete
          </button>
        </div>
      ) : null}

      {type === "sack" || (type === "pass" && !complete) ? null : (
        <>
          <h3 className="sheetsection">Ergebnis</h3>
          <div aria-label="Ergebnis" className="seg" role="group">
            <button
              aria-pressed={!touchdown}
              className={!touchdown ? "sel" : undefined}
              disabled={posting}
              onClick={() => setTouchdown(false)}
              type="button"
            >
              Kein Touchdown
            </button>
            <button
              aria-pressed={touchdown}
              className={touchdown ? "sel" : undefined}
              disabled={posting}
              onClick={() => setTouchdown(true)}
              type="button"
            >
              Touchdown
            </button>
          </div>
        </>
      )}

      {type === "sack" ? null : (
        <div aria-label="Raumrichtung" className="seg" role="group">
          <button
            aria-pressed={!loss}
            className={!loss ? "sel" : undefined}
            disabled={posting}
            onClick={() => setLoss(false)}
            type="button"
          >
            Gewinn
          </button>
          <button
            aria-pressed={loss}
            className={loss ? "sel" : undefined}
            disabled={posting}
            onClick={() => setLoss(true)}
            type="button"
          >
            Verlust
          </button>
        </div>
      )}

      <div className="sheetfield">
        <label className="sheetlabel" htmlFor="play-yards">
          {type === "sack"
            ? "Raumverlust (Yards)"
            : "Raumgewinn / Verlust (Yards)"}
        </label>
        <input
          autoComplete="off"
          className="sheetinput sheetinput-num"
          disabled={posting}
          id="play-yards"
          inputMode="numeric"
          onChange={(event) => changeYards(event.target.value)}
          pattern="[0-9]*"
          type="text"
          value={yardsText}
        />
      </div>

      <h3 className="sheetsection">
        {type === "sack" ? "Trikotnummer (Sack)" : "Trikotnummer (optional)"}
      </h3>
      <JerseyPicker
        disabled={posting}
        groupLabel="Trikotnummer"
        label="Trikot"
        onChange={setJersey}
        optionalLabel="Ohne Nummer"
        players={players}
        value={jersey}
      />

      {type === "pass" ? (
        <>
          <h3 className="sheetsection">Quarterback</h3>
          <JerseyPicker
            compact
            disabled={posting}
            groupLabel="Trikotnummer Quarterback"
            label="QB"
            onChange={setQb}
            players={players}
            value={qb}
          />
          {qbMissing ? (
            <p className="sheetwarn" role="alert">
              Bitte den Quarterback wählen.
            </p>
          ) : null}
        </>
      ) : null}

      {type !== "sack" ? (
        <>
          {type === "pass" && !complete ? (
            <div aria-label="Deflection" className="seg" role="group">
              <button
                aria-pressed={deflection}
                className={deflection ? "sel" : undefined}
                disabled={posting}
                onClick={() => setDeflection((current) => !current)}
                type="button"
              >
                Deflection
              </button>
            </div>
          ) : null}
          {type === "pass" && !complete && !deflection ? null : (
            <>
              <h3 className="sheetsection">
                {type === "pass" && !complete
                  ? `Deflection ${opponentName} (optional)`
                  : `Tackle ${opponentName} (optional)`}
              </h3>
              <JerseyPicker
                disabled={posting}
                groupLabel="Trikotnummer Defense"
                label="Defense"
                onChange={setDefender}
                optionalLabel="Ohne Nummer"
                players={defenders}
                value={defender}
              />
            </>
          )}
        </>
      ) : null}
    </Sheet>
  );
}
