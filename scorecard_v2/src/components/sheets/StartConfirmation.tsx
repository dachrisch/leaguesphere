import type { ReactNode } from "react";

import DirectionText, { type Direction } from "../DirectionText";
import Sheet from "./Sheet";

/**
 * One crew slot as the start confirmation restates it.
 *
 * `label` is the league's display name for the position, `name` the person
 * stored in it as the screen can display it — which is `null` both for an empty
 * slot **and** for a linked official the team list cannot resolve. `filled` is
 * the slot's own state (`official` set or a non-blank name) and is what decides
 * whether a required slot is missing: a crewed gameday whose names are unknown
 * must still start. `freetext` marks a guest who is only a string, `required`
 * the league's completeness flag, `editable` whether this screen can still
 * change the slot at all — a duplicate row or a position the league does not
 * configure is shown but cannot be fixed here, so it never becomes the reason a
 * start is refused.
 */
export interface StartCrewLine {
  label: string;
  name: string | null;
  filled: boolean;
  freetext: boolean;
  required: boolean;
  editable: boolean;
  duplicate: boolean;
}

/** Everything the confirmation needs to decide whether the start may happen. */
export interface StartFacts {
  crew: StartCrewLine[];
  /** Team that won the toss, `null` while nobody was chosen. */
  tossTeam: string | null;
  /** Team with the opening possession, `null` while nobody was chosen. */
  possessionTeam: string | null;
  direction: Direction | null;
}

export interface StartConfirmationProps extends StartFacts {
  home: string | null;
  away: string | null;
  /** Kick-off time as the header shows it (`formatGameTime`). */
  time: string;
  field: number;
  /** Tri-state from the games list: `undefined` means "not reported". */
  passcheck: boolean | undefined;
  licenceIssues: { name: string; role: string }[];
  /** Second tap: the caller writes the setup and starts the game. */
  onStart: () => void;
  onClose: () => void;
}

/** At least a first and a last name — the free-text rule from the crew picker. */
function hasBothNames(name: string): boolean {
  return name.trim().split(/\s+/).filter((part) => part !== "").length >= 2;
}

/**
 * The German reasons that keep the game from starting; empty when it may.
 *
 * A wrong setup entry costs the whole game, so incomplete input is refused with
 * a specific reason instead of being confirmed. The test is always the slot's
 * own state, never the display name: a linked official the team list cannot
 * resolve has no name, and refusing that would strand a fully crewed gameday.
 * Only slots this screen can still edit are judged — a required slot the league
 * does not configure, or a duplicate row, is a data problem the operator cannot
 * fix here. A free-text name only has to carry both names where the league
 * requires the slot; an optional guest called "N.N." is restated but not
 * refused.
 */
export function startBlockers(facts: StartFacts): string[] {
  const blockers: string[] = [];
  for (const line of facts.crew) {
    if (!line.editable) {
      continue;
    }
    if (!line.filled) {
      if (line.required) {
        blockers.push(
          `Offizielle: ${line.label} fehlt – die Liga verlangt diese Position.`,
        );
      }
      continue;
    }
    if (
      line.required &&
      line.freetext &&
      line.name !== null &&
      !hasBothNames(line.name)
    ) {
      blockers.push(
        `Offizielle: ${line.label} – Freitextname „${line.name}“ braucht Vor- und Nachnamen.`,
      );
    }
  }
  if (facts.tossTeam === null) {
    blockers.push("Münzwurf gewonnen von: keine Mannschaft gewählt.");
  }
  if (facts.possessionTeam === null) {
    blockers.push("Erster Ballbesitz: keine Mannschaft gewählt.");
  }
  if (facts.direction === null) {
    blockers.push("Spielrichtung: keine Seite gewählt.");
  }
  return blockers;
}

function teamLabel(name: string | null): string {
  return name !== null && name.trim() !== "" ? name : "–";
}

