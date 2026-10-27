import { useEffect, useRef, useState } from "react";

import type { GameLogEventInput, Penalty, RosterPlayer } from "../../api/types";
import { cachedGet, snapshotKey } from "../../offline/snapshot";
import { jerseyOptions } from "../JerseyPicker";
import { errorMessage } from "./errors";
import Sheet from "./Sheet";

/** How many penalties the collapsed list shows — v1's suggestion-box limit. */
export const PENALTY_PAGE = 5;

const PENALTIES_PATH = "/api/config/scorecard/penalties";

/**
 * Case-insensitive substring match on the penalty name.
 *
 * v1 matched character-by-character with `.*` between them, which turned a
 * single letter into "every penalty containing it somewhere" and made the
 * result depend on the order of the characters. A plain substring is what the
 * official means when they type part of the name.
 */
export function filterPenalties(
  penalties: Penalty[],
  search: string,
): Penalty[] {
  const needle = search.trim().toLowerCase();
  if (needle === "") {
    return penalties;
  }
  return penalties.filter((penalty) =>
    penalty.name.toLowerCase().includes(needle),
  );
}

/**
 * The team a penalty is charged to: the opponent when
 * `isPenaltyAgainstOpponent` says the defense committed it, otherwise the
 * possessing team.
 *
 * The flag only supplies the **default**; the official can charge either team
 * afterwards. Nothing re-derives the team from the flag after that.
 */
export function penaltyTeam(
  penalty: Penalty | null,
  teamName: string,
  opponentName: string,
): string | null {
  if (penalty === null) {
    return null;
  }
  return penalty.isPenaltyAgainstOpponent ? opponentName : teamName;
}

/**
 * Payload of one penalty: the event name is always `Strafe`, the picked
 * penalty travels as `input`, and the jersey is optional ("ganzes Team").
 */
export function penaltyEvent(
  name: string,
  jersey: number | null,
): GameLogEventInput {
  return jersey === null
    ? { name: "Strafe", input: name }
    : { name: "Strafe", player: jersey, input: name };
}

interface PenaltySheetProps {
  /** Possession team — the write's team unless the official overrides it. */
  teamName: string;
  /** The other team; the default for a defense penalty. */
  opponentName: string;
  /** Side of the possession team. */
  side: RosterPlayer["side"];
  /**
   * Both sides as loaded from `GET /api/game/<id>/roster`, `null` while the
   * request is still running. The jersey chips follow the **picked** team.
   */
  roster: RosterPlayer[] | null;
  /**
   * Writes the event for the picked team and resolves once the server
   * answered. Rejects on failure — the sheet stays open and shows the message.
   */
  onSubmit: (events: GameLogEventInput[], team: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Penalty entry: which penalty, against whom, optionally which player.
 *
 * The catalogue is configuration, not game data, so the sheet loads it itself
 * when it opens — the tracking screen stays about one game. Until it settles
 * the list shows a loading note instead of an empty "no penalties" list that
 * would read as a server without penalties.
 *
 * The team picker starts empty and is filled from the selected penalty's
 * `isPenaltyAgainstOpponent` flag. Once the official picks a team by hand the
 * flag no longer moves it: the flag is a default, not a mapping. A jersey of
 * the previously picked team is dropped when the team changes, so a Ravens
 * number can never be sent with Wolves.
 */
export default function PenaltySheet({
  teamName,
  opponentName,
  side,
  roster,
  onSubmit,
  onClose,
}: PenaltySheetProps) {
  const [penalties, setPenalties] = useState<Penalty[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Penalty | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  // Set by a manual team choice: from then on a new penalty no longer
  // re-defaults the team.
  const [teamPicked, setTeamPicked] = useState(false);
  const [jersey, setJersey] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // See TouchdownSheet: two synchronous taps must not both reach onSubmit.
  const saving = useRef(false);

  useEffect(() => {
    let active = true;
    // Preloaded: the penalty catalogue is the one list the sheet needs with no
    // network, and it rarely changes.
    cachedGet<Penalty[]>(snapshotKey.penalties(), PENALTIES_PATH)
      .then((list) => {
        if (active) {
          setPenalties(list ?? []);
        }
      })
      .catch((failure: unknown) => {
        if (!active) {
          return;
        }
        setPenalties([]);
        setLoadError(
          errorMessage(
            failure,
            "Die Strafen konnten nicht geladen werden. Bitte erneut versuchen.",
          ),
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const loading = penalties === null;
  const matches = filterPenalties(penalties ?? [], search);
  const visible = expanded ? matches : matches.slice(0, PENALTY_PAGE);
  const hidden = matches.length - visible.length;

  const otherSide: RosterPlayer["side"] = side === "home" ? "away" : "home";
  const jerseySide = team === opponentName ? otherSide : side;
  const players =
    roster === null
      ? []
      : roster.filter((player) => player.side === jerseySide);
  const options = jerseyOptions(players);

  const ready = team !== null && selected !== null && !posting;

  const pickTeam = (name: string): void => {
    setTeam(name);
    setTeamPicked(true);
    const nextSide = name === opponentName ? otherSide : side;
    setJersey((current) =>
      current === null
        ? null
        : (roster ?? []).some(
              (player) =>
                player.side === nextSide && player.jersey === current,
            )
          ? current
          : null,
    );
  };

  const pickPenalty = (penalty: Penalty): void => {
    setSelected(penalty);
    if (!teamPicked) {
      setTeam(penaltyTeam(penalty, teamName, opponentName));
    }
    // The roster changed with the team the flag implies; a number meant for
    // the other side must not survive.
    setJersey(null);
  };

  const save = async (): Promise<void> => {
    if (saving.current || !ready || selected === null || team === null) {
      return;
    }
    saving.current = true;
    setPosting(true);
    setError(null);
    try {
      await onSubmit([penaltyEvent(selected.name, jersey)], team);
      onClose();
    } catch (failure) {
      saving.current = false;
      setPosting(false);
      setError(
        errorMessage(
          failure,
          "Die Strafe konnte nicht gespeichert werden. Bitte erneut versuchen.",
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
          {posting
            ? "Speichern …"
            : selected === null
              ? "Strafe wählen"
              : team === null
                ? "Team wählen"
                : "Speichern"}
        </button>
      }
      onClose={onClose}
      title="Strafe"
    >
      <h3 className="sheetsection">Strafe suchen</h3>
      <input
        aria-label="Strafe suchen"
        autoComplete="off"
        className="sheetinput"
        disabled={posting}
        onChange={(event) => {
          setSearch(event.target.value);
          setExpanded(false);
        }}
        placeholder="Strafe eingeben …"
        type="search"
        value={search}
      />
      {loading ? (
        <p className="sheetnote" role="status">
          Strafen laden …
        </p>
      ) : loadError !== null ? (
        <p className="sheetwarn" role="alert">
          {loadError}
        </p>
      ) : matches.length === 0 ? (
        <p className="sheetnote" role="status">
          Keine Strafe gefunden.
        </p>
      ) : (
        <div aria-label="Strafen" className="penaltylist" role="group">
          {visible.map((penalty) => {
            const chosen = selected !== null && selected.name === penalty.name;
            return (
              <button
                aria-pressed={chosen}
                className={chosen ? "penalty sel" : "penalty"}
                disabled={posting}
                key={penalty.name}
                onClick={() => pickPenalty(penalty)}
                type="button"
              >
                <span className="penaltyname">{penalty.name}</span>
                <span className="penaltysub">{penalty.subtext}</span>
              </button>
            );
          })}
          {hidden > 0 ? (
            <button
              className="penaltymore"
              disabled={posting}
              onClick={() => setExpanded(true)}
              type="button"
            >
              Alle {matches.length} Strafen anzeigen
            </button>
          ) : null}
        </div>
      )}

      <h3 className="sheetsection">Gegen wen?</h3>
      <div aria-label="Gegen wen?" className="teampick" role="group">
        <button
          aria-pressed={team === teamName}
          className={team === teamName ? "teampickbtn sel" : "teampickbtn"}
          disabled={posting}
          onClick={() => pickTeam(teamName)}
          type="button"
        >
          {teamName}
        </button>
        <button
          aria-pressed={team === opponentName}
          className={team === opponentName ? "teampickbtn sel" : "teampickbtn"}
          disabled={posting}
          onClick={() => pickTeam(opponentName)}
          type="button"
        >
          {opponentName}
        </button>
      </div>

      <h3 className="sheetsection">Trikotnummer (optional)</h3>
      {roster === null ? (
        <p className="sheetnote" role="status">
          Kader lädt …
        </p>
      ) : options.length === 0 ? (
        <p className="sheetnote">
          Kein Kader geladen – die Strafe wird für das ganze Team gespeichert.
        </p>
      ) : (
        <div
          aria-label="Trikotnummer (optional)"
          className="jerseychips"
          role="group"
        >
          <button
            aria-pressed={jersey === null}
            className={jersey === null ? "jerseychip sel" : "jerseychip"}
            disabled={posting}
            onClick={() => setJersey(null)}
            type="button"
          >
            Ganzes Team
          </button>
          {options.map((option) => {
            const name = option.name?.trim() || null;
            return (
              <button
                aria-label={
                  name === null
                    ? `Trikot ${option.jersey}`
                    : `Trikot ${option.jersey}, ${name}`
                }
                aria-pressed={jersey === option.jersey}
                className={
                  jersey === option.jersey ? "jerseychip sel" : "jerseychip"
                }
                disabled={posting}
                key={option.jersey}
                onClick={() => setJersey(option.jersey)}
                type="button"
              >
                #{option.jersey}
              </button>
            );
          })}
        </div>
      )}

      <p className="sheetnote">
        {selected === null
          ? "Strafe auswählen."
          : `${selected.name} · gegen ${team ?? "–"}`}
      </p>
    </Sheet>
  );
}