function Line({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="startrow">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Bottom sheet between the tap on **Spiel starten** and the write.
 *
 * It restates what is about to be started — teams, kick-off and field, the crew
 * with the league's labels, toss, first possession, direction, licence warnings
 * and the passcheck — and it names what is missing instead of confirming it.
 * Nothing is written until the footer button is tapped; that single extra tap
 * is also the whole licence confirmation, so a warning never costs two extra
 * taps. The sheet says that starting writes the setup and that no clock runs:
 * v2 has no live clock, and the setup write is not a clock control.
 */
export default function StartConfirmation({
  home,
  away,
  time,
  field,
  crew,
  tossTeam,
  possessionTeam,
  direction,
  passcheck,
  licenceIssues,
  onStart,
  onClose,
}: StartConfirmationProps) {
  const blockers = startBlockers({
    crew,
    tossTeam,
    possessionTeam,
    direction,
  });
  const blocked = blockers.length > 0;
  const duplicates = crew
    .filter((line) => line.duplicate)
    .map((line) => `Offizielle: ${line.label} ist doppelt belegt.`);
  const [directionFrom, directionTo] =
    direction === "West" ? ["West", "Ost"] : ["Ost", "West"];

  let action: string;
  if (blocked) {
    action = "Angaben fehlen";
  } else if (licenceIssues.length > 0) {
    action = "Trotzdem starten";
  } else {
    action = "Jetzt starten";
  }

  return (
    <Sheet
      footer={
        <button
          aria-describedby={blocked ? "start-blockers" : undefined}
          className="startbtn"
          disabled={blocked}
          onClick={onStart}
          type="button"
        >
          {action}
        </button>
      }
      onClose={onClose}
      title="Spiel starten"
    >
      <p className="sheetnote">
        Der Start schreibt die Vorbereitung und sperrt das Spiel für dieses
        Gerät. Eine Spieluhr läuft in der App nicht.
      </p>

      {blocked ? (
        <div className="sheetwarn" id="start-blockers" role="alert">
          <b>Start nicht möglich</b>
          <ul>
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <h3 className="sheetsection">Spiel</h3>
      <dl className="startlist">
        <Line label="Begegnung">
          {teamLabel(home)} – {teamLabel(away)}
        </Line>
        <Line label="Anstoß">
          {time} · Feld {field}
        </Line>
      </dl>

      <h3 className="sheetsection">Offizielle</h3>
      <dl className="startlist">
        {crew.map((line, index) => (
          <Line key={`${line.label}-${index}`} label={line.label}>
            {line.name !== null && line.name.trim() !== "" ? (
              <>
                {line.name}
                {line.freetext ? (
                  <span className="startopt"> Freitext</span>
                ) : null}
              </>
            ) : line.filled ? (
              // A linked official the team list cannot resolve: the slot is
              // staffed, only the name is unknown. Never "fehlt".
              <span className="startopt">eingetragen</span>
            ) : line.required ? (
              <span className="startmiss">fehlt</span>
            ) : (
              <span className="startopt">nicht nötig</span>
            )}
          </Line>
        ))}
      </dl>
      {duplicates.length > 0 ? (
        <p className="sheetwarn">{duplicates.join(" ")}</p>
      ) : null}
      <p className="sheetnote">
        Pflicht sind die Positionen, die die Liga für die Vollständigkeit zählt.
      </p>

      <h3 className="sheetsection">Münzwurf und Ballbesitz</h3>
      <dl className="startlist">
        <Line label="Münzwurf gewonnen von">
          {tossTeam ?? <span className="startmiss">nicht gewählt</span>}
        </Line>
        <Line label="Erster Ballbesitz">
          {possessionTeam ?? <span className="startmiss">nicht gewählt</span>}
        </Line>
        <Line label="Spielrichtung">
          {direction === null ? (
            <span className="startmiss">nicht gewählt</span>
          ) : (
            <DirectionText from={directionFrom} to={directionTo} />
          )}
        </Line>
      </dl>

      <h3 className="sheetsection">Prüfungen</h3>
      <dl className="startlist">
        <Line label="Passcheck">
          {passcheck === true
            ? "vollständig"
            : passcheck === false
              ? "fehlt"
              : "unbekannt"}
        </Line>
      </dl>

      {licenceIssues.length > 0 ? (
        <div className="sheetwarn" role="status">
          <b>
            {licenceIssues.length === 1
              ? "1 Lizenz ist nicht gültig"
              : `${licenceIssues.length} Lizenzen sind nicht gültig`}
          </b>{" "}
          <span>
            {licenceIssues
              .map((issue) => `${issue.name} (${issue.role})`)
              .join(", ")}
          </span>{" "}
          <span>Das Spiel lässt sich trotzdem starten.</span>
        </div>
      ) : null}
    </Sheet>
  );
}
